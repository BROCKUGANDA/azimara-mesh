# AZIMARA MESH — Data Model

Prisma + SQLite (`db/custom.db`). JSON payloads are text columns (`*Json`) parsed by
`jparse` helpers. ~40 models; the load-bearing ones:

## Tenancy & identity
- `Organization` (planTier, dataResidency) → `Workspace` (monthlyBudget,
  dataClassification) → everything else carries workspaceId.
- `User`, `Membership (userId, workspaceId, role)` — the RBAC source.
- `ServiceIdentity` (kind: workload|delegated|service_account, scopes, fingerprint,
  status, expiry) · `ApiKey` (prefix unique, SHA-256 hash, scopes, status).

## Registry
- `Agent` — identity, category, framework, runtimeType, autonomyLevel,
  currentVersion, modelConfigJson, toolPermissionsJson, memoryConfigJson,
  policyRefsJson, resourceLimitsJson, evalProfileJson, input/outputSchemaJson,
  systemPrompt, aggregates (successRate, avgLatencyMs, spendMonth, healthStatus).
- `AgentVersion` — immutable snapshots (unique agentId+version), diffSummaryJson,
  evalScore, publishedAt.
- `Fleet` + `FleetAgent` join; `Deployment` (environment, strategy, canaryPct,
  healthGate JSON, live errorRate/latencyP95/evalScore); `Environment`.
- `Workflow` (specJson: nodes/edges/budgets, version, status) · `Schedule`.

## Execution telemetry
- `Execution` — kind, pinned versions, parent link + delegationDepth, trigger,
  correlationId, status, input/output JSON, error, identitySubject, duration,
  tokens in/out, cost, toolCallCount, retryCount, budgetCapsJson, checkpointJson,
  isReplay. Indexes: workspace, agent, workflow, status, startedAt.
- `ExecutionStep` — seq (unique per execution), kind, nodeKey, status, detailJson,
  timestamps, durationMs → trace waterfall.
- `AgentMessage` — A2A envelope (sender/recipient, schemaVersion, correlationId,
  authContext, expiry, status).
- `ToolCall` — per-invocation record with redaction-on-read, policyDecisionId link.

## Intelligence
- `ModelProvider` / `Model` / `ModelConnection` (platform|byok, secretRef only).
- `PromptTemplate` · `MemoryNamespace` (kind, classification, allowedRoles,
  retentionDays) · `MemoryRecord` (classification ≤ namespace ceiling, provenance,
  ttlAt, score).

## Trust
- `Policy` (kind, effect, priority, rulesJson, appliesToJson, status) ·
  `PolicyDecision` (verdict + reason + full context JSON) · `Approval` (kind, risk,
  reviewer, expiry, decision) · `AuditEvent` (org-scoped, severity, actor, action,
  resource, detail, ip) · `SecurityIncident` (kind, severity, status, notes, links).

## Evaluation
- `EvalDataset` → `EvalCase` (input/expected JSON, evaluator, weight) →
  `EvalRun` (passRate, avgScore, latency, cost) → `EvalResult` (per-check evidence).

## Commercial & observability
- `UsageEvent` — kind (execution | token_in/out | tool_invocation | memory_read |
  storage | eval_case | agent_active), quantity, unitCost, costUsd,
  **idempotencyKey unique**, attribution (agent/model/tool/execution).
- `Plan` / `Subscription` / `Invoice` (lines JSON, credits, immutable once issued).
- `Notification` (kind, severity, linkView, readAt).

## Conventions
- Statuses are strings validated against constant tables in `src/lib/types.ts`
  (SQLite has no enums).
- Timestamps UTC; money as Float USD rounded to 4 decimals at write.
- All child rows carry workspaceId for tenant-scoped queries; audit events are
  organization-scoped.
