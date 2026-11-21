-- Onchain billing ledger (Base EVM USDC). Replaces the card-processor model.
CREATE TABLE "OnchainPayment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "payer" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "destination" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OnchainPayment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OnchainPayment_signature_key" UNIQUE ("signature")
);
CREATE INDEX "OnchainPayment_workspaceId_idx" ON "OnchainPayment"("workspaceId");
CREATE INDEX "OnchainPayment_status_idx" ON "OnchainPayment"("status");

CREATE TABLE "CreditLedgerEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "kind" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "balanceAfterUsd" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditLedgerEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CreditLedgerEntry_workspaceId_kind_reference_key" UNIQUE ("workspaceId", "kind", "reference")
);
CREATE INDEX "CreditLedgerEntry_workspaceId_createdAt_idx" ON "CreditLedgerEntry"("workspaceId", "createdAt");

CREATE TABLE "UsageSettlement" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "usageUsd" DOUBLE PRECISION NOT NULL,
    "creditsAppliedUsd" DOUBLE PRECISION NOT NULL,
    "remainingUsd" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "onchainSignature" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsageSettlement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UsageSettlement_workspaceId_periodStart_key" UNIQUE ("workspaceId", "periodStart")
);
CREATE INDEX "UsageSettlement_workspaceId_status_idx" ON "UsageSettlement"("workspaceId", "status");

ALTER TABLE "OnchainPayment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OnchainPayment"
  USING (app_workspace_matches("workspaceId"))
  WITH CHECK (app_workspace_matches("workspaceId"));

ALTER TABLE "CreditLedgerEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CreditLedgerEntry"
  USING (app_workspace_matches("workspaceId"))
  WITH CHECK (app_workspace_matches("workspaceId"));

ALTER TABLE "UsageSettlement" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "UsageSettlement"
  USING (app_workspace_matches("workspaceId"))
  WITH CHECK (app_workspace_matches("workspaceId"));
