# AZIMARA MESH — Failure Modes

| # | Scenario | Detection | Response | Status |
|---|---|---|---|---|
| 1 | Agent infinite loop | maxIterations per loop + step cap | loop bound enforced, step skipped | ✅ |
| 2 | Recursive delegation | delegationDepth vs maxDelegationDepth (default 2) | rejected with typed error | ✅ |
| 3 | Malformed agent messages | schema validation on delegation input | typed error, audited | ✅ |
| 4 | Context overflow | contextTokens config + provider context metadata | truncation + capability-aware routing (roadmap: summarization stage) | 🟡 |
| 5 | Model timeout | 45s race + gateway timeout | fallback chain → deterministic runtime | ✅ |
| 6 | Provider outage | provider status/error-rate metadata | routing skips offline providers; fallback; health chips | ✅ |
| 7 | Tool failure | adapter errors + timeout | failed step, error recorded, retryable classification | ✅ |
| 8 | Tool timeout | per-tool timeoutMs | timeout status, counted toward error rate | ✅ |
| 9 | Memory poisoning | injection patterns on write | write rejected; poisoning detection | ✅ |
| 10 | Duplicate execution | per-run tool-intent dedup + idempotent metering keys | suppressed, metered once | ✅ |
| 11 | Stale memory | TTL/retention filter at read + enforceRetention | expired records excluded/deleted | ✅ |
| 12 | Missing model | routing chain resolution | model_not_found outcome, next candidate | ✅ |
| 13 | Invalid credentials | connection test (secret ref) | connection error status; provider route fails → fallback | ✅ |
| 14 | Expired secrets | expiry on identities; vault ref verification | identity revocation path | 🟡 |
| 15 | Permission escalation | deterministic policy + role gates | deny + streak incident | ✅ |
| 16 | Cross-tenant access | membership guard per request | 403 before read | ✅ |
| 17 | Resource starvation | per-run cost/step caps; workspace/agent budgets | hard block with audited decision | ✅ |
| 18 | Runaway spending | budget checks before launch + per-run caps + cost-anomaly monitor | deny + incident | ✅ |
| 19 | Prompt injection | output pattern scan | flagged, sanitised context, incident | ✅ |
| 20 | Unbounded parallel workflows | declared children + step caps + depth guard | bounded | ✅ |
| 21 | Inconsistent tool outputs | output schema validation | validationErrors recorded; failure surfaced | ✅ |
| 22 | Lost approval callbacks | approval expiry (24h) + execution checkpoint | expired approvals rejected; execution stays pausable | 🟡 |
| 23 | Worker termination (dev server restart) | checkpoints per step | in-process runners lost — executions remain inspectable/replayable; durable queues = roadmap | 🗺️ documented |
| 24 | DB unavailable | Prisma errors | typed 500s; audit writer never breaks the caller silently (logs) | 🟡 |
| 25 | Replay side effects | isReplay flag | side-effecting tools skipped, marked in telemetry | ✅ |

Escalation path for humans: Security Center controls (suspend agent/tool → workspace
emergency stop → human escalation via incident notes), with the audit trail as the
single source of what happened.
