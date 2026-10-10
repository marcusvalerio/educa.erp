#!/bin/bash
# Verificação reproduzível do esquema-destino do Neon, sem rede e sem segredos.
#
#   PGPORT_POC=55440 poc/neon-full/tools/verify-schema-local.sh
#
# Pré-requisito: PostgreSQL local com usuário `postgres` em trust no
# 127.0.0.1 (como em build-local.sh). Não toca em Neon nem Supabase.
#
# O que faz:
#   1. reconstrói do zero o banco `verify_full` pelo plano completo
#      (plan-prod-equivalente.txt, até a última migration);
#   2. reconstrói `verify_delta` só até a 0073 (estado do Neon `main`
#      registrado em docs/SUPABASE_PARA_NEON.md) e aplica por cima as
#      migrations posteriores, uma a uma, como seria feito no Neon;
#   3. compara as impressões digitais normalizadas dos dois bancos — têm de
#      ser idênticas (o caminho de atualização produz o mesmo esquema);
#   4. imprime a impressão digital por categoria, para comparar com a de
#      produção/Neon obtida pela mesma consulta (sql/fingerprint-normalized.sql).
#
# A categoria `tacl` só bate num PostgreSQL 17 (privilégio MAINTAIN, "m");
# em PostgreSQL 16 ela difere por isso e não por esquema.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../../.." && pwd); cd "$ROOT"
PORT=${PGPORT_POC:-55440}
P="psql -h 127.0.0.1 -p $PORT -v ON_ERROR_STOP=1 -q"
FP=poc/neon-full/sql/fingerprint-normalized.sql
LAST_IN_NEON_MAIN=0073
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

sed "s#^#$ROOT/#" poc/neon-full/plan-prod-equivalente.txt > "$TMP/full.txt"
awk -v last="$LAST_IN_NEON_MAIN" '{ if (match($0, /supabase\/migrations\/[0-9]{4}_/)) { n = substr($0, RSTART + 20, 4); if (n > last) { print > "/dev/stderr"; next } } print }' \
  "$TMP/full.txt" > "$TMP/base.txt" 2> "$TMP/delta.txt"

echo "== 1. plano completo ($(grep -c . "$TMP/full.txt") arquivos)"
poc/neon-full/build-local.sh verify_full "$TMP/full.txt" | grep -v NOTICE
$P -U postgres -d verify_full -f poc/neon-full/sql/10_app_login_role.sql > /dev/null 2>&1

echo "== 2. até $LAST_IN_NEON_MAIN + delta ($(grep -c . "$TMP/delta.txt") migrations)"
poc/neon-full/build-local.sh verify_delta "$TMP/base.txt" | grep -v NOTICE
$P -U postgres -d verify_delta -f poc/neon-full/sql/10_app_login_role.sql > /dev/null 2>&1
while read -r f; do
  [ -z "$f" ] && continue
  $P -U neondb_owner -d verify_delta -1 -f "$f" > /dev/null
  echo "   aplicada $(basename "$f")"
done < "$TMP/delta.txt"

echo "== 3. comparação"
$P -U postgres -d verify_full -At -F' ' -f "$FP" > "$TMP/full.fp"
$P -U postgres -d verify_delta -At -F' ' -f "$FP" > "$TMP/delta.fp"
if diff -q "$TMP/full.fp" "$TMP/delta.fp" > /dev/null; then echo "   IGUAIS: o delta reproduz o esquema completo"; else echo "   DIFERENTES:"; diff "$TMP/full.fp" "$TMP/delta.fp"; exit 3; fi

echo "== 4. impressão digital (categoria, quantidade, hash)"
cat "$TMP/full.fp"
$P -U postgres -d postgres -c "drop database verify_delta" -c "drop database verify_full" 2>&1 | grep -v NOTICE || true
