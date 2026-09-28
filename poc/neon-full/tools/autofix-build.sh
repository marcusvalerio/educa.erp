#!/bin/bash
# Laço de reconstrução: aplica o plano e, para os dois tipos de divergência
# conhecidos (chave (id, company_id) criada em outra etapa em produção),
# gera ponte/patch e tenta de novo. Qualquer outro erro para para análise.
cd /home/user/educa-poc; B=$PWD/poc/neon-full/sql/bridges; PT=$PWD/poc/neon-full/sql/patched; PL=${PLAN:?defina PLAN (plano com caminhos absolutos)}
for i in $(seq 1 40); do
out=$(poc/neon-full/build-local.sh prod_equiv $PL 2>&1 | grep -v NOTICE); echo "$out" | head -1
if echo "$out" | grep -q "^OK"; then exit 0; fi
mig=$(echo "$out" | sed -n 's/^FAIL \(.*\)$/\1/p'); tbl=$(echo "$out" | sed -n 's/.*no unique constraint matching given keys for referenced table "\([a-z_]*\)".*/\1/p'); dup=$(echo "$out" | sed -n 's/.*relation "\([a-z_]*_id_company_id_key\)" already exists.*/\1/p')
if [ -n "$tbl" ]; then n=${mig%%_*}; f=$B/pre-$n.sql; [ -f $f ] || echo "-- Ponte: chaves (id, company_id) que a versão de produção criou antes/nesta etapa." > $f
  echo "do \$\$ begin if not exists (select 1 from pg_constraint where conrelid = 'public.$tbl'::regclass and contype in ('u','p') and pg_get_constraintdef(oid) = 'UNIQUE (id, company_id)') then alter table public.$tbl add constraint ${tbl}_id_company_id_key unique (id, company_id); end if; end \$\$;" >> $f
  grep -qF "$f" $PL || { awk -v b="$f" -v m="/$mig" 'index($0,m) && !done {print b; done=1} {print}' $PL > /tmp/pgpoc/p.tmp && mv /tmp/pgpoc/p.tmp $PL; }
elif [ -n "$dup" ]; then src=$(grep "/$mig$" $PL | head -1); dst=$PT/$mig
  python3 - "$src" "$dst" "$dup" <<'PY'
import re,sys
s=open(sys.argv[1],encoding='utf-8').read()
n=re.subn(r'alter table (?:public\.)?\w+\s+add constraint '+re.escape(sys.argv[3])+r' unique \(id, company_id\);', '-- [POC] removido: chave já criada antes, como em produção', s, flags=re.I)
assert n[1]==1, n[1]
open(sys.argv[2],'w',encoding='utf-8').write(n[0])
PY
  sed -i "s#^$src\$#$dst#" $PL
else echo "$out"; exit 1; fi; done
