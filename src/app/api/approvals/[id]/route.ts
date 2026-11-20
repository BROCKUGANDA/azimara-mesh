import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiContext, withApi, readJson, badRequest, notFound } from '@/lib/api-utils'
import { audit } from '@/lib/audit'
import { resumeAfterApproval } from '@/lib/execution-engine'
import { resumeWorkflowAfterApproval } from '@/lib/workflow-engine'

type Params = { params: Promise<{ id: string }> }

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
    // Compare-and-set prevents two concurrent decisions from both claiming a
    // single pending approval and replaying the privileged action.
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

    // resume the paused execution when the approval was tied to one
    if (approval.executionId) {
      const exec = await db.execution.findUnique({ where: { id: approval.executionId }, select: { kind: true, status: true } })
      if (exec?.status === 'waiting_approval') {
        if (exec.kind === 'workflow_run') {
          void resumeWorkflowAfterApproval(approval.executionId, approving, ctx.userName)
        } else {
          void resumeAfterApproval(approval.executionId, approving, ctx.userName)
        }
      }
    }

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
