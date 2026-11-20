import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiContext, withApi } from '@/lib/api-utils'

export async function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req)
    const environments = await db.environment.findMany({ where: { organizationId: ctx.organizationId } })
    const deployCounts = await db.deployment.groupBy({ by: ['environment', 'status'], where: { workspaceId: ctx.workspaceId }, _count: { id: true } })
    return {
      environments: environments.map((e) => ({
        id: e.id, name: e.name, slug: e.slug, kind: e.kind,
        requiresApproval: e.requiresApproval, autoPromote: e.autoPromote,
        deployments: deployCounts.filter((d) => d.environment === e.slug).map((d) => ({ status: d.status, count: d._count.id })),
      })),
      hierarchy: ['Organization → Workspace → Project → Environment → Agent → Deployment → Execution'],
    }
  })
}
