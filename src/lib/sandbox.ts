// Runtime isolation adapter for untrusted agent code.
//
// Default: in-process adapter (current deployment). Opt-in: Docker runner with
// deny-by-default egress, non-root, read-only rootfs, dropped capabilities and
// bounded CPU/memory/PID/time. gVisor is used only when the runtime reports it;
// otherwise untrusted/customer code must stay disabled.

import { execFileSync } from 'node:child_process'

export interface SandboxLimits {
  cpuCores: number
  memoryMb: number
  pidsLimit: number
  timeoutMs: number
  readOnlyRootfs: boolean
  network: 'none' | 'restricted'
}

export interface SandboxSpec {
  image: string
  workspaceId: string
  executionId: string
  command: string[]
  env?: Record<string, string>
  limits: SandboxLimits
}

export const DEFAULT_LIMITS: SandboxLimits = {
  cpuCores: 1,
  memoryMb: 512,
  pidsLimit: 128,
  timeoutMs: 120_000,
  readOnlyRootfs: true,
  network: 'none',
}

/** Detect whether the Docker runtime supports gVisor. */
export function detectRuntime(): 'gvisor' | 'runc' | 'unknown' {
  try {
    const out = execFileSync('docker', ['info', '--format', '{{json .Runtimes}}'], {
      encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'],
    })
    if (/"runsc"/i.test(out)) return 'gvisor'
    if (/"runc"/i.test(out)) return 'runc'
  } catch { /* unavailable */ }
  return 'unknown'
}

/** Build Docker run arguments. Exported for inspection and tests. */
export function buildDockerArgs(spec: SandboxSpec): string[] {
  const l = spec.limits
  const args = [
    'run', '--rm',
    '--name', `mesh-exec-${spec.executionId.slice(0, 32)}`,
    '--user', '65534:65534',
    '--network', l.network === 'none' ? 'none' : 'mesh-egress',
    '--read-only',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    // Docker's default seccomp profile is applied (do not override to unconfined).
    '--cpus', String(l.cpuCores),
    '--memory', `${l.memoryMb}m`,
    '--pids-limit', String(l.pidsLimit),
    '--label', `mesh.workspace=${spec.workspaceId}`,
    '--label', `mesh.execution=${spec.executionId}`,
  ]
  if (detectRuntime() === 'gvisor') {
    args.push('--runtime', 'runsc')
  }
  for (const [key, value] of Object.entries(spec.env ?? {})) {
    args.push('-e', `${key}=${value}`)
  }
  args.push(spec.image, ...spec.command)
  return args
}

export interface SandboxResult {
  ok: boolean
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
}

export interface SandboxRunner {
  run(spec: SandboxSpec): Promise<SandboxResult>
}

/**
 * Docker-backed runner. Only usable for short-lived, non-privileged commands;
 * the caller is responsible for mounting an allowlisted workspace volume and
 * for passing short-lived scoped credentials via env (never host secrets).
 */
export class DockerSandboxRunner implements SandboxRunner {
  async run(spec: SandboxSpec): Promise<SandboxResult> {
    const args = buildDockerArgs(spec)
    try {
      const stdout = execFileSync('docker', args, {
        encoding: 'utf8',
        timeout: spec.limits.timeoutMs,
        env: { ...process.env, PATH: process.env.PATH ?? '' },
      })
      return { ok: true, stdout, stderr: '', exitCode: 0, timedOut: false }
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; status?: number; code?: string }
      const timedOut = e.code === 'ETIMEDOUT'
      return {
        ok: false,
        stdout: e.stdout ?? '',
        stderr: e.stderr ?? String(err),
        exitCode: e.status ?? null,
        timedOut,
      }
    }
  }
}

export function sandboxEnabled(): boolean {
  return (process.env.AGENT_SANDBOX ?? 'inprocess').toLowerCase() === 'docker'
}

export function untrustedCodeAllowed(): boolean {
  // Customer-supplied code is only allowed with gVisor-class isolation.
  return sandboxEnabled() && detectRuntime() === 'gvisor'
}
