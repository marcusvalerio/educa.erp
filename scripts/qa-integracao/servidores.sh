#!/usr/bin/env bash
# Harness de QA: sobe/derruba os 3 processos do teste real (stub do Neon Auth,
# ATLAS em next start :3000, ORION em next start :3100). Guarda os PIDs em <dir>/pids.
# Uso: servidores.sh up|down|orion-down|orion-up <dir-qa>
set -euo pipefail
CMD=${1:?up|down}; QA=${2:?dir}
ATLAS_DIR=${ATLAS_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}
ORION_DIR=${ORION_DIR:-$(cd "$ATLAS_DIR/../ORION.WMS" && pwd)}
start() { # nome dir envfile comando...
  local name=$1 dir=$2 env=$3; shift 3
  ( cd "$dir"; set -a; [ -n "$env" ] && . "$env"; set +a; exec "$@" ) > "$QA/$name.log" 2>&1 &
  echo $! > "$QA/$name.pid"
}
wait_http() { for _ in $(seq 1 60); do curl -s -o /dev/null "$1" && return 0; sleep 1; done; echo "não respondeu: $1"; return 1; }
stop() { [ -f "$QA/$1.pid" ] && { pkill -TERM -P "$(cat "$QA/$1.pid")" 2>/dev/null || true; kill "$(cat "$QA/$1.pid")" 2>/dev/null || true; rm -f "$QA/$1.pid"; }; }
case $CMD in
  up)
    for p in 4010 3000 3100; do curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$p/" && { echo "porta $p já em uso: derrube o processo anterior"; exit 1; }; done
    start neon-stub "$ATLAS_DIR" "" node scripts/qa-integracao/neon-auth-stub.mjs 4010 "$QA/usuarios.json"
    start atlas "$ATLAS_DIR" "$QA/atlas.env" node_modules/.bin/next start -p 3000
    start orion "$ORION_DIR" "$QA/orion.env" node_modules/.bin/next start -p 3100
    wait_http http://127.0.0.1:4010/neondb/auth/.well-known/jwks.json
    wait_http http://localhost:3000/.well-known/astraeus-jwks.json
    wait_http http://localhost:3100/login
    echo "no ar: stub $(cat "$QA/neon-stub.pid"), atlas $(cat "$QA/atlas.pid"), orion $(cat "$QA/orion.pid")" ;;
  orion-down) stop orion ;;
  orion-up)
    start orion "$ORION_DIR" "$QA/orion.env" node_modules/.bin/next start -p 3100
    wait_http http://localhost:3100/login ;;
  down) stop orion; stop atlas; stop neon-stub ;;
esac
