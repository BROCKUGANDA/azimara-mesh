# PRD coverage register

Status values: **Implemented** (works end-to-end with a test or demonstrable
code path) · **Partial** (real code, but scope or guarantee is limited) ·
**Simulated** (deterministic fixture, labelled in-product) · **Planned** (no
implementation) · **Unavailable** (explicitly out of scope for this release).

This register is the honest answer to "is everything in the master prompt
implemented?" — it is **no**, and this document says exactly where the line
is. The first commercial release is a coherent operating loop, not every P1/P2
capability in the specification.

---

## 1. Scope and release boundaries

| PRD capability | Status | Evidence / boundary |
|---|---|---|
| Organization, workspace, project, environment | Partial | Organizations, workspaces and environments are persisted. Projects are represented by fleets rather than a first-class entity. |
| Auth, sessions, RBAC | Implemented | `src/lib/auth.ts`, four roles with server-side `requireRole`; suspended users rejected per request. |
| Agent registry + versioned manifests | Implemented | `Agent`, `AgentVersion`; immutable version snapshots; `POST /api/agents` is transactional. |
| One real runtime integration + adapter interface | Partial | Managed in-process runtime only; `docs/architecture/AGENT_PROTOCOL.md` defines MAAI. No LangGraph/CrewAI adapter has an integration test. |
| Model gateway, one real adapter + labelled mock | Partial | Provider/model catalogue, routing, policy decisions, usage capture; `src/lib/model-gateway.ts`. External HTTP adapter is not enabled by default; simulated responses are labelled. |
| Tool registry + scoped credentials + deterministic auth | Implemented | Typed tool contracts, schema validation, policy gateway, redaction, output caps, injection scan — `src/lib/tool-runtime.ts`. |
| Durable execution lifecycle, cancel/timeout/retry | Partial | Checkpoints, cancellation, timeouts, bounded retry classification; in-process runner (no external durable queue). |
| Sequential + parallel orchestration | Implemented | `src/lib/workflow-engine.ts` — sequential, parallel fan-out/fan-in, conditions, bounded loops, approval, compensation. |
| Execution timeline and correlated logs/traces | Implemented | `ExecutionStep`, correlation/causation ids, execution detail view. |
| Policy checks before model/tool actions | Implemented | `src/lib/policy-engine.ts` invoked for model routing, tool calls, memory reads and deployments. |
| Per-agent and per-workspace budgets | Partial | Metered spend and hard checks at run start; concurrent-start reservation gap documented in `AUDIT_FIXES.md`. |
| Evaluation suites, repeatable runs | Implemented | Versioned datasets, deterministic evaluators, regression comparison — `src/lib/eval-engine.ts`. |
| Deployment and version rollback | Implemented | Environment-aware deployments, gates, approvals, rollback/suspend operations. |
| Audit events | Implemented | `src/lib/audit.ts`, append-only `AuditEvent`, UI audit centre. |
| Usage metering + entitlement-aware billing foundation | Partial | Idempotent usage events, subscriptions, plans, invoices; no live billing-provider integration. |
| Production-quality dashboard + design system | Implemented | 25 views; central token source; brand assets; accessibility notes. |

## 2. Functional requirements (section 2)

| PRD section | Status | Notes |
|---|---|---|
| 2.1 Org/workspace/access | Partial | Roles, membership, service identities, API-key metadata; no SSO/SCIM, ABAC or configurable role catalogue. |
| 2.2 Agent registry and manifests | Partial | Core fields and immutability yes; manifest import/clone/compare partially represented in UI. |
| 2.3 Agent Studio | Implemented | Multi-step configuration, draft/validate/sandbox/evaluate/compare/publish. |
| 2.4 Framework interoperability | Planned | Adapter contract documented; conformance suite not written; no third-party connector claimed. |
| 2.5 Model gateway | Partial | Profiles, connections, routing, usage, health; P1 routing/fallback/BYOK mostly planned. |
| 2.6 Tool registry / integration gateway | Partial | HTTP + internal + MCP-shaped contracts; real MCP server management planned. |
| 2.7 Workflow orchestration | Partial | P0 primitives implemented; durable external state, outbox and idempotent replay hardening outstanding. |
| 2.8 Agent-to-agent communication | Partial | `AgentMessage`, provenance fields, delegation caps; no signed transport or dedupe index. |
| 2.9 Runtime and deployment | Partial | Mesh-managed only; customer-managed gateway and Kubernetes planned. |
| 2.10 Memory and knowledge | Partial | Namespaces, provenance, classification, TTL, authorization-checked retrieval; no vector index. |
| 2.11 Observability / execution explorer | Implemented | Timelines, waterfall-style step data, policy decisions, redacted payloads. |
| 2.12 Evaluation Lab | Implemented | Datasets, cases, runs, comparisons, deterministic evaluators; model-judge explicitly not trusted as truth. |
| 2.13 Policies, approvals, autonomy | Partial | Deterministic engine, A0–A3, approvals bound to checkpoint; quorum and policy-as-code planned. |
| 2.14 Usage, cost, billing | Partial | Metering, caps, forecasts, invoices; billing provider abstraction present but no live processor. |
| 2.15 Developer platform | Partial | Versioned API and OpenAPI-style docs; TypeScript/Python SDK and CLI planned. |

## 3. Technical architecture

| Item | Status | Notes |
|---|---|---|
| Modular monolith with logical planes | Implemented | Documented and reflected in `src/lib` boundaries. |
| Transactional writes + outbox | Partial | Transactions used at key boundaries; no outbox/inbox table yet. |
| Versioned event envelope | Partial | Event model documented; `ExecutionStep`/`AuditEvent` carry correlation but no generic event bus. |
| Suggested domain entities | Partial | Most tenant-owned entities exist; projects and several P1 entities are absent. |
| Versioned REST API | Partial | `/api/v1`-style contracts documented; implementation routes are unversioned (`/api/...`). |

## 4. Security, trust, privacy

| Item | Status | Notes |
|---|---|---|
| Deny-by-default authorization | Implemented | Role guards on protected routes, fail-closed role validation. |
| Tenant isolation | Implemented* | Verified in code and hardened this pass; add automated cross-tenant integration suite (release gate still open). |
| Secret brokerage and redaction | Partial | Secret *references*, redaction in tool/execution output; no external secret manager. |
| Runtime sandboxing / egress controls | Planned | In-process runtime; no container isolation. |
| Kill switches | Partial | Cancel execution, pause agent, disable tool/provider, suspend workspace/deployment. |
| Retention and deletion workflows | Partial | Memory TTL/retention, audit append-only; no full data-class retention engine. |

\* "Implemented" here means controls exist in code; the automated tenant-isolation
test suite required by the PRD release gate is still outstanding.

## 5. Reliability and NFR

| Item | Status | Notes |
|---|---|---|
| SLOs / RPO / RTO | Planned | Documented as targets, not achieved metrics. |
| Bounded queries and pagination | Partial | `take` caps on list endpoints; no cursor pagination. |
| Retry/backoff/jitter/circuit breakers | Partial | Retry classification exists; no circuit breaker. |
| Backups and tested restore | Planned | Runbook written; restore not yet exercised in staging. |
| Self-monitoring / emergency view | Planned | Not implemented. |

## 6. Design system

| Item | Status | Notes |
|---|---|---|
| Brand assets and token source | Implemented | Editable SVGs, colour/typography/radius tokens, light and dark mapping. |
| Component catalogue | Partial | Reusable UI components present; Storybook not configured. |
| Motion specification | Implemented | Documented with reduced-motion support. |
| Accessibility | Partial | Semantic controls and focus states present; WCAG 2.2 AA audit not yet run. |
| Mesh graph visualisation | Partial | Canvas, node/edge rendering and charts implemented; minimap/keyboard nav planned. |

## 7. Screens

All named screens in section 7 exist under `src/views/` and are reachable from
the permission-aware shell. Where a screen surfaces a planned capability, it
shows an explicit empty/planning state rather than fabricated metrics.

## 8. Commercial

| Item | Status | Notes |
|---|---|---|
| Packaging hypothesis | Implemented (docs) | `docs/commercial/PRICING.md`; explicitly unvalidated. |
| Metering/billing docs | Implemented (docs) | `docs/commercial/METERING.md`, `BILLING_ARCHITECTURE.md`. |
| Live billing provider | Planned | Abstraction only. |

## 9–10. Implementation plan and quality gates

Phases 0–2 are substantially implemented; phase 3–5 are partially implemented;
phase 6–7 remain planned. The mandatory golden-path E2E suite, adversarial
suite, load/chaos tests and independent penetration test are **not complete** —
see `docs/engineering/TEST_STRATEGY.md`.

## 11. Required repository deliverables

All named documents exist under `docs/`, except the PRD's exact filenames
`AGENT_ADAPTER_INTERFACE.md`, `WORKFLOW_SPECIFICATION.md`, `API_SPECIFICATION.md`,
`INFORMATION_ARCHITECTURE.md`, `PRODUCT_VISION.md` etc. where this repository
uses equivalent names (see `docs/architecture/AGENT_PROTOCOL.md`,
`docs/engineering/API_SPECIFICATION.md`). They are documented rather than absent.

---

## Release-blocking gaps before commercial launch

1. Automated tenant-isolation integration suite (golden path 9).
2. Worker-crash recovery demonstration (golden path 10).
3. Budget reservation to close the concurrent-start TOCTOU.
4. Durable queue/outbox for execution and events.
5. Runtime sandboxing before accepting untrusted agents.
6. API-key authentication path and SDK/CLI.
7. Billing provider integration and tax/invoice handling.
8. WCAG 2.2 AA audit and independent penetration test.
9. Backup/restore exercise and measured SLO baseline.
10. Legal review of `LICENSE` and commercial terms.

None of these are hidden: each is tracked above and in the phase plan.

## Workstream 1 update (2026-11-20)

The commercial-readiness design is at
`docs/superpowers/specs/2026-11-20-azimara-mesh-commercial-readiness-design.md`.
Workstream 1 (PostgreSQL data foundation and tenant isolation) is implemented
as code and migrations but is **not yet cut over in production**:

- Prisma datasource is PostgreSQL with a separate migration URL.
- Baseline and RLS migrations exist under `prisma/migrations/`.
- Application queries run with transaction-local `set_config` claims; SQLite
  mode remains a no-op so the live deployment is unaffected.
- Tenant data tables are RLS-protected; identity/bootstrap tables remain under
  application authorization guards.
- CI provisions disposable PostgreSQL, applies migrations and runs 5 RLS
  integration tests with a non-owner role; all 5 pass against the VPS.
- A SQLite-to-PostgreSQL migration utility and Postgres-aware deploy guard exist
  but require rehearsal and explicit approval before live cutover.

Remaining Workstream 1 gates: production data migration dry run, backup/restore
verification, and actual service cutover.

## Workstream 1 update (2026-11-20)

The commercial-readiness design is at
`docs/superpowers/specs/2026-11-20-azimara-mesh-commercial-readiness-design.md`.
Workstream 1 (PostgreSQL data foundation and tenant isolation) has been
implemented as code and migrations but is **not yet cut over in production**:

- Prisma datasource is PostgreSQL with separate migration URL.
- Baseline and RLS migrations exist under `prisma/migrations/`.
- Application queries run with transaction-local `set_config` claims; SQLite
  mode remains a no-op so the live deployment is unaffected.
- Tenant data tables are RLS-protected; identity/bootstrap tables remain
  guarded by the application authorization layer.
- CI provisions disposable PostgreSQL, applies migrations, and runs 5 RLS
  integration tests with a non-owner role. All 5 pass.
- A SQLite-to-PostgreSQL migration utility and Postgres-aware deploy guard
  exist but require a rehearsal and explicit approval before live cutover.

Release-blocking gaps from this workstream: production data migration dry run,
backup/restore verification, and actual service cutover.


## Workstream 2 status (2026-11-21) — core complete, cutover staged

Implemented and CI-verified:
- OutboxEvent, InboxMessage, BudgetReservation models + RLS migration.
- Transactional outbox: domain mutation and event commit in one transaction
  (verified: rollback removes the event). Privileged publisher claims with
  FOR UPDATE SKIP LOCKED and marks rows published.
- Inbox dedupe by unique messageId (verified under duplicate delivery).
- Atomic budget reservations: pg_advisory_xact_lock serializes per workspace;
  reservation is idempotent by key; concurrent starts cannot both exceed the
  cap (verified: 1 of 2 wins at cap); commit/release settle exactly once.
- Reservations wired into startAgentRun, gated to Postgres so the live SQLite
  deployment is unchanged. Background runner now carries tenant RLS context.
- Event-bus abstraction with in-process default and opt-in NATS JetStream
  transport (eventId as msgID dedupe key).

Defined but NOT deployed to the live host (require capacity check + approval):
- deploy/services/compose.yaml: pinned Redis, NATS JetStream, Temporal +
  UI with a dedicated Postgres, resource limits and no-new-privileges.
- Temporal worker integration (workflowId = executionId, heartbeat checkpoints,
  cancellation signal) remains the next WS2 sub-slice; the in-process runner is
  still the active executor until that cutover is rehearsed.

Remaining WS2 gates: worker-crash recovery drill, duplicate/out-of-order event
drill against NATS, and a staging rehearsal before any live cutover.

