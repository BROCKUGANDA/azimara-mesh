// Atomic budget reservations (closes the concurrent-start TOCTOU gap).
//
// Starting work reserves budget inside one Postgres transaction. A transaction-
// scoped advisory lock serializes all reservation attempts for a workspace, so
// two concurrent starts cannot both pass the cap check. Reservations are
// idempotent by key, committed on success, and released on cancellation/failure.

import { monthStart } from '@/lib/metering'
import { db } from '@/lib/db'

/** Reservations require the Postgres consistency tables. SQLite deployments
 * keep the legacy best-effort budget checks and are unaffected. */
export function isDurableBudgetEnabled(): boolean {
  return /^postgres/i.test(process.env.DATABASE_URL ?? '')
}

export interface ReserveInput {
  workspaceId: string
  agentId?: string | null
  executionId: string
  idempotencyKey: string
  amountUsd: number
  workspaceCapUsd: number
  agentCapUsd?: number
}

export interface ReserveResult {
  ok: boolean
  reservationId?: string
  reason?: string
  reservedUsd?: number
}

/**
 * pg_advisory_xact_lock is released at transaction end and needs no extra
 * privilege. Hashing the workspace id keeps all attempts for a tenant on one
 * serialized lock while leaving other tenants free to proceed concurrently.
 */
async function lockWorkspace(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], workspaceId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`
}

export async function reserveBudget(input: ReserveInput): Promise<ReserveResult> {
  if (!Number.isFinite(input.amountUsd) || input.amountUsd < 0) {
    return { ok: false, reason: 'invalid amount' }
  }

  return db.$transaction(async (tx) => {
    await lockWorkspace(tx, input.workspaceId)

    // Idempotent replay: a repeated key returns the original reservation.
    const existing = await tx.budgetReservation.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    })
    if (existing) return { ok: true, reservationId: existing.id, reservedUsd: existing.amountUsd }

    const now = new Date()
    const spentAgg = await tx.usageEvent.aggregate({
      where: { workspaceId: input.workspaceId, recordedAt: { gte: monthStart(now) } },
      _sum: { costUsd: true },
    })
    const reservedAgg = await tx.budgetReservation.aggregate({
      where: { workspaceId: input.workspaceId, status: 'reserved' },
      _sum: { amountUsd: true },
    })
    const spent = spentAgg._sum.costUsd ?? 0
    const reserved = reservedAgg._sum.amountUsd ?? 0

    if (spent + reserved + input.amountUsd > input.workspaceCapUsd) {
      return {
        ok: false,
        reason: `Workspace budget cap reached: $${(spent + reserved).toFixed(2)} committed/reserved of $${input.workspaceCapUsd.toFixed(2)}`,
        reservedUsd: spent + reserved,
      }
    }

    if (input.agentId && input.agentCapUsd !== undefined) {
      const agentSpent = await tx.usageEvent.aggregate({
        where: { workspaceId: input.workspaceId, agentId: input.agentId, recordedAt: { gte: monthStart(now) } },
        _sum: { costUsd: true },
      })
      const agentReserved = await tx.budgetReservation.aggregate({
        where: { workspaceId: input.workspaceId, agentId: input.agentId, status: 'reserved' },
        _sum: { amountUsd: true },
      })
      const agentCommitted = (agentSpent._sum.costUsd ?? 0) + (agentReserved._sum.amountUsd ?? 0)
      if (agentCommitted + input.amountUsd > input.agentCapUsd) {
        return {
          ok: false,
          reason: `Agent budget exhausted: $${agentCommitted.toFixed(2)} committed/reserved of $${input.agentCapUsd.toFixed(2)}`,
          reservedUsd: agentCommitted,
        }
      }
    }

    const row = await tx.budgetReservation.create({
      data: {
        workspaceId: input.workspaceId,
        agentId: input.agentId ?? null,
        executionId: input.executionId,
        idempotencyKey: input.idempotencyKey,
        amountUsd: input.amountUsd,
        status: 'reserved',
      },
    })
    return { ok: true, reservationId: row.id, reservedUsd: spent + reserved + input.amountUsd }
  })
}

/** Commit a reservation into spent usage (idempotent, status-guarded). */
export async function commitReservation(idempotencyKey: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const row = await tx.budgetReservation.findUnique({ where: { idempotencyKey } })
    if (!row || row.status !== 'reserved') return
    await tx.budgetReservation.update({
      where: { idempotencyKey },
      data: { status: 'committed', settledAt: new Date() },
    })
  })
}

/** Release a reservation without charging (cancel/fail/overrun). */
export async function releaseReservation(idempotencyKey: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const row = await tx.budgetReservation.findUnique({ where: { idempotencyKey } })
    if (!row || row.status !== 'reserved') return
    await tx.budgetReservation.update({
      where: { idempotencyKey },
      data: { status: 'released', settledAt: new Date() },
    })
  })
}
