-- Approval quorum support. quorum defaults to 1 so existing behaviour is
-- unchanged; higher values require that many distinct approvers.
ALTER TABLE "Approval" ADD COLUMN IF NOT EXISTS "quorum" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "ApprovalDecision" (
    "id" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "note" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApprovalDecision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ApprovalDecision_approvalId_userId_key" UNIQUE ("approvalId", "userId")
);
CREATE INDEX "ApprovalDecision_approvalId_idx" ON "ApprovalDecision"("approvalId");

ALTER TABLE "ApprovalDecision" ENABLE ROW LEVEL SECURITY;
-- Approvals are workspace-scoped through their parent Approval row.
CREATE POLICY tenant_isolation ON "ApprovalDecision"
  USING (EXISTS (
    SELECT 1 FROM "Approval" a
    WHERE a."id" = "ApprovalDecision"."approvalId"
      AND app_workspace_matches(a."workspaceId")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Approval" a
    WHERE a."id" = "ApprovalDecision"."approvalId"
      AND app_workspace_matches(a."workspaceId")
  ));
