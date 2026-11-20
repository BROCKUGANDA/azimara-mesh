# AZIMARA MESH — Deployment Runbook

## Current demo deployment (this repository)
```bash
# 1. environment
DATABASE_URL=file:/home/z/my-project/db/custom.db   # .env

# 2. schema
bun run db:push          # prisma db push (accepts data loss on dev)

# 3. client
bun run db:generate

# 4. seed (deterministic demo data — labelled as sample in the UI)
bun prisma/seed.ts

# 5. serve
bun run dev              # port 3000 (auto-managed in the sandbox)
bun run lint             # eslint gate
bunx tsc --noEmit        # type gate
```

## Release gates (mirrored from directive §56, implemented where the pipeline runs)
1. Build (Next.js) · 2. Type checking (`tsc --noEmit`) · 3. Linting (`eslint .`) ·
4. Unit/integration tests (roadmap: formal runner) · 5. Security scanning (roadmap:
dependency audit in CI) · 6. Dependency verification · 7. Database migration check ·
8. Staging validation · 9. Approval.

## Database evolution policy
- Dev: `prisma db push` is acceptable.
- Production: **compatible schema evolution only** — additive columns/tables,
  backfills in code, no destructive migrations; `prisma migrate` with reviewed SQL.
  Migrations are NOT assumed to roll back: forward-recovery plans (expand → migrate →
  contract) documented per change.

## Demo data
`prisma/seed.ts` wipes and regenerates: org/workspaces/users, 10 agents + versions +
identities, 11 tools, 8 policies, 3 published workflows, schedules, integrations,
memory, 3 eval datasets with runs, deployments, approvals, incidents, 14 days of
execution telemetry (~63 runs), previous-month usage + invoice, subscription.
**The UI discloses that historical telemetry is seeded demo data** (SeededNote).

## Operational checks after deploy
1. `GET /api/auth` → `{authenticated:false}` (200).
2. Login as owner → Overview renders metrics (non-zero only if seeded).
3. Run the golden path (agent run) → succeeded with spans.
4. Approval gate: refund prompt → waiting_approval → approve → succeeded.
5. `GET /api/security` → incidents reachable; emergency controls require admin.

## Production topology checklist (before first real deployment)
PostgreSQL + Redis + NATS/Temporal provisioning · microVM isolation decision ·
secret brokerage (Vault/KMS) · OpenTelemetry collector · CI with gates above ·
backup/restore drills · on-call ownership. See PRODUCTION_READINESS.md.
