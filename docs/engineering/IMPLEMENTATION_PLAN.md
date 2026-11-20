# AZIMARA MESH — Implementation Plan

Status per phase of the master roadmap (§XV), as actually built in this repository.

## PHASE 0 — Discovery & architecture ✅
Repository audit (this was a green-field scaffold — documented here and in
REPOSITORY_AUDIT notes below), target architecture, threat model highlights
(SECURITY_MODEL.md), design tokens, engineering backlog (= this plan).

## PHASE 1 — Core platform ✅
Organization/workspaces, session auth + RBAC, agent registry + manifests, versioning,
model gateway foundations, tool registry foundations, overview dashboard.

## PHASE 2 — Runtime & orchestration ✅ (single-node)
Isolated runtime context (scoped identity, sandboxed adapters), task scheduling via
schedules + async runners, durable execution (per-step SQLite checkpoints), workflow
engine (DAG/parallel/conditions/approvals/loops/compensation), agent communication
(messages + depth caps), cancellation, resource quotas, Execution Center.

## PHASE 3 — Governance & security ✅
Agent identities, RBAC (roles on every route), deterministic policy engine,
human approvals with resume, secret brokerage references (no raw secrets),
autonomy levels, audit history, Security Center, emergency controls.

## PHASE 4 — Intelligence & evaluation ✅ (deterministic scope)
Memory services (5 kinds, authorization-checked), prompt registry, Evaluation Lab
(deterministic evaluators), regression comparisons, model routing + fallback,
context management, cost visibility. Model-judge scoring: pending methodology.

## PHASE 5 — Complete enterprise product 🟡
Fleet management ✅, Agent Studio ✅, integration catalogue ✅, Deployment Center ✅,
multi-environment promotion ✅ (approval-gated), **SSO/SCIM 🗺️**, **audit exports 🗺️**
(query API exists; export bundles pending).

## PHASE 6 — Commercialization 🟡
Subscription engine ✅, metering ✅, usage analytics ✅, invoices ✅,
customer onboarding (seeded org) ✅, pricing pages (in-app Billing) ✅,
developer portal ✅, marketplace foundations 🗺️ (design only, per directive).

## PHASE 7 — Infrastructure maturity 🗺️
Load testing, chaos testing, multi-region recovery, advanced scaling, security
assessment, independent penetration testing, customer pilots. Pre-requisites are
honestly listed in PRODUCTION_READINESS.md — nothing here is claimed as done.

## Green-field audit note
No functional repository existed before this build (the scaffold was an empty
Next.js template), so `docs/engineering` documents the built system as the current
state rather than a migration: CURRENT_STATE = this build; TECHNICAL_GAP_ANALYSIS =
the 🗺️ rows in FEATURE_MATRIX.md plus the roadmap tables in TARGET_ARCHITECTURE.md.
