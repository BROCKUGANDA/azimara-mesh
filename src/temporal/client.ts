// Temporal client adapter. Import lazily so the default in-process deployment
// does not require a Temporal server.
import type { Client } from '@temporalio/client'
import type { AgentRunInput } from './shared'
import { AGENT_RUN_TASK_QUEUE } from './shared'

export function temporalEnabled(): boolean {
  return Boolean(process.env.TEMPORAL_ADDRESS)
}

let clientPromise: Promise<Client> | null = null

async function getClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const { Client, Connection } = await import('@temporalio/client')
      const connection = await Connection.connect({
        address: process.env.TEMPORAL_ADDRESS ?? '127.0.0.1:57233',
      })
      return new Client({ connection })
    })()
  }
  return clientPromise
}

/**
 * Start an agent run. workflowId = executionId makes start idempotent: a
 * duplicate call returns the existing workflow instead of starting twice.
 */
export async function startTemporalRun(input: AgentRunInput): Promise<{ workflowId: string }> {
  const client = await getClient()
  const { WorkflowIdConflictPolicy } = await import('@temporalio/client')
  await client.workflow.start('agentRunWorkflow', {
    args: [input],
    taskQueue: AGENT_RUN_TASK_QUEUE,
    workflowId: input.executionId,
    workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
  })
  return { workflowId: input.executionId }
}

export async function cancelTemporalRun(executionId: string, reason: string): Promise<void> {
  const client = await getClient()
  const handle = client.workflow.getHandle(executionId)
  try {
    await handle.signal('cancelRun', reason)
  } catch {
    await handle.terminate(reason)
  }
}
