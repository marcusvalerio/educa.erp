# Plano de aplicação em produção e rollback

**Status da parte A (contenção): BLOQUEADA PELO BACKUP** (reconferido em
12/10/2026: produção inalterada e ainda vulnerável — `f t t f f f f t t`; dump
real não gerado: sem rede até `*.supabase.co`, sem CLI, sem Docker ativo e sem
credencial nesta sessão). O SQL, os scripts e os
testes estão prontos (hash conferido em 12/10). Falta o dump gerado **e
validado** pelo operador; sem isso a execução não está liberada. Nada deste
plano foi executado em produção. Cada parte exige aprovação explícita e separada.

## 0. Identificação do alvo (conferir antes de qualquer comando)

| Item | Valor esperado | Como conferir |
|---|---|---|
| Projeto Supabase | nome `educa.erp`, **Project ID (ref) `bshvfsxapwwfntowdxyr`**, região South America (São Paulo) `sa-east-1`, organização `marcusvalerio's Org` | ver "Como confirmar o ref no painel" abaixo |
| Banco | `system_identifier` **7678069749886157684**, banco `postgres`, PostgreSQL 17.6 | 1ª coluna de `verificacao.sql` — o script aborta sozinho se divergir |
| Ledger | contém `20260929165645` `0075_company_roles_and_user_invites` (86 registros em 12/10) | coluna `pre_ledger` de `precondicoes.sql` |
| Estado vulnerável | `verificacao.sql` → `f t t f f f f t t` | rodar antes |
| Arquivo | SHA-256 de `contencao-emergencial.sql` = `84d174bc336a4a1653001bd5b85fa17d66fead740366719f99c98ca0cf0ef03a` (revisão `fc952dc`, inalterada até `680bb35`) | `sha256sum` (o wrapper confere sozinho) |
| Executor | papel `postgres` do projeto, **não** superusuário; é o concedente de todos os grants afetados | colunas `executor`/`executor_superuser` de `precondicoes.sql` |

**Como confirmar o ref no painel (visual):**
1. Entrar em `https://supabase.com/dashboard` com a conta dona e abrir o projeto
   **educa.erp**. A barra de endereço deve ser
   `https://supabase.com/dashboard/project/bshvfsxapwwfntowdxyr/...`.
2. **Project Settings → General**: campo *Project ID* (também chamado *Reference
   ID*) = `bshvfsxapwwfntowdxyr`; *Name* = `educa.erp`; região São Paulo.
3. **Connect** (botão no topo): o *Session pooler* mostra o usuário
   `postgres.bshvfsxapwwfntowdxyr` — é dele que sai o `PGHOST`/`PGUSER` usados abaixo.
4. Conferência cruzada: na Vercel (projeto de produção `educaerp`), a variável
   `NEXT_PUBLIC_SUPABASE_URL` tem o host `bshvfsxapwwfntowdxyr.supabase.co`
   (olhar só o host; não copiar chaves).

**Nada no repositório aponta para produção por alias:** não há
`supabase/config.toml` nem vínculo `supabase/.temp`; `.env.local.example` só tem
marcadores (`SEU-PROJETO`); o `.env.local` de desenvolvimento aponta para
`127.0.0.1`. Os scripts abaixo não aceitam URL: o ref está fixo no código, o
`PGUSER` precisa ser `postgres.bshvfsxapwwfntowdxyr` (o pooler roteia por ele)
e o SQL ainda confere o `system_identifier`. Não usar `supabase link` dentro do
repositório nem variáveis como `SUPABASE_DB_URL` herdadas do shell.

## 1. Backup (pré-requisito — BLOQUEANTE)

**Situação verificada (12/10):** organização no plano **free**. Pela
documentação oficial, backups diários acessíveis só existem nos planos
Pro/Team/Enterprise, e PITR é add-on desses planos. Para o free a recomendação é
exportar com o CLI. **Não há backup confirmado.** Esta sessão não tem a senha
do banco, a rede até `*.supabase.co` é bloqueada e os registros de imagens
Docker recusam o download, então o dump **não** pôde ser gerado nem restaurado aqui.

**Procedimento operacional completo: [`producao/backup/RUNBOOK-BACKUP.md`](producao/backup/RUNBOOK-BACKUP.md)**
(baseado no oficial *Backup and Restore using the CLI*). Resumo dos comandos, numa
máquina autorizada, com Supabase CLI ≥ 2.120, Docker, `psql` e `supabase login` feito:

```bash
docs/homologacao/producao/backup/preflight.sh ~/educa-backups                       # PREFLIGHT OK
SAIDA=~/educa-backups/prod-$(date -u +%Y%m%dT%H%M%SZ)
docs/homologacao/producao/backup/gerar-dump-producao.sh "$SAIDA"                    # só leitura; fora do Git
ALVO=$(mktemp -d); supabase init --workdir "$ALVO" --yes && supabase start --workdir "$ALVO"   # PG 17 local
TARGET_DB_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
  docs/homologacao/producao/backup/validar-restauracao-dump.sh "$SAIDA"             # exige "DUMP VALIDADO"
supabase stop --workdir "$ALVO" --no-backup
```

- O código de saída zero do `supabase db dump` **não** valida o backup. Só a
  mensagem `DUMP VALIDADO` do validador valida, com 0 divergências em
  integridade, restauração, contagem de linhas por tabela e catálogo (resumo e
  objeto a objeto).
- Divergências são registradas em `registro-divergencias.md` (runbook, passo 7),
  nunca contornadas. Enquanto houver alguma não resolvida, o gate segue bloqueado.
- Testado nesta sessão: o validador, contra um dump simulado, aprovou o íntegro
  e acusou todos os casos negativos (`evidencias/contencao-v2/teste-local-validacao-dump.txt`).
  Os inventários de catálogo rodam em produção. **Não testado aqui:**
  `gerar-dump-producao.sh` contra o Supabase real (sem rede, credencial, CLI e imagem Docker).

## A. Contenção emergencial

**Escopo:** fecha E1, E2 e E3 (`CONTENCAO-SEGURANCA.md`). Sem deploy de código,
sem variável de ambiente, sem migração. **Não depende** de nenhuma migration de
funcionalidade (0076+): as pré-condições exigem só objetos da 0075, e a
contenção foi aplicada e testada sobre uma cópia no estado 0075.

**Conexão do operador** (Session pooler; nada de URL com senha):
```bash
git fetch origin claude/atlas-integracao-0076-0093 && git checkout --detach 680bb35   # ou commit posterior aprovado
export PGHOST='<host do Session pooler, copiado do painel → Connect>' PGPORT=5432 \
       PGDATABASE=postgres PGUSER=postgres.bshvfsxapwwfntowdxyr PGSSLMODE=require
```

| Passo | Ação | Esperado / critério |
|---|---|---|
| A1 | **Backup**: `DUMP VALIDADO` de hoje (seção 1). **Ref**: conferido no painel (seção 0). **Hash**: `sha256sum docs/homologacao/producao/contencao-emergencial.sql` | backup validado; ref = `bshvfsxapwwfntowdxyr`; hash = `84d174bc…f03a`. Qualquer divergência: **parar** |
| A2 | `docs/homologacao/producao/testar-data-api.sh antes` (chave pública, sem login; `limit=0`, nenhuma linha lida) | 4 views com HTTP 200 (exposição presente). Diferente disso: parar e investigar |
| A3 | `docs/homologacao/producao/executar-contencao.sh` — confere hash, `PGUSER`, pede confirmação de backup/ref/janela, pede a senha sem eco, roda `verificacao.sql` e `precondicoes.sql` em sessão **somente leitura** e grava a saída, pede `APLICAR bshvfsxapwwfntowdxyr`, executa o SQL (uma transação, `ON_ERROR_STOP`) e roda a verificação depois | antes `7678069749886157684/postgres f t t f f f f t t`; pré-condições `t t t t t t t postgres f`; `COMMIT`; depois `t t t t t t t t t`. O wrapper **para sozinho** em qualquer divergência |
| A4 | `docs/homologacao/producao/testar-data-api.sh depois` | 4 views 401/403 (`42501`) e a função 401/403/404 |
| A5 | Fumaça no app (administrador): Financeiro → Fluxo de caixa; Estoque → Valorização; Controladoria → Margem por produto e por cliente; Relatórios executivo e financeiro; Fiscal → calcular um documento em rascunho; Cadastros → Produtos | iguais a antes. Margem por pedido e painel de estoque **já falham hoje** (0092/0090) e continuam iguais |
| A6 | Supabase → Advisors → Security | `security_definer_view` some para as 4 views |
| A7 | Registro: pasta de saída do wrapper (fora do Git, com `MANIFEST.sha256`), saídas de A2/A4, horário, operador e conferente | arquivado com acesso restrito |

Execução manual equivalente (se o wrapper não puder ser usado), na mesma ordem:
```bash
read -rs PGPASSWORD; export PGPASSWORD
psql -X -v ON_ERROR_STOP=1 -q -AtF' ' -c 'set session characteristics as transaction read only' -f docs/homologacao/producao/verificacao.sql
psql -X -v ON_ERROR_STOP=1 -q -AtF' ' -c 'set session characteristics as transaction read only' -f docs/homologacao/producao/precondicoes.sql
psql -X -v ON_ERROR_STOP=1 -f docs/homologacao/producao/contencao-emergencial.sql
psql -X -v ON_ERROR_STOP=1 -q -AtF' ' -c 'set session characteristics as transaction read only' -f docs/homologacao/producao/verificacao.sql
unset PGPASSWORD
```
O SQL Editor do painel **não** é recomendado: não confere o hash do texto
colado, e uma colagem truncada pode perder o `commit` ou a verificação final.

**Critérios de interrupção (parar, não improvisar):**
- hash, ref, `PGUSER`, identidade (`system_identifier/banco`) ou estado "antes" diferentes do esperado;
- qualquer pré-condição `f` ou executor superusuário;
- erro `Contenção: …` na execução. A transação já foi desfeita: registrar a
  mensagem e a `verificacao-pos-falha.txt`. Não editar o script em produção nem repetir sem entender a causa;
- `lock_timeout` (o objeto estava em uso): pode-se repetir uma vez fora do pico; se repetir o erro, parar;
- verificação depois ≠ `t…t`, A4 com qualquer HTTP 200, ou regressão funcional em A5:
  acionar o responsável. **Não** aplicar rollback automaticamente (ver abaixo).

- **Janela:** qualquer horário; locks curtos (`lock_timeout 5s`).
- **Efeito colateral esperado:** os event triggers `pgrst_ddl_watch`/`pgrst_drop_watch`
  do Supabase pedem ao PostgREST para recarregar o cache de schema (benigno).

### Rollback de A — só por decisão explícita

**Prioridade é corrigir para frente.** Uma regressão funcional depois da
contenção se resolve no código (o app lê as views com `service_role`, que
mantém o acesso) ou com uma migration nova, **sem** devolver acesso a
`anon`/`authenticated`. `producao/rollback-contencao.sql` **reabre risco de
segurança** e exige:
1. quebra funcional **comprovada** (rota, usuário afetado, mensagem), sem correção possível no prazo;
2. decisão **explícita e registrada** do responsável, ciente do risco da seção
   escolhida (tabela abaixo), com prazo para reaplicar a contenção;
3. execução **só** das seções necessárias (apagar as demais do arquivo), com a
   mesma conexão e `psql -X -v ON_ERROR_STOP=1 -f`; depois, `verificacao.sql` e registro.

| Seção | Restaura | Risco reaberto |
|---|---|---|
| R1 | policy `units_select_authenticated USING (true)` | E1 para todo usuário logado |
| R2 | views sem `security_invoker` | sozinha nenhum (ninguém além do app tem privilégio); com R3, E2 para logados |
| R3 | SELECT nas 4 views para `authenticated` | com R2, totais de todas as empresas para qualquer logado; sem R2, limitado pelo RLS |
| R4 | EXECUTE da função para `service_role` | nenhum para usuários/anon (só o servidor) |
| R5 (comentada) | estado integral anterior: ALL para `anon`/`authenticated`, EXECUTE para `anon`/`authenticated` | **E2 e E3 para qualquer pessoa na internet**; nunca como primeira opção |

O rollback tem a mesma guarda de identidade e uma conferência que aborta se
`anon` voltar a ter acesso sem R5. Testado localmente: R1–R4 resultam em
`f t t t f f f t t`; R5 reproduz o catálogo original exatamente; a contenção
reaplica depois sem erro.

## B. Atualização completa (sequência integrada + código)

**Escopo:** migrations 0076 … 0094 (ordem dos nomes) e o código da branch
`claude/atlas-integracao-0076-0093`.

**Migrations pendentes por ambiente** (conferido em 12/10/2026, só leitura):

| Ambiente | Estado | Pendentes |
|---|---|---|
| Produção Supabase `bshvfsxapwwfntowdxyr` | ledger com 86 registros, último `20260929165645` (0075); contenção **não** aplicada | 0076 → 0094 (19 arquivos) |
| Homologação Neon `homolog` (`br-icy-cell-b62lgh06`) | sem ledger; banco `neondb` conferido objeto a objeto em 13/10: está na **0073** (faltam a versão da 0074 de `fn_reserve_sales_order_stock`, o `audit_logs_action_check` da 0074 e as funções de papéis/convites da 0075) | banco `neondb`: 0074 → 0094 (21 arquivos), homologado em 13/10 na branch filha `br-hidden-cherry-b6dj1ksb` com catálogo final = local 0094. Banco `educa` (dados de homologação): marcadores da 0075 presentes, 0076+ ausentes; 0076 → 0094 ainda não homologadas nele |
| Neon de produção `main` (`br-lively-darkness-b683lnw7`, banco `educa`) | conferido em 14/10, só leitura: **antes da 0074** (sem funções da 0075, check de auditoria antigo) | 0074 → 0075 **antes** da cópia dos dados; 0076 → 0094 depois (ver `docs/CUTOVER_RUNBOOK.md`, sequência atual) |
| Local (`vi_int`, `vc_k`) | 0001 → 0094 aplicadas; `npm test` 1064/1064 | nenhuma |

Ordem recomendada: (1) contenção na produção (parte A); (2) 0074 → 0094 numa branch filha da homologação Neon (catálogo feito em 13/10; falta o E2E da aplicação apontada para ela); (3) backup obrigatório e 0076 → 0094 na produção pelo ledger; (4) deploy do código integrado.

| Pré-condição | Situação (12/10/2026) |
|---|---|
| Duplicidades que quebrariam índices únicos da 0081/0083 (`accounts_receivable_origin_active_unique`, `pick_lists_open_per_order_unique`, `fiscal_documents_own_number_unique`) | **0** grupos duplicados em produção (contagem só leitura) |
| Referências entre empresas que deixariam FKs da 0091 `NOT VALID` | **0** nas 18 relações (contagem só leitura, 10/10) |
| Sequência validada do zero, incremental e sobre banco já atualizado | local: esquema e permissões idênticos (0 linhas de diferença) |
| 0091–0093 sobre a homologação Neon | aplicadas numa branch filha; 18/18 FKs validadas; matriz de papéis = local (`RELATORIO-HOMOLOGACAO-REMOTA.md`) |
| 0074–0094 sobre a homologação Neon | aplicadas em 13/10 numa branch filha, comando a comando, pela API do Neon: 4.630 objetos idênticos ao local 0094; 18/18 FKs validadas; E1/E2/E3 fechadas (`RELATORIO-HOMOLOGACAO-REMOTA.md`) |
| Suíte com o código integrado | `npm test` 1064/1064 (com 0094, inclusive sobre banco contido + 0076…0094); E2E 210 + 66 + 32 + 13 + 37 (antes da 0094) e rotas afetadas 72/72 (com 0094), local |
| Contenção aplicada antes da sequência | banco contido + 0076…0094 = sequência pura: 0 linhas de diferença de esquema/concessões |

**Ordem de deploy (banco antes do código):**
1. Backup (seção 1) e janela de manutenção curta.
2. Parte A, se ainda não aplicada (pode ficar — idempotente).
3. Migrations 0076 → 0094 pelo mecanismo do ledger (`supabase db push` /
   ferramenta de migrations do Supabase), uma a uma, nome = arquivo sem
   `.sql`. Em erro: parar (cada arquivo é transacional).
4. Verificação: `verificacao.sql` (`t` em tudo); `select count(*) from
   pg_constraint where conname like '%same_company_fk' and convalidated` =
   18; ledger com 0076…0094.
5. Deploy do código integrado na Vercel (produção).
6. Fumaça: Produtos (lista sem aviso), Unidades/Categorias por API,
   Locais de estoque (criar), CRM (lead → cliente/oportunidade), Painéis
   Fiscal/Estoque/Produção, NF-e em homologação, Margem por pedido.

**Por que banco antes do código:** o código antigo funciona no banco novo —
**comprovado**: o código da `main` (48775f5, o de produção) sobre o banco
integrado passou em 209/210 verificações do E2E geral; a única diferença é
criar categoria pela API (403, igual à produção hoje: o código antigo pede
`product_categories.create`). Evidência:
`evidencias/integracao-final/e2e-geral-codigo-main-banco-integrado.txt`. O código novo **não** funciona
no banco antigo (chama funções e permissões criadas por 0076–0093). O
intervalo entre os passos 3 e 5 deve ser curto.

### Rollback de B

| Componente | Reversível? | Como |
|---|---|---|
| Código (Vercel) | sim | promover o deploy anterior |
| Policies, views, grants, funções (`create or replace`) | sim, manualmente | restaurar a definição anterior a partir do dump de schema (passo 1) |
| Permissões novas (`units.*`, `unit_conversions.*`) e concessões | sim | `delete` das concessões e códigos inseridos (lista na 0091) |
| FKs compostas, índices únicos | sim | `drop constraint` / `drop index` |
| Dados normalizados (0079 nomes, 0080 JSON null→NULL, 0081 status de reservas, 0085 unidade dos itens) | **não automaticamente** | restaurar do backup se necessário; são correções sem perda de informação útil |

Recomendação: em problema após B, primeiro reverter **só o código**
(o banco novo é compatível com o código antigo) e investigar.

## C. Aprovações necessárias

1. **Autorizar A** (contenção) — recomendado imediatamente.
2. **Autorizar B** — depois da revisão do merge `claude/atlas-integracao-0076-0093`,
   do backup obrigatório (seção 1) e, de preferência, da aplicação de 0076–0088 e 0094 na homologação remota.
3. Quem executa, quando, e quem confere a verificação pós-aplicação.

## D. Credenciais e branches temporárias (Neon `old-butterfly-53570465`, não é produção)

**Papel `validador_seq`** (senha exibida numa sessão anterior), verificado em 12/10 antes da remoção:
- existia **só** na branch `valida-sequencia-20261012` (não na `homolog` nem nas outras filhas);
- `LOGIN`, membro de `neon_superuser` (`CREATEROLE`, `BYPASSRLS`), padrão de papéis criados pelo painel/API;
- função auxiliar `zz_validacao_exec` já removida (0 funções `zz_*`); 0 objetos próprios,
  0 grants em tabelas/funções/schemas/banco, 0 default ACL, 0 sessões;
- `ALTER ROLE … NOLOGIN` pelo SQL foi negado ao `neondb_owner`. O reset de senha
  exibiria uma senha nova, então foi descartado.

**Ação executada com autorização do responsável (12/10):** exclusão das três
branches filhas descartáveis. Antes, reconferido: nome, mãe = `homolog`
(`br-icy-cell-b62lgh06`), nenhuma padrão ou protegida, nenhuma branch dependente.

| Branch | id | Situação |
|---|---|---|
| `valida-sequencia-20261012` | `br-blue-king-b6mrb350` | **excluída** (levou o papel `validador_seq` e a credencial) |
| `valida-contencao-20261011` | `br-restless-bonus-b6txjb6l` | **excluída** |
| `valida-contencao-v2-20261012` | `br-quiet-surf-b6ob7mhx` | **excluída** |
| `homolog` | `br-icy-cell-b62lgh06` | mantida, **não alterada**; papéis: service_role, anon, authenticated, neondb_owner, educa_app (sem `validador_seq`) |
| `main`, `homolog-antes-atlas-20260929`, `rehearsal-*` | — | mantidas (não criadas por estas rodadas) |

**Credencial `validador_seq`: revogada** (o papel não existe mais em nenhuma
branch). A senha não está em nenhum arquivo do repositório nem das evidências. O
arquivo local que a continha foi destruído numa rodada anterior.
