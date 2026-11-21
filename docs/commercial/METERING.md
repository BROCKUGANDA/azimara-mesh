# AZIMARA MESH — Metering (onchain settlement)

## Principles

1. **Idempotent writes.** Every usage event has a unique `idempotencyKey`;
   at-least-once engine retries and replays cannot double-bill.
2. **Immutable records.** Usage events are never updated; corrections are new
   adjustment events.
3. **Full attribution.** Workspace, agent, model, tool and execution IDs are
   attached to every event.
4. **Credits first, onchain remainder.** Billable usage immediately draws down
   verified USDC credits. Anything left becomes a pay-per-use settlement.

## Meters

| Kind | When emitted | Quantity | Unit cost |
|---|---|---|---|
| token_in / token_out | each model invocation | tokens | provider registry per-Mtok |
| execution | run finalize | 1 | $0.01 |
| agent_active | run finalize | 1 | $0 |
| tool_invocation | each adapter call | 1 | $0.002 |
| memory_read | authorized retrieval | records | $0.0001 |
| eval_case | each evaluated case | 1 | $0.001 |
| storage_gb_month | monthly job | GB | $0.02 |

## Enforcement

- `checkWorkspaceBudget` / `checkAgentBudget` run before execution acceptance.
- Atomic budget reservations (`BudgetReservation`) serialize concurrent starts
  per workspace with an advisory lock, closing the TOCTOU gap.
- Forecasts: linear month-to-date projection surfaced in the Billing view.

## Onchain credit drawdown

`recordUsage()` writes the usage event and, when the event has a cost, calls
`applyUsageToCredits(workspaceId, cost, 'usage:' + idempotencyKey)`. The ledger
reference is derived from the same key, so a retried producer cannot draw
credits twice. A per-workspace advisory lock and a `min(balance, cost)` clamp
prevent negative balances.

## Settlement

`settleUsagePeriod(workspaceId, periodStart, periodEnd)` is idempotent by
period. It sums usage, applies remaining credits, and records `usageUsd`,
`creditsAppliedUsd`, `remainingUsd` and an optional onchain signature. Invoices
built by `buildMonthlyInvoice` now subtract credits applied by settlement
rather than a plan allowance.

## Production roadmap

Automated onchain pay-per-use collection with a signing keypair (never stored in
the app), per-tenant price books, committed-use discounts and real-time budget
alerts. Metering keys stay identical across all changes.
