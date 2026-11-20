## What changed

<!-- Thin vertical slice, user outcome, acceptance criteria. -->

## Verification

- [ ] `bun run typecheck`
- [ ] `bun run lint`
- [ ] `bun run test`
- [ ] `bun run security:scan`
- [ ] Manual scenario (describe):

## Security and tenancy

- [ ] All new resource lookups are workspace-scoped
- [ ] Protected mutations enforce server-side authorization
- [ ] No secrets, tenant ids or payloads in logs or responses
- [ ] Audit event emitted for consequential operations

## Maturity

Mark the capability status: Implemented / Partially implemented / Simulated / Planned / Unavailable.
