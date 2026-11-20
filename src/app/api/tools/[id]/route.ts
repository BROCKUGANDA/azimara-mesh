import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiContext, withApi, readJson, badRequest, notFound } from '@/lib/api-utils'
import { audit } from '@/lib/audit'
import { executeToolCall, redactToolCall } from '@/lib/tool-runtime'
import { enforcePolicy } from '@/lib/policy-engine'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  return withApi(async () => {
    const ctx = await apiContext(req)
    const { id } = await params
    const tool = await db.tool.findUnique({ where: { id } })
    if (!tool || tool.workspaceId !== ctx.workspaceId) notFound('Tool not found')
    const recentCalls = await db.toolCall.findMany({ where: { toolId: id }, orderBy: { createdAt: 'desc' }, take: 20 })
    const agents = await db.agent.findMany({ where: { workspaceId: ctx.workspaceId, toolPermissionsJson: { contains: id } }, select: { id: true, name: true, status: true } })
    return {
      tool: {
        id: tool.id, name: tool.name, slug: tool.slug, kind: tool.kind, version: tool.version,
        description: tool.description, provider: tool.provider, authMethod: tool.authMethod,
        hasSecret: !!tool.secretRef, riskClass: tool.riskClass, dataClass: tool.dataClass,
        rateLimitPerMin: tool.rateLimitPerMin, timeoutMs: tool.timeoutMs,
        requiresApproval: tool.requiresApproval, status: tool.status, ownerName: tool.ownerName,
        callCount: tool.callCount, errorCount: tool.errorCount,
        errorRate: tool.callCount > 0 ? Math.round((tool.errorCount / tool.callCount) * 1000) / 1000 : 0,
        inputSchema: JSON.parse(tool.inputSchemaJson), outputSchema: JSON.parse(tool.outputSchemaJson),
      },
      recentCalls: recentCalls.map((c) => ({
        id: c.id, status: c.status, latencyMs: c.latencyMs, error: c.error,
        createdAt: c.createdAt.toISOString(), ...redactToolCall(c),
      })),
      grantedAgents: agents,
    }
  })
}

export async function POST(req: NextRequest, { params }: Params) {
  return withApi(async () => {
    const ctx = await apiContext(req, 'operator')
    const { id } = await params
    const tool = await db.tool.findUnique({ where: { id } })
    if (!tool || tool.workspaceId !== ctx.workspaceId) notFound('Tool not found')
    const body = await readJson<{ action?: string; input?: Record<string, unknown>; status?: string }>(req)

    if (body.action === 'test') {
      // secure connection testing: policy check + sandboxed adapter execution
      const verdict = await enforcePolicy(ctx.workspaceId, {
        subject: `user:${ctx.userId}`, action: 'tool_invoke', resource: tool.id,
        environment: 'staging', dataClass: tool.dataClass, autonomyLevel: 'A2',
        metadata: { toolId: tool.id, toolSlug: tool.slug, toolRiskClass: tool.riskClass, toolName: tool.name },
      })
      if (verdict.decision === 'deny') {
        return { ok: false, decision: verdict.decision, reason: verdict.reason }
      }
      const outcome = await executeToolCall(tool, body.input ?? { query: 'connection health test' }, {
        workspaceId: ctx.workspaceId, executionId: null, agentId: null, agentName: `test:${ctx.userName}`,
        autonomyLevel: 'A2', environment: 'staging', dataClass: tool.dataClass, isReplay: false,
      })
      return {
        ok: outcome.ok, status: outcome.status, simulated: outcome.simulated,
        latencyMs: outcome.latencyMs, output: outcome.output, error: outcome.error,
        validationErrors: outcome.validationErrors ?? [], decision: verdict.decision,
      }
    }

    if (body.action === 'set_status') {
      if (ctx.role === 'viewer') badRequest('requires operator role')
      const status = body.status ?? ''
      if (!['healthy', 'suspended', 'offline'].includes(status)) badRequest('status must be healthy | suspended | offline')
      await db.tool.update({ where: { id }, data: { status } })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: status === 'suspended' ? 'security.suspend_tool' : 'tool.update', resourceType: 'tool', resourceId: id, severity: status === 'suspended' ? 'critical' : 'notice', detail: { status } })
      return { tool: { id, status } }
    }

    if (body.action === 'rotate_secret') {
      await db.tool.update({ where: { id }, data: { secretRef: `vault://prod/tools/${tool.slug}?v=${Date.now()}` } })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'tool.rotate_secret', resourceType: 'tool', resourceId: id, severity: 'notice' })
      return { ok: true, note: 'New vault reference generated. Raw secrets are never exposed by the platform.' }
    }

    badRequest(`Unknown action: ${body.action}`)
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  return withApi(async () => {
    const ctx = await apiContext(req, 'operator')
    const { id } = await params
    const tool = await db.tool.findUnique({ where: { id } })
    if (!tool || tool.workspaceId !== ctx.workspaceId) notFound('Tool not found')
    const body = await readJson<Record<string, unknown>>(req)
    const data: Record<string, unknown> = {}
    if ('description' in body) data.description = String(body.description ?? '')
    if ('requiresApproval' in body) data.requiresApproval = Boolean(body.requiresApproval)
    if ('riskClass' in body) {
      const rc = String(body.riskClass)
      if (!['low', 'medium', 'high', 'critical'].includes(rc)) badRequest('invalid riskClass')
      data.riskClass = rc
    }
    if ('rateLimitPerMin' in body) data.rateLimitPerMin = Number(body.rateLimitPerMin)
    if (Object.keys(data).length === 0) badRequest('No updatable fields')
    const updated = await db.tool.update({ where: { id }, data })
    return { tool: { id: updated.id, name: updated.name } }
  })
}
