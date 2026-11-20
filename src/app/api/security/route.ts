import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiContext, withApi, readJson, badRequest } from '@/lib/api-utils'
import { audit } from '@/lib/audit'
import { jparse } from '@/lib/types'
import { suspendAgent, suspendTool, emergencyWorkspaceStop } from '@/lib/security-monitor'

export async function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req)
    const [incidents, suspendedAgents, suspendedTools, recentDenies] = await Promise.all([
      db.securityIncident.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { openedAt: 'desc' }, take: 40 }),
      db.agent.findMany({ where: { workspaceId: ctx.workspaceId, status: 'paused' }, select: { id: true, name: true } }),
      db.tool.findMany({ where: { workspaceId: ctx.workspaceId, status: 'suspended' }, select: { id: true, name: true } }),
      db.policyDecision.findMany({ where: { workspaceId: ctx.workspaceId, decision: 'deny' }, orderBy: { createdAt: 'desc' }, take: 10 }),
    ])
    const open = incidents.filter((i) => i.status === 'open').length
    const investigating = incidents.filter((i) => i.status === 'investigating').length
    const bySeverity = (s: string) => incidents.filter((i) => i.severity === s && i.status !== 'resolved').length
    return {
      incidents: incidents.map((i) => ({
        id: i.id, kind: i.kind, severity: i.severity, title: i.title, status: i.status,
        detail: jparse(i.detailJson, {}), agentId: i.agentId, executionId: i.executionId,
        openedAt: i.openedAt.toISOString(), resolvedAt: i.resolvedAt?.toISOString() ?? null,
        resolvedBy: i.resolvedBy, notes: jparse(i.notesJson, []),
      })),
      summary: {
        open, investigating, critical: bySeverity('critical'), high: bySeverity('high'), medium: bySeverity('medium'), low: bySeverity('low'),
        suspendedAgents: suspendedAgents.map((a) => a.name),
        suspendedTools: suspendedTools.map((t) => t.name),
        denyRate: recentDenies.length,
      },
      recentDenials: recentDenies.map((d) => ({ id: d.id, policyName: d.policyName, subject: d.subject, action: d.action, reason: d.reason, createdAt: d.createdAt.toISOString() })),
    }
  })
}

export async function POST(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req, 'admin') // emergency controls require admin
    const body = await readJson<{ op?: string; agentId?: string; toolId?: string; incidentId?: string; reason?: string; note?: string; status?: string }>(req)

    if (body.op === 'suspend_agent') {
      if (!body.agentId) badRequest('agentId required')
      await suspendAgent(body.agentId, body.reason ?? 'Suspended from Security Center', ctx.userName)
      return { ok: true, agentId: body.agentId, status: 'paused' }
    }
    if (body.op === 'suspend_tool') {
      if (!body.toolId) badRequest('toolId required')
      await suspendTool(body.toolId, body.reason ?? 'Suspended from Security Center', ctx.userName)
      return { ok: true, toolId: body.toolId, status: 'suspended' }
    }
    if (body.op === 'emergency_stop') {
      await emergencyWorkspaceStop(ctx.workspaceId, body.reason ?? 'Workspace emergency stop', ctx.userName)
      return { ok: true, note: 'All agents paused, active executions cancelled, production deployments suspended.' }
    }
    if (body.op === 'update_incident') {
      if (!body.incidentId) badRequest('incidentId required')
      const status = body.status ?? ''
      if (!['open', 'investigating', 'contained', 'resolved'].includes(status)) badRequest('invalid status')
      const incident = await db.securityIncident.findUnique({ where: { id: body.incidentId } })
      if (!incident || incident.workspaceId !== ctx.workspaceId) badRequest('incident not found')
      const notes = jparse<{ at: string; by: string; note: string }[]>(incident.notesJson, [])
      if (body.note) notes.push({ at: new Date().toISOString(), by: ctx.userName, note: body.note })
      await db.securityIncident.update({
        where: { id: incident.id },
        data: {
          status,
          notesJson: JSON.stringify(notes),
          resolvedAt: status === 'resolved' ? new Date() : null,
          resolvedBy: status === 'resolved' ? ctx.userId : null,
        },
      })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'security.incident_update', resourceType: 'security_incident', resourceId: incident.id, severity: status === 'resolved' ? 'info' : 'notice', detail: { status, note: body.note ?? '' } })
      return { ok: true, incident: { id: incident.id, status } }
    }
    badRequest('Unknown operation')
  })
}
