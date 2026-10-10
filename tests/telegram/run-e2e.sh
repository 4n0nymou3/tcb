#!/bin/bash
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:-worker}"
SECRET="${TG_SECRET-0102030405060708090a0b0c0d0e0f10}"
INSPECTOR="${TG_INSPECTOR:-9351}"
OUT="$(mktemp -d)"
node "$HERE/build-package.mjs" "$MODE" "$OUT" tcb-test.example.workers.dev tcb-test >/dev/null 2>&1
if [ -n "$SECRET" ]; then
  printf 'TELEGRAM_SECRET=%s\nTELEGRAM_TEST_FIXED_DC_ADDR=127.0.0.1:21301\nTELEGRAM_DEBUG=1\n' "$SECRET" > "$OUT/telegram-worker/.dev.vars"
  if [ "${TG_DIAG:-0}" = "1" ]; then printf 'TELEGRAM_DIAG=1\n' >> "$OUT/telegram-worker/.dev.vars"; fi
else
  printf 'TELEGRAM_DEBUG=1\n' > "$OUT/telegram-worker/.dev.vars"
fi
TG_DC_LOG="$OUT/dc-events.log" node "$HERE/fake-dc.mjs" 21301 >"$OUT/dc.log" 2>&1 &
DC=$!
if [ "$MODE" = "pages" ]; then
  mkdir -p "$OUT/front"
  cp "$OUT/pages-worker/_worker.js" "$OUT/front/_worker.js"
  printf 'name = "pages-front"\nmain = "_worker.js"\ncompatibility_date = "2026-09-23"\n\n[[services]]\nbinding = "TELEGRAM_WORKER"\nservice = "tcb-test-telegram"\n' > "$OUT/front/wrangler.toml"
  (cd "$OUT" && npx wrangler dev -c front/wrangler.toml -c telegram-worker/wrangler.toml --local --port 8787 --inspector-port "$INSPECTOR" >"$OUT/wrangler.log" 2>&1) &
else
  (cd "$OUT/telegram-worker" && npx wrangler dev --local --port 8787 --inspector-port "$INSPECTOR" >"$OUT/wrangler.log" 2>&1) &
fi
for i in $(seq 1 60); do
  CODE=$(curl -s -o /dev/null -m 2 -w "%{http_code}" http://127.0.0.1:8787/ 2>/dev/null || echo 000)
  [ "$CODE" = "200" ] && break
  sleep 1
done
if [ -n "$SECRET" ]; then
  TG_DC_LOG="$OUT/dc-events.log" TG_SECRET="$SECRET" TG_HOST="tcb-test.example.workers.dev" node "$HERE/e2e.mjs"
else
  TG_NO_SECRET=1 TG_SECRET="0102030405060708090a0b0c0d0e0f10" TG_HOST="tcb-test.example.workers.dev" node "$HERE/e2e.mjs"
fi
STATUS=$?
if [ "${TG_DIAG:-0}" = "1" ]; then
  echo "diag lines in worker log: $(grep -c tg-diag "$OUT/wrangler.log")"
  if grep -q "SECRETVALUE\|LEAKME\|bad value" "$OUT/wrangler.log"; then echo "[FAIL] unsanitized diagnostic content reached the log"; STATUS=1; else echo "[PASS] junk diagnostic fields never reached the log"; fi
  if grep "tg-diag" "$OUT/wrangler.log" | grep -q "page-start"; then echo "[PASS] sanitized page-start diagnostic was logged"; else echo "[FAIL] no page-start diagnostic in log"; STATUS=1; fi
fi
kill $DC 2>/dev/null
pkill -9 -f "[w]rangler"
sleep 1
pkill -9 -f "[w]orkerd"
echo "work dir: $OUT"
exit $STATUS
