#!/usr/bin/env node
// Minimal Azimara Mesh CLI. Uses the same v1 contract as the SDKs.
const BASE = process.env.MESH_BASE_URL ?? 'https://mesh.aiazimara.com/api/v1'
const KEY = process.env.MESH_API_KEY ?? ''

function usage() {
  console.log(`Usage: MESH_API_KEY=azm_... mesh <command> [args]

Commands:
  agents                          List agents
  executions [--status S]         List executions
  run <agentId> [--input JSON]    Start an execution
  cancel <executionId>            Cancel an execution
`)
}

async function request(path, method = 'GET', body) {
  if (!KEY) { console.error('MESH_API_KEY is required'); process.exit(2) }
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!res.ok) { console.error(json.error?.message ?? res.statusText); process.exit(1) }
  return json
}

const [cmd, ...args] = process.argv.slice(2)
if (!cmd || cmd === 'help') { usage(); process.exit(0) }

try {
  if (cmd === 'agents') console.log(JSON.stringify(await request('/agents'), null, 2))
  else if (cmd === 'executions') {
    const status = args[args.indexOf('--status') + 1]
    const q = status && args.includes('--status') ? `?status=${encodeURIComponent(status)}` : ''
    console.log(JSON.stringify(await request('/executions' + q), null, 2))
  } else if (cmd === 'run') {
    const agentId = args[0]
    if (!agentId) { console.error('agentId is required'); process.exit(2) }
    const inputIndex = args.indexOf('--input')
    const input = inputIndex >= 0 ? JSON.parse(args[inputIndex + 1] ?? '{}') : {}
    console.log(JSON.stringify(await request('/executions', 'POST', { agentId, input }), null, 2))
  } else if (cmd === 'cancel') {
    const id = args[0]
    if (!id) { console.error('executionId is required'); process.exit(2) }
    console.log(JSON.stringify(await request(`/executions/${encodeURIComponent(id)}/cancel`, 'POST'), null, 2))
  } else { usage(); process.exit(2) }
} catch (err) { console.error(err.message); process.exit(1) }
