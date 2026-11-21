import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import { randomBytes } from 'node:crypto'
import { db, migrationDb } from '@/lib/db'
import { runWithDatabaseContext } from '@/lib/db-context'
import { writeEvent, publishPending, claimInboxMessage, markInboxProcessed } from '@/lib/outbox'
import { reserveBudget, commitReservation, releaseReservation } from '@/lib/budget-reservation'

const suffix = randomBytes(4).toString('hex')
const orgId = `dur_org_${suffix}`
const wsA = `dur_ws_${suffix}`
const isPg = () => /^postgres/i.test(process.env.DATABASE_URL ?? '')
const ctx = (ws: string) => ({ userId: 'test', workspaceId: ws, organizationId: orgId })

async function seedWorkspace(ws: string) {
  await migrationDb.workspace.create({
    data: { id: ws, organizationId: orgId, name: ws, slug: ws, monthlyBudget: 1000 },
  })
}

beforeAll(async () => {
  if (!isPg()) return
  await migrationDb.organization.create({ data: { id: orgId, name: 'Durability', slug: orgId } })
  await seedWorkspace(wsA)
})

afterAll(async () => {
  if (!isPg()) return
  await migrationDb.outboxEvent.deleteMany({ where: { workspaceId: wsA } })
  await migrationDb.inboxMessage.deleteMany({ where: { workspaceId: wsA } })
  await migrationDb.budgetReservation.deleteMany({ where: { workspaceId: wsA } })
  await migrationDb.workspace.deleteMany({ where: { id: wsA } })
  await migrationDb.organization.delete({ where: { id: orgId } })
  await migrationDb.$disconnect()
})

describe('transactional outbox', () => {
  test('event and mutation commit together', async () => {
    if (!isPg()) return
    const eventId = `evt_commit_${suffix}`
    await runWithDatabaseContext(ctx(wsA), () => db.$transaction(async (tx) => {
      await tx.notification.create({
        data: { workspaceId: wsA, kind: 'system', title: 'commit-test' },
      })
      await writeEvent(tx, {
        workspaceId: wsA,
        eventId,
        eventType: 'notification.created',
        aggregateType: 'Notification',
        aggregateId: 'commit-test',
      })
    }))
    const row = await migrationDb.outboxEvent.findUnique({ where: { eventId } })
    expect(row).not.toBeNull()
    expect(row?.eventType).toBe('notification.created')
  })

  test('event is rolled back with its transaction', async () => {
    if (!isPg()) return
    const eventId = `evt_rollback_${suffix}`
    try {
      await runWithDatabaseContext(ctx(wsA), () => db.$transaction(async (tx) => {
        await writeEvent(tx, {
          workspaceId: wsA,
          eventId,
          eventType: 'test.rollback',
          aggregateType: 'Test',
          aggregateId: 'x',
        })
        throw new Error('force rollback')
      }))
    } catch { /* expected */ }
    const row = await migrationDb.outboxEvent.findUnique({ where: { eventId } })
    expect(row).toBeNull()
  })

  test('publisher claims and marks events published', async () => {
    if (!isPg()) return
    const seen: string[] = []
    const count = await publishPending(100, async (event) => {
      if (event.workspaceId === wsA) seen.push(event.eventId)
    })
    expect(count).toBeGreaterThanOrEqual(1)
    expect(seen).toContain(`evt_commit_${suffix}`)
    const unpublished = await migrationDb.outboxEvent.count({
      where: { workspaceId: wsA, publishedAt: null },
    })
    expect(unpublished).toBe(0)
  })
})

describe('inbox dedupe', () => {
  test('duplicate delivery is claimed once', async () => {
    if (!isPg()) return
    const messageId = `msg_${suffix}`
    const first = await runWithDatabaseContext(ctx(wsA), () => claimInboxMessage({
      workspaceId: wsA, messageId, eventType: 'test.duplicate',
    }))
    const second = await runWithDatabaseContext(ctx(wsA), () => claimInboxMessage({
      workspaceId: wsA, messageId, eventType: 'test.duplicate',
    }))
    expect(first).toBe(true)
    expect(second).toBe(false)
    await runWithDatabaseContext(ctx(wsA), () => markInboxProcessed(messageId))
  })
})

describe('atomic budget reservation', () => {
  test('concurrent starts cannot both exceed the cap', async () => {
    if (!isPg()) return
    const keyA = `res_a_${suffix}`
    const keyB = `res_b_${suffix}`
    const [a, b] = await Promise.all([
      runWithDatabaseContext(ctx(wsA), () => reserveBudget({
        workspaceId: wsA,
        executionId: `exec_a_${suffix}`,
        idempotencyKey: keyA,
        amountUsd: 80,
        workspaceCapUsd: 100,
      })),
      runWithDatabaseContext(ctx(wsA), () => reserveBudget({
        workspaceId: wsA,
        executionId: `exec_b_${suffix}`,
        idempotencyKey: keyB,
        amountUsd: 80,
        workspaceCapUsd: 100,
      })),
    ])
    const oks = [a.ok, b.ok].filter(Boolean)
    expect(oks).toHaveLength(1)
    expect([a, b].filter((r) => !r.ok)[0]?.reason).toContain('cap')
  })

  test('reservation is idempotent by key', async () => {
    if (!isPg()) return
    const key = `res_idem_${suffix}`
    const input = {
      workspaceId: wsA,
      executionId: `exec_idem_${suffix}`,
      idempotencyKey: key,
      amountUsd: 1,
      workspaceCapUsd: 1000,
    }
    const first = await runWithDatabaseContext(ctx(wsA), () => reserveBudget(input))
    const second = await runWithDatabaseContext(ctx(wsA), () => reserveBudget(input))
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(second.reservationId).toBe(first.reservationId)
    const count = await migrationDb.budgetReservation.count({ where: { idempotencyKey: key } })
    expect(count).toBe(1)
  })

  test('commit and release settle reservations exactly once', async () => {
    if (!isPg()) return
    const keyCommit = `res_commit_${suffix}`
    const keyRelease = `res_release_${suffix}`
    await runWithDatabaseContext(ctx(wsA), () => reserveBudget({
      workspaceId: wsA, executionId: `e1_${suffix}`, idempotencyKey: keyCommit,
      amountUsd: 2, workspaceCapUsd: 1000,
    }))
    await runWithDatabaseContext(ctx(wsA), () => reserveBudget({
      workspaceId: wsA, executionId: `e2_${suffix}`, idempotencyKey: keyRelease,
      amountUsd: 3, workspaceCapUsd: 1000,
    }))
    await runWithDatabaseContext(ctx(wsA), () => commitReservation(keyCommit))
    await runWithDatabaseContext(ctx(wsA), () => commitReservation(keyCommit)) // idempotent
    await runWithDatabaseContext(ctx(wsA), () => releaseReservation(keyRelease))
    const committed = await migrationDb.budgetReservation.findUnique({ where: { idempotencyKey: keyCommit } })
    const released = await migrationDb.budgetReservation.findUnique({ where: { idempotencyKey: keyRelease } })
    expect(committed?.status).toBe('committed')
    expect(released?.status).toBe('released')
  })
})
