# AZIMARA MESH — Pricing (USDC on Base)

Four tiers are represented in the `Plan` table and Billing view. Tier prices are
guidance for pilots, not validated market prices. All payments are made in
ERC-20 USDC on Base; there is no card processor.

## Community — free
- 5 agents · 2 seats · small introductory credit grant
- Registry, sandbox executions, local experimentation, basic usage view

## Builder — $49/mo equivalent in USDC
- 25 agents · 5 seats · $25 included credits
- Agent Studio, workflows, versioning, evaluations, developer APIs

## Team — $199/mo equivalent in USDC
- 100 agents · 20 seats · $100 included credits
- Shared workspaces, roles, fleets, approvals, observability, usage controls

## Enterprise — custom
- 1000 agents · 500 seats · negotiated credits
- OIDC/SCIM, advanced governance, dedicated pools, private deployments,
  custom policies, audit retention, contractual support

## Prepaid credits and pay-per-use

- Send USDC to the treasury and paste the finalized transaction signature in
  the Billing view; the amount is credited exactly once.
- Metered usage draws credits down immediately. When credits run out, the
  remainder is recorded as a pending onchain settlement instead of being
  silently forgiven.
- Pay-per-use beyond credits requires `MESH_PAY_PER_USE=1` (explicit operator
  opt-in) and is always audited.

## Metered consumption
| Meter | Unit price |
|---|---|
| Tokens in / out | provider registry per-Mtok |
| Executions | $0.01 |
| Tool invocations | $0.002 |
| Memory reads | $0.0001 |
| Eval cases | $0.001 |
| Storage | $0.02 / GB-month |

## Guards
- Spend caps hard-block launches; warnings at 90%.
- Plan changes validate the agent count against the target tier.
- Credit balance is never negative; concurrent drawdowns are serialized.

## Positioning rules
No availability/SLA percentages are published until measured. Token payment
tax/legal treatment requires independent review; see BILLING_ARCHITECTURE.md.
