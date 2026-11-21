-- Durable consistency primitives (Workstream 2).
-- Transactional outbox, inbox dedupe and atomic budget reservations.
-- All three tables are RLS-scoped by workspaceId; claims are set by
-- src/lib/db.ts on the same transaction that performs the work.

CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL DEFAULT '',
    "causationId" TEXT,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OutboxEvent_eventId_key" UNIQUE ("eventId")
);

CREATE TABLE "InboxMessage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    CONSTRAINT "InboxMessage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InboxMessage_messageId_key" UNIQUE ("messageId")
);

CREATE TABLE "BudgetReservation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT,
    "executionId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    CONSTRAINT "BudgetReservation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BudgetReservation_idempotencyKey_key" UNIQUE ("idempotencyKey")
);

CREATE INDEX "OutboxEvent_workspaceId_publishedAt_idx" ON "OutboxEvent"("workspaceId", "publishedAt");
CREATE INDEX "OutboxEvent_eventType_idx" ON "OutboxEvent"("eventType");
CREATE INDEX "InboxMessage_workspaceId_processedAt_idx" ON "InboxMessage"("workspaceId", "processedAt");
CREATE INDEX "BudgetReservation_workspaceId_status_idx" ON "BudgetReservation"("workspaceId", "status");
CREATE INDEX "BudgetReservation_executionId_idx" ON "BudgetReservation"("executionId");

-- RLS: tenant-scoped data tables.
ALTER TABLE "OutboxEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OutboxEvent"
  USING (app_workspace_matches("workspaceId"))
  WITH CHECK (app_workspace_matches("workspaceId"));

ALTER TABLE "InboxMessage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "InboxMessage"
  USING (app_workspace_matches("workspaceId"))
  WITH CHECK (app_workspace_matches("workspaceId"));

ALTER TABLE "BudgetReservation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BudgetReservation"
  USING (app_workspace_matches("workspaceId"))
  WITH CHECK (app_workspace_matches("workspaceId"));
