// Onchain billing for Azimara Mesh (Solana SPL USDC).
//
// There is no card processor. Value enters the system only through a verified
// onchain USDC transfer to the treasury token account. Credits are a local,
// auditable ledger derived from those payments; usage draws credits down and
// any remainder becomes a pay-per-use settlement record. Live/mainnet mode is
// explicit; devnet is the default.

import { db } from '@/lib/db'

export type OnchainCluster = 'devnet' | 'mainnet-beta'

export const USDC_MINTS: Record<OnchainCluster, string> = {
  devnet: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  'mainnet-beta': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
}

export interface OnchainConfig {
  cluster: OnchainCluster
  rpcUrl: string
  treasuryWallet: string
  treasuryAta: string
  usdcMint: string
}

export function getOnchainConfig(): OnchainConfig {
  const cluster = (process.env.SOLANA_CLUSTER ?? 'devnet') as OnchainCluster
  if (cluster !== 'devnet' && cluster !== 'mainnet-beta') throw new Error('Invalid SOLANA_CLUSTER')
  const treasuryWallet = process.env.SOLANA_TREASURY_WALLET ?? ''
  const treasuryAta = process.env.SOLANA_TREASURY_ATA ?? ''
  if (!treasuryWallet || !treasuryAta) {
    throw new Error('SOLANA_TREASURY_WALLET and SOLANA_TREASURY_ATA are required')
  }
  const mint = process.env.USDC_MINT ?? USDC_MINTS[cluster]
  return {
    cluster,
    rpcUrl: process.env.SOLANA_RPC_URL ?? (cluster === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com'),
    treasuryWallet,
    treasuryAta,
    usdcMint: mint,
  }
}

export function isOnchainBillingConfigured(): boolean {
  return Boolean(process.env.SOLANA_TREASURY_WALLET && process.env.SOLANA_TREASURY_ATA)
}

export interface VerifiedPayment {
  signature: string
  payer: string
  amountUsd: number
  mint: string
  cluster: OnchainCluster
  destination: string
  blockTime?: number
}

interface ParsedInstruction {
  program?: string
  parsed?: {
    type?: string
    info?: {
      destination?: string
      source?: string
      mint?: string
      amount?: string
      tokenAmount?: { uiAmount?: number | null; amount?: string; decimals?: number }
    }
  }
}

/**
 * Verify a Solana transaction signature via JSON-RPC and extract USDC transfers
 * to the configured treasury ATA. Verification is read-only and deterministic;
 * a duplicate signature cannot double-credit because the payment row is unique.
 */
export async function verifyUsdcPayment(
  signature: string,
  config = getOnchainConfig(),
): Promise<VerifiedPayment | null> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(signature)) return null

  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'getTransaction',
    params: [signature, {
      encoding: 'jsonParsed',
      maxSupportedTransactionVersion: 0,
      commitment: 'finalized',
    }],
  }
  const res = await fetch(config.rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return null
  const json = await res.json() as {
    result?: {
      meta?: { err?: unknown }
      blockTime?: number
      transaction?: {
        message?: {
          accountKeys?: Array<{ pubkey: string }>
          instructions?: ParsedInstruction[]
        }
      }
    }
  }
  const tx = json.result
  if (!tx || tx.meta?.err || !tx.transaction?.message) return null

  let total = 0
  for (const ix of tx.transaction.message.instructions ?? []) {
    if (ix.program !== 'spl-token' || !ix.parsed) continue
    if (!['transfer', 'transferChecked'].includes(ix.parsed.type ?? '')) continue
    const info = ix.parsed.info ?? {}
    if (info.destination !== config.treasuryAta) continue
    if (info.mint && info.mint !== config.usdcMint) continue
    const amount = info.tokenAmount?.uiAmount ??
      (info.amount ? Number(info.amount) / 1_000_000 : 0)
    if (Number.isFinite(amount) && amount > 0) total += amount
  }
  if (total <= 0) return null

  return {
    signature,
    payer: tx.transaction.message.accountKeys?.[0]?.pubkey ?? '',
    amountUsd: Math.round(total * 1e6) / 1e6,
    mint: config.usdcMint,
    cluster: config.cluster,
    destination: config.treasuryAta,
    blockTime: tx.blockTime,
  }
}

async function ledgerLock(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], workspaceId: string) {
  // Serialize credit ledger updates per workspace so concurrent payments and
  // usage drawdowns cannot produce a negative balance. The lock is taken on the
  // transaction's own connection and released when the transaction ends.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`
}

type TxnClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]

async function balanceInTx(tx: TxnClient, workspaceId: string): Promise<number> {
  const agg = await tx.creditLedgerEntry.aggregate({
    where: { workspaceId },
    _sum: { amountUsd: true },
  })
  return Math.round((agg._sum.amountUsd ?? 0) * 1e6) / 1e6
}

export async function creditBalance(workspaceId: string): Promise<number> {
  const agg = await db.creditLedgerEntry.aggregate({
    where: { workspaceId },
    _sum: { amountUsd: true },
  })
  return Math.round((agg._sum.amountUsd ?? 0) * 1e6) / 1e6
}

/** Credit a verified onchain payment once. Returns false if already credited. */
export async function applyVerifiedPayment(payment: VerifiedPayment, workspaceId: string): Promise<boolean> {
  return db.$transaction(async (tx) => {
    await ledgerLock(tx, workspaceId)
    const existing = await tx.onchainPayment.findUnique({ where: { signature: payment.signature } })
    if (existing) return false
    const balance = await balanceInTx(tx, workspaceId)
    const newBalance = Math.round((balance + payment.amountUsd) * 1e6) / 1e6
    await tx.onchainPayment.create({
      data: {
        workspaceId,
        signature: payment.signature,
        payer: payment.payer,
        amountUsd: payment.amountUsd,
        mint: payment.mint,
        cluster: payment.cluster,
        destination: payment.destination,
      },
    })
    await tx.creditLedgerEntry.create({
      data: {
        workspaceId,
        amountUsd: payment.amountUsd,
        kind: 'topup',
        reference: payment.signature,
        balanceAfterUsd: newBalance,
      },
    })
    return true
  })
}

/** Draw metered usage down from prepaid credits. Returns amount actually applied. */
export async function applyUsageToCredits(
  workspaceId: string,
  amountUsd: number,
  reference: string,
): Promise<number> {
  return db.$transaction(async (tx) => {
    await ledgerLock(tx, workspaceId)
    // Idempotent replay: the ledger reference is unique, so a repeated usage
    // idempotency key must not draw credits down twice.
    const existing = await tx.creditLedgerEntry.findUnique({
      where: { workspaceId_kind_reference: { workspaceId, kind: 'usage', reference } },
    })
    if (existing) return 0
    const balance = await balanceInTx(tx, workspaceId)
    const applied = Math.min(Math.max(balance, 0), Math.max(amountUsd, 0))
    if (applied <= 0) return 0
    const newBalance = Math.round((balance - applied) * 1e6) / 1e6
    await tx.creditLedgerEntry.create({
      data: {
        workspaceId,
        amountUsd: -applied,
        kind: 'usage',
        reference,
        balanceAfterUsd: newBalance,
      },
    })
    return applied
  })
}

export interface UsageSettlementResult {
  settlementId: string
  usageUsd: number
  creditsAppliedUsd: number
  remainingUsd: number
  status: 'settled' | 'pending'
}

/**
 * Settle a usage period. Idempotent by (workspaceId, periodStart). Prepaid
 * credits are applied first; any remainder is recorded for onchain pay-per-use
 * collection and never silently forgiven.
 */
export async function settleUsagePeriod(
  workspaceId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<UsageSettlementResult> {
  return db.$transaction(async (tx) => {
    await ledgerLock(tx, workspaceId)
    const existing = await tx.usageSettlement.findUnique({
      where: { workspaceId_periodStart: { workspaceId, periodStart } },
    })
    if (existing) {
      return {
        settlementId: existing.id, usageUsd: existing.usageUsd,
        creditsAppliedUsd: existing.creditsAppliedUsd, remainingUsd: existing.remainingUsd,
        status: existing.status === 'settled' ? 'settled' : 'pending',
      }
    }
    const usageAgg = await tx.usageEvent.aggregate({
      where: { workspaceId, recordedAt: { gte: periodStart, lt: periodEnd } },
      _sum: { costUsd: true },
    })
    const usageUsd = Math.round((usageAgg._sum.costUsd ?? 0) * 1e6) / 1e6
    const balance = await balanceInTx(tx, workspaceId)
    const creditsAppliedUsd = Math.min(balance, usageUsd)

    if (creditsAppliedUsd > 0) {
      const settlementRef = `settlement:${periodStart.toISOString()}`
      const alreadyDrawn = await tx.creditLedgerEntry.findUnique({
        where: { workspaceId_kind_reference: { workspaceId, kind: 'usage', reference: settlementRef } },
      })
      if (!alreadyDrawn) {
        await tx.creditLedgerEntry.create({
          data: {
            workspaceId, amountUsd: -creditsAppliedUsd, kind: 'usage',
            reference: settlementRef,
            balanceAfterUsd: Math.round((balance - creditsAppliedUsd) * 1e6) / 1e6,
          },
        })
      }
    }
    const remainingUsd = Math.round((usageUsd - creditsAppliedUsd) * 1e6) / 1e6
    const row = await tx.usageSettlement.create({
      data: {
        workspaceId, periodStart, periodEnd, usageUsd,
        creditsAppliedUsd, remainingUsd,
        status: remainingUsd <= 0 ? 'settled' : 'pending',
      },
    })
    return {
      settlementId: row.id, usageUsd, creditsAppliedUsd, remainingUsd,
      status: row.status === 'settled' ? 'settled' : 'pending',
    }
  })
}

const FREE_FEATURES = ['registry:read', 'sandbox:run', 'agents:read', 'executions:read']
const PAID_FEATURES = ['sso', 'scim', 'dedicated-runtime', 'marketplace', 'multi-region', 'audit-export', 'advanced-governance']

/** Entitlements derive from verified onchain credits, not card status. */
export async function hasEntitlement(workspaceId: string, feature: string): Promise<boolean> {
  if (FREE_FEATURES.includes(feature)) return true
  if (!PAID_FEATURES.includes(feature)) return false
  // A paid plan may have been activated by an onchain subscription payment.
  const subscription = await db.subscription.findUnique({
    where: { workspaceId },
    select: { status: true },
  })
  if (subscription?.status === 'active') return true
  // Prepaid credits unlock paid features while they last.
  if ((await creditBalance(workspaceId)) > 0) return true
  // Explicit pay-per-use opt-in allows work that will be settled onchain later.
  return process.env.MESH_PAY_PER_USE === '1'
}

// Retained export names used by tests and callers; no card processor remains.
export const onchainBilling = {
  getConfig: getOnchainConfig,
  verify: verifyUsdcPayment,
  credit: applyVerifiedPayment,
  balance: creditBalance,
  settle: settleUsagePeriod,
}
