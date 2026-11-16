#!/usr/bin/env bash
# Teste real ATLAS ↔ ORION (docs/QA-INTEGRACAO.md). Recria os dois bancos no
# Postgres local, gera os .env, (opcionalmente) compila os dois apps, sobe os
# 3 processos, roda o roteiro e derruba tudo no fim.
#   QA_DIR=<pasta de trabalho/capturas>  QA_BUILD=1 (recompila)  QA_KEEP=1 (não derruba)
set -euo pipefail
ATLAS_DIR=$(cd "$(dirname "$0")/../.." && pwd); export ATLAS_DIR
ORION_DIR=${ORION_DIR:-$(cd "$ATLAS_DIR/../ORION.WMS" && pwd)}; export ORION_DIR
QA=${QA_DIR:-$ATLAS_DIR/.qa-integracao}; mkdir -p "$QA/env" "$QA/shots"
PGH="psql -h 127.0.0.1 -p ${PGPORT_QA:-55440} -q"
H=$(dirname "$0")
bash "$H/servidores.sh" down "$QA/env" 2>/dev/null || true
# Bancos: ATLAS = migrations do repositório (mesmo plano dos testes PGlite); ORION = npm run db:migrate
(cd "$ATLAS_DIR" && npx tsx -e 'import {migrationPlan} from "./tests/helpers/atlas-pglite"; console.log(migrationPlan().join("\n"))' > "$QA/plano.txt")
(cd "$ATLAS_DIR" && bash "${QA_BUILD_DB:-/tmp/claude-0/build.sh}" atlas_e2e "$QA/plano.txt" | tail -1)
DATABASE_URL=postgres://neondb_owner@127.0.0.1:55440/atlas_e2e node "$H/seed-atlas.mjs" "$QA/env/usuarios.json" > "$QA/seed.json"
$PGH -U postgres -d postgres -c "drop database if exists orion_e2e" -c "create database orion_e2e"
[ -f "$QA/env/atlas.env" ] || bash "$H/gerar-env.sh" "$QA/env"
(cd "$ORION_DIR" && set -a && . "$QA/env/orion.env" && set +a && NODE_ENV=development npm run -s db:migrate)
if [ "${QA_BUILD:-0}" = 1 ]; then
  (cd "$ORION_DIR" && set -a && . "$QA/env/orion.env" && set +a && npx next build >/dev/null)
  (cd "$ATLAS_DIR" && set -a && . "$QA/env/atlas.env" && set +a && npm run -s build >/dev/null)
fi
bash "$H/servidores.sh" up "$QA/env"
set -a; . "$QA/env/atlas.env"; set +a
export QA_ATLAS_DB=postgres://neondb_owner@127.0.0.1:55440/atlas_e2e QA_ORION_DB=postgres://postgres@127.0.0.1:55440/orion_e2e
export QA_CRON_SECRET=$CRON_SECRET QA_SHOTS="$QA/shots" QA_SEED="$QA/seed.json" QA_ENV_DIR="$QA/env"
set +e
(cd "$ATLAS_DIR" && node "$H/roteiro.mjs" ${QA_STEPS:-})
rc=$?
[ "${QA_KEEP:-0}" = 1 ] || bash "$H/servidores.sh" down "$QA/env"
exit $rc
