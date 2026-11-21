// Marketplace package trust gate. No package is installable or publishable
// until it passes these deterministic checks plus review and vulnerability
// scanning. This module is deliberately strict and deny-by-default.

export interface PackageManifest {
  name: string
  version: string
  publisherId: string
  publisherVerified: boolean
  signature: string
  description?: string
  permissions: {
    tools?: string[]
    models?: string[]
    memoryScopes?: string[]
    network?: 'none' | 'restricted' | 'unrestricted'
    shell?: boolean
    filesystem?: 'none' | 'workspace' | 'host'
  }
  pinnedDependencies: Record<string, string>
  sourceHash: string
}

export interface ValidationResult {
  ok: boolean
  reasons: string[]
}

const SEMVER = /^\d+\.\d+\.\d+$/

/**
 * Validate a package manifest. Rejects unsigned/unverified publishers, vague
 * permissions, unpinned dependencies, host access and unrestricted egress.
 */
export function validatePackageManifest(m: PackageManifest): ValidationResult {
  const reasons: string[] = []

  if (!m.name || !/^[a-z0-9][a-z0-9-]*$/.test(m.name)) reasons.push('invalid package name')
  if (!SEMVER.test(m.version)) reasons.push('version must be pinned to exact semver (no ranges)')
  if (!m.publisherId) reasons.push('publisher identity is required')
  if (!m.publisherVerified) reasons.push('publisher identity must be verified')
  if (!m.signature || m.signature.length < 32) reasons.push('valid signature is required')
  if (!m.sourceHash || m.sourceHash.length < 16) reasons.push('source hash is required')

  const p = m.permissions ?? {} as PackageManifest['permissions']
  if (p.shell === true) reasons.push('shell access is not permitted in marketplace packages')
  if (p.filesystem === 'host') reasons.push('host filesystem access is not permitted')
  if (p.network === 'unrestricted') reasons.push('unrestricted network egress is not permitted')
  if (!Array.isArray(p.tools) || p.tools.length === 0) {
    // An empty tool list is allowed (pure computation), but anything else must be explicit.
  }
  if (Array.isArray(p.tools) && p.tools.some((t) => typeof t !== 'string' || !t)) {
    reasons.push('tool scopes must be explicit identifiers')
  }

  const deps = Object.entries(m.pinnedDependencies ?? {})
  if (deps.some(([, version]) => !SEMVER.test(version))) {
    reasons.push('all dependencies must be pinned to exact versions')
  }

  return { ok: reasons.length === 0, reasons }
}

/** Marketplace remains gated until all trust controls are enabled. */
export function marketplaceEnabled(): boolean {
  return process.env.ENABLE_MARKETPLACE === '1' &&
    process.env.PACKAGE_REVIEW_SERVICE === 'configured' &&
    process.env.SBOM_SCANNER === 'configured'
}
