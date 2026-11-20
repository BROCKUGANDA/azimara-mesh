# AZIMARA MESH — Intelligence Plane

## Model gateway (`src/lib/model-gateway.ts`)
- **Registry**: providers (Azimara Runtime, GLM, OpenAI, Anthropic, Google,
  AWS Bedrock, Azure AI, Ollama) with status/latency/error-rate; models with context
  window, max output, per-Mtok pricing, capability and task-class metadata.
- **Routing** (`routeModel`): builds the chain [primary, …fallbacks] from the agent's
  model config; skips missing models and offline providers; evaluates the
  deterministic policy layer per candidate (`model_route` action — provider locks for
  confidential/restricted data actually deny here); returns the first allowed model
  with the full tried-chain for the trace.
- **Invocation** (`invokeModel`):
  - `glm` provider → real LLM call through z-ai-web-dev-sdk (server-only, dynamic
    import, 45s race timeout). Failure or timeout falls back to the deterministic
    runtime and is logged — never presented as a real provider answer.
  - `azimara-runtime` (default) → deterministic, category-aware generation with
    structured tool/delegation intents. Used for evaluation, replay and offline
    safety; responses are labelled `simulated: true` in traces.
  - Token accounting: estimated (chars/4) for the local runtime, metered for real
    calls; cost computed from per-Mtok prices; usage events written per direction.

## Memory services (`src/lib/memory.ts`)
- Namespace kinds (working/episodic/semantic/shared/longterm) with classification
  ceilings and declared-scope authorization:
  - restricted namespaces: never accessible unless explicitly declared;
  - semantic/shared/longterm: require declaration (least privilege);
  - working/episodic: execution-scoped, implicit.
- Retrieval: TTL-filtered, deterministic keyword-overlap scoring, top-K; usage
  metered; denied access returns reason (audited by the engine as policy decision).
- Writes: classification ceiling check, poisoning detection (injection pattern list)
  rejecting toxic content before persistence.
- Retention: `enforceRetention` deletes expired records (manual trigger + maintenance
  path).

## Evaluation engine (`src/lib/eval-engine.ts`, `eval-runtime.ts`)
- Deterministic execution preview per agent category (repeatable, offline).
- Checks: contains / notContains / regex / JSON format / min length / refusal scan /
  latency bounds — weighted per case; pass rate, avg score, latency, cost per run.
- Comparisons across runs for version/prompt regression analysis.
- Model-judge scoring intentionally excluded until a documented, calibrated
  methodology exists (directive §26).

## Optimization hooks (directive §27)
Evidence-based recommendations are computed from operational data in the Usage view
(forecast vs cap, per-model cost/token efficiency) — the platform surfaces the
evidence; it never mutates production agent configurations silently.
