# AZIMARA MESH — Metering

## Principles
1. **Idempotent writes.** Every usage event carries a unique `idempotencyKey`;
   at-least-once producers (engine retries, replays) cannot double-bill.
2. **Immutable records.** Usage events are never updated or deleted; corrections are
   new events with adjustments (roadmap: credit notes).
3. **Full attribution.** Each event carries workspace, agent, model, tool,
   execution ids → every dashboard number drills down.

## Meters
| Kind | When emitted | Quantity | Unit cost source |
|---|---|---|---|
| token_in / token_out | each model invocation | tokens | provider registry per-Mtok |
| execution | run finalize | 1 | plan rate ($0.01) |
| agent_active | run finalize | 1 | $0 |
| tool_invocation | each adapter call | 1 | $0.002 |
| memory_read | authorized retrieval | records | $0.0001 |
| eval_case | each evaluated case | 1 | $0.001 |
| storage_gb_month | monthly job (demo: seed) | GB | $0.02 |
| seats | subscription seats | seats | plan price |

## Enforcement
- `checkWorkspaceBudget` / `checkAgentBudget` run **before** any execution is
  accepted; projected (spent + incremental) > cap → hard deny + audited policy
  decision + warning event.
- Forecasts: linear month-to-date projection (spent/dayOfMonth × daysInMonth)
  surfaced in Usage & Billing with 90% warnings.

## Aggregation
`usageBreakdown(workspaceId)` computes month-to-date, forecast, byKind/byAgent/
byModel/byTool rollups and daily series in one pass — the Usage & Costs view is a
pure projection of this.

## Invoicing
`buildMonthlyInvoice(periodStart, periodEnd)` folds usage into line items per meter,
subtracts plan-included credits, and writes an immutable Invoice (number, period,
lines JSON, status). The demo org's previous-month invoice was generated from real
seeded usage events — the same code path a production billing job would use.

## Production roadmap
Stripe-class charging + payment-failure dunning, per-tenant price books, committed
use discounts, real-time budget websocket alerts. Metering keys stay identical.
