# Audit and Hardening Register

Date: 2026-11-20. Scope: first surgical hardening pass over the control plane,
execution plane and public-repository delivery pipeline.

This register records findings that were **verified in code** and the fix that
was applied. It is not a penetration-test report. Items marked *residual* are
known gaps that remain deliberately open and are tracked in
[`PRD_COVERAGE.md`](../PRD_COVERAGE.md).

---

## P0 — fixed in this pass

### 1. Cross-tenant tool loading in the execution engine (critical)

`loadToolManifest()` loaded every id in the agent's `toolPermissionsJson` with
`db.tool.findMany({ where: { id: { in: granted } } })` — no workspace filter. A
forged or stale permission id belonging to another tenant would enter the
agent's manifest and could be invoked through the tool gateway.

**Fix:** the lookup now requires `workspaceId: agent.workspaceId` and excludes
suspended tools. File: `src/lib/execution-engine.ts`.

### 2. Cross-tenant namespace resolution (critical)

The execution loop resolved memory namespaces with `findUnique({ id })` and
then only checked classification/role rules — never tenancy. A namespace id
from another workspace could be read if the agent config named it.

**Fix:** `findFirst({ id, workspaceId: agent.workspaceId })`. The same class of
gap was closed for workflow `memory` nodes and both compensation-tool paths in
`src/lib/workflow-engine.ts`.

### 3. Cross-tenant evaluation comparison and case insertion (high)

`GET /api/evals` passed a client-supplied `datasetId` straight into
`compareRuns()`, and `add_case` wrote to any dataset id, even in another
workspace.

**Fix:** both now verify the dataset against the session workspace first.
File: `src/app/api/evals/route.ts`.

### 4. Double approval / double execution race (critical)

`resumeAfterApproval()` read `status === 'waiting_approval'` and then executed
a privileged tool. Two concurrent decisions could both pass that check and
perform the side effect twice. The route also updated the approval row without
a compare-and-set and allowed an `operator` to satisfy an approval whose
`reviewerRole` was `admin`.

**Fix:** atomic `updateMany` compare-and-set on both the approval row
(`status: pending`) and the execution row (`status: waiting_approval`) with a
count check; reviewer role is enforced against the approval's declared
`reviewerRole`; `requireRole` now fails closed on unmapped role values.
Files: `src/app/api/approvals/[id]/route.ts`, `src/lib/auth.ts`,
`src/lib/execution-engine.ts`.

### 5. Duplicate execution-step sequence (high)

`openStep()` used `count()` then `create({ seq: count })`. Parallel branches
(or two workers) could claim the same sequence and violate the compound unique
key — the repository already contains a cleanup script for the resulting
duplicates.

**Fix:** added an atomic `Execution.stepSeq` counter, incremented with
`db.execution.update({ stepSeq: { increment: 1 } })` which returns the claimed
value. Files: `prisma/schema.prisma`, `src/lib/execution-engine.ts`.

### 6. Stale runner overwrites operator cancellation (high)

The runner finalized with an unconditional `update({ status: 'succeeded' })`;
an execution cancelled mid-flight could be flipped back to succeeded.

**Fix:** finalization and failure writes are conditional `updateMany` calls on
`status: 'running'`; downstream usage/audit side effects only run when the
compare-and-set succeeds. File: `src/lib/execution-engine.ts`.

### 7. Lost updates in agent health counters (medium)

`updateAgentHealth()` read `spendMonth` and wrote `spendMonth + costUsd`, so
concurrent executions lost spend.

**Fix:** atomic `{ increment: costUsd }`. File: `src/lib/execution-engine.ts`.

### 8. Usage dedupe swallowed unrelated failures (high)

`recordUsage()` caught any error whose message contained "Unique constraint"
as a harmless duplicate.

**Fix:** replaced create-and-catch with an idempotent `upsert` keyed on
`idempotencyKey`, with `update: {}` so an existing event is never mutated.
File: `src/lib/metering.ts`.

### 9. Internal error messages returned to clients (high)

`withApi()` returned `err.message` for INTERNAL errors, exposing database and
path details.

**Fix:** generic client message; details stay in the server log.
File: `src/lib/api-utils.ts`.

### 10. CSRF downgrade via proxy header (high)

`sessionCookieOptions()` set `SameSite=None` based only on
`X-Forwarded-Proto: https` — a header an attacker can influence — removing
cross-site CSRF protection on every proxied request.

**Fix:** `SameSite=Lax` is the default; `None` requires the explicit
`MESH_IFRAME_PREVIEW=1` opt-in. `Secure` is set in production. Production now
requires `SESSION_SECRET` (>= 32 chars) and fails closed if absent.
File: `src/lib/auth.ts`.

### 11. Suspended users retained valid sessions (high)

A signed cookie was trusted for its whole TTL without checking account status.

**Fix:** `getSessionUser()` verifies `user.status === 'active'` on every
request. File: `src/lib/auth.ts`.

### 12. Non-atomic agent creation (medium)

Agent, initial version and workload identity were three separate writes.

**Fix:** wrapped in one `db.$transaction`, plus server-side validation of
`autonomyLevel` and empty slugs. File: `src/app/api/agents/route.ts`.

### 13. Tool output truncation produced invalid JSON (medium)

The gateway sliced serialized JSON at 8192 bytes and parsed it back, which
throws when the cut lands inside a string or escape sequence — after the tool
side effect already happened.

**Fix:** cap output as structured data with a preview field. Also clear the
timeout timer in `finally` so no live handle or late rejection remains.
File: `src/lib/tool-runtime.ts`.

### 14. Public-repository secret leakage (critical)

`db/.session-secret` and `db/custom.db` were tracked in git. Publishing the
repository would have exposed the live session signing key and all seeded
user password hashes.

**Fix:** both paths are now ignored and removed from the index before the
public push; a tracked-file secret scan gates CI and security workflows; the
VPS session secret must be regenerated as part of deployment hygiene.
Files: `.gitignore`, `scripts/secret-scan.mjs`, `.github/workflows/*.yml`.

---

## Residual / follow-up (not fixed in this pass)

- **Budget check is TOCTOU.** `checkWorkspaceBudget()` and
  `checkAgentBudget()` read month spend before creating an execution. Two
  concurrent starts can both pass. A reservation-based ledger is required for
  strict enforcement; current behaviour is documented as best-effort.
- **In-process runner.** `void runAgentExecution()` depends on a long-lived
  Node process. A crash loses non-checkpointed steps. A durable queue/worker
  split is the P1 remedy.
- **External side-effect replay.** Simulated adapters suppress mutations on
  replay; real external adapters must provide idempotency keys before being
  enabled (the adapter interface documents this).
- **Runtime isolation.** Managed execution is currently in-process, not
  sandboxed. Container/gVisor isolation is required before untrusted agents.
- **No server-side API-key authentication path yet.** API keys are minted and
  revocable but the request path still uses session cookies.
- **SSO/SCIM, ABAC, dedicated services** remain roadmap items.

## P0 — dependency hardening (verified 2026-11-20)

GitHub Dependabot and `bun audit` initially reported critical advisories in
Next.js (unauthenticated RCE in image optimisation and `use cache`) and
Auth.js (homoglyph `@` bypass). Fixed by upgrading:

- `next` 16.1.x → 16.4.6
- `next-auth` 4.24.13 → 4.24.15
- `zod` 4.3.5 → 4.6.7
- `sharp` 0.34.x → 0.35.5 (libvips/libheif/librsvg)
- `bun audit fix` within declared ranges (47 further transitive fixes)

Result: **0 critical advisories**. 12 lower-severity advisories remain in
development-time transitive packages (Prisma config, ESLint, MDX editor);
these are reported non-blocking by `security.yml` and tracked for the next
dependency refresh. The security workflow now audits the real `bun.lock`
tree instead of a synthetic npm lockfile.

Typecheck, unit tests and production build were re-run after the upgrades and
all pass.

