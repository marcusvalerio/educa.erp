# Runbook — backup da produção antes da contenção

**Objetivo:** gerar um dump lógico do Supabase de produção `bshvfsxapwwfntowdxyr`
e **provar por restauração** que ele é utilizável. Só depois disso o gate da
contenção pode ser liberado.

**Quem executa:** operador com conta dona do projeto, numa máquina autorizada,
com rede até `*.supabase.co` e Docker. Leva cerca de 30 a 60 minutos.
**Não executa nada que altere a produção:** o dump e as conferências são só leitura.

**Regras**
- Nunca colar senha, token, URL com senha ou dados do dump em chat, ticket, log
  ou commit.
- O dump fica **fora** de qualquer repositório Git, em pasta `700` e arquivos
  `600`. Nunca enviar para GitHub, Vercel, drive compartilhado ou link público.
- A restauração é feita **só** num PostgreSQL local isolado. Nunca usar como
  destino a produção ou qualquer `*.supabase.co`.
- Divergência não se ignora nem se contorna: registra-se (passo 7) e o gate
  continua bloqueado até ser resolvida.

---

## 1. Confirmar o projeto no painel oficial

1. Entrar em `https://supabase.com/dashboard` com a conta dona e abrir o projeto **educa.erp**.
2. A barra de endereço deve conter `/dashboard/project/bshvfsxapwwfntowdxyr`.
3. **Project Settings → General**: *Project ID* = `bshvfsxapwwfntowdxyr`,
   *Name* = `educa.erp`, região South America (São Paulo).
4. **Project Settings → Database**: se não houver a senha do banco num cofre,
   redefini-la ali. O app não usa essa senha (usa as chaves da API). Guardar a
   senha só no cofre.

Registrar: data/hora UTC, nome de quem conferiu e "Project ID conferido".

## 2. Preparar a máquina e rodar o preflight

```bash
# repositório no commit aprovado (não precisa de branch local)
git clone https://github.com/marcusvalerio/educa.erp.git educa-erp-backup && cd educa-erp-backup
git fetch origin claude/atlas-integracao-0076-0093 && git checkout --detach origin/claude/atlas-integracao-0076-0093
supabase login                       # abre o navegador; o token fica no chaveiro do CLI
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE DATABASE_URL SUPABASE_DB_URL SUPABASE_DB_PASSWORD TARGET_DB_URL
docs/homologacao/producao/backup/preflight.sh ~/educa-backups
```

**Esperado:** `PREFLIGHT OK`. O preflight confere:
- o commit aprovado e o SHA-256 do SQL de contenção (`84d174bc…f03a`);
- Supabase CLI ≥ 2.120.0, Docker em execução, `psql` ≥ 15 (recomendado 17),
  `python3`, `sha256sum`, `comm`, `join`;
- **pela API oficial**, que a conta enxerga `bshvfsxapwwfntowdxyr` com nome
  `educa.erp` e região `sa-east-1` (segunda confirmação do Project ID);
- que nenhuma variável `PG*`/`DATABASE_URL` herdada do shell possa redirecionar a conexão;
- que a pasta de saída está fora de qualquer repositório Git e tem pelo menos 2 GB livres.

Qualquer `ERRO`: corrigir e repetir. Não seguir com erro.

## 3. Gerar o dump (fora do repositório)

```bash
SAIDA=~/educa-backups/prod-$(date -u +%Y%m%dT%H%M%SZ)
docs/homologacao/producao/backup/gerar-dump-producao.sh "$SAIDA"
```

O script:
- pede a senha **sem eco** e a repassa ao CLI só pelo ambiente do processo;
- vincula o CLI a `bshvfsxapwwfntowdxyr` numa pasta temporária e confere o vínculo;
- gera `roles.sql`, `schema.sql`, `data.sql` (`--use-copy`), `historico-schema.sql` e `historico-dados.sql`;
- gera os inventários do catálogo de produção (`inventario-producao.txt` e
  `inventario-detalhe-producao.txt`) numa sessão **somente leitura**;
- grava `dump.log` e `MANIFEST.sha256`.

**Esperado:** termina com `Dump gerado em … (pasta 700, arquivos 600)` e
lista os SHA-256.

Se aparecer o `AVISO` de URL do pooler indisponível:
1. rodar `inventario-catalogo.sql` e `inventario-detalhe.sql` no **SQL Editor**
   do projeto (são só SELECT em catálogo);
2. salvar as saídas, colunas separadas por `|`, em `$SAIDA/inventario-producao.txt`
   e `$SAIDA/inventario-detalhe-producao.txt`;
3. refazer o manifesto com
   `(cd "$SAIDA" && sha256sum roles.sql schema.sql data.sql historico-*.sql inventario-*.txt > MANIFEST.sha256)`.

## 4. Conferir os arquivos gerados

```bash
ls -la "$SAIDA"                                    # pasta drwx------ ; arquivos -rw-------
for f in roles.sql schema.sql data.sql historico-schema.sql historico-dados.sql \
         inventario-producao.txt inventario-detalhe-producao.txt MANIFEST.sha256 dump.log; do
  [ -s "$SAIDA/$f" ] && echo "ok  $f $(wc -c < "$SAIDA/$f") bytes" || echo "FALTA/VAZIO  $f"
done
(cd "$SAIDA" && sha256sum -c MANIFEST.sha256)      # todas as linhas "OK"
grep -c '^COPY ' "$SAIDA/data.sql"                 # nº de tabelas com dados exportados (> 0)
grep -ciE 'password|senha|postgresql://[^ ]*:[^ ]*@' "$SAIDA/dump.log"   # deve ser 0
```

**Esperado:**
- nenhum `FALTA/VAZIO`;
- manifesto todo `OK`;
- pelo menos um `COPY` no `data.sql`;
- 0 ocorrências de credencial no log.

Não abrir `data.sql` em editor compartilhado nem copiar trechos dele: contém dados pessoais.

## 5. Restaurar num PostgreSQL isolado (pilha local do Supabase)

```bash
ALVO=$(mktemp -d)
supabase init --workdir "$ALVO" --yes
grep -n 'major_version' "$ALVO/supabase/config.toml"   # deve ser 17 (produção é 17)
supabase start --workdir "$ALVO"                       # banco local em 127.0.0.1:54322
```

O destino é a pilha local do Supabase, porque ela tem os papéis (`anon`,
`authenticated`, `service_role`) e os schemas `auth`/`storage` que o dump referencia.
- Não usar um projeto Supabase existente.
- Não usar a produção.
- O validador recusa qualquer URL `*.supabase.co`, qualquer URL com o ref de
  produção e qualquer banco que já tenha tabelas em `public`.

## 6. Validar a restauração

```bash
TARGET_DB_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
  docs/homologacao/producao/backup/validar-restauracao-dump.sh "$SAIDA"
```

A URL acima é a padrão da pilha **local** (credencial pública de desenvolvimento,
não é segredo). O validador roda todas as conferências e grava
`$SAIDA/relatorio-validacao.txt`:

| # | Conferência | Critério |
|---|---|---|
| 0 | alvo | PostgreSQL ≥ 17, vazio, com papéis do Supabase, não é produção |
| 1 | integridade | todos os arquivos presentes e não vazios; `MANIFEST.sha256` confere |
| 2 | restauração | `roles` + `schema` + `data` numa transação, depois o ledger; sem erro |
| 3 | registros | contagem de linhas de **cada** tabela do `data.sql` = contagem no restaurado |
| 4 | catálogo (resumo) | tabelas, colunas, constraints, índices, views, funções, policies, RLS, gatilhos, grants, sequências, ledger e extensões idênticos à produção |
| 5 | catálogo (objeto a objeto) | cada tabela, constraint, índice, view, função, policy, RLS, gatilho, grant, sequência e migration idêntico à produção; divergência aponta o nome do objeto |

**Esperado:** `DUMP VALIDADO: restauração completa; linhas, catálogo e objetos
idênticos à produção.` Em erro, o terminal mostra só nomes de objetos, contagens e
hashes, nunca o conteúdo de linhas (o log completo fica em
`$SAIDA/restauracao.log`, protegido).

Depois de registrar o resultado, desligar o destino:

```bash
supabase stop --workdir "$ALVO" --no-backup && rm -rf "$ALVO"
```

## 7. Divergências: registrar, não contornar

Se o resultado for `DUMP NÃO VALIDADO`, criar `$SAIDA/registro-divergencias.md`
(fica junto do dump, fora do Git) com uma linha por item de
`relatorio-validacao.txt`:

| Divergência (como no relatório) | Causa identificada | Evidência | Decisão (corrigir e repetir / aceitar com justificativa) | Responsável |
|---|---|---|---|---|

- **Não editar** os scripts ou os inventários para fazer a validação passar.
- Causas conhecidas e o que fazer:
  - **extensão ausente no destino:** habilitar a mesma extensão na pilha local e repetir;
  - **`COPY` de coluna/tabela de `auth`/`storage` inexistente no destino** (versão
    local do Auth/Storage diferente da plataforma): atualizar o Supabase CLI e repetir;
    se persistir, registrar. É divergência do ambiente de teste, não do dump, mas
    **mantém o gate bloqueado** até alguém aceitá-la formalmente com justificativa;
  - **grant extra no restaurado:** verificar privilégios padrão do destino. Não aceitar sem entender.
- Repetir os passos 5–6 com um destino novo após cada correção.

## 8. Critério para liberar o gate

O gate só é liberado quando **todas** as evidências abaixo existirem e forem
conferidas por uma segunda pessoa:

- [ ] Project ID `bshvfsxapwwfntowdxyr` conferido no painel (passo 1), com data/hora e nome.
- [ ] `PREFLIGHT OK`, incluindo a confirmação pela API (passo 2).
- [ ] `Dump gerado em …`, com pasta `700` e arquivos `600` fora do Git (passo 3).
- [ ] Todos os arquivos presentes, `MANIFEST.sha256` todo `OK`, 0 credencial no log (passo 4).
- [ ] Destino local PostgreSQL 17 (passo 5).
- [ ] `DUMP VALIDADO` no `relatorio-validacao.txt`, com 0 divergências (passo 6), **ou**
      todas as divergências registradas e formalmente aceitas (passo 7).
- [ ] Conteúdo do `MANIFEST.sha256` e a última linha do `relatorio-validacao.txt`
      copiados para o registro da mudança. São só hashes e o veredito, sem dados.
- [ ] Local de guarda do dump registrado (máquina/cofre), sem link público.

Com isso, seguir para a parte A de `PLANO-PRODUCAO-E-ROLLBACK.md`. A execução da
contenção é uma autorização **separada**.

## Bloqueios desta sessão de preparação (12/10/2026)

O dump real **não foi gerado nem restaurado** pela sessão que preparou este
runbook:
- sem rede até `*.supabase.co`;
- sem senha do banco;
- Supabase CLI não instalado;
- download de imagens Docker recusado.

Foi testado localmente, com um dump simulado (`pg_dump` de cópia equivalente à
produção, PostgreSQL 16):
- o validador aprova o íntegro;
- acusa:
  - arquivo adulterado;
  - linha faltando;
  - catálogo divergente;
  - objeto divergente pelo nome;
  - várias divergências numa execução;
  - alvo usado;
  - URL de produção;
  - PostgreSQL < 17;
- não expõe dados em erro de restauração.

O preflight foi executado e **bloqueou** corretamente (CLI ausente, Docker parado).
Os inventários de catálogo rodam em produção (resumos em
`docs/homologacao/evidencias/contencao-v2/inventario-*-12-10.txt`).
