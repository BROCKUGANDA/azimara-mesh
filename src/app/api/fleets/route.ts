import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiContext, withApi, readJson, badRequest } from '@/lib/api-utils'
import { audit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req)
    const fleets = await db.fleet.findMany({
      where: { workspaceId: ctx.workspaceId },
      include: { agents: { select: { id: true, name: true, slug: true, status: true, healthStatus: true, successRate: true, avgLatencyMs: true, spendMonth: true, autonomyLevel: true, currentVersion: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return {
      fleets: fleets.map((f) => ({
        id: f.id, name: f.name, description: f.description, department: f.department,
        ownerName: f.ownerName, status: f.status, monthlyBudget: f.monthlyBudget, concurrencyCap: f.concurrencyCap,
        agentsCount: f.agents.length,
        healthyAgents: f.agents.filter((a) => a.status === 'healthy').length,
        agentList: f.agents.map((a) => ({ ...a, spendMonth: Math.round(a.spendMonth * 100) / 100 })),
        spend: Math.round(f.agents.reduce((s, a) => s + a.spendMonth, 0) * 100) / 100,
        avgSuccessRate: f.agents.length ? Math.round((f.agents.reduce((s, a) => s + a.successRate, 0) / f.agents.length) * 1000) / 1000 : 0,
      })),
    }
  })
}

export async function POST(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req, 'operator')
    const body = await readJson<{ op?: string; fleetId?: string; name?: string; description?: string; department?: string; agentIds?: string[]; budget?: number }>(req)

    if (body.op === 'create') {
      if (!body.name?.trim()) badRequest('name is required')
      const fleet = await db.fleet.create({
        data: {
          workspaceId: ctx.workspaceId, name: body.name.trim(), description: body.description ?? '',
          department: body.department ?? '', ownerName: ctx.userName,
          monthlyBudget: body.budget ?? 100, concurrencyCap: 10,
        },
      })
      for (const agentId of body.agentIds ?? []) {
        const agent = await db.agent.findUnique({ where: { id: agentId } })
        if (agent?.workspaceId === ctx.workspaceId) {
          await db.fleetAgent.create({ data: { fleetId: fleet.id, agentId } })
          await db.agent.update({ where: { id: agentId }, data: { fleetId: fleet.id } })
        }
      }
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'fleet.create', resourceType: 'fleet', resourceId: fleet.id, severity: 'info', detail: { name: fleet.name, agents: body.agentIds?.length ?? 0 } })
      return { fleet: { id: fleet.id, name: fleet.name } }
    }

    if (body.op === 'pause' || body.op === 'resume') {
      const fleet = await db.fleet.findUnique({ where: { id: body.fleetId ?? '' }, include: { agents: true } })
      if (!fleet || fleet.workspaceId !== ctx.workspaceId) badRequest('fleet not found')
      // fleet-wide mutation: target scope + permission evaluated explicitly
      const nextAgentStatus = body.op === 'pause' ? 'paused' : 'healthy'
      for (const agent of fleet.agents) {
        if (body.op === 'pause' && ['healthy', 'degraded', 'ready', 'scaling'].includes(agent.status)) {
          await db.agent.update({ where: { id: agent.id }, data: { status: nextAgentStatus } })
        } else if (body.op === 'resume' && agent.status === 'paused') {
          await db.agent.update({ where: { id: agent.id }, data: { status: nextAgentStatus } })
        }
      }
      await db.fleet.update({ where: { id: fleet.id }, data: { status: body.op === 'pause' ? 'paused' : 'healthy' } })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: `fleet.${body.op}`, resourceType: 'fleet', resourceId: fleet.id, severity: 'warning', detail: { affectedAgents: fleet.agents.length } })
      return { fleet: { id: fleet.id, status: body.op === 'pause' ? 'paused' : 'healthy' } }
    }

    if (body.op === 'rollout') {
      // progressive rollout: advance every fleet agent to its next published version
      const fleet = await db.fleet.findUnique({ where: { id: body.fleetId ?? '' }, include: { agents: true } })
      if (!fleet || fleet.workspaceId !== ctx.workspaceId) badRequest('fleet not found')
      let rolled = 0
      for (const agent of fleet.agents) {
        const published = await db.agentVersion.findMany({ where: { agentId: agent.id, status: 'published' }, orderBy: { createdAt: 'desc' } })
        const target = published.find((v) => v.version !== agent.currentVersion)
        if (target) {
          await db.agent.update({ where: { id: agent.id }, data: { currentVersion: target.version } })
          rolled += 1
        }
      }
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'fleet.rollout', resourceType: 'fleet', resourceId: fleet.id, severity: 'notice', detail: { rolledOut: rolled } })
      return { rolledOut: rolled }
    }

    if (body.op === 'rollback') {
      const fleet = await db.fleet.findUnique({ where: { id: body.fleetId ?? '' }, include: { agents: true } })
      if (!fleet || fleet.workspaceId !== ctx.workspaceId) badRequest('fleet not found')
      let rolled = 0
      for (const agent of fleet.agents) {
        const versions = await db.agentVersion.findMany({ where: { agentId: agent.id, status: { in: ['published', 'retired'] } }, orderBy: { createdAt: 'desc' } })
        const target = versions.find((v) => v.version !== agent.currentVersion)
        if (target) {
          await db.agent.update({ where: { id: agent.id }, data: { currentVersion: target.version, status: 'rolling_back' } })
          rolled += 1
        }
      }
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'fleet.rollback', resourceType: 'fleet', resourceId: fleet.id, severity: 'notice', detail: { rolledBack: rolled } })
      return { rolledBack: rolled }
    }

    badRequest('Unknown operation')
  })
}
