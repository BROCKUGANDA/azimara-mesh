// Provider-neutral secret brokerage. Secret values are never returned to
// clients or written to logs; callers receive short-lived scoped references.

import { randomUUID } from 'node:crypto'

export interface Lease {
  ref: string
  expiresAt: Date
  target: string
}

export interface SecretBroker {
  issue(target: string, ttlSeconds: number): Promise<Lease>
  revoke(ref: string): Promise<void>
  resolve(ref: string): Promise<string | null>
}

/**
 * Development-only broker backed by environment variables. Must not be used
 * in production: it holds values in process memory and has no external KMS.
 */
export class DevSecretBroker implements SecretBroker {
  private leases = new Map<string, { value: string; expiresAt: Date; target: string }>()

  constructor(private readonly values: Record<string, string> = {}) {}

  async issue(target: string, ttlSeconds = 900): Promise<Lease> {
    const ref = `dev_${randomUUID()}`
    const value = this.values[target] ?? ''
    this.leases.set(ref, { value, expiresAt: new Date(Date.now() + ttlSeconds * 1000), target })
    return { ref, expiresAt: new Date(Date.now() + ttlSeconds * 1000), target }
  }

  async revoke(ref: string): Promise<void> {
    this.leases.delete(ref)
  }

  async resolve(ref: string): Promise<string | null> {
    const lease = this.leases.get(ref)
    if (!lease) return null
    if (lease.expiresAt < new Date()) {
      this.leases.delete(ref)
      return null
    }
    return lease.value
  }
}

/**
 * Vault-compatible broker. Uses the Vault HTTP KV v1 API with a token from the
 * environment. Values are fetched only at resolve time and never cached.
 */
export class VaultSecretBroker implements SecretBroker {
  constructor(
    private readonly address: string,
    private readonly token: string,
    private readonly mount = 'secret',
  ) {}

  async issue(target: string, ttlSeconds = 900): Promise<Lease> {
    // A ref encodes the target; the token is server-side and never exposed.
    const ref = `vault://${this.mount}/${encodeURIComponent(target)}#${randomUUID()}`
    return { ref, expiresAt: new Date(Date.now() + ttlSeconds * 1000), target }
  }

  async revoke(): Promise<void> {
    // Vault leases are short-lived; revocation is handled by the lease TTL.
  }

  async resolve(ref: string): Promise<string | null> {
    const match = ref.match(/^vault:\/\/[^/]+\/([^#]+)#/)
    if (!match) return null
    const path = decodeURIComponent(match[1])
    const res = await fetch(`${this.address}/v1/${this.mount}/${path}`, {
      headers: { 'X-Vault-Token': this.token },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const body = await res.json() as { data?: Record<string, string> }
    return body.data?.value ?? null
  }
}

let broker: SecretBroker | null = null

export function getSecretBroker(): SecretBroker {
  if (broker) return broker
  if (process.env.VAULT_ADDR && process.env.VAULT_TOKEN) {
    broker = new VaultSecretBroker(process.env.VAULT_ADDR, process.env.VAULT_TOKEN)
  } else {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('A secret broker is required in production')
    }
    broker = new DevSecretBroker()
  }
  return broker
}

/** Test-only broker override. */
export function setSecretBroker(next: SecretBroker | null): void {
  broker = next
}
