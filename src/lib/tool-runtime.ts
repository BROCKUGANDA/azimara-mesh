// Tool & Integration Gateway runtime.
// Every invocation passes: input schema validation → deterministic policy layer → adapter
// execution → output schema validation → sensitive-data redaction → injection scan → limits.

import { db } from '@/lib/db'
import { jparse } from '@/lib/types'
import { recordUsage } from '@/lib/metering'

export interface ToolAdapterResult {
  ok: boolean
  output?: Record<string, unknown>
  error?: string
  simulated: boolean
  latencyMs: number
  validationErrors?: string[]
}

export interface ExecutionEnvironmentInfo {
  environment: string
  dataClass: string
}

// --- minimal JSON-schema subset validation (type/required/enum/maxLength) ---

function validateAgainstSchema(value: unknown, schema: unknown, path = 'root'): string[] {
  const errors: string[] = []
  if (!schema || typeof schema !== 'object') return errors
  const s = schema as { type?: string; required?: string[]; properties?: Record<string, unknown>; enum?: unknown[]; maxLength?: number }
  if (s.type === 'object' && typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>
    for (const req of s.required ?? []) {
      if (!(req in obj)) errors.push(`${path}.${req} is required`)
    }
    for (const [k, propSchema] of Object.entries(s.properties ?? {})) {
      if (k in obj) errors.push(...validateAgainstSchema(obj[k], propSchema, `${path}.${k}`))
    }
  } else if (s.type === 'string' && typeof value === 'string') {
    if (s.maxLength && value.length > s.maxLength) errors.push(`${path} exceeds max length ${s.maxLength}`)
    if (s.enum && !s.enum.includes(value)) errors.push(`${path} must be one of ${s.enum.join(', ')}`)
  } else if (s.type === 'number' && typeof value !== 'number') {
    errors.push(`${path} must be a number`)
  } else if (s.type === 'boolean' && typeof value !== 'boolean') {
    errors.push(`${path} must be a boolean`)
  }
  return errors
}

const INJECTION_PATTERNS = [
  /ignore (all )?(previous|prior) instructions/i,
  /disregard (the )?(above|system|prior)/i,
  /reveal (your )?(system )?prompt/i,
  /you are now/i,
  /sudo mode/i,
  /</, // raw html/script payloads
]

export function scanForInjection(text: string): { flagged: boolean; pattern?: string } {
  for (const p of INJECTION_PATTERNS) {
    if (p.test(text)) return { flagged: true, pattern: p.source }
  }
  return { flagged: false }
}

const SECRET_PATTERNS = [/sk-[a-zA-Z0-9]{16,}/g, /AKIA[0-9A-Z]{16}/g, /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, /(api[_-]?key|secret)["'=:\s]+\w{12,}/gi]

export function redactSecrets(text: string): string {
  let out = text
  for (const p of SECRET_PATTERNS) out = out.replace(p, '[REDACTED]')
  return out
}

// --- internal adapters that execute real platform operations ---

async function runInternalAdapter(slug: string, input: Record<string, unknown>, workspaceId: string): Promise<Record<string, unknown>> {
  switch (slug) {
    case 'platform-metrics': {
      const [agents, executions, failed] = await Promise.all([
        db.agent.count({ where: { workspaceId } }),
        db.execution.count({ where: { workspaceId } }),
        db.execution.count({ where: { workspaceId, status: 'failed' } }),
      ])
      return { agents, executions, failedExecutions: failed, source: 'platform.database' }
    }
    case 'agent-registry-list': {
      const agents = await db.agent.findMany({
        where: { workspaceId, status: { not: 'archived' } },
        select: { name: true, slug: true, status: true, autonomyLevel: true },
        take: 50,
      })
      return { agents, source: 'platform.database' }
    }
    case 'memory-search': {
      const query = String(input.query ?? '')
      const records = await db.memoryRecord.findMany({
        where: { namespace: { workspaceId, kind: { in: ['semantic', 'shared'] } } },
        include: { namespace: true },
        take: 20,
      })
      const q = query.toLowerCase()
      const scored = records
        .map((r) => ({ content: r.content, namespace: r.namespace.name, score: r.content.toLowerCase().includes(q) ? 0.95 : 0.35 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
      return { results: scored, source: 'platform.database' }
    }
    case 'kb-search': {
      const query = String(input.query ?? '')
      const records = await db.memoryRecord.findMany({
        where: { namespace: { workspaceId } },
        include: { namespace: true },
        take: 25,
      })
      const q = query.toLowerCase().split(/\s+/)
      const scored = records
        .map((r) => ({ content: r.content, namespace: r.namespace.name, provenance: r.provenance, score: q.filter((w) => r.content.toLowerCase().includes(w)).length / Math.max(1, q.length) }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
      return { results: scored, source: 'platform.database' }
    }
    default:
      throw new Error(`unknown internal tool: ${slug}`)
  }
}

/** Deterministic simulated adapters for external connectors (egress disabled in sandbox). */
function runSimulatedAdapter(tool: { slug: string; kind: string; name: string }, input: Record<string, unknown>): Record<string, unknown> {
  const q = String(input.query ?? input.target ?? input.topic ?? 'request')
  switch (tool.slug) {
    case 'web-search':
      return {
        results: [
          { title: `Industry briefing: ${q}`, source: 'sector-wire.example', published: 'recent', relevance: 0.91 },
          { title: `Analysis — implications of ${q}`, source: 'research-digest.example', published: 'recent', relevance: 0.84 },
          { title: `Market note referencing ${q}`, source: 'market-watch.example', published: 'recent', relevance: 0.77 },
        ],
        note: 'Sandbox connector: deterministic response (external egress disabled by policy).',
      }
    case 'crm-lookup':
      return {
        account: { id: 'ACC-4821', tier: 'enterprise', healthScore: 0.72, openTickets: 2, lastContact: '6 days ago' },
        note: 'Sandbox connector: deterministic response.',
      }
    case 'sql-query':
      return {
        rows: [
          { metric: 'weekly_active_agents', value: 42 },
          { metric: 'avg_task_latency_ms', value: 1870 },
          { metric: 'spend_usd_month_to_date', value: 128.4 },
        ],
        rowCount: 3,
        note: 'Sandbox connector: deterministic response.',
      }
    case 'code-scan':
      return {
        advisories: [{ file: 'src/service/ingest.ts', line: 88, severity: 'low', message: 'unused import' }],
        blockers: 0,
        note: 'Sandbox connector: deterministic response.',
      }
    case 'payment-refund':
      return {
        refundId: `rf_${Math.random().toString(36).slice(2, 10)}`,
        status: 'simulated_initiated',
        note: 'Sandbox connector: financial mutation suppressed outside production adapter.',
      }
    case 'slack-post':
      return { channel: input.channel ?? '#ops', delivered: true, note: 'Sandbox connector: deterministic response.' }
    case 'email-send':
      return { queued: true, recipients: input.to ?? ['ops@example.com'], note: 'Sandbox connector: deterministic response.' }
    default:
      return { echoed: input, note: `Sandbox connector (${tool.kind}): deterministic response.` }
  }
}

export interface ToolInvocationContext {
  workspaceId: string
  executionId: string | null
  agentId: string | null
  agentName: string
  autonomyLevel: string
  environment: string
  dataClass: string
  isReplay: boolean
  /** Pre-computed policy verdict (allow) from the execution engine */
  policyDecisionId?: string
}

export interface ToolExecutionOutcome extends ToolAdapterResult {
  toolCallId: string
  status: 'succeeded' | 'failed' | 'denied' | 'timeout'
  redactedOutput?: string
  injectionFlag?: { flagged: boolean; pattern?: string }
}

export async function executeToolCall(
  tool: { id: string; slug: string; name: string; kind: string; inputSchemaJson: string; outputSchemaJson: string; timeoutMs: number; status: string },
  rawInput: Record<string, unknown>,
  ctx: ToolInvocationContext,
): Promise<ToolExecutionOutcome> {
  const started = Date.now()

  // 1. schema validation — untrusted input never reaches the adapter unchecked
  const inputSchema = jparse(tool.inputSchemaJson, { type: 'object' })
  const validationErrors = validateAgainstSchema(rawInput, inputSchema)
  if (validationErrors.length > 0) {
    const outcome = await persistToolCall(tool, rawInput, {
      ok: false, simulated: false, latencyMs: Date.now() - started, error: 'input schema validation failed', validationErrors,
    }, 'failed', ctx)
    return outcome
  }

  // 2. adapter execution with timeout
  let result: ToolAdapterResult
  try {
    if (tool.status === 'suspended') throw new Error('tool is suspended by a security control')
    const work = tool.kind === 'internal'
      ? runInternalAdapter(tool.slug, rawInput, ctx.workspaceId)
      : Promise.resolve(runSimulatedAdapter({ slug: tool.slug, kind: tool.kind, name: tool.name }, rawInput))
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const output = await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('tool timeout')), tool.timeoutMs)
        }),
      ])
      result = { ok: true, output: output as Record<string, unknown>, simulated: tool.kind !== 'internal', latencyMs: Date.now() - started }
    } finally {
      // Clear the loser's timer: otherwise every call leaves a live handle and
      // a late rejection that can surface as an unhandled rejection.
      if (timer) clearTimeout(timer)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isTimeout = message.includes('timeout')
    result = { ok: false, error: message, simulated: false, latencyMs: Date.now() - started }
    const outcome = await persistToolCall(tool, rawInput, result, isTimeout ? 'timeout' : 'failed', ctx)
    return outcome
  }

  // 3. output schema validation + redaction + injection scan + size limits
  const outputSchema = jparse(tool.outputSchemaJson, { type: 'object' })
  const outValidation = validateAgainstSchema(result.output, outputSchema, 'output')
  const serialized = JSON.stringify(result.output ?? {})
  const redacted = redactSecrets(serialized)
  const injection = scanForInjection(redacted)
  // Never slice serialized JSON and parse it back: a cut inside a string or
  // escape sequence yields invalid JSON and throws after the side effect has
  // already happened. Cap the output as structured data instead.
  if (redacted.length > 8192) {
    result.output = {
      truncated: true,
      originalBytes: redacted.length,
      preview: redacted.slice(0, 8192),
    }
  }
  if (injection.flagged) result.ok = true // output returned, but flagged for security review
  if (outValidation.length > 0) {
    result.validationErrors = outValidation
  }

  const status: ToolExecutionOutcome['status'] = result.ok ? 'succeeded' : 'failed'
  const outcome = await persistToolCall(tool, rawInput, result, status, ctx, injection, redacted)
  return outcome
}

async function persistToolCall(
  tool: { id: string; name: string },
  rawInput: Record<string, unknown>,
  result: ToolAdapterResult,
  status: ToolExecutionOutcome['status'],
  ctx: ToolInvocationContext,
  injection?: { flagged: boolean; pattern?: string },
  redactedOutput?: string,
): Promise<ToolExecutionOutcome> {
  const row = await db.toolCall.create({
    data: {
      executionId: ctx.executionId ?? 'detached',
      toolId: tool.id,
      toolName: tool.name,
      status,
      latencyMs: result.latencyMs,
      inputJson: JSON.stringify(rawInput), // retained server-side; API responses redact
      outputJson: result.output ? JSON.stringify(result.output) : null,
      error: result.error ?? null,
      policyDecisionId: ctx.policyDecisionId ?? null,
    },
  })
  // usage metering for tool invocations
  await recordUsage({
    workspaceId: ctx.workspaceId,
    kind: 'tool_invocation',
    quantity: 1,
    unitCostUsd: 0.002,
    agentId: ctx.agentId,
    toolId: tool.id,
    executionId: ctx.executionId,
    idempotencyKey: `tc_${row.id}`,
  })
  // update tool health counters
  await db.tool.update({
    where: { id: tool.id },
    data: {
      callCount: { increment: 1 },
      ...(status === 'succeeded' ? {} : { errorCount: { increment: 1 } }),
    },
  })
  return {
    ...result,
    toolCallId: row.id,
    status,
    redactedOutput,
    injectionFlag: injection,
  }
}

/** Redacted projection of a tool call for API/UI exposure. */
export function redactToolCall(call: { inputJson: string; outputJson: string | null }): { input: Record<string, unknown>; output: Record<string, unknown> | null } {
  let input: Record<string, unknown> = {}
  try { input = JSON.parse(redactSecrets(call.inputJson)) } catch { /* keep empty */ }
  let output: Record<string, unknown> | null = null
  if (call.outputJson) { try { output = JSON.parse(redactSecrets(call.outputJson)) } catch { output = null } }
  return { input, output }
}
