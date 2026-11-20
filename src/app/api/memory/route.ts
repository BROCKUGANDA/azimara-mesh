import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiContext, withApi, readJson, badRequest } from '@/lib/api-utils'
import { audit } from '@/lib/audit'
import { writeMemoryRecord, retrieveMemory, enforceRetention } from '@/lib/memory'

export async function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req)
    const url = new URL(req.url)
    const nsId = url.searchParams.get('namespaceId') ?? ''
    const namespaces = await db.memoryNamespace.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: 'asc' },
    })
    const records = nsId
      ? await db.memoryRecord.findMany({ where: { namespaceId: nsId, namespace: { workspaceId: ctx.workspaceId } }, orderBy: { createdAt: 'desc' }, take: 12 })
      : []
    const prompts = await db.promptTemplate.findMany({ where: { workspaceId: ctx.workspaceId } })
    return {
      namespaces: namespaces.map((n) => ({
        id: n.id, name: n.name, slug: n.slug, kind: n.kind, classification: n.classification,
        retentionDays: n.retentionDays, recordCount: n.recordCount, indexStatus: n.indexStatus,
        description: n.description,
        allowedRoles: JSON.parse(n.allowedRolesJson),
        records: n.id === nsId ? records.map((r) => ({ id: r.id, content: r.content, classification: r.classification, provenance: r.provenance, createdAt: r.createdAt.toISOString(), ttlAt: r.ttlAt?.toISOString() ?? null })) : [],
      })),
      prompts: prompts.map((p) => ({ id: p.id, name: p.name, slug: p.slug, body: p.body, version: p.version, variables: JSON.parse(p.variablesJson) })),
    }
  })
}

export async function POST(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req, 'operator')
    const body = await readJson<{
      op?: string
      namespaceId?: string
      name?: string
      kind?: string
      classification?: string
      retentionDays?: number
      content?: string
      ttlDays?: number
      query?: string
    }>(req)

    if (body.op === 'create_namespace') {
      if (!body.name?.trim()) badRequest('name is required')
      const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const exists = await db.memoryNamespace.findUnique({ where: { workspaceId_slug: { workspaceId: ctx.workspaceId, slug } } })
      if (exists) badRequest('Namespace with this name exists')
      const ns = await db.memoryNamespace.create({
        data: {
          workspaceId: ctx.workspaceId, name: body.name.trim(), slug,
          kind: body.kind ?? 'semantic', classification: body.classification ?? 'internal',
          retentionDays: body.retentionDays ?? 90,
          allowedRolesJson: JSON.stringify(['owner', 'admin', 'operator']),
          description: `${body.kind ?? 'semantic'} namespace`,
        },
      })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'memory.namespace.create', resourceType: 'memory_namespace', resourceId: ns.id, severity: 'info', detail: { classification: ns.classification } })
      return { namespace: { id: ns.id, name: ns.name } }
    }

    if (body.op === 'write') {
      if (!body.namespaceId || !body.content?.trim()) badRequest('namespaceId and content are required')
      const result = await writeMemoryRecord(ctx.workspaceId, body.namespaceId, {
        content: body.content.trim(), provenance: 'manual', agentId: undefined, ttlDays: body.ttlDays,
      })
      if (!result.ok) badRequest(result.error ?? 'write rejected')
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'memory.record.write', resourceType: 'memory_record', resourceId: result.id, severity: 'info', detail: { namespaceId: body.namespaceId } })
      return { ok: true, id: result.id }
    }

    if (body.op === 'retrieve') {
      if (!body.namespaceId) badRequest('namespaceId required')
      // retrieval test on behalf of an agent — enforces the agent's declared memory scope
      const agentId = new URL(req.url).searchParams.get('agentId') ?? ''
      const agent = agentId ? await db.agent.findUnique({ where: { id: agentId } }) : null
      if (!agent || agent.workspaceId !== ctx.workspaceId) badRequest('agentId required for retrieval test (authorization scope comes from the agent)')
      const result = await retrieveMemory(agent, body.namespaceId, body.query ?? '', { limit: 8 })
      if (!result.allowed) {
        return { allowed: false, reason: result.reason, records: [] }
      }
      return { allowed: true, reason: result.reason, records: result.records }
    }

    if (body.op === 'purge_expired') {
      const count = await enforceRetention(ctx.workspaceId)
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'memory.retention.enforce', resourceType: 'memory', resourceId: ctx.workspaceId, severity: 'info', detail: { deleted: count } })
      return { deleted: count }
    }

    if (body.op === 'delete_record') {
      const rec = await db.memoryRecord.findUnique({ where: { id: body.namespaceId ?? '' } })
      if (!rec) badRequest('record not found')
      const ns = await db.memoryNamespace.findUnique({ where: { id: rec.namespaceId } })
      if (!ns || ns.workspaceId !== ctx.workspaceId) badRequest('record not found')
      await db.memoryRecord.delete({ where: { id: rec.id } })
      await db.memoryNamespace.update({ where: { id: rec.namespaceId }, data: { recordCount: { decrement: 1 } } })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'memory.record.delete', resourceType: 'memory_record', resourceId: rec.id, severity: 'notice' })
      return { ok: true }
    }

    badRequest('Unknown operation')
  })
}
