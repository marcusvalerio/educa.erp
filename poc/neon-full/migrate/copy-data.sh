#!/bin/bash
# Cópia de DADOS Supabase (produção) → Neon (branch de ensaio ou produção),
# com o esquema já aplicado no destino pelo plano (plan-prod-equivalente.txt).
#
#   SOURCE_URL=postgres://…supabase…   (conexão direta ou pooler em modo SESSÃO; só leitura)
#   TARGET_URL=postgres://neondb_owner:…@…/educa?sslmode=require   (dono do banco destino)
#   CONFIRM_TARGET=<host do destino>   (trava contra apontar para o banco errado)
#   poc/neon-full/migrate/copy-data.sh
#
# Consistência: uma única transação REPEATABLE READ na origem (snapshot) para
# todas as tabelas. Destino: numa única transação — gatilhos de usuário
# desligados, TRUNCATE de todas as tabelas públicas + auth.users, FKs públicas
# guardadas e removidas (o grafo tem ciclos: users↔departments/positions,
# workflow_instances↔workflow_instance_steps), \copy de tudo, FKs recriadas com
# a MESMA definição (recriar valida todas as linhas), gatilhos religados,
# sequences ajustadas. Qualquer erro desfaz tudo no destino.
# Nada é escrito na origem.
set -euo pipefail
: "${SOURCE_URL:?}"; : "${TARGET_URL:?}"; : "${CONFIRM_TARGET:?}"
case "$TARGET_URL" in *"$CONFIRM_TARGET"*) ;; *) echo "TARGET_URL não contém $CONFIRM_TARGET" >&2; exit 2;; esac
case "$TARGET_URL" in *supabase*) echo "destino não pode ser o Supabase" >&2; exit 2;; esac
DIR=$(cd "$(dirname "$0")" && pwd)
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
AUTH_COLS="id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, banned_until, deleted_at, is_anonymous, last_sign_in_at, created_at, updated_at"

ALL=$(psql "$SOURCE_URL" -At -c "select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' order by 1")
DST=$(psql "$TARGET_URL" -At -c "select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' order by 1")
[ "$ALL" = "$DST" ] || { echo "tabelas públicas diferentes entre origem e destino" >&2; diff <(echo "$ALL") <(echo "$DST") >&2; exit 2; }

# 1) export num único snapshot da origem
{
  echo "begin transaction isolation level repeatable read read only;"
  echo "set timezone = 'UTC';"
  echo "\\copy (select $AUTH_COLS from auth.users) to '$WORK/auth.users.copy'"
  for t in $ALL; do echo "\\copy public.$t to '$WORK/$t.copy'"; done
  # last_value nulo = sequence nunca usada (pg_sequences não expõe is_called)
  echo "select 'seq', sequencename, coalesce(last_value::text, '') from pg_sequences where schemaname = 'public';"
  echo "commit;"
} > "$WORK/export.sql"
psql "$SOURCE_URL" -v ON_ERROR_STOP=1 -q -At -F '|' -f "$WORK/export.sql" | grep '^seq|' > "$WORK/sequences.txt" || true

# 2) import numa transação no destino
{
  echo "begin;"
  echo "set timezone = 'UTC';"
  echo "do \$\$ declare r record; begin for r in select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' loop execute format('alter table public.%I disable trigger user', r.relname); end loop; end \$\$;"
  echo "truncate table auth.users, $(echo "$ALL" | sed 's/^/public./' | paste -sd, -);"
  echo "create temp table _fks on commit drop as select conrelid::regclass::text as tbl, conname, pg_get_constraintdef(oid) as def from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace;"
  echo "do \$\$ declare r record; begin for r in select * from _fks loop execute format('alter table %s drop constraint %I', r.tbl, r.conname); end loop; end \$\$;"
  echo "\\copy auth.users ($AUTH_COLS) from '$WORK/auth.users.copy'"
  for t in $ALL; do echo "\\copy public.$t from '$WORK/$t.copy'"; done
  echo "do \$\$ declare r record; begin for r in select * from _fks order by tbl, conname loop execute format('alter table %s add constraint %I %s', r.tbl, r.conname, r.def); end loop; end \$\$;"
  echo "do \$\$ begin if (select count(*) from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace) <> (select count(*) from _fks) then raise exception 'FKs não recriadas'; end if; end \$\$;"
  while IFS='|' read -r _ seq last; do
    if [ -n "$last" ]; then echo "select setval('public.$seq', $last, true);"
    else echo "select setval('public.$seq', (select start_value from pg_sequences where schemaname = 'public' and sequencename = '$seq'), false);"; fi
  done < "$WORK/sequences.txt"
  echo "do \$\$ declare r record; begin for r in select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' loop execute format('alter table public.%I enable trigger user', r.relname); end loop; end \$\$;"
  echo "select count(*) filter (where tgenabled <> 'O') as gatilhos_desligados from pg_trigger g join pg_class c on c.oid = g.tgrelid where c.relnamespace = 'public'::regnamespace and not g.tgisinternal;"
  echo "commit;"
} > "$WORK/import.sql"
psql "$TARGET_URL" -v ON_ERROR_STOP=1 -q -f "$WORK/import.sql"

# 3) validação: contagem + md5 por tabela e sequences, nos dois lados
psql "$SOURCE_URL" -At -F '|' -f "$DIR/table-hashes.sql" > "$WORK/src.txt"
psql "$TARGET_URL" -At -F '|' -f "$DIR/table-hashes.sql" > "$WORK/dst.txt"
SEQ="select sequencename, coalesce(last_value::text, '-') from pg_sequences where schemaname = 'public' order by 1"
psql "$SOURCE_URL" -At -F '|' -c "$SEQ" > "$WORK/src-seq.txt"
psql "$TARGET_URL" -At -F '|' -c "$SEQ" > "$WORK/dst-seq.txt"
if diff <(grep '|' "$WORK/src.txt") <(grep '|' "$WORK/dst.txt") && diff "$WORK/src-seq.txt" "$WORK/dst-seq.txt"; then
  echo "DADOS IGUAIS: $(grep -c '|' "$WORK/src.txt") tabelas (contagem + md5), $(wc -l < "$WORK/src-seq.txt") sequences"
else
  echo "DIVERGÊNCIA de dados (acima)" >&2; exit 1
fi
