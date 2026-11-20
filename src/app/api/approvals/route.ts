import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiContext, withApi } from '@/lib/api-utils'
import { jparse } from '@/lib/types'

export async function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req)
    const url = new URL(req.url)
    const status = url.searchParams.get('status') ?? ''
    const approvals = await db.approval.findMany({
      where: { workspaceId: ctx.workspaceId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    // enrich with execution + agent names
    const execIds = approvals.map((a) => a.executionId).filter(Boolean) as string[]
    const execs = execIds.length ? await db.execution.findMany({ where: { id: { in: execIds } }, include: { agent: { select: { name: true } } } }) : []
    const execMap = new Map(execs.map((e) => [e.id, e]))
    return {
      approvals: approvals.map((a) => {
        const exec = a.executionId ? execMap.get(a.executionId) : null
        return {
          id: a.id, kind: a.kind, title: a.title, status: a.status, riskClass: a.riskClass,
          requestedBy: a.requestedBy, reviewerRole: a.reviewerRole,
          detail: jparse(a.detailJson, {}), decisionNote: a.decisionNote, decidedBy: a.decidedBy,
          decidedAt: a.decidedAt?.toISOString() ?? null, expiresAt: a.expiresAt?.toISOString() ?? null,
          createdAt: a.createdAt.toISOString(),
          executionId: a.executionId, agentName: exec?.agent?.name ?? null, executionStatus: exec?.status ?? null,
        }
      }),
    }
  })
}
