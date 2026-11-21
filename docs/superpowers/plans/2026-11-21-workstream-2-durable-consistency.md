# Workstream 2 — Durable consistency primitives plan

Parent: `docs/superpowers/specs/2026-11-20-azimara-mesh-commercial-readiness-design.md`
Depends on: Workstream 1 (Postgres + RLS), complete and CI-verified.

## Scope
Add the consistency primitives that make later Temporal worker integration
safe: a transactional outbox, an inbox with dedupe, and atomic budget
reservations. Define (but do not deploy) pinned Redis/NATS/Temporal services
and a worker skeleton. Keep the existing in-process runner working; durability
is layered behind interfaces so cutover is reversible.

## Tasks
1. Prisma models + migration: OutboxEvent, InboxMessage, BudgetReservation,
   each RLS-scoped by workspaceId.
2. `src/lib/outbox.ts`: write event + domain mutation in one transaction;
   privileged publisher with `FOR UPDATE SKIP LOCKED`; inbox dedupe helper.
3. `src/lib/budget-reservation.ts`: reserve/commit/release with a Postgres
   advisory xact lock keyed on workspace, idempotent by key, enforcing the
   workspace and agent caps atomically (closes the WS1 TOCTOU gap).
4. Wire reservation into `startAgentRun` as a best-effort reservation, with
   release on cancel/fail and commit on success; preserve graceful drain.
5. Adapters + compose: Redis rate-limit, NATS event sink, Temporal worker
   skeleton (workflowId = executionId for idempotent start; heartbeat-based
   checkpoints; cancellation signal). In-process adapters remain default.
6. Integration tests against CI Postgres: outbox atomicity (mutation rollback
   removes the event), publisher batching + replay, inbox dedupe under
   duplicate delivery, concurrent reservation race (only one wins at cap),
   commit/release accounting.
7. CI: run the new suite; typecheck/lint/build/gates unchanged.

## Exit
No silent state loss on simulated worker crash; duplicate/out-of-order events
are safe; budget cap cannot be bypassed by concurrent starts; all gates green
in CI. No live service or production cutover in this workstream.

## Stop conditions
Any primitive that cannot be made atomic on Postgres, any need to weaken RLS,
or missing VPS headroom. Report evidence; do not force deployment.
