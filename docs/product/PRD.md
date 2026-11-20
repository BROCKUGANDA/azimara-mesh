# AZIMARA MESH — PRD (implementation-status edition)

This PRD reflects the **actual current build** (single-node governed runtime deployed in
this repository) plus the remaining roadmap. Every requirement is marked:
**SHIPPED** (implemented and verified in this build), **PARTIAL** (implemented with
documented limitations) or **ROADMAP** (designed, not yet implemented).

## 1. Multi-tenancy and tenancy boundaries — SHIPPED
- Organization → Workspace → Environment → Agent → Deployment → Execution hierarchy.
- Every API request resolves the caller's membership role for the target workspace;
  non-members receive 403 before any data is read.
- Workspaces carry data-classification ceilings and monthly spend caps.
- Cross-tenant access tests: `requireWorkspaceAccess` rejects unknown membership (API
  layer); production hardening (row-level security on Postgres, dedicated schemas) is
  ROADMAP.

## 2. Universal agent registry — SHIPPED
- Agents with stable IDs, slugs, categories, frameworks (azimara-native, langgraph,
  crewai, openai-agents, mcp-client), runtime type, owners, fleets.
- Registration via console (Agent Studio) and REST (`POST /api/agents`). SDK/CLI are
  documented in the Developer Portal (thin clients over the same REST surface);
  packaged SDK artifacts are ROADMAP.
- Full lifecycle state machine enforced server-side:
  DRAFT → VALIDATING → TESTING → READY → DEPLOYING → HEALTHY/DEGRADED → PAUSED →
  FAILED → SCALING → ROLLING_BACK → RETIRING → ARCHIVED. Invalid transitions are
  rejected with typed errors; every transition writes an audit event.

## 3. Version management — SHIPPED
- Immutable version snapshots (prompt, tools, autonomy, model config, limits) with
  diff summaries, changelogs and eval scores. Publishing pins a version; executions
  store the version they started with. Rollback flips the pointer and marks state
  ROLLING_BACK with an audit trail.

## 4. Fleets — SHIPPED
- Fleet grouping, owners, budgets, concurrency caps; fleet-wide pause/resume evaluates
  each agent's state before mutation; rollout/rollback walk published versions.

## 5. Workflow engine — SHIPPED (PARTIAL durability)
- Recursive DAG executor: sequential, parallel fan-out/fan-in, conditions with labeled
  branches, human approval checkpoints, bounded loops, delays, compensation hooks,
  error boundaries (fail / continue / compensate).
- Governance interlock: when a child agent pauses on an approval gate, the whole
  workflow pauses (checkpointed) and resumes after the decision.
- Validation: duplicate keys, unknown edge endpoints, exactly-one input node,
  reachability, bounded-loop enforcement.
- Durable state = per-step checkpoints in SQLite. Single-node durability only; NATS/
  Temporal-class backends are ROADMAP.

## 6. Execution engine — SHIPPED (PARTIAL isolation)
- Bounded runs: max steps, timeout, cost cap, delegation depth, per-tool dedup.
- Identity: per-agent workload identities, distinguishable from owner/operator.
- Pipeline: input validation → context assembly → authorization-checked memory
  retrieval → policy-checked model routing (with fallback chain) → tool loop →
  delegation → evaluation gate → output.
- Approval gates pause executions; decisions resume them with the approved tool call.
- Cancellation, timeout classification, dead-letter/retryable flags, safe replay
  (side-effecting tools skipped, replay marked in telemetry).
- Runtime isolation is process-level (sandboxed deterministic adapters, external egress
  disabled). Container/microVM isolation is ROADMAP.

## 7. Model gateway — SHIPPED
- Provider registry (Azimara Runtime, GLM, OpenAI, Anthropic, Google, Bedrock, Azure,
  Ollama) with health, latency, pricing and capability metadata; BYOK connections with
  vault-style secret references (raw keys never rendered).
- Policy-checked routing with fallback chain; token metering and cost estimation;
  real LLM calls supported through the GLM provider connection; deterministic runtime
  is the default for evaluation and offline safety.

## 8. Tools & integrations — SHIPPED
- Registry with input/output JSON schemas, auth method, risk + data class, rate
  limits, timeouts, approval flags, health counters.
- Invocation path: schema validation → deterministic policy → adapter → output
  validation → secret redaction → prompt-injection scan → size limits → metering.
- Internal tools execute real platform operations; external connectors run sandboxed
  deterministic adapters in this deployment (egress disabled by policy) — live
  connector execution is ROADMAP pending customer credential brokerage.

## 9. Memory — SHIPPED
- Namespace kinds: working, episodic, semantic, shared, longterm; classifications;
  retention TTL; poisoning detection on write; authorization-checked retrieval
  (declared-scope + classification rules) with denials audited as policy decisions.

## 10. Trust plane — SHIPPED
- Deterministic policy engine: deny-wins, approval, allow; rules over tool risk, data
  class, environment, cost, provider, hour; applies-to scoping; full "why" evidence.
- RBAC (owner/admin/operator/viewer) enforced per route; autonomy levels A0–A3 with
  server-side guards (A3 requires admin).
- Human approvals with expiry, notes, named deciders, audit records; execution resume.
- Security Center: incident classes (prompt injection, permission violation, cost
  anomaly, repeated failure), severity model, investigation notes, agent/tool
  suspension, workspace emergency stop — monitoring continues while agents are paused.

## 11. Observability & evaluation — SHIPPED
- Overview command center: every metric computed from backend records, all clickable.
- Execution Center with trace waterfall, redacted tool payloads, policy evidence.
- Evaluation Lab: deterministic datasets/cases (contains, forbidden patterns, format,
  refusal scan, latency bounds), run history, version comparisons.
- Model-judge scoring: ROADMAP (requires documented methodology and calibrated sets).

## 12. Commercial — SHIPPED (PARTIAL payments)
- Plans (Community/Builder/Team/Enterprise), subscription, seats, spend caps,
  idempotent usage events, monthly invoices with line items and credit deduction,
  plan change guards.
- Payment-provider integration (Stripe-class) is ROADMAP; invoices are generated and
  stored but not charged.

## 13. Enterprise readiness — ROADMAP
- SSO (SAML/OIDC), SCIM, audit-retention exports, dedicated runtime pools, custom SLAs,
  private deployments. UI surfaces these as Enterprise-tier roadmap items explicitly.

## Out of scope for this build
- Marketplace (Phase 6+ per master directive), multi-region recovery, chaos testing,
  independent penetration testing.
