#!/usr/bin/env bash
# Harness de QA: gera os .env dos dois sistemas para o teste real local.
# Uso: gerar-env.sh <dir-saida>  (gera atlas.env e orion.env; segredos aleatórios, só locais)
set -euo pipefail
OUT=${1:?dir}; mkdir -p "$OUT"
ATLAS_DIR=${ATLAS_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}
PG=${QA_PG:-postgres://neondb_owner@127.0.0.1:55440}
PGO=${QA_PG_ORION:-postgres://postgres@127.0.0.1:55440}
rnd() { node -e "console.log(require('crypto').randomBytes($1).toString('base64url'))"; }
INSTALL_SECRET=$(rnd 32); CRON=$(rnd 24)
JWK=$(cd "$ATLAS_DIR" && node scripts/orion-sso-keygen.mjs atlas-sso-qa | sed -n "s/^ATLAS_SSO_PRIVATE_JWK='\(.*\)'$/\1/p")
cat > "$OUT/atlas.env" <<A
NODE_ENV=production
PORT=3000
APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
AUTH_PROVIDER=neon
NEXT_PUBLIC_AUTH_PROVIDER=neon
DATA_BACKEND=postgres
DATABASE_URL=$PG/atlas_e2e
NEON_AUTH_BASE_URL=http://127.0.0.1:4010/neondb/auth
ORION_URL=http://localhost:3100
ORION_INSTALL_KEY_ID=orion-install-qa
ORION_INSTALL_SECRET=$INSTALL_SECRET
INTEGRATION_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
ATLAS_SSO_PRIVATE_JWK='$JWK'
CRON_SECRET=$CRON
A
cat > "$OUT/orion.env" <<O
NODE_ENV=production
PORT=3100
DATABASE_URL=$PGO/orion_e2e
SESSION_SECRET=$(rnd 48)
WMS_AUTO_SEED=false
WMS_DEMO_MODE=false
ATLAS_URL=http://localhost:3000
ORION_INSTALL_KEY_ID=orion-install-qa
ORION_INSTALL_SECRET=$INSTALL_SECRET
ATLAS_INTEGRATION_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
ORION_ATLAS_ACCESS_CHECK_SECONDS=20
CRON_SECRET=$CRON
O
echo "gerado em $OUT"
