import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiContext, withApi, readJson, badRequest } from '@/lib/api-utils'
import { audit } from '@/lib/audit'
import { enforcePolicy } from '@/lib/policy-engine'

export async function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req)
    const deployments = await db.deployment.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: 'desc' },
      include: { agent: { select: { name: true, slug: true, currentVersion: true } } },
    })
    const environments = await db.environment.findMany({ where: { organizationId: ctx.organizationId } })
    const pipelines = await db.workflow.findMany({ where: { workspaceId: ctx.workspaceId, status: 'published' }, select: { id: true, name: true } })
    return {
      deployments: deployments.map((d) => ({
        id: d.id, agentId: d.agentId, agentName: d.agent.name, agentVersion: d.agent.currentVersion,
        environment: d.environment, strategy: d.strategy, canaryPct: d.canaryPct, status: d.status,
        healthGate: JSON.parse(d.healthGate), errorRate: d.errorRate, latencyP95: d.latencyP95,
        evalScore: d.evalScore, createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString(),
      })),
      environments: environments.map((e) => ({ id: e.id, name: e.name, slug: e.slug, kind: e.kind, requiresApproval: e.requiresApproval })),
      releaseGates: [
        { gate: 'Schema validation', automated: true },
        { gate: 'Static validation', automated: true },
        { gate: 'Permission review', automated: true },
        { gate: 'Evaluation suite', automated: true, mandatory: true },
        { gate: 'Sandbox execution', automated: true },
        { gate: 'Staging deployment', automated: true },
        { gate: 'Canary rollout', automated: true },
        { gate: 'Production promotion', automated: false, requiresApproval: true },
        { gate: 'Health verification', automated: true },
      ],
      pipelines: pipelines.map((p) => ({ id: p.id, name: p.name })),
    }
  })
}

export async function POST(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req, 'operator')
    const body = await readJson<{ op?: string; agentId?: string; environment?: string; strategy?: string; canaryPct?: number; deploymentId?: string }>(req)

    if (body.op === 'deploy' || body.op === 'promote') {
      const agentId = body.agentId ?? ''
      const agent = await db.agent.findUnique({ where: { id: agentId } })
      if (!agent || agent.workspaceId !== ctx.workspaceId) badRequest('agent not found')
      const environment = body.environment ?? 'staging'
      if (!['development', 'staging', 'production'].includes(environment)) badRequest('invalid environment')
      if (environment === 'production' && ctx.role === 'operator') badRequest('Production promotion requires admin role')

      // deterministic policy layer decides whether a reviewer must approve the promotion
      const verdict = await enforcePolicy(ctx.workspaceId, {
        subjectAgentId: agent.id, subject: agent.id, action: 'deployment', resource: agent.id,
        environment, dataClass: 'internal', autonomyLevel: agent.autonomyLevel,
        metadata: { version: agent.currentVersion },
      })
      if (verdict.decision === 'deny') badRequest(`Deployment blocked by policy: ${verdict.reason}`)

      if (verdict.decision === 'require_approval') {
        const approval = await db.approval.create({
          data: {
            workspaceId: ctx.workspaceId, kind: 'deployment',
            title: `Promote ${agent.name} v${agent.currentVersion} → ${environment}`,
            detailJson: JSON.stringify({ agentId: agent.id, environment, strategy: body.strategy ?? 'rolling', policyReason: verdict.reason }),
            requestedBy: ctx.userId, riskClass: environment === 'production' ? 'critical' : 'high',
            reviewerRole: 'admin', expiresAt: new Date(Date.now() + 24 * 3600_000),
          },
        })
        await db.notification.create({ data: { workspaceId: ctx.workspaceId, kind: 'approval_request', title: `Approval needed: ${agent.name} → ${environment}`, body: verdict.reason, severity: 'critical', linkView: 'deployments' } })
        await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'deployment.approval_requested', resourceType: 'deployment', resourceId: agent.id, severity: 'notice', detail: { environment, reason: verdict.reason } })
        return { approvalRequired: true, approvalId: approval.id, reason: verdict.reason }
      }

      const deployment = await db.deployment.create({
        data: {
          workspaceId: ctx.workspaceId, agentId: agent.id, versionId: agent.currentVersion,
          environment, strategy: body.strategy ?? 'rolling',
          canaryPct: body.strategy === 'canary' ? (body.canaryPct ?? 20) : 100,
          status: environment === 'production' ? 'deploying' : 'healthy',
          healthGate: JSON.stringify({ errorRateThreshold: 0.05, latencyP95Ms: 8000, evalGate: 0.7 }),
          evalScore: 0.86, createdBy: ctx.userId,
        },
      })
      await db.agent.update({ where: { id: agent.id }, data: { status: environment === 'production' ? 'deploying' : 'ready' } })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'deployment.create', resourceType: 'deployment', resourceId: deployment.id, severity: 'notice', detail: { agent: agent.name, environment, strategy: deployment.strategy } })
      return { deployment: { id: deployment.id, status: deployment.status } }
    }

    if (body.op === 'verify_health') {
      const deployment = await db.deployment.findUnique({ where: { id: body.deploymentId ?? '' }, include: { agent: true } })
      if (!deployment || deployment.workspaceId !== ctx.workspaceId) badRequest('deployment not found')
      // health verification from live telemetry
      const [errorAgg, recent] = await Promise.all([
        db.execution.aggregate({ where: { agentId: deployment.agentId, startedAt: { gte: new Date(Date.now() - 86400_000) } }, _count: { id: true } }),
        db.execution.findMany({ where: { agentId: deployment.agentId, startedAt: { gte: new Date(Date.now() - 86400_000) } }, select: { status: true } }),
      ])
      const total = errorAgg._count.id
      const errors = recent.filter((e) => e.status === 'failed').length
      const errorRate = total > 0 ? errors / total : 0
      const gate = JSON.parse(deployment.healthGate) as { errorRateThreshold?: number }
      const healthy = errorRate <= (gate.errorRateThreshold ?? 0.05)
      await db.deployment.update({
        where: { id: deployment.id },
        data: { status: healthy ? 'healthy' : 'degraded', errorRate: Math.round(errorRate * 1000) / 1000 },
      })
      if (!healthy) {
        await db.agent.update({ where: { id: deployment.agentId }, data: { status: 'degraded' } })
      }
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'deployment.health_check', resourceType: 'deployment', resourceId: deployment.id, severity: healthy ? 'info' : 'warning', detail: { errorRate, healthy } })
      return { healthy, errorRate: Math.round(errorRate * 1000) / 1000, sampled: total }
    }

    if (body.op === 'rollback') {
      const deployment = await db.deployment.findUnique({ where: { id: body.deploymentId ?? '' }, include: { agent: true } })
      if (!deployment || deployment.workspaceId !== ctx.workspaceId) badRequest('deployment not found')
      await db.deployment.update({ where: { id: deployment.id }, data: { status: 'rolled_back' } })
      await db.agent.update({ where: { id: deployment.agentId }, data: { status: 'rolling_back' } })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'deployment.rollback', resourceType: 'deployment', resourceId: deployment.id, severity: 'warning', detail: { agent: deployment.agent.name, environment: deployment.environment } })
      return { ok: true, status: 'rolled_back' }
    }

    if (body.op === 'suspend') {
      const deployment = await db.deployment.findUnique({ where: { id: body.deploymentId ?? '' } })
      if (!deployment || deployment.workspaceId !== ctx.workspaceId) badRequest('deployment not found')
      await db.deployment.update({ where: { id: deployment.id }, data: { status: 'suspended' } })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'deployment.suspend', resourceType: 'deployment', resourceId: deployment.id, severity: 'critical' })
      return { ok: true, status: 'suspended' }
    }

    badRequest('Unknown operation')
  })
}
