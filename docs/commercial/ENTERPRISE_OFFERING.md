# AZIMARA MESH — Enterprise Offering

## What Enterprise adds (roadmap tiers, honestly surfaced in-product)
| Capability | Status | Notes |
|---|---|---|
| SSO (SAML/OIDC) | 🗺️ | Local scoped accounts + MFA flag today; membership model ready for IdP linkage (`User.ssoProvider`) |
| SCIM provisioning | 🗺️ | Membership CRUD APIs already exist as the target surface |
| Advanced governance | ✅ core shipped | Policy engine, audit stream, approvals, autonomy controls |
| Dedicated runtime pools | 🗺️ | Runtime type field exists (`managed/vpc/self_hosted/kubernetes/local`) |
| Private / customer-VPC deployments | 🗺️ | Deployment runbook + topology tables prepared |
| Custom policies | ✅ shipped | Full policy editor + simulation |
| Audit retention & exports | 🟡 | Queryable stream shipped; export bundles + retention windows roadmap |
| Enterprise support + custom SLAs | 🗺️ | No SLA published until measured |

## Deployment models (directive §13 progression)
1. Managed cloud runtime — **shipped** (this build, in-process demo runtime).
2. Customer VPC runtime — designed; isolated execution context + scoped identity
   implemented at the engine level, network packaging pending.
3. Self-hosted — Docker/Compose packaging roadmap.
4. Kubernetes runtime — runtime-type plumbing exists; operator roadmap.
5. Local development runtime — deterministic offline runtime already works fully
   offline (evaluation, replay, demo org).

## Security posture commitments
- Tenancy isolation by construction (workspace-scoped queries + membership guard);
  Postgres RLS + independent penetration test before enterprise GA.
- Secrets only as brokerage references; BYOK via provider connections.
- Audit evidence org-scoped and immutable; exports for customer SIEM (roadmap).

## Commercial terms
Custom contracts, PO invoicing, committed credits, revenue-shared marketplace packs
(Phase 6+). Nothing is claimed as GA that is not GA: the product UI labels SSO/SCIM
and private deployments as Enterprise-tier roadmap items explicitly.
