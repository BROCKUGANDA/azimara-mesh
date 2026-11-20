import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiContext, withApi } from '@/lib/api-utils'
import { jparse } from '@/lib/types'

export async function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req)
    const url = new URL(req.url)
    const action = url.searchParams.get('action') ?? ''
    const severity = url.searchParams.get('severity') ?? ''
    const take = Math.min(Number(url.searchParams.get('take') ?? 60), 200)

    const where: Record<string, unknown> = { organizationId: ctx.organizationId }
    if (action) where.action = { contains: action }
    if (severity) where.severity = severity

    const events = await db.auditEvent.findMany({ where, orderBy: { createdAt: 'desc' }, take })
    return {
      events: events.map((e) => ({
        id: e.id, workspaceId: e.workspaceId, actorType: e.actorType, actorId: e.actorId,
        actorName: e.actorName, action: e.action, resourceType: e.resourceType, resourceId: e.resourceId,
        severity: e.severity, detail: jparse(e.detailJson, {}), createdAt: e.createdAt.toISOString(),
      })),
      total: events.length,
    }
  })
}
