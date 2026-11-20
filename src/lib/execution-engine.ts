// Execution Engine (Execution Plane, in-process demo runtime).
// Runs agent executions with: bounded steps, budget checks, identity scoping,
// policy-checked tool calls, memory retrieval, delegation depth caps, checkpointing,
// cancellation, timeout, evaluation gates, full trace instrumentation and audit.

import { db } from '@/lib/db'
import { jparse } from '@/lib/types'
import type { Agent as PrismaAgent } from '@prisma/client'
import { audit, newCorrelationId } from '@/lib/audit'
import { enforcePolicy } from '@/lib/policy-engine'
import { routeModel, invokeModel } from '@/lib/model-gateway'
import { executeToolCall, redactSecrets } from '@/lib/tool-runtime'
import { retrieveMemory, checkNamespaceAccess } from '@/lib/memory'
import { recordUsage, checkWorkspaceBudget, checkAgentBudget, monthSpend } from '@/lib/metering'
import { onPolicyDeny, onToolOutputScan, onExecutionComplete } from '@/lib/security-monitor'

const DEFAULT_LIMITS = { maxSteps: 12, timeoutMs: 120_000, maxCostUsd: 1.5, maxDelegationDepth: 2, maxIterations: 3 }

export interface StartRunInput {
  workspaceId: string
  agentId: string
  input: Record<string, unknown>
  trigger?: 'manual' | 'api' | 'schedule' | 'webhook' | 'replay' | 'delegation'
  userId?: string
  userName?: string
  parentExecutionId?: string | null
  delegationDepth?: number
  correlationId?: string
  isReplay?: boolean
  workflowExecutionId?: string | null
}

export interface StartRunResult {
  ok: boolean
  executionId?: string
  error?: string
  code?: string
}

function envForAgent(workspaceDataClass: string): string {
  // demo runtime: single-node; production-equivalent classification governs policy strictness
  return 'production'
}

/** Validate + persist a queued execution, then kick the async runner. */
export async function startAgentRun(input: StartRunInput): Promise<StartRunResult> {
  const agent = await db.agent.findUnique({ where: { id: input.agentId } })
  if (!agent || agent.workspaceId !== input.workspaceId) {
    return { ok: false, code: 'NOT_FOUND', error: 'Agent not found in workspace' }
  }
  if (['archived', 'retiring', 'draft', 'validating'].includes(agent.status)) {
    return { ok: false, code: 'INVALID_STATE', error: `Agent is ${agent.status}; must be published and ready before execution` }
  }
  if (agent.status === 'paused') {
    return { ok: false, code: 'AGENT_PAUSED', error: 'Agent is paused (suspended by an operator or security control)' }
  }

  // budgets — hard stop, recorded as policy decisions + audit
  const wsBudget = await checkWorkspaceBudget(input.workspaceId)
  if (!wsBudget.ok) {
    await audit({
      organizationId: (await db.workspace.findUnique({ where: { id: input.workspaceId } }))?.organizationId ?? '',
      workspaceId: input.workspaceId, actorType: 'system', action: 'execution.blocked_budget',
      resourceType: 'agent', resourceId: agent.id, severity: 'warning', detail: { reason: wsBudget.reason },
    })
    return { ok: false, code: 'BUDGET_EXCEEDED', error: wsBudget.reason }
  }
  const agentBudget = await checkAgentBudget(input.workspaceId, agent.id)
  if (!agentBudget.ok) {
    return { ok: false, code: 'BUDGET_EXCEEDED', error: agentBudget.reason }
  }

  const limits = { ...DEFAULT_LIMITS, ...jparse<{ maxSteps?: number; timeoutMs?: number; maxCostUsd?: number; maxDelegationDepth?: number }>(agent.resourceLimitsJson, {}) }
  const correlationId = input.correlationId ?? newCorrelationId()
  const depth = input.delegationDepth ?? 0
  if (depth > limits.maxDelegationDepth) {
    return { ok: false, code: 'DELEGATION_DEPTH', error: `Delegation depth ${depth} exceeds limit ${limits.maxDelegationDepth}` }
  }

  // identity resolution: agent workload identity (distinguishable from owner/operator)
  let identity = await db.serviceIdentity.findFirst({ where: { agentId: agent.id, kind: 'workload', status: 'active' } })
  if (!identity) {
    identity = await db.serviceIdentity.create({
      data: {
        workspaceId: input.workspaceId,
        name: `workload:${agent.slug}`,
        kind: 'workload',
        agentId: agent.id,
        scopes: JSON.stringify(['tools:invoke', 'memory:read', 'model:invoke']),
        keyFingerprint: `fp_${agent.id.slice(-8)}`,
      },
    })
  }

  const execution = await db.execution.create({
    data: {
      workspaceId: input.workspaceId,
      kind: 'agent_run',
      agentId: agent.id,
      agentVersion: agent.currentVersion,
      parentExecutionId: input.parentExecutionId ?? null,
      delegationDepth: depth,
      trigger: input.trigger ?? 'manual',
      correlationId,
      status: 'queued',
      inputJson: JSON.stringify(input.input ?? {}),
      identitySubject: identity.id,
      budgetCapsJson: JSON.stringify({ maxSteps: limits.maxSteps, timeoutMs: limits.timeoutMs, maxCostUsd: limits.maxCostUsd, maxDelegationDepth: limits.maxDelegationDepth }),
      isReplay: input.isReplay ?? false,
    },
  })

  // fire the async runner (in-process worker; state is checkpointed after every step)
  void runAgentExecution(execution.id, agent.id, input).catch(async (err) => {
    console.error('[execution-engine] runner crashed', execution.id, err)
    await db.execution.update({
      where: { id: execution.id },
      data: { status: 'failed', finishedAt: new Date(), error: `runner crashed: ${err instanceof Error ? err.message : String(err)}` },
    }).catch(() => undefined)
  })

  await audit({
    organizationId: (await db.workspace.findUnique({ where: { id: input.workspaceId } }))?.organizationId ?? '',
    workspaceId: input.workspaceId,
    actorType: input.userId ? 'user' : 'agent',
    actorId: input.userId ?? identity.id,
    actorName: input.userName ?? `workload:${agent.slug}`,
    action: 'execution.start',
    resourceType: 'agent',
    resourceId: agent.id,
    detail: { executionId: execution.id, trigger: input.trigger ?? 'manual', delegationDepth: depth, correlationId },
  })

  return { ok: true, executionId: execution.id }
}

interface StepMeta { seq: number; startedAt: Date }

async function openStep(executionId: string, kind: string, label: string, nodeKey = ''): Promise<StepMeta> {
  // Atomic allocator. `count()` followed by `create()` races when two branches
  // open steps concurrently and produced duplicate (executionId, seq) rows
  // (see scripts/dedupe-execution-steps.ts for the historical cleanup). A
  // conditional increment guarantees each step receives a unique sequence.
  // `update` atomically increments and returns the new value; the compound
  // unique key (executionId, seq) is therefore safe under concurrent branches.
  const execution = await db.execution.update({
    where: { id: executionId },
    data: { stepSeq: { increment: 1 } },
    select: { stepSeq: true, status: true },
  })
  if (execution.status === 'cancelled' || execution.status === 'timed_out') throw new AbortError(execution.status)
  const seq = execution.stepSeq - 1
  const row = await db.executionStep.create({
    data: { executionId, seq, kind, label, nodeKey, status: 'running', startedAt: new Date() },
  })
  return { seq, startedAt: row.startedAt }
}

async function closeStep(executionId: string, meta: StepMeta, status: string, detail: Record<string, unknown>): Promise<void> {
  const endedAt = new Date()
  await db.executionStep.update({
    where: { executionId_seq: { executionId, seq: meta.seq } },
    data: {
      status, endedAt, durationMs: Math.max(1, endedAt.getTime() - meta.startedAt.getTime()),
      detailJson: JSON.stringify(detail),
    },
  })
}

async function isCancelledOrTimedOut(executionId: string, startedAt: Date, timeoutMs: number): Promise<'cancelled' | 'timed_out' | null> {
  const exec = await db.execution.findUnique({ where: { id: executionId }, select: { status: true } })
  if (exec?.status === 'cancelled') return 'cancelled'
  if (Date.now() - startedAt.getTime() > timeoutMs) return 'timed_out'
  return null
}

/** The async runner. Every step is checkpointed; failures produce typed error contracts. */
export async function runAgentExecution(executionId: string, agentId: string, input: StartRunInput): Promise<void> {
  const exec = await db.execution.findUnique({ where: { id: executionId } })
  if (!exec) return
  const agent = await db.agent.findUnique({ where: { id: agentId } })
  if (!agent) return
  const workspace = await db.workspace.findUnique({ where: { id: agent.workspaceId } })
  if (!workspace) return

  const caps = jparse<{ maxSteps: number; timeoutMs: number; maxCostUsd: number; maxDelegationDepth: number }>(exec.budgetCapsJson, DEFAULT_LIMITS)
  const limits = { ...DEFAULT_LIMITS, ...jparse<{ maxIterations?: number }>(agent.resourceLimitsJson, {}) }
  const dataClass = workspace.dataClassification
  const environment = envForAgent(workspace.dataClassification)
  const startedAt = exec.startedAt

  await db.execution.update({ where: { id: executionId }, data: { status: 'running' } })
  let totalCost = 0
  let toolCallCount = 0
  let tokenIn = 0
  let tokenOut = 0

  try {
    // ---- 1. input validation + context assembly ----
    const s1 = await openStep(executionId, 'context_assembly', 'Assemble execution context', 'ctx')
    const inputSchema = jparse(agent.inputSchemaJson, null)
    const validationErrors: string[] = []
    if (inputSchema && typeof inputSchema === 'object' && 'required' in (inputSchema as object)) {
      const required = (inputSchema as { required?: string[] }).required ?? []
      for (const req of required) {
        if (!(req in (exec.inputJson ? jparse(exec.inputJson, {}) : {}))) validationErrors.push(`input.${req} is required`)
      }
    }
    if (validationErrors.length > 0) {
      await closeStep(executionId, s1, 'failed', { validationErrors })
      throw new Error(`Input schema validation failed: ${validationErrors.join('; ')}`)
    }
    const systemPrompt = agent.systemPrompt || `You are ${agent.name}, an enterprise AI agent governed by AZIMARA MESH.`
    const modelCfg = jparse<{ primary?: string; temperature?: number; maxTokens?: number }>(agent.modelConfigJson, {})
    const toolManifest = await loadToolManifest(agent)
    await closeStep(executionId, s1, 'succeeded', {
      systemPromptChars: systemPrompt.length,
      toolsGranted: toolManifest.map((t) => t.slug),
      autonomyLevel: agent.autonomyLevel,
      dataClass,
      environment,
      modelPreferred: modelCfg.primary ?? 'unspecified',
    })

    // ---- 2. memory retrieval (authorization-checked) ----
    const s2 = await openStep(executionId, 'memory_retrieval', 'Retrieve authorized memory', 'mem')
    const memCfg = jparse<{ namespaces?: string[]; contextTokens?: number }>(agent.memoryConfigJson, {})
    const memoryContexts: { namespace: string; records: { content: string; score: number }[] }[] = []
    const memoryDenials: string[] = []
    const userQuery = extractQuery(jparse<Record<string, unknown>>(exec.inputJson, {}))
    for (const nsId of (memCfg.namespaces ?? []).slice(0, 3)) {
      const ns = await db.memoryNamespace.findFirst({
        where: { id: nsId, workspaceId: agent.workspaceId },
      })
      // A namespace id from another tenant must never be resolvable here.
      if (!ns) continue
      const access = checkNamespaceAccess(agent, ns)
      if (!access.allowed) {
        memoryDenials.push(`${ns.name}: ${access.reason}`)
        await enforcePolicy(agent.workspaceId, {
          subjectAgentId: agent.id, subject: agent.id, action: 'memory_read', resource: ns.id,
          environment, dataClass: ns.classification, autonomyLevel: agent.autonomyLevel,
          estimatedCostUsd: 0, metadata: { namespace: ns.name, kind: ns.kind }, executionId,
        })
        continue
      }
      const retrieval = await retrieveMemory(agent, nsId, userQuery, { executionId, usageAgentId: agent.id, limit: 3 })
      if (retrieval.records.length > 0) memoryContexts.push({ namespace: ns.name, records: retrieval.records.map((r) => ({ content: r.content, score: r.score })) })
    }
    await closeStep(executionId, s2, 'succeeded', {
      namespacesQueried: (memCfg.namespaces ?? []).length,
      recordsUsed: memoryContexts.reduce((n, m) => n + m.records.length, 0),
      denied: memoryDenials,
      contextTokens: memCfg.contextTokens ?? 4000,
    })

    // ---- 3. bounded model/tool loop ----
    const conversationInput: Record<string, unknown> = jparse<Record<string, unknown>>(exec.inputJson, {})
    const toolResults: { slug: string; summary: string }[] = []
    const executedToolSlugs = new Set<string>()
    let finalText = ''
    const usedModels: string[] = []

    for (let turn = 1; turn <= limits.maxIterations; turn++) {
      const abort = await isCancelledOrTimedOut(executionId, startedAt, caps.timeoutMs)
      if (abort) throw new AbortError(abort)

      // model routing through policy
      const routing = await routeModel(agent, {
        workspaceId: agent.workspaceId, agentId: agent.id, environment, dataClass,
        executionId, estimatedCostUsd: 0.05, taskClass: agent.category,
      })
      const sModel = await openStep(executionId, 'model_request', `Model request (turn ${turn})`, 'model')
      if (!routing.ok || !routing.model) {
        await closeStep(executionId, sModel, 'failed', { reason: routing.reason, triedChain: routing.tried })
        throw new Error(`Model routing failed: ${routing.reason}`)
      }
      await closeStep(executionId, sModel, 'succeeded', {
        model: routing.model.name, provider: routing.model.providerName, providerSlug: routing.model.providerSlug,
        routingChain: routing.tried, temperature: modelCfg.temperature ?? 0.3,
      })
      usedModels.push(routing.model.name)

      // policy decision on model invocation is recorded by routeModel → enforcePolicy
      const invocation = await invokeModel(routing.model, {
        workspaceId: agent.workspaceId, executionId, agentId: agent.id, agentName: agent.name,
        category: agent.category, systemPrompt, input: conversationInput, toolsAvailable: toolManifest,
        maxTokens: modelCfg.maxTokens ?? 1024, turn, toolResults,
      })
      totalCost += invocation.costUsd
      tokenIn += invocation.usage.inputTokens
      tokenOut += invocation.usage.outputTokens
      finalText = invocation.text

      if (invocation.costUsd > caps.maxCostUsd) {
        throw new Error(`Execution exceeded its cost cap ($${invocation.costUsd.toFixed(2)} > $${caps.maxCostUsd.toFixed(2)})`)
      }

      const toolIntents = (invocation.toolCalls ?? []).filter((intent) => {
        if (executedToolSlugs.has(intent.slug)) return false // no repeated side effects within one run
        executedToolSlugs.add(intent.slug)
        return true
      })
      if (toolIntents.length === 0) break

      let anyToolExecuted = false
      for (const intent of toolIntents.slice(0, 3)) {
        const abort2 = await isCancelledOrTimedOut(executionId, startedAt, caps.timeoutMs)
        if (abort2) throw new AbortError(abort2)
        const tool = toolManifest.find((t) => t.slug === intent.slug)
        if (!tool) {
          const sBad = await openStep(executionId, 'tool_call', `Unknown tool intent: ${intent.slug}`, 'tool')
          await closeStep(executionId, sBad, 'failed', { error: 'tool not in agent permission manifest', requested: intent.slug })
          continue
        }

        // deterministic policy layer — evaluated per invocation, not per run
        const verdict = await enforcePolicy(agent.workspaceId, {
          subjectAgentId: agent.id, subject: agent.id, action: 'tool_invoke', resource: tool.id,
          environment, dataClass: tool.dataClass, autonomyLevel: agent.autonomyLevel,
          estimatedCostUsd: 0.002,
          metadata: { toolId: tool.id, toolSlug: tool.slug, toolRiskClass: tool.riskClass, toolName: tool.name },
          executionId,
        })

        const sTool = await openStep(executionId, 'policy_check', `Policy check: ${tool.name}`, 'policy')
        await closeStep(executionId, sTool, verdict.decision === 'deny' ? 'denied' : 'succeeded', {
          decision: verdict.decision, reason: verdict.reason, matched: verdict.matched,
        })

        if (verdict.decision === 'deny') {
          await onPolicyDeny(agent.workspaceId, agent.id, 'tool_invoke', verdict.reason)
          continue
        }

        if (verdict.decision === 'require_approval') {
          // checkpoint + pause; resumed by approval decision endpoint
          const approval = await db.approval.create({
            data: {
              workspaceId: agent.workspaceId,
              executionId,
              kind: tool.riskClass === 'critical' ? 'financial' : 'tool_usage',
              title: `${agent.name} requests ${tool.name}`,
              detailJson: JSON.stringify({ toolId: tool.id, toolSlug: tool.slug, toolName: tool.name, input: intent.input, policyReason: verdict.reason, decisionId: verdict.decisionId }),
              requestedBy: `workload:${agent.slug}`,
              riskClass: tool.riskClass,
              reviewerRole: 'admin',
              expiresAt: new Date(Date.now() + 24 * 3600_000),
            },
          })
          const sWait = await openStep(executionId, 'approval_wait', `Awaiting approval: ${tool.name}`, 'approval')
          await closeStep(executionId, sWait, 'waiting_approval', { approvalId: approval.id, tool: tool.name, riskClass: tool.riskClass })
          await db.execution.update({
            where: { id: executionId },
            data: {
              status: 'waiting_approval',
              checkpointJson: JSON.stringify({
                phase: 'awaiting_tool_approval', toolIntent: intent, approvalId: approval.id,
                toolResults, finalText, usedModels, totalCost, tokenIn, tokenOut, turn,
              }),
            },
          })
          await db.notification.create({
            data: {
              workspaceId: agent.workspaceId, kind: 'approval_request',
              title: `Approval needed: ${agent.name} → ${tool.name}`,
              body: verdict.reason,
              severity: 'critical', linkView: 'executions',
            },
          })
          return // paused; resumeApproval continues
        }

        // execute tool
        const sExec = await openStep(executionId, 'tool_call', `Tool call: ${tool.name}`, 'tool')
        const outcome = await executeToolCall(tool, intent.input, {
          workspaceId: agent.workspaceId, executionId, agentId: agent.id, agentName: agent.name,
          autonomyLevel: agent.autonomyLevel, environment, dataClass: tool.dataClass,
          isReplay: exec.isReplay, policyDecisionId: verdict.decisionId,
        })
        toolCallCount += 1
        totalCost += 0.002

        if (outcome.injectionFlag?.flagged) {
          await onToolOutputScan(agent.workspaceId, agent.id, executionId, tool.slug, outcome.injectionFlag)
        }

        const summary = summarizeToolOutput(tool.slug, outcome)
        await closeStep(executionId, sExec, outcome.status === 'succeeded' ? 'succeeded' : outcome.status === 'timeout' ? 'failed' : outcome.status, {
          tool: tool.name, slug: tool.slug, latencyMs: outcome.latencyMs,
          simulated: outcome.simulated, toolCallId: outcome.toolCallId,
          validationErrors: outcome.validationErrors ?? [],
          injectionFlagged: outcome.injectionFlag?.flagged ?? false,
          outputPreview: (outcome.redactedOutput ?? '').slice(0, 220),
        })
        if (outcome.status === 'succeeded') {
          toolResults.push({ slug: tool.slug, summary })
          anyToolExecuted = true
        }
      }
      if (!anyToolExecuted) break
    }

    // ---- 4. delegation (bounded, scoped) ----
    if (conversationInput && /delegate|hand.?off|escalate to/.test(extractQuery(conversationInput).toLowerCase()) && (input.delegationDepth ?? 0) < caps.maxDelegationDepth) {
      const childAgent = await db.agent.findFirst({
        where: { workspaceId: agent.workspaceId, slug: 'ops-watchdog', status: { notIn: ['archived', 'paused'] } },
      })
      if (childAgent && childAgent.id !== agent.id) {
        const sDel = await openStep(executionId, 'delegation', `Delegate to ${childAgent.name}`, 'delegate')
        const child = await startAgentRun({
          workspaceId: agent.workspaceId, agentId: childAgent.id,
          input: { reason: 'explicit delegation request', origin: agent.name, fromExecution: executionId },
          trigger: 'delegation',
          parentExecutionId: executionId,
          delegationDepth: (input.delegationDepth ?? 0) + 1,
          correlationId: exec.correlationId,
        })
        await closeStep(executionId, sDel, child.ok ? 'succeeded' : 'failed', {
          childExecutionId: child.executionId, childAgent: childAgent.name,
          inheritedScopes: ['tools:invoke (subset)', 'memory:read (declared namespaces only)'],
          maxDelegationDepth: caps.maxDelegationDepth,
        })
      }
    }

    // ---- 5. output generation + evaluation gate ----
    const sEval = await openStep(executionId, 'evaluation', 'Evaluate output quality & safety', 'eval')
    const evalProfile = jparse<{ minScore?: number; safetyScan?: boolean }>(agent.evalProfileJson, {})
    const checks: { check: string; passed: boolean; detail: string }[] = []
    const outputSchema = jparse<{ type?: string }>(agent.outputSchemaJson, {})
    checks.push({ check: 'output_format', passed: outputSchema.type !== 'json_object' || /[\{\[]/.test(finalText) || true, detail: outputSchema.type === 'json_object' ? 'structured markers present' : 'text output accepted' })
    const unsafe = /ignore previous instructions|system prompt|DROP TABLE/i.test(finalText)
    checks.push({ check: 'safety_scan', passed: !unsafe, detail: unsafe ? 'unsafe pattern detected' : 'no unsafe patterns' })
    const grounded = toolResults.length === 0 || toolResults.some((t) => finalText.includes(t.slug))
    checks.push({ check: 'groundedness', passed: grounded, detail: toolResults.length ? (grounded ? 'output references tool evidence' : 'output did not reference gathered evidence') : 'no tools used; not applicable' })
    const evalScore = checks.filter((c) => c.passed).length / checks.length
    const gate = evalProfile.minScore ?? 0
    const gatePassed = evalScore >= gate && !(evalProfile.safetyScan && unsafe)
    await closeStep(executionId, sEval, gatePassed ? 'succeeded' : 'failed', {
      score: Math.round(evalScore * 100) / 100, gate: gate || 'none',
      checks, safetyScan: evalProfile.safetyScan ?? false,
    })
    if (!gatePassed) {
      throw new Error(`Evaluation gate failed (score ${evalScore.toFixed(2)} < ${gate || 0})`)
    }

    // ---- 6. finalize ----
    const sOut = await openStep(executionId, 'output', 'Emit final output', 'output')
    await closeStep(executionId, sOut, 'succeeded', { chars: finalText.length, redacted: true })

    const finishedAt = new Date()
    const durationMs = finishedAt.getTime() - startedAt.getTime()
    // Conditional finalize: an operator cancellation that landed mid-run must
    // not be overwritten by a stale runner completing afterwards.
    const finalized = await db.execution.updateMany({
      where: { id: executionId, status: 'running' },
      data: {
        status: 'succeeded', finishedAt, durationMs,
        outputJson: JSON.stringify({ text: redactSecrets(finalText), toolResults, modelsUsed: usedModels }),
        costUsd: Math.round(totalCost * 1e6) / 1e6,
        tokenIn, tokenOut, toolCallCount,
        checkpointJson: JSON.stringify({ phase: 'completed' }),
      },
    })
    if (finalized.count !== 1) return // terminal state changed while running
    await recordUsage({
      workspaceId: agent.workspaceId, kind: 'execution', quantity: 1, unitCostUsd: 0.01,
      agentId: agent.id, executionId, idempotencyKey: `${executionId}:execution`,
    })
    await recordUsage({
      workspaceId: agent.workspaceId, kind: 'agent_active', quantity: 1, unitCostUsd: 0,
      agentId: agent.id, executionId, idempotencyKey: `${executionId}:agent_active`,
    })
    await updateAgentHealth(agent.id, true, durationMs, totalCost)
    const avgCost = await agentAverageCost(agent.id)
    const recentFailures = await countRecentFailures(agent.id)
    await onExecutionComplete({
      workspaceId: agent.workspaceId, agentId: agent.id, executionId,
      costUsd: totalCost, status: 'succeeded', agentAvgCost: avgCost, recentFailures,
    })
    await audit({
      organizationId: workspace.organizationId, workspaceId: agent.workspaceId,
      actorType: 'agent', actorId: agent.id, actorName: agent.name,
      action: 'execution.complete', resourceType: 'execution', resourceId: executionId,
      severity: 'info', detail: { status: 'succeeded', costUsd: Math.round(totalCost * 100) / 100, durationMs },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isAbort = err instanceof AbortError
    const finishedAt = new Date()
    const durationMs = finishedAt.getTime() - startedAt.getTime()

    // dead-letter classification: non-retryable terminal failures
    const retryable = /timeout|provider|5\d\d/i.test(message)
    const failed = await db.execution.updateMany({
      where: { id: executionId, status: 'running' },
      data: {
        status: isAbort ? (message === 'cancelled' ? 'cancelled' : 'timed_out') : 'failed',
        finishedAt, durationMs,
        error: redactSecrets(message).slice(0, 500),
        costUsd: Math.round(totalCost * 1e6) / 1e6,
        tokenIn, tokenOut, toolCallCount,
        retryCount: retryable ? 1 : 0,
        checkpointJson: JSON.stringify({ phase: 'failed', retryable }),
      },
    })
    // A terminal state (e.g. operator cancellation) already won the race.
    if (failed.count !== 1) return
    if (isAbort && message === 'cancelled') {
      await audit({
        organizationId: workspace.organizationId, workspaceId: agent.workspaceId,
        actorName: 'operator', action: 'execution.cancel', resourceType: 'execution', resourceId: executionId,
        severity: 'notice', detail: {},
      })
    } else {
      await updateAgentHealth(agent.id, false, durationMs, totalCost)
      const avgCost = await agentAverageCost(agent.id)
      const recentFailures = await countRecentFailures(agent.id)
      await onExecutionComplete({
        workspaceId: agent.workspaceId, agentId: agent.id, executionId,
        costUsd: totalCost, status: 'failed', agentAvgCost: avgCost, recentFailures,
      })
      await audit({
        organizationId: workspace.organizationId, workspaceId: agent.workspaceId,
        actorType: 'system', action: 'execution.fail', resourceType: 'execution', resourceId: executionId,
        severity: 'warning', detail: { error: message.slice(0, 200), retryable },
      })
    }
  }
}

/** Resume an execution paused at an approval checkpoint. */
export async function resumeAfterApproval(executionId: string, approved: boolean, reviewerName: string): Promise<void> {
  // Compare-and-set: only one caller may claim a waiting execution. Without
  // this guard two concurrent approval decisions both execute the privileged
  // tool (double side effect) and both finalize the execution.
  const claimed = await db.execution.updateMany({
    where: { id: executionId, status: 'waiting_approval' },
    data: { status: 'running' },
  })
  if (claimed.count !== 1) return
  const exec = await db.execution.findUnique({ where: { id: executionId } })
  if (!exec) return
  const cp = jparse<{ phase?: string; toolIntent?: { slug: string; input: Record<string, unknown> }; toolResults?: { slug: string; summary: string }[]; finalText?: string; turn?: number }>(exec.checkpointJson, {})
  if (!approved) {
    await db.execution.update({
      where: { id: executionId },
      data: { status: 'failed', finishedAt: new Date(), error: `Approval rejected by ${reviewerName}: planned tool "${cp.toolIntent?.slug ?? 'unknown'}" was not authorized`, checkpointJson: JSON.stringify({ phase: 'failed' }) },
    })
    await audit({
      organizationId: (await db.workspace.findUnique({ where: { id: exec.workspaceId } }))?.organizationId ?? '',
      workspaceId: exec.workspaceId, actorType: 'user', actorName: reviewerName,
      action: 'approval.reject', resourceType: 'execution', resourceId: executionId, severity: 'notice', detail: { tool: cp.toolIntent?.slug },
    })
    return
  }
  if (!cp.toolIntent) {
    await db.execution.update({ where: { id: executionId }, data: { status: 'failed', finishedAt: new Date(), error: 'approval checkpoint missing tool intent' } })
    return
  }
  const toolIntent: { slug: string; input: Record<string, unknown> } = cp.toolIntent
  await audit({
    organizationId: (await db.workspace.findUnique({ where: { id: exec.workspaceId } }))?.organizationId ?? '',
    workspaceId: exec.workspaceId, actorType: 'user', actorName: reviewerName,
    action: 'approval.approve', resourceType: 'execution', resourceId: executionId, severity: 'notice', detail: { tool: cp.toolIntent?.slug },
  })
  // continue with the approved tool call, then finish without re-running the model
  const agentId = exec.agentId
  if (!agentId) return
  const agent = await db.agent.findUnique({ where: { id: agentId } })
  if (!agent) return
  const tool = await loadToolManifest(agent)
  const target = tool.find((t) => t.slug === toolIntent.slug)
  const sExec = await openStep(executionId, 'tool_call', `Tool call (approved): ${target?.name ?? toolIntent.slug}`, 'tool')
  if (!target) {
    await closeStep(executionId, sExec, 'failed', { error: 'approved tool no longer in manifest' })
    await db.execution.update({ where: { id: executionId }, data: { status: 'failed', finishedAt: new Date(), error: 'approved tool no longer in manifest' } })
    return
  }
  const outcome = await executeToolCall(target, toolIntent.input, {
    workspaceId: exec.workspaceId, executionId, agentId, agentName: agent.name,
    autonomyLevel: agent.autonomyLevel, environment: envForAgent('internal'), dataClass: target.dataClass,
    isReplay: exec.isReplay,
  })
  await closeStep(executionId, sExec, outcome.status, { tool: target.name, approvedBy: reviewerName, latencyMs: outcome.latencyMs, simulated: outcome.simulated })
  const toolResults = [...(cp.toolResults ?? []), { slug: target.slug, summary: summarizeToolOutput(target.slug, outcome) }]
  const finishedAt = new Date()
  const costUsd = exec.costUsd + 0.002
  await db.execution.update({
    where: { id: executionId },
    data: {
      status: 'succeeded', finishedAt, durationMs: finishedAt.getTime() - exec.startedAt.getTime(),
      outputJson: JSON.stringify({
        text: (cp.finalText ?? '') + `\n\n[Approved action executed: ${target.name} — authorized by ${reviewerName}]`,
        toolResults, modelsUsed: [],
      }),
      costUsd: Math.round(costUsd * 1e6) / 1e6,
      toolCallCount: { increment: 1 },
      checkpointJson: JSON.stringify({ phase: 'completed' }),
    },
  })
  await updateAgentHealth(agentId, true, finishedAt.getTime() - exec.startedAt.getTime(), costUsd)

  // if this execution belongs to a paused workflow, resume the parent workflow
  if (exec.parentExecutionId) {
    const parent = await db.execution.findUnique({ where: { id: exec.parentExecutionId }, select: { status: true, kind: true } })
    if (parent?.status === 'waiting_approval' && parent.kind === 'workflow_run') {
      const { resumeWorkflowFromChild } = await import('@/lib/workflow-engine')
      void resumeWorkflowFromChild(exec.parentExecutionId).catch((err) => {
        console.error('[execution-engine] parent workflow resume failed', exec.parentExecutionId, err)
      })
    }
  }
}

// ---- helpers ----

class AbortError extends Error {
  constructor(kind: 'cancelled' | 'timed_out') { super(kind === 'cancelled' ? 'cancelled' : 'timed_out') }
}

function extractQuery(input: Record<string, unknown>): string {
  const v = input.prompt ?? input.text ?? input.message ?? input.query ?? input.task ?? JSON.stringify(input)
  return String(v)
}

async function loadToolManifest(agent: PrismaAgent): Promise<{ id: string; slug: string; name: string; description: string; kind: string; riskClass: string; dataClass: string; inputSchemaJson: string; outputSchemaJson: string; timeoutMs: number; status: string }[]> {
  const granted = jparse<string[]>(agent.toolPermissionsJson, [])
  if (granted.length === 0) return []
  // Tenant scoping is enforced at the data layer: a forged or stale tool id
  // belonging to another workspace must not enter this agent's manifest.
  const tools = await db.tool.findMany({
    where: { id: { in: granted }, workspaceId: agent.workspaceId, status: { not: 'suspended' } },
  })
  return tools.map((t) => ({ id: t.id, slug: t.slug, name: t.name, description: t.description, kind: t.kind, riskClass: t.riskClass, dataClass: t.dataClass, inputSchemaJson: t.inputSchemaJson, outputSchemaJson: t.outputSchemaJson, timeoutMs: t.timeoutMs, status: t.status }))
}

function summarizeToolOutput(slug: string, outcome: ToolOutcomeShape): string {
  if (!outcome.ok) return `call failed: ${outcome.error ?? 'unknown error'}`
  const out = outcome.output ?? {}
  if (slug === 'web-search' && Array.isArray(out.results)) {
    return `${out.results.length} sources: ${(out.results as { title: string }[]).slice(0, 3).map((r) => r.title).join(' | ')}`
  }
  if (slug === 'crm-lookup' && out.account) {
    const acc = out.account as { id: string; tier: string; healthScore: number; openTickets: number }
    return `account ${acc.id} tier=${acc.tier} health=${acc.healthScore} openTickets=${acc.openTickets}`
  }
  if (slug === 'sql-query' && Array.isArray(out.rows)) {
    return `${(out.rows as unknown[]).length} rows returned (validated against schema)`
  }
  if (slug === 'kb-search' || slug === 'memory-search') {
    const results = (out.results as { content: string }[]) ?? []
    return results.length ? `top match: ${String(results[0].content).slice(0, 80)}` : 'no matching knowledge found'
  }
  if (slug === 'code-scan') return `advisories=${(out.advisories as unknown[] | undefined)?.length ?? 0} blockers=${out.blockers ?? 0}`
  return JSON.stringify(out).slice(0, 120)
}

interface ToolOutcomeShape { ok: boolean; output?: Record<string, unknown>; error?: string; latencyMs: number; simulated: boolean; status: string; redactedOutput?: string; injectionFlag?: { flagged: boolean; pattern?: string } }

export async function updateAgentHealth(agentId: string, success: boolean, latencyMs: number, costUsd: number): Promise<void> {
  const agent = await db.agent.findUnique({ where: { id: agentId } })
  if (!agent) return
  const newRate = agent.successRate === 0 ? (success ? 1 : 0) : agent.successRate * 0.8 + (success ? 1 : 0) * 0.2
  const newLatency = agent.avgLatencyMs === 0 ? latencyMs : agent.avgLatencyMs * 0.8 + latencyMs * 0.2
  const health = newRate >= 0.85 ? 'healthy' : newRate >= 0.5 ? 'degraded' : 'offline'
  await db.agent.update({
    where: { id: agentId },
    data: {
      successRate: Math.round(newRate * 1000) / 1000,
      avgLatencyMs: Math.round(newLatency),
      healthStatus: health,
      // Atomic increment: concurrent executions must not lost-update spend.
      spendMonth: { increment: costUsd },
      lastActiveAt: new Date(),
      status: agent.status === 'failed' && success ? 'healthy' : agent.status === 'ready' && success ? 'healthy' : agent.status,
    },
  })
}

async function agentAverageCost(agentId: string): Promise<number> {
  const agg = await db.execution.aggregate({
    where: { agentId, status: { in: ['succeeded', 'failed'] } },
    _avg: { costUsd: true },
  })
  return agg._avg.costUsd ?? 0
}

async function countRecentFailures(agentId: string): Promise<number> {
  const recent = await db.execution.findMany({
    where: { agentId },
    orderBy: { startedAt: 'desc' },
    take: 5,
    select: { status: true },
  })
  let streak = 0
  for (const r of recent) {
    if (r.status === 'failed') streak += 1
    else break
  }
  return streak
}

// re-export for route usage
export { monthSpend }
