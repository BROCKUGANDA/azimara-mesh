# AZIMARA MESH — Product Vision

**The Governed Operating Fabric for Autonomous AI.**
Every Agent. One Governed System.

## The problem

Organisations are adopting autonomous AI agents faster than they can govern them. Agents
hold credentials, call tools, move money, talk to customers and to each other — usually
outside any operational perimeter. The result is unpredictable spending, untraceable
side effects, no approval trail and no way to answer the only question that matters at
board level: *what are our agents doing right now, and are they allowed to do it?*

## The product

AZIMARA MESH is the enterprise operating system for AI agent fleets. It is the control
plane between AI models, autonomous agents, business systems and the people responsible
for governing them. Organisations use it to:

1. Register and create agents (any framework — Azimara Native, LangGraph, CrewAI,
   OpenAI Agents SDK, MCP clients).
2. Configure provider-neutral model access (BYOK, routing, fallback, budget caps).
3. Assign tools with deterministic, schema-validated, risk-classified permissions.
4. Organise agents into fleets with shared budgets and policies.
5. Build multi-agent workflows with approval checkpoints and bounded loops.
6. Execute, monitor, trace and replay every run — with evidence, not vibes.
7. Evaluate quality and safety against deterministic suites.
8. Enforce human approval for consequential actions.
9. Meter, attribute and bill every token, call and second.
10. Audit everything, forever.

## What this is not

- Not an agent builder toy. The visual studio exists, but the versioned spec — not the
  diagram — is the durable source of truth.
- Not a chatbot manager. There is no chat-first UX; there is an operations console.
- Not a framework. Customer agents are never rewritten into an Azimara framework.

## Design principles

1. **Deterministic trust.** Permissions and policy are enforced by code, never by
   prompting an LLM to behave.
2. **Evidence over vibes.** Every consequential action produces a trace span, a policy
   decision, a metered usage event and an audit record.
3. **Least privilege by default.** New agents get no tools, no memory namespaces and
   conservative autonomy (A1). Restricted data is unreachable unless explicitly granted.
4. **Bounded everything.** Steps, delegation depth, cost, timeout and loop iterations
   are all capped and enforced.
5. **Honest telemetry.** Sample data is labelled as sample data. Nothing is manufactured.
