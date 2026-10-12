#!/usr/bin/env bash
# Preflight do backup de produção (somente leitura; não conecta ao banco).
# Confere, antes de gerar o dump:
#   - checkout do repositório no commit aprovado e SHA-256 do SQL de contenção;
#   - Supabase CLI ≥ 2.120.0, Docker em execução, psql ≥ 15 (recomendado 17),
#     python3, sha256sum, comm, join;
#   - `supabase login` válido e o projeto bshvfsxapwwfntowdxyr visível pela API
#     oficial, com nome educa.erp e região sa-east-1;
#   - variáveis de ambiente que poderiam redirecionar conexões (só os NOMES);
#   - pasta de saída fora de qualquer repositório Git, com espaço livre.
# Imprime só versões e estados — nenhuma senha, token ou URL.
#
# Uso (na raiz do repositório): docs/homologacao/producao/backup/preflight.sh [pasta-de-saída]
set -uo pipefail
REF="bshvfsxapwwfntowdxyr"
SHA_SQL="84d174bc336a4a1653001bd5b85fa17d66fead740366719f99c98ca0cf0ef03a"
COMMIT_MINIMO="a46e887"
OUT="${1:-$HOME/educa-backups}"
FAIL=0
ok()   { echo "  OK    $*"; }
erro() { echo "  ERRO  $*"; FAIL=1; }
aviso(){ echo "  AVISO $*"; }
ver_ge() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" = "$2" ]; }

echo "== repositório"
RAIZ="$(git rev-parse --show-toplevel 2>/dev/null)" || { erro "rode dentro do checkout do repositório"; RAIZ=.; }
cd "$RAIZ"
git merge-base --is-ancestor "$COMMIT_MINIMO" HEAD 2>/dev/null && ok "HEAD $(git rev-parse --short HEAD) contém $COMMIT_MINIMO" || erro "HEAD não contém o commit aprovado $COMMIT_MINIMO"
[ -z "$(git status --porcelain)" ] && ok "working tree limpo" || aviso "working tree com alterações locais — conferir antes de seguir"
SHA="$(sha256sum docs/homologacao/producao/contencao-emergencial.sql 2>/dev/null | cut -d' ' -f1)"
[ "$SHA" = "$SHA_SQL" ] && ok "SHA-256 do SQL de contenção confere" || erro "SHA-256 do SQL de contenção diverge ($SHA)"

echo "== ferramentas"
for c in python3 sha256sum comm join git; do command -v "$c" >/dev/null && ok "$c presente" || erro "$c ausente"; done
if command -v supabase >/dev/null; then
  V="$(supabase --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
  ver_ge "$V" 2.120.0 && ok "Supabase CLI $V" || erro "Supabase CLI $V < 2.120.0 (atualizar)"
else erro "Supabase CLI ausente (https://supabase.com/docs/guides/local-development/cli/getting-started)"; fi
if docker info >/dev/null 2>&1; then ok "Docker em execução (servidor $(docker version --format '{{.Server.Version}}' 2>/dev/null))"
else erro "Docker não está em execução (o CLI roda pg_dump num contêiner e a pilha local usa Docker)"; fi
if command -v psql >/dev/null; then
  V="$(psql --version | grep -oE '[0-9]+(\.[0-9]+)?' | head -1)"
  ver_ge "$V" 17 && ok "psql $V" || { ver_ge "$V" 15 && aviso "psql $V (funciona; recomendado 17, igual à produção)" || erro "psql $V < 15"; }
else erro "psql ausente"; fi

echo "== projeto pela API oficial (requer supabase login)"
if command -v supabase >/dev/null; then
  J="$(supabase projects list -o json 2>/dev/null)"
  if [ -z "$J" ]; then erro "sem acesso à API — rode 'supabase login' com a conta dona do projeto"
  else
    R="$(printf '%s' "$J" | python3 -c '
import json, sys
ref = sys.argv[1]
try: dados = json.load(sys.stdin)
except Exception: print("json-invalido"); sys.exit()
for p in dados if isinstance(dados, list) else []:
    if ref in (p.get("id"), p.get("ref")):
        print(str(p.get("name")) + "|" + str(p.get("region"))); break
else: print("nao-encontrado")' "$REF")"
    case "$R" in
      "educa.erp|sa-east-1") ok "projeto $REF visível: nome educa.erp, região sa-east-1" ;;
      nao-encontrado) erro "projeto $REF não aparece para esta conta" ;;
      *) erro "projeto $REF com nome/região inesperados: $R" ;;
    esac
  fi
fi

echo "== variáveis que poderiam redirecionar conexões (só nomes)"
VARS="$(env | cut -d= -f1 | grep -E '^(PG[A-Z]+|DATABASE_URL|SUPABASE_DB_URL|SUPABASE_DB_PASSWORD|SUPABASE_PROJECT_ID|SUPABASE_PROJECT_REF|TARGET_DB_URL)$' | tr '\n' ' ')"
[ -z "$VARS" ] && ok "nenhuma definida" || aviso "definidas: $VARS — abrir um terminal limpo ou 'unset' antes do dump"

echo "== pasta de saída"
mkdir -p "$OUT" 2>/dev/null || erro "não foi possível criar $OUT"
if git -C "$OUT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then erro "$OUT está dentro de um repositório Git"; else ok "$OUT fora de repositório Git"; fi
LIVRE="$(df -Pk "$OUT" 2>/dev/null | awk 'NR==2 {print int($4/1024)}')"
[ "${LIVRE:-0}" -ge 2048 ] && ok "espaço livre: ${LIVRE} MB" || aviso "espaço livre baixo: ${LIVRE:-?} MB (reservar ao menos 2 GB)"

echo
[ "$FAIL" = 0 ] && echo "PREFLIGHT OK — pode seguir para gerar-dump-producao.sh" || { echo "PREFLIGHT COM ERROS — corrigir antes de gerar o dump"; exit 1; }
