# Azimara Mesh Commercial Readiness — Architecture and Decomposition

**Status:** Proposed design, approved in chat on 2026-11-20; awaiting written-spec review  
**Product:** AZIMARA MESH  
**Repository:** `BROCKUGANDA/azimara-mesh`  
**Target deployment for the first implementation stages:** existing VPS, single host  
**Purpose:** Turn the remaining Master PRD gaps into a dependency-ordered program without implying that one pass can establish production GA.

## 1. Context and current state

Azimara Mesh is a Next.js 16 modular monolith with Prisma/SQLite. The control
plane, APIs, UI, model/tool gateways, policy logic and execution engines are in
one application. Agent and workflow work is currently executed by in-process
runners. The deployed instance is behind Cloudflare and the VPS edge proxy. CI,
security and manual deploy workflows use the dedicated self-hosted runner.

The product already has agent/workflow management, RBAC, a policy engine,
approvals, execution records, metering, evaluations and operator screens. The
remaining core production gaps are the persistence and execution failure
boundaries, isolated untrusted execution, formal multi-tenant tests, developer
platform completion, real commercial providers, recovery evidence and
independent review.

This design does **not** call the present single-VPS deployment highly
available. It is a pilot topology until data/workers have independent failure
domains, restore and recovery drills pass, and measured service objectives
exist.

## 2. Goals

1. Preserve the existing application and product surface; do not rewrite it as
   microservices without a demonstrated ownership or scaling requirement.
2. Make tenant isolation a database-enforced control in addition to explicit
   application authorization.
3. Make workflow state durable across application and worker restarts, with
   honest at-least-once semantics for external side effects.
4. Ensure untrusted agent code cannot access host credentials, Docker control,
   other tenants, or arbitrary network destinations.
5. Complete the P0/P1/P2 requirements in the Master PRD through small,
   reviewable, individually accepted vertical slices.
6. Make migrations and deployments recoverable and idempotent.
7. Keep provider credentials, human approvals, legal reviews and independent
   security evidence as explicit gates rather than pretending code supplies
   them.

## 3. Non-goals and claims boundary

- No universal exactly-once guarantee for providers that do not implement
  idempotency or transactions.
- No SLA, RPO/RTO, regulatory certification, independent penetration-test
  result, or security certification is claimed until measured or independently
  evidenced.
- The initial VPS remains a single failure domain even after Postgres,
  Temporal, NATS and sandboxing are added.
- Marketplace publication and multi-region traffic are not enabled merely
  because their code exists; each needs explicit trust and operational gates.
- Live payment collection, SSO tenant onboarding, email delivery and production
  secret-manager use require provider accounts and secrets supplied through the
  private secret flow.

## 4. Target architecture

### 4.1 Control plane

Keep the Next.js application as a modular control-plane monolith. It owns
browser/API contracts, users and memberships, organizations/workspaces,
policies, agent and workflow definitions, versions, approvals, entitlements,
usage views and operator controls. Request handlers validate input and
authorize before calling domain services. They do not run agent code.

### 4.2 Authoritative data and tenant boundary

- PostgreSQL is the sole authoritative transactional store.
- Tenant-owned records have a direct workspace key or a documented,
  constraint-backed parent path to one.
- PostgreSQL RLS is applied to tenant tables. Policies deny access when
  workspace/user context is absent and verify the authenticated membership
  relation. The normal application role does not own tables and cannot bypass
  RLS; schema migrations use a separate role.
- Request and worker database work runs in explicit transactions that set
  transaction-local identity/workspace context. No session-level tenant GUC is
  allowed to leak through the connection pool.
- RLS protects against missed filters; it does not replace server-side
  authorization or protect against a fully compromised application role.
- Use forward-only expand/contract migrations. Any custom RLS policies,
  triggers or indexes are migration-controlled and reviewed with the Prisma
  schema.
- SQLite export/transform/import is tested against a cloned database before
  cutover. Production writes are quiesced for final synchronization. Preserve
  the final SQLite snapshot read-only until acceptance; rollback restores both
  the matching app release and snapshot.

### 4.3 Durable execution, eventing and caches

- Temporal is the canonical history for workflow timers, retries, signals,
  cancellation and worker recovery. The Next.js service starts workflows and
  renders their state; a separate worker process performs activities.
- NATS JetStream carries versioned domain events and notifications. It is not a
  second authority for Temporal execution state.
- PostgreSQL outbox rows are written in the same transaction as domain changes.
  A publisher forwards them to NATS; consumers persist inbox/deduplication keys.
  Event consumers tolerate duplicate and out-of-order delivery.
- Redis is used for bounded rate limiting, short-lived coordination and cache
  data only. Correctness, authorization and billing decisions cannot depend on
  Redis contents being durable.
- PostgreSQL pgvector supports governed retrieval. A vector match never
  substitutes for namespace, tenant, role and classification authorization.

### 4.4 Runtime and tool/model gateways

- Workers are separate from the web/control plane.
- Every untrusted execution runs in a short-lived, resource-bounded container
  with a non-root user, read-only root filesystem, no Docker socket or host
  mounts, dropped capabilities, seccomp, CPU/memory/PID/time limits and
  deny-by-default network egress.
- Use gVisor when the deployed kernel/runtime supports it and the conformance
  tests pass. If unavailable, explicitly disable untrusted/customer-supplied
  agent code; ordinary containers must not be described as equivalent to a
  microVM.
- Tool and model credentials remain in gateway/broker processes. The isolated
  worker receives short-lived, audience- and workspace-scoped credentials.
- External effects use a stable operation key. If a provider lacks idempotency,
  Mesh documents at-least-once delivery, detects ambiguous outcomes, and
  requires a human/reconciliation step instead of blind retry.
- MAAI remains the adapter boundary. Each adapter has conformance tests for
  input/output schema, identity propagation, timeout, cancellation, error
  classification, trace propagation, usage, and idempotency behavior.

### 4.5 Secrets, object storage and telemetry

- Implement a provider-neutral secret-broker interface. The production adapter
  uses a Vault-compatible service with an external KMS/unseal mechanism;
  development secrets are not accepted in production. Secrets are leased,
  scoped, redacted and never returned after creation.
- Store large artifacts and evaluation assets in S3-compatible object storage.
  A local single-host object store may be used only for pilot development;
  production recovery requires off-host backup/replication.
- Emit OpenTelemetry traces, metrics and logs with organization, workspace,
  workflow, agent, execution and span correlation, while redacting sensitive
  content by default. Raw payload access is role-gated and audited.
- The emergency operator view must not depend on Temporal, the app, or the
  telemetry collector being investigated.

## 5. Consistency, state machines and safety invariants

1. **Database state is authoritative** for identities, policies, approvals,
   agent/workflow versions, usage and billing. Temporal is authoritative for
   orchestration history and timers; references are linked by stable IDs.
2. **Immutable execution pins:** an execution records immutable agent and
   workflow version/configuration hashes at start.
3. **Atomic outbox:** a consequential state mutation and its outbox event
   commit in the same database transaction.
4. **Inbox dedupe:** consumer side effects are protected by a stable event or
   activity idempotency key.
5. **Approval binding:** an approval references a plan hash, target scope,
   expiry, required role/quorum and requester. Any material plan change
   invalidates the approval.
6. **Budget reservation:** starting work atomically reserves available
   workspace and agent budget; usage settlement consumes the reservation and
   unused amount is released. Cancellation and exceeded budgets never block
   safe shutdown or audit recording.
7. **Cancellation:** stop accepting new activities, propagate cancellation,
   revoke later tool authorization, record bounded in-flight ambiguity, and
   preserve evidence.
8. **No hidden demo state:** demo fixtures remain visibly labeled and isolated
   from customer data.

## 6. Commercial and developer capability design

- REST v1 is the canonical public contract, documented with OpenAPI. Input
  schemas, authorization, pagination, stable error contracts and rate limits
  are enforced server-side.
- API keys are high-entropy, shown once, stored only as hashes, scoped, named,
  expirable, revocable and auditable. Last-used updates are best-effort and do
  not block authorization. Service/workload identities are short-lived,
  signed, audience-bound and workspace-scoped.
- Generate TypeScript and Python SDKs and a CLI from the same versioned
  contract. The API, SDKs and web application call the same domain rules.
- Support authenticated HTTP/REST and one real MCP-compatible integration
  path. Add a real adapter only when its conformance suite passes.
- OIDC and SCIM 2.0 are provider-neutral. Provider-specific onboarding is
  separately configured and does not silently grant org-owner access.
- Stripe is the first billing-provider adapter, in test mode. The provider
  abstraction separates platform subscription, included credits, usage,
  invoices, payment status, taxes and dunning. Live mode is a separate explicit
  enablement with customer-approved credentials and verified webhooks.
- Marketplace packages require publisher identity, signed provenance,
  permission manifest, version pinning, review, vulnerability scanning,
  revocation and revenue-share/accounting controls before public install.

## 7. Operational delivery model

- Keep the current runner and VPS during early phases, but measure resource
  headroom before adding stateful services. Use Compose with persistent named
  volumes, resource limits, health checks and pinned images.
- Deploy immutable release directories; never rsync over the live app tree.
  The cutover is an atomic symlink or proxy switch after health/readiness tests.
- Serialize deploy and migration operations. Run an off-host backup and
  verify it before a production schema migration.
- Database changes are backward-compatible throughout the rollback window.
  Destructive cleanup is a later, separately approved migration.
- On a single VPS, host failure, disk failure and host-level compromise remain
  common-mode risks. No high-availability claim is allowed until components
  are moved to independent failure domains and tested.

## 8. Verification and release gates

### Required automated tests

- Unit: state machines, policy, RLS context, idempotency, retries, budget
  reservation, redaction, schema validation and adapters.
- Integration: PostgreSQL/RLS, outbox/inbox, Temporal, NATS, Redis limits,
  secret broker, object store, webhook signing and billing test mode.
- Tenant isolation: user/API key/agent from workspace A cannot read or mutate
  workspace B via direct IDs, nested IDs, filters, workflow nodes, memory,
  evals, approvals, exports or event replay; every denial is audited.
- Concurrency: simultaneous approvals, dedupe races, budget reservations,
  step creation, duplicate webhook deliveries, cancellation/finalization races.
- Failure: worker death during model/tool activity, Temporal restart, DB
  interruption, duplicate/out-of-order NATS events, provider timeout after a
  possible side effect, sandbox resource exhaustion, backup restore.
- E2E: all ten Master PRD golden paths plus an adversarial suite.

### Release gates

No deployment promotion unless typecheck, lint, unit/integration/E2E,
tenant-isolation, secret/dependency/SBOM scans, image/provenance checks,
migration compatibility and staging health pass. Required skips are time-bound,
scoped, owned and recorded. Production approval remains manual and auditable.

### External evidence gates

Independent penetration test, legal/licence/privacy review, provider account
approval, restore drill, measured load/chaos results and customer-specific
security review cannot be fabricated by CI. They must have named owners and
evidence before GA. The product remains pilot-grade until then.

## 9. Delivery decomposition and dependency order

Each workstream gets its own reviewed design/spec and implementation plan.
Do not combine these into one mega-PR.

### Workstream 1 — Data foundation and tenant isolation (first)

1. Inventory schema/data/queries and current VPS resource constraints.
2. Add PostgreSQL Compose service, persistent volume, pinned versions, health
   checks, backup/restore scripts and documented recovery.
3. Add forward-only migrations, SQLite migration/validation tooling, transaction
   context API and database roles.
4. Add RLS to tenant-owned tables and a full automated cross-tenant suite.
5. Cut over staging, restore-test, then production with an approved rollback.

**Exit:** PostgreSQL is authoritative; tenant boundary tests pass; migration,
backup, restore and rollback are evidenced; app remains healthy after process
restart.

### Workstream 2 — Durable execution and event consistency

Add Temporal, separate worker image/service, outbox/inbox, NATS JetStream,
Redis limits, idempotent activities, budget reservations and cancellation.

**Exit:** killing any worker during a step resumes without silent state loss or
blind duplicate external effects; duplicate/out-of-order events are safe.

### Workstream 3 — Isolated runtime and secrets

Add runtime sandbox, egress proxy/policies, resource quotas, signed short-lived
workload identities, secret broker, artifact store and adapter conformance.

**Exit:** untrusted code cannot access host/tenant credentials, unauthorized
tools or arbitrary network; timeout/cancel and resource exhaustion are tested.

### Workstream 4 — Developer platform and integrations

Add API v1/OpenAPI, API-key auth, SDKs/CLI, signed webhooks, real MCP and
framework adapter(s), pagination, rate limits and deprecation/version policy.

**Exit:** published contracts generate working clients; API golden paths pass
against the deployed staging stack.

### Workstream 5 — Enterprise governance and privacy

Add OIDC, SCIM 2.0, ABAC, approval quorum, policy-as-code, data export/deletion,
retention, audit bundles and administrative kill switches.

**Exit:** external identity lifecycle and privacy operations are integration
tested with tenant-specific authorization.

### Workstream 6 — Billing and commercial controls

Add Stripe test-mode subscription and signed webhook flow, plan/entitlement
checks, usage reservations/settlement, invoices, tax metadata, dunning state
and customer exports. Live payment collection remains opt-in.

**Exit:** duplicate/reordered webhooks do not duplicate charges/entitlements;
budget overrun blocks new work but preserves safe termination and evidence.

### Workstream 7 — Observability, reliability and security evidence

Add OpenTelemetry, dashboards/alerts, SLO measurement, load/chaos tests,
backup/restore drills, incident runbooks, SBOM/provenance and independent
penetration-test remediation.

**Exit:** operators can detect/diagnose failure using the emergency view, and
availability/recovery targets are based on measured evidence.

### Workstream 8 — Marketplace and multi-region

Only after the trust and reliability gates: publisher onboarding, package
review/signing/revocation/revenue-share controls; then a separately reviewed
multi-region topology, data residency, regional failover and restore plan.

**Exit:** no untrusted package or region is enabled without independent review,
tested failure recovery and explicit operator approval.

## 10. Acceptance boundary

“Everything in the PRD implemented” means each feature is classified as
implemented only after its acceptance tests and operational evidence pass.
Where an external credential, provider, contract, legal review or independent
test is required, the feature remains visibly configured-but-disabled or
pending evidence. A successful build, seeded demo, or live URL alone is not
commercial production acceptance.
