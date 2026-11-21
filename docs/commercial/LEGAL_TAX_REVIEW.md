# Legal and tax review — token payments (PENDING)

**Status: NOT COMPLETE.** This document is a checklist for a qualified advisor.
No legal or tax conclusion is asserted here. Do not treat token payments as
legally reviewed until every item below has a named owner, a signed opinion and
a date.

## Scope requiring independent review

1. **Classification of USDC payments** — whether prepaid credits and
   pay-per-use settlement are treated as revenue, deferred revenue, or another
   instrument in each operating jurisdiction (DIFC/UAE, target markets).
2. **VAT / sales tax / GST** — point of supply, registration thresholds,
   invoice content and reverse-charge rules for platform services paid in USDC.
3. **Corporate tax** — recognition timing for onchain receipts and the
   settlement ledger; treatment of chain fees and any token price movement.
4. **Consumer protection** — disclosure of non-reversibility, refund policy,
   dispute handling and unambiguous pricing in USD-equivalent USDC.
5. **AML/KYC obligations** — whether accepting USDC from arbitrary wallets
   triggers screening/travel-rule duties; sanctions screening of payer wallets.
6. **Securities/commodities law** — confirm the credit and settlement model is
   not a regulated financial product or e-money service.
7. **Privacy** — publishing payer wallet addresses in audit/detail records;
   data-minimisation and retention alignment with the privacy notice.
8. **Accounting policy** — stablecoin fair-value vs. USD-unit accounting and
   reconciliation controls (onchain balance vs. `CreditLedgerEntry`).

## Open items (must be closed before commercial launch)

| # | Item | Owner | Status |
|---|---|---|---|
| 1 | Jurisdictional classification memo | External counsel | Not started |
| 2 | Indirect-tax registration analysis | Tax advisor | Not started |
| 3 | Refund/dispute policy published | Product + counsel | Not started |
| 4 | Sanctions screening for payer wallets | Security + compliance | Not started |
| 5 | Accounting policy sign-off | Finance | Not started |
| 6 | Privacy notice updated for wallet data | Privacy owner | Not started |
| 7 | Mainnet go-live decision | Operator | Not started |

## Technical controls that support the review (already implemented)

- Every verified payment is bound to a Base chain id, USDC contract, treasury
  address, transaction hash and confirmation count.
- Payment signatures are unique; credits are append-only with running balances.
- Every payment/settlement emits an audit event.
- No private keys are held by the platform; only public RPC reads are used.

These controls are evidence for the review, not a substitute for it.
