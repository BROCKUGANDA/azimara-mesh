#!/bin/bash
# E2E: sign-in redirect + role boards for demo vs real users
cd /home/z/my-project
mkdir -p download/e2e-screenshots

if ! curl -s --max-time 2 -o /dev/null http://localhost:3000/; then
  (bun run dev >/dev/null 2>&1 &)
fi
for i in $(seq 1 45); do curl -s --max-time 2 -o /dev/null http://localhost:3000/ && break; sleep 2; done
echo "SERVER OK"

AB="agent-browser"
PASS=0; FAIL=0

login_case() {
  local email="$1" expect_h1="$2" expect_badge="$3" shot="$4"
  $AB cookies clear >/dev/null 2>&1
  $AB open http://localhost:3000 >/dev/null 2>&1
  sleep 2.5
  # on the login screen?
  local onLogin
  onLogin=$($AB eval "!!document.querySelector('#password')" 2>/dev/null)
  if [ "$onLogin" != "true" ]; then echo "FAIL  $email  (login screen not shown)"; FAIL=$((FAIL+1)); return; fi
  $AB find first "#email" fill "$email" >/dev/null
  $AB find first "#password" fill "Azimara#2024" >/dev/null
  $AB find first "button[type=submit]" click >/dev/null
  sleep 2.5
  local out
  out=$($AB eval "(() => { const h1 = document.querySelector('main h1')?.innerText || '(no h1)'; const badge = !!document.querySelector('[data-testid=demo-mode-badge]'); const login = !!document.querySelector('#password'); return JSON.stringify({ h1, badge, stillOnLogin: login }) })()" 2>/dev/null | sed 's/\\//g')
  local ok=1
  echo "$out" | grep -q "stillOnLogin\":true" && ok=0
  echo "$out" | grep -q "\"h1\":\"$expect_h1\"" || ok=0
  if [ "$expect_badge" = "yes" ]; then echo "$out" | grep -q '"badge":true' || ok=0; else echo "$out" | grep -q '"badge":false' || ok=0; fi
  if [ "$ok" = "1" ]; then PASS=$((PASS+1)); echo "PASS  $email -> $out"; else FAIL=$((FAIL+1)); echo "FAIL  $email -> $out (expected h1=$expect_h1 badge=$expect_badge)"; fi
  [ -n "$shot" ] && $AB screenshot "download/e2e-screenshots/$shot" >/dev/null 2>&1
}

# demo accounts — role boards
login_case "ada@azimara.ai"   "Fleet Overview"   yes 09-demo-owner.png
login_case "marco@azimara.ai" "Agent Fleet"      yes 10-demo-admin.png
login_case "yuki@azimara.ai"  "Execution Center" yes 11-demo-operator.png
login_case "lena@azimara.ai"  "Activity"         yes 12-demo-viewer.png
# real user — production board, no badge
login_case "nadia@northwind-labs.com" "Fleet Overview" no 13-real-user.png

# reload persistence: real user session survives a full reload (cookie round-trip)
$AB reload >/dev/null 2>&1
sleep 3
PERSIST=$($AB eval "(() => { const h1 = document.querySelector('main h1')?.innerText || '(no h1)'; const login = !!document.querySelector('#password'); return JSON.stringify({ h1, stillOnLogin: login }) })()" 2>/dev/null | sed 's/\\//g')
if echo "$PERSIST" | grep -q '"h1":"Fleet Overview"'; then PASS=$((PASS+1)); echo "PASS  session persists across reload -> $PERSIST"; else FAIL=$((FAIL+1)); echo "FAIL  session reload persistence -> $PERSIST"; fi

echo "=== SUMMARY: $PASS passed, $FAIL failed ==="
echo "=== PAGE ERRORS ==="
$AB errors 2>/dev/null | head -8
$AB close >/dev/null 2>&1
