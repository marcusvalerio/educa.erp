# Plano de aplicação em produção e rollback

**Status: PRONTO PARA EXECUÇÃO, AGUARDANDO AUTORIZAÇÃO.** Nada deste plano
foi executado em produção. Cada parte exige aprovação explícita e separada.

## 0. Identificação do alvo (conferir antes de qualquer comando)

| Item | Valor esperado | Como conferir |
|---|---|---|
| Projeto Supabase | `educa.erp`, ref **`bshvfsxapwwfntowdxyr`**, região `sa-east-1` | painel do Supabase; o ref é o subdomínio de `NEXT_PUBLIC_SUPABASE_URL` da Vercel de produção (`educaerp.vercel.app`) |
| PostgreSQL | 17.6 | `select version()` |
| Ledger | 86 registros, último `20260929165645` `0075_company_roles_and_user_invites` | `select version, name from supabase_migrations.schema_migrations order by version desc limit 3` |
| Estado vulnerável | `docs/homologacao/producao/verificacao.sql` → `f t t f f f t t` | rodar antes |

Se qualquer item divergir: **parar**. Não aplicar em projeto identificado só
pelo nome.

## 1. Backup (pré-requisito das partes A e B)

- **Não verificado nesta sessão** (o conector não expõe backups). Conferir no
  painel: Database → Backups (diário/PITR, conforme o plano contratado).
- Se não houver backup recente utilizável: `supabase db dump` (schema) e
  `supabase db dump --data-only` antes da parte B, guardados fora do
  repositório. Testar a restauração do dump numa base descartável.
- Parte A só altera catálogo (policy, opções de view, grants): o rollback SQL
  é completo; o backup é salvaguarda. Parte B altera dados (0079, 0080, 0081,
  0085): backup **obrigatório**.

## A. Contenção emergencial

**Escopo:** só fecha E1, E2 e E3 (`CONTENCAO-SEGURANCA.md`). Sem deploy de
código, sem variável de ambiente, sem migração de infraestrutura.

| Passo | Ação | Esperado |
|---|---|---|
| A1 | Conferir identificação (seção 0) e backup | — |
| A2 | `verificacao.sql` (antes) | `f t t f f f t t` |
| A3 | Executar `producao/contencao-emergencial.sql` (uma transação; aborta sozinho se pré-condição ou verificação falhar) | `COMMIT` |
| A4 | `verificacao.sql` (depois) | `t t t t t t t t` |
| A5 | Fumaça no app: login; Financeiro → Fluxo de caixa; Estoque → Valorização; Controladoria → Margem; Cadastros → Produtos | telas iguais a antes (o app lê com service_role) |
| A6 | (opcional) chamada anônima à Data API: `GET /rest/v1/v_cash_flow_summary` com a chave pública | `401/permission denied` |

- **Janela:** qualquer horário; locks curtos (`lock_timeout 5s`).
- **Impacto esperado no app:** nenhum. Usuários sem `units.read` (todos, hoje)
  continuam sem ler `units` — a rota já responde 403 em produção.
- **Registro:** a contenção roda fora do ledger. Anotar data/hora e quem
  aplicou. A parte B registra 0091/0093 no ledger normalmente.

### Rollback de A

`producao/rollback-contencao.sql` — restaura exatamente o estado anterior
(policy aberta, views sem `security_invoker`, grants de `anon`, execute da
função). **Reabre as exposições**: só em quebra funcional comprovada e
enquanto a correção é preparada. Totalmente reversível (não há dados).

## B. Atualização completa (sequência integrada + código)

**Escopo:** migrations 0076 … 0093 (ordem dos nomes) e o código da branch
`claude/atlas-integracao-0076-0093`.

| Pré-condição | Situação (12/10/2026) |
|---|---|
| Duplicidades que quebrariam índices únicos da 0081/0083 (`accounts_receivable_origin_active_unique`, `pick_lists_open_per_order_unique`, `fiscal_documents_own_number_unique`) | **0** grupos duplicados em produção (contagem só leitura) |
| Referências entre empresas que deixariam FKs da 0091 `NOT VALID` | **0** nas 18 relações (contagem só leitura, 10/10) |
| Sequência validada do zero, incremental e sobre banco já atualizado | local: esquema e permissões idênticos (0 linhas de diferença) |
| 0091–0093 sobre a homologação Neon | aplicadas numa branch filha; 18/18 FKs validadas; matriz de papéis = local (`RELATORIO-HOMOLOGACAO-REMOTA.md`) |
| 0076–0088 sobre a homologação Neon | **não executado** (bloqueio de rede; ver relatório remoto) |
| Suíte com o código integrado | `npm test` 1062/1062; E2E 210 + 66 + 32 + 13 + 37, todos verdes (local) |

**Ordem de deploy (banco antes do código):**
1. Backup (seção 1) e janela de manutenção curta.
2. Parte A, se ainda não aplicada (pode ficar — idempotente).
3. Migrations 0076 → 0093 pelo mecanismo do ledger (`supabase db push` /
   ferramenta de migrations do Supabase), uma a uma, nome = arquivo sem
   `.sql`. Em erro: parar (cada arquivo é transacional).
4. Verificação: `verificacao.sql` (`t` em tudo); `select count(*) from
   pg_constraint where conname like '%same_company_fk' and convalidated` =
   18; ledger com 0076…0093.
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
2. **Autorizar B** — depois da revisão do merge `claude/atlas-integracao-0076-0093`
   e, de preferência, da aplicação de 0076–0088 na homologação remota.
3. Quem executa, quando, e quem confere a verificação pós-aplicação.
