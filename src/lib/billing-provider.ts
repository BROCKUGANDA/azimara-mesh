// Billing provider abstraction. Stripe is the first adapter, test mode by
// default. Live charges require an explicit STRIPE_LIVE_MODE=1 and real keys;
// this code never enables them implicitly.

export interface SubscriptionState {
  workspaceId: string
  status: 'active' | 'past_due' | 'canceled' | 'none'
  planSlug?: string
  seats?: number
  currentPeriodEnd?: Date
}

export interface BillingProvider {
  getSubscription(workspaceId: string): Promise<SubscriptionState>
  verifyWebhook(payload: string, signature: string): Promise<{ eventType: string; workspaceId?: string } | null>
  createCheckout(workspaceId: string, priceId: string): Promise<{ url: string }>
}

/** Test/fake provider used in development and CI. No external calls. */
export class FakeBillingProvider implements BillingProvider {
  private subscriptions = new Map<string, SubscriptionState>()

  set(state: SubscriptionState) { this.subscriptions.set(state.workspaceId, state) }

  async getSubscription(workspaceId: string) {
    return this.subscriptions.get(workspaceId) ?? { workspaceId, status: 'none' }
  }

  async verifyWebhook(payload: string) {
    try { return JSON.parse(payload) as { eventType: string; workspaceId?: string } } catch { return null }
  }

  async createCheckout() { return { url: 'https://billing.stripe.com/test/checkout' } }
}

/** Stripe adapter. Webhook signatures are always verified with the endpoint secret. */
export class StripeBillingProvider implements BillingProvider {
  private stripe: import('stripe').default | null = null

  private async client() {
    if (!this.stripe) {
      const Stripe = (await import('stripe')).default
      const key = process.env.STRIPE_LIVE_MODE === '1'
        ? process.env.STRIPE_SECRET_KEY
        : process.env.STRIPE_TEST_SECRET_KEY
      if (!key) throw new Error('Stripe key is not configured')
      this.stripe = new Stripe(key)
    }
    return this.stripe
  }

  async getSubscription(workspaceId: string): Promise<SubscriptionState> {
    const client = await this.client()
    const customerId = process.env.STRIPE_CUSTOMER_BY_WORKSPACE?.split(',').map((p) => p.split('=')).find(([k]) => k === workspaceId)?.[1]
    if (!customerId) return { workspaceId, status: 'none' }
    const subs = await client.subscriptions.list({ customer: customerId, status: 'all', limit: 1 })
    const sub = subs.data[0]
    if (!sub) return { workspaceId, status: 'none' }
    return {
      workspaceId,
      status: sub.status === 'active' ? 'active' : sub.status === 'past_due' ? 'past_due' : 'canceled',
      seats: sub.items.data[0]?.quantity ?? undefined,
      currentPeriodEnd: new Date((sub as unknown as { current_period_end?: number }).current_period_end ?? Math.floor(Date.now() / 1000) * 30),
    }
  }

  async verifyWebhook(payload: string, signature: string) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET
    if (!secret) return null
    const client = await this.client()
    try {
      const event = client.webhooks.constructEvent(payload, signature, secret)
      const object = event.data.object as { metadata?: { workspaceId?: string } }
      return {
        eventType: event.type,
        workspaceId: object?.metadata?.workspaceId,
      }
    } catch { return null }
  }

  async createCheckout(workspaceId: string, priceId: string) {
    const client = await this.client()
    const session = await client.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.MESH_PUBLIC_URL ?? 'https://mesh.aiazimara.com'}/billing?checkout=success`,
      cancel_url: `${process.env.MESH_PUBLIC_URL ?? 'https://mesh.aiazimara.com'}/billing?checkout=cancel`,
      metadata: { workspaceId },
      subscription_data: { metadata: { workspaceId } },
    })
    if (!session.url) throw new Error('Stripe did not return a checkout URL')
    return { url: session.url }
  }
}

let provider: BillingProvider | null = null

export function getBillingProvider(): BillingProvider {
  if (provider) return provider
  provider = process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY
    ? new StripeBillingProvider()
    : new FakeBillingProvider()
  return provider
}

export function setBillingProvider(next: BillingProvider | null) { provider = next }

/** Entitlements: active subscription or explicitly granted trial access. */
export async function hasEntitlement(workspaceId: string, feature: string): Promise<boolean> {
  const state = await getBillingProvider().getSubscription(workspaceId)
  if (state.status === 'active') return true
  // Free-tier features remain available without a subscription.
  return ['registry:read', 'sandbox:run'].includes(feature)
}
