# AZIMARA MESH — Security Operations

## Detection (implemented)
| Signal | Source | Output |
|---|---|---|
| Repeated permission denials (≥3 / 10min per agent) | PolicyDecision stream | permission_violation incident (high) |
| Prompt-injection patterns in tool outputs | tool-runtime scan | prompt_injection incident (high) + flagged span |
| Cost anomalies (>8× agent average, >$0.05) | execution finalize hook | cost_anomaly incident (medium) |
| Failure streaks (≥3 consecutive) | execution history | repeated_failure incident (medium) |
| Memory poisoning attempts | memory write scan | write rejected + audit |
| Credential anomalies | secret-ref verification, identity revocation | credential_anomaly (roadmap automation) |
| Unusual model usage / exfiltration / comms anomalies | policy denials + message stream | monitoring coverage listed in Security Center |

Incident lifecycle: open → investigating → contained → resolved, with notes timeline
and resolution provenance. Notifications fire on raise (severity-mapped).

## Controls (implemented, admin-gated)
- Per-agent suspension (pauses agent + suspends production deployments).
- Per-tool suspension (adapters refuse; policy layer denies).
- Workspace execution suspension / **emergency stop**: pauses all agents, cancels all
  queued/running/waiting executions, suspends production deployments.
- Credential revocation: API keys + service identities (status revoked).
- Monitoring and audit continue while agents are paused — controls never blind the
  operator.

## Governance of the controls themselves
- All controls require admin role and write critical-severity audit events.
- Emergency stop requires an explicit confirmation dialog and a reason.
- The audit stream (`AuditEvent`) is append-only and org-scoped.

## Vulnerability handling (roadmap to full program)
- Dependency verification gate in CI (roadmap); today: pinned lockfile, minimal deps.
- Secret handling: no raw secrets stored — vault-style references only; BYOK keys
  hashed/unshown; password scrypt; HMAC sessions.
- Coordinated disclosure: security@ process documented before GA.
- Independent penetration test: required before enterprise GA (unmet — documented).

## Daily ops
- Security Center triage cadence: open incidents reviewed per shift (pilot teams).
- Policy change management: all edits admin-only, audited, with simulator dry-run
  recommended before activation.
