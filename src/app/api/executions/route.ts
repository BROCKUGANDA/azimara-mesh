import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiContext, withApi, readJson, badRequest } from '@/lib/api-utils'
import { startAgentRun } from '@/lib/execution-engine'
import { startWorkflowRun } from '@/lib/workflow-engine'
import { EXECUTION_STATUSES } from '@/lib/types'

export async function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req)
    const url = new URL(req.url)
    const status = url.searchParams.get('status') ?? ''
    const kind = url.searchParams.get('kind') ?? ''
    const take = Math.min(Number(url.searchParams.get('take') ?? 40), 100)

    const where: Record<string, unknown> = { workspaceId: ctx.workspaceId }
    if (status && EXECUTION_STATUSES.includes(status as never)) where.status = status
    if (kind) where.kind = kind

    const executions = await db.execution.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take,
      include: {
        agent: { select: { name: true, slug: true } },
        workflow: { select: { name: true, slug: true } },
      },
    })
    return {
      executions: executions.map((e) => ({
        id: e.id, kind: e.kind,
        agent: e.agent?.name ?? null, workflow: e.workflow?.name ?? null,
        agentVersion: e.agentVersion, workflowVersion: e.workflowVersion,
        status: e.status, trigger: e.trigger, correlationId: e.correlationId,
        parentExecutionId: e.parentExecutionId, delegationDepth: e.delegationDepth, isReplay: e.isReplay,
        startedAt: e.startedAt.toISOString(), finishedAt: e.finishedAt?.toISOString() ?? null,
        durationMs: e.durationMs, costUsd: Math.round(e.costUsd * 10000) / 10000,
        tokenIn: e.tokenIn, tokenOut: e.tokenOut, toolCallCount: e.toolCallCount,
        error: e.error, identitySubject: e.identitySubject,
      })),
    }
  })
}

export async function POST(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req, 'operator')
    const body = await readJson<{
      kind?: 'agent' | 'workflow'
      agentId?: string
      workflowId?: string
      input?: Record<string, unknown>
      isReplay?: boolean
    }>(req)

    if (body.kind === 'workflow') {
      if (!body.workflowId) badRequest('workflowId is required for workflow runs')
      const result = await startWorkflowRun({
        workspaceId: ctx.workspaceId, workflowId: body.workflowId,
        input: body.input ?? {}, trigger: 'api', userId: ctx.userId, userName: ctx.userName,
      })
      if (!result.ok) badRequest(result.error ?? 'workflow rejected')
      return { executionId: result.executionId }
    }

    if (!body.agentId) badRequest('agentId is required')
    const result = await startAgentRun({
      workspaceId: ctx.workspaceId, agentId: body.agentId,
      input: body.input && Object.keys(body.input).length ? body.input : { prompt: 'Run the standard task for this agent.' },
      trigger: 'api', userId: ctx.userId, userName: ctx.userName, isReplay: body.isReplay ?? false,
    })
    if (!result.ok) badRequest(result.error ?? 'execution rejected')
    return { executionId: result.executionId }
  })
}
