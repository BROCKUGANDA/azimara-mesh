import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiContext, withApi, readJson, badRequest } from '@/lib/api-utils'
import { audit } from '@/lib/audit'
import { evaluatePolicy } from '@/lib/policy-engine'
import type { PolicyRule, PolicyAppliesTo } from '@/lib/types'

export async function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req)
    const policies = await db.policy.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] })
    const recentDecisions = await db.policyDecision.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: 'desc' }, take: 20 })
    return {
      policies: policies.map((p) => ({
        id: p.id, name: p.name, slug: p.slug, kind: p.kind, effect: p.effect, priority: p.priority,
        rules: JSON.parse(p.rulesJson) as PolicyRule[],
        appliesTo: JSON.parse(p.appliesToJson) as PolicyAppliesTo,
        description: p.description, status: p.status, updatedAt: p.updatedAt.toISOString(),
      })),
      recentDecisions: recentDecisions.map((d) => ({
        id: d.id, policyName: d.policyName, subject: d.subject, action: d.action, resource: d.resource,
        decision: d.decision, reason: d.reason, createdAt: d.createdAt.toISOString(),
      })),
    }
  })
}

export async function POST(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req, 'admin') // policy edits require admin
    const body = await readJson<{
      op?: string
      id?: string
      name?: string
      kind?: string
      effect?: string
      priority?: number
      rules?: PolicyRule[]
      appliesTo?: PolicyAppliesTo
      description?: string
      status?: string
      simulation?: {
        action: string
        resource: string
        environment: string
        dataClass: string
        autonomyLevel: string
        estimatedCostUsd?: number
        metadata?: Record<string, unknown>
        subjectAgentId?: string
      }
    }>(req)

    if (body.op === 'simulate') {
      if (!body.simulation) badRequest('simulation payload required')
      const verdict = await evaluatePolicy(ctx.workspaceId, {
        subject: body.simulation.subjectAgentId ?? `user:${ctx.userId}`,
        action: body.simulation.action,
        resource: body.simulation.resource,
        environment: body.simulation.environment,
        dataClass: body.simulation.dataClass,
        autonomyLevel: body.simulation.autonomyLevel,
        estimatedCostUsd: body.simulation.estimatedCostUsd ?? 0,
        metadata: body.simulation.metadata,
      }, body.simulation.subjectAgentId)
      return { verdict }
    }

    if (body.op === 'create') {
      if (!body.name?.trim()) badRequest('name is required')
      if (!['allow', 'deny', 'require_approval'].includes(body.effect ?? '')) badRequest('effect must be allow | deny | require_approval')
      const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const exists = await db.policy.findUnique({ where: { workspaceId_slug: { workspaceId: ctx.workspaceId, slug } } })
      if (exists) badRequest('Policy with this name exists')
      const policy = await db.policy.create({
        data: {
          workspaceId: ctx.workspaceId, name: body.name.trim(), slug,
          kind: body.kind ?? 'guardrail', effect: body.effect as string,
          priority: body.priority ?? 500, rulesJson: JSON.stringify(body.rules ?? []),
          appliesToJson: JSON.stringify(body.appliesTo ?? {}),
          description: body.description ?? '', status: body.status ?? 'active', createdBy: ctx.userId,
        },
      })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'policy.create', resourceType: 'policy', resourceId: policy.id, severity: 'notice', detail: { name: policy.name, effect: policy.effect } })
      return { policy: { id: policy.id, name: policy.name } }
    }

    if (body.op === 'update') {
      if (!body.id) badRequest('id required')
      const policy = await db.policy.findUnique({ where: { id: body.id } })
      if (!policy || policy.workspaceId !== ctx.workspaceId) badRequest('policy not found')
      const data: Record<string, unknown> = {}
      if (body.name) data.name = body.name.trim()
      if (body.effect) data.effect = body.effect
      if (body.priority !== undefined) data.priority = body.priority
      if (body.rules) data.rulesJson = JSON.stringify(body.rules)
      if (body.appliesTo) data.appliesToJson = JSON.stringify(body.appliesTo)
      if (body.description !== undefined) data.description = body.description
      if (body.status) {
        if (!['active', 'draft', 'disabled'].includes(body.status)) badRequest('invalid status')
        data.status = body.status
      }
      const updated = await db.policy.update({ where: { id: body.id }, data: { ...data, updatedAt: new Date() } })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'policy.update', resourceType: 'policy', resourceId: policy.id, severity: 'notice', detail: { fields: Object.keys(data) } })
      return { policy: { id: updated.id, name: updated.name, status: updated.status } }
    }

    badRequest('Unknown operation')
  })
}
