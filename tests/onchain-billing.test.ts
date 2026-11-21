import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import { randomBytes } from 'node:crypto'
import { db, migrationDb } from '@/lib/db'
import { runWithDatabaseContext } from '@/lib/db-context'
import {
  applyVerifiedPayment, creditBalance, applyUsageToCredits,
  settleUsagePeriod, hasEntitlement, USDC_ADDRESSES, type VerifiedPayment,
} from '@/lib/billing-provider'

const suffix = randomBytes(4).toString('hex')
const orgId = `bill_org_${suffix}`
const ws = `bill_ws_${suffix}`
const isPg = () => /^postgres/i.test(process.env.DATABASE_URL ?? '')
const ctx = () => ({ userId: 'u1', workspaceId: ws, organizationId: orgId })

function payment(sig: string, amountUsd: number): VerifiedPayment {
  return {
    signature: sig, payer: '0x1111111111111111111111111111111111111111', amountUsd,
    tokenAddress: USDC_ADDRESSES['base-sepolia'], network: 'base-sepolia',
    chainId: 84532, destination: '0x9cb57c0daf38462447509998647ed06488cbebf8',
  }
}

beforeAll(async () => {
  if (!isPg()) return
  await migrationDb.organization.create({ data: { id: orgId, name: 'Billing Org', slug: orgId } })
  await migrationDb.workspace.create({
    data: { id: ws, organizationId: orgId, name: ws, slug: ws, monthlyBudget: 1000 },
  })
})

afterAll(async () => {
  if (!isPg()) return
  await migrationDb.creditLedgerEntry.deleteMany({ where: { workspaceId: ws } })
  await migrationDb.onchainPayment.deleteMany({ where: { workspaceId: ws } })
  await migrationDb.usageSettlement.deleteMany({ where: { workspaceId: ws } })
  await migrationDb.workspace.deleteMany({ where: { id: ws } })
  await migrationDb.organization.delete({ where: { id: orgId } })
  await migrationDb.$disconnect()
})

describe('onchain credit ledger', () => {
  test('a verified payment credits the workspace exactly once', async () => {
    if (!isPg()) return
    const sig = `bill_pay_${suffix}`
    const first = await runWithDatabaseContext(ctx(), () => applyVerifiedPayment(payment(sig, 50), ws))
    const second = await runWithDatabaseContext(ctx(), () => applyVerifiedPayment(payment(sig, 50), ws))
    expect(first).toBe(true)
    expect(second).toBe(false)
    expect(await runWithDatabaseContext(ctx(), () => creditBalance(ws))).toBe(50)
  })

  test('usage draws credits down idempotently by reference', async () => {
    if (!isPg()) return
    await runWithDatabaseContext(ctx(), () => applyUsageToCredits(ws, 20, `usage:${suffix}:a`))
    await runWithDatabaseContext(ctx(), () => applyUsageToCredits(ws, 20, `usage:${suffix}:a`))
    expect(await runWithDatabaseContext(ctx(), () => creditBalance(ws))).toBe(30)
    await runWithDatabaseContext(ctx(), () => applyUsageToCredits(ws, 10, `usage:${suffix}:b`))
    expect(await runWithDatabaseContext(ctx(), () => creditBalance(ws))).toBe(20)
  })

  test('settlement is idempotent and records remaining pay-per-use liability', async () => {
    if (!isPg()) return
    const start = new Date(Date.UTC(2026, 0, 1))
    const end = new Date(Date.UTC(2026, 1, 1))
    await migrationDb.usageEvent.create({
      data: {
        workspaceId: ws, kind: 'execution', quantity: 1, costUsd: 35,
        idempotencyKey: `bill_usage_${suffix}`, recordedAt: new Date(Date.UTC(2026, 0, 15)),
      },
    })
    const first = await runWithDatabaseContext(ctx(), () => settleUsagePeriod(ws, start, end))
    const second = await runWithDatabaseContext(ctx(), () => settleUsagePeriod(ws, start, end))
    expect(first.settlementId).toBe(second.settlementId)
    expect(first.creditsAppliedUsd).toBe(20)
    expect(first.remainingUsd).toBe(15)
    expect(first.status).toBe('pending')
    expect(await runWithDatabaseContext(ctx(), () => creditBalance(ws))).toBe(0)
  })

  test('entitlements depend on credits, not card status', async () => {
    if (!isPg()) return
    expect(await runWithDatabaseContext(ctx(), () => hasEntitlement(ws, 'sandbox:run'))).toBe(true)
    expect(await runWithDatabaseContext(ctx(), () => hasEntitlement(ws, 'sso'))).toBe(false)
    await runWithDatabaseContext(ctx(), () => applyVerifiedPayment(payment(`bill_pay2_${suffix}`, 5), ws))
    expect(await runWithDatabaseContext(ctx(), () => hasEntitlement(ws, 'sso'))).toBe(true)
  })
})
