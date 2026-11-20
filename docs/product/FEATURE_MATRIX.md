# AZIMARA MESH — Feature Matrix

Status legend: ✅ shipped and verified in this build · 🟡 shipped with documented
limitations · 🗺️ designed, roadmap.

| # | Feature | Status | Evidence |
|---|---------|--------|----------|
| 1 | Organization / workspace management | ✅ | Workspace switcher, per-workspace budgets + data-class ceilings |
| 2 | Session auth + RBAC (owner/admin/operator/viewer) | ✅ | HMAC cookie sessions, scrypt passwords, role guards on every route |
| 3 | Agent registry (multi-framework) | ✅ | 10 seeded agents across 5 frameworks; REST + Studio creation |
| 4 | Lifecycle state machine | ✅ | Server-side transition table, audit per transition |
| 5 | Immutable versioning + rollback | ✅ | Snapshots, diffs, publish/rollback endpoints |
| 6 | Fleets (budgets, pause/resume, rollout) | ✅ | Fleet API + UI cards |
| 7 | Workflow engine (DAG, parallel, conditions) | ✅ | 3 published workflows; live fan-out verified |
| 8 | Approval checkpoints (agent + workflow level) | ✅ | Refund gate pause → approve → resume verified E2E |
| 9 | Bounded loops / delegation depth | ✅ | maxIterationsPerNode, depth caps enforced |
| 10 | Compensation / error boundaries | ✅ | onError: fail / continue / compensate |
| 11 | Execution engine with checkpoints | ✅ | Per-step persistence; resume from checkpoint |
| 12 | Policy engine (deny/allow/require_approval) | ✅ | 8 seeded policies; simulation with evidence |
| 13 | Policy "why" panel | ✅ | Verdict shows matched rules + reason string |
| 14 | Human approval workflows | ✅ | Approvals list, decision endpoint, notifications |
| 15 | Autonomy levels A0–A3 | ✅ | Studio + agent config; A3 admin-guarded |
| 16 | Model gateway with fallback chain | ✅ | Route + invoke with health checks |
| 17 | BYOK connections (secret refs) | ✅ | Connect/test/disconnect; secrets never rendered |
| 18 | Token + cost metering (idempotent) | ✅ | UsageEvent unique keys; per-model attribution |
| 19 | Tool registry (schemas, risk, health) | ✅ | 11 tools; call counters; sandboxed test endpoint |
| 20 | Tool invocation defense (validation/redaction/injection scan) | ✅ | tool-runtime checks on every call |
| 21 | Memory namespaces with auth-checked retrieval | ✅ | Retrieval-test UI demonstrates denial paths |
| 22 | Poisoning detection on memory writes | ✅ | Rejected patterns in memory.write |
| 23 | Trace waterfall + redaction | ✅ | Execution Center |
| 24 | Live execution monitor + polling | ✅ | 2.5–4s pollers while active |
| 25 | Safe replay (side effects suppressed) | ✅ | isReplay flag + tool skip logic |
| 26 | Cancellation + timeout classification | ✅ | Cancel endpoint; timed_out state |
| 27 | Evaluation Lab (deterministic) | ✅ | 3 datasets, 9 cases, run history + comparison |
| 28 | Model-judge scoring | 🗺️ | Requires documented methodology |
| 29 | Security Center + emergency stop | ✅ | Incident classes, suspension controls |
| 30 | Audit trail (org-wide, queryable) | ✅ | Audit Center with filters |
| 31 | Usage & costs breakdowns + forecast | ✅ | By agent/model/tool/kind + daily series |
| 32 | Subscription + invoices from usage | ✅ | Previous-month invoice built from real usage events |
| 33 | Payment-provider charging | 🗺️ | Invoices generated, not charged |
| 34 | Developer portal (REST/SDK/CLI docs) | ✅ | In-app portal with snippets |
| 35 | Packaged SDKs / CLI binaries | 🗺️ | Thin REST clients documented first |
| 36 | SSO / SCIM | 🗺️ | Enterprise tier roadmap (surfaced honestly in UI) |
| 37 | Visual Agent Studio (canvas + code-first) | ✅ | Drag nodes, connect, inspect, validate, test run |
| 38 | Durable workflow backends (Temporal/NATS) | 🗺️ | SQLite checkpoints today |
| 39 | Container/microVM execution isolation | 🗺️ | Sandboxed adapters today |
| 40 | Marketplace | 🗺️ | Phase 6+ per directive |
