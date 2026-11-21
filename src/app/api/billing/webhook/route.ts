// Signed billing webhook receiver. Rejects unverified signatures and never
// trusts client-supplied subscription state. Idempotent by Stripe event id.
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getBillingProvider } from '@/lib/billing-provider'
import { audit } from '@/lib/audit'

export async function POST(req: NextRequest) {
  const payload = await req.text()
  const signature = req.headers.get('stripe-signature') ?? ''
  const event = await getBillingProvider().verifyWebhook(payload, signature)
  if (!event) return Response.json({ error: { code: 'INVALID_SIGNATURE', message: 'Webhook verification failed' } }, { status: 400 })

  const eventId = (JSON.parse(payload) as { id?: string }).id ?? ''
  const workspaceId = event.workspaceId
  if (!workspaceId) return Response.json({ received: true, ignored: 'no workspace' })

  // Idempotency: one audit event per provider event id.
  const existing = await db.auditEvent.findFirst({
    where: { action: `billing.webhook.${event.eventType}`, detailJson: { contains: eventId } },
  })
  if (existing) return Response.json({ received: true, duplicate: true })

  const status = event.eventType.includes('deleted') || event.eventType.includes('canceled') ? 'canceled'
    : event.eventType.includes('past_due') ? 'past_due' : 'active'

  await db.subscription.updateMany({
    where: { workspaceId },
    data: { status, currentPeriodEnd: new Date(Date.now() + 30 * 86400_000) },
  })
  await audit({
    organizationId: (await db.workspace.findUnique({ where: { id: workspaceId }, select: { organizationId: true } }))?.organizationId ?? '',
    workspaceId, actorType: 'system', action: `billing.webhook.${event.eventType}`,
    resourceType: 'subscription', resourceId: workspaceId, severity: 'notice',
    detail: { eventId, status },
  })
  return Response.json({ received: true })
}
