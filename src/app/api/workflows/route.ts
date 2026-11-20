import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiContext, withApi, readJson, badRequest } from '@/lib/api-utils'
import { audit } from '@/lib/audit'
import { validateSpec } from '@/lib/workflow-engine'
import { jparse, type WorkflowSpec } from '@/lib/types'

export async function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req)
    const workflows = await db.workflow.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { updatedAt: 'desc' },
    })
    const runCounts = await db.execution.groupBy({
      by: ['workflowId'],
      where: { workspaceId: ctx.workspaceId, kind: 'workflow_run' },
      _count: { id: true },
    })
    const runMap = new Map(runCounts.map((r) => [r.workflowId, r._count.id]))
    const statusCounts = await db.execution.groupBy({
      by: ['workflowId', 'status'],
      where: { workspaceId: ctx.workspaceId, kind: 'workflow_run' },
      _count: { id: true },
    })
    return {
      workflows: workflows.map((w) => {
        const spec = jparse<WorkflowSpec>(w.specJson, { version: 1, nodes: [], edges: [], budgets: { maxSteps: 0, timeoutMs: 0, maxCostUsd: 0 }, maxIterationsPerNode: 3 })
        const runs = statusCounts.filter((s) => s.workflowId === w.id)
        return {
          id: w.id, name: w.name, slug: w.slug, description: w.description, version: w.version,
          status: w.status, triggerType: w.triggerType,
          nodes: spec.nodes?.length ?? 0,
          nodeTypes: spec.nodes?.map((n) => n.type) ?? [],
          totalRuns: runMap.get(w.id) ?? 0,
          succeeded: runs.find((r) => r.status === 'succeeded')?._count.id ?? 0,
          failed: runs.find((r) => r.status === 'failed')?._count.id ?? 0,
          updatedAt: w.updatedAt.toISOString(),
        }
      }),
    }
  })
}

export async function POST(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req, 'operator')
    const body = await readJson<{ name?: string; description?: string; spec?: WorkflowSpec; triggerType?: string }>(req)
    if (!body.name?.trim()) badRequest('name is required')
    const spec: WorkflowSpec = body.spec ?? {
      version: 1, maxIterationsPerNode: 3,
      budgets: { maxSteps: 20, timeoutMs: 120000, maxCostUsd: 2 },
      nodes: [{ key: 'in', type: 'input', label: 'Input', config: {}, x: 60, y: 160 }],
      edges: [],
    }
    const validation = validateSpec(spec)
    const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const exists = await db.workflow.findUnique({ where: { workspaceId_slug: { workspaceId: ctx.workspaceId, slug } } })
    if (exists) badRequest('A workflow with this name already exists')
    const wf = await db.workflow.create({
      data: {
        workspaceId: ctx.workspaceId, name: body.name.trim(), slug,
        description: body.description ?? '', version: spec.nodes.some((n) => n.type === 'output') ? 1 : 0,
        status: validation.ok ? 'draft' : 'draft',
        specJson: JSON.stringify(spec), triggerType: body.triggerType ?? 'manual', createdBy: ctx.userId,
      },
    })
    await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'workflow.create', resourceType: 'workflow', resourceId: wf.id, severity: 'info', detail: { valid: validation.ok, errors: validation.errors } })
    return { workflow: { id: wf.id, slug: wf.slug, validation } }
  })
}
