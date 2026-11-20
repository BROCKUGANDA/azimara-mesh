// Session auth, RBAC and password handling for the control plane.
// Passwords: scrypt with per-user salt. Sessions: HMAC-signed cookie, httpOnly.

import { createHmac, randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { setDatabaseContext } from '@/lib/db-context'
import { ROLE_RANK, type Role } from '@/lib/types'

const SESSION_COOKIE = 'mesh_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 days

async function sessionSecret(): Promise<string> {
  const envSecret = process.env.SESSION_SECRET
  if (envSecret) {
    if (process.env.NODE_ENV === 'production' && envSecret.length < 32) {
      throw new Error('SESSION_SECRET must be at least 32 characters in production')
    }
    return envSecret
  }
  if (process.env.NODE_ENV === 'production') {
    // Fail closed in production: a generated per-process secret would silently
    // invalidate every session on restart and across replicas.
    throw new Error('SESSION_SECRET is required in production')
  }
  // Dev/demo fallback: persist a random secret next to the database so sessions survive restarts.
  const fs = await import('node:fs')
  const path = await import('node:path')
  const fallback = path.default.join(process.cwd(), 'db', '.session-secret')
  try {
    const existing = fs.readFileSync(fallback, 'utf8').trim()
    if (existing) return existing
  } catch { /* first boot */ }
  const secret = randomBytes(32).toString('hex')
  fs.mkdirSync(path.default.dirname(fallback), { recursive: true })
  fs.writeFileSync(fallback, secret, { mode: 0o600 })
  return secret
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 32).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = scryptSync(password, salt, 32)
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

interface SessionPayload { userId: string; exp: number }

async function sign(payload: string): Promise<string> {
  return createHmac('sha256', await sessionSecret()).update(payload).digest('base64url')
}

export async function createSessionToken(userId: string): Promise<string> {
  const payload: SessionPayload = { userId, exp: Date.now() + SESSION_TTL_MS }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${await sign(body)}`
}

export async function readSessionToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token || !token.includes('.')) return null
  const [body, sig] = token.split('.')
  const expected = await sign(body)
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionPayload
    if (!payload.userId || payload.exp < Date.now()) return null
    return payload
  } catch { return null }
}

export interface SessionContext {
  user: { id: string; email: string; name: string; title: string; avatarHue: number }
  workspaces: { id: string; name: string; slug: string; role: Role; organizationId: string; dataClassification: string; monthlyBudget: number }[]
  organization: { id: string; name: string; planTier: string }
  activeWorkspaceId: string | null
  activeRole: Role | null
  isDemo: boolean
}

export async function getSessionUser(): Promise<{ userId: string } | null> {
  const jar = await cookies()
  const session = await readSessionToken(jar.get(SESSION_COOKIE)?.value)
  if (!session) return null
  setDatabaseContext({ userId: session.userId })
  // A signed cookie is not a revocation mechanism: check account status on
  // every request so suspended users lose access immediately.
  const user = await db.user.findUnique({ where: { id: session.userId }, select: { status: true } })
  if (!user || user.status !== 'active') return null
  return session
}

export async function requireSession(): Promise<{ userId: string }> {
  const session = await getSessionUser()
  if (!session) throw new AuthError('UNAUTHENTICATED', 'Sign in to continue')
  return session
}

export async function sessionCookieOptions(req?: Request | NextRequest) {
  // Secure by default: SameSite=Lax blocks cross-site POST/CSRF. SameSite=None
  // is *only* enabled when the operator explicitly opts into the embedded
  // preview mode (MESH_IFRAME_PREVIEW=1) — never merely because a proxy set
  // X-Forwarded-Proto: https. A proxy header is attacker-influenceable and must
  // not be able to downgrade the session cookie's CSRF protection.
  const iframePreview = process.env.MESH_IFRAME_PREVIEW === '1'
  const proto = (req?.headers.get('x-forwarded-proto') ?? 'http').split(',')[0].trim()
  const throughHttpsGateway = proto === 'https'
  const isProduction = process.env.NODE_ENV === 'production'
  return {
    httpOnly: true as const,
    sameSite: (iframePreview ? 'none' : 'lax') as 'none' | 'lax',
    secure: iframePreview ? true : throughHttpsGateway || isProduction,
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  }
}
export { SESSION_COOKIE }

export class AuthError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status = 401) {
    super(message); this.code = code; this.status = status
  }
}
export class PermissionError extends Error {
  code = 'FORBIDDEN'
  status = 403
  constructor(message: string) { super(message) }
}

export async function buildSessionContext(userId: string, activeWorkspaceId?: string | null): Promise<SessionContext> {
  setDatabaseContext({ userId })
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user || user.status === 'suspended') throw new AuthError('UNAUTHENTICATED', 'Account unavailable')
  const memberships = await db.membership.findMany({
    where: { userId },
    include: { workspace: { include: { organization: true } } },
  })
  const workspaces = memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    slug: m.workspace.slug,
    role: m.role as Role,
    organizationId: m.workspace.organizationId,
    dataClassification: m.workspace.dataClassification,
    monthlyBudget: m.workspace.monthlyBudget,
  }))
  const active = workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0] ?? null
  const org = memberships[0]?.workspace.organization
  return {
    user: { id: user.id, email: user.email, name: user.name, title: user.title, avatarHue: user.avatarHue },
    workspaces,
    organization: org ? { id: org.id, name: org.name, planTier: org.planTier } : { id: '', name: '', planTier: 'team' },
    activeWorkspaceId: active?.id ?? null,
    activeRole: active?.role ?? null,
    isDemo: user.isDemo,
  }
}

/** Resolve the caller's role for a workspace. Throws when the caller is not a member. */
export async function requireRole(userId: string, workspaceId: string, minimum: Role): Promise<Role> {
  // Fail closed on unknown role values (e.g. a corrupted/stale reviewerRole on
  // an approval): an unmapped rank must never compare as "allowed".
  const minimumRank = ROLE_RANK[minimum]
  if (minimumRank === undefined) throw new PermissionError('Invalid required role')
  const membership = await db.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  })
  if (!membership) throw new PermissionError('Not a member of this workspace')
  const role = membership.role as Role
  if ((ROLE_RANK[role] ?? -1) < minimumRank) {
    throw new PermissionError(`Requires ${minimum} role or above (you are ${role})`)
  }
  return role
}

/** Workspace boundary guard — every mutating/read API passes through here. */
export async function requireWorkspaceAccess(userId: string, workspaceId: string, minimum: Role = 'viewer'): Promise<Role> {
  if (!workspaceId) throw new AuthError('BAD_REQUEST', 'workspaceId is required', 400)
  return requireRole(userId, workspaceId, minimum)
}
