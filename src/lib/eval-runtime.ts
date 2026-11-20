// Offline evaluation runtime — deterministic, repeatable agent output generation for
// the Evaluation Lab and regression suites (no external calls, no randomness).

import { db } from '@/lib/db'
import { jparse } from '@/lib/types'

const CATEGORY_RESPONSES: Record<string, (topic: string, keywords: string[]) => string> = {
  research: (t, k) => `Research summary on ${t}:\nKey signals: 1) ${k[0] ?? 'the topic'} shows sustained cross-source activity; 2) source reliability variance is the primary risk; 3) recommended deep-dive: ${k[1] ?? 'adjacent segments'} with citation pass.\nConfidence: medium.`,
  customer_ops: (t) => `Triage complete for "${t}".\nClassification: ${/refund|billing|charge|invoice/i.test(t) ? 'billing' : /bug|error|crash|fail/i.test(t) ? 'technical' : /how|where|question/i.test(t) ? 'informational' : 'general'}.\nRecommended action: respond with resolution path; escalate to human owner on negative sentiment.`,
  data_analysis: (t) => `Analysis complete for ${t}.\nMethod: validated query execution; results checked against schema.\nResult: metrics computed over the current window; notable variance flagged. Confidence: medium.`,
  coding: (t) => `Review verdict for ${t}:\nStatic checks: 2 advisories (naming, unused import), 0 blockers.\nSuggested change is mechanical and low risk.`,
  monitoring: (t) => `Watch assessment for ${t}:\nNo threshold breach above warning level. Next evaluation on normal cadence.`,
  planning: (t) => `Plan for ${t}:\n1) scope confirmation; 2) data gathering; 3) draft execution with checkpoints; 4) review gate before production mutation.`,
  knowledge: (t) => `Answer assembled from approved knowledge sources for "${t}": the workspace guidance applies; records retrieved within authorized namespaces only.`,
  workflow: (t) => `Workflow task processed for "${t}": inputs validated, dependencies satisfied, outputs emitted per contract.`,
  autonomous: (t) => `Bounded autonomous task executed for "${t}": operations stayed within approved classes, budgets and termination conditions.`,
  custom: (t) => `Task processed for "${t}": output prepared according to the agent's declared contract.`,
}

/** Deterministic agent output preview for evaluation (mirrors azimara-runtime behavior). */
export async function deterministicPreview(agent: { id: string; name: string; category: string; systemPrompt: string }, input: Record<string, unknown>): Promise<string> {
  const text = String(input.prompt ?? input.text ?? input.message ?? input.query ?? JSON.stringify(input))
  const lower = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  const stop = new Set(['the','a','an','and','or','of','to','for','in','on','with','is','are','this','that'])
  const keywords = [...new Set(lower.split(/\s+/).filter((w) => w.length > 3 && !stop.has(w)))].slice(0, 3)
  const generator = CATEGORY_RESPONSES[agent.category] ?? CATEGORY_RESPONSES.custom
  const body = generator(text.slice(0, 60), keywords)
  return `${body}\n\n— ${agent.name} (evaluation runtime, deterministic)`
}

/** Aggregate eval history for an agent (used by Agent detail → Evaluations tab). */
export async function agentEvalHistory(workspaceId: string, agentId: string) {
  const runs = await db.evalRun.findMany({
    where: { workspaceId, agentId, status: 'completed' },
    orderBy: { startedAt: 'desc' },
    take: 20,
  })
  return runs.map((r) => ({
    id: r.id, label: r.label, datasetId: r.datasetId, agentVersion: r.agentVersion,
    passRate: r.passRate, avgScore: r.avgScore, avgLatencyMs: r.avgLatencyMs, totalCost: r.totalCost,
    startedAt: r.startedAt.toISOString(),
  }))
}
