// Shared API plumbing: session context resolution, role enforcement, error contracts.

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, requireWorkspaceAccess, AuthError, PermissionError } from '@/lib/auth'
import { runWithDatabaseContext, setDatabaseContext } from '@/lib/db-context'
import type { Role } from '@/lib/types'

export interface ApiContext {
  userId: string
  userName: string
  userEmail: string
  organizationId: string
  workspaceId: string
  role: Role
}

export async function apiContext(req: NextRequest, minimumRole: Role = 'viewer'): Promise<ApiContext> {
  const session = await getSessionUser()
  if (!session) throw new AuthError('UNAUTHENTICATED', 'Sign in to continue')
  const url = new URL(req.url)
  let workspaceId = req.headers.get('x-workspace-id') ?? url.searchParams.get('workspaceId') ?? ''
  if (!workspaceId) {
    const first = await db.membership.findFirst({ where: { userId: session.userId }, include: { workspace: true } })
    workspaceId = first?.workspaceId ?? ''
  }
  const role = await requireWorkspaceAccess(session.userId, workspaceId, minimumRole)
  const [user, workspace] = await Promise.all([
    db.user.findUnique({ where: { id: session.userId } }),
    db.workspace.findUnique({ where: { id: workspaceId } }),
  ])
  setDatabaseContext({
    userId: session.userId,
    workspaceId,
    organizationId: workspace?.organizationId ?? '',
  })
  return {
    userId: session.userId,
    userName: user?.name ?? 'operator',
    userEmail: user?.email ?? '',
    organizationId: workspace?.organizationId ?? '',
    workspaceId,
    role,
  }
}

/**
 * Tenant boundary assertion. Every resource fetched by an opaque client-provided
 * id MUST be checked against the session workspace before it is read or mutated.
 * Do not rely on the client to supply a matching workspaceId filter.
 */
export function assertWorkspace(
  resource: { workspaceId?: string | null } | null | undefined,
  workspaceId: string,
  label = 'Resource',
): asserts resource is { workspaceId?: string | null } {
  if (!resource || resource.workspaceId !== workspaceId) notFound(`${label} not found`)
}

export async function withApi<T>(handler: () => Promise<T>): Promise<Response> {
  return runWithDatabaseContext({}, async () => {
    try {
      const data = await handler()
      if (data instanceof Response) return data
      return Response.json(data as object)
    } catch (err) {
      if (err instanceof AuthError) {
        return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status })
      }
      if (err instanceof PermissionError) {
        return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status })
      }
      // Internal error details are for the server log only. Returning err.message
      // here leaks database schema, file paths and secret references to callers.
      console.error('[api] unhandled error:', err)
      return Response.json(
        { error: { code: 'INTERNAL', message: 'An internal error occurred' } },
        { status: 500 },
      )
    }
  })
}

export async function readJson<T>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    throw new AuthError('BAD_REQUEST', 'Invalid JSON body', 400)
  }
}

export function badRequest(message: string): never {
  throw new AuthError('BAD_REQUEST', message, 400)
}

export function notFound(message = 'Resource not found'): never {
  throw new AuthError('NOT_FOUND', message, 404)
}
