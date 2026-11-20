// Memory infrastructure — namespace-scoped, authorization-checked retrieval and writes.
// Every retrieval is validated against the requesting agent's declared memory scope and
// the namespace classification. Denials produce policy decisions (auditable).

import { db } from '@/lib/db'
import { jparse, type DataClass, DATA_CLASS_RANK } from '@/lib/types'
import { recordUsage } from '@/lib/metering'

export interface MemoryRetrievalResult {
  allowed: boolean
  namespaceId: string
  namespaceName: string
  reason: string
  records: { id: string; content: string; score: number; provenance: string; createdAt: string }[]
}

export interface AgentMemoryScope {
  namespacesJson: string
  contextTokens: number
}

/** Check whether an agent may access a namespace, and why. */
export function checkNamespaceAccess(
  agent: { id: string; memoryConfigJson: string; workspaceId: string },
  namespace: { id: string; classification: string; kind: string; name: string },
): { allowed: boolean; reason: string } {
  const scope = jparse<{ namespaces?: string[] }>(agent.memoryConfigJson, {})
  const declared = scope.namespaces ?? []
  // 'restricted' data is never accessible unless explicitly declared
  if (namespace.classification === 'restricted' && !declared.includes(namespace.id)) {
    return { allowed: false, reason: `Namespace "${namespace.name}" is restricted and not in agent memory scope` }
  }
  // shared/semantic namespaces require explicit declaration (least privilege by default)
  if ((namespace.kind === 'shared' || namespace.kind === 'semantic' || namespace.kind === 'longterm') && !declared.includes(namespace.id)) {
    return { allowed: false, reason: `Namespace "${namespace.name}" (${namespace.kind}) not declared in agent memory configuration` }
  }
  // working/episodic are execution-scoped and implicitly available
  return { allowed: true, reason: `Access granted via declared agent memory scope (${namespace.kind})` }
}

export async function retrieveMemory(
  agent: { id: string; memoryConfigJson: string; workspaceId: string },
  namespaceId: string,
  query: string,
  opts: { executionId?: string | null; limit?: number; usageAgentId?: string },
): Promise<MemoryRetrievalResult> {
  const ns = await db.memoryNamespace.findUnique({ where: { id: namespaceId } })
  if (!ns || ns.workspaceId !== agent.workspaceId) {
    return { allowed: false, namespaceId, namespaceName: 'unknown', reason: 'Namespace not found in workspace', records: [] }
  }
  const access = checkNamespaceAccess(agent, ns)
  if (!access.allowed) {
    return { allowed: false, namespaceId, namespaceName: ns.name, reason: access.reason, records: [] }
  }

  // TTL/retention filter
  const now = new Date()
  const records = await db.memoryRecord.findMany({
    where: { namespaceId, OR: [{ ttlAt: null }, { ttlAt: { gt: now } }] },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  // deterministic relevance proxy: keyword overlap scoring
  const qWords = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)
  const scored = records
    .map((r) => {
      const hits = qWords.filter((w) => r.content.toLowerCase().includes(w)).length
      return { record: r, score: qWords.length ? hits / qWords.length : 0.5 }
    })
    .filter((r) => r.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? 5)

  if (opts.executionId) {
    await recordUsage({
      workspaceId: agent.workspaceId, kind: 'memory_read', quantity: scored.length, unitCostUsd: 0.0001,
      agentId: opts.usageAgentId ?? agent.id, executionId: opts.executionId,
      idempotencyKey: `mem_${opts.executionId}_${namespaceId}_${now.getTime()}`,
    })
  }

  return {
    allowed: true,
    namespaceId,
    namespaceName: ns.name,
    reason: access.reason,
    records: scored.map((s) => ({
      id: s.record.id,
      content: s.record.content,
      score: Math.round(s.score * 100) / 100,
      provenance: s.record.provenance,
      createdAt: s.record.createdAt.toISOString(),
    })),
  }
}

/** Retention enforcement: delete expired records (called by maintenance path + on write). */
export async function enforceRetention(workspaceId: string): Promise<number> {
  const result = await db.memoryRecord.deleteMany({
    where: { namespace: { workspaceId }, ttlAt: { lt: new Date() } },
  })
  return result.count
}

export async function writeMemoryRecord(
  workspaceId: string,
  namespaceId: string,
  data: { content: string; classification?: string; provenance?: string; agentId?: string; ttlDays?: number },
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const ns = await db.memoryNamespace.findUnique({ where: { id: namespaceId } })
  if (!ns || ns.workspaceId !== workspaceId) return { ok: false, error: 'namespace not found' }
  const cls = (data.classification ?? 'internal') as DataClass
  if (DATA_CLASS_RANK[cls] > DATA_CLASS_RANK[(ns.classification as DataClass) ?? 'internal']) {
    return { ok: false, error: `record classification "${cls}" exceeds namespace ceiling "${ns.classification}"` }
  }
  const injection = /ignore (all )?(previous|prior) instructions|reveal (your )?(system )?prompt/i.test(data.content)
  if (injection) return { ok: false, error: 'content flagged by poisoning detection — write rejected' }
  const row = await db.memoryRecord.create({
    data: {
      namespaceId,
      content: data.content,
      classification: cls,
      provenance: data.provenance ?? 'manual',
      agentId: data.agentId ?? null,
      ttlAt: data.ttlDays ? new Date(Date.now() + data.ttlDays * 86400_000) : null,
    },
  })
  await db.memoryNamespace.update({ where: { id: namespaceId }, data: { recordCount: { increment: 1 } } })
  return { ok: true, id: row.id }
}
