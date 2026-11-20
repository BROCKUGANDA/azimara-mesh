# AZIMARA MESH

**Agent Fleet Operating System.** Every agent. One governed system.

Azimara Mesh is the governed operating fabric for autonomous AI: one control
plane to register, configure, deploy, coordinate, observe, govern and evaluate
fleets of agents across frameworks and providers.

> **Maturity notice:** this repository is an implementation of the first
> commercial release scope. Some integrations are explicitly simulated and are
> labelled as such in the UI and documentation. See
> [`docs/PRD_COVERAGE.md`](docs/PRD_COVERAGE.md) for an honest, per-capability
> status and [`docs/operations/PRODUCTION_READINESS.md`](docs/operations/PRODUCTION_READINESS.md)
> for the current production gate. Do not treat a passing build as evidence of
> product completeness.

## Live deployment

- Application: <https://mesh.aiazimara.com>
- Parent group: <https://aiazimara.com>

## What works today

- Multi-tenant workspaces, memberships and server-side role enforcement.
- Agent registry with versioned manifests, immutable version snapshots and
  workload identities.
- Governed model gateway (one real provider path plus a clearly-labelled
  development mock) and a tool gateway with schema validation, redaction,
  output caps and injection scanning.
- Durable execution records with cancellation, timeouts, checkpoints,
  approval gates and correlated execution steps.
- Sequential, parallel, conditional, bounded-loop and approval workflow
  primitives.
- Deterministic policy decisions, approvals bound to immutable checkpoints,
  audit events, security signals and kill switches.
- Evaluation Lab with versioned datasets, deterministic evaluators and
  regression comparison.
- Usage metering with idempotent events, budgets, entitlements and cost
  attribution.
- A production dashboard covering the operating loop, built on real backend
  data with explicit demo-mode labelling.

## Architecture

The control plane is a modular Next.js application backed by Prisma/SQLite in
the current single-node deployment. The logical boundaries are documented in
[`docs/architecture/TARGET_ARCHITECTURE.md`](docs/architecture/TARGET_ARCHITECTURE.md):
control plane, execution plane, model/intelligence gateway, trust/policy plane
and observability/usage plane.

## Quick start

Requirements: Bun 1.3+ (or Node 20+), and a local SQLite database.

```bash
cp .env.example .env
# set DATABASE_URL and a >=32 char SESSION_SECRET
bun install --frozen-lockfile
bunx prisma generate
bunx prisma db push
bunx prisma db seed   # optional demo workspace
bun run dev
```

Open <http://localhost:3000>.

## Quality gates

```bash
bun run typecheck      # TypeScript
bun run lint           # ESLint
bun run test           # unit tests
bun run security:scan  # tracked-file secret scan
bun run build          # production standalone build
```

CI, security audit and deployment run on the project's self-hosted GitHub
Actions runner (`self-hosted`, `linux`, `x64`) under `.github/workflows/`.

## Deployment

The standalone artifact is built in CI and installed by
`scripts/vps-deploy.sh`. Deployment is manual (`workflow_dispatch`) and
requires green CI. See
[`docs/engineering/DEPLOYMENT_RUNBOOK.md`](docs/engineering/DEPLOYMENT_RUNBOOK.md)
and [`docs/operations/DISASTER_RECOVERY.md`](docs/operations/DISASTER_RECOVERY.md).

## Security

Report vulnerabilities privately — see [`SECURITY.md`](SECURITY.md). Never
commit `.env`, databases, session secrets or customer payloads. The repository
enforces this with `.gitignore`, `scripts/secret-scan.mjs` and a CI gate.

## Documentation

| Area | Location |
|---|---|
| Product | `docs/product/` |
| Design system and brand | `docs/design/`, `docs/brand/` |
| Architecture | `docs/architecture/` |
| Engineering | `docs/engineering/` |
| Operations | `docs/operations/` |
| Commercial | `docs/commercial/` |
| Audit findings | `docs/engineering/AUDIT_FIXES.md` |
| PRD coverage | `docs/PRD_COVERAGE.md` |

---

AI AZIMARA — Intelligence in Motion.
