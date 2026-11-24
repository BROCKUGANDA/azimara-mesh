// One-click demo sign-in. The demo identity and its role are resolved entirely
// on the server from configuration + persisted membership. The client supplies
// no email, role or permission, so this cannot be used to escalate privileges.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  buildSessionContext, createSessionToken, sessionCookieOptions, sessionMetaFromRequest, SESSION_COOKIE, AuthError,
} from '@/lib/auth'
import { audit } from '@/lib/audit'
import { ROLE_RANK, type Role } from '@/lib/types'

export async function POST(req: NextRequest) {
  // Explicit opt-in outside development; production must choose to expose it.
  if (process.env.MESH_DEMO_LOGIN !== '1' && process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: { code: 'DEMO_DISABLED', message: 'Demo sign-in is not enabled' } },
      { status: 403 },
    )
  }

  const email = (process.env.MESH_DEMO_EMAIL ?? 'admin@mesh.aiazimara.com').toLowerCase().trim()
  const user = await db.user.findUnique({ where: { email } })
  if (!user || user.status !== 'active') {
    return NextResponse.json(
      { error: { code: 'DEMO_UNAVAILABLE', message: 'Demo account is unavailable' } },
      { status: 401 },
    )
  }

  // RBAC: the role comes from the persisted membership, is validated against
  // the known role set, and must be at least viewer. No client input is used.
  const membership = await db.membership.findFirst({
    where: { userId: user.id },
    include: { workspace: { select: { organizationId: true } } },
  })
  if (!membership || (ROLE_RANK[membership.role as Role] ?? -1) < ROLE_RANK.viewer) {
    return NextResponse.json(
      { error: { code: 'DEMO_UNAVAILABLE', message: 'Demo identity has no valid workspace role' } },
      { status: 403 },
    )
  }

  try {
    const context = await buildSessionContext(user.id, membership.workspaceId)
    const token = await createSessionToken(user.id)
    const res = NextResponse.json({ authenticated: true, ...context })
    res.cookies.set(SESSION_COOKIE, token, await sessionCookieOptions(req))
    await audit({
      organizationId: membership.workspace.organizationId,
      workspaceId: membership.workspaceId,
      actorId: user.id,
      actorName: user.name,
      action: 'auth.demo_login',
      resourceType: 'session',
      resourceId: user.id,
      severity: 'notice',
      detail: { role: membership.role, via: 'one-click-demo' },
    })
    return res
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status })
    }
    throw err
  }
}
