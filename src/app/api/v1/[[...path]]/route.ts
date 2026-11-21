// Versioned public REST API v1. API-key authenticated, tenant-scoped, with
// stable error contracts and bounded cursor pagination. The web application
// and SDKs call the same domain services as these routes.
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { resolveApiKey, hasScope } from '@/lib/api-key-auth'
import { runWithDatabaseContext } from '@/lib/db-context'
import { startAgentRun } from '@/lib/execution-engine'
import { apiError } from '@/lib/types'

const MAX_TAKE = 100

function authError(message: string, status = 401) {
  return apiError('UNAUTHENTICATED', message, status)
}

async function handle(req: NextRequest, segments: string[]) {
  const principal = await resolveApiKey(req.headers.get('authorization'))
  if (!principal) return authError('A valid API key is required')

  const resource = segments[0] ?? ''
  const id = segments[1]
  const action = segments[2]
  const url = new URL(req.url)
  const take = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 25), 1), MAX_TAKE)
  const cursor = url.searchParams.get('cursor') ?? undefined

  if (resource === 'agents' && req.method === 'GET') {
    if (!hasScope(principal, 'agents:read')) return authError('Insufficient scope', 403)
    const agents = await db.agent.findMany({
      where: { workspaceId: principal.workspaceId },
      take: take + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
    })
    const hasMore = agents.length > take
    const page = agents.slice(0, take)
    return Response.json({
      data: page.map((a) => ({ id: a.id, name: a.name, slug: a.slug, status: a.status, currentVersion: a.currentVersion })),
      pagination: { hasMore, nextCursor: hasMore ? page[page.length - 1]?.id : null },
    })
  }

  if (resource === 'executions' && req.method === 'GET') {
    if (!hasScope(principal, 'executions:read')) return authError('Insufficient scope', 403)
    const where: Record<string, unknown> = { workspaceId: principal.workspaceId }
    if (url.searchParams.get('status')) where.status = url.searchParams.get('status')
    const rows = await db.execution.findMany({
      where,
      take: take + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
    })
    const hasMore = rows.length > take
    const page = rows.slice(0, take)
    return Response.json({
      data: page.map((e) => ({ id: e.id, status: e.status, kind: e.kind, startedAt: e.startedAt.toISOString() })),
      pagination: { hasMore, nextCursor: hasMore ? page[page.length - 1]?.id : null },
    })
  }

  if (resource === 'executions' && id && action === 'cancel' && req.method === 'POST') {
    if (!hasScope(principal, 'executions:write')) return authError('Insufficient scope', 403)
    const exec = await db.execution.findFirst({ where: { id, workspaceId: principal.workspaceId } })
    if (!exec) return apiError('NOT_FOUND', 'Execution not found', 404)
    const updated = await db.execution.updateMany({
      where: { id, workspaceId: principal.workspaceId, status: { in: ['queued', 'running', 'waiting_approval'] } },
      data: { status: 'cancelled', finishedAt: new Date() },
    })
    if (updated.count !== 1) return apiError('CONFLICT', 'Execution is not cancellable', 409)
    return Response.json({ id, status: 'cancelled' })
  }

  if (resource === 'executions' && req.method === 'POST' && !id) {
    if (!hasScope(principal, 'executions:write')) return authError('Insufficient scope', 403)
    const body = (await req.json().catch(() => null)) as { agentId?: string; input?: Record<string, unknown> } | null
    if (!body?.agentId) return apiError('BAD_REQUEST', 'agentId is required', 400)
    const run = await startAgentRun({
      workspaceId: principal.workspaceId,
      agentId: body.agentId,
      input: body.input ?? {},
      trigger: 'api',
    })
    if (!run.ok) return apiError('BAD_REQUEST', run.error ?? 'run rejected', 400)
    return Response.json({ id: run.executionId, status: 'queued' }, { status: 202 })
  }

  return apiError('NOT_FOUND', 'Unknown endpoint', 404)
}

async function route(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params
  return runWithDatabaseContext({}, () => handle(req, path))
}

export { route as GET, route as POST }
