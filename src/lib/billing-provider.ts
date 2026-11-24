// Onchain billing for Azimara Mesh (Base EVM USDC).
//
// There is no card processor. Value enters the system only through a verified
// onchain USDC transfer to the configured treasury address. Credits are a local,
// auditable ledger derived from those payments; usage draws credits down and any
// remainder becomes a pay-per-use settlement record. Base Sepolia is the
// default; Base mainnet requires explicit opt-in.

import { db } from '@/lib/db'
import { fetchWithTimeout } from '@/lib/http'

export type OnchainNetwork = 'base-sepolia' | 'base-mainnet'

export const USDC_ADDRESSES: Record<OnchainNetwork, string> = {
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  'base-mainnet': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
}

export const CHAIN_IDS: Record<OnchainNetwork, number> = {
  'base-sepolia': 84532,
  'base-mainnet': 8453,
}

// keccak256("Transfer(address,address,uint256)") — ERC-20 Transfer topic.
export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

export interface OnchainConfig {
  network: OnchainNetwork
  rpcUrl: string
  treasuryAddress: string
  usdcAddress: string
  chainId: number
  minConfirmations: number
}

export function getOnchainConfig(): OnchainConfig {
  const network = (process.env.ONCHAIN_NETWORK ?? 'base-sepolia') as OnchainNetwork
  if (network !== 'base-sepolia' && network !== 'base-mainnet') throw new Error('Invalid ONCHAIN_NETWORK')
  const treasuryAddress = (process.env.ONCHAIN_TREASURY_ADDRESS ?? '').toLowerCase()
  if (!/^0x[a-f0-9]{40}$/.test(treasuryAddress)) {
    throw new Error('ONCHAIN_TREASURY_ADDRESS must be a valid EVM address')
  }
  return {
    network,
    rpcUrl: process.env.ONCHAIN_RPC_URL ?? (network === 'base-mainnet' ? 'https://mainnet.base.org' : 'https://sepolia.base.org'),
    treasuryAddress,
    usdcAddress: (process.env.USDC_ADDRESS ?? USDC_ADDRESSES[network]).toLowerCase(),
    chainId: CHAIN_IDS[network],
    minConfirmations: Number(process.env.ONCHAIN_MIN_CONFIRMATIONS ?? 12),
  }
}

export function isOnchainBillingConfigured(): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(process.env.ONCHAIN_TREASURY_ADDRESS ?? '')
}

export interface VerifiedPayment {
  signature: string
  payer: string
  amountUsd: number
  tokenAddress: string
  network: OnchainNetwork
  chainId: number
  destination: string
  blockNumber?: number
}

interface EvmLog {
  address?: string
  topics?: string[]
  data?: string
}

interface TxReceipt {
  status?: string
  blockNumber?: string
  logs?: EvmLog[]
  transactionHash?: string
}

function normalizeAddress(value: string): string {
  const clean = value.toLowerCase().replace(/^0x/, '')
  return `0x${clean.slice(-40)}`
}

/** Parse a padded ERC-20 topic into an EVM address. */
function addressFromTopic(topic: string | undefined): string {
  if (!topic) return ''
  return normalizeAddress(topic.replace(/^0x/, '').slice(-64))
}

/** Parse a uint256 hex amount with USDC's 6 decimals. */
function amountFromHex(data: string | undefined): number {
  if (!data || !/^0x[0-9a-f]+$/i.test(data)) return 0
  try {
    const raw = BigInt(data)
    // USDC has 6 decimals. NaN/Infinity are impossible with BigInt.
    const usd = Number(raw) / 1_000_000
    return Number.isFinite(usd) && usd > 0 ? usd : 0
  } catch { return 0 }
}

async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }, 8000)
  if (!res.ok) throw new Error(`RPC ${method} failed: ${res.status}`)
  const json = await res.json() as { result?: unknown; error?: unknown }
  if (json.error) throw new Error(`RPC ${method} error`)
  return json.result
}

/**
 * Verify a Base transaction hash via JSON-RPC and extract USDC ERC-20 Transfer
 * logs to the configured treasury. Checks success status, chain id, required
 * confirmations and token address. A duplicate hash cannot double-credit
 * because the payment row is unique.
 */
export async function verifyUsdcPayment(
  signature: string,
  config = getOnchainConfig(),
): Promise<VerifiedPayment | null> {
  if (!/^0x[a-fA-F0-9]{64}$/.test(signature)) return null
  const hash = signature.toLowerCase()
  const expectedToken = normalizeAddress(config.usdcAddress)
  const expectedTreasury = normalizeAddress(config.treasuryAddress)

  try {
    const [chainIdHex, receipt, headHex] = await Promise.all([
      rpc(config.rpcUrl, 'eth_chainId', []) as Promise<string>,
      rpc(config.rpcUrl, 'eth_getTransactionReceipt', [hash]) as Promise<TxReceipt | null>,
      rpc(config.rpcUrl, 'eth_blockNumber', []) as Promise<string>,
    ])
    if (Number(chainIdHex) !== config.chainId) return null
    if (!receipt || receipt.status !== '0x1' || !receipt.logs) return null
    const txBlock = Number(receipt.blockNumber)
    const head = Number(headHex)
    if (!Number.isFinite(txBlock) || head - txBlock + 1 < config.minConfirmations) return null

    const payerLogs = receipt.logs.find((log) =>
      normalizeAddress(log.address ?? '') === expectedToken &&
      (log.topics?.[0] ?? '').toLowerCase() === TRANSFER_TOPIC,
    )
    if (!payerLogs) return null

    let total = 0
    for (const log of receipt.logs) {
      if (normalizeAddress(log.address ?? '') !== expectedToken) continue
      if ((log.topics?.[0] ?? '').toLowerCase() !== TRANSFER_TOPIC) continue
      if (addressFromTopic(log.topics?.[2]) !== expectedTreasury) continue
      total += amountFromHex(log.data)
    }
    if (total <= 0) return null

    return {
      signature: hash,
      payer: addressFromTopic(payerLogs.topics?.[1]),
      amountUsd: Math.round(total * 1e6) / 1e6,
      tokenAddress: expectedToken,
      network: config.network,
      chainId: config.chainId,
      destination: expectedTreasury,
      blockNumber: txBlock,
    }
  } catch {
    return null
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
        tokenAddress: payment.tokenAddress,
        network: payment.network,
        chainId: payment.chainId,
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

/** Settle a usage period. Idempotent by (workspaceId, periodStart). */
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
  const subscription = await db.subscription.findUnique({
    where: { workspaceId },
    select: { status: true },
  })
  if (subscription?.status === 'active') return true
  if ((await creditBalance(workspaceId)) > 0) return true
  return process.env.MESH_PAY_PER_USE === '1'
}

export const onchainBilling = {
  getConfig: getOnchainConfig,
  verify: verifyUsdcPayment,
  credit: applyVerifiedPayment,
  balance: creditBalance,
  settle: settleUsagePeriod,
}
