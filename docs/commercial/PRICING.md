# AZIMARA MESH — Pricing

Four tiers (implemented in `Plan` table + Billing view). Prices are the product
surface; the demo org runs on Team.

## Community — $0
- 5 agents · 2 seats · $5 included metered credits
- Basic agent registry, sandbox executions, local experimentation, basic usage info

## Builder — $49/mo
- 25 agents · 5 seats · $25 included credits
- Agent Studio, workflow orchestration, version management, evaluation tools,
  developer APIs

## Team — $199/mo
- 100 agents · 20 seats · $100 included credits
- Shared workspaces, team roles, agent fleets, advanced integrations,
  approval workflows, execution observability, usage controls

## Enterprise — custom
- 1000 agents · 500 seats · negotiated credits
- SSO (SAML/OIDC), SCIM, advanced governance, dedicated runtime pools, private
  deployments, custom policies, audit retention, enterprise support, custom SLAs

## Metered consumption (billed beyond credits)
| Meter | Unit price (demo defaults) |
|---|---|
| Tokens in / out | per-provider per-Mtok pricing (registry metadata) |
| Executions | $0.01 per run |
| Tool invocations | $0.002 per call |
| Memory reads | $0.0001 per read |
| Eval cases | $0.001 per case |
| Storage | $0.02 / GB-month |

## Guards
- Spend caps (workspace + fleet + agent) hard-block launches; warnings at 90%.
- Plan changes validate agent count against the target tier's maxAgents.
- Overage requires explicit cap increases (audited `billing.spend_cap`).

## Positioning rules
No availability/SLA percentages are published until measured (see
RELIABILITY_TARGETS.md). Enterprise SLAs are contractual options, not marketing.
