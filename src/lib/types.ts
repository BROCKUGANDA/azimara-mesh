// AZIMARA MESH — shared domain constants and types

export const ROLES = ['owner', 'admin', 'operator', 'viewer'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_RANK: Record<Role, number> = { owner: 4, admin: 3, operator: 2, viewer: 1 }

export const AUTONOMY_LEVELS = ['A0', 'A1', 'A2', 'A3'] as const
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number]
export const AUTONOMY_LABEL: Record<AutonomyLevel, string> = {
  A0: 'Observe',
  A1: 'Recommend',
  A2: 'Human-approved',
  A3: 'Bounded autonomous',
}

export const AGENT_STATUSES = [
  'draft', 'validating', 'testing', 'ready', 'deploying', 'healthy',
  'degraded', 'paused', 'failed', 'scaling', 'rolling_back', 'retiring', 'archived',
] as const

export const EXECUTION_STATUSES = [
  'queued', 'running', 'waiting_approval', 'succeeded', 'failed', 'cancelled', 'timed_out', 'dead_letter',
] as const

export const ENVIRONMENTS = ['development', 'staging', 'production'] as const
export type Environment = (typeof ENVIRONMENTS)[number]

export const DATA_CLASSES = ['public', 'internal', 'confidential', 'restricted'] as const
export type DataClass = (typeof DATA_CLASSES)[number]
export const DATA_CLASS_RANK: Record<DataClass, number> = { public: 0, internal: 1, confidential: 2, restricted: 3 }

export const RISK_CLASSES = ['low', 'medium', 'high', 'critical'] as const
export type RiskClass = (typeof RISK_CLASSES)[number]
export const RISK_RANK: Record<RiskClass, number> = { low: 0, medium: 1, high: 2, critical: 3 }

export const VIEW_IDS = [
  'overview', 'fleet', 'workflows', 'executions', 'schedules', 'activity',
  'studio', 'catalog', 'templates', 'models', 'tools', 'memory',
  'evals', 'policies', 'security', 'identity', 'audit',
  'deployments', 'environments', 'usage', 'team', 'integrations', 'devportal', 'billing', 'settings',
] as const
export type ViewId = (typeof VIEW_IDS)[number]

// ---------- JSON column helpers (SQLite stores JSON as text) ----------

export function jparse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}
export function jstring(value: unknown): string { return JSON.stringify(value ?? null) }

// ---------- API contracts ----------

export interface ApiError { error: { code: string; message: string; details?: unknown } }

export function apiError(code: string, message: string, status: number, details?: unknown) {
  return Response.json({ error: { code, message, ...(details ? { details } : {}) } }, { status })
}

export interface PolicyRule {
  field: string   // e.g. tool.riskClass, dataClass, costUsd, environment, autonomyLevel, provider, hourOfDay
  operator: 'eq' | 'neq' | 'in' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains'
  value: string | number | (string | number)[]
}

export interface PolicyAppliesTo {
  agents?: string[]
  tools?: string[]
  environments?: string[]
  dataClasses?: string[]
  taskClasses?: string[]
}

export interface PolicyEvaluationContext {
  subject: string          // agent id or user id
  action: string           // tool_invoke | model_route | deployment | memory_read | agent_message | workspace_op
  resource: string         // tool id / model id / namespace id / target
  environment: string
  dataClass: string
  autonomyLevel: string
  estimatedCostUsd: number
  provider?: string
  taskClass?: string
  hourOfDay?: number
  metadata?: Record<string, unknown>
}

export interface PolicyVerdict {
  decision: 'allow' | 'deny' | 'require_approval'
  reason: string
  matched: { policyId: string; policyName: string; effect: string; why: string }[]
  evaluatedCount: number
  context: PolicyEvaluationContext
}

// ---------- Workflow spec ----------

export type WorkflowNodeType =
  | 'input' | 'agent' | 'tool' | 'model' | 'memory' | 'condition'
  | 'parallel' | 'approval' | 'delay' | 'output' | 'error' | 'loop'

export interface WorkflowNode {
  key: string
  type: WorkflowNodeType
  label: string
  config: {
    agentId?: string
    toolId?: string
    modelId?: string
    namespaceId?: string
    inputTemplate?: Record<string, string>   // key -> "$.input.path" or literal
    expr?: string                             // condition: "<path> <op> <value>"
    branches?: { when: 'true' | 'false'; to: string }[]
    children?: string[]                       // parallel fan-out node keys
    iterations?: number                       // loop bound
    delaySeconds?: number
    compensation?: { toolId?: string; note?: string }
    onError?: 'continue' | 'fail' | 'compensate'
  }
  x?: number
  y?: number
}

export interface WorkflowEdge { from: string; to: string; label?: string }

export interface WorkflowSpec {
  version: 1
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  budgets: { maxSteps: number; timeoutMs: number; maxCostUsd: number }
  maxIterationsPerNode: number
}

// ---------- Execution step details ----------

export interface StepDetail {
  [k: string]: unknown
}

export interface TraceSpan {
  seq: number
  kind: string
  label: string
  nodeKey: string
  status: string
  startedAt: string
  endedAt: string | null
  durationMs: number
  detail: StepDetail
}
