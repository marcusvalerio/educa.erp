#!/bin/bash
# POC EDUCA-NEON: sobe tudo e roda o E2E (DATA_BACKEND=postgres, sem Supabase).
#   PostgreSQL local (PGDATA_POC, porta 55440) → caixa de e-mail (58025) →
#   build do app → banco/dublê/Owner do zero (reset-local.sh) → app (3200) → E2E.
# Segredos só em arquivos locais fora do Git: SECRETS (dublê) e .env.local.
#   SECRETS=/caminho/secrets.env PGDATA_POC=/caminho/data poc/neon-full/e2e/run-all.sh
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../../.." && pwd); cd "$ROOT"
: "${SECRETS:?defina SECRETS}"
PORT=${PGPORT_POC:-55440}
LOGS=${POC_LOGS:-/tmp/educa-poc-logs}; mkdir -p "$LOGS"

if ! pg_isready -q -h 127.0.0.1 -p "$PORT"; then
  : "${PGDATA_POC:?PostgreSQL fora do ar: defina PGDATA_POC para iniciá-lo}"
  PGBIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
  su postgres -c "$PGBIN/pg_ctl -D $PGDATA_POC -l $PGDATA_POC/server.log -o '-p $PORT -k /tmp' start" > /dev/null
fi
if ! curl -s -o /dev/null "http://localhost:58025/api/v1/search?query=to:x"; then
  (nohup node poc/neon-full/e2e/mail-sink.mjs > "$LOGS/mail.log" 2>&1 &)
  sleep 1
fi
for p in $(ps -eo pid,args | awk '/next (start|-server)|next-server/ && !/awk/ {print $1}'); do kill "$p" 2>/dev/null || true; done
npx next build > "$LOGS/build.log" 2>&1 || { tail -30 "$LOGS/build.log"; exit 1; }
SECRETS="$SECRETS" bash poc/neon-full/e2e/reset-local.sh > "$LOGS/reset.log" 2>&1
(nohup npx next start -p 3200 > "$LOGS/app.log" 2>&1 &)
for i in $(seq 1 60); do [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3200/login)" = 200 ] && break; sleep 1; done
APP_LOG="$LOGS/app.log" E2E_ENV=.env.local NEON_DOUBLE_DB="postgres://postgres@127.0.0.1:$PORT/neon_double" PGDB=educa_poc \
  node poc/neon-full/e2e/e2e-postgres.mjs | tee "$LOGS/e2e.log"
