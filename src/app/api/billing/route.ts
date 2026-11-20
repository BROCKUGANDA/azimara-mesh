import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiContext, withApi, readJson, badRequest } from '@/lib/api-utils'
import { audit } from '@/lib/audit'
import { usageBreakdown } from '@/lib/metering'

export async function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req)
    const [plans, subscription, invoices] = await Promise.all([
      db.plan.findMany({ orderBy: [{ priceMonth: 'asc' }] }),
      db.subscription.findUnique({ where: { workspaceId: ctx.workspaceId }, include: { plan: true } }),
      db.invoice.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { periodStart: 'desc' } }),
    ])
    const breakdown = await usageBreakdown(ctx.workspaceId)
    const seats = await db.membership.count({ where: { workspaceId: ctx.workspaceId } })
    return {
      plans: plans.map((p) => ({ ...p, features: JSON.parse(p.featuresJson) })),
      subscription: subscription ? {
        plan: subscription.plan.name, planSlug: subscription.plan.slug, priceMonth: subscription.plan.priceMonth,
        includedCredits: subscription.plan.includedCredits, maxAgents: subscription.plan.maxAgents, maxSeats: subscription.plan.maxSeats,
        status: subscription.status, seats, spendCapUsd: subscription.spendCapUsd,
        paymentMethod: subscription.paymentMethod,
        currentPeriodStart: subscription.currentPeriodStart.toISOString(),
        currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
      } : null,
      invoices: invoices.map((i) => ({
        id: i.id, number: i.number, periodStart: i.periodStart.toISOString(), periodEnd: i.periodEnd.toISOString(),
        subtotalUsd: i.subtotalUsd, creditsUsd: i.creditsUsd, totalUsd: i.totalUsd, status: i.status,
        lines: JSON.parse(i.linesJson),
      })),
      usage: { spent: breakdown.spent, forecast: breakdown.forecast, cap: breakdown.cap, byKind: breakdown.byKind },
    }
  })
}

export async function POST(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req, 'admin')
    const body = await readJson<{ op?: string; planSlug?: string; spendCapUsd?: number }>(req)

    if (body.op === 'change_plan') {
      const plan = await db.plan.findUnique({ where: { slug: body.planSlug ?? '' } })
      if (!plan) badRequest('plan not found')
      const subscription = await db.subscription.findUnique({ where: { workspaceId: ctx.workspaceId } })
      if (!subscription) badRequest('no subscription found')
      const agentCount = await db.agent.count({ where: { workspaceId: ctx.workspaceId, status: { not: 'archived' } } })
      if (agentCount > plan.maxAgents) badRequest(`Plan ${plan.name} allows ${plan.maxAgents} agents; workspace has ${agentCount}`)
      await db.subscription.update({ where: { id: subscription.id }, data: { planId: plan.id, spendCapUsd: Math.max(subscription.spendCapUsd, 0) } })
      await db.organization.update({ where: { id: ctx.organizationId }, data: { planTier: plan.slug } })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'billing.plan_change', resourceType: 'subscription', resourceId: subscription.id, severity: 'notice', detail: { to: plan.name } })
      return { ok: true, plan: plan.name }
    }

    if (body.op === 'set_spend_cap') {
      const subscription = await db.subscription.findUnique({ where: { workspaceId: ctx.workspaceId } })
      if (!subscription) badRequest('no subscription found')
      if ((body.spendCapUsd ?? 0) < 0) badRequest('spendCapUsd must be >= 0')
      await db.subscription.update({ where: { id: subscription.id }, data: { spendCapUsd: body.spendCapUsd ?? 0 } })
      await db.workspace.update({ where: { id: ctx.workspaceId }, data: { monthlyBudget: body.spendCapUsd ?? 0 } })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'billing.spend_cap', resourceType: 'subscription', resourceId: subscription.id, severity: 'notice', detail: { cap: body.spendCapUsd } })
      return { ok: true, spendCapUsd: body.spendCapUsd }
    }

    badRequest('Unknown operation')
  })
}
