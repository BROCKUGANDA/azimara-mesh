# AZIMARA MESH — Test Strategy

## What is verified in this build
1. **Static contracts** — strict TypeScript across engines/API/UI (`tsc --noEmit`
   clean), ESLint clean (0 errors).
2. **Golden-path E2E (browser-verified)** — login → overview → fleet → agent detail →
   Run now → Execution Center → trace waterfall → policy evidence; approval gate
   round-trip (refund → pause → approve → resume); workflow fan-out with governed
   pause; eval suite execution; policies simulator; security center; billing;
   mobile viewport.
3. **Engine-level verification via API** — every engine exercised over HTTP during
   development: agent run (multi-turn tool loop), approval pause/resume (agent +
   workflow propagation), workflow validation errors, eval run scoring, policy
   denials (restricted-provider lock), budget checks, metering aggregation,
   invoice build.
4. **Deterministic data** — seeded telemetry uses a fixed PRNG (mulberry32) so
   dashboards and comparisons are reproducible.

## Test layers (directive §53) — status
| Layer | Status | Notes |
|---|---|---|
| Unit | 🟡 partial | Engines are pure where possible (policy rules, expression evaluator, redaction, schema validation); formal test runner (vitest) is roadmap |
| API | ✅ exercised | All ~25 route groups called during verification; formal suite roadmap |
| Database | ✅ schema | Prisma push + unique constraints verified (compound keys, idempotency) |
| Workflow integration | ✅ exercised | fan-out, conditions, approval pause/resume, compensation path |
| Runtime integration | ✅ exercised | bounded loops, dedup, timeout classification, replay suppression |
| Provider tests | 🟡 | GLM provider call path with fallback; deterministic runtime default |
| Multi-tenant isolation | ✅ core | membership guard on every route; RLS on Postgres = roadmap |
| Agent communication | ✅ exercised | delegation depth, scope inheritance, dedup |
| Evaluation regression | ✅ shipped | datasets + run comparison in product |
| Adversarial | 🟡 | injection-pattern scans, schema violations, cost runaway implemented; full matrix = roadmap |
| Load / chaos | 🗺️ | requires production topology first |
| End-to-end product | ✅ browser | agent-browser verification loop performed |

## Required abuse/security tests (§54) — coverage
Implemented: unauthorized access (403), undeclared tool access (policy deny),
forged approval (pending-only + expiry), prompt injection via tool output (scan +
incident), secret exposure (redaction layers), cross-tenant memory access (declared
scope), privilege escalation (role gates + A3 admin guard), excessive execution
(budget caps), runaway tokens (per-run cost cap).
Roadmap: replay attacks (signed nonces), malicious dependency/plugin/package
scanning, forged agent identity (HMAC workload tokens), comprehensive exfiltration
detection.

## Acceptance checklist per feature (§55)
Expected behavior, permission boundaries, invalid input handling, failure handling,
resource cleanup (retention purge, cancelled executions), audit generation, usage
attribution — each shipped feature documents its evidence in FEATURE_MATRIX.md.
No placeholder implementation is presented as production integration: simulated
adapters are labelled in traces and docs.
