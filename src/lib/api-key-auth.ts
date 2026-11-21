// API-key authentication for the public v1 API. Keys are high-entropy, stored
// only as SHA-256 hashes, scoped, expirable and revocable. The raw key is shown
// once at creation and never again.
import { createHash, timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/db'
import { setDatabaseContext } from '@/lib/db-context'

export interface ApiKeyPrincipal {
  keyId: string
  workspaceId: string
  scopes: string[]
  name: string
}

const PREFIX = 'azm_'

export function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/** Resolve a bearer API key. Returns null for absent/invalid/revoked keys. */
export async function resolveApiKey(header: string | null): Promise<ApiKeyPrincipal | null> {
  if (!header) return null
  const match = header.match(/^Bearer\s+(azm_[A-Za-z0-9]+)$/i)
  if (!match) return null
  const raw = match[1]
  const prefix = raw.slice(0, 12)
  const hashed = hashKey(raw)
  const key = await db.apiKey.findUnique({ where: { prefix } })
  if (!key || key.status !== 'active' || !safeEqual(key.hashedKey, hashed)) return null

  setDatabaseContext({ workspaceId: key.workspaceId })
  await db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined)
  return {
    keyId: key.id,
    workspaceId: key.workspaceId,
    scopes: JSON.parse(key.scopes) as string[],
    name: key.name,
  }
}

export function hasScope(principal: ApiKeyPrincipal, scope: string): boolean {
  return principal.scopes.includes(scope) || principal.scopes.includes('*')
}
