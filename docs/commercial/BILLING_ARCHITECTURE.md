# AZIMARA MESH — Billing Architecture (onchain)

The card-processor rail has been removed. Value enters Mesh only through a
verified Solana SPL USDC transfer to the configured treasury token account.

## Components

1. **Payment rail** (`src/lib/billing-provider.ts`): Solana JSON-RPC verification
   of finalized transactions. `verifyUsdcPayment(signature)` inspects parsed
   SPL-token instructions, matches the treasury ATA and USDC mint, and returns
   the payer and amount. Devnet is the default; mainnet is explicit opt-in.
2. **Onchain payments** (`OnchainPayment`): one row per verified signature,
   unique by signature. A duplicate submission cannot double-credit.
3. **Credit ledger** (`CreditLedgerEntry`): append-only signed entries
   (`+ topup`, `- usage`). Every entry stores the resulting balance and a unique
   `(workspaceId, kind, reference)`, so retries are no-ops. Per-workspace
   `pg_advisory_xact_lock` serializes concurrent payments and drawdowns.
4. **Metering** (`UsageEvent`): idempotent, immutable usage events with full
   tenant/agent/model/tool/execution attribution. Billable usage draws credits
   down by the same idempotency key.
5. **Settlement** (`UsageSettlement`): idempotent by `(workspaceId, periodStart)`.
   Prepaid credits are applied first; the remainder is recorded as pending
   pay-per-use liability with an optional onchain signature.
6. **Entitlements**: derived from verified credits, an active plan activated by
   an onchain payment, or explicit pay-per-use opt-in — never from card status.

## Flow

```
USDC transfer → tx signature → verifyUsdcPayment(finalized RPC)
    → OnchainPayment (unique) → +CreditLedgerEntry
engine event → UsageEvent (unique key) → -CreditLedgerEntry (same key)
    → usageBreakdown → settleUsagePeriod → Invoice → remaining onchain payable
```

## Guarantees

- No double-billing under retries: unique usage keys, unique payment signatures,
  unique ledger references; all writes are atomic in Postgres transactions.
- Credit balance cannot go negative (lock + `min(balance, amount)`).
- Every payment, settlement and plan change produces an audit event.
- No raw wallet keys, seed phrases or card data ever enter the platform. The
  treasury is a public address; only the HTTP RPC is used for verification.

## Failure handling

- Unverifiable/failed/non-finalized transactions are rejected without crediting.
- RPC timeout is bounded (8s) and never blocks unrelated requests.
- Insufficient credits do not block safe cancellation or audit recording;
  new work is gated by budgets and explicit pay-per-use opt-in.
- Disputes/refunds are handled onchain and recorded as an adjustment entry.

## External gates (not code)

Live mainnet mode requires `SOLANA_CLUSTER=mainnet-beta`, a funded treasury ATA,
an explicit operator opt-in, and a tested reconciliation process. Legal/privacy
review of token payments and tax treatment is a separate human gate.
