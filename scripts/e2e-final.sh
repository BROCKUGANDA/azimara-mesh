#!/bin/bash
# FINAL E2E pass — all 25 views clicked by exact nav-button refs
cd /home/z/my-project

AB="agent-browser"

# ensure server
if ! curl -s --max-time 2 -o /dev/null http://localhost:3000/; then
  (bun run dev >/dev/null 2>&1 &)
fi
for i in $(seq 1 45); do curl -s --max-time 2 -o /dev/null http://localhost:3000/ && break; sleep 2; done
echo "SERVER OK"

$AB open http://localhost:3000 >/dev/null 2>&1
sleep 4
# login if password field present (session may already be authed)
$AB find first "#password" fill "Azimara#2024" >/dev/null 2>&1
$AB find first "button[type=submit]" click >/dev/null 2>&1
sleep 3

$AB errors --clear >/dev/null 2>&1
$AB console --clear >/dev/null 2>&1

REFS=$($AB snapshot -i -c 2>/dev/null)
PASS=0; FAIL=0
check() {
  local label="$1"
  local ref
  ref=$(echo "$REFS" | sed -nE "s/.*button \"$label\" \\[ref=([a-z0-9]+)\\].*/\\1/p" | head -1)
  if [ -z "$ref" ]; then echo "FAIL  $label  (nav ref not found)"; FAIL=$((FAIL+1)); return; fi
  $AB click "$ref" >/dev/null 2>&1
  sleep 1.5
  local out
  out=$($AB eval "(() => { const t = document.body.innerText; const crash = t.includes('Application error'); const hasData = t.length > 400; return (crash || !hasData) ? 'BAD len:'+t.length+' crash:'+crash : 'OK len:'+t.length })()" 2>/dev/null)
  if echo "$out" | grep -q '"OK'; then PASS=$((PASS+1)); echo "PASS  $label  $out"; else FAIL=$((FAIL+1)); echo "FAIL  $label  $out"; fi
}

check "Overview"
check "Agent Fleet"
check "Workflows"
check "Executions"
check "Schedules"
check "Activity"
check "Agent Studio"
check "Agent Catalog"
check "Templates"
check "Model Hub"
check "Tool Registry"
check "Knowledge & Memory"
check "Evaluation Lab"
check "Policies & Guardrails"
check "Security Center"
check "Identity & Access"
check "Audit Center"
check "Deployments"
check "Environments"
check "Usage & Costs"
check "Team Management"
check "Integrations"
check "Developer Portal"
check "Billing"
check "Settings"

# refresh refs before screenshots (nav refs stay valid within same page session)
$AB screenshot download/e2e-screenshots/08-final-overview.png >/dev/null 2>&1

echo "=== SUMMARY: $PASS passed, $FAIL failed ==="
echo "=== PAGE ERRORS ==="
$AB errors 2>/dev/null | head -10
echo "=== CONSOLE errors (excluding 401) ==="
$AB console 2>/dev/null | grep -iE "error|exception|failed" | grep -v "401" | head -10
echo "=== DONE ==="
