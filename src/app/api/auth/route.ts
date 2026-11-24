import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { buildSessionContext, createSessionToken, verifyPassword, SESSION_COOKIE, sessionCookieOptions, sessionMetaFromRequest, clearSessionCookie, getSessionUser, revokeSession } from '@/lib/auth'
import { apiError } from '@/lib/types'
import { audit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return Response.json({ authenticated: false })
  const ctx = await buildSessionContext(session.userId, req.headers.get('x-workspace-id'))
  return Response.json({ authenticated: true, ...ctx })
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { email?: string; password?: string } | null
  if (!body?.email || !body?.password) {
    return apiError('BAD_REQUEST', 'email and password are required', 400)
  }
  const user = await db.user.findUnique({ where: { email: body.email.toLowerCase().trim() } })
  if (!user || !verifyPassword(body.password, user.passwordHash)) {
    return apiError('INVALID_CREDENTIALS', 'Email or password is incorrect', 401)
  }
  if (user.status !== 'active') {
    return apiError('ACCOUNT_SUSPENDED', 'This account is suspended', 403)
  }
  const ctx = await buildSessionContext(user.id)
  const token = await createSessionToken(user.id, sessionMetaFromRequest(req))
  const res = NextResponse.json({ authenticated: true, ...ctx })
  res.cookies.set(SESSION_COOKIE, token, await sessionCookieOptions(req))
  const membership = await db.membership.findFirst({ where: { userId: user.id }, include: { workspace: true } })
  await audit({
    organizationId: membership?.workspace.organizationId ?? '',
    workspaceId: membership?.workspaceId ?? null,
    actorType: 'user', actorId: user.id, actorName: user.name, action: 'auth.login', resourceType: 'session', resourceId: user.id,
    severity: 'notice',
  })
  return res
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionUser()
  const res = NextResponse.json({ authenticated: false })
  // Match the attributes the cookie was issued with, otherwise the browser can
  // keep the old session alive after signout.
  await clearSessionCookie(res, req)
  if (session) {
    // Invalidate the record immediately — the cookie alone is not a revocation.
    await revokeSession(session.sid)
    const membership = await db.membership.findFirst({
      where: { userId: session.userId },
      include: { workspace: { select: { organizationId: true } } },
    })
    await audit({
      organizationId: membership?.workspace.organizationId ?? '',
      workspaceId: membership?.workspaceId ?? null,
      actorId: session.userId,
      action: 'auth.logout',
      resourceType: 'session',
      resourceId: session.sid,
      severity: 'notice',
    })
  }
  return res
}
