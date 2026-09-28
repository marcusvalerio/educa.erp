#!/bin/bash
# Ambiente local limpo para o E2E da POC (DATA_BACKEND=postgres):
# banco educa_poc a partir do plano equivalente a produção, papel de login
# da app, banco do dublê zerado, caixa de e-mail vazia e Owner pelo
# bootstrap oficial. Segredos só em arquivos locais fora do Git
# (SECRETS: POC_AUTH_SECRET, NEON_AUTH_SERVICE_EMAIL/PASSWORD; .env.local).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../../.." && pwd); cd "$ROOT"
SECRETS=${SECRETS:?defina SECRETS (arquivo local com os segredos do dublê)}
PORT=${PGPORT_POC:-55440}
sed "s#^#$ROOT/#" poc/neon-full/plan-prod-equivalente.txt > /tmp/educa-poc-plan.txt
poc/neon-full/build-local.sh educa_poc /tmp/educa-poc-plan.txt 2>&1 | grep -v NOTICE
psql -h 127.0.0.1 -p $PORT -U postgres -d educa_poc -q -v ON_ERROR_STOP=1 -f poc/neon-full/sql/10_app_login_role.sql 2>&1 | grep -v NOTICE || true
# dublê: banco novo + reinício
for p in $(ps -eo pid,args | awk '/neon-double\.mjs/ && !/awk/ {print $1}'); do kill $p; done
psql -h 127.0.0.1 -p $PORT -U postgres -d postgres -qc "drop database if exists neon_double" -c "create database neon_double" 2>&1 | grep -v NOTICE || true
(cd poc/neon-auth && set -a && . "$SECRETS" && set +a && NEON_DOUBLE_DB="postgres://postgres@127.0.0.1:$PORT/neon_double?options=-c%20search_path%3Dpublic" NEON_DOUBLE_TRUSTED=http://localhost:3200 nohup node neon-double.mjs > /tmp/educa-poc-double.log 2>&1 &)
for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:3401/neondb/auth/ok && break; sleep 1; done
curl -s -X DELETE http://localhost:58025/api/v1/messages > /dev/null
set -a; . ./.env.local; set +a
node --import tsx scripts/bootstrap-platform-owner.mjs --email dona.plataforma@educa-poc.test --name "Dona da Plataforma" --app-url http://localhost:3200
