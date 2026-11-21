# Multi-region gate (P2, not enabled)

Multi-region deployment is deliberately **planned, not implemented**. A second
region adds split-brain, data-residency and failover complexity that cannot be
discharged by configuration alone.

## Prerequisites before any multi-region design is approved

1. PostgreSQL primary with PITR and a tested standby restore in region A.
2. Measured single-region RPO/RTO over at least one quarter.
3. Durable execution backend (Temporal) with a tested failover posture.
4. Secret broker with regional KMS and audited access.
5. Data-residency policy per tenant (the `Organization.dataResidency` field
   exists but is not enforced by topology yet).
6. A signed-off incident-response runbook for region loss.

## Planned topology (subject to change after load testing)

- Active/passive: region A serves traffic; region B is warm standby.
- Metadata replicated synchronously where latency allows; otherwise async
  with explicit RPO disclosure.
- Object storage and artifacts replicated cross-region.
- No automatic failover until a consensus-based promotion path is tested;
  promotion remains a deliberate operator action.

## Current status

Single VPS, single database, single Temporal (when enabled). All failures are
common-mode. No availability objective is published. See
`docs/engineering/SLO_AND_OBSERVABILITY.md` for the evidence gates.
