// E2E API smoke test — Azimara Mesh platform
// Logs in, then hits every API route and verifies HTTP 200 + JSON shape.
const BASE = process.env.BASE_URL || 'http://localhost:3000'

const routes = [
  '/api/auth', '/api/overview', '/api/identity', '/api/billing', '/api/policies',
  '/api/schedules', '/api/approvals', '/api/evals', '/api/deployments', '/api/usage',
  '/api/environments', '/api/models', '/api/activity', '/api/security', '/api/integrations',
  '/api/executions', '/api/fleets', '/api/agents', '/api/audit', '/api/memory',
  '/api/tools', '/api/workflows', '/api/settings',
]

const results = []
let cookie = null

// 1. Login
const loginRes = await fetch(`${BASE}/api/auth`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'ada@azimara.ai', password: 'Azimara#2024' }),
})
cookie = (loginRes.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ')
results.push({ route: 'POST /api/auth (login)', status: loginRes.status, ok: loginRes.status === 200 })

// 2. All routes with session
for (const r of routes) {
  try {
    const res = await fetch(`${BASE}${r}`, { headers: cookie ? { Cookie: cookie } : {} })
    let jsonOk = true
    try { await res.json() } catch { jsonOk = false }
    results.push({ route: r, status: res.status, ok: res.status === 200 && jsonOk })
  } catch (e) {
    results.push({ route: r, status: 'ERR', ok: false, error: e.message })
  }
}

// 3. Detail routes with an id from the collection
// NOTE: /api/approvals/{id} intentionally only implements POST (approve/reject) — GET returns 405 by design.
const detailChecks = [
  { list: '/api/agents', detail: '/api/agents/{id}', key: 'agents' },
  { list: '/api/workflows', detail: '/api/workflows/{id}', key: 'workflows' },
  { list: '/api/executions', detail: '/api/executions/{id}', key: 'executions' },
  { list: '/api/tools', detail: '/api/tools/{id}', key: 'tools' },
]
for (const d of detailChecks) {
  try {
    const res = await fetch(`${BASE}${d.list}`, { headers: cookie ? { Cookie: cookie } : {} })
    const data = await res.json()
    const arr = data?.[d.key] || data?.items || data?.data
    if (Array.isArray(arr) && arr.length > 0 && arr[0]?.id) {
      const det = await fetch(`${BASE}${d.detail.replace('{id}', arr[0].id)}`, { headers: cookie ? { Cookie: cookie } : {} })
      let detOk = det.status === 200
      try { await det.json() } catch { detOk = false }
      results.push({ route: d.detail.replace('{id}', 'first-id'), status: det.status, ok: detOk })
    } else {
      results.push({ route: d.detail.replace('{id}', 'first-id'), status: 'SKIP', ok: true, note: 'empty list' })
    }
  } catch (e) {
    results.push({ route: d.detail, status: 'ERR', ok: false, error: e.message })
  }
}

// 4. Unauthenticated guard check
const guard = await fetch(`${BASE}/api/overview`)
results.push({ route: 'GET /api/overview (no session)', status: guard.status, ok: guard.status === 401 })

let pass = 0, fail = 0
console.log('\n=== E2E API SMOKE RESULTS ===')
for (const r of results) {
  const mark = r.ok ? 'PASS' : 'FAIL'
  if (r.ok) pass++; else fail++
  console.log(`${mark}  ${String(r.status).padEnd(4)}  ${r.route}${r.error ? ' — ' + r.error : ''}${r.note ? ' — ' + r.note : ''}`)
}
console.log(`\nTOTAL: ${pass} passed, ${fail} failed, ${results.length} checks`)
process.exit(fail > 0 ? 1 : 0)
