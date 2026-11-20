# Contributing

Thanks for helping improve Azimara Mesh.

## Before you start

- Read the [PRD](docs/product/PRD.md) and the
  [coverage register](docs/PRD_COVERAGE.md).
- Pick a thin vertical slice with a testable user outcome.
- For anything touching auth, policy, execution or tenancy, write the security
  and failure-mode test first.

## Local workflow

```bash
bun install --frozen-lockfile
bunx prisma generate
bunx prisma db push
bun run typecheck
bun run lint
bun run test
bun run security:scan
```

## Pull requests

- One concern per PR. Reference the issue.
- Complete the PR template, including the maturity classification.
- Never include `.env`, `*.db`, session secrets, customer data or raw payloads.
- Do not weaken or delete failing tests to obtain a green pipeline. If a gate
  must be waived, record owner, reason, scope and expiry in the PR.

## Commit and review conventions

- Clear imperative subject line.
- Security-sensitive paths require CODEOWNERS review.
- Deployment changes require a documented rollback plan.

## Reporting issues

Use the issue templates. Redact tenant identifiers and payloads. Security
issues follow [SECURITY.md](SECURITY.md).
