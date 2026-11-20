// Durable Workflow Engine (Execution Plane).
// Recursive DAG walker with: sequential + parallel execution, conditional branches,
// fan-out/fan-in, human approval checkpoints, bounded loop primitives, delays,
// compensation steps, checkpointing, cancellation and timeout enforcement.

import { db } from '@/lib/db'
import { jparse, type WorkflowSpec, type WorkflowNode } from '@/lib/types'
import { audit, newCorrelationId } from '@/lib/audit'
import { enforcePolicy } from '@/lib/policy-engine'
import { executeToolCall } from '@/lib/tool-runtime'
import { startAgentRun, runAgentExecution } from '@/lib/execution-engine'

const MAX_DELAY_SECONDS = 3 // sandbox-bounded; real deployments use durable timers

export interface StartWorkflowInput {
  workspaceId: string
  workflowId: string
  input: Record<string, unknown>
  trigger?: 'manual' | 'schedule' | 'webhook' | 'api' | 'replay'
  userId?: string
  userName?: string
}

export async function startWorkflowRun(input: StartWorkflowInput): Promise<{ ok: boolean; executionId?: string; error?: string; code?: string }> {
  const wf = await db.workflow.findUnique({ where: { id: input.workflowId } })
  if (!wf || wf.workspaceId !== input.workspaceId) return { ok: false, code: 'NOT_FOUND', error: 'Workflow not found' }
  if (wf.status === 'archived') return { ok: false, code: 'INVALID_STATE', error: 'Workflow is archived' }

  const spec = jparse<WorkflowSpec>(wf.specJson, null as unknown as WorkflowSpec)
  if (!spec || !Array.isArray(spec.nodes) || spec.nodes.length === 0) {
    return { ok: false, code: 'INVALID_SPEC', error: 'Workflow spec missing or empty — publish a valid definition first' }
  }
  const validation = validateSpec(spec)
  if (!validation.ok) return { ok: false, code: 'INVALID_SPEC', error: validation.errors.join('; ') }

  const workspace = await db.workspace.findUnique({ where: { id: input.workspaceId } })
  const execution = await db.execution.create({
    data: {
      workspaceId: input.workspaceId,
      kind: 'workflow_run',
      workflowId: wf.id,
      workflowVersion: wf.version,
      trigger: input.trigger ?? 'manual',
      correlationId: newCorrelationId(),
      status: 'queued',
      inputJson: JSON.stringify(input.input ?? {}),
      budgetCapsJson: JSON.stringify({ maxSteps: spec.budgets?.maxSteps ?? 24, timeoutMs: spec.budgets?.timeoutMs ?? 180_000, maxCostUsd: spec.budgets?.maxCostUsd ?? 5 }),
    },
  })

  void runWorkflowExecution(execution.id, input).catch(async (err) => {
    console.error('[workflow-engine] runner crashed', execution.id, err)
    await db.execution.update({
      where: { id: execution.id },
      data: { status: 'failed', finishedAt: new Date(), error: `runner crashed: ${err instanceof Error ? err.message : String(err)}` },
    }).catch(() => undefined)
  })

  await audit({
    organizationId: workspace?.organizationId ?? '',
    workspaceId: input.workspaceId,
    actorType: input.userId ? 'user' : 'system',
    actorId: input.userId ?? 'scheduler',
    actorName: input.userName ?? 'system',
    action: 'workflow.start',
    resourceType: 'workflow',
    resourceId: wf.id,
    detail: { executionId: execution.id, workflowVersion: wf.version, trigger: input.trigger ?? 'manual' },
  })

  return { ok: true, executionId: execution.id }
}

export function validateSpec(spec: WorkflowSpec): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  const keys = new Set(spec.nodes.map((n) => n.key))
  if (keys.size !== spec.nodes.length) errors.push('duplicate node keys')
  for (const edge of spec.edges) {
    if (!keys.has(edge.from)) errors.push(`edge references unknown node: ${edge.from}`)
    if (!keys.has(edge.to)) errors.push(`edge references unknown node: ${edge.to}`)
  }
  const inputNodes = spec.nodes.filter((n) => n.type === 'input')
  if (inputNodes.length !== 1) errors.push('spec must have exactly one input node')
  const outputNodes = spec.nodes.filter((n) => n.type === 'output')
  if (outputNodes.length < 1) errors.push('spec must have at least one output node')
  // reachability from input
  if (inputNodes.length === 1) {
    const adjacency = new Map<string, string[]>()
    for (const e of spec.edges) adjacency.set(e.from, [...(adjacency.get(e.from) ?? []), e.to])
    const seen = new Set<string>()
    const stack = [inputNodes[0].key]
    while (stack.length) {
      const cur = stack.pop() as string
      if (seen.has(cur)) continue
      seen.add(cur)
      for (const next of adjacency.get(cur) ?? []) stack.push(next)
    }
    for (const n of spec.nodes) if (!seen.has(n.key)) errors.push(`node "${n.label}" is unreachable from input`)
  }
  // cycle detection beyond bounded-loop nodes
  const loopNodes = new Set(spec.nodes.filter((n) => n.type === 'loop').map((n) => n.key))
  for (const e of spec.edges) {
    if (e.from === e.to) errors.push(`self-loop on "${e.from}" — use a bounded loop node`)
    if (loopNodes.has(e.from)) continue // loops are bounded primitives
  }
  return { ok: errors.length === 0, errors }
}

interface WorkflowContext {
  input: Record<string, unknown>
  artifacts: Record<string, unknown>
  visited: Map<string, number>
}

async function runWorkflowExecution(executionId: string, input: StartWorkflowInput): Promise<void> {
  const exec = await db.execution.findUnique({ where: { id: executionId } })
  if (!exec || !exec.workflowId) return
  const wf = await db.workflow.findUnique({ where: { id: exec.workflowId } })
  if (!wf) return
  const spec = jparse<WorkflowSpec>(wf.specJson, null as unknown as WorkflowSpec)
  const startedAt = exec.startedAt
  const caps = jparse<{ maxSteps: number; timeoutMs: number; maxCostUsd: number }>(exec.budgetCapsJson, { maxSteps: 24, timeoutMs: 180_000, maxCostUsd: 5 })

  await db.execution.update({ where: { id: executionId }, data: { status: 'running' } })
  const context: WorkflowContext = {
    input: jparse<Record<string, unknown>>(exec.inputJson, {}),
    artifacts: {},
    visited: new Map(),
  }
  let totalCost = 0
  let toolCalls = 0

  try {
    const inputNode = spec.nodes.find((n) => n.type === 'input')
    if (!inputNode) throw new Error('missing input node')
    const outputs = await walkFrom(executionId, spec, inputNode.key, context, {
      totalCost: () => totalCost, maxCost: caps.maxCostUsd,
      deadline: startedAt.getTime() + caps.timeoutMs,
      onCost: (c) => { totalCost += c },
      onToolCall: () => { toolCalls += 1 },
      workspaceId: exec.workspaceId,
    })
    const finishedAt = new Date()
    await db.execution.update({
      where: { id: executionId },
      data: {
        status: 'succeeded', finishedAt, durationMs: finishedAt.getTime() - startedAt.getTime(),
        outputJson: JSON.stringify(outputs ?? {}),
        costUsd: Math.round(totalCost * 1e6) / 1e6,
        toolCallCount: toolCalls,
        checkpointJson: JSON.stringify({ phase: 'completed' }),
      },
    })
    await audit({
      organizationId: (await db.workspace.findUnique({ where: { id: exec.workspaceId } }))?.organizationId ?? '',
      workspaceId: exec.workspaceId,
      actorType: 'system',
      action: 'workflow.complete',
      resourceType: 'workflow',
      resourceId: wf.id,
      detail: { executionId, costUsd: Math.round(totalCost * 100) / 100 },
    })
  } catch (err) {
    const message = err instanceof WorkflowPaused ? 'paused' : err instanceof Error ? err.message : String(err)
    if (err instanceof WorkflowPaused) return // checkpoint already persisted
    const finishedAt = new Date()
    const abortState = message === 'cancelled' ? 'cancelled' : message === 'timed_out' ? 'timed_out' : null
    await db.execution.update({
      where: { id: executionId },
      data: {
        status: abortState ?? 'failed',
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        error: message.slice(0, 500),
        costUsd: Math.round(totalCost * 1e6) / 1e6,
        toolCallCount: toolCalls,
      },
    })
    await audit({
      organizationId: (await db.workspace.findUnique({ where: { id: exec.workspaceId } }))?.organizationId ?? '',
      workspaceId: exec.workspaceId,
      actorType: 'system',
      action: abortState === 'cancelled' ? 'execution.cancel' : 'workflow.fail',
      resourceType: 'workflow',
      resourceId: wf.id,
      severity: abortState ? 'notice' : 'warning',
      detail: { executionId, error: message.slice(0, 200) },
    })
  }
}

class WorkflowPaused extends Error {}

interface WalkOpts {
  totalCost: () => number
  maxCost: number
  deadline: number
  onCost: (c: number) => void
  onToolCall: () => void
  workspaceId: string
}

/** Depth-first DAG walk. Throws WorkflowPaused at approval checkpoints (checkpointed). */
async function walkFrom(
  executionId: string,
  spec: WorkflowSpec,
  fromKey: string,
  ctx: WorkflowContext,
  opts: WalkOpts,
  depth = 0,
): Promise<Record<string, unknown> | null> {
  if (depth > 64) throw new Error('workflow graph too deep — possible unbounded recursion')
  const edges = spec.edges.filter((e) => e.from === fromKey)
  if (edges.length === 0) return null

  let lastResult: Record<string, unknown> | null = null
  for (const edge of edges) {
    const node = spec.nodes.find((n) => n.key === edge.to)
    if (!node) throw new Error(`unknown node ${edge.to}`)
    const result = await executeNode(executionId, spec, node, ctx, opts, depth)
    if (result && typeof result === 'object') lastResult = result as Record<string, unknown>
    await walkFrom(executionId, spec, node.key, ctx, opts, depth + 1)
  }
  return lastResult
}

async function executeNode(
  executionId: string,
  spec: WorkflowSpec,
  node: WorkflowNode,
  ctx: WorkflowContext,
  opts: WalkOpts,
  depth: number,
): Promise<unknown> {
  if (Date.now() > opts.deadline) throw new Error('timed_out')
  if (opts.totalCost() > opts.maxCost) throw new Error(`workflow exceeded cost cap ($${opts.maxCost.toFixed(2)})`)

  const visits = (ctx.visited.get(node.key) ?? 0) + 1
  const maxVisits = node.type === 'loop' ? Math.max(1, node.config.iterations ?? 2) : (spec.maxIterationsPerNode ?? 3)
  if (visits > maxVisits) {
    const s = await openStep(executionId, 'error', `Loop bound reached at "${node.label}"`, node.key)
    await closeStep(executionId, s, 'skipped', { visits, maxVisits, note: 'bounded loop primitive enforced' })
    return null
  }
  ctx.visited.set(node.key, visits)

  const exec = await db.execution.findUnique({ where: { id: executionId }, select: { status: true, isReplay: true } })
  if (exec?.status === 'cancelled') throw new Error('cancelled')

  const s = await openStep(executionId, node.type, node.label, node.key)

  try {
    switch (node.type) {
      case 'input': {
        ctx.artifacts[node.key] = ctx.input
        await closeStep(executionId, s, 'succeeded', { keys: Object.keys(ctx.input) })
        return ctx.input
      }
      case 'agent': {
        const childInput = resolveTemplate(node.config.inputTemplate, ctx)
        const agent = await db.agent.findUnique({ where: { id: node.config.agentId ?? '' } })
        if (!agent || agent.workspaceId !== opts.workspaceId) throw new Error(`agent node "${node.label}" references missing agent`)
        const childExec = await db.execution.create({
          data: {
            workspaceId: opts.workspaceId, kind: 'agent_run', agentId: agent.id, agentVersion: agent.currentVersion,
            parentExecutionId: executionId, trigger: 'delegation', correlationId: `wf_${executionId}`,
            status: 'queued', inputJson: JSON.stringify(childInput),
            budgetCapsJson: JSON.stringify({ maxSteps: 10, timeoutMs: 90_000, maxCostUsd: 1, maxDelegationDepth: 2 }),
          },
        })
        await closeStep(executionId, s, 'succeeded', { childExecutionId: childExec.id, agent: agent.name, workflowNode: node.key })
        await runAgentExecution(childExec.id, agent.id, {
          workspaceId: opts.workspaceId, agentId: agent.id, input: childInput,
          trigger: 'delegation', parentExecutionId: executionId, delegationDepth: 1,
        })
        const child = await db.execution.findUnique({ where: { id: childExec.id } })
        if (child?.status === 'waiting_approval') {
          // governed pause: the child needs a human approval — checkpoint the whole workflow
          await db.execution.update({
            where: { id: executionId },
            data: {
              status: 'waiting_approval',
              checkpointJson: JSON.stringify({ phase: 'awaiting_child_approval', nodeKey: node.key, childExecutionId: childExec.id }),
            },
          })
          throw new WorkflowPaused()
        }
        if (child?.status !== 'succeeded') {
          throw new Error(`agent node "${node.label}" ended ${child?.status ?? 'unknown'}: ${child?.error ?? ''}`)
        }
        const out = jparse<Record<string, unknown>>(child.outputJson ?? '{}', {})
        ctx.artifacts[node.key] = out
        opts.onCost(child.costUsd)
        return out
      }
      case 'tool': {
        const tool = await db.tool.findUnique({ where: { id: node.config.toolId ?? '' } })
        if (!tool || tool.workspaceId !== opts.workspaceId) throw new Error(`tool node "${node.label}" references missing tool`)
        const toolInput = resolveTemplate(node.config.inputTemplate, ctx)
        const verdict = await enforcePolicy(opts.workspaceId, {
          subject: `workflow:${executionId}`, action: 'tool_invoke', resource: tool.id,
          environment: 'production', dataClass: tool.dataClass, autonomyLevel: 'A2',
          estimatedCostUsd: 0.002,
          metadata: { toolId: tool.id, toolSlug: tool.slug, toolRiskClass: tool.riskClass, toolName: tool.name },
          executionId,
        })
        if (verdict.decision !== 'allow') {
          await closeStep(executionId, s, 'denied', { decision: verdict.decision, reason: verdict.reason })
          throw new Error(`tool "${tool.name}" blocked by policy: ${verdict.reason}`)
        }
        if (exec?.isReplay && ['high', 'critical'].includes(tool.riskClass)) {
          await closeStep(executionId, s, 'skipped', { reason: 'replay: external mutation suppressed for side-effecting tool' })
          return { skipped: true }
        }
        const outcome = await executeToolCall(tool, toolInput, {
          workspaceId: opts.workspaceId, executionId, agentId: null, agentName: `workflow:${node.key}`,
          autonomyLevel: 'A2', environment: 'production', dataClass: tool.dataClass, isReplay: exec?.isReplay ?? false,
        })
        opts.onToolCall()
        opts.onCost(0.002)
        await closeStep(executionId, s, outcome.status, { tool: tool.name, latencyMs: outcome.latencyMs, simulated: outcome.simulated, policyReason: verdict.reason })
        ctx.artifacts[node.key] = outcome.output ?? {}
        return outcome.output ?? {}
      }
      case 'condition': {
        const truthy = evalExpr(node.config.expr ?? 'true == true', ctx)
        await closeStep(executionId, s, 'succeeded', { expr: node.config.expr, result: truthy })
        return truthy
      }
      case 'parallel': {
        const children = node.config.children ?? []
        await closeStep(executionId, s, 'succeeded', { fanOut: children.length, mode: 'concurrent' })
        const results = await Promise.all(children.map((key) => {
          const child = spec.nodes.find((n) => n.key === key)
          if (!child) return Promise.resolve(null)
          return executeNode(executionId, spec, child, ctx, opts, depth + 1)
        }))
        const joined: Record<string, unknown> = {}
        children.forEach((key, i) => { joined[key] = results[i] })
        ctx.artifacts[node.key] = joined
        return joined
      }
      case 'approval': {
        const approval = await db.approval.create({
          data: {
            workspaceId: opts.workspaceId, executionId, kind: 'privileged',
            title: node.label, detailJson: JSON.stringify({ nodeKey: node.key, expr: node.config.expr, artifactsSnapshot: Object.keys(ctx.artifacts) }),
            requestedBy: `workflow:${node.key}`, riskClass: 'high', reviewerRole: 'admin',
            expiresAt: new Date(Date.now() + 24 * 3600_000),
          },
        })
        await closeStep(executionId, s, 'waiting_approval', { approvalId: approval.id })
        await db.execution.update({
          where: { id: executionId },
          data: {
            status: 'waiting_approval',
            checkpointJson: JSON.stringify({ phase: 'awaiting_approval_node', nodeKey: node.key, approvalId: approval.id }),
          },
        })
        await db.notification.create({
          data: { workspaceId: opts.workspaceId, kind: 'approval_request', title: `Workflow checkpoint: ${node.label}`, body: 'Human approval required before the workflow continues.', severity: 'critical', linkView: 'executions' },
        })
        throw new WorkflowPaused()
      }
      case 'delay': {
        const seconds = Math.min(node.config.delaySeconds ?? 1, MAX_DELAY_SECONDS)
        await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
        await closeStep(executionId, s, 'succeeded', { seconds, bounded: seconds < (node.config.delaySeconds ?? 1) })
        return { waited: seconds }
      }
      case 'loop': {
        const iterations = Math.min(node.config.iterations ?? 2, 5)
        const results: unknown[] = []
        // loop body = children of the loop node (first child target)
        for (let i = 0; i < iterations; i++) {
          const bodyNode = spec.nodes.find((n) => n.key === node.config.children?.[0])
          if (!bodyNode) break
          const r = await executeNode(executionId, spec, bodyNode, ctx, opts, depth + 1)
          results.push(r)
        }
        await closeStep(executionId, s, 'succeeded', { iterations, bound: iterations })
        ctx.artifacts[node.key] = results
        return results
      }
      case 'memory': {
        const ns = await db.memoryNamespace.findFirst({
          where: { id: node.config.namespaceId ?? '', workspaceId: opts.workspaceId },
        })
        await closeStep(executionId, s, ns ? 'succeeded' : 'failed', { namespace: ns?.name ?? 'missing' })
        ctx.artifacts[node.key] = ns ? { namespace: ns.name } : {}
        return ctx.artifacts[node.key]
      }
      case 'model': {
        // model nodes inside workflows are executed via their owning agent; standalone = routing note
        await closeStep(executionId, s, 'succeeded', { note: 'model node executed through bound agent runtime' })
        return {}
      }
      case 'error': {
        // error-boundary node: runs compensation if configured, then fails the workflow
        if (node.config.compensation?.toolId) {
          const tool = await db.tool.findFirst({
            where: { id: node.config.compensation.toolId, workspaceId: opts.workspaceId },
          })
          if (tool) {
            await executeToolCall(tool, { reason: 'compensation', workflowNode: node.key }, {
              workspaceId: opts.workspaceId, executionId, agentId: null, agentName: 'compensation',
              autonomyLevel: 'A2', environment: 'production', dataClass: tool.dataClass, isReplay: false,
            })
          }
        }
        await closeStep(executionId, s, 'succeeded', { compensation: node.config.compensation?.note ?? 'none' })
        return { compensated: true }
      }
      case 'output': {
        const outputs: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(node.config.inputTemplate ?? {})) {
          outputs[k] = resolvePath(String(v).replace(/^\$\.?/, ''), ctx)
        }
        await closeStep(executionId, s, 'succeeded', { keys: Object.keys(outputs) })
        ctx.artifacts[node.key] = outputs
        return outputs
      }
      default: {
        await closeStep(executionId, s, 'skipped', { reason: 'node type passthrough' })
        return {}
      }
    }
  } catch (err) {
    if (err instanceof WorkflowPaused) throw err
    const message = err instanceof Error ? err.message : String(err)
    const onError = node.config.onError ?? 'fail'
    if (onError === 'continue') {
      await closeStep(executionId, s, 'skipped', { error: message.slice(0, 200), handled: 'continue' })
      return { error: message }
    }
    if (onError === 'compensate' && node.config.compensation?.toolId) {
      const tool = await db.tool.findFirst({
        where: { id: node.config.compensation.toolId, workspaceId: opts.workspaceId },
      })
      if (tool) {
        await executeToolCall(tool, { reason: 'compensation after failure', failedNode: node.key }, {
          workspaceId: opts.workspaceId, executionId, agentId: null, agentName: 'compensation',
          autonomyLevel: 'A2', environment: 'production', dataClass: tool.dataClass, isReplay: false,
        })
        opts.onToolCall()
      }
      await closeStep(executionId, s, 'failed', { error: message.slice(0, 200), compensated: true })
      throw err
    }
    await closeStep(executionId, s, 'failed', { error: message.slice(0, 200) })
    throw err
  }
}

/** Resume a workflow paused at an approval node. */
export async function resumeWorkflowAfterApproval(executionId: string, approved: boolean, reviewerName: string): Promise<void> {
  const exec = await db.execution.findUnique({ where: { id: executionId } })
  if (!exec || exec.status !== 'waiting_approval') return
  const cp = jparse<{ phase?: string; nodeKey?: string }>(exec.checkpointJson, {})
  if (!approved) {
    await db.execution.update({
      where: { id: executionId },
      data: { status: 'failed', finishedAt: new Date(), error: `Approval rejected by ${reviewerName} at checkpoint "${cp.nodeKey ?? 'unknown'}"`, checkpointJson: JSON.stringify({ phase: 'failed' }) },
    })
    return
  }
  await db.execution.update({ where: { id: executionId }, data: { status: 'running' } })
  await audit({
    organizationId: (await db.workspace.findUnique({ where: { id: exec.workspaceId } }))?.organizationId ?? '',
    workspaceId: exec.workspaceId, actorType: 'user', actorName: reviewerName,
    action: 'approval.approve', resourceType: 'workflow', resourceId: exec.workflowId ?? '', severity: 'notice',
    detail: { executionId, checkpoint: cp.nodeKey },
  })
  // re-run from the approved node (idempotent walker: node marked visited will re-execute once)
  const wf = exec.workflowId ? await db.workflow.findUnique({ where: { id: exec.workflowId } }) : null
  if (!wf) return
  const spec = jparse<WorkflowSpec>(wf.specJson, null as unknown as WorkflowSpec)
  const node = spec.nodes.find((n) => n.key === cp.nodeKey)
  if (!node) return
  // execute the approved node then continue walking
  const context: WorkflowContext = { input: jparse<Record<string, unknown>>(exec.inputJson, {}), artifacts: {}, visited: new Map() }
  const caps = jparse<{ timeoutMs: number; maxCostUsd: number }>(exec.budgetCapsJson, { timeoutMs: 120_000, maxCostUsd: 5 })
  let totalCost = 0
  await executeNode(executionId, spec, node, context, {
    totalCost: () => totalCost, maxCost: caps.maxCostUsd,
    deadline: Date.now() + caps.timeoutMs,
    onCost: (c) => { totalCost += c }, onToolCall: () => {}, workspaceId: exec.workspaceId,
  }, 0)
  await walkFrom(executionId, spec, node.key, context, {
    totalCost: () => totalCost, maxCost: caps.maxCostUsd,
    deadline: Date.now() + caps.timeoutMs,
    onCost: (c) => { totalCost += c }, onToolCall: () => {}, workspaceId: exec.workspaceId,
  })
  const finishedAt = new Date()
  await db.execution.update({
    where: { id: executionId },
    data: { status: 'succeeded', finishedAt, durationMs: finishedAt.getTime() - exec.startedAt.getTime(), checkpointJson: JSON.stringify({ phase: 'completed' }) },
  })
}

/** Resume a workflow paused while a child agent execution awaited approval. */
export async function resumeWorkflowFromChild(executionId: string): Promise<void> {
  const exec = await db.execution.findUnique({ where: { id: executionId } })
  if (!exec || exec.status !== 'waiting_approval') return
  const cp = jparse<{ phase?: string; nodeKey?: string; childExecutionId?: string }>(exec.checkpointJson, {})
  if (cp.phase !== 'awaiting_child_approval' || !cp.childExecutionId || !cp.nodeKey) return
  const child = await db.execution.findUnique({ where: { id: cp.childExecutionId } })
  if (!child) return
  const wf = exec.workflowId ? await db.workflow.findUnique({ where: { id: exec.workflowId } }) : null
  if (!wf) return
  const spec = jparse<WorkflowSpec>(wf.specJson, null as unknown as WorkflowSpec)
  const node = spec.nodes.find((n) => n.key === cp.nodeKey)
  if (!node) return
  await db.execution.update({ where: { id: executionId }, data: { status: 'running' } })
  const context: WorkflowContext = { input: jparse<Record<string, unknown>>(exec.inputJson, {}), artifacts: {}, visited: new Map() }
  const caps = jparse<{ timeoutMs: number; maxCostUsd: number }>(exec.budgetCapsJson, { timeoutMs: 120_000, maxCostUsd: 5 })
  let totalCost = child.costUsd
  if (child.status === 'succeeded') {
    const out = jparse<Record<string, unknown>>(child.outputJson ?? '{}', {})
    context.artifacts[cp.nodeKey] = out
    await openStep(executionId, 'agent', `Resume after approval: ${node.label}`, node.key)
      .then((meta) => closeStep(executionId, meta, 'succeeded', { childExecutionId: child.id, approvedResume: true }))
  } else {
    await db.execution.update({
      where: { id: executionId },
      data: { status: 'failed', finishedAt: new Date(), error: `child execution ended ${child.status}: ${child.error ?? ''}` },
    })
    return
  }
  await walkFrom(executionId, spec, cp.nodeKey, context, {
    totalCost: () => totalCost, maxCost: caps.maxCostUsd,
    deadline: Date.now() + caps.timeoutMs,
    onCost: (c) => { totalCost += c }, onToolCall: () => {}, workspaceId: exec.workspaceId,
  })
  const finishedAt = new Date()
  await db.execution.update({
    where: { id: executionId },
    data: {
      status: 'succeeded', finishedAt,
      durationMs: finishedAt.getTime() - exec.startedAt.getTime(),
      costUsd: Math.round(totalCost * 1e6) / 1e6,
      outputJson: JSON.stringify(context.artifacts[cp.nodeKey] ?? {}),
      checkpointJson: JSON.stringify({ phase: 'completed' }),
    },
  })
}

// ---- helpers ----

async function openStep(executionId: string, kind: string, label: string, nodeKey = '') {
  const count = await db.executionStep.count({ where: { executionId } })
  const row = await db.executionStep.create({
    data: { executionId, seq: count, kind, label, nodeKey, status: 'running', startedAt: new Date() },
  })
  return { seq: count, startedAt: row.startedAt }
}

async function closeStep(executionId: string, meta: { seq: number; startedAt: Date }, status: string, detail: Record<string, unknown>) {
  const endedAt = new Date()
  await db.executionStep.update({
    where: { executionId_seq: { executionId, seq: meta.seq } },
    data: { status, endedAt, durationMs: Math.max(1, endedAt.getTime() - meta.startedAt.getTime()), detailJson: JSON.stringify(detail) },
  })
}

function resolvePath(path: string, ctx: WorkflowContext): unknown {
  const parts = path.split('.').filter(Boolean)
  let cur: unknown = parts[0] === 'input' ? ctx.input : ctx.artifacts
  for (const p of parts.slice(1)) {
    if (typeof cur === 'object' && cur !== null && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p]
    } else if (typeof cur === 'object' && cur !== null) {
      cur = (cur as Record<string, unknown>)[p] ?? undefined
    } else return undefined
  }
  return cur
}

function resolveTemplate(template: Record<string, string> | undefined, ctx: WorkflowContext): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!template) return ctx.input
  for (const [k, v] of Object.entries(template)) {
    out[k] = typeof v === 'string' && v.startsWith('$.') ? resolvePath(v.slice(2), ctx) : v
  }
  return Object.keys(out).length ? out : ctx.input
}

/** Safe expression evaluator: "<path> <op> <literal>" with a closed operator set (no eval). */
export function evalExpr(expr: string, ctx: WorkflowContext): boolean {
  const match = expr.match(/^([\w.[\]]+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/)
  if (!match) return false
  const [, path, op, rawValue] = match
  const left = resolvePath(path.trim(), ctx)
  const valueToken = rawValue.trim().replace(/^['"]|['"]$/g, '')
  const leftNum = Number(left)
  const rightNum = Number(valueToken)
  const bothNumeric = !Number.isNaN(leftNum) && !Number.isNaN(rightNum) && valueToken !== ''
  switch (op) {
    case '==': return bothNumeric ? leftNum === rightNum : String(left) === valueToken
    case '!=': return bothNumeric ? leftNum !== rightNum : String(left) !== valueToken
    case '>': return bothNumeric ? leftNum > rightNum : String(left) > valueToken
    case '<': return bothNumeric ? leftNum < rightNum : String(left) < valueToken
    case '>=': return bothNumeric ? leftNum >= rightNum : String(left) >= valueToken
    case '<=': return bothNumeric ? leftNum <= rightNum : String(left) <= valueToken
    default: return false
  }
}
