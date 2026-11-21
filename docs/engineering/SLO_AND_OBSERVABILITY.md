# SLOs and Observability — targets, not claims

All values below are targets for design and load testing. None are achieved
metrics and none may be published as an SLA until measured over a sustained
window with alerting and incident response in place.

| Signal | Target | Evidence required |
|---|---|---|
| Control-plane availability | 99.9% monthly | Synthetic probes + incident log |
| Accepted-work scheduling availability | 99.9% monthly | Temporal/NATS acceptance metrics |
| Trace coverage of executions | >98% | Span completeness report |
| Audit/usage attribution | 99% attributed or quarantined | Metering reconciliation |
| p95 interactive API latency | < 500ms | Load test report |
| RPO metadata/audit | <= 5 min / 0 | Restore drill |
| RTO control plane | <= 30 min | Restore drill |

## Instrumentation

- Optional OpenTelemetry via `OTEL_EXPORTER_OTLP_ENDPOINT`; see
  `src/lib/telemetry.ts`. Instrumentation is best-effort and never blocks a
  request.
- Correlation attributes: organization, workspace, workflow, agent, execution
  and correlation IDs. Raw payloads are never span attributes.
- The emergency view is `GET /api/health`. It checks only the database and is
  independent of Temporal, NATS and the telemetry collector, which are the
  subsystems most likely to be under investigation.

## Alerts (to provision with the collector)

1. Database check error or latency > 2s -> page.
2. Temporal queue backlog growing for > 5 min -> page.
3. NATS consumer lag > 1000 -> warn.
4. Policy denial rate > 5x baseline -> warn (possible abuse).
5. Budget reservation failure rate > 1% -> warn.

## Gate before any SLA claim

Sustained 30-day measurement, documented error-budget policy, tested alert
routing, and a completed restore drill. Until then the product is pilot-grade.
