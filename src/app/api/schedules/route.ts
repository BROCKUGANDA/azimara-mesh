import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiContext, withApi, readJson, badRequest } from '@/lib/api-utils'
import { audit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req)
    const schedules = await db.schedule.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: 'asc' } })
    return {
      schedules: schedules.map((s) => ({
        id: s.id, name: s.name, cronExpr: s.cronExpr, targetKind: s.targetKind, targetId: s.targetId,
        targetName: s.targetName, timezone: s.timezone, status: s.status,
        lastRunAt: s.lastRunAt?.toISOString() ?? null, nextRunAt: s.nextRunAt?.toISOString() ?? null,
      })),
    }
  })
}

export async function POST(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req, 'operator')
    const body = await readJson<{ op?: string; id?: string; name?: string; cronExpr?: string; targetKind?: string; targetId?: string; timezone?: string }>(req)

    if (body.op === 'create') {
      if (!body.name?.trim() || !body.cronExpr?.trim()) badRequest('name and cronExpr are required')
      if (!/^\S+\s+\S+\s+\S+\s+\S+\s+\S+.*$/.test(body.cronExpr.trim())) badRequest('cronExpr must be a 5-field cron expression')
      let targetName = ''
      if (body.targetId) {
        const target = body.targetKind === 'workflow'
          ? await db.workflow.findUnique({ where: { id: body.targetId } })
          : await db.agent.findUnique({ where: { id: body.targetId } })
        if (!target || (target as { workspaceId?: string }).workspaceId !== ctx.workspaceId) badRequest('target not found in workspace')
        targetName = (target as { name?: string }).name ?? ''
      }
      const schedule = await db.schedule.create({
        data: {
          workspaceId: ctx.workspaceId, name: body.name.trim(), cronExpr: body.cronExpr.trim(),
          targetKind: body.targetKind ?? 'agent', targetId: body.targetId ?? '', targetName,
          timezone: body.timezone ?? 'UTC', status: 'active',
        },
      })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'schedule.create', resourceType: 'schedule', resourceId: schedule.id, severity: 'info', detail: { cron: schedule.cronExpr, targetName } })
      return { schedule: { id: schedule.id } }
    }

    if (body.op === 'toggle') {
      const schedule = await db.schedule.findUnique({ where: { id: body.id ?? '' } })
      if (!schedule || schedule.workspaceId !== ctx.workspaceId) badRequest('schedule not found')
      const status = schedule.status === 'active' ? 'paused' : 'active'
      await db.schedule.update({ where: { id: schedule.id }, data: { status } })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: `schedule.${status === 'paused' ? 'pause' : 'resume'}`, resourceType: 'schedule', resourceId: schedule.id, severity: 'notice' })
      return { schedule: { id: schedule.id, status } }
    }

    if (body.op === 'delete') {
      const schedule = await db.schedule.findUnique({ where: { id: body.id ?? '' } })
      if (!schedule || schedule.workspaceId !== ctx.workspaceId) badRequest('schedule not found')
      await db.schedule.delete({ where: { id: schedule.id } })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'schedule.delete', resourceType: 'schedule', resourceId: schedule.id, severity: 'notice' })
      return { ok: true }
    }

    badRequest('Unknown operation')
  })
}
