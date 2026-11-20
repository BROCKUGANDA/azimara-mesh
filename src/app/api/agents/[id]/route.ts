import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiContext, withApi, readJson, badRequest, notFound } from '@/lib/api-utils'
import { audit } from '@/lib/audit'
import { jparse } from '@/lib/types'
import { agentEvalHistory } from '@/lib/eval-runtime'
import { agentMonthSpend } from '@/lib/metering'
import { suspendAgent } from '@/lib/security-monitor'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  return withApi(async () => {
    const ctx = await apiContext(req)
    const { id } = await params
    const agent = await db.agent.findUnique({
      where: { id },
      include: {
        fleet: { select: { id: true, name: true } },
        versions: { orderBy: { createdAt: 'desc' } },
        deployments: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    })
    if (!agent || agent.workspaceId !== ctx.workspaceId) notFound('Agent not found')

    const url = new URL(req.url)
    const tab = url.searchParams.get('tab') ?? 'overview'

    const base = {
      id: agent.id, name: agent.name, slug: agent.slug, description: agent.description,
      status: agent.status, healthStatus: agent.healthStatus, autonomyLevel: agent.autonomyLevel,
      category: agent.category, framework: agent.framework, runtimeType: agent.runtimeType,
      currentVersion: agent.currentVersion, ownerName: agent.ownerName, fleet: agent.fleet,
      successRate: agent.successRate, avgLatencyMs: agent.avgLatencyMs, spendMonth: Math.round(agent.spendMonth * 100) / 100,
      lastActiveAt: agent.lastActiveAt?.toISOString() ?? null, createdAt: agent.createdAt.toISOString(),
      systemPrompt: agent.systemPrompt,
      modelConfig: jparse(agent.modelConfigJson, {}),
      toolPermissions: jparse<string[]>(agent.toolPermissionsJson, []),
      memoryConfig: jparse(agent.memoryConfigJson, {}),
      resourceLimits: jparse(agent.resourceLimitsJson, {}),
      evalProfile: jparse(agent.evalProfileJson, {}),
      inputSchema: jparse(agent.inputSchemaJson, {}),
      outputSchema: jparse(agent.outputSchemaJson, {}),
    }

    if (tab === 'overview' || tab === 'configuration') {
      const toolIds = jparse<string[]>(agent.toolPermissionsJson, [])
      const tools = toolIds.length ? await db.tool.findMany({ where: { id: { in: toolIds } } }) : []
      const cfg = jparse<{ primary?: string; fallback?: string[] }>(agent.modelConfigJson, {})
      const modelIds = [...(cfg.primary ? [cfg.primary] : []), ...(cfg.fallback ?? [])]
      const models = modelIds.length ? await db.model.findMany({ where: { id: { in: modelIds } }, include: { provider: true } }) : []
      const nsIds = jparse<{ namespaces?: string[] }>(agent.memoryConfigJson, {}).namespaces ?? []
      const namespaces = nsIds.length ? await db.memoryNamespace.findMany({ where: { id: { in: nsIds } } }) : []
      const identities = await db.serviceIdentity.findMany({ where: { agentId: agent.id } })
      const policies = await db.policy.findMany({ where: { workspaceId: ctx.workspaceId, status: 'active' }, take: 8 })
      return {
        agent: base,
        tabData: {
          tools: tools.map((t) => ({ id: t.id, name: t.name, slug: t.slug, riskClass: t.riskClass, kind: t.kind, status: t.status, requiresApproval: t.requiresApproval })),
          models: models.map((m) => ({ id: m.id, name: m.name, provider: m.provider.name, providerSlug: m.provider.slug, contextWindow: m.contextWindow, inputCostPerMtok: m.inputCostPerMtok, outputCostPerMtok: m.outputCostPerMtok, role: m.id === cfg.primary ? 'primary' : 'fallback' })),
          namespaces: namespaces.map((n) => ({ id: n.id, name: n.name, kind: n.kind, classification: n.classification, recordCount: n.recordCount })),
          identities: identities.map((i) => ({ id: i.id, name: i.name, kind: i.kind, scopes: jparse<string[]>(i.scopes, []), status: i.status, keyFingerprint: i.keyFingerprint, lastUsedAt: i.lastUsedAt?.toISOString() ?? null })),
          policies: policies.map((p) => ({ id: p.id, name: p.name, effect: p.effect, kind: p.kind })),
        },
      }
    }

    if (tab === 'versions') {
      return { agent: base, tabData: { versions: agent.versions.map((v) => ({ id: v.id, version: v.version, changelog: v.changelog, status: v.status, evalScore: v.evalScore, publishedAt: v.publishedAt?.toISOString() ?? null, diff: jparse(v.diffSummaryJson, []) })) } }
    }

    if (tab === 'deployments') {
      return { agent: base, tabData: { deployments: agent.deployments.map((d) => ({ id: d.id, environment: d.environment, strategy: d.strategy, canaryPct: d.canaryPct, status: d.status, errorRate: d.errorRate, latencyP95: d.latencyP95, evalScore: d.evalScore, createdAt: d.createdAt.toISOString(), healthGate: jparse(d.healthGate, {}) })) } }
    }

    if (tab === 'executions') {
      const executions = await db.execution.findMany({
        where: { agentId: agent.id }, orderBy: { startedAt: 'desc' }, take: 30,
        select: { id: true, status: true, trigger: true, startedAt: true, durationMs: true, costUsd: true, toolCallCount: true, tokenIn: true, tokenOut: true, error: true, isReplay: true, delegationDepth: true, parentExecutionId: true },
      })
      return { agent: base, tabData: { executions: executions.map((e) => ({ ...e, startedAt: e.startedAt.toISOString() })) } }
    }

    if (tab === 'memory') {
      const nsIds = jparse<{ namespaces?: string[] }>(agent.memoryConfigJson, {}).namespaces ?? []
      const namespaces = nsIds.length ? await db.memoryNamespace.findMany({ where: { id: { in: nsIds } }, include: { records: { orderBy: { createdAt: 'desc' }, take: 5 } } }) : []
      return { agent: base, tabData: { namespaces: namespaces.map((n) => ({ id: n.id, name: n.name, kind: n.kind, classification: n.classification, recordCount: n.recordCount, indexStatus: n.indexStatus, recent: n.records.map((r) => ({ id: r.id, content: r.content.slice(0, 160), provenance: r.provenance, createdAt: r.createdAt.toISOString() })) })) } }
    }

    if (tab === 'tools') {
      const agentExecIds = await db.execution.findMany({ where: { agentId: agent.id }, select: { id: true } })
      const calls = await db.toolCall.findMany({
        where: { executionId: { in: agentExecIds.map((e) => e.id) } }, orderBy: { createdAt: 'desc' }, take: 25,
      })
      return { agent: base, tabData: { recentCalls: calls.map((c) => ({ id: c.id, toolName: c.toolName, status: c.status, latencyMs: c.latencyMs, error: c.error, createdAt: c.createdAt.toISOString() })) } }
    }

    if (tab === 'evaluations') {
      const history = await agentEvalHistory(ctx.workspaceId, agent.id)
      return { agent: base, tabData: { history, profile: jparse(agent.evalProfileJson, {}) } }
    }

    if (tab === 'costs') {
      const spend = await agentMonthSpend(ctx.workspaceId, agent.id)
      const byDay = await db.usageEvent.findMany({
        where: { agentId: agent.id, recordedAt: { gte: new Date(Date.now() - 30 * 86400_000) } },
        select: { costUsd: true, recordedAt: true },
      })
      const dayMap = new Map<string, number>()
      for (const u of byDay) {
        const d = u.recordedAt.toISOString().slice(0, 10)
        dayMap.set(d, (dayMap.get(d) ?? 0) + u.costUsd)
      }
      return {
        agent: base,
        tabData: {
          monthSpend: Math.round(spend * 100) / 100,
          budget: jparse<{ monthlyBudget?: number }>(agent.resourceLimitsJson, {}).monthlyBudget ?? 50,
          daily: [...dayMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, cost]) => ({ day, cost: Math.round(cost * 100) / 100 })),
        },
      }
    }

    if (tab === 'policies') {
      const decisions = await db.policyDecision.findMany({
        where: { subject: agent.id }, orderBy: { createdAt: 'desc' }, take: 20,
      })
      return { agent: base, tabData: { decisions: decisions.map((d) => ({ id: d.id, action: d.action, decision: d.decision, reason: d.reason, policyName: d.policyName, resource: d.resource, createdAt: d.createdAt.toISOString() })) } }
    }

    if (tab === 'audit') {
      const events = await db.auditEvent.findMany({
        where: { workspaceId: ctx.workspaceId, OR: [{ resourceId: agent.id }, { actorId: agent.id }] },
        orderBy: { createdAt: 'desc' }, take: 30,
      })
      return { agent: base, tabData: { events: events.map((e) => ({ id: e.id, action: e.action, actorName: e.actorName, actorType: e.actorType, severity: e.severity, detail: jparse(e.detailJson, {}), createdAt: e.createdAt.toISOString() })) } }
    }

    // default overview metrics
    const [execCount, failCount, running, spend] = await Promise.all([
      db.execution.count({ where: { agentId: agent.id } }),
      db.execution.count({ where: { agentId: agent.id, status: 'failed' } }),
      db.execution.count({ where: { agentId: agent.id, status: { in: ['running', 'queued'] } } }),
      agentMonthSpend(ctx.workspaceId, agent.id),
    ])
    const recentExecs = await db.execution.findMany({
      where: { agentId: agent.id }, orderBy: { startedAt: 'desc' }, take: 14,
      select: { status: true, startedAt: true, durationMs: true, costUsd: true },
    })
    return {
      agent: base,
      tabData: {
        metrics: { totalExecutions: execCount, failedExecutions: failCount, running, monthSpend: Math.round(spend * 100) / 100, budget: jparse<{ monthlyBudget?: number }>(agent.resourceLimitsJson, {}).monthlyBudget ?? 50 },
        recentTimeline: recentExecs.map((e) => ({ status: e.status, startedAt: e.startedAt.toISOString(), durationMs: e.durationMs, costUsd: e.costUsd })),
      },
    }
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  return withApi(async () => {
    const ctx = await apiContext(req, 'operator')
    const { id } = await params
    const agent = await db.agent.findUnique({ where: { id } })
    if (!agent || agent.workspaceId !== ctx.workspaceId) notFound('Agent not found')
    const body = await readJson<Record<string, unknown>>(req)

    const data: Record<string, unknown> = {}
    if ('description' in body) data.description = String(body.description ?? '')
    if ('systemPrompt' in body) data.systemPrompt = String(body.systemPrompt ?? '')
    if ('autonomyLevel' in body) {
      const v = String(body.autonomyLevel)
      if (!['A0', 'A1', 'A2', 'A3'].includes(v)) badRequest('autonomyLevel must be A0..A3')
      if (v === 'A3' && ctx.role === 'operator') badRequest('A3 autonomy requires admin role')
      data.autonomyLevel = v
    }
    if ('toolPermissions' in body) data.toolPermissionsJson = JSON.stringify(body.toolPermissions ?? [])
    if ('memoryNamespaces' in body) data.memoryConfigJson = JSON.stringify({ ...(jparse(agent.memoryConfigJson, {}) as object), namespaces: body.memoryNamespaces ?? [] })
    if ('modelConfig' in body) data.modelConfigJson = JSON.stringify(body.modelConfig ?? {})
    if ('resourceLimits' in body) data.resourceLimitsJson = JSON.stringify(body.resourceLimits ?? {})
    if (Object.keys(data).length === 0) badRequest('No updatable fields provided')

    const updated = await db.agent.update({ where: { id }, data })
    await audit({
      organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName,
      action: 'agent.update', resourceType: 'agent', resourceId: id, severity: 'notice',
      detail: { fields: Object.keys(data) },
    })
    return { agent: { id: updated.id, name: updated.name, status: updated.status } }
  })
}

export async function POST(req: NextRequest, { params }: Params) {
  return withApi(async () => {
    const ctx = await apiContext(req, 'operator')
    const { id } = await params
    const agent = await db.agent.findUnique({ where: { id } })
    if (!agent || agent.workspaceId !== ctx.workspaceId) notFound('Agent not found')
    const body = await readJson<{ action?: string; notes?: string; version?: string }>(req)
    const action = body.action ?? ''
    const adminOnly = ['publish', 'rollback', 'retire']
    if (adminOnly.includes(action) && ctx.role === 'operator') badRequest(`${action} requires admin role`)

    if (action === 'publish') {
      const versions = await db.agentVersion.findMany({ where: { agentId: id } })
      const latest = versions.map((v) => v.version).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0] ?? '0.1.0'
      const nextVersion = body.version ?? bumpVersion(latest)
      await db.agentVersion.create({
        data: {
          agentId: id, version: nextVersion, changelog: body.notes ?? 'Published from Agent Studio',
          snapshotJson: JSON.stringify({ systemPrompt: agent.systemPrompt, tools: jparse(agent.toolPermissionsJson, []), autonomy: agent.autonomyLevel, model: jparse(agent.modelConfigJson, {}), limits: jparse(agent.resourceLimitsJson, {}) }),
          diffSummaryJson: JSON.stringify([{ field: 'published', from: agent.status, to: 'ready' }]),
          evalScore: null, status: 'published', publishedAt: new Date(), createdBy: ctx.userId,
        },
      })
      const updated = await db.agent.update({ where: { id }, data: { status: 'ready', currentVersion: nextVersion } })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'agent.publish', resourceType: 'agent', resourceId: id, severity: 'notice', detail: { version: nextVersion } })
      return { agent: { id: updated.id, status: updated.status, version: nextVersion } }
    }
    if (action === 'rollback') {
      const versions = await db.agentVersion.findMany({ where: { agentId: id, status: { in: ['published', 'retired'] } }, orderBy: { createdAt: 'desc' } })
      const target = versions.find((v) => v.version !== agent.currentVersion)
      if (!target) badRequest('No previous version to roll back to')
      await db.agentVersion.update({ where: { id: target.id }, data: { status: 'published' } })
      const updated = await db.agent.update({ where: { id }, data: { currentVersion: target.version, status: 'rolling_back' } })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'agent.rollback', resourceType: 'agent', resourceId: id, severity: 'notice', detail: { toVersion: target.version } })
      return { agent: { id: updated.id, status: updated.status, version: target.version } }
    }
    if (action === 'suspend') {
      await suspendAgent(id, body.notes ?? 'Suspended from agent detail page', ctx.userName)
      return { agent: { id, status: 'paused' } }
    }
    const transitions: Record<string, { from: string[]; to: string }> = {
      validate: { from: ['draft'], to: 'validating' },
      test: { from: ['validating', 'draft'], to: 'testing' },
      ready: { from: ['testing', 'ready'], to: 'ready' },
      pause: { from: ['healthy', 'degraded', 'ready', 'scaling'], to: 'paused' },
      resume: { from: ['paused'], to: 'healthy' },
      retire: { from: ['healthy', 'degraded', 'paused', 'ready', 'failed'], to: 'retiring' },
      archive: { from: ['retiring', 'archived'], to: 'archived' },
    }
    const t = transitions[action]
    if (!t) badRequest(`Unknown action: ${action}`)
    if (!t.from.includes(agent.status)) badRequest(`Invalid transition: ${agent.status} → ${action}`)
    const updated = await db.agent.update({ where: { id }, data: { status: t.to } })
    await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: `agent.${action}`, resourceType: 'agent', resourceId: id, severity: 'notice', detail: { from: agent.status, to: t.to } })
    return { agent: { id: updated.id, status: updated.status } }
  })
}

function bumpVersion(version: string): string {
  const [maj, min, pat] = version.split('.').map(Number)
  return `${maj}.${min}.${pat + 1}`
}
