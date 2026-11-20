# AZIMARA MESH — Agent Protocol

How agents register, communicate, delegate and invoke tools without ever holding
another agent's credentials.

## Registration
Any framework registers through the same manifest path (REST `POST /api/agents`;
Studio wizard wraps it):

```json
{
  "name": "Contract Summarizer",
  "category": "knowledge",
  "framework": "langgraph",          // azimara-native | langgraph | crewai |
                                     // openai-agents | mcp-client | custom
  "autonomyLevel": "A1",
  "systemPrompt": "You are ... Never ...",
  "toolPermissions": ["tool-id-1"],
  "memoryNamespaceIds": ["ns-id-1"],
  "primaryModelId": "model-id",
  "monthlyBudget": 25
}
```
Registration creates a **workload identity** (`workload:<slug>`, scopes
`tools:invoke`, `memory:read`, `model:invoke`, key fingerprint) — the agent is never
its owner. Framework adapters map external constructs onto this manifest; no rewrite
is required (directive §6).

## Execution contract
1. Runs start via `POST /api/executions` (or schedule/webhook/delegation triggers).
2. The runner pins the agent version and builds an isolated context.
3. Every model call and tool call passes the deterministic policy layer.
4. Outputs must satisfy the agent's `outputSchemaJson`; the evaluation gate enforces
   format + safety (+ optional score gate).
5. Outputs, tool results and model provenance are redacted before leaving the
   platform boundary; full evidence stays server-side.

## Tool invocation protocol
- Intent emitted by the agent → validated against the tool's input schema →
  policy verdict (`allow | deny | require_approval`) → adapter execution with
  timeout → output schema validation → redaction → injection scan → metering.
- Agents CANNOT: hold provider credentials, reach undeclared tools, repeat a
  side-effecting tool within one run, exceed cost/step/depth caps, or approve their
  own actions.

## Agent-to-agent messaging
Delegation creates a child execution + `AgentMessage` envelope:
```
senderId: workload:<parent>          recipientId: workload:<child>
executionId: <parent run>            correlationId: <shared trace id>
type: task | result | event | control        schemaVersion: 1.0
authContext: inherited scopes (REDUCED — explicitly approved permissions only)
expiryAt: bounded
```
Enforced: max delegation depth 2, per-run intent dedup, scope inheritance is
subtractive only (a child can never gain permissions), silent self-escalation is
impossible (policy checks run under the child's own identity + autonomy).

## Autonomy levels (directive §21)
| Level | Meaning | Enforced behaviour |
|---|---|---|
| A0 Observe | read + report | no mutation intents allowed by policy defaults |
| A1 Recommend | propose actions | tool use allowed, mutations approval-gated |
| A2 Human-approved | prepare, wait | consequential tools → require_approval |
| A3 Bounded autonomous | approved classes only | policy constraints + budgets + depth caps, all audited |

Production agents default to conservative autonomy; A3 requires admin to set.
High-impact actions (critical-risk tools, external transmission, production
deployment) always require approval **regardless of autonomy or model confidence**.
