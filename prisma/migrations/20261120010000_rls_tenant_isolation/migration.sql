-- Tenant isolation at the database layer.
--
-- Identity/bootstrap tables (Organization, Workspace, User, Membership,
-- Environment, ModelProvider, Model, Plan) are intentionally NOT in RLS. They
-- are reached before a workspace is known (login, membership resolution) and
-- are guarded by the application authorization layer. Every tenant-owned DATA
-- table is in RLS. The `mesh_app` role is not the table owner and has no
-- BYPASSRLS, so it cannot escape these policies.
--
-- Claims are set transaction-locally by src/lib/db.ts via set_config(..., true).
-- Missing claims resolve to '' and therefore match no rows (fail closed).

CREATE OR REPLACE FUNCTION app_workspace_matches(ws TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT ws = current_setting('app.workspace_id', true)
$$;

CREATE OR REPLACE FUNCTION app_organization_matches(org TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT org = current_setting('app.organization_id', true)
$$;

-- Direct workspace-scoped tables ---------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ServiceIdentity', 'ApiKey', 'Deployment', 'Agent', 'Fleet', 'Workflow',
    'Schedule', 'Execution', 'AgentMessage', 'ModelConnection', 'PromptTemplate',
    'MemoryNamespace', 'Tool', 'Integration', 'Policy', 'PolicyDecision',
    'Approval', 'SecurityIncident', 'EvalDataset', 'EvalRun', 'UsageEvent',
    'Subscription', 'Invoice', 'Notification'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (app_workspace_matches("workspaceId")) WITH CHECK (app_workspace_matches("workspaceId"))',
      t
    );
  END LOOP;
END $$;

-- Audit events may be organization-scoped when workspaceId is null.
ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AuditEvent"
  USING (
    app_workspace_matches("workspaceId")
    OR ("workspaceId" IS NULL AND app_organization_matches("organizationId"))
  )
  WITH CHECK (
    app_workspace_matches("workspaceId")
    OR ("workspaceId" IS NULL AND app_organization_matches("organizationId"))
  );

-- Parent-derived tables -------------------------------------------------------
ALTER TABLE "AgentVersion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AgentVersion"
  USING (EXISTS (
    SELECT 1 FROM "Agent" a
    WHERE a."id" = "AgentVersion"."agentId"
      AND app_workspace_matches(a."workspaceId")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Agent" a
    WHERE a."id" = "AgentVersion"."agentId"
      AND app_workspace_matches(a."workspaceId")
  ));

ALTER TABLE "ExecutionStep" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ExecutionStep"
  USING (EXISTS (
    SELECT 1 FROM "Execution" e
    WHERE e."id" = "ExecutionStep"."executionId"
      AND app_workspace_matches(e."workspaceId")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Execution" e
    WHERE e."id" = "ExecutionStep"."executionId"
      AND app_workspace_matches(e."workspaceId")
  ));

ALTER TABLE "ToolCall" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ToolCall"
  USING (EXISTS (
    SELECT 1 FROM "Execution" e
    WHERE e."id" = "ToolCall"."executionId"
      AND app_workspace_matches(e."workspaceId")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Execution" e
    WHERE e."id" = "ToolCall"."executionId"
      AND app_workspace_matches(e."workspaceId")
  ));

ALTER TABLE "MemoryRecord" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MemoryRecord"
  USING (EXISTS (
    SELECT 1 FROM "MemoryNamespace" n
    WHERE n."id" = "MemoryRecord"."namespaceId"
      AND app_workspace_matches(n."workspaceId")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "MemoryNamespace" n
    WHERE n."id" = "MemoryRecord"."namespaceId"
      AND app_workspace_matches(n."workspaceId")
  ));

ALTER TABLE "EvalCase" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EvalCase"
  USING (EXISTS (
    SELECT 1 FROM "EvalDataset" d
    WHERE d."id" = "EvalCase"."datasetId"
      AND app_workspace_matches(d."workspaceId")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "EvalDataset" d
    WHERE d."id" = "EvalCase"."datasetId"
      AND app_workspace_matches(d."workspaceId")
  ));

ALTER TABLE "EvalResult" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EvalResult"
  USING (EXISTS (
    SELECT 1 FROM "EvalRun" r
    WHERE r."id" = "EvalResult"."runId"
      AND app_workspace_matches(r."workspaceId")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "EvalRun" r
    WHERE r."id" = "EvalResult"."runId"
      AND app_workspace_matches(r."workspaceId")
  ));

ALTER TABLE "FleetAgent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FleetAgent"
  USING (EXISTS (
    SELECT 1 FROM "Fleet" f
    WHERE f."id" = "FleetAgent"."fleetId"
      AND app_workspace_matches(f."workspaceId")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Fleet" f
    WHERE f."id" = "FleetAgent"."fleetId"
      AND app_workspace_matches(f."workspaceId")
  ));

-- Prevent cross-workspace parent-child links at the data layer too.
CREATE UNIQUE INDEX "Agent_id_workspaceId_key" ON "Agent"("id", "workspaceId");
ALTER TABLE "Deployment"
  ADD CONSTRAINT "Deployment_agent_same_workspace" FOREIGN KEY ("agentId", "workspaceId")
  REFERENCES "Agent"("id", "workspaceId") ON DELETE RESTRICT;
