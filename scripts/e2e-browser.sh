#!/bin/bash
# E2E browser verification — Azimara Mesh (all 25 views)
cd /home/z/my-project
mkdir -p download/e2e-screenshots

AB="agent-browser"

# --- ensure server is up (start if not) ---
if ! curl -s --max-time 2 -o /dev/null http://localhost:3000/; then
  (bun run dev >/dev/null 2>&1 &)
fi
for i in $(seq 1 45); do
  curl -s --max-time 2 -o /dev/null http://localhost:3000/ && break
  sleep 2
done
curl -s --max-time 3 -o /dev/null http://localhost:3000/ || { echo "FATAL: server never came up"; exit 2; }
echo "SERVER OK"

$AB set viewport 1440 900
$AB open http://localhost:3000 >/dev/null
$AB wait --load networkidle >/dev/null 2>&1
sleep 2
$AB screenshot download/e2e-screenshots/01-login.png >/dev/null
TITLE=$($AB get title)
echo "PAGE TITLE: $TITLE"

# --- login (email prefilled) ---
$AB find first "#password" fill "Azimara#2024" >/dev/null
$AB find first "button[type=submit]" click >/dev/null
sleep 4
$AB wait --load networkidle >/dev/null 2>&1
URL=$($AB get url)
echo "AFTER LOGIN URL: $URL"

check_view() {
  local label="$1"
  $AB find text "$label" click >/dev/null 2>&1
  sleep 1.5
  local out
  out=$($AB eval "(() => { const t = document.body.innerText; const bad = /Application error|Unhandled Runtime|Build Error|Missing required|Internal Server Error/i.test(t); return JSON.stringify({len: t.length, bad, head: t.slice(0,120).replace(/\n/g,' | ')}) })()" 2>/dev/null)
  echo "VIEW[$label] -> $out"
}

# --- overview is the landing view after login ---
sleep 1
out=$($AB eval "(() => { const t = document.body.innerText; return JSON.stringify({len: t.length, head: t.slice(0,150).replace(/\n/g,' | ')}) })()" 2>/dev/null)
echo "VIEW[Overview-landing] -> $out"
$AB screenshot download/e2e-screenshots/02-overview.png >/dev/null

# --- all sidebar nav items (one per line, quoted) ---
while IFS= read -r v; do
  [ -z "$v" ] && continue
  check_view "$v"
done <<'EOF'
Agent Fleet
Workflows
Executions
Schedules
Activity
Agent Studio
Agent Catalog
Templates
Model Hub
Tool Registry
Knowledge & Memory
Evaluation Lab
Policies & Guardrails
Security Center
Identity & Access
Audit Center
Deployments
Environments
Usage & Costs
Team Management
Integrations
Developer Portal
Billing
Settings
EOF

# --- golden path: open fleet and inspect rows ---
$AB find text "Agent Fleet" click >/dev/null 2>&1
sleep 2
$AB screenshot download/e2e-screenshots/03-fleet.png >/dev/null
ROW=$($AB eval "(() => { const rows = document.querySelectorAll('main [class*=cursor-pointer], main tr[class*=cursor-pointer], main [role=row]'); return rows.length > 0 ? 'rows:' + rows.length : 'no-clickable-rows' })()" 2>/dev/null)
echo "FLEET ROWS: $ROW"

# --- command palette (Cmd+K) ---
$AB press Meta+k >/dev/null 2>&1
sleep 1
PAL=$($AB eval "(() => { const dlg = document.querySelector('[role=dialog]'); return dlg ? 'palette-open' : 'palette-missing' })()" 2>/dev/null)
echo "CMD PALETTE: $PAL"
$AB press Escape >/dev/null 2>&1

# --- mobile viewport check ---
$AB set viewport 390 844 >/dev/null
sleep 1.5
$AB screenshot download/e2e-screenshots/04-mobile-overview.png >/dev/null
MOB=$($AB eval "(() => { const t = document.body.innerText; return JSON.stringify({len: t.length, horizOverflow: document.documentElement.scrollWidth > 400}) })()" 2>/dev/null)
echo "MOBILE: $MOB"
$AB set viewport 1440 900 >/dev/null

# --- errors & console ---
echo "=== PAGE ERRORS ==="
$AB errors 2>/dev/null | head -30
echo "=== CONSOLE (errors only tail) ==="
$AB console 2>/dev/null | grep -iE "error|failed|unhandled" | grep -v "401" | head -30
echo "=== DONE ==="
