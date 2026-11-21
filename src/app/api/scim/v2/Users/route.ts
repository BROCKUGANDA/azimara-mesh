// Minimal SCIM 2.0 Users resource for enterprise provisioning. Protected by a
// dedicated bearer token (SCIM_BEARER_TOKEN), never a session cookie. SCIM only
// provisions users; role assignment still goes through application RBAC.
import { NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { apiError } from '@/lib/types'
import { randomBytes } from 'node:crypto'

function authorized(req: NextRequest): boolean {
  const expected = process.env.SCIM_BEARER_TOKEN
  if (!expected) return false
  const header = req.headers.get('authorization') ?? ''
  const match = header.match(/^Bearer\s+(.+)$/)
  if (!match) return false
  const a = Buffer.from(match[1])
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function scimUser(user: { id: string; email: string; name: string; status: string }) {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: user.id,
    userName: user.email,
    name: { formatted: user.name },
    active: user.status === 'active',
    meta: { resourceType: 'User', location: `/api/scim/v2/Users/${user.id}` },
  }
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return apiError('UNAUTHENTICATED', 'SCIM token required', 401)
  const url = new URL(req.url)
  const workspaceId = url.searchParams.get('workspaceId')
  if (!workspaceId) return apiError('BAD_REQUEST', 'workspaceId is required', 400)
  const count = Math.min(Number(url.searchParams.get('count') ?? 50), 200)
  const members = await db.membership.findMany({
    where: { workspaceId },
    include: { user: true },
    take: count,
  })
  return Response.json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: members.length,
    Resources: members.map((m) => scimUser(m.user)),
  })
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return apiError('UNAUTHENTICATED', 'SCIM token required', 401)
  const url = new URL(req.url)
  const workspaceId = url.searchParams.get('workspaceId')
  if (!workspaceId) return apiError('BAD_REQUEST', 'workspaceId is required', 400)
  const body = (await req.json().catch(() => null)) as {
    userName?: string
    name?: { formatted?: string }
    externalId?: string
  } | null
  if (!body?.userName) return apiError('BAD_REQUEST', 'userName is required', 400)
  const email = body.userName.toLowerCase()
  // SCIM-provisioned users get a random password and cannot sign in with it;
  // access is via SSO only. No owner role is granted implicitly.
  const user = await db.user.upsert({
    where: { email },
    create: {
      email,
      name: body.name?.formatted ?? email,
      passwordHash: hashPassword(randomBytes(32).toString('hex')),
      ssoProvider: `oidc:${body.externalId ?? email}`,
      status: 'active',
    },
    update: { name: body.name?.formatted ?? email, status: 'active' },
  })
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId } })
  if (!workspace) return apiError('NOT_FOUND', 'workspace not found', 404)
  await db.membership.upsert({
    where: { userId_workspaceId: { userId: user.id, workspaceId } },
    create: { userId: user.id, workspaceId, role: 'viewer' },
    update: {},
  })
  return Response.json(scimUser(user), { status: 201 })
}
