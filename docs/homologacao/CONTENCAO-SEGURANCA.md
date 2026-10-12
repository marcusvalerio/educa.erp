# Contenção de segurança — exposições multiempresa (pacote de aprovação v2)

Branch `claude/atlas-integracao-0076-0093` · 12/10/2026.

> **Classificação (gate final, 12/10/2026): PREPARAÇÃO INCOMPLETA — BACKUP BLOQUEADO.**
> SQL íntegro (SHA-256 conferido, inalterado desde `fc952dc`), revisão final
> sem pendências, identidade do projeto e procedimento de execução prontos e
> testados. **Não é "pronta para aprovação de execução"** enquanto o dump não for
> gerado e validado (`DUMP VALIDADO`) pelo operador: esta sessão não tem rede até
> `*.supabase.co`, nem credencial do banco, nem acesso a imagens Docker.
> Em produção (Supabase `bshvfsxapwwfntowdxyr`) as três exposições **continuam
> ativas**. Nada foi alterado em produção.

## 0. Arquivos e hashes (SHA-256)

| Arquivo | v1 (a7c44fd) | **v2 (para aprovação)** |
|---|---|---|
| `producao/contencao-emergencial.sql` | `055e7fc8…a32b15` | **`84d174bc336a4a1653001bd5b85fa17d66fead740366719f99c98ca0cf0ef03a`** |
| `producao/verificacao.sql` | `d1713795…483f86e` | `1de7a3fa35b5f200bf39101d9f4c6755f67462e83df995e57378832b3fba0c58` |
| `producao/rollback-contencao.sql` | `61499910…e48c30` | `bacf945967b556da18174b66f43b05bab264c6c39a2ce36874a8b61868adba2d` |
| `supabase/migrations/0094_privilegios_minimos_views_e_regras_fiscais.sql` | — | `b19efea8ee3765b54566e10fbcd895f6e9a69e435320c060e78ac269399eda0b` |

Conferir antes de executar: `sha256sum docs/homologacao/producao/contencao-emergencial.sql`.
Diferenças v1→v2: `evidencias/contencao-v2/diff-contencao-v1-v2.diff` e
`diff-rollback-v1-v2.diff`.

## 1. Exposições

| # | Exposição | Quem alcança |
|---|---|---|
| E1 | policy `units_select_authenticated USING (true)`: unidades e `company_id` de todas as empresas | qualquer usuário autenticado |
| E2 | `v_cash_flow_summary`, `v_cash_flow_projection`, `inventory_valuation`, `v_sales_order_item_margin`: sem `security_invoker`, o dono (`postgres`, BYPASSRLS) ignora o RLS. **Todos** os privilégios (`arwdDxtm`) para `anon` e `authenticated` | sem login, com a chave pública; e qualquer usuário logado |
| E3 | `fn_resolve_applicable_tax_rules`: SECURITY DEFINER sem checagem, EXECUTE para `anon`, `authenticated` e `service_role` | sem login, conhecendo o id da empresa |

Pré-imagem exata do catálogo de produção: `evidencias/contencao-v2/producao-metadados-12-10.md`.

## 2. Revisão instrução por instrução (v2)

| Instrução | Propósito / verificação |
|---|---|
| `begin` … `commit` | uma transação: qualquer erro desfaz tudo |
| `lock_timeout 5s`, `statement_timeout 60s` | aborta em vez de enfileirar atrás de locks |
| pré-condição: `system_identifier = 7678069749886157684` e `current_database() = 'postgres'` | **identificação inequívoca** do banco de produção. Uma cópia física (restauração, réplica) herda o identificador; o operador também confere o ref no painel (seção 6) |
| pré-condição: ledger contém `20260929165645` (0075) | schema no estado esperado |
| pré-condição: as 4 views, `units` e a função existem; `units_select` (has_permission) existe; RLS ligado | não deixa `units` sem policy prevista; aborta se o schema divergir |
| pré-condição: service_role com BYPASSRLS e SELECT nas 4 views | o app (cliente administrativo) continua lendo |
| pré-condição: toda função que cita `fn_resolve_applicable_tax_rules` é SECURITY DEFINER do mesmo dono | nenhuma chamadora perde acesso (hoje só `fn_calculate_fiscal_document`) |
| `drop policy if exists units_select_authenticated` | E1 (= 0091 §1) |
| `alter view … set (security_invoker = true)` ×4 | E2: views passam a respeitar o RLS de quem consulta (= 0091 §4) |
| `revoke all … from anon` (views) | = 0091 §4 (mantido literal) |
| `revoke all … from public, anon, authenticated` (views) | **novo (0094)**: concessões são diretas a cada papel, então cada um é nomeado; o usuário não tem consumidor legítimo nas views |
| `revoke all on function … from public, anon, authenticated` | E3 (= 0093) |
| `revoke all on function … from public, anon, authenticated, service_role` | **novo (0094)**: o app não chama a função por RPC; só o dono executa |
| verificação final (aborta → rollback) | nenhuma policy `USING (true)` em `units`; `units_select` e RLS mantidos; em **toda** view do schema `public`: nenhum privilégio efetivo (`has_table_privilege`, que segue herança e PUBLIC) de anon/authenticated em SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER, **nenhuma entrada** na ACL crua para PUBLIC/anon/authenticated (cobre MAINTAIN do PG17), `security_invoker=true`; service_role ainda lê as 4; ACL da função explícita (NULL = PUBLIC) e só com o dono; nenhum EXECUTE efetivo para anon/authenticated/service_role |

**Não altera:** dados, definições de views, funções, demais policies, papéis,
permissões do app, variáveis de ambiente.

### `REVOKE … FROM PUBLIC` não basta

Em produção não há entrada PUBLIC nas ACLs: as concessões são **diretas** a `anon`,
`authenticated` e `service_role`, concedidas por `postgres`. O script revoga
de cada papel pelo nome. A verificação final confere os privilégios
**efetivos**: herança por associação a outros papéis (`anon` é INHERIT em
produção) e PUBLIC. Teste D (seção 4) concede SELECT a um papel do qual `anon`
herda: a contenção **aborta** e nada fica aplicado.

### security_invoker com os consumidores reais

| Objeto | Consumidor real | Depois da contenção |
|---|---|---|
| `v_cash_flow_summary`, `v_cash_flow_projection` | `/api/cash-flow-summary` e `/api/cash-flow-projection`: cliente administrativo (`service_role`, BYPASSRLS), filtro pela empresa da sessão | iguais (E2E: API = banco, antes e depois) |
| `inventory_valuation` | `/api/inventory-valuation`: cliente administrativo | igual |
| `v_sales_order_item_margin` | `fn_margin_by_product/customer/order`, `fn_report_executive/finance/inventory`: SECURITY DEFINER (rodam como dono) e conferem `has_permission(p_company_id, …)` | iguais |

Nenhum consumidor usa o papel do usuário nas views, então o usuário não
precisa de grant nas views nem nas tabelas de base. `security_invoker` fica
como **segunda barreira**: se alguém voltar a conceder SELECT a
`authenticated`, o RLS das tabelas limita à empresa (testes 2–4 de
`views-isolamento-db`).

### Função fiscal: quem precisa executar

Só a chamadora `fn_calculate_fiscal_document` (SECURITY DEFINER, dono
`postgres`, confere `fiscal_documents.calculate`), que roda como o dono. O app
não a chama por RPC (`grep` em `src/`). Resultado: EXECUTE só do dono. O cálculo
fiscal pela API continua passando (E2E geral, "documento fiscal: calcular (RPC)
com total 27,80").

## 3. Reconciliação com a sequência definitiva

- v1 = subconjunto de 0091 §1/§4 + 0093. A revisão encontrou privilégios além
  do necessário que 0091/0093 não removiam: `authenticated` com ALL nas views e
  `service_role` com EXECUTE na função. Em vez de divergir das migrations,
  foi criada a **0094** (`supabase/migrations/0094_privilegios_minimos_views_e_regras_fiscais.sql`)
  com exatamente essas duas revogações. A **v2 é um subconjunto literal de
  0091 §1/§4 + 0093 + 0094**, sem nenhuma instrução própria além de guardas e verificações.
- A atualização completa aplica 0076…0094 pelo ledger. Os comandos da
  contenção rodam de novo sem efeito. Comprovado: banco contido + 0076…0094 =
  sequência pura, **0 linhas** de diferença no esquema e nas concessões
  (`pg_dump --schema-only`) e 0 nas permissões.
- 0091/0093 não foram reescritas (já validadas na homologação remota). A 0094
  é aditiva e idempotente.
- A contenção roda fora do ledger. O ledger registra 0091/0093/0094 quando a
  sequência for aplicada.
- A contenção não depende de nada além da 0075. A parte B não depende da contenção.

## 4. Evidências (antes/depois)

Pasta `evidencias/contencao-v2/`.

| Ambiente | Teste | Resultado |
|---|---|---|
| Local, cópia do banco equivalente à produção (PG16), `testar-contencao.sh` | A antes; B identidade da produção num banco que não é a produção; C ledger sem 0075; D `anon` herdando SELECT por outro papel (aborta na **verificação final**); E chamadora SECURITY INVOKER; F aplicar; G idempotência; H acesso real por papel; I rollback técnico + reaplicação; J rollback integral; K 0076…0094 por cima | **todas OK**. A `f t t f f f f t t`; B/C/D/E abortam pelo motivo esperado e o catálogo fica idêntico; F `t t t t t t t t t`; G catálogo igual; H anon e authenticated negados nas 4 views, service_role lê, função negada aos três; I `f t t t f f f t t` (reabre E1 e E2 para logados; anon fechado) e reaplicação volta a `t…t`; J catálogo idêntico ao original; K 19 migrations sem erro, `t…t` (`teste-local-contencao.txt`) |
| Mesma cópia, `views-isolamento-db` (dados sintéticos Alfa=1000/Beta=2000) | antes × depois | antes 2/10 (anon e usuários leem as duas empresas); depois 9/10. A falha restante é `fn_margin_by_order` `min(uuid)`, defeito pré-existente de produção corrigido pela 0092, idêntico antes e depois (`views-isolamento-antes-depois.txt`) |
| **PG17, branch Neon descartável** `valida-contencao-v2-20261012` | antes, falha deliberada, aplicação, acesso por papel, idempotência | antes = produção; identidade da produção → aborta sem alteração parcial; depois `t…t` incluindo MAINTAIN; anon/authenticated negados; função negada também a service_role; service_role lê as views; reexecução sem erro (`neon-pg17-branch-descartavel.md`; branch excluída depois) |
| Código da **main (produção)** sobre banco equivalente à produção, **antes** e **depois** da contenção | E2E geral (login, CRUD por módulo, isolamento, fiscal incl. cálculo) | **210/210** antes e **210/210** depois |
| Idem | E2E das rotas afetadas (`e2e-contencao-rotas.mjs`): fluxo de caixa, projeção, valorização, margens ×3, relatórios executivo/financeiro/estoque × 3 usuários + sem sessão | **48/50 antes e 48/50 depois, com as mesmas 2 falhas**: `margin-by-order` (`min(uuid)`, 0092) e `reports/inventory` (`total_value` ambíguo, 0090). São defeitos pré-existentes de produção sem relação com a contenção, reproduzidos no banco sem ela |
| Código **integrado** sobre 0076…0094 | E2E das rotas afetadas | **72/72** |
| Sequência integrada 0001…0094 (`vi_int`) e contenção+sequência (`vc_k`) | `npm test` | **1064/1064** em cada (0 falha, 0 cancelado, 0 pulado, 0 todo) |

## 5. Impactos esperados da contenção em produção

- **App:** nenhum. O código da main passou 210/210 e 48/50 igual antes e depois.
- **Acesso direto à Data API com chave pública:** as 4 views e a função passam a
  responder `permission denied`. Usuários logados (JWT) também perdem leitura
  direta das views; nenhum fluxo legítimo usa esse caminho (logs 24/09–11/10:
  só `service_role`).
- **`units` direto no banco:** sem a 0091 não existe `units.read`, então nenhum
  usuário lê `units` direto (nem a própria empresa). O app já responde 403 em
  `/api/units` hoje (exige `units.read`). A parte B resolve.
- **Locks:** `ALTER VIEW` e `DROP POLICY` pegam lock curto; aborta em 5 s se houver contenção de lock.

## 6. Risco residual e questões não verificadas

- **Backup não confirmado:** organização no plano free, sem backups diários
  acessíveis nem PITR (documentação oficial). Ver pré-condições no plano.
- O ref do projeto não é legível por SQL. A guarda usa `system_identifier` +
  banco + ledger + schema, e o operador confere o ref no painel. Uma cópia
  física de produção passaria na guarda; aplicar nela seria inofensivo (mesma correção).
- Os E2E rodam no modo PostgreSQL local, com o cliente administrativo
  emulado por `set local role service_role`. O PostgREST real do Supabase não foi exercitado
  localmente. A chamada anônima à Data API (passo A6) confirma em produção.
- 263 funções SECURITY DEFINER executáveis por `anon` (linter): fora do escopo.
  A varredura não achou outra exposição comprovada; revisão dedicada recomendada.
- Credencial temporária `validador_seq` (Neon): **revogada** com a exclusão
  autorizada das 3 branches filhas descartáveis; `homolog` intacta (plano, seção D).
- O `anon` local é NOINHERIT e o de produção é INHERIT. O teste D usa
  `WITH INHERIT TRUE` para reproduzir produção.

## 7. Gate final (12/10/2026)

| Pré-requisito | Situação | Evidência |
|---|---|---|
| Integridade do SQL | **OK**: SHA-256 `84d174bc…f03a` em disco e no remoto (`680bb35`); 0 linhas de diff em `producao/` desde `fc952dc` | este documento, seção 0 |
| Revisão final | **OK**: transação única; guarda de identidade e schema; 4 views com `security_invoker` e sem privilégio para anon/authenticated/PUBLIC; policy aberta removida; função só do dono; service_role preservado; herança verificada; nenhuma operação destrutiva além do `DROP POLICY` da policy aberta. Produção sem privilégio por coluna e sem associação de papéis; event triggers do Supabase (`pgrst_*`) benignos | `evidencias/contencao-v2/producao-metadados-12-10.md` |
| Dependência de migrations de funcionalidade | **nenhuma**: só objetos da 0075; testado sobre cópia 0075 | seção 4 |
| Identidade do projeto | **OK por metadados** (`system_identifier`, banco, ledger, inventário do catálogo); confirmação **visual** no painel fica com o operador (plano, seção 0) | `evidencias/contencao-v2/inventario-producao-12-10.txt` |
| Procedimento de execução | **OK**: `executar-contencao.sh` (hash, PGUSER fixo, confirmações, conferências em sessão somente leitura, execução transacional, verificação) e `testar-data-api.sh`; todos os caminhos de interrupção testados | `teste-local-executar-contencao.txt` |
| **Backup** | **BLOQUEADO**: plano free sem backup acessível; dump não gerado nesta sessão. Scripts prontos (`backup/gerar-dump-producao.sh`, `backup/validar-restauracao-dump.sh`); validador testado com dump simulado | `teste-local-validacao-dump.txt` |
