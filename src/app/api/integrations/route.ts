import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiContext, withApi, readJson, badRequest } from '@/lib/api-utils'
import { audit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req)
    const integrations = await db.integration.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { name: 'asc' } })
    return {
      integrations: integrations.map((i) => ({
        id: i.id, name: i.name, category: i.category, status: i.status, authMethod: i.authMethod,
        lastSyncAt: i.lastSyncAt?.toISOString() ?? null,
      })),
    }
  })
}

export async function POST(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req, 'admin')
    const body = await readJson<{ op?: string; id?: string; action?: 'connect' | 'disconnect' | 'resync' }>(req)
    const integration = await db.integration.findUnique({ where: { id: body.id ?? '' } })
    if (!integration || integration.workspaceId !== ctx.workspaceId) badRequest('integration not found')
    const action = body.action ?? 'resync'
    if (action === 'connect' || action === 'resync') {
      await db.integration.update({
        where: { id: integration.id },
        data: { status: 'connected', lastSyncAt: new Date() },
      })
    } else if (action === 'disconnect') {
      await db.integration.update({ where: { id: integration.id }, data: { status: 'disconnected' } })
    }
    await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: `integration.${action}`, resourceType: 'integration', resourceId: integration.id, severity: 'notice', detail: { name: integration.name } })
    return { ok: true, status: action === 'disconnect' ? 'disconnected' : 'connected' }
  })
}
