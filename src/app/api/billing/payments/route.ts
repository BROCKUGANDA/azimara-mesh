// Onchain payment verification. Accepts a Solana transaction signature,
// verifies the SPL USDC transfer to the treasury on finalize, and credits the
// workspace exactly once. No card signatures or webhooks are involved.
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiContext, withApi, readJson, badRequest } from '@/lib/api-utils'
import { audit } from '@/lib/audit'
import {
  getOnchainConfig, isOnchainBillingConfigured, verifyUsdcPayment,
  applyVerifiedPayment, creditBalance,
} from '@/lib/billing-provider'

export async function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req)
    const [payments, ledger, config] = await Promise.all([
      db.onchainPayment.findMany({
        where: { workspaceId: ctx.workspaceId },
        orderBy: { createdAt: 'desc' }, take: 50,
      }),
      db.creditLedgerEntry.findMany({
        where: { workspaceId: ctx.workspaceId },
        orderBy: { createdAt: 'desc' }, take: 50,
      }),
      Promise.resolve(isOnchainBillingConfigured() ? getOnchainConfig() : null),
    ])
    return {
      cluster: config?.cluster ?? 'not-configured',
      treasuryWallet: config?.treasuryWallet ?? null,
      usdcMint: config?.usdcMint ?? null,
      creditBalanceUsd: await creditBalance(ctx.workspaceId),
      payments: payments.map((p) => ({
        signature: p.signature, payer: p.payer, amountUsd: p.amountUsd,
        cluster: p.cluster, status: p.status, confirmedAt: p.confirmedAt.toISOString(),
      })),
      ledger: ledger.map((e) => ({
        id: e.id, amountUsd: e.amountUsd, kind: e.kind,
        reference: e.reference, balanceAfterUsd: e.balanceAfterUsd,
        createdAt: e.createdAt.toISOString(),
      })),
    }
  })
}

export async function POST(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req)
    if (!isOnchainBillingConfigured()) badRequest('Onchain billing is not configured')

    const body = await readJson<{ signature?: string }>(req)
    const signature = body.signature?.trim()
    if (!signature) badRequest('signature is required')

    const verified = await verifyUsdcPayment(signature)
    if (!verified) badRequest('Transaction could not be verified as a finalized USDC payment to the treasury')

    const credited = await applyVerifiedPayment(verified, ctx.workspaceId)
    if (!credited) {
      return { ok: true, duplicate: true, amountUsd: verified.amountUsd, signature }
    }

    await audit({
      organizationId: ctx.organizationId, workspaceId: ctx.workspaceId,
      actorId: ctx.userId, actorName: ctx.userName,
      action: 'billing.onchain_payment', resourceType: 'payment', resourceId: signature,
      severity: 'notice',
      detail: {
        amountUsd: verified.amountUsd, cluster: verified.cluster,
        payer: verified.payer, mint: verified.mint,
      },
    })
    return { ok: true, duplicate: false, amountUsd: verified.amountUsd, signature, balanceUsd: await creditBalance(ctx.workspaceId) }
  })
}
