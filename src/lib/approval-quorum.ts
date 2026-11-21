// Approval quorum: an approval with quorum > 1 requires that many distinct
// authorised reviewers before it finalises. Any rejection vetoes immediately.
import { db } from '@/lib/db'

export interface QuorumState {
  reached: boolean
  approved: number
  rejected: number
  quorum: number
  vetoed: boolean
}

/** Record one reviewer's decision. Unique (approvalId,userId) prevents double votes. */
export async function recordApprovalDecision(input: {
  approvalId: string
  userId: string
  decision: 'approve' | 'reject'
  note?: string
}): Promise<{ ok: boolean; state: QuorumState }> {
  const approval = await db.approval.findUnique({
    where: { id: input.approvalId },
    select: { quorum: true, status: true },
  })
  if (!approval || approval.status !== 'pending') {
    const state = await quorumState(input.approvalId)
    return { ok: false, state }
  }
  await db.approvalDecision.upsert({
    where: { approvalId_userId: { approvalId: input.approvalId, userId: input.userId } },
    create: {
      approvalId: input.approvalId,
      userId: input.userId,
      decision: input.decision,
      note: input.note ?? null,
    },
    update: { decision: input.decision, note: input.note ?? null, decidedAt: new Date() },
  })
  const state = await quorumState(input.approvalId)
  return { ok: state.reached || state.vetoed, state }
}

export async function quorumState(approvalId: string): Promise<QuorumState> {
  const approval = await db.approval.findUnique({
    where: { id: approvalId },
    select: { quorum: true },
  })
  const quorum = approval?.quorum ?? 1
  const decisions = await db.approvalDecision.findMany({
    where: { approvalId },
    select: { decision: true },
  })
  const approved = decisions.filter((d) => d.decision === 'approve').length
  const rejected = decisions.filter((d) => d.decision === 'reject').length
  return {
    quorum,
    approved,
    rejected,
    vetoed: rejected > 0,
    reached: approved >= quorum && rejected === 0,
  }
}
