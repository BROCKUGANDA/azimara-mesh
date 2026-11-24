// Session management: list this user's sessions and revoke one or all others.
// Every operation is scoped to the server-resolved userId — a caller can never
// address another user's session, even with a guessed id.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, listUserSessions, revokeSession, revokeAllSessions } from '@/lib/auth'
import { apiError } from '@/lib/types'
import { audit } from '@/lib/audit'

async function scope() {
  const session = await getSessionUser()
  if (!session) return null
  const membership = await db.membership.findFirst({
    where: { userId: session.userId },
    include: { workspace: { select: { organizationId: true } } },
  })
  return {
    session,
    organizationId: membership?.workspace.organizationId ?? '',
    workspaceId: membership?.workspaceId ?? null,
  }
}

export async function GET() {
  const ctx = await scope()
  if (!ctx) return apiError('UNAUTHENTICATED', 'Sign in to continue', 401)
  const sessions = await listUserSessions(ctx.session.userId, ctx.session.sid)
  return NextResponse.json({ sessions })
}

export async function POST(req: NextRequest) {
  const ctx = await scope()
  if (!ctx) return apiError('UNAUTHENTICATED', 'Sign in to continue', 401)
  const body = (await req.json().catch(() => null)) as { op?: string; sid?: string } | null

  if (body?.op === 'revoke') {
    const sid = typeof body.sid === 'string' ? body.sid : ''
    if (!sid) return apiError('BAD_REQUEST', 'sid is required', 400)
    const target = await db.userSession.findFirst({
      where: { id: sid, userId: ctx.session.userId },
      select: { id: true },
    })
    if (!target) return apiError('NOT_FOUND', 'Session not found', 404)
    await revokeSession(sid)
    await audit({
      organizationId: ctx.organizationId,
      workspaceId: ctx.workspaceId,
      actorId: ctx.session.userId,
      action: 'auth.session_revoke',
      resourceType: 'session',
      resourceId: sid,
      severity: 'notice',
    })
    return NextResponse.json({ ok: true, sid })
  }

  if (body?.op === 'revoke_others') {
    const count = await revokeAllSessions(ctx.session.userId, ctx.session.sid)
    await audit({
      organizationId: ctx.organizationId,
      workspaceId: ctx.workspaceId,
      actorId: ctx.session.userId,
      action: 'auth.session_revoke_all',
      resourceType: 'session',
      resourceId: ctx.session.sid,
      severity: 'notice',
      detail: { revoked: count },
    })
    return NextResponse.json({ ok: true, revoked: count })
  }

  return apiError('BAD_REQUEST', 'Unknown operation', 400)
}
