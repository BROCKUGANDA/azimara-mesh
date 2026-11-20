import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiContext, withApi, readJson, badRequest } from '@/lib/api-utils'
import { audit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req)
    const tools = await db.tool.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { name: 'asc' } })
    const wsExecIds = await db.execution.findMany({ where: { workspaceId: ctx.workspaceId }, select: { id: true } })
    const usage = await db.toolCall.findMany({
      where: { executionId: { in: wsExecIds.map((e) => e.id) } },
      select: { toolId: true, status: true, latencyMs: true },
      take: 500,
    })
    const stats = new Map<string, { calls: number; errors: number; totalLatency: number }>()
    for (const c of usage) {
      const s = stats.get(c.toolId) ?? { calls: 0, errors: 0, totalLatency: 0 }
      s.calls += 1
      if (c.status !== 'succeeded') s.errors += 1
      s.totalLatency += c.latencyMs
      stats.set(c.toolId, s)
    }
    return {
      tools: tools.map((t) => {
        const s = stats.get(t.id) ?? { calls: 0, errors: 0, totalLatency: 0 }
        return {
          id: t.id, name: t.name, slug: t.slug, kind: t.kind, version: t.version, description: t.description,
          provider: t.provider, authMethod: t.authMethod, hasSecret: !!t.secretRef,
          riskClass: t.riskClass, dataClass: t.dataClass, rateLimitPerMin: t.rateLimitPerMin,
          timeoutMs: t.timeoutMs, requiresApproval: t.requiresApproval, status: t.status,
          ownerName: t.ownerName, callCount: t.callCount, errorCount: t.errorCount,
          errorRate: t.callCount > 0 ? Math.round((t.errorCount / t.callCount) * 1000) / 1000 : 0,
          recentCalls: s.calls, recentErrors: s.errors,
          avgLatencyMs: s.calls > 0 ? Math.round(s.totalLatency / s.calls) : 0,
          inputSchema: JSON.parse(t.inputSchemaJson), outputSchema: JSON.parse(t.outputSchemaJson),
        }
      }),
    }
  })
}

export async function POST(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req, 'operator')
    const body = await readJson<{
      name?: string; kind?: string; description?: string; riskClass?: string; dataClass?: string;
      authMethod?: string; requiresApproval?: boolean; timeoutMs?: number; rateLimitPerMin?: number;
    }>(req)
    if (!body.name?.trim()) badRequest('name is required')
    const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const exists = await db.tool.findUnique({ where: { workspaceId_slug: { workspaceId: ctx.workspaceId, slug } } })
    if (exists) badRequest('A tool with this name already exists')
    const tool = await db.tool.create({
      data: {
        workspaceId: ctx.workspaceId, name: body.name.trim(), slug,
        kind: body.kind ?? 'http', version: '1.0.0', description: body.description ?? '',
        provider: 'custom', inputSchemaJson: JSON.stringify({ type: 'object', properties: { query: { type: 'string', maxLength: 200 } } }),
        outputSchemaJson: JSON.stringify({ type: 'object' }),
        authMethod: body.authMethod ?? 'api_key', secretRef: body.authMethod === 'none' ? null : `vault://pending/tools/${slug}`,
        riskClass: body.riskClass ?? 'medium', dataClass: body.dataClass ?? 'internal',
        rateLimitPerMin: body.rateLimitPerMin ?? 60, timeoutMs: body.timeoutMs ?? 8000,
        requiresApproval: body.requiresApproval ?? (body.riskClass === 'critical' || body.riskClass === 'high'),
        status: 'healthy', ownerName: ctx.userName,
      },
    })
    await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'tool.create', resourceType: 'tool', resourceId: tool.id, severity: 'info', detail: { name: tool.name, riskClass: tool.riskClass } })
    return { tool: { id: tool.id, slug: tool.slug, name: tool.name } }
  })
}
