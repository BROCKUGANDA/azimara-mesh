// Metering engine — idempotent usage events, budget enforcement, aggregation and invoicing.

import { db } from '@/lib/db'
import { jparse } from '@/lib/types'
import { applyUsageToCredits } from '@/lib/billing-provider'

export type UsageKind =
  | 'agent_active' | 'execution' | 'token_in' | 'token_out'
  | 'tool_invocation' | 'memory_read' | 'storage_gb_month' | 'eval_case' | 'seats'

export interface UsageInput {
  workspaceId: string
  kind: UsageKind
  quantity?: number
  unitCostUsd?: number
  agentId?: string | null
  modelId?: string | null
  toolId?: string | null
  executionId?: string | null
  idempotencyKey: string
  recordedAt?: Date
}

/** Idempotent write: duplicate keys are ignored (at-least-once producers stay safe). */
export async function recordUsage(input: UsageInput): Promise<void> {
  const cost = (input.quantity ?? 1) * (input.unitCostUsd ?? 0)
  // An UPSERT keyed on the idempotency key is atomic: concurrent producers
  // cannot double-charge, and an unrelated unique-constraint failure is not
  // silently swallowed as a "duplicate" the way message matching did.
  await db.usageEvent.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: {
      workspaceId: input.workspaceId,
      kind: input.kind,
      quantity: input.quantity ?? 1,
      unitCostUsd: input.unitCostUsd ?? 0,
      costUsd: Math.round(cost * 1e6) / 1e6,
      agentId: input.agentId ?? null,
      modelId: input.modelId ?? null,
      toolId: input.toolId ?? null,
      executionId: input.executionId ?? null,
      idempotencyKey: input.idempotencyKey,
      recordedAt: input.recordedAt ?? new Date(),
    },
    update: {}, // already recorded — never mutate an immutable usage event
  })

  // Onchain rail: billable usage draws down prepaid USDC credits. The ledger
  // reference is derived from the same idempotency key, so a retried producer
  // cannot double-charge the credit balance.
  if (cost > 0) {
    await applyUsageToCredits(input.workspaceId, cost, `usage:${input.idempotencyKey}`)
  }
}

export function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

export async function monthSpend(workspaceId: string, now = new Date()): Promise<number> {
  const agg = await db.usageEvent.aggregate({
    where: { workspaceId, recordedAt: { gte: monthStart(now) } },
    _sum: { costUsd: true },
  })
  return agg._sum.costUsd ?? 0
}

export async function agentMonthSpend(workspaceId: string, agentId: string, now = new Date()): Promise<number> {
  const agg = await db.usageEvent.aggregate({
    where: { workspaceId, agentId, recordedAt: { gte: monthStart(now) } },
    _sum: { costUsd: true },
  })
  return agg._sum.costUsd ?? 0
}

export interface BudgetCheck { ok: boolean; spent: number; cap: number; projected: number; reason?: string }

export async function checkWorkspaceBudget(workspaceId: string, incrementalCost = 0): Promise<BudgetCheck> {
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId } })
  if (!workspace) return { ok: false, spent: 0, cap: 0, projected: 0, reason: 'workspace not found' }
  const spent = await monthSpend(workspaceId)
  const projected = spent + incrementalCost
  if (projected > workspace.monthlyBudget) {
    return {
      ok: false, spent, cap: workspace.monthlyBudget, projected,
      reason: `Workspace spend cap reached: $${spent.toFixed(2)} of $${workspace.monthlyBudget.toFixed(2)} used; projected $${projected.toFixed(2)}`,
    }
  }
  return { ok: true, spent, cap: workspace.monthlyBudget, projected }
}

export async function checkAgentBudget(workspaceId: string, agentId: string, incrementalCost = 0): Promise<BudgetCheck> {
  const agent = await db.agent.findUnique({ where: { id: agentId } })
  if (!agent) return { ok: false, spent: 0, cap: 0, projected: 0, reason: 'agent not found' }
  const limits = jparse<{ monthlyBudget?: number }>(agent.resourceLimitsJson, {})
  const cap = limits.monthlyBudget ?? 50
  const spent = await agentMonthSpend(workspaceId, agentId)
  const projected = spent + incrementalCost
  if (projected > cap) {
    return {
      ok: false, spent, cap, projected,
      reason: `Agent budget exhausted: $${spent.toFixed(2)} of $${cap.toFixed(2)} used`,
    }
  }
  return { ok: true, spent, cap, projected }
}

export interface UsageBreakdown {
  month: string
  spent: number
  cap: number
  forecast: number
  byKind: { kind: string; cost: number; quantity: number }[]
  byAgent: { agentId: string; name: string; cost: number }[]
  byModel: { modelId: string; name: string; cost: number; tokens: number }[]
  byTool: { toolId: string; name: string; cost: number; calls: number }[]
  daily: { day: string; cost: number }[]
}

export async function usageBreakdown(workspaceId: string, now = new Date()): Promise<UsageBreakdown> {
  const start = monthStart(now)
  const events = await db.usageEvent.findMany({
    where: { workspaceId, recordedAt: { gte: start } },
    orderBy: { recordedAt: 'asc' },
  })
  const agents = await db.agent.findMany({ where: { workspaceId }, select: { id: true, name: true } })
  const models = await db.model.findMany({ include: { provider: true } })
  const tools = await db.tool.findMany({ where: { workspaceId }, select: { id: true, name: true } })

  const agentName = new Map(agents.map((a) => [a.id, a.name]))
  const modelName = new Map(models.map((m) => [m.id, `${m.name} (${m.provider.name})`]))
  const toolName = new Map(tools.map((t) => [t.id, t.name]))

  const byKindMap = new Map<string, { cost: number; quantity: number }>()
  const byAgentMap = new Map<string, number>()
  const byModelMap = new Map<string, { cost: number; tokens: number }>()
  const byToolMap = new Map<string, { cost: number; calls: number }>()
  const dailyMap = new Map<string, number>()
  let spent = 0

  for (const e of events) {
    spent += e.costUsd
    const k = byKindMap.get(e.kind) ?? { cost: 0, quantity: 0 }
    k.cost += e.costUsd; k.quantity += e.quantity
    byKindMap.set(e.kind, k)
    if (e.agentId) byAgentMap.set(e.agentId, (byAgentMap.get(e.agentId) ?? 0) + e.costUsd)
    if (e.modelId) {
      const m = byModelMap.get(e.modelId) ?? { cost: 0, tokens: 0 }
      m.cost += e.costUsd
      if (e.kind === 'token_in' || e.kind === 'token_out') m.tokens += e.quantity
      byModelMap.set(e.modelId, m)
    }
    if (e.toolId) {
      const t = byToolMap.get(e.toolId) ?? { cost: 0, calls: 0 }
      t.cost += e.costUsd; t.calls += e.quantity
      byToolMap.set(e.toolId, t)
    }
    const day = e.recordedAt.toISOString().slice(0, 10)
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + e.costUsd)
  }

  const dayOfMonth = now.getUTCDate()
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate()
  const forecast = dayOfMonth > 0 ? (spent / dayOfMonth) * daysInMonth : 0

  const workspace = await db.workspace.findUnique({ where: { id: workspaceId } })

  return {
    month: start.toISOString().slice(0, 7),
    spent: round2(spent),
    cap: workspace?.monthlyBudget ?? 0,
    forecast: round2(forecast),
    byKind: [...byKindMap.entries()].map(([kind, v]) => ({ kind, cost: round2(v.cost), quantity: v.quantity })).sort((a, b) => b.cost - a.cost),
    byAgent: [...byAgentMap.entries()].map(([id, cost]) => ({ agentId: id, name: agentName.get(id) ?? 'unknown', cost: round2(cost) })).sort((a, b) => b.cost - a.cost),
    byModel: [...byModelMap.entries()].map(([id, v]) => ({ modelId: id, name: modelName.get(id) ?? 'unknown', cost: round2(v.cost), tokens: Math.round(v.tokens) })).sort((a, b) => b.cost - a.cost),
    byTool: [...byToolMap.entries()].map(([id, v]) => ({ toolId: id, name: toolName.get(id) ?? 'unknown', cost: round2(v.cost), calls: v.calls })).sort((a, b) => b.cost - a.cost),
    daily: [...dailyMap.entries()].map(([day, cost]) => ({ day, cost: round2(cost) })).sort((a, b) => a.day.localeCompare(b.day)),
  }
}

function round2(n: number): number { return Math.round(n * 100) / 100 }

/** Build an invoice from metered usage minus onchain credits already applied. */
export async function buildMonthlyInvoice(workspaceId: string, periodStart: Date, periodEnd: Date): Promise<{
  number: string; lines: { kind: string; quantity: number; cost: number }[]; subtotal: number; credits: number; total: number; settlementId?: string; onchainSignature?: string | null
} | null> {
  const events = await db.usageEvent.findMany({
    where: { workspaceId, recordedAt: { gte: periodStart, lt: periodEnd } },
  })
  if (events.length === 0) return null
  const kindMap = new Map<string, { quantity: number; cost: number }>()
  for (const e of events) {
    const k = kindMap.get(e.kind) ?? { quantity: 0, cost: 0 }
    k.quantity += e.quantity; k.cost += e.costUsd
    kindMap.set(e.kind, k)
  }
  const lines = [...kindMap.entries()].map(([kind, v]) => ({ kind, quantity: Math.round(v.quantity * 100) / 100, cost: round2(v.cost) }))
  const subtotal = round2(lines.reduce((s, l) => s + l.cost, 0))
  const settlement = await db.usageSettlement.findUnique({
    where: { workspaceId_periodStart: { workspaceId, periodStart } },
  })
  const credits = round2(settlement?.creditsAppliedUsd ?? 0)
  return {
    number: `INV-${periodStart.getUTCFullYear()}${String(periodStart.getUTCMonth() + 1).padStart(2, '0')}-${workspaceId.slice(-6).toUpperCase()}`,
    lines, subtotal, credits, total: round2(subtotal - credits),
    settlementId: settlement?.id, onchainSignature: settlement?.onchainSignature ?? null,
  }
}
