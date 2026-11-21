# AZIMARA MESH — Billing Architecture (onchain, Base)

The card-processor rail has been removed. Value enters Mesh only through a
verified Base ERC-20 USDC transfer to the configured treasury address.

## Components

1. **Payment rail** (`src/lib/billing-provider.ts`): Base JSON-RPC verification
   of `eth_chainId`, `eth_getTransactionReceipt` and `eth_blockNumber`. It
   matches the canonical USDC contract, the ERC-20 `Transfer` topic, the
   treasury address, a successful receipt and the required confirmation count.
   Base Sepolia is the default; **Base mainnet requires explicit opt-in**.
2. **Onchain payments** (`OnchainPayment`): one row per verified tx hash,
   unique by hash. A duplicate submission cannot double-credit. Each row stores
   network, chain id, token contract, payer, destination and amount.
3. **Credit ledger** (`CreditLedgerEntry`): append-only signed entries
   (`+ topup`, `- usage`) with a running balance and unique
   `(workspaceId, kind, reference)`. A per-workspace advisory lock serializes
   concurrent payments and drawdowns.
4. **Metering** (`UsageEvent`): idempotent, immutable, fully attributed usage.
   Billable usage draws credits down via the same idempotency key.
5. **Settlement** (`UsageSettlement`): idempotent by period; prepaid credits
   are applied first and the remainder is recorded as pending pay-per-use.
6. **Entitlements**: derived from verified credits / onchain-activated plan /
   explicit pay-per-use opt-in — never card status.

## Treasury (configured)

`0x9cb57c0dAF38462447509998647eD06488CBeBf8`

The treasury is a public address. The platform never holds private keys and
performs only public RPC reads; no signing capability is required to verify a
payment.

## Flow

```
USDC transfer → tx hash → verify (chain id, receipt, logs, confirmations)
    → OnchainPayment (unique hash) → +CreditLedgerEntry
engine event → UsageEvent (unique key) → -CreditLedgerEntry (same key)
    → usageBreakdown → settleUsagePeriod → Invoice → remainder onchain payable
```

## Guarantees

- No double-billing under retries: unique usage keys, unique payment hashes,
  unique ledger references; all writes are atomic transactions.
- Balance cannot go negative (`min(balance, amount)` under an advisory lock).
- Chain-id binding prevents a transaction from another EVM chain being replayed.
- Confirmations prevent deep-reorg credits.
- Every payment, settlement and plan change emits an audit event.

## External gates (not code)

Mainnet opt-in (`ONCHAIN_NETWORK=base-mainnet`), a funded treasury, and the
independent legal/tax review in `docs/commercial/LEGAL_TAX_REVIEW.md`.
