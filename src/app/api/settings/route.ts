import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiContext, withApi, readJson, badRequest } from '@/lib/api-utils'

export async function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req)
    const workspace = await db.workspace.findUnique({ where: { id: ctx.workspaceId }, include: { organization: true } })
    const agentCount = await db.agent.count({ where: { workspaceId: ctx.workspaceId, status: { not: 'archived' } } })
    return {
      workspace: workspace ? {
        id: workspace.id, name: workspace.name, slug: workspace.slug, description: workspace.description,
        monthlyBudget: workspace.monthlyBudget, dataClassification: workspace.dataClassification,
      } : null,
      organization: workspace?.organization ? { name: workspace.organization.name, planTier: workspace.organization.planTier, dataResidency: workspace.organization.dataResidency } : null,
      agentCount,
      role: ctx.role,
      runtime: {
        engine: 'in-process demo runtime (single-node)',
        durableState: 'SQLite checkpoints (single-node durability)',
        isolation: 'sandboxed deterministic adapters; external egress disabled',
        telemetry: 'OpenTelemetry-compatible trace model in-platform',
      },
    }
  })
}

export async function PATCH(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req, 'admin')
    const body = await readJson<{ monthlyBudget?: number; dataClassification?: string; description?: string }>(req)
    const data: Record<string, unknown> = {}
    if (body.monthlyBudget !== undefined) {
      if (body.monthlyBudget < 0) badRequest('monthlyBudget must be >= 0')
      data.monthlyBudget = body.monthlyBudget
    }
    if (body.dataClassification) {
      if (!['public', 'internal', 'confidential', 'restricted'].includes(body.dataClassification)) badRequest('invalid dataClassification')
      data.dataClassification = body.dataClassification
    }
    if (body.description !== undefined) data.description = body.description
    const updated = await db.workspace.update({ where: { id: ctx.workspaceId }, data })
    return { workspace: { id: updated.id, monthlyBudget: updated.monthlyBudget, dataClassification: updated.dataClassification } }
  })
}
