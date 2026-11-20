# AZIMARA MESH — Information Architecture

Single-entry application (`/`) with client-side view routing. Navigation groups match
the master directive §33 exactly.

## OPERATE
| View | Route key | Purpose |
|------|-----------|---------|
| Overview | `overview` | Command center: fleet metrics, governance, provider health, daily volume |
| Agent Fleet | `fleet` (+`agentId` param → detail) | List/graph views, filters, fleet cards; detail with 11 tabs |
| Workflows | `workflows` (+`workflowId` → editor) | List + canvas editor (visual/code-first), test runs |
| Executions | `executions` (+`executionId` → detail) | Explorer + trace waterfall, tool calls, policy evidence |
| Schedules | `schedules` | Cron triggers for agents/workflows, pause/resume |
| Activity | `activity` | Org event stream + notifications inbox |

## BUILD
| View | Purpose |
|------|---------|
| Agent Studio | 6-step guided creation wizard (identity → model → tools → memory → limits → review) |
| Agent Catalog | Unified registry across frameworks + registration paths |
| Templates | Starter agents/workflows; marketplace foundations note |
| Model Hub | Providers, connections (BYOK), model catalog, routing rules, token mix |
| Tool Registry | Tools/MCP/HTTP/DB connectors, schemas, risk classes, secure test |
| Knowledge & Memory | Namespaces, records, retrieval authorization test, prompt registry |

## TRUST
| View | Purpose |
|------|---------|
| Evaluation Lab | Datasets, deterministic cases, run suite, comparisons |
| Policies & Guardrails | Inventory, editor, simulation with "why" evidence |
| Security Center | Incidents, denials, monitoring coverage, emergency stop |
| Identity & Access | Members/roles, workload identities, API keys, SSO roadmap |
| Audit Center | Immutable audit trail with action/severity filters |

## MANAGE
| View | Purpose |
|------|---------|
| Deployments | Deployment table, release gates, health verify, rollback |
| Environments | dev/staging/production config + tenancy hierarchy |
| Usage & Costs | Metering breakdowns, forecast, budget bars |
| Team Management | Members, role changes, invites |
| Integrations | Slack/PagerDuty/GitHub/Salesforce/Snowflake/Stripe/Jira |
| Developer Portal | REST surface, TypeScript/Python/CLI snippets, keys |
| Billing | Plans, subscription, spend caps, invoices |
| Settings | Workspace config, organization, runtime transparency |

## Global shell
- Sidebar (grouped nav, environment selector, plan badge) · topbar (workspace switcher,
  breadcrumbs, command palette ⌘K, approvals badge, notifications, user menu) · footer.
- View state lives in a zustand store (single-page router); deep-linkable params are
  view-local (agentId, executionId, workflowId).
