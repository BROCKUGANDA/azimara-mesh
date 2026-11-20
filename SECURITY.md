# Security Policy

## Supported versions

Security fixes are applied to the `main` branch and the deployed staging and
production environments. Older tags are not maintained.

## Reporting a vulnerability

Do **not** open a public GitHub issue for a security vulnerability.

Use GitHub's private vulnerability reporting on this repository, or email
`security@aiazimara.com`. Include:

- affected component and version/commit;
- reproduction steps or a proof of concept;
- impact (tenant isolation, policy bypass, secret exposure, etc.);
- any correlation IDs, with secrets and customer payloads redacted.

You should receive an acknowledgement within 3 working days. We will confirm
the finding, agree a disclosure window and credit you unless you prefer
anonymity.

## Scope

In scope: control-plane APIs, authorization and tenant boundaries, policy and
approval enforcement, execution/workflow engine, model and tool gateways,
memory retrieval authorization, metering and audit, CI/deployment tooling.

Out of scope: third-party model providers, customer-hosted agents, and
issues requiring physical access to the VPS.

## Operating rules

- Deny by default; every protected API enforces authorization server-side.
- Tenant-owned resources are scoped by `workspaceId` at the data layer.
- Secrets are referenced, never returned to clients or written to logs.
- Suspicious activity is recorded as security signals and audit events.
- Vulnerabilities that break tenant isolation or policy enforcement are
  treated as release-blocking.
