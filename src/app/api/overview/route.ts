import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiContext, withApi } from '@/lib/api-utils'
import { monthSpend } from '@/lib/metering'

/** Overview command-center metrics — every number is computed from backend records. */
export async function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req)
    const monthAgo = new Date(Date.now() - 30 * 86400_000)

    const [agents, activeAgents, degraded, paused, executions, succeeded, failed, running, waiting, pendingApprovals, incidents, providerStatus, spend, evalRuns] = await Promise.all([
      db.agent.count({ where: { workspaceId: ctx.workspaceId, status: { not: 'archived' } } }),
      db.agent.count({ where: { workspaceId: ctx.workspaceId, status: { in: ['healthy', 'degraded', 'scaling'] } } }),
      db.agent.count({ where: { workspaceId: ctx.workspaceId, status: 'degraded' } }),
      db.agent.count({ where: { workspaceId: ctx.workspaceId, status: 'paused' } }),
      db.execution.count({ where: { workspaceId: ctx.workspaceId, startedAt: { gte: monthAgo } } }),
      db.execution.count({ where: { workspaceId: ctx.workspaceId, startedAt: { gte: monthAgo }, status: 'succeeded' } }),
      db.execution.count({ where: { workspaceId: ctx.workspaceId, startedAt: { gte: monthAgo }, status: 'failed' } }),
      db.execution.count({ where: { workspaceId: ctx.workspaceId, status: { in: ['running', 'queued'] } } }),
      db.execution.count({ where: { workspaceId: ctx.workspaceId, status: 'waiting_approval' } }),
      db.approval.count({ where: { workspaceId: ctx.workspaceId, status: 'pending' } }),
      db.securityIncident.count({ where: { workspaceId: ctx.workspaceId, status: { in: ['open', 'investigating'] } } }),
      db.modelProvider.findMany({ select: { name: true, slug: true, status: true, latencyMs: true, errorRate: true } }),
      monthSpend(ctx.workspaceId),
      db.evalRun.findMany({ where: { workspaceId: ctx.workspaceId, status: 'completed' }, orderBy: { startedAt: 'desc' }, take: 10, select: { passRate: true } }),
    ])

    // duration + latency aggregates
    const durAgg = await db.execution.aggregate({
      where: { workspaceId: ctx.workspaceId, startedAt: { gte: monthAgo }, status: 'succeeded' },
      _avg: { durationMs: true },
    })

    // daily execution volume for the last 14 days
    const recent = await db.execution.findMany({
      where: { workspaceId: ctx.workspaceId, startedAt: { gte: new Date(Date.now() - 14 * 86400_000) } },
      select: { startedAt: true, status: true, costUsd: true },
    })
    const dailyMap = new Map<string, { total: number; failed: number; cost: number }>()
    for (const e of recent) {
      const day = e.startedAt.toISOString().slice(0, 10)
      const d = dailyMap.get(day) ?? { total: 0, failed: 0, cost: 0 }
      d.total += 1
      if (e.status === 'failed') d.failed += 1
      d.cost += e.costUsd
      dailyMap.set(day, d)
    }
    const daily = [...dailyMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({
      day, total: v.total, failed: v.failed, cost: Math.round(v.cost * 100) / 100,
    }))

    // fleet health snapshot
    const fleets = await db.fleet.findMany({
      where: { workspaceId: ctx.workspaceId },
      include: { agents: { select: { id: true, name: true, status: true, healthStatus: true, successRate: true, spendMonth: true } } },
    })

    const workspace = await db.workspace.findUnique({ where: { id: ctx.workspaceId } })

    return {
      agents: { total: agents, active: activeAgents, degraded, paused },
      executions: { total: executions, succeeded, failed, running, waitingApproval: waiting },
      successRate: executions > 0 ? Math.round((succeeded / executions) * 1000) / 1000 : 0,
      avgDurationMs: Math.round(durAgg._avg.durationMs ?? 0),
      evalPassRate: evalRuns.length ? Math.round((evalRuns.reduce((s, r) => s + r.passRate, 0) / evalRuns.length) * 1000) / 1000 : null,
      governance: { pendingApprovals, securityIncidents: incidents },
      spend: { monthToDate: Math.round(spend * 100) / 100, cap: workspace?.monthlyBudget ?? 0, currency: 'USD' },
      providers: providerStatus.map((p) => ({ name: p.name, slug: p.slug, status: p.status, latencyMs: Math.round(p.latencyMs), errorRate: p.errorRate })),
      daily,
      fleets: fleets.map((f) => ({
        id: f.id, name: f.name, status: f.status,
        agents: f.agents.length,
        healthyAgents: f.agents.filter((a) => a.status === 'healthy').length,
        avgSuccessRate: f.agents.length ? Math.round((f.agents.reduce((s, a) => s + a.successRate, 0) / f.agents.length) * 1000) / 1000 : 0,
        spend: Math.round(f.agents.reduce((s, a) => s + a.spendMonth, 0) * 100) / 100,
        budget: f.monthlyBudget,
        members: f.agents.map((a) => ({ id: a.id, name: a.name, status: a.status, health: a.healthStatus })),
      })),
      seededDemoData: true,
    }
  })
}
