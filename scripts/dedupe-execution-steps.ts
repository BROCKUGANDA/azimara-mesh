// One-off: remove duplicate ExecutionStep rows blocking db push (UNIQUE executionId+seq).
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const dupes = await db.$queryRaw<{ executionId: string; seq: number; c: number }[]>`
  SELECT executionId, seq, COUNT(*) as c FROM ExecutionStep GROUP BY executionId, seq HAVING c > 1`
console.log('duplicate groups:', dupes.length, JSON.stringify(dupes.slice(0, 5).map((d) => ({ ...d, c: Number(d.c) }))))
if (dupes.length > 0) {
  const res = await db.$executeRaw`DELETE FROM ExecutionStep WHERE rowid NOT IN (SELECT MIN(rowid) FROM ExecutionStep GROUP BY executionId, seq)`
  console.log('deleted rows:', res)
}
await db.$disconnect()
