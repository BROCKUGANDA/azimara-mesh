import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiContext, withApi, readJson, badRequest, notFound } from '@/lib/api-utils'
import { audit } from '@/lib/audit'
import { jparse, type WorkflowSpec } from '@/lib/types'
import { validateSpec, startWorkflowRun } from '@/lib/workflow-engine'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  return withApi(async () => {
    const ctx = await apiContext(req)
    const { id } = await params
    const wf = await db.workflow.findUnique({ where: { id } })
    if (!wf || wf.workspaceId !== ctx.workspaceId) notFound('Workflow not found')
    const spec = jparse<WorkflowSpec>(wf.specJson, null as unknown as WorkflowSpec)
    const runs = await db.execution.findMany({
      where: { workflowId: wf.id }, orderBy: { startedAt: 'desc' }, take: 15,
      select: { id: true, status: true, startedAt: true, durationMs: true, costUsd: true, toolCallCount: true, error: true, trigger: true },
    })
    return {
      workflow: {
        id: wf.id, name: wf.name, slug: wf.slug, description: wf.description, version: wf.version,
        status: wf.status, triggerType: wf.triggerType, spec, updatedAt: wf.updatedAt.toISOString(),
        validation: spec ? validateSpec(spec) : { ok: false, errors: ['missing spec'] },
      },
      runs: runs.map((r) => ({ ...r, startedAt: r.startedAt.toISOString() })),
    }
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  return withApi(async () => {
    const ctx = await apiContext(req, 'operator')
    const { id } = await params
    const wf = await db.workflow.findUnique({ where: { id } })
    if (!wf || wf.workspaceId !== ctx.workspaceId) notFound('Workflow not found')
    const body = await readJson<{ name?: string; description?: string; spec?: WorkflowSpec; triggerType?: string }>(req)
    const data: Record<string, unknown> = {}
    if (body.name) data.name = body.name.trim()
    if (body.description !== undefined) data.description = body.description
    if (body.triggerType) data.triggerType = body.triggerType
    if (body.spec) {
      const validation = validateSpec(body.spec)
      if (!validation.ok) return { ok: false, validation, saved: false }
      data.specJson = JSON.stringify(body.spec)
    }
    const updated = await db.workflow.update({ where: { id }, data: { ...data, updatedAt: new Date() } })
    await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'workflow.update', resourceType: 'workflow', resourceId: id, severity: 'notice', detail: { fields: Object.keys(data) } })
    return { ok: true, workflow: { id: updated.id, version: updated.version } }
  })
}

export async function POST(req: NextRequest, { params }: Params) {
  return withApi(async () => {
    const ctx = await apiContext(req, 'operator')
    const { id } = await params
    const wf = await db.workflow.findUnique({ where: { id } })
    if (!wf || wf.workspaceId !== ctx.workspaceId) notFound('Workflow not found')
    const body = await readJson<{ action?: string; input?: Record<string, unknown> }>(req)

    if (body.action === 'publish') {
      const spec = jparse<WorkflowSpec>(wf.specJson, null as unknown as WorkflowSpec)
      if (!spec) badRequest('Cannot publish: spec missing')
      const validation = validateSpec(spec)
      if (!validation.ok) badRequest(`Cannot publish: ${validation.errors.join('; ')}`)
      const updated = await db.workflow.update({ where: { id }, data: { status: 'published', version: wf.version + 1 } })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'workflow.publish', resourceType: 'workflow', resourceId: id, severity: 'notice', detail: { version: updated.version } })
      return { workflow: { id: updated.id, version: updated.version, status: updated.status } }
    }

    if (body.action === 'archive') {
      if (ctx.role === 'operator') badRequest('archive requires admin role')
      const updated = await db.workflow.update({ where: { id }, data: { status: 'archived' } })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'workflow.archive', resourceType: 'workflow', resourceId: id, severity: 'notice' })
      return { workflow: { id: updated.id, status: updated.status } }
    }

    if (body.action === 'run') {
      const result = await startWorkflowRun({
        workspaceId: ctx.workspaceId, workflowId: id, input: body.input ?? {},
        trigger: 'manual', userId: ctx.userId, userName: ctx.userName,
      })
      if (!result.ok) badRequest(result.error ?? 'workflow run rejected')
      return { executionId: result.executionId }
    }

    badRequest(`Unknown action: ${body.action}`)
  })
}
