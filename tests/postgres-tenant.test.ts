import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import { createHash, randomBytes } from 'node:crypto'
import { migrationDb } from '../src/lib/db'
import { runWithDatabaseContext } from '../src/lib/db-context'
import { db } from '../src/lib/db'

/**
 * Integration test for database-enforced tenant isolation. Run only against a
 * disposable PostgreSQL database with RLS migrations applied and a non-owner
 * application role. See .github/workflows/ci.yml for the runner setup.
 */
const suffix = randomBytes(4).toString('hex')
const wsA = `ws_a_${suffix}`
const wsB = `ws_b_${suffix}`
const orgId = `org_${suffix}`

async function cleanup() {
  await migrationDb.$executeRawUnsafe(`DELETE FROM "Agent" WHERE "workspaceId" IN ('${wsA}', '${wsB}')`)
  await migrationDb.$executeRawUnsafe(`DELETE FROM "Workspace" WHERE "id" IN ('${wsA}', '${wsB}')`)
  await migrationDb.$executeRawUnsafe(`DELETE FROM "Organization" WHERE "id" = '${orgId}'`)
}

beforeAll(async () => {
  if (!/^postgres/i.test(process.env.DATABASE_URL ?? '')) return
  await cleanup()
  await migrationDb.organization.create({
    data: { id: orgId, name: 'RLS Test Org', slug: `rls-${suffix}` },
  })
  for (const id of [wsA, wsB]) {
    await migrationDb.workspace.create({
      data: { id, organizationId: orgId, name: id, slug: id, monthlyBudget: 100 },
    })
    await migrationDb.agent.create({
      data: {
        id: `agent_${id}`,
        workspaceId: id,
        name: id,
        slug: id,
        createdBy: 'rls-test',
      },
    })
  }
})

afterAll(async () => {
  if (!/^postgres/i.test(process.env.DATABASE_URL ?? '')) return
  await cleanup()
  await migrationDb.$disconnect()
})

describe('PostgreSQL row-level security', () => {
  test('workspace A sees only its own agents', async () => {
    if (!/^postgres/i.test(process.env.DATABASE_URL ?? '')) return
    const rows = await runWithDatabaseContext(
      { userId: 'u1', workspaceId: wsA, organizationId: orgId },
      () => db.agent.findMany({ where: { workspaceId: { in: [wsA, wsB] } } }),
    )
    expect(rows.map((r) => r.id)).toEqual([`agent_${wsA}`])
  })

  test('cross-tenant direct id lookup returns nothing', async () => {
    if (!/^postgres/i.test(process.env.DATABASE_URL ?? '')) return
    const row = await runWithDatabaseContext(
      { userId: 'u1', workspaceId: wsA, organizationId: orgId },
      () => db.agent.findUnique({ where: { id: `agent_${wsB}` } }),
    )
    expect(row).toBeNull()
  })

  test('missing workspace context denies all tenant rows', async () => {
    if (!/^postgres/i.test(process.env.DATABASE_URL ?? '')) return
    const rows = await runWithDatabaseContext(
      { userId: 'u1' },
      () => db.agent.findMany(),
    )
    expect(rows).toHaveLength(0)
  })

  test('write is rejected for another workspace', async () => {
    if (!/^postgres/i.test(process.env.DATABASE_URL ?? '')) return
    await expect(
      runWithDatabaseContext(
        { userId: 'u1', workspaceId: wsA, organizationId: orgId },
        () => db.agent.create({
          data: { workspaceId: wsB, name: 'bad', slug: `bad-${suffix}`, createdBy: 'rls-test' },
        }),
      ),
    ).rejects.toThrow()
  })

  test('hashes differ for distinct keys', () => {
    expect(createHash('sha256').update('a').digest('hex'))
      .not.toBe(createHash('sha256').update('b').digest('hex'))
  })
})
