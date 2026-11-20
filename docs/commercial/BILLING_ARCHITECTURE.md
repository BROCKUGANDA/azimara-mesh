# AZIMARA MESH — Billing Architecture

## Components
1. **Subscription** (`Subscription`): plan, status (active | past_due | canceled),
   seats, spendCapUsd, payment method reference, period window. One per workspace.
2. **Metering pipeline**: engines/events → `UsageEvent` (idempotencyKey unique) →
   aggregations (`usageBreakdown`) → budget enforcement (`checkWorkspaceBudget`,
   `checkAgentBudget`).
3. **Invoicing**: `buildMonthlyInvoice` → `Invoice` (number, period, linesJson,
   subtotal, credits, total, status draft→open→paid|failed). Immutable once issued.
4. **Controls UI** (Billing view): plan cards with switch (validated: agent count vs
   target tier), spend-cap editor (also updates workspace cap → engine enforcement),
   invoice table with line-item drill-down.

## Flow
```
engine event ──idempotent──▶ UsageEvent ──▶ budgets (deny/warn)
                                    └──▶ month rollup ──▶ Invoice ──▶ (charging 🗺️)
plan change ──▶ Subscription (+org.planTier) ──▶ audited
spend cap  ──▶ Subscription.spendCapUsd + Workspace.monthlyBudget ──▶ audited
```

## Guarantees implemented
- No double-billing under retries (unique idempotency keys; duplicate inserts are
  swallowed by constraint and logged at debug only).
- Credits never exceed subtotal (clamped in invoice build).
- Every billing mutation is an audit event with before/after.
- Payment method is a reference only — raw payment credentials never enter the
  platform (they live with the payment provider; integration roadmap).

## Failure handling
- Payment failure → status past_due (roadmap dunning flow); metering continues,
  launches may be gated by policy (status-based rule hook exists in the policy
  context).
- Invoice regeneration is append-only (new invoice, not mutation).

## Enterprise
Contract terms, custom credits, PO-based invoicing and purchase-order references are
Enterprise-tier roadmap items; the data model already carries period windows and
immutable lines to support them.
