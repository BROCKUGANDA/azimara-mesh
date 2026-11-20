# AZIMARA MESH — Incident Response

## Severity model
| Sev | Definition | Response target |
|---|---|---|
| S1 critical | tenant boundary breach, secret exposure, uncontrolled spend, platform down | immediate; emergency controls |
| S2 high | agent acting outside policy at scale, provider-wide outage with fallback exhausted | same day |
| S3 medium | repeated failures, cost anomalies, single-tenant degradation | 48h |
| S4 low | cosmetic, single-run anomalies | backlog |

## Flow
1. **Detect** — Security Center incidents, budget alerts, failed-execution streaks,
   or human report (everything is audited; the audit stream is the timeline).
2. **Triage** — open the incident (evidence JSON attached); link execution trace;
   classify severity; start investigation (notes timeline begins).
3. **Contain** — suspend the agent or tool; if systemic, workspace emergency stop
   (pauses agents, cancels executions, suspends prod). Monitoring stays live.
4. **Eradicate/Repair** — fix policy/config, roll back agent versions or fleets,
   revoke identities/keys as needed.
5. **Recover** — resume agents (state machine guarded), verify health gates, replay
   safely where needed (replay suppresses external mutations).
6. **Learn** — resolve incident with notes; failure mode added to
   FAILURE_MODES.md if new; eval regression case added to the Evaluation Lab so the
   failure is tested forever after.

## Built-in responders
- Approval gates: S2-class actions pause instead of proceeding (built-in).
- Budget caps: S1 runaway-spend containment is automatic and pre-emptive.
- Provider outage: fallback chains + degraded provider status (automatic).

## Communication
- In-product notifications (severity-mapped) + audit events; customer-facing status
  communication tooling is part of the production-readiness roadmap (no claims made
  until it exists).

## Gaps (honest)
No pager integration yet (PagerDuty integration row is a connector placeholder);
on-call rotation undefined pre-GA; status page roadmap.
