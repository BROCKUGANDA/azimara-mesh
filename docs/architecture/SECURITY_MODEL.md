# AZIMARA MESH — Security Model

## Identity
| Principal | Mechanism | Distinguishable from |
|---|---|---|
| Human user | HMAC-signed session cookie, scrypt password, MFA flag | everything |
| Agent workload | ServiceIdentity (kind=workload, agentId-bound, scope list, key fingerprint) | owner/operator/provider |
| Service account | ServiceIdentity (kind=service_account, explicit scopes) | users |
| API client | ApiKey — SHA-256 hashed at rest, prefix shown, raw secret returned exactly once | users |
| Delegated execution | child execution carries parentExecutionId + depth + inherited (reduced) scope list | parent |

Execution records persist `identitySubject` — the exact principal that ran.

## Authorization
- **RBAC** per workspace membership: owner > admin > operator > viewer; every route
  resolves the caller's role for the target workspace first; non-members get 403
  before any read. Role gates: policy/billing/identity/suspensions = admin; role
  change = owner; A3 autonomy + production promotion = admin.
- **ABAC**: environment gates (production promotion requires approval), data-class
  rules (provider locks), budget state (caps deny launches), time (hour-of-day rules
  supported).
- **Separation of duties**: edit ≠ deploy ≠ authorize — publishing requires admin,
  deploying to production requires admin + policy approval, approvals require admin/
  operator with named deciders recorded.

## Deterministic policy layer
`evaluatePolicy(workspaceId, ctx, subjectAgentId)` — deny-wins, then
require_approval, default allow; rules over tool.riskClass/slug, dataClass,
environment, costUsd, provider, hourOfDay, autonomyLevel; applies-to scoping by
agent/tool/environment/data-class/task-class. Runs on **every** tool invocation,
model route, memory read (denials), and deployment — not just at start.
Every verdict is persisted (`PolicyDecision`) with matched rules + context — the
"why" is queryable in the UI.

## Human oversight
Approval classes: tool_usage, financial, deployment, external_transmission,
privileged, delegation. Each carries: requested-by identity, risk class, reviewer
role, expiry (24h), decision note, decided-by/at, execution link. Approving resumes
the checkpointed execution; rejecting fails it with provenance. Rejected/expired
approvals never execute.

## Untrusted input defenses (tool runtime)
1. Input schema validation before any adapter.
2. Timeout per tool; suspended tools refuse execution.
3. Output schema validation; 8KB output cap; secret redaction (sk-/AKIA/PEM/key-value
   patterns) on inputs, outputs and errors.
4. Prompt-injection pattern scan on outputs → Security Center incident + flagged step.
5. Deterministic adapters only in this deployment — external egress disabled by
   policy; simulated responses are labelled as such in traces.

## Security monitoring (`security-monitor.ts`)
- Streak detection: ≥3 policy denies per agent/10min → permission_violation incident.
- Injection flags from tool outputs → prompt_injection incident (deduped per
  agent/hour).
- Cost anomaly: execution cost > 8× agent average and > $0.05 → incident.
- Failure streaks: 3 consecutive failures → repeated_failure incident.
- Controls: suspend agent (pauses + suspends prod deployments), suspend tool,
  workspace emergency stop (pauses agents, cancels active executions, suspends prod).
  Monitoring and audit continue while agents are paused.

## Abuse-test coverage status
Implemented and exercised: forged/insufficient permissions (403 path), cross-workspace
reads (membership guard), tool schema violations, injection-pattern outputs, secret
redaction, runaway cost (budget + per-run caps), delegation depth, duplicate tool
intents, approval bypass (pause + expiry). Remaining for production: replay-attack
hardening with signed nonces, malicious-plugin/package scanning, dependency
verification, independent penetration test (documented as roadmap).
