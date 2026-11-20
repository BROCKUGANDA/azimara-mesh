# AZIMARA MESH — Production Readiness

Verdict: **NOT production-ready — pilot-ready.** This build is a complete,
governed, browser-verified single-node platform suitable for design-partner pilots
on non-critical workloads. Every gap below is deliberate, documented, and surfaced
in-product rather than hidden.

## What is ready (evidence-verified in this build)
- Full control plane: registry, versions, fleets, deployments, schedules.
- Governed execution: bounded runs, policy-checked tools/models/memory, approval
  gates with pause/resume (agent AND workflow level), safe replay, cancellation.
- Deterministic policy engine with evidence ("why" panels, simulation API).
- RBAC/ABAC, workload identities, API keys (hashed), approvals with expiry.
- Observability: trace waterfall, redaction, audit trail, notifications.
- Evaluation Lab (deterministic), usage metering (idempotent), invoices.
- Security monitoring + emergency controls. Brand + design system + 25 views,
  responsive, browser-verified golden paths.

## Blocks to production GA (in order)
1. **Durable backends** — Postgres (+RLS), Redis, NATS/Temporal; replace in-process
   runners so worker termination resumes rather than loses work. *(largest gap)*
2. **Execution isolation** — container/microVM (gVisor-class) per run; current
   adapters are sandboxed-by-egress, not kernel-isolated.
3. **Real provider credentials** — vault brokerage with leases; BYOK test flow
   exists, actual key custody does not.
4. **Formal test suite in CI** — vitest API/engine suites, multi-tenant isolation
   tests, adversarial matrix, load + chaos (needs #1).
5. **Security program** — dependency scanning, dependency verification, signed
   workload tokens, independent penetration test.
6. **SSO/SCIM + audit export bundles** for enterprise tenants.
7. **Payments** — provider integration + dunning (metering/invoicing already real).
8. **DR drills** — backups + restore tests per DISASTER_RECOVERY.md; then, and only
   then, publish availability objectives.

## Pilot entry criteria (met)
Seeded demo org with labelled sample data · golden paths verified end-to-end ·
approval gates proven · audit evidence complete · runbook for deploy/verify.

## Definition of done tracker (directive §XVII)
| # | Capability | Status |
|---|---|---|
| 1–3 | Register/manage agents · deploy frameworks · coordinate workflows | ✅ |
| 4 | Scoped identities & permissions | ✅ |
| 5 | Isolated execution environments | 🟡 logical isolation; kernel isolation roadmap |
| 6 | Secure external tool invocation | 🟡 sandboxed adapters; live egress roadmap |
| 7 | Durable execution state | 🟡 per-step checkpoints; durable queue roadmap |
| 8 | Prevent unbounded delegation | ✅ |
| 9 | Monitor every significant step | ✅ |
| 10 | Evaluate quality & safety | ✅ deterministic; model-judge pending methodology |
| 11–13 | Memory · spend control · version/rollback | ✅ |
| 14 | Handle failures & provider outages | ✅ within single-node scope |
| 15–16 | Human approvals · audit evidence | ✅ |
| 17 | Isolate customer organizations | ✅ app-level; RLS roadmap |
| 18 | Meter & bill accurately | ✅ metering+invoices; charging roadmap |
| 19 | Recover from tested infrastructure failures | 🗺️ needs durable backends |
| 20 | Support real customer deployments | 🗺️ pilot stage |
