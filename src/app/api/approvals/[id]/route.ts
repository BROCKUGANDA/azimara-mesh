import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiContext, withApi, readJson, badRequest, notFound } from '@/lib/api-utils'
import { audit } from '@/lib/audit'
import { resumeAfterApproval } from '@/lib/execution-engine'
import { resumeWorkflowAfterApproval } from '@/lib/workflow-engine'

type Params = { params: Promise<{ id: string }> }

async function resumePausedExecution(executionId: string, reviewerName: string): Promise<void> {
  const exec = await db.execution.findUnique({ where: { id: executionId }, select: { kind: true, status: true } })
  if (exec?.status !== 'waiting_approval') return
  if (exec.kind === 'workflow_run') {
    void resumeWorkflowAfterApproval(executionId, true, reviewerName)
  } else {
    void resumeAfterApproval(executionId, true, reviewerName)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  return withApi(async () => {
    const ctx = await apiContext(req, 'operator')
    const { id } = await params
    const approval = await db.approval.findFirst({ where: { id, workspaceId: ctx.workspaceId } })
    if (!approval) notFound('Approval not found')
    if (approval.status !== 'pending') badRequest(`Approval already ${approval.status}`)
    if (approval.expiresAt && approval.expiresAt < new Date()) badRequest('Approval request has expired')

    const body = await readJson<{ decision?: 'approve' | 'reject'; note?: string }>(req)
    if (!body.decision || !['approve', 'reject'].includes(body.decision)) badRequest('decision must be approve | reject')

    // The approval declares the minimum reviewer role; an operator must not be
    // able to self-approve a decision bound to an admin/owner role.
    const { requireRole } = await import('@/lib/auth')
    await requireRole(ctx.userId, ctx.workspaceId, approval.reviewerRole as never)

    const approving = body.decision === 'approve'

    if (approval.quorum > 1) {
      // Quorum mode: each authorised reviewer records one decision. A rejection
      // vetoes immediately; approval finalises when the required count is met.
      const { recordApprovalDecision } = await import('@/lib/approval-quorum')
      const { state } = await recordApprovalDecision({
        approvalId: id, userId: ctx.userId, decision: approving ? 'approve' : 'reject', note: body.note,
      })
      await audit({
        organizationId: ctx.organizationId, workspaceId: ctx.workspaceId,
        actorId: ctx.userId, actorName: ctx.userName,
        action: 'approval.vote', resourceType: 'approval', resourceId: id, severity: 'notice',
        detail: { decision: body.decision, approved: state.approved, quorum: state.quorum },
      })
      if (!state.reached && !state.vetoed) {
        return { approval: { id, status: 'pending', quorum: state.quorum, approved: state.approved } }
      }
      const finalStatus = state.vetoed ? 'rejected' : 'approved'
      const claimed = await db.approval.updateMany({
        where: { id, workspaceId: ctx.workspaceId, status: 'pending' },
        data: { status: finalStatus, decidedAt: new Date(), decidedBy: ctx.userId },
      })
      if (claimed.count === 1 && state.reached && approval.executionId) {
        await resumePausedExecution(approval.executionId, ctx.userName)
      }
      return { approval: { id, status: finalStatus } }
    }

    // Single-reviewer mode: compare-and-set prevents a double decision.
    const claimed = await db.approval.updateMany({
      where: { id, workspaceId: ctx.workspaceId, status: 'pending' },
      data: {
        status: approving ? 'approved' : 'rejected',
        decidedBy: ctx.userId,
        decisionNote: body.note ?? null,
        decidedAt: new Date(),
      },
    })
    if (claimed.count !== 1) badRequest('Approval already decided')
    if (approval.executionId) await resumePausedExecution(approval.executionId, ctx.userName)

    await audit({
      organizationId: ctx.organizationId, workspaceId: ctx.workspaceId,
      actorId: ctx.userId, actorName: ctx.userName,
      action: approving ? 'approval.approve' : 'approval.reject',
      resourceType: 'approval', resourceId: id, severity: 'notice',
      detail: { kind: approval.kind, title: approval.title, note: body.note ?? '' },
    })
    return { approval: { id, status: approving ? 'approved' : 'rejected' } }
  })
}
