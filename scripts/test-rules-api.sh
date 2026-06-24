#!/usr/bin/env bash
# Rules feature smoke tests — run while dev server is up (npm run dev)
set -e
BASE="${1:-http://localhost:3000}"
PASS=0
FAIL=0

check() {
  local name="$1"
  local ok="$2"
  if [ "$ok" = "1" ]; then
    echo "✓ $name"
    PASS=$((PASS + 1))
  else
    echo "✗ $name"
    FAIL=$((FAIL + 1))
  fi
}

json() { node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);${1}})"; }

echo "=== Rules API smoke tests ($BASE) ==="

AI=$(curl -sf "$BASE/api/rule/parse" | json "console.log(j.configured?'1':'0')")
check "AI configured (OPENAI_API_KEY)" "$AI"

RULES=$(curl -sf "$BASE/api/rule" | json "console.log(Array.isArray(j.rules)?j.rules.length:0)")
check "GET /api/rule returns rules" "$([ "${RULES:-0}" -gt 0 ] && echo 1 || echo 0)"

HAS_CUSTOM=$(curl -sf "$BASE/api/rule" | json "console.log(j.rules.some(r=>r.trigger_type==='Custom')?'1':'0')")
if [ "$HAS_CUSTOM" != "1" ]; then
  curl -sf -X POST "$BASE/api/rule" -H "Content-Type: application/json" \
    -d '{"ruleName":"General Campaign","status":"Active","triggerType":"Custom","triggerConfig":{},"channel":"Email","messageTemplate":"Hi {first_name}, we have a special offer for you. Code: {credit_code}","incentiveCode":"PROMO10"}' >/dev/null
  check "Created General Campaign (Custom) rule" "1"
else
  check "Custom rule exists" "1"
fi

CUSTOM_ID=$(curl -sf "$BASE/api/rule" | json "console.log(j.rules.find(r=>r.trigger_type==='Custom')?.id||'')")
if [ -n "$CUSTOM_ID" ]; then
  ELIG=$(curl -sf "$BASE/api/rule/$CUSTOM_ID/audience?has_email=yes" | json "console.log(j.eligible??0)")
  check "Custom rule audience responds" "$([ "${ELIG:-0}" -ge 0 ] && echo 1 || echo 0)"

  ELIG7=$(curl -sf "$BASE/api/rule/$CUSTOM_ID/audience?has_email=yes&last_visit=7" | json "console.log(j.eligible??0)")
  check "Custom rule + last_visit=7 filter" "$([ "${ELIG7:-0}" -ge 0 ] && echo 1 || echo 0)"
fi

PREVIEW=$(curl -sf -X POST "$BASE/api/rule/preview-audience" \
  -H "Content-Type: application/json" \
  -d '{"triggerType":"Custom","triggerConfig":{},"channel":"Email"}' \
  | json "console.log(j.eligible??0)")
check "Preview audience (Custom) returns rows" "$([ "${PREVIEW:-0}" -gt 0 ] && echo 1 || echo 0)"

SUG=$(curl -sf "$BASE/api/rule/suggestions?field=status&q=Act" | json "console.log((j.suggestions??[]).length>0?'1':'0')")
check "Filter suggestions work" "$SUG"

NORM=$(curl -sf "$BASE/api/rule" | json "console.log(j.rules.every(r=>r.channel!=='Telegram')?'1':'0')")
check "No Telegram channel in API response" "$NORM"

echo ""
echo "Passed: $PASS | Failed: $FAIL"
[ "$FAIL" -eq 0 ]
