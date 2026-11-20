import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiContext, withApi, readJson, badRequest } from '@/lib/api-utils'
import { audit } from '@/lib/audit'
import { hashApiKey } from '@/lib/auth'
import { jparse } from '@/lib/types'

export async function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req)
    const [members, identities, keys] = await Promise.all([
      db.membership.findMany({ where: { workspaceId: ctx.workspaceId }, include: { user: true } }),
      db.serviceIdentity.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: 'asc' } }),
      db.apiKey.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: 'asc' } }),
    ])
    return {
      members: members.map((m) => ({
        id: m.id, userId: m.userId, name: m.user.name, email: m.user.email, title: m.user.title,
        role: m.role, status: m.user.status, mfaEnabled: m.user.mfaEnabled, avatarHue: m.user.avatarHue,
        joinedAt: m.createdAt.toISOString(),
      })),
      identities: identities.map((i) => ({
        id: i.id, name: i.name, kind: i.kind, scopes: jparse<string[]>(i.scopes, []),
        status: i.status, keyFingerprint: i.keyFingerprint, agentId: i.agentId,
        lastUsedAt: i.lastUsedAt?.toISOString() ?? null, expiresAt: i.expiresAt?.toISOString() ?? null,
      })),
      apiKeys: keys.map((k) => ({
        id: k.id, name: k.name, prefix: k.prefix, scopes: jparse<string[]>(k.scopes, []),
        status: k.status, createdBy: k.createdBy, lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        createdAt: k.createdAt.toISOString(),
      })),
      ssoStatus: 'not_configured',
    }
  })
}

export async function POST(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req, 'admin')
    const body = await readJson<{ op?: string; name?: string; scopes?: string[]; role?: string; membershipId?: string; keyId?: string; identityId?: string; kind?: string }>(req)

    if (body.op === 'create_api_key') {
      if (!body.name?.trim()) badRequest('name required')
      const raw = `azm_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`
      const prefix = raw.slice(0, 12)
      const key = await db.apiKey.create({
        data: {
          workspaceId: ctx.workspaceId, name: body.name.trim(), prefix,
          hashedKey: hashApiKey(raw), scopes: JSON.stringify(body.scopes ?? ['executions:read']),
          createdBy: ctx.userId,
        },
      })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'apikey.create', resourceType: 'api_key', resourceId: key.id, severity: 'notice', detail: { name: key.name, scopes: body.scopes ?? [] } })
      // the raw key is returned exactly once and never stored
      return { apiKey: { id: key.id, prefix, name: key.name }, secret: raw, note: 'Store this key now — it cannot be retrieved again.' }
    }

    if (body.op === 'revoke_api_key') {
      const key = await db.apiKey.findUnique({ where: { id: body.keyId ?? '' } })
      if (!key || key.workspaceId !== ctx.workspaceId) badRequest('key not found')
      await db.apiKey.update({ where: { id: key.id }, data: { status: 'revoked' } })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'apikey.revoke', resourceType: 'api_key', resourceId: key.id, severity: 'warning' })
      return { ok: true }
    }

    if (body.op === 'create_service_identity') {
      if (!body.name?.trim()) badRequest('name required')
      const identity = await db.serviceIdentity.create({
        data: {
          workspaceId: ctx.workspaceId, name: body.name.trim(),
          kind: body.kind ?? 'service_account',
          scopes: JSON.stringify(body.scopes ?? ['executions:read']),
          keyFingerprint: `fp_${Math.random().toString(36).slice(2, 10)}`,
        },
      })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'identity.create', resourceType: 'service_identity', resourceId: identity.id, severity: 'notice', detail: { name: identity.name, scopes: body.scopes ?? [] } })
      return { identity: { id: identity.id, name: identity.name } }
    }

    if (body.op === 'revoke_identity') {
      const identity = await db.serviceIdentity.findUnique({ where: { id: body.identityId ?? '' } })
      if (!identity || identity.workspaceId !== ctx.workspaceId) badRequest('identity not found')
      await db.serviceIdentity.update({ where: { id: identity.id }, data: { status: 'revoked' } })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'identity.revoke', resourceType: 'service_identity', resourceId: identity.id, severity: 'warning' })
      return { ok: true }
    }

    if (body.op === 'change_role') {
      if (ctx.role !== 'owner') badRequest('Only owners can change roles')
      const membership = await db.membership.findUnique({ where: { id: body.membershipId ?? '' }, include: { user: true } })
      if (!membership || membership.workspaceId !== ctx.workspaceId) badRequest('membership not found')
      if (!['owner', 'admin', 'operator', 'viewer'].includes(body.role ?? '')) badRequest('invalid role')
      if (membership.role === 'owner' && body.role !== 'owner') {
        const owners = await db.membership.count({ where: { workspaceId: ctx.workspaceId, role: 'owner' } })
        if (owners <= 1) badRequest('Cannot demote the last owner')
      }
      await db.membership.update({ where: { id: membership.id }, data: { role: body.role as string } })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'team.role_change', resourceType: 'membership', resourceId: membership.id, severity: 'notice', detail: { user: membership.user.email, from: membership.role, to: body.role } })
      return { ok: true }
    }

    if (body.op === 'invite') {
      if (!body.name?.trim()) badRequest('email required (seeded demo org — existing users only)')
      const user = await db.user.findUnique({ where: { email: body.name.toLowerCase().trim() } })
      if (!user) badRequest('No such user in this demo organization (SSO/SCIM is an Enterprise-tier roadmap item)')
      const exists = await db.membership.findUnique({ where: { userId_workspaceId: { userId: user.id, workspaceId: ctx.workspaceId } } })
      if (exists) badRequest('User is already a member')
      const membership = await db.membership.create({ data: { userId: user.id, workspaceId: ctx.workspaceId, role: body.role ?? 'viewer' } })
      await audit({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName, action: 'team.invite', resourceType: 'membership', resourceId: membership.id, severity: 'info', detail: { user: user.email, role: body.role ?? 'viewer' } })
      return { ok: true, member: { id: membership.id, email: user.email, role: membership.role } }
    }

    badRequest('Unknown operation')
  })
}
