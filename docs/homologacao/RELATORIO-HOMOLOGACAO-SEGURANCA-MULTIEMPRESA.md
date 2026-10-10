# Homologação — segurança multiempresa, permissões de produtos e migrations

Branch `claude/atlas-neon-ux-crm` · 10/10/2026 · início `2946864`.

Relatórios de detalhe:
- `RELATORIO-SEGURANCA-MULTIEMPRESA.md`
- `RELATORIO-PERMISSOES-PRODUTOS.md`
- `RELATORIO-INTEGRACAO-MIGRATIONS.md`

Evidências: `evidencias/seguranca-multiempresa/`.

> **Toda validação foi local.** A produção não recebeu migration, dado nem
> configuração. Lá só foram feitas consultas de catálogo e contagens. **Os
> defeitos de segurança continuam ativos em produção** até a aplicação
> autorizada da 0091.

## 1. Resumo executivo

**Corrigido e comprovado localmente**

1. **Unidades entre empresas.** A policy `USING (true)` sobrou do modelo
   global de `units`, que a `0006b` converteu para por empresa sem remover
   a policy. Qualquer usuário autenticado lia as unidades e o `company_id`
   de todas as empresas. Corrigido pela 0091.
2. **Views financeiras e de estoque sem login** (achado novo, mais grave):
   4 views sem `security_invoker`, com `SELECT` para `anon`, expunham
   totais de todas as empresas. Corrigido pela 0091.
3. **Referências entre empresas no catálogo:** 18 FKs compostas por empresa.
4. **Permissões do catálogo** consistentes entre banco, API e RLS. Os 2
   TODO foram resolvidos.
5. **Achados na regressão:**
   - importar/exportar sem a permissão da entidade;
   - PATCH parcial apagava campos (zod 4);
   - categoria/marca sem código (HTTP 500);
   - itens de tabela de preço com permissão divergente da RLS.
6. **Reservas de estoque:** os 7 testes cancelados agora são executados, 7/7
   aprovados.
7. **Sequência integrada 0076–0091** validada do zero, de forma incremental,
   num banco já atualizado e em reaplicação, sem merge de branches.

**Pendente:** aplicar em produção e na homologação remota (autorização),
decisões de produto (seção 6) e integrar o código das duas linhas.

## 2. Checkpoint inicial (Fase 0)

| Item | Estado |
|---|---|
| Branch / HEAD | `claude/atlas-neon-ux-crm` @ `2946864` (= remoto); working tree limpo |
| Outras branches | `main` @ `48775f5` (+1 commit só de interface desde a base `1b61fd7`); `claude/e2e-empresa-nova-correcoes` @ `3a19fb1` (0076–0088) |
| Alterações alheias não commitadas | nenhuma |
| Migrations | 0076–0088 só na outra linha; 0089/0090 nesta. Produção: ledger até 0075 |
| Testes existentes (último resultado conhecido) | 851 (842 ok, 7 cancelados, 2 TODO) |
| Riscos iniciais | `units_select_authenticated USING (true)`; catálogo de permissões divergente; numeração em duas linhas; P3 da 0076 alterando a Somente leitura |
| Plano | corrigir por migration nova e idempotente (0091), validar a sequência integrada por script sem merge, não tocar a produção |

Uma tentativa de merge da outra linha foi feita só no working tree, para
medir conflitos: 3 arquivos de interface e a suíte integrada verde, exceto o
teste que fixava o defeito. Foi **desfeita sem commit**. Integrar o código
é uma decisão à parte.

## 3. Resultados dos testes (execução final, 10/10/2026)

| Suíte | Comando | Executados | Aprovados | Falhos | Cancelados | TODO | Ignorados | Duração |
|---|---|---|---|---|---|---|---|---|
| Unitários + integração com banco (esta linha, banco vazio) | `POC_DATABASE_OWNER_URL=…/vi_branch npm test` | 877 | 877 | 0 | 0 | 0 | 0 | 10,8 s |
| idem, sequência integrada 0076–0091 | `POC_DATABASE_OWNER_URL=…/vi_int npm test` | 877 | 877 | 0 | 0 | 0 | 0 | 10,6 s |
| Sem banco (só unitários) | `npm test` | 803 | 803 | 0 | 0 | 0 | 0 | — (os 74 de banco não rodam sem a variável) |
| RLS / isolamento (incluídos acima) | `isolamento-multiempresa-db` + `permissoes-produtos-db` | 21 | 21 | 0 | 0 | 0 | 0 | — |
| idem no banco igual ao de produção (antes) | mesmo, banco sem 0091 | 21 | 8 | **13** | 0 | 0 | 0 | prova do defeito |
| Banco da outra linha (0076–0088) | `empresa-nova-db`, `rodada2-integridade-db` | 35 | 35 | 0 | 0 | 0 | 0 | integrado e já atualizado |
| API E2E do CRM | `e2e-crm.mjs` | 66 | 66 | 0 | — | — | — | — |
| UI E2E do CRM | `e2e-crm-ui.mjs` | 32 | 32 | 0 | — | — | — | — |
| Painéis pelo app | `e2e-paineis.mjs` | 13 | 13 | 0 | — | — | — | — |
| Isolamento do catálogo pelo app (4 identidades, 2 empresas) | `e2e-catalogo-isolamento.mjs` | 37 | 37 | 0 | — | — | — | — |
| E2E geral da plataforma | `e2e-postgres.mjs` | 210 | 210 | 0 | — | — | — | — |
| Typecheck | `npx tsc --noEmit` | — | ok | 0 erros | | | | |
| Lint | `npm run lint` | — | ok | 0 erros, 2 avisos antigos (`poc/neon-full/functions/schemaapply`) | | | | |
| Build | `npm run build` | — | ok | | | | | |

Diferença em relação ao último resultado conhecido (851/842/7/2):
- +26 testes (isolamento, permissões, erro de FK, PATCH parcial, código de
  categoria/marca);
- os 7 cancelados passaram a rodar (fixture de local e cliente próprios);
- os 2 TODO viraram testes.

**Expectativas alteradas, com motivo comprovado:**
1. **`permissoes-produtos-db`:** o caso "as 4 permissões NÃO existem"
   descrevia o defeito.
2. **`catalog.test.ts` e `import-export-validations.test.ts`:** "categoria/
   marca só com nome". O banco recusa (`code` NOT NULL, demonstrado com
   `insert`).
3. **`e2e-paineis`:** o aviso de listas auxiliares recusadas era efeito do
   defeito. O script agora detecta o schema e, sem a 0091, ainda exige o
   aviso.
4. **`e2e-postgres`:** a linha de base "403 igual à produção" continua sendo
   conferida quando a 0091 não está aplicada.

Ambiente: PostgreSQL 16 local, dublê do Neon Auth, app `next start`
compilado, `DATA_BACKEND=postgres`, `AUTH_PROVIDER=neon`.

## 4. Defeitos corrigidos

| # | Defeito | Severidade | Correção |
|---|---|---|---|
| S1 | Unidades legíveis entre empresas (RLS) | alta | 0091 §1 |
| S2 | 4 views legíveis sem login, com totais de todas as empresas | **crítica** | 0091 §4 |
| S3 | Ids de outra empresa aceitos em produto, conversão e categoria | média | 0091 §3 + 422 genérico |
| S4 | Exportar sem a permissão de leitura da entidade | média | `import-export-handlers.ts` |
| P1 | Rotas e RLS exigiam permissões inexistentes (U-01) | alta (funcional) | 0091 §2 + `entity-permissions.ts` |
| P2 | Itens de tabela de preço: API × RLS divergentes | baixa | `entity-permissions.ts` |
| F1 | PATCH parcial apagava campos e reativava cadastros | alta (integridade) | `partial-update.ts` |
| F2 | Criar categoria/marca: HTTP 500 | média | esquema/mapeador com `codigo` |
| T1 | 7 testes de reserva cancelados | — | fixture coerente com o modelo |

## 5. Regressão funcional

- **CRM:** 66/66 (API) e 32/32 (UI). Cobrem:
  - criar e editar lead;
  - converter em cliente e em oportunidade;
  - atividades: criar, editar, concluir e cancelar;
  - oportunidades: criar, editar, mudar de estágio, ganhar e perder;
  - isolamento;
  - conversão repetida;
  - documento;
  - referências entre empresas.

  Mais `crm-conversoes-db` (20) e `crm-funnel-db` (12). Nenhuma regra de
  negócio do CRM foi alterada.
- **Painéis:** `relatorios-paineis-db` (9) confere à mão valores sintéticos
  conhecidos, a empresa sem dados (zeros, sem erro), o período invertido, o
  isolamento e a permissão. O E2E compara API × função do banco (13/13).
- **Módulos das migrations integradas:** suíte completa e testes da outra
  linha verdes no banco integrado (ver seção 3).

## 6. Decisões pendentes (produto ou acesso externo)

| # | Decisão | Estado atual preservado | Alternativas / recomendação |
|---|---|---|---|
| 1 | Responsável interno × representante comercial | a conversão não preenche o representante | vincular `users` ↔ `sales_representatives` (cadastro) ou escolher na conversão |
| 2 | Papéis × catálogo de produtos | matriz derivada de `categories.*` (relatório de permissões §2) | confirmar Operador (cria e edita unidades/conversões) e Vendedor (lê conversões) |
| 3 | Lead desqualificado pode ser convertido? | regra atual da 0089 | — |
| 4 | Mais de uma oportunidade por lead (criação direta) | conversão recusa se já houver aberta; a criação direta não | — |
| 5 | Atribuição automática de responsável | não há | — |
| 6 | Somente leitura com leitura do CRM? | **sem CRM** (a 0091 neutraliza o P3 da 0076) | conceder os 6 códigos `*.view` do CRM, ou manter |
| 7 | Oportunidade encerrada gera cotação/pedido? | regra atual | — |
| A | **Autorizar a correção em produção** | produção com S1 e S2 ativos | contenção imediata: só a 0091 §4 (views) e §1 (drop policy), com backup; depois a 0091 inteira na sequência |
| B | Acesso ao Neon (homologação remota) | conector não autorizado nesta sessão | autorizar para repetir a validação lá |
| C | Integrar o código das duas linhas (merge) | não feito | ver relatório de migrations §2–3 |

## 7. Situação dos ambientes

| Ambiente | O que foi comprovado | O que NÃO foi feito |
|---|---|---|
| **Local** | tudo da seção 3: banco vazio, incremental, já atualizado, idempotência, RLS, API, UI e build | — |
| **Homologação remota (Neon/Vercel)** | **nada** (sem acesso) | nenhuma migration, nenhum teste |
| **Produção (Supabase)** | por **consulta de catálogo/contagem** (só leitura): a policy `units_select_authenticated USING (true)` existe; as 4 views sem `security_invoker`, dono `postgres` com `bypassrls`, `anon` com `SELECT`; nenhum `units.*`/`unit_conversions.*` no catálogo; ledger até 0075; 0 referências entre empresas nas 18 relações | nenhuma alteração; nenhuma leitura de linhas de negócio; **a produção NÃO está corrigida** |

## 8. Riscos remanescentes e próximos passos

1. **S2 em produção (crítico, sem login):** decidir já a contenção
   (decisão A).
2. Logs da Data API do Supabase não foram auditados para saber se houve
   exploração.
3. Outros módulos com FKs de uma coluna para tabelas por empresa não foram
   revisados (o escopo foi o catálogo).
4. As 0081/0083 criam índices únicos que falham com duplicidades: conferir
   antes de aplicar em ambiente com dados.
5. **Próximo passo recomendado:**
   1. autorizar a contenção das views e da policy em produção (com backup);
   2. aplicar a sequência 0076–0091 na homologação remota e repetir
      `validar-sequencia.sh` e os E2E lá;
   3. decidir o merge de código das duas linhas.
