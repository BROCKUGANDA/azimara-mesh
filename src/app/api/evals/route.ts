import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiContext, withApi, readJson, badRequest } from '@/lib/api-utils'
import { audit } from '@/lib/audit'
import { runEvalSuite, compareRuns } from '@/lib/eval-engine'

export async function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req)
    const url = new URL(req.url)
    const datasetId = url.searchParams.get('datasetId') ?? ''
    const datasets = await db.evalDataset.findMany({
      where: { workspaceId: ctx.workspaceId },
      include: { cases: { select: { id: true, name: true, evaluator: true, weight: true, expectedJson: true } }, runs: { orderBy: { startedAt: 'desc' }, take: 8 } },
      orderBy: { createdAt: 'asc' },
    })
    const agents = await db.agent.findMany({
      where: { workspaceId: ctx.workspaceId, status: { notIn: ['draft', 'archived'] } },
      select: { id: true, name: true, currentVersion: true, status: true },
    })
    // Never pass a client-supplied dataset id into a cross-tenant aggregate.
    const comparisons = datasetId
      ? (await db.evalDataset.findFirst({ where: { id: datasetId, workspaceId: ctx.workspaceId }, select: { id: true } }))
        ? await compareRuns(datasetId, 6)
        : []
      : []
    return {
      datasets: datasets.map((d) => ({
        id: d.id, name: d.name, slug: d.slug, description: d.description, category: d.category,
        caseCount: d.cases.length,
        cases: d.cases.map((c) => ({ id: c.id, name: c.name, evaluator: c.evaluator, weight: c.weight, expected: JSON.parse(c.expectedJson) })),
        runs: d.runs.map((r) => ({ id: r.id, label: r.label, status: r.status, passRate: r.passRate, avgScore: r.avgScore, avgLatencyMs: r.avgLatencyMs, totalCost: r.totalCost, startedAt: r.startedAt.toISOString(), agentVersion: r.agentVersion, agentId: r.agentId })),
      })),
      agents,
      comparisons,
    }
  })
}

export async function POST(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req, 'operator')
    const body = await readJson<{
      op?: string
      datasetId?: string
      agentId?: string
      label?: string
      name?: string
      description?: string
      category?: string
      caseName?: string
      prompt?: string
      contains?: string[]
      notContains?: string[]
    }>(req)

    if (body.op === 'run') {
      if (!body.datasetId || !body.agentId) badRequest('datasetId and agentId are required')
      const result = await runEvalSuite({
        workspaceId: ctx.workspaceId, datasetId: body.datasetId, agentId: body.agentId,
        label: body.label, userId: ctx.userId, userName: ctx.userName,
      })
      if (!result.ok) badRequest(result.error ?? 'eval run failed')
      return { runId: result.runId }
    }

    if (body.op === 'create_dataset') {
      if (!body.name?.trim()) badRequest('name is required')
      const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const exists = await db.evalDataset.findUnique({ where: { workspaceId_slug: { workspaceId: ctx.workspaceId, slug } } })
      if (exists) badRequest('Dataset with this name exists')
      const ds = await db.evalDataset.create({
        data: { workspaceId: ctx.workspaceId, name: body.name.trim(), slug, description: body.description ?? '', category: body.category ?? 'quality' },
      })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'evaluation.dataset.create', resourceType: 'eval_dataset', resourceId: ds.id, severity: 'info' })
      return { dataset: { id: ds.id, name: ds.name } }
    }

    if (body.op === 'add_case') {
      if (!body.datasetId || !body.caseName?.trim()) badRequest('datasetId and caseName are required')
      const dataset = await db.evalDataset.findFirst({
        where: { id: body.datasetId, workspaceId: ctx.workspaceId }, select: { id: true },
      })
      if (!dataset) badRequest('dataset not found')
      await db.evalCase.create({
        data: {
          datasetId: body.datasetId, name: body.caseName.trim(),
          inputJson: JSON.stringify({ prompt: body.prompt ?? body.caseName }),
          expectedJson: JSON.stringify({ contains: body.contains ?? [], notContains: body.notContains ?? [] }),
          evaluator: 'deterministic',
        },
      })
      return { ok: true }
    }

    badRequest('Unknown operation')
  })
}
