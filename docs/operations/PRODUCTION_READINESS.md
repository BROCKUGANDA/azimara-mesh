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

## Deployment facts (verified 2026-11-20)

- Public repository: `github.com/BROCKUGANDA/azimara-mesh` (public, single
  squashed commit with no secrets, databases or session keys in history).
- Application URL: `https://mesh.aiazimara.com` (Cloudflare A record to
  57.130.80.158, SNI-routed through the VPS edge nginx to Caddy to the app).
- App runtime: systemd unit `azimara-mesh`, user `ubuntu`, port 3031
  (port 3011 is occupied by another project on the same VPS).
- Data: SQLite at `/home/ubuntu/azimara-mesh-app/db/mesh.db`. `.env` and `db/`
  are excluded from `rsync --delete` by `scripts/vps-deploy.sh`.
- Runner: dedicated GitHub Actions runner `azimara-mesh-vps-1`, labels
  `self-hosted`, `Linux`, `X64`, `azimara-mesh`.
- Workflows: ci.yml (typecheck, lint, unit tests, secret scan, build),
  security.yml (secret scan, blocking `bun audit --audit-level=critical`),
  deploy.yml (manual workflow_dispatch only).
- Verified 2026-11-20: CI success, Deploy success, Security blocking audit
  success after upgrading Next.js to 16.4.6, next-auth to 4.24.15 and running
  `bun audit fix`. 12 lower-severity dev-tooling advisories remain and are
  reported non-blocking.

## Infrastructure notes (2026-11-21)

- The VPS root volume filled to 100%, which crashed the self-hosted runner.
  Docker was already bind-mounted from the 1.7T block volume at `/mnt/data`
  (`/var/lib/docker` → `/dev/sdb[/docker]`). The `azimara-mesh-runner` home was
  moved to `/mnt/data/azimara-mesh-runner` and symlinked back to
  `/home/ubuntu/azimara-mesh-runner`, preserving the systemd unit paths.
- Onchain billing uses Base (EVM) USDC with treasury
  `0x9cb57c0dAF38462447509998647eD06488CBeBf8`. Base Sepolia is the default;
  `ONCHAIN_NETWORK=base-mainnet` is an explicit opt-in.
- Legal/tax review of token payments is tracked as NOT COMPLETE in
  `docs/commercial/LEGAL_TAX_REVIEW.md`.

## Production cutover (completed 2026-11-21, operator-approved)

- Live service moved from the earlier SQLite build to PostgreSQL 16 on the
  1.7T block volume. Container `mesh-prod-postgres`, port `127.0.0.1:55434`,
  data at `/mnt/data/mesh-postgres`.
- Roles: `mesh_app` (NOBYPASSRLS, used by the app) and `mesh_migrator`
  (table owner, used only for migrations). All 5 migrations applied.
- SQLite data migrated with count verification: 1 org, 1 workspace, 1 user,
  1 membership, 3 environments, 1 plan, 1 subscription, 1 audit event.
- Immutable releases at `/mnt/data/azimara-mesh-releases/<timestamp>`;
  `/mnt/data/azimara-mesh-app` is the active symlink. systemd unit uses that
  symlink for `WorkingDirectory`, `EnvironmentFile` and `ExecStart`
  (`/usr/local/bin/bun server.js`, port 3031).
- Mainnet enabled explicitly: `ONCHAIN_NETWORK=base-mainnet`, chain 8453,
  treasury `0x9cb57c0dAF38462447509998647eD06488CBeBf8`. Billing API confirms
  the Base mainnet USDC contract.
- Verified: external `/api/health` 200 with `database: ok`, `/api/overview`
  401 without a session, and login succeeds for the existing admin account.

### Rollback

1. Point `/mnt/data/azimara-mesh-app` at the previous release directory.
2. `sudo systemctl restart azimara-mesh` and verify `/api/health`.
3. If database rollback is required, stop the service, restore
   `/mnt/data/backups/azimara-mesh/mesh.db.<timestamp>` into the old app's
   `db/` directory and restore the old unit from its `.bak-*` copy.
4. Set `ONCHAIN_NETWORK=base-sepolia` in the rolled-back `.env` to disable
   mainnet collection.

The backup and the old unit are retained; no destructive cleanup was done.

## Public entry experience (2026-11-24)

- `/` now shows a public landing view before authentication. It presents the
  Mesh Midnight theme, a real 3D-projected canvas topology with travelling
  flow pulses, staged motion, capability and governance sections, and subtle
  haptics on supported devices. `prefers-reduced-motion` is respected.
- Why it previously opened sign-in: `src/app/page.tsx` rendered `LoginView`
  whenever `/api/auth` reported unauthenticated. The landing state was added
  ahead of that branch; sign-in remains available from the header/CTA.
- One-click demo: `POST /api/auth/demo` resolves the demo identity and its RBAC
  role entirely server-side from `MESH_DEMO_EMAIL` + persisted membership; the
  client sends no role. Gated by `MESH_DEMO_LOGIN=1` outside development and
  audited as `auth.demo_login`. It lands on the role-appropriate board.
- Fix found during verification: entrypoint audit writes had no ambient tenant
  context and were silently denied by RLS. `audit()` now establishes context
  from the event's own workspace/org; covered by a regression test.

## Outstanding production gates

Tenant-isolation integration suite, worker-crash recovery demonstration,
budget reservation, durable queue/outbox, sandbox isolation, API-key auth
path, live billing provider, WCAG 2.2 AA audit, independent penetration test,
backup/restore exercise, and legal review of the repository licence.

