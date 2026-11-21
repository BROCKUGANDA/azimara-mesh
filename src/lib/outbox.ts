// Transactional outbox + inbox dedupe.
//
// A state change and its event are committed in one database transaction. A
// privileged publisher claims unpublished rows with FOR UPDATE SKIP LOCKED and
// hands them to a sink. Consumers dedupe by stable messageId through the inbox
// table. Event delivery is at-least-once; sinks/consumers must be idempotent.

import { randomUUID } from 'node:crypto'
import { db, migrationDb } from '@/lib/db'
import { getEventBus } from '@/lib/event-bus'
import type { Prisma } from '@prisma/client'

export interface DomainEvent {
  eventId?: string
  workspaceId: string
  eventType: string
  aggregateType: string
  aggregateId: string
  correlationId?: string
  causationId?: string | null
  schemaVersion?: number
  data?: Record<string, unknown>
}

export interface OutboxRow {
  id: string
  eventId: string
  workspaceId: string
  eventType: string
  schemaVersion: number
  aggregateType: string
  aggregateId: string
  correlationId: string
  causationId: string | null
  payloadJson: string
  occurredAt: Date
  attempts: number
}

/**
 * Write a domain event within the caller's interactive transaction. The caller
 * must perform the related mutation through the SAME transaction client so the
 * event and mutation commit atomically.
 */
export async function writeEvent(tx: Prisma.TransactionClient, event: DomainEvent): Promise<string> {
  const eventId = event.eventId ?? randomUUID()
  await tx.outboxEvent.create({
    data: {
      workspaceId: event.workspaceId,
      eventId,
      eventType: event.eventType,
      schemaVersion: event.schemaVersion ?? 1,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      correlationId: event.correlationId ?? '',
      causationId: event.causationId ?? null,
      payloadJson: JSON.stringify(event.data ?? {}),
    },
  })
  return eventId
}

export type EventSink = (event: OutboxRow) => Promise<void>

/**
 * Publish a batch of pending events. Runs with the migration/owner role so it
 * can scan all workspaces; this is a privileged background component and must
 * never be reachable from a request. Claims rows with SKIP LOCKED so multiple
 * publishers can run without double-processing a row.
 */
export async function publishPending(limit = 50, sink: EventSink): Promise<number> {
  return migrationDb.$transaction(async (tx) => {
    const claimed = await tx.$queryRaw<OutboxRow[]>`
      SELECT * FROM "OutboxEvent"
      WHERE "publishedAt" IS NULL
      ORDER BY "occurredAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `
    for (const event of claimed) {
      try {
        await sink(event)
        await tx.outboxEvent.update({
          where: { id: event.id },
          data: { publishedAt: new Date() },
        })
      } catch (err) {
        await tx.outboxEvent.update({
          where: { id: event.id },
          data: { attempts: { increment: 1 }, lastError: err instanceof Error ? err.message.slice(0, 500) : 'unknown' },
        })
      }
    }
    return claimed.length
  })
}

/**
 * Record an incoming message once. Returns true if it is new (should be
 * processed) or false if it was already delivered. Duplicate delivery is safe:
 * the unique messageId is the dedupe key.
 */
export async function claimInboxMessage(input: {
  workspaceId: string
  messageId: string
  eventType: string
  payload?: Record<string, unknown>
}): Promise<boolean> {
  const result = await db.inboxMessage.createMany({
    data: [{
      workspaceId: input.workspaceId,
      messageId: input.messageId,
      eventType: input.eventType,
      payloadJson: JSON.stringify(input.payload ?? {}),
    }],
    skipDuplicates: true,
  })
  return result.count === 1
}

/** Publish a batch using the configured transport (in-process by default). */
export async function publishWithConfiguredBus(limit = 50): Promise<number> {
  const bus = await getEventBus()
  return publishPending(limit, async (event) => {
    let payload: Record<string, unknown> = {}
    try { payload = JSON.parse(event.payloadJson) as Record<string, unknown> } catch { /* keep empty */ }
    await bus.publish({
      eventId: event.eventId,
      workspaceId: event.workspaceId,
      eventType: event.eventType,
      payload,
      correlationId: event.correlationId,
    })
  })
}

export async function markInboxProcessed(messageId: string, error?: string): Promise<void> {
  await db.inboxMessage.update({
    where: { messageId },
    data: {
      processedAt: error ? null : new Date(),
      attempts: { increment: 1 },
      lastError: error?.slice(0, 500) ?? null,
    },
  })
}
