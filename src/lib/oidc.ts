// OIDC ID-token verification for enterprise SSO. Provider-neutral: discovery
// URL + client id from environment. Never grants org-owner implicitly; the
// caller must map verified claims to an existing membership or an invite.
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { db } from '@/lib/db'

export interface OidcConfig {
  issuer: string
  clientId: string
  discoveryUrl?: string
}

export interface VerifiedIdentity {
  sub: string
  email?: string
  name?: string
  groups?: string[]
}

export function oidcConfigured(): boolean {
  return Boolean(process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID)
}

let jwksPromise: Promise<ReturnType<typeof createRemoteJWKSet>> | null = null

export async function verifyIdToken(token: string, config?: OidcConfig): Promise<VerifiedIdentity> {
  const issuer = config?.issuer ?? process.env.OIDC_ISSUER
  const clientId = config?.clientId ?? process.env.OIDC_CLIENT_ID
  if (!issuer || !clientId) throw new Error('OIDC is not configured')

  if (!jwksPromise) {
    jwksPromise = (async () => {
      const discoveryUrl = config?.discoveryUrl ?? `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`
      const res = await fetch(discoveryUrl, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) throw new Error('OIDC discovery failed')
      const meta = await res.json() as { jwks_uri: string }
      return createRemoteJWKSet(new URL(meta.jwks_uri))
    })()
  }

  const { payload } = await jwtVerify(token, await jwksPromise, {
    issuer,
    audience: clientId,
    clockTolerance: 30,
  })
  return {
    sub: String(payload.sub ?? ''),
    email: typeof payload.email === 'string' ? payload.email : undefined,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    groups: Array.isArray(payload.groups) ? payload.groups.map(String) : undefined,
  }
}

/** Map a verified identity to an existing user, or null if not provisioned. */
export async function findUserByIdentity(identity: VerifiedIdentity) {
  if (identity.email) {
    const byEmail = await db.user.findUnique({ where: { email: identity.email.toLowerCase() } })
    if (byEmail) return byEmail
  }
  // SCIM-provisioned users store the external subject in ssoProvider.
  return db.user.findFirst({ where: { ssoProvider: `oidc:${identity.sub}` } })
}
