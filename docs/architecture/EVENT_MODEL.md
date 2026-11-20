# AZIMARA MESH — Event Model

The platform writes an append-only evidence stream. In this build events are
persisted directly to SQLite tables (production target: NATS JetStream topics with
the same payloads).

## Execution events (ExecutionStep + Execution)
| kind | emitted when | key detail fields |
|---|---|---|
| context_assembly | run start | schema ok, tools granted, autonomy, dataClass |
| memory_retrieval | after retrieval | namespaces queried, records used, denied list |
| model_request | per turn | model, provider, routing chain, temperature, simulated |
| policy_check | per tool/model/memory verdict | decision, reason, matched rules |
| tool_call | per invocation | tool, latency, simulated, injection flag, preview |
| approval_wait | gate hit | approvalId, tool, riskClass |
| delegation | child dispatch | childExecutionId, inherited scopes, depth cap |
| evaluation | gate | score, checks[], gate threshold |
| output | finalize | chars, redacted |

Terminal states on `Execution`: succeeded · failed · cancelled · timed_out ·
dead_letter (+ waiting_approval pause). `retryable` is recorded in the checkpoint on
failure with classified backoff candidates.

## Governance events (AuditEvent, org-scoped)
`auth.login`, `agent.create|update|publish|rollback|pause|resume|suspend`,
`workflow.create|update|publish|start|complete|fail|archive`, `execution.start|
complete|fail|cancel|replay`, `deployment.create|approval_requested|health_check|
rollback|suspend`, `policy.create|update`, `approval.approve|reject`,
`security.suspend_agent|suspend_tool|incident_update`,
`memory.namespace.create|record.write|record.delete|retention.enforce`,
`evaluation.run|dataset.create`, `model.connection.create|test|delete`,
`apikey.create|revoke`, `identity.create|revoke`, `team.role_change|invite`,
`billing.plan_change|spend_cap`, `schedule.create|pause|resume|delete`,
`integration.*`, `fleet.create|pause|resume|rollout|rollback`,
`workspace.emergency_stop_test`.

Severity: info → notice → warning → critical (suspensions, emergency stop).

## Notification events (Notification)
approval_request · security · budget · deployment · evaluation · system — surfaced in
the topbar dropdown with deep links (`linkView`) and read tracking.

## Security events (SecurityIncident)
prompt_injection · permission_violation · cost_anomaly · repeated_failure ·
credential_anomaly · data_exfiltration · communication_anomaly — severity model,
investigation notes timeline, resolution provenance.

## Metering events (UsageEvent)
At-least-once producers, idempotency keys make writes exactly-once:
`{executionId}:execution` · `{executionId}:token_in|out:{model}:{tokens}:{ts}` ·
`tc_{toolCallId}` · `mem_{executionId}_{ns}_{ts}` · `eval_{run}_{case}` ·
monthly storage keys. Aggregation → usage breakdowns → invoices.

## Message envelope (A2A, AgentMessage)
sender/recipient identity, tenant context, executionId, correlationId, type
(task|result|event|control), schemaVersion, payload, authContext, expiryAt, status
(delivered|rejected|expired|duplicate). Enforced bounds: authenticated identities,
schema validation, scope-aware permissions, delegation-depth cap, duplicate-intent
suppression, rate limits (tool-level), audit records.
