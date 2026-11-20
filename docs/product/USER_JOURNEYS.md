# AZIMARA MESH — User Journeys

## J1. Operator runs a governed agent task (golden path)
1. Signs in (`ada@azimara.ai`, Owner) → lands on **Fleet Overview**.
2. Opens **Agent Fleet**, clicks **Research Analyst** → detail page.
3. Clicks **Run now**. The run passes budget checks and workload-identity resolution.
4. Toast confirms the execution ID; operator opens **Executions**.
5. The new execution appears at the top, polling live. Clicking it opens the
   **trace waterfall**: context → memory → model → policy check → tool call →
   evaluation → output. Tool payloads are redacted by default.
6. Policy decisions panel shows *why* every decision was made.
7. Operator clicks **Safe replay** to re-run without external side effects.

## J2. Financial action requires a human
1. **Invoice Reconciler** receives "refund $240 for ACC-4821".
2. Runtime emits a `payment-refund` intent (risk: critical).
3. Policy **High-risk tool approval gate** returns `require_approval`; the execution
   checkpoints and pauses (`waiting_approval`); notification created.
4. Approvals badge in the topbar shows a pending count. Operator opens the execution,
   reviews the checkpoint evidence, clicks **Approve** with a note.
5. Execution resumes, executes the approved tool call, finalizes `succeeded`.
6. Everything above is in the audit trail.

## J3. Workflow with a governed pause
1. Operator runs **Nightly Ops Report** from the Workflows editor (**Test run**).
2. Fan-out starts Data Analyst + Ops Watchdog concurrently.
3. Data Analyst's SQL tool (risk: high) hits the approval gate → child pauses →
   **the whole workflow pauses** with a checkpoint.
4. Operator approves → the workflow resumes, posts the digest, succeeds.
5. Recent-runs table shows the full lifecycle.

## J4. Compliance analyst inspects governance
1. **Lena (Viewer)** — read-only — opens **Policies & Guardrails**, runs the
   **Policy simulation** for a high-risk tool in production: verdict `require_approval`
   with matched-rule evidence.
2. Opens **Audit Center**, filters `severity=critical`, exports her findings.
3. Opens **Security Center** to review the prompt-injection incident and its notes.

## J5. Engineer builds a new agent
1. **Agent Studio** wizard: identity → model routing → tools → memory → limits → review.
2. Saves as draft, publishes (immutable v0.1.0), then requests promotion from
   **Deployments**. Production promotion triggers the deployment approval gate.
3. After approval, health verification computes live error rate; canary strategy
   available.

## J6. Finance reviews consumption
1. **Usage & Costs**: month-to-date, forecast, budget bars, breakdowns by
   agent/model/tool/kind, budget alerts.
2. **Billing**: plan cards, spend cap control, invoice with per-meter line items and
   credit deduction. Payment charging is roadmap (honest label in Settings).

## J7. Emergency
1. Security anomaly raises an incident (e.g. cost > 8× agent average).
2. Operator opens **Security Center** → incident detail → starts investigation /
   contains / resolves with notes; can suspend the agent or tool.
3. Worst case: **Workspace emergency stop** (admin) pauses all agents, cancels all
   active executions, suspends production deployments — monitoring stays up.
