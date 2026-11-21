// Temporal activities: the only place effects happen. Activities run outside
// the workflow sandbox and may use Prisma, the model gateway and tool runtime.
import { CancelledFailure, heartbeat } from '@temporalio/activity'
import { db } from '../lib/db'
import { runWithDatabaseContext } from '../lib/db-context'
import { runAgentExecution } from '../lib/execution-engine'
import { releaseReservation } from '../lib/budget-reservation'
import type { AgentRunInput, AgentRunResult, RunProgress } from './shared'

function reservationKeyFrom(capsJson: string): string | undefined {
  try {
    const parsed = JSON.parse(capsJson) as { reservationKey?: string }
    return parsed.reservationKey
  } catch { return undefined }
}

/**
 * Run an agent execution with periodic heartbeats. Heartbeat details act as a
 * recoverable checkpoint: on retry, the worker can see the last recorded step.
 * Cancellation is cooperative — the engine re-checks durable state between
 * steps, and a CancelledFailure lets us release the held budget reservation.
 */
export async function runAgentExecutionActivity(input: AgentRunInput): Promise<AgentRunResult> {
  const timer = setInterval(() => {
    const progress: RunProgress = { step: 'running', seq: 0, updatedAt: new Date().toISOString() }
    heartbeat(progress)
  }, 5_000)

  try {
    await runWithDatabaseContext(
      { userId: input.userId, workspaceId: input.workspaceId },
      () => runAgentExecution(input.executionId, input.agentId, {
        workspaceId: input.workspaceId,
        agentId: input.agentId,
        input: input.input,
        userId: input.userId,
      }),
    )
    const exec = await db.execution.findUnique({
      where: { id: input.executionId },
      select: { status: true, outputJson: true, error: true, budgetCapsJson: true },
    })
    const status = exec?.status
    if (status === 'cancelled') {
      const key = reservationKeyFrom(exec?.budgetCapsJson ?? '{}')
      if (key) await releaseReservation(key)
      return { status: 'cancelled', error: exec?.error ?? 'cancelled' }
    }
    if (status === 'succeeded') return { status: 'succeeded', outputJson: exec?.outputJson ?? undefined }
    return { status: 'failed', error: exec?.error ?? `execution ended ${status ?? 'unknown'}` }
  } catch (err) {
    if (err instanceof CancelledFailure) {
      const exec = await db.execution.findUnique({
        where: { id: input.executionId },
        select: { budgetCapsJson: true },
      })
      const key = reservationKeyFrom(exec?.budgetCapsJson ?? '{}')
      if (key) await releaseReservation(key)
      return { status: 'cancelled', error: err.message }
    }
    throw err
  } finally {
    clearInterval(timer)
  }
}

/** Mark an execution cancelled in durable state (idempotent). */
export async function cancelExecutionActivity(executionId: string): Promise<void> {
  const exec = await db.execution.findUnique({
    where: { id: executionId },
    select: { status: true, budgetCapsJson: true },
  })
  if (!exec || !['queued', 'running', 'waiting_approval'].includes(exec.status)) return
  await db.execution.updateMany({
    where: { id: executionId, status: { in: ['queued', 'running', 'waiting_approval'] } },
    data: { status: 'cancelled', finishedAt: new Date() },
  })
  const key = reservationKeyFrom(exec.budgetCapsJson)
  if (key) await releaseReservation(key)
}
