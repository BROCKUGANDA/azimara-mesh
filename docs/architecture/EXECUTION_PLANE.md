# AZIMARA MESH — Execution Plane

Two engines execute work: the **agent runner** (`src/lib/execution-engine.ts`) and the
**workflow walker** (`src/lib/workflow-engine.ts`). Both are async in-process runners
whose state is checkpointed to the database after every step.

## Run lifecycle (agent)
```
startAgentRun(input)
 ├─ state checks (archived/paused/draft) → typed errors
 ├─ workspace budget check ──────────────→ deny: audit + BUDGET_EXCEEDED
 ├─ agent budget check ───────────────────→ deny: BUDGET_EXCEEDED
 ├─ limits merge (steps/timeout/cost/depth/iterations)
 ├─ workload identity resolution (provision if missing)
 ├─ Execution row (status=queued, budgetCaps, correlationId, agentVersion pin)
 └─ void runAgentExecution(...)           ← async runner

runAgentExecution
 1 context_assembly   input schema validation, system prompt, tool manifest
 2 memory_retrieval   per-namespace authorization → records or audited denials
 3 bounded loop (≤ maxIterations)
 │   ├─ routeModel: policy-checked routing + fallback chain
 │   ├─ invokeModel: real GLM provider or deterministic runtime, tokens metered
 │   ├─ cost cap check → abort over budget
 │   └─ tool intents (deduped per run):
 │        policy_check step (deterministic verdict)
 │        ├─ deny        → denied step, security hook (streak detection)
 │        ├─ require_approval → Approval + checkpoint + waiting_approval (pause)
 │        └─ allow       → tool_call step (schema→adapter→validate→redact→meter)
 4 delegation (depth-capped, scoped, audited; AgentMessage envelope)
 5 evaluation gate (format, safety scan, groundedness; evalProfile gates)
 6 finalize: succeeded / failed / timed_out / cancelled
     └─ usage events, agent health EMA update, cost-anomaly + failure-streak hooks
```

## Approval resume
`resumeAfterApproval(executionId, approved, reviewer)`:
- reject → execution failed with rejection provenance; audit `approval.reject`.
- approve → audit `approval.approve`, execute the checkpointed tool intent
  (skipping re-inference), finalize, update health, and — if the execution belongs to
  a paused workflow — trigger `resumeWorkflowFromChild(parentId)`.

## Workflow walker
Recursive DAG walk from the single input node:
- `agent` node → child execution (parent link, depth 1) — if the child pauses on an
  approval, the **workflow pauses** (checkpoint `awaiting_child_approval`) and resumes
  post-decision using the child's already-computed output (no duplicate side effects).
- `tool` node → policy check + adapter; replay mode skips high/critical tools.
- `condition` → safe expression evaluator (closed operator set, no eval()).
- `parallel` → Promise.all over declared children (fan-out/fan-in).
- `approval` node → workflow-level Approval + checkpoint + WorkflowPaused.
- `loop` → bounded iterations (≤5, and ≤ maxIterationsPerNode).
- `delay` → bounded sleep (3s cap in demo; durable timers in production target).
- `error` boundary / compensation → configured tool runs, then fail.
- Validation: duplicate keys, unknown endpoints, exactly-one input, reachability,
  self-loop rejection.

## Bounded resources (enforced)
maxSteps 10–24 · timeoutMs 60–180s · maxCostUsd 1–5 · delegationDepth ≤2 ·
loop iterations ≤5 · tool intents deduped per run · 45s provider timeout with
deterministic fallback.

## Honest limitations
In-process runners die with the dev server (no external queue yet); SQLite
checkpoints give single-node durability only. Recovery: failed runs keep full trace
evidence and are replayable (replay suppresses external mutations).
