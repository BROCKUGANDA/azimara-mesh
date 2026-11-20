// Deterministic policy engine (Trust Plane).
// Evaluates every consequential action against workspace policies. Deny-wins ordering,
// then require_approval, default allow when no policy matches. Full "why" evidence is returned.

import { db } from '@/lib/db'
import { jparse, type PolicyEvaluationContext, type PolicyRule, type PolicyVerdict, type PolicyAppliesTo } from '@/lib/types'

function ruleHolds(rule: PolicyRule, ctx: PolicyEvaluationContext): boolean {
  const actual = resolveField(rule.field, ctx)
  const value = rule.value
  switch (rule.operator) {
    case 'eq': return String(actual) === String(value)
    case 'neq': return String(actual) !== String(value)
    case 'in': return Array.isArray(value) && value.map(String).includes(String(actual))
    case 'gt': return Number(actual) > Number(value)
    case 'lt': return Number(actual) < Number(value)
    case 'gte': return Number(actual) >= Number(value)
    case 'lte': return Number(actual) <= Number(value)
    case 'contains': return String(actual).toLowerCase().includes(String(value).toLowerCase())
    default: return false
  }
}

function resolveField(field: string, ctx: PolicyEvaluationContext): unknown {
  const aliases: Record<string, string> = {
    'tool.riskClass': 'toolRiskClass',
    'tool.slug': 'toolSlug',
    'tool.name': 'toolName',
  }
  const flat: Record<string, unknown> = {
    'subject': ctx.subject,
    'action': ctx.action,
    'resource': ctx.resource,
    'environment': ctx.environment,
    'dataClass': ctx.dataClass,
    'autonomyLevel': ctx.autonomyLevel,
    'costUsd': ctx.estimatedCostUsd,
    'provider': ctx.provider ?? '',
    'taskClass': ctx.taskClass ?? '',
    'hourOfDay': ctx.hourOfDay ?? new Date().getUTCHours(),
    ...(ctx.metadata ?? {}),
  }
  const lookup = aliases[field] ?? field
  if (lookup in flat) return flat[lookup]
  // dotted paths into metadata, e.g. custom keys passed via metadata
  const parts = lookup.split('.')
  let cur: unknown = ctx.metadata ?? {}
  for (const p of parts) {
    if (typeof cur === 'object' && cur !== null && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p]
    } else return undefined
  }
  return cur
}

function ruleText(rule: PolicyRule): string {
  return `${rule.field} ${rule.operator} ${Array.isArray(rule.value) ? rule.value.join('|') : rule.value}`
}

export async function evaluatePolicy(
  workspaceId: string,
  ctx: PolicyEvaluationContext,
  subjectAgentId?: string,
): Promise<PolicyVerdict> {
  // resolve workspace + subject agent (to honor policyRefs and appliesTo)
  const policies = await db.policy.findMany({
    where: { workspaceId, status: 'active' },
    orderBy: { priority: 'desc' },
  })
  const agent = subjectAgentId
    ? await db.agent.findUnique({ where: { id: subjectAgentId } })
    : null

  const matched: PolicyVerdict['matched'] = []
  let decision: PolicyVerdict['decision'] = 'allow'
  let reason = 'No policy matched — default allow within workspace scope'

  for (const policy of policies) {
    const appliesTo = jparse<PolicyAppliesTo>(policy.appliesToJson, {})
    // scope filters: an empty list means "applies to all"
    if (appliesTo.agents?.length && agent && !appliesTo.agents.includes(agent.id)) continue
    if (appliesTo.tools?.length && ctx.metadata?.toolId && !appliesTo.tools.includes(String(ctx.metadata.toolId))) continue
    if (appliesTo.environments?.length && !appliesTo.environments.includes(ctx.environment)) continue
    if (appliesTo.dataClasses?.length && !appliesTo.dataClasses.includes(ctx.dataClass)) continue
    if (appliesTo.taskClasses?.length && ctx.taskClass && !appliesTo.taskClasses.includes(ctx.taskClass)) continue

    const rules = jparse<PolicyRule[]>(policy.rulesJson, [])
    if (rules.length === 0) continue
    const allHold = rules.every((r) => ruleHolds(r, ctx))
    if (!allHold) continue

    matched.push({ policyId: policy.id, policyName: policy.name, effect: policy.effect, why: rules.map(ruleText).join(' AND ') })

    if (policy.effect === 'deny') {
      decision = 'deny'
      reason = `Denied by policy "${policy.name}": ${rules.map(ruleText).join(' AND ')}`
      break // deny wins immediately
    }
    if (policy.effect === 'require_approval' && (decision as string) !== 'deny') {
      decision = 'require_approval'
      reason = `Approval required by policy "${policy.name}": ${rules.map(ruleText).join(' AND ')}`
    }
    if (policy.effect === 'allow' && decision === 'allow') {
      reason = `Allowed by policy "${policy.name}": ${rules.map(ruleText).join(' AND ')}`
    }
  }

  return { decision, reason, matched, evaluatedCount: policies.length, context: ctx }
}

export async function recordDecision(
  workspaceId: string,
  verdict: PolicyVerdict,
  extra: { executionId?: string | null; policyId?: string | null; subject: string; action: string; resource: string },
): Promise<string> {
  const row = await db.policyDecision.create({
    data: {
      workspaceId,
      executionId: extra.executionId ?? null,
      policyId: verdict.matched[0]?.policyId ?? null,
      policyName: verdict.matched[0]?.policyName ?? 'default-allow',
      subject: extra.subject,
      action: extra.action,
      resource: extra.resource,
      decision: verdict.decision,
      reason: verdict.reason,
      contextJson: JSON.stringify({ ...verdict.context, matched: verdict.matched, evaluatedCount: verdict.evaluatedCount }),
    },
  })
  return row.id
}

// Helper used by engine callers: convenience wrapper that builds context and records.
export async function enforcePolicy(
  workspaceId: string,
  input: {
    subjectAgentId?: string
    subject: string
    action: string
    resource: string
    environment: string
    dataClass: string
    autonomyLevel: string
    estimatedCostUsd?: number
    provider?: string
    taskClass?: string
    metadata?: Record<string, unknown>
    executionId?: string | null
  },
): Promise<PolicyVerdict & { decisionId: string }> {
  const verdict = await evaluatePolicy(
    workspaceId,
    {
      subject: input.subject,
      action: input.action,
      resource: input.resource,
      environment: input.environment,
      dataClass: input.dataClass,
      autonomyLevel: input.autonomyLevel,
      estimatedCostUsd: input.estimatedCostUsd ?? 0,
      provider: input.provider,
      taskClass: input.taskClass,
      metadata: input.metadata,
    },
    input.subjectAgentId,
  )
  const decisionId = await recordDecision(workspaceId, verdict, {
    executionId: input.executionId ?? null,
    policyId: verdict.matched[0]?.policyId ?? null,
    subject: input.subject,
    action: input.action,
    resource: input.resource,
  })
  return { ...verdict, decisionId }
}
