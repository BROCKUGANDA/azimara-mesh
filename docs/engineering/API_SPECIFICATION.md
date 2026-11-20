# AZIMARA MESH — API Specification

All endpoints: JSON in/out, cookie session or API key, `x-workspace-id` header
required (defaults to first membership). Error contract:
`{ "error": { "code", "message", "details? } }` with proper HTTP status
(401 unauthenticated · 403 forbidden · 400/404/409 typed codes · 500 internal).
Success returns the payload directly.

## Auth
| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/auth` | — | Session context (workspaces, roles, org) |
| POST | `/api/auth` | — | Login `{email, password}` → sets httpOnly cookie |
| DELETE | `/api/auth` | — | Logout |

## Agents
| Method | Path | Min role | Description |
|---|---|---|---|
| GET | `/api/agents?q&status&fleetId` | viewer | List with health, spend, active runs |
| POST | `/api/agents` | operator | Register (manifest) → DRAFT + workload identity |
| GET | `/api/agents/{id}?tab=` | viewer | Tab data: overview, configuration, versions, deployments, executions, tools, memory, evaluations, policies, costs, audit |
| PATCH | `/api/agents/{id}` | operator | description, systemPrompt, autonomyLevel, toolPermissions, memoryNamespaces, modelConfig, resourceLimits |
| POST | `/api/agents/{id}` | operator/admin | action: validate/test/ready/publish/pause/resume/retire/archive/rollback/suspend |

## Fleets
`GET /api/fleets` · `POST /api/fleets` `{op: create|pause|resume|rollout|rollback}`.

## Workflows
`GET/POST /api/workflows` · `GET/PATCH/POST /api/workflows/{id}` (actions: publish,
archive, run `{input}`; PATCH validates the spec before saving).

## Executions
| Method | Path | Description |
|---|---|---|
| GET | `/api/executions?status&kind&take` | Explorer list (live-pollable) |
| POST | `/api/executions` | `{kind: agent|workflow, agentId|workflowId, input, isReplay?}` → executionId |
| GET | `/api/executions/{id}` | Detail: spans, redacted tool calls, messages, policy decisions, children |
| POST | `/api/executions/{id}` | action: cancel \| replay |

## Intelligence
| Method | Path | Description |
|---|---|---|
| GET | `/api/models` | Providers, catalog, connections, routing rules, usage |
| POST | `/api/models` | op: connect \| test \| disconnect (BYOK secret refs) |
| GET | `/api/memory?namespaceId` | Namespaces, records, prompt registry |
| POST | `/api/memory` | op: create_namespace \| write \| retrieve (agentId required) \| purge_expired \| delete_record |
| GET | `/api/evals?datasetId` | Datasets, cases, runs, comparisons |
| POST | `/api/evals` | op: run \| create_dataset \| add_case |

## Trust
| Method | Path | Min role | Description |
|---|---|---|---|
| GET | `/api/policies` | viewer | Inventory + recent decisions |
| POST | `/api/policies` | admin | op: create \| update \| **simulate** (returns verdict + matched rules) |
| GET | `/api/approvals?status` | viewer | Approvals with execution links |
| POST | `/api/approvals/{id}` | operator | `{decision: approve|reject, note}` → resumes checkpointed work |
| GET | `/api/audit?action&severity&take` | viewer | Org audit stream |
| GET/POST | `/api/security` | viewer/admin | Incidents + summary; controls: suspend_agent, suspend_tool, emergency_stop, update_incident |
| GET/POST | `/api/identity` | viewer/admin | Members, identities, keys; ops: create_api_key, revoke_api_key, create_service_identity, revoke_identity, change_role, invite |

## Manage
`GET /api/overview` · `GET/POST /api/deployments` (deploy/promote → policy verdict →
approval or deployment; verify_health; rollback; suspend) · `GET /api/environments` ·
`GET /api/usage` · `GET/POST /api/billing` (change_plan, set_spend_cap) ·
`GET/PATCH /api/settings` · `GET/POST /api/activity` (mark_read) ·
`GET/POST /api/schedules` · `GET/POST /api/integrations` · `GET /api/tools`,
`GET/POST/PATCH /api/tools/{id}` (test, set_status, rotate_secret).

## Validation & contracts
- Bodies parsed with typed readers; unknown ops → 400 `BAD_REQUEST`.
- Not-found → 404 with code `NOT_FOUND`; membership failure → 403 `FORBIDDEN`.
- Idempotency: usage events keyed; approval decisions reject double-decides.
- Rate limits: tool-level (per registry row); API-level throttling is roadmap.
