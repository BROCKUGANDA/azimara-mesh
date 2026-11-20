# AZIMARA MESH — Target Architecture

## Current implementation (this build)
Single Next.js 16 deployment hosting all five planes as logical layers over
Prisma/SQLite, behind one gateway. The separation is enforced at the module boundary
(`src/lib/*` engines) and the API contract level, not by network topology — an
explicit, honest trade-off for the demo deployment.

```
┌──────────────────────────── Next.js 16 (port 3000) ────────────────────────────┐
│ SPA shell (/) ── 25 views, view router, command palette, polling                │
│ API routes (/api/*) ── auth, agents, workflows, executions, policies,           │
│   approvals, models, tools, memory, evals, security, audit, usage, billing…     │
│                                                                                  │
│ CONTROL PLANE      lib/auth, registry models, deployments, fleets               │
│ EXECUTION PLANE    lib/execution-engine, lib/workflow-engine (in-process,       │
│                    checkpointed async runners)                                  │
│ INTELLIGENCE PLANE lib/model-gateway (routing+fallback+SDK), lib/eval-engine,   │
│                    lib/memory                                                   │
│ TRUST PLANE        lib/policy-engine, approvals, identities, audit,             │
│                    lib/security-monitor                                         │
│ DATA PLANE         telemetry tables, metering, SQLite persistence               │
└──────────────────────────────────────────────────────────────────────────────────┘
```

## Five planes (directive §3)
1. **Control Plane** — what should exist and what is permitted: registry, versions,
   fleets, deployments, policies, entitlements, billing. Never executes agent code
   inside request handlers (runs are queued and executed by the engine layer).
2. **Execution Plane** — runs agents/workflows with bounded resources, isolated
   identities, checkpointing, cancellation, timeouts.
3. **Intelligence Plane** — model gateway (routing/fallback/metering), memory
   services, evaluation engine.
4. **Trust & Governance Plane** — deterministic policy, RBAC/ABAC, approvals,
   identities, audit, security monitoring. Enforced independently of any LLM.
5. **Observability & Data Plane** — trace spans, execution events, audit evidence,
   usage events, evaluation history, cost records.

## Target production topology (roadmap)
| Concern | Demo (now) | Production target |
|---|---|---|
| Metadata store | SQLite + Prisma | PostgreSQL (RLS) + pgvector |
| Cache / ephemeral | in-process | Redis |
| Event infrastructure | in-process | NATS JetStream |
| Durable orchestration | checkpointed in-process runners | Temporal (or Step Functions) |
| Execution isolation | sandboxed deterministic adapters | microVM/gVisor per-execution |
| Secrets | vault-style references | Vault/KMS brokerage with real lease |
| Telemetry | in-platform trace model | OpenTelemetry collector → vendor |
| Frontends | SPA in Next.js | same, behind CDN |

Failure boundaries: the gateway may lose workers (executions resume from checkpoints
or dead-letter); providers fail independently (fallback chains); the policy engine is
a pure function over persisted state (no network dependency in the hot path).

## Non-negotiables carried into every topology
- Policy evaluation on every consequential invocation.
- Immutable version pinning for in-flight executions.
- Idempotent metering and immutable audit.
- Tenant scoping on every query.
