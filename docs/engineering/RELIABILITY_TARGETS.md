# AZIMARA MESH — Reliability Targets

These are **internal engineering objectives**, not claims about existing performance
(directive §57). Nothing below has been measured in production because this build has
no production deployment yet.

## Objectives for the production platform
1. **99.9% control-plane monthly availability** — console, registry, policy reads.
2. **99.9% accepted-workflow scheduling availability** — runs accepted into the
   durable queue are never silently lost.
3. **No silent loss of durable execution state** — every accepted run has a
   checkpoint; worker loss resumes or dead-letters visibly.
4. **Complete execution correlation** — correlationId spans parent/child delegations
   end-to-end (already implemented and exercised).
5. **Reliable tenant authorization** — every request membership-checked (implemented);
   formal isolation test suite on Postgres RLS = roadmap.
6. **Controlled execution budgets** — caps enforced pre-launch and per-run
   (implemented).
7. **Verifiable recovery from worker termination** — requires the durable queue
   (Temporal/NATS) before it can be tested; current in-process runners recover
   nothing on process death (documented honestly).

## Current single-node reality
| Objective | Status |
|---|---|
| Correlation, budgets, authorization, checkpointed steps | ✅ implemented |
| Availability % | ⛔ not measurable — no production deployment |
| Worker-termination recovery | 🗺️ needs durable backend |
| RPO/RTO | undefined until backends exist; SQLite file backup is the only recovery unit today |

## Before selling availability commitments we must document
RPO/RTO targets per store · recovery regions · backup restoration drills ·
operational ownership and on-call model · chaos test results · load test results.
None of these exist yet — which is exactly why no SLA is claimed anywhere in the
product or marketing surface.

## Measured in this build (dev environment, indicative only)
- Engine round-trips: agent run ≈ 0.2–7s; approval resume < 1s; workflow fan-out ≈ 7s.
- API p95 well under 100ms for list endpoints on seeded data (~63 executions,
  40+ audit events per query).
These numbers are development observations, not SLOs.
