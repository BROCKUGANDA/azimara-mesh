# Workstream 1 — PostgreSQL and tenant isolation plan

Parent design: `docs/superpowers/specs/2026-11-20-azimara-mesh-commercial-readiness-design.md`

## Scope

Move the application data contract from Prisma/SQLite to Prisma/PostgreSQL,
introduce transaction-local RLS context, test tenant isolation against a
non-owner database role, and make deployment refuse unsafe/destructive
migrations. This workstream prepares but does **not** cut over the live VPS
service. The production SQLite file remains untouched until a separate,
verified cutover and rollback are explicitly approved.

## Tasks, in dependency order

1. **Postgres schema and migration baseline**
   - Change the canonical Prisma datasource to PostgreSQL and add a separate
     migration connection URL.
   - Generate the initial Prisma SQL migration from the checked-in schema.
   - Add reviewed SQL for least-privilege roles, tenant helper functions and
     RLS policies. Add policies for direct and parent-derived tenant rows.
   - Preserve a read-only SQLite schema snapshot and add a data export/import
     utility with idempotent batches and row-count/checksum reporting.
2. **Context-bound database access**
   - Add request/worker database context for `userId`, `workspaceId` and
     `organizationId`; populate it only after signed-session and membership
     validation.
   - Ensure every query executes with transaction-local PostgreSQL settings;
     prevent pooled connection context leakage.
   - Keep privileged migration/maintenance access separate and unavailable to
     ordinary request code.
3. **Authorization and schema integrity**
   - Audit tenant-owned tables and add direct workspace keys or safe parent
     constraints where indirect scoping is ambiguous.
   - Add indexes/compound constraints required by tenant query patterns and
     to prevent cross-workspace parent-child links.
   - Fail closed on missing context; document global catalog reads explicitly.
4. **Integration and race tests**
   - Add a CI PostgreSQL service, non-owner application role and migration
     role.
   - Test direct and nested IDOR attempts across every tenant entity family.
   - Test missing-context denial, concurrent context isolation, duplicate
     idempotency keys and transaction rollback.
   - Keep existing unit/type/build gates.
5. **Migration and recovery tooling**
   - Test SQLite snapshot -> PostgreSQL import on a disposable database.
   - Verify table counts, important aggregates, role/membership reachability,
     foreign keys and audit/usage idempotency.
   - Add backup, restore verification and a read-only rollback procedure.
6. **Safe deployment gate**
   - Replace `db push --accept-data-loss` in production deployment with
     `prisma migrate deploy`, guarded by explicit Postgres configuration.
   - Use immutable release directories and atomic cutover; exclude runtime
     `.env`, database volumes and backups from artifact cleanup.
   - Deployment workflow checks migration status and health before promotion.
   - Do not run the new PostgreSQL migration against production in this
     workstream without a successful staging rehearsal and explicit approval.

## Validation

- `bun run typecheck`, `bun run lint`, unit tests, production build.
- `prisma validate`, migration generation and `prisma migrate deploy` against
  a clean PostgreSQL instance.
- RLS tests using a non-owner role with `NOBYPASSRLS`; verify that the test
  harness itself cannot silently use a superuser.
- SQLite import round-trip on a disposable fixture with injected duplicate,
  malformed and interrupted batches.
- CI run on the dedicated self-hosted runner; deployment remains unpromoted.

## Stop conditions

- Any relation cannot be tenant-scoped or constrained without data loss.
- The current production data does not match the migration assumptions.
- The VPS lacks safe resource headroom for a co-located database.
- RLS context cannot be proved isolated across concurrent requests.

On any stop condition, keep the existing SQLite production service running,
report evidence and propose the smallest corrective design. No production
schema reset, database deletion or automatic destructive migration is allowed.
