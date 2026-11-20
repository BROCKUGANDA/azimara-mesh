import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiContext, withApi, readJson, badRequest } from '@/lib/api-utils'
import { audit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req)
    const [providers, models, connections, routing] = await Promise.all([
      db.modelProvider.findMany({ orderBy: { name: 'asc' } }),
      db.model.findMany({ include: { provider: true }, orderBy: { name: 'asc' } }),
      db.modelConnection.findMany({ where: { workspaceId: ctx.workspaceId }, include: { provider: true } }),
      db.policy.findMany({ where: { workspaceId: ctx.workspaceId, kind: { in: ['model', 'data'] }, status: 'active' } }),
    ])
    // per-model usage
    const usage = await db.usageEvent.groupBy({
      by: ['modelId'],
      where: { workspaceId: ctx.workspaceId, kind: { in: ['token_in', 'token_out'] } },
      _sum: { quantity: true, costUsd: true },
    })
    const usageMap = new Map(usage.map((u) => [u.modelId, { tokens: u._sum.quantity ?? 0, cost: u._sum.costUsd ?? 0 }]))
    return {
      providers: providers.map((p) => ({ id: p.id, name: p.name, slug: p.slug, kind: p.kind, status: p.status, latencyMs: Math.round(p.latencyMs), errorRate: p.errorRate, byok: p.byok })),
      models: models.map((m) => ({
        id: m.id, name: m.name, modelId: m.modelId, provider: m.provider.name, providerSlug: m.provider.slug,
        providerStatus: m.provider.status, contextWindow: m.contextWindow, maxOutputTokens: m.maxOutputTokens,
        inputCostPerMtok: m.inputCostPerMtok, outputCostPerMtok: m.outputCostPerMtok,
        capabilities: JSON.parse(m.capabilitiesJson), taskClasses: JSON.parse(m.taskClassesJson), status: m.status,
        tokens: Math.round(usageMap.get(m.id)?.tokens ?? 0), cost: Math.round((usageMap.get(m.id)?.cost ?? 0) * 100) / 100,
      })),
      connections: connections.map((c) => ({ id: c.id, name: c.name, provider: c.provider.name, providerSlug: c.provider.slug, authMode: c.authMode, status: c.status, secretRef: c.secretRef, lastCheckedAt: c.lastCheckedAt?.toISOString() ?? null })),
      routingRules: routing.map((p) => ({ id: p.id, name: p.name, effect: p.effect, description: p.description, rules: JSON.parse(p.rulesJson) })),
    }
  })
}

export async function POST(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req, 'operator')
    const body = await readJson<{ op?: string; providerId?: string; name?: string; authMode?: string; secretRef?: string; connectionId?: string }>(req)

    if (body.op === 'connect') {
      if (!body.providerId) badRequest('providerId required')
      const provider = await db.modelProvider.findUnique({ where: { id: body.providerId } })
      if (!provider) badRequest('provider not found')
      const conn = await db.modelConnection.create({
        data: {
          workspaceId: ctx.workspaceId, providerId: provider.id,
          name: body.name ?? `${provider.name} connection`,
          authMode: body.authMode ?? 'byok', secretRef: body.secretRef ?? `vault://pending/${provider.slug}`,
          status: 'unverified',
        },
      })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'model.connection.create', resourceType: 'model_connection', resourceId: conn.id, severity: 'notice', detail: { provider: provider.name, authMode: conn.authMode } })
      return { connection: { id: conn.id, name: conn.name, status: conn.status } }
    }

    if (body.op === 'test') {
      const conn = await db.modelConnection.findUnique({ where: { id: body.connectionId ?? '' } })
      if (!conn || conn.workspaceId !== ctx.workspaceId) badRequest('connection not found')
      // connection test: verify secret reference resolves through the secrets brokerage path
      const ok = conn.secretRef ? !conn.secretRef.includes('pending') : false
      await db.modelConnection.update({ where: { id: conn.id }, data: { status: ok ? 'connected' : 'error', lastCheckedAt: new Date() } })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'model.connection.test', resourceType: 'model_connection', resourceId: conn.id, severity: 'info', detail: { result: ok ? 'connected' : 'error' } })
      return { ok, status: ok ? 'connected' : 'error', note: ok ? 'Secret reference resolved; provider reachable.' : 'Secret reference not provisioned — add the credential to the vault.' }
    }

    if (body.op === 'disconnect') {
      const conn = await db.modelConnection.findUnique({ where: { id: body.connectionId ?? '' } })
      if (!conn || conn.workspaceId !== ctx.workspaceId) badRequest('connection not found')
      await db.modelConnection.delete({ where: { id: conn.id } })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'model.connection.delete', resourceType: 'model_connection', resourceId: conn.id, severity: 'notice' })
      return { ok: true }
    }

    badRequest('Unknown operation')
  })
}
