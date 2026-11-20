// Unified Model Gateway (Intelligence Plane).
// Provider-neutral routing with deterministic policy-checked fallbacks, token metering
// and cost estimation. Two runtimes:
//   - "azimara-runtime"  → deterministic in-process generation (no external calls; used for
//                          evaluation, replay and as the default demo provider)
//   - "glm" provider     → real LLM calls via z-ai-web-dev-sdk (server-side only)
// If a provider call fails or times out, the gateway walks the configured fallback chain.

import { db } from '@/lib/db'
import { jparse, type PolicyVerdict } from '@/lib/types'
import { recordUsage } from '@/lib/metering'
import { enforcePolicy } from '@/lib/policy-engine'

export interface ResolvedModel {
  id: string
  name: string
  modelId: string
  providerId: string
  providerSlug: string
  providerName: string
  providerStatus: string
  contextWindow: number
  maxOutputTokens: number
  inputCostPerMtok: number
  outputCostPerMtok: number
  capabilities: string[]
}

export async function resolveModel(modelId: string): Promise<ResolvedModel | null> {
  const m = await db.model.findUnique({ where: { id: modelId }, include: { provider: true } })
  if (!m) return null
  return {
    id: m.id, name: m.name, modelId: m.modelId,
    providerId: m.providerId, providerSlug: m.provider.slug, providerName: m.provider.name,
    providerStatus: m.provider.status, contextWindow: m.contextWindow, maxOutputTokens: m.maxOutputTokens,
    inputCostPerMtok: m.inputCostPerMtok, outputCostPerMtok: m.outputCostPerMtok,
    capabilities: jparse<string[]>(m.capabilitiesJson, []),
  }
}

export interface RouteOptions {
  workspaceId: string
  agentId: string
  environment: string
  dataClass: string
  executionId: string | null
  estimatedCostUsd?: number
  taskClass?: string
}

export interface RouteResult {
  ok: boolean
  reason?: string
  model: ResolvedModel | null
  verdict: PolicyVerdict | null
  tried: { modelId: string; outcome: string }[]
}

/** Policy-checked model routing with the agent's configured fallback chain. */
export async function routeModel(
  agent: { id: string; workspaceId: string; autonomyLevel: string; modelConfigJson: string },
  opts: RouteOptions,
): Promise<RouteResult> {
  const cfg = jparse<{ primary?: string; fallback?: string[] }>(agent.modelConfigJson, {})
  const chain = [cfg.primary, ...(cfg.fallback ?? [])].filter(Boolean) as string[]
  const tried: RouteResult['tried'] = []

  for (const modelId of chain) {
    const model = await resolveModel(modelId)
    if (!model) { tried.push({ modelId, outcome: 'model_not_found' }); continue }
    if (model.providerStatus === 'offline') { tried.push({ modelId, outcome: 'provider_offline' }); continue }

    const verdict = await enforcePolicy(opts.workspaceId, {
      subjectAgentId: agent.id,
      subject: agent.id,
      action: 'model_route',
      resource: model.id,
      environment: opts.environment,
      dataClass: opts.dataClass,
      autonomyLevel: agent.autonomyLevel,
      estimatedCostUsd: opts.estimatedCostUsd ?? 0,
      provider: model.providerSlug,
      taskClass: opts.taskClass,
      metadata: { modelName: model.name, providerName: model.providerName },
      executionId: opts.executionId,
    })
    if (verdict.decision === 'deny') {
      tried.push({ modelId, outcome: `denied: ${verdict.reason}` })
      continue
    }
    if (verdict.decision === 'require_approval') {
      tried.push({ modelId, outcome: 'approval_required' })
      return { ok: false, reason: verdict.reason, model: null, verdict, tried }
    }
    tried.push({ modelId, outcome: 'selected' })
    return { ok: true, model, verdict, tried }
  }
  return { ok: false, reason: 'No routable model passed policy and health checks', model: null, verdict: null, tried }
}

export interface InvokeOptions {
  workspaceId: string
  executionId: string | null
  agentId: string
  agentName: string
  category: string
  systemPrompt: string
  input: Record<string, unknown>
  toolsAvailable: { id: string; slug: string; name: string; description: string; riskClass: string }[]
  maxTokens: number
  turn: number
  toolResults?: { slug: string; summary: string }[]
}

export interface InvokeResult {
  text: string
  toolCalls: { slug: string; input: Record<string, unknown> }[]
  delegationRequest: { agentSlug: string; input: Record<string, unknown> } | null
  usage: { inputTokens: number; outputTokens: number }
  costUsd: number
  latencyMs: number
  model: ResolvedModel
  simulated: boolean
  estimated: boolean
}

/** Execute one model turn through the gateway. Real provider first, deterministic fallback. */
export async function invokeModel(model: ResolvedModel, opts: InvokeOptions): Promise<InvokeResult> {
  const started = Date.now()

  if (model.providerSlug === 'glm') {
    try {
      const real = await invokeRealGlm(model, opts)
      if (real) {
        const latencyMs = Date.now() - started
        const cost = computeCost(model, real.usage)
        await meterTokens(opts, model, real.usage, false, latencyMs)
        return {
          text: real.text, toolCalls: [], delegationRequest: null,
          usage: real.usage, costUsd: cost, latencyMs, model, simulated: false, estimated: false,
        }
      }
    } catch (err) {
      console.warn('[model-gateway] GLM provider call failed, falling back to deterministic runtime:', err instanceof Error ? err.message : err)
    }
  }

  // Deterministic in-process runtime
  const gen = deterministicGenerate(model, opts)
  const latencyMs = Date.now() - started + 180 + Math.floor(Math.random() * 320)
  const usage = { inputTokens: estimateTokens(opts.systemPrompt + JSON.stringify(opts.input)), outputTokens: estimateTokens(gen.text) }
  const cost = computeCost(model, usage)
  await meterTokens(opts, model, usage, true, latencyMs)
  return { ...gen, usage, costUsd: cost, latencyMs, model, simulated: true, estimated: true }
}

function computeCost(model: ResolvedModel, usage: { inputTokens: number; outputTokens: number }): number {
  const cost = (usage.inputTokens / 1e6) * model.inputCostPerMtok + (usage.outputTokens / 1e6) * model.outputCostPerMtok
  return Math.round(cost * 1e6) / 1e6
}

async function meterTokens(
  opts: InvokeOptions, model: ResolvedModel,
  usage: { inputTokens: number; outputTokens: number },
  simulated: boolean, latencyMs: number,
): Promise<void> {
  if (!opts.executionId) return
  await recordUsage({
    workspaceId: opts.workspaceId, kind: 'token_in',
    quantity: usage.inputTokens, unitCostUsd: model.inputCostPerMtok / 1e6,
    agentId: opts.agentId, modelId: model.id, executionId: opts.executionId,
    idempotencyKey: `${opts.executionId}:token_in:${model.id}:${usage.inputTokens}:${latencyMs}`,
  })
  await recordUsage({
    workspaceId: opts.workspaceId, kind: 'token_out',
    quantity: usage.outputTokens, unitCostUsd: model.outputCostPerMtok / 1e6,
    agentId: opts.agentId, modelId: model.id, executionId: opts.executionId,
    idempotencyKey: `${opts.executionId}:token_out:${model.id}:${usage.outputTokens}:${latencyMs}`,
  })
}

// ---------------------------------------------------------------------------
// Real GLM provider (server-side only, dynamic import so the app never hard-depends on it)
// ---------------------------------------------------------------------------

async function invokeRealGlm(
  model: ResolvedModel,
  opts: InvokeOptions,
): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number } } | null> {
  const mod = await import('z-ai-web-dev-sdk')
  const ZAI = (mod as unknown as { default: { create: () => Promise<{ chat: { completions: { create: (b: unknown) => Promise<{ choices?: { message?: { content?: string } }[] }> } } }> } }).default
  const zai = await ZAI.create()
  const toolLine = opts.toolsAvailable.length
    ? `\nTools you may reference: ${opts.toolsAvailable.map((t) => t.slug).join(', ')}.`
    : ''
  const completion = await Promise.race([
    zai.chat.completions.create({
      model: model.modelId,
      messages: [
        { role: 'system', content: opts.systemPrompt + toolLine },
        { role: 'user', content: JSON.stringify(opts.input) },
      ],
      thinking: { type: 'disabled' },
    }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('provider timeout 45s')), 45_000)),
  ])
  const text = completion?.choices?.[0]?.message?.content
  if (!text) return null
  return {
    text,
    usage: {
      inputTokens: estimateTokens(opts.systemPrompt + JSON.stringify(opts.input)),
      outputTokens: estimateTokens(text),
    },
  }
}

const estimateTokens = (text: string): number => Math.max(1, Math.ceil(text.length / 4))

// ---------------------------------------------------------------------------
// Deterministic in-process runtime ("azimara-runtime")
// Produces category-aware, structured agent output plus tool/delegation intents.
// ---------------------------------------------------------------------------

function pickKeywords(input: Record<string, unknown>): string[] {
  const raw = JSON.stringify(input).toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  const stop = new Set(['the','a','an','and','or','of','to','for','in','on','with','is','are','this','that','please','need','want','about','from','by','at','as','it','be','can','you','our','their','has','have','was','were','will','would','should','into','per','all','any','new'])
  const freq = new Map<string, number>()
  for (const w of raw.split(/\s+/).filter((w) => w.length > 3 && !stop.has(w))) {
    freq.set(w, (freq.get(w) ?? 0) + 1)
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w)
}

function deterministicGenerate(model: ResolvedModel, opts: InvokeOptions): {
  text: string; toolCalls: { slug: string; input: Record<string, unknown> }[]; delegationRequest: InvokeResult['delegationRequest']
} {
  const keywords = pickKeywords(opts.input)
  const topic = keywords[0] ?? 'the requested task'
  const tools = opts.toolsAvailable
  const inputText = typeof opts.input === 'object' && opts.input !== null
    ? String((opts.input as Record<string, unknown>).prompt ?? (opts.input as Record<string, unknown>).text ?? (opts.input as Record<string, unknown>).message ?? (opts.input as Record<string, unknown>).query ?? JSON.stringify(opts.input))
    : String(opts.input)

  const toolCalls: { slug: string; input: Record<string, unknown> }[] = []
  const lower = inputText.toLowerCase()

  // Deterministic tool intent selection from input semantics + granted tools
  if (tools.some((t) => t.slug === 'web-search') && /search|news|latest|recent|market|competitor|research|trend/.test(lower)) {
    toolCalls.push({ slug: 'web-search', input: { query: inputText.slice(0, 120) } })
  }
  if (tools.some((t) => t.slug === 'crm-lookup') && /customer|ticket|account|crm|subscriber|churn/.test(lower)) {
    toolCalls.push({ slug: 'crm-lookup', input: { query: inputText.slice(0, 80) } })
  }
  if (tools.some((t) => t.slug === 'sql-query') && /data|metrics|usage|revenue|report|query|sql|spend/.test(lower)) {
    toolCalls.push({ slug: 'sql-query', input: { query: 'SELECT * FROM metrics WHERE topic LIKE $1 LIMIT 50', params: [topic] } })
  }
  if (tools.some((t) => t.slug === 'code-scan') && /code|repository|pull|review|commit|lint/.test(lower)) {
    toolCalls.push({ slug: 'code-scan', input: { target: inputText.slice(0, 80) } })
  }
  if (tools.some((t) => t.slug === 'payment-refund') && /refund|reimburse|credit.?back/.test(lower)) {
    const amountMatch = inputText.match(/\$\s?(\d+(?:\.\d{1,2})?)/)
    toolCalls.push({ slug: 'payment-refund', input: { amount: amountMatch ? Number(amountMatch[1]) : 100, accountRef: /ACC-\d+/.exec(inputText)?.[0] ?? 'ACC-UNKNOWN', reason: inputText.slice(0, 120) } })
  }
  if (tools.some((t) => t.slug === 'slack-post') && /notify|alert|post|ping|escalat|on.?call|slack/.test(lower)) {
    toolCalls.push({ slug: 'slack-post', input: { channel: /secur|incident/.test(lower) ? '#security' : '#ops', message: inputText.slice(0, 120) } })
  }
  if (tools.some((t) => t.slug === 'email-send') && /email|send.*message|notify.*customer/.test(lower)) {
    toolCalls.push({ slug: 'email-send', input: { to: 'customer-relations@azimara.example', subject: inputText.slice(0, 80) } })
  }
  if (tools.some((t) => t.slug === 'kb-search') && /knowledge|policy|documentation|docs|how|guide|memory/.test(lower)) {
    toolCalls.push({ slug: 'kb-search', input: { query: inputText.slice(0, 120) } })
  }
  if (toolCalls.length === 0 && tools.length > 0 && opts.turn === 1 && /analyze|check|verify|investigate|assess/.test(lower)) {
    toolCalls.push({ slug: tools[0].slug, input: { query: inputText.slice(0, 120) } })
  }

  const toolOutcomes = opts.toolResults ?? []
  const evidence = toolOutcomes.length
    ? toolOutcomes.map((t) => `- ${t.slug}: ${t.summary}`).join('\n')
    : 'No external data required for this turn.'

  let body: string
  switch (opts.category) {
    case 'research':
      body = `Research summary on ${topic} (turn ${opts.turn}):\nKey signals gathered:\n${evidence}\nFindings: 1) ${cap(topic)} shows sustained activity across the sampled sources; 2) primary risk is source reliability variance; 3) recommended next step is a targeted deep-dive on ${keywords[1] ?? 'adjacent segments'} with a citation pass.`
      break
    case 'customer_ops':
      body = `Triage complete for "${inputText.slice(0, 80)}".\nClassification: ${/refund|billing|invoice|charge/.test(lower) ? 'billing' : /bug|error|crash|fail/.test(lower) ? 'technical' : /question|how|where/.test(lower) ? 'informational' : 'general'}.\nSentiment: ${/angry|unacceptable|frustrat|terrible/.test(lower) ? 'negative — priority escalation' : 'neutral'}.\nEvidence:\n${evidence}\nRecommended action: respond with resolution path and attach macro reply; route to human owner if sentiment degrades.`
      break
    case 'data_analysis':
      body = `Analysis complete.\nMethod: query executed, results validated against schema.\nEvidence:\n${evidence}\nResult: ${topic} metrics computed over the current window; notable variance flagged for review. Confidence: medium (deterministic runtime).`
      break
    case 'coding':
      body = `Review verdict for ${topic}:\n${evidence}\nStatic checks: 2 advisories (naming, unused import), 0 blockers. Suggested change is mechanical and low risk.`
      break
    case 'monitoring':
      body = `Watch assessment for ${topic}:\n${evidence}\nStatus: no threshold breach above warning level. Next evaluation scheduled on the normal cadence.`
      break
    case 'planning':
      body = `Plan for ${topic}:\n1) Scope confirmation using provided input; 2) Data gathering (${tools.length} tools available); 3) Draft execution with checkpoints; 4) Review gate before any production mutation.\nEvidence:\n${evidence}`
      break
    case 'knowledge':
      body = `Answer assembled from approved knowledge sources for "${inputText.slice(0, 80)}":\n${evidence}\nAnswer: the workspace guidance on ${topic} applies; cited records retrieved within the agent's authorized namespaces only.`
      break
    default:
      body = `Task processed by ${opts.agentName} using ${model.name}.\nInput interpreted as: ${inputText.slice(0, 140)}\nEvidence:\n${evidence}\nOutput prepared according to the agent's declared output contract.`
  }

  const text = `${body}\n\n— generated by ${model.providerName}/${model.name}${model.providerSlug === 'azimara-runtime' ? ' (deterministic runtime)' : ''}`

  // Delegation intent: only when input explicitly asks to hand off and category supports it
  const delegationRequest = /delegate|hand.?off|escalate to/.test(lower) && opts.category !== 'monitoring'
    ? { agentSlug: 'ops-watchdog', input: { reason: 'explicit delegation request', origin: opts.agentName } }
    : null

  return { text, toolCalls, delegationRequest }
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1) }
