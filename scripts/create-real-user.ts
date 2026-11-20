// Creates one real (non-demo) tenant user to verify the demo/real board separation.
// Real users (isDemo=false) always land on the production Overview board, no DEMO MODE badge.
import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'node:crypto'

const db = new PrismaClient()

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`
}

const email = 'nadia@northwind-labs.com'
const user = await db.user.upsert({
  where: { email },
  update: { isDemo: false },
  create: {
    email,
    name: 'Nadia Hale',
    title: 'Director of Platform',
    passwordHash: hashPassword('Azimara#2024'),
    isDemo: false,
    avatarHue: 120,
  },
})

const ws = await db.workspace.findFirst()
if (!ws) throw new Error('No workspace found — run the seed first')
await db.membership.upsert({
  where: { userId_workspaceId: { userId: user.id, workspaceId: ws.id } },
  update: { role: 'owner' },
  create: { userId: user.id, workspaceId: ws.id, role: 'owner' },
})

console.log(`Real user ready: ${user.email} (isDemo=${user.isDemo}, role=owner, workspace=${ws.name})`)
await db.$disconnect()
