# AZIMARA MESH — Disaster Recovery

## Current state (honest)
Single-node deployment: Next.js app + SQLite file (`db/custom.db`). Recovery unit =
the database file plus the repository. No regional redundancy, no automated backups,
no measured RPO/RTO. Nothing in this document is a commitment — it is the plan we
will implement and test before selling any availability promise.

## What is durable today
- All control-plane state, execution telemetry, audit evidence and billing records
  persist to SQLite immediately (WAL-journal).
- Execution checkpoints persist per step; a killed worker leaves the execution
  inspectable and replayable (replay suppresses external mutations).
- Audit evidence is append-only and survives restarts.

## Recovery objectives (targets for production, not measurements)
| Objective | Target (production) | Current |
|---|---|---|
| RPO — metadata/telemetry | ≤ 5 min (streaming replicas) | file copy only |
| RPO — audit evidence | 0 (append-only, synced replicas) | file copy |
| RTO — control plane | ≤ 30 min | manual restart |
| Recovery regions | ≥ 2 (active-passive) | 1 |

## Planned production DR design
1. PostgreSQL primary + sync standby per region; PITR (WAL archiving) → RPO ≤ 5min.
2. Object storage for artifacts/eval assets with cross-region replication.
3. Durable workflow backend (Temporal/NATS) → worker loss resumes from history;
   "no silent loss of durable execution state" becomes testable.
4. IaC-only rebuilds (no snowflake); secrets in Vault; quarterly restore drills.
5. Runbooks per failure class (region loss, data corruption, bad deploy, key
   compromise) with game-day schedule.
6. Forward-only migrations with expand/contract; backups tested against restore,
   not assumed.

## Trigger hierarchy (what to restore first)
1. Metadata + audit (the evidence) → 2. execution state → 3. billing records →
4. observability (rebuildable from events).
