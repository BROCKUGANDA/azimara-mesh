import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiContext, withApi, readJson, badRequest, notFound } from '@/lib/api-utils'
import { audit } from '@/lib/audit'
import { jparse, type TraceSpan } from '@/lib/types'
import { redactToolCall } from '@/lib/tool-runtime'
import { startAgentRun } from '@/lib/execution-engine'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  return withApi(async () => {
    const ctx = await apiContext(req)
    const { id } = await params
    const exec = await db.execution.findUnique({
      where: { id },
      include: {
        agent: { select: { id: true, name: true, slug: true, autonomyLevel: true } },
        workflow: { select: { id: true, name: true, slug: true } },
        steps: { orderBy: { seq: 'asc' } },
      },
    })
    if (!exec || exec.workspaceId !== ctx.workspaceId) notFound('Execution not found')

    const [toolCalls, messages, decisions, childExecs, parent] = await Promise.all([
      db.toolCall.findMany({ where: { executionId: id }, orderBy: { createdAt: 'asc' } }),
      db.agentMessage.findMany({ where: { executionId: id }, orderBy: { createdAt: 'asc' } }),
      db.policyDecision.findMany({ where: { executionId: id }, orderBy: { createdAt: 'asc' } }),
      db.execution.findMany({ where: { parentExecutionId: id }, select: { id: true, status: true, agentId: true, delegationDepth: true } }),
      exec.parentExecutionId ? db.execution.findUnique({ where: { id: exec.parentExecutionId }, select: { id: true, status: true } }) : null,
    ])

    const spans: TraceSpan[] = exec.steps.map((s) => ({
      seq: s.seq, kind: s.kind, label: s.label, nodeKey: s.nodeKey, status: s.status,
      startedAt: s.startedAt.toISOString(), endedAt: s.endedAt?.toISOString() ?? null,
      durationMs: s.durationMs, detail: jparse(s.detailJson, {}),
    }))

    return {
      execution: {
        id: exec.id, kind: exec.kind, status: exec.status, trigger: exec.trigger,
        correlationId: exec.correlationId,
        agent: exec.agent ? { id: exec.agent.id, name: exec.agent.name, autonomyLevel: exec.agent.autonomyLevel } : null,
        workflow: exec.workflow ? { id: exec.workflow.id, name: exec.workflow.name } : null,
        agentVersion: exec.agentVersion, workflowVersion: exec.workflowVersion,
        parentExecutionId: exec.parentExecutionId, parentStatus: parent?.status ?? null,
        delegationDepth: exec.delegationDepth, isReplay: exec.isReplay,
        identitySubject: exec.identitySubject,
        input: jparse(exec.inputJson, {}),
        output: exec.outputJson ? jparse(exec.outputJson, null) : null,
        error: exec.error,
        startedAt: exec.startedAt.toISOString(), finishedAt: exec.finishedAt?.toISOString() ?? null,
        durationMs: exec.durationMs, costUsd: Math.round(exec.costUsd * 10000) / 10000,
        tokenIn: exec.tokenIn, tokenOut: exec.tokenOut, toolCallCount: exec.toolCallCount, retryCount: exec.retryCount,
        budgetCaps: jparse(exec.budgetCapsJson, {}),
        checkpoint: jparse(exec.checkpointJson, {}),
        children: childExecs,
      },
      spans,
      toolCalls: toolCalls.map((c) => ({
        id: c.id, toolName: c.toolName, toolId: c.toolId, status: c.status, latencyMs: c.latencyMs,
        error: c.error, createdAt: c.createdAt.toISOString(),
        ...redactToolCall(c),
      })),
      messages: messages.map((m) => ({
        id: m.id, senderId: m.senderId, recipientId: m.recipientId, type: m.type,
        schemaVersion: m.schemaVersion, correlationId: m.correlationId, status: m.status,
        payload: jparse(m.payloadJson, {}), authContext: jparse(m.authContextJson, {}),
        createdAt: m.createdAt.toISOString(),
      })),
      decisions: decisions.map((d) => ({
        id: d.id, policyName: d.policyName, action: d.action, resource: d.resource,
        decision: d.decision, reason: d.reason, context: jparse(d.contextJson, {}),
        createdAt: d.createdAt.toISOString(),
      })),
    }
  })
}

export async function POST(req: NextRequest, { params }: Params) {
  return withApi(async () => {
    const ctx = await apiContext(req, 'operator')
    const { id } = await params
    const exec = await db.execution.findUnique({ where: { id } })
    if (!exec || exec.workspaceId !== ctx.workspaceId) notFound('Execution not found')
    const body = await readJson<{ action?: string; reason?: string }>(req)

    if (body.action === 'cancel') {
      if (!['queued', 'running', 'waiting_approval'].includes(exec.status)) {
        badRequest(`Cannot cancel an execution in state ${exec.status}`)
      }
      await db.execution.update({ where: { id }, data: { status: 'cancelled', finishedAt: new Date(), error: `Cancelled by ${ctx.userName}` } })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'execution.cancel', resourceType: 'execution', resourceId: id, severity: 'notice', detail: { reason: body.reason ?? '' } })
      return { execution: { id, status: 'cancelled' } }
    }

    if (body.action === 'replay') {
      if (!exec.agentId) badRequest('Only agent executions can be replayed from this endpoint')
      const result = await startAgentRun({
        workspaceId: ctx.workspaceId, agentId: exec.agentId,
        input: jparse(exec.inputJson, { prompt: 'Replay of execution ' + id }),
        trigger: 'replay', userId: ctx.userId, userName: ctx.userName, isReplay: true,
        correlationId: exec.correlationId,
      })
      if (!result.ok) badRequest(result.error ?? 'replay rejected')
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'execution.replay', resourceType: 'execution', resourceId: id, severity: 'notice', detail: { newExecutionId: result.executionId, note: 'external side effects suppressed in replay mode' } })
      return { executionId: result.executionId, isReplay: true }
    }

    badRequest(`Unknown action: ${body.action}`)
  })
}
