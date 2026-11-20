import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiContext, withApi, readJson, badRequest } from '@/lib/api-utils'
import { audit } from '@/lib/audit'
import { AGENT_STATUSES, AUTONOMY_LEVELS, apiError } from '@/lib/types'

export async function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req)
    const url = new URL(req.url)
    const q = url.searchParams.get('q')?.toLowerCase() ?? ''
    const status = url.searchParams.get('status') ?? ''
    const fleetId = url.searchParams.get('fleetId') ?? ''
    const envFilter = url.searchParams.get('environment') ?? ''
    void envFilter

    const where: Record<string, unknown> = { workspaceId: ctx.workspaceId }
    if (status && AGENT_STATUSES.includes(status as never)) where.status = status
    if (fleetId) where.fleetId = fleetId
    const agents = await db.agent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { fleet: { select: { name: true } }, versions: { select: { version: true, status: true, evalScore: true }, orderBy: { createdAt: 'desc' } } },
    })
    const filtered = q
      ? agents.filter((a) => a.name.toLowerCase().includes(q) || a.slug.includes(q) || a.description.toLowerCase().includes(q) || a.framework.includes(q))
      : agents

    // live execution counts per agent
    const activeRuns = await db.execution.groupBy({
      by: ['agentId'],
      where: { workspaceId: ctx.workspaceId, status: { in: ['running', 'queued', 'waiting_approval'] } },
      _count: { id: true },
    })
    const activeMap = new Map(activeRuns.map((r) => [r.agentId, r._count.id]))

    return {
      agents: filtered.map((a) => ({
        id: a.id, name: a.name, slug: a.slug, description: a.description,
        status: a.status, healthStatus: a.healthStatus, autonomyLevel: a.autonomyLevel,
        category: a.category, framework: a.framework, runtimeType: a.runtimeType,
        currentVersion: a.currentVersion, fleet: a.fleet?.name ?? null, fleetId: a.fleetId,
        ownerName: a.ownerName, successRate: a.successRate, avgLatencyMs: a.avgLatencyMs,
        spendMonth: Math.round(a.spendMonth * 100) / 100, lastActiveAt: a.lastActiveAt?.toISOString() ?? null,
        modelConfig: jparseSafe(a.modelConfigJson), toolCount: (jparseSafe(a.toolPermissionsJson) as unknown[] | null)?.length ?? 0,
        activeRuns: activeMap.get(a.id) ?? 0,
        versions: a.versions.length,
      })),
      total: filtered.length,
    }
  })
}

function jparseSafe(raw: string): unknown {
  try { return JSON.parse(raw) } catch { return null }
}

export async function POST(req: NextRequest) {
  return withApi(async () => {
    const ctx = await apiContext(req, 'operator')
    const body = await readJson<{
      name?: string; description?: string; category?: string; framework?: string; autonomyLevel?: string;
      systemPrompt?: string; fleetId?: string; toolPermissions?: string[]; memoryNamespaceIds?: string[];
      primaryModelId?: string; fallbackModelIds?: string[]; monthlyBudget?: number; inputSchema?: Record<string, unknown>;
    }>(req)
    if (!body.name?.trim()) badRequest('name is required')

    const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    if (!slug) badRequest('name must contain at least one alphanumeric character')
    const exists = await db.agent.findUnique({ where: { workspaceId_slug: { workspaceId: ctx.workspaceId, slug } } })
    if (exists) return apiError('CONFLICT', 'An agent with this name already exists', 409)

    // Validate the autonomy level server-side; never trust a client-provided
    // string to become a governance control.
    if (body.autonomyLevel && !AUTONOMY_LEVELS.includes(body.autonomyLevel as never)) {
      badRequest('invalid autonomyLevel')
    }

    const name = body.name.trim()
    // Agent + initial immutable draft version + workload identity are one
    // atomic unit. A failure must never leave an agent without its identity
    // or its pinned version.
    const agent = await db.$transaction(async (tx) => {
      const created = await tx.agent.create({
        data: {
          workspaceId: ctx.workspaceId,
          fleetId: body.fleetId || null,
          name, slug,
          description: body.description ?? '',
          category: body.category ?? 'custom',
          framework: body.framework ?? 'azimara-native',
          runtimeType: 'managed',
          status: 'draft', autonomyLevel: body.autonomyLevel ?? 'A1',
          currentVersion: '0.1.0',
          ownerName: ctx.userName,
          modelConfigJson: JSON.stringify({ primary: body.primaryModelId ?? null, fallback: body.fallbackModelIds ?? [], temperature: 0.3, maxTokens: 1024 }),
          toolPermissionsJson: JSON.stringify(body.toolPermissions ?? []),
          memoryConfigJson: JSON.stringify({ namespaces: body.memoryNamespaceIds ?? [], contextTokens: 4000, ttlDays: 30 }),
          policyRefsJson: '[]',
          resourceLimitsJson: JSON.stringify({ maxSteps: 10, timeoutMs: 90000, maxCostUsd: 1.5, maxDelegationDepth: 2, monthlyBudget: body.monthlyBudget ?? 25, maxIterations: 3 }),
          evalProfileJson: JSON.stringify({ minScore: 0.7, safetyScan: true }),
          inputSchemaJson: JSON.stringify(body.inputSchema ?? { type: 'object', required: ['prompt'], properties: { prompt: { type: 'string', maxLength: 500 } } }),
          outputSchemaJson: JSON.stringify({ type: 'object' }),
          systemPrompt: body.systemPrompt ?? '',
          createdBy: ctx.userId,
        },
      })
      await tx.agentVersion.create({
        data: {
          agentId: created.id, version: '0.1.0', changelog: 'Initial draft',
          snapshotJson: JSON.stringify({ systemPrompt: body.systemPrompt ?? '', tools: body.toolPermissions ?? [], autonomy: body.autonomyLevel ?? 'A1' }),
          status: 'draft', createdBy: ctx.userId,
        },
      })
      await tx.serviceIdentity.create({
        data: { workspaceId: ctx.workspaceId, name: `workload:${slug}`, kind: 'workload', agentId: created.id, scopes: JSON.stringify(['tools:invoke', 'memory:read', 'model:invoke']), keyFingerprint: `fp_${created.id.slice(-8)}` },
      })
      return created
    })
    await audit({
      organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.userName,
      action: 'agent.create', resourceType: 'agent', resourceId: agent.id, severity: 'info',
      detail: { name: agent.name, autonomyLevel: agent.autonomyLevel },
    })
    return { agent: { id: agent.id, slug: agent.slug, name: agent.name, status: agent.status } }
  })
}
