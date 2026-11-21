// Temporal workflows. Deterministic: no DB/network access here; all effects
// go through activities. workflowId = executionId makes start idempotent.
import { proxyActivities, defineSignal, setHandler, sleep } from '@temporalio/workflow'
import type { AgentRunInput, AgentRunResult, RunProgress } from './shared'

const activities = proxyActivities<{
  runAgentExecution(input: AgentRunInput): Promise<AgentRunResult>
  cancelExecution(executionId: string): Promise<void>
}>({
  startToCloseTimeout: '10m',
  heartbeatTimeout: '60s',
  retry: {
    maximumAttempts: 3,
    initialInterval: '1s',
    backoffCoefficient: 2,
    maximumInterval: '30s',
  },
})

export const cancelRunSignal = defineSignal<[string]>('cancelRun')

/**
 * Agent run workflow. Cancellation is cooperative: the signal first marks the
 * execution cancelled in durable state and then cancels the activity, which
 * re-checks cancellation between steps via its heartbeat loop.
 */
export async function agentRunWorkflow(input: AgentRunInput): Promise<AgentRunResult> {
  let cancelReason = ''
  setHandler(cancelRunSignal, async (reason: string) => {
    cancelReason = reason
    // Durable cancellation first, then the runner's in-step checks and the
    // activity heartbeat deliver cooperative cancellation.
    await activities.cancelExecution(input.executionId)
  })

  try {
    const result = await activities.runAgentExecution(input)
    return result
  } catch (err) {
    // A cancellation signal may be delivered slightly before the activity
    // cancellation error; reflect the durable state rather than raw failure.
    if (cancelReason) return { status: 'cancelled', error: cancelReason }
    throw err
  }
}

/** Bounded delay workflow used by scheduler nodes, with durable timers. */
export async function durableDelayWorkflow(seconds: number): Promise<{ waited: number }> {
  const bounded = Math.max(0, Math.min(seconds, 300))
  await sleep(bounded * 1000)
  return { waited: bounded }
}
