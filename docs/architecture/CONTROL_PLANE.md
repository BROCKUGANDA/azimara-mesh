# AZIMARA MESH — Control Plane

Responsibility: define what should exist and what is permitted to run. The control
plane never executes agent logic inside API request handlers — it validates,
persists, and hands work to the execution plane.

## Modules
- `src/lib/auth.ts` — sessions (HMAC-signed cookie, 7-day TTL), scrypt password
  hashing, `requireWorkspaceAccess(userId, workspaceId, minRole)` boundary guard,
  API-key hashing (SHA-256, raw key shown once).
- Registry models: Organization, Workspace, User, Membership, Agent, AgentVersion,
  Fleet, FleetAgent, Deployment, Environment, Schedule.
- Route groups: `/api/agents`, `/api/agents/[id]`, `/api/fleets`, `/api/workflows`,
  `/api/deployments`, `/api/environments`, `/api/schedules`, `/api/identity`,
  `/api/settings`, `/api/billing`.

## Lifecycle enforcement
Agent transitions are a server-side table:

| Action | From | To |
|---|---|---|
| validate | draft | validating |
| test | validating, draft | testing |
| ready | testing, ready | ready |
| publish | (creates version) | ready |
| pause | healthy, degraded, ready, scaling | paused |
| resume | paused | healthy |
| retire / archive | as defined | retiring / archived |

Frontends cannot mutate deployment state directly — only through these actions, each
of which writes an audit event. Publish requires admin for rollback/publish-class
operations; A3 autonomy requires admin.

## Deployments
`POST /api/deployments` runs the promotion path: environment validation → role check
(production requires admin) → **deterministic policy evaluation** (`deployment` action;
prod gate returns require_approval) → either an Approval record (pause) or a Deployment
row with health gate `{errorRateThreshold, latencyP95Ms, evalGate}`.
`verify_health` computes live error rate from the last 24h of executions and flips
status healthy/degraded. `rollback` marks rolled_back + agent rolling_back.

## Fleet mutations
Fleet-wide pause/resume/rollout/rollback evaluate target scope per agent (state
machine respected per row) and write one audit event with affected count.

## Invariants
1. Every mutating route requires role ≥ operator (policy/billing/identity: admin,
   role change: owner).
2. Every state change is audited with actor + detail.
3. All queries are workspace-scoped; organization-level views aggregate via
   organizationId on the audit stream only.
