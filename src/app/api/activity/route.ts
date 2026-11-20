import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiContext, withApi, readJson } from '@/lib/api-utils'
import { jparse } from '@/lib/types'

export async function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req)
    const url = new URL(req.url)
    const take = Math.min(Number(url.searchParams.get('take') ?? 40), 100)
    const [events, notifications] = await Promise.all([
      db.auditEvent.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: 'desc' }, take }),
      db.notification.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ])
    return {
      activity: events.map((e) => ({
        id: e.id, actorType: e.actorType, actorName: e.actorName, action: e.action,
        resourceType: e.resourceType, resourceId: e.resourceId, severity: e.severity,
        detail: jparse(e.detailJson, {}), createdAt: e.createdAt.toISOString(),
      })),
      notifications: notifications.map((n) => ({
        id: n.id, kind: n.kind, title: n.title, body: n.body, severity: n.severity,
        linkView: n.linkView, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString(),
      })),
    }
  })
}

export async function POST(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req)
    const body = await readJson<{ op?: string; id?: string }>(req)
    if (body.op === 'mark_read') {
      await db.notification.updateMany({ where: { workspaceId: ctx.workspaceId, id: body.id ?? undefined }, data: { readAt: new Date() } })
      return { ok: true }
    }
    if (body.op === 'mark_all_read') {
      await db.notification.updateMany({ where: { workspaceId: ctx.workspaceId, readAt: null }, data: { readAt: new Date() } })
      return { ok: true }
    }
    return { ok: false }
  })
}
