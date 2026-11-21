// Shared types for the Temporal execution adapter.
// The workflowId is the execution id, which makes workflow start idempotent.

export const AGENT_RUN_TASK_QUEUE = 'azimara-mesh-agent-runs'

export interface AgentRunInput {
  executionId: string
  agentId: string
  workspaceId: string
  userId?: string
  input: Record<string, unknown>
}

export interface AgentRunResult {
  status: 'succeeded' | 'failed' | 'cancelled'
  outputJson?: string
  error?: string
}

export interface RunProgress {
  step: string
  seq: number
  updatedAt: string
}
