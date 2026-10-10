# Relatório — correções do CRM e dos painéis (ATLAS.ERP)

Branch **`claude/atlas-neon-ux-crm`** · 10/10/2026 · nada em `main`, nada em produção, nada no Neon remoto.

> **Tudo o que está aqui foi comprovado LOCALMENTE.**
> - **Banco:** PostgreSQL 16 descartável, reconstruído do zero pelo plano equivalente à produção (`poc/neon-full/plan-prod-equivalente.txt`, 93 itens) **+ as migrations novas 0089 e 0090**.
> - **App:** compilado (`next build` + `next start`), com o dublê do Neon Auth (`DATA_BACKEND=postgres`, `AUTH_PROVIDER=neon`).
> - **Empresas:** fictícias, criadas pelo fluxo oficial (Owner → convite → primeiro acesso por e-mail).
>
> **Nenhuma correção foi aplicada nem validada em produção ou no Neon remoto.** Os defeitos de produção continuam lá até a aplicação aprovada das migrations.

## 1. Resumo

| Item | Antes | Depois | Estado |
|---|---|---|---|
| A — lead → cliente novo | `column "legal_name" … does not exist` (sempre) | cliente criado, com nome, documento e tipo corretos | ✅ corrigido (0089) |
| B — lead → oportunidade | `audit_logs_action_check` (ação `INSERT`) | oportunidade aberta, auditoria `CREATE` | ✅ corrigido (0089); restrição **intacta** |
| C — responsável → representante | ID de **usuário** gravado na FK de **representante** → violação de FK | representante fica vazio; o responsável vai para a oportunidade (dono, que é usuário) | ✅ sem mapeamento inventado · ⚪ **decisão pendente** |
| D — integridade das conversões | duplicidade em duplo clique ou corrida, lead convertido editável, documento com máscara duplicava cliente, lead sem documento → erro técnico | trava por lead e por empresa + documento; reaproveitamento pelos dígitos; recusa clara; lead congelado (RLS) | ✅ corrigido (0089) |
| Painéis Fiscal, Estoque e Produção | `column reference … is ambiguous` em toda chamada | números conferidos um a um com dados sintéticos | ✅ corrigido (0090) |
| API × banco × permissões (CRM) | 19 de 66 verificações falhavam: erro 500 genérico, IDs de **outra empresa** aceitos, 403 que revela existência, corrida na edição | 66/66 | ✅ corrigido (API) |
| Permissões de Produtos | rotas exigem permissões que não existem no catálogo vindo da produção; `units` legível entre empresas | **não alterado**: análise A/B/C (§6) | ⚪ **decisão pendente** |
| CRM pela interface | só listas | criar, editar, converter, mudar estágio, encerrar, atividades | ✅ implementado (exceto orçamento/pedido: §7) |

**Testes:**

| Teste | Antes | Depois | Observação |
|---|---|---|---|
| Suíte completa | — | 851 testes: **842 aprovados, 0 falhas**, 7 cancelados, 2 pendentes (`todo`) | cancelados: suíte de reserva sem dado no seed (§8.3); pendentes: decisão de permissões |
| `crm-conversoes-db` | 4/20 | **20/20** | |
| `relatorios-paineis-db` | 3/9 | **9/9** | |
| `crm-funnel-db` | 9/12 | **12/12** | |
| E2E da API do CRM | 47/66 | **66/66** | |
| E2E da interface do CRM | — | **32/32** | |
| E2E dos painéis | — | **13/13** | |
| E2E geral da plataforma | — | **210/210** | |

Verificação de tipos limpa, lint sem erros (2 avisos antigos, fora dos arquivos desta fase), build OK.

## 2. Defeitos reproduzidos e causas-raiz

Reprodução: `psql` no banco descartável `crm_base` (plano sem as migrations novas), como usuário com o papel de administrador da empresa (RLS e `has_permission` normais), numa transação desfeita.

### A — `fn_convert_lead_to_customer`: coluna inexistente

**Erro (antes):**
```
ERROR:  column "legal_name" of relation "customers" does not exist
QUERY:  insert into public.customers (company_id, type, legal_name, trade_name, document, …
CONTEXT:  PL/pgSQL function fn_convert_lead_to_customer(uuid) line 27
```

**Causa:** a função (0055) usa `legal_name`, mas a coluna de `customers` se chama `name`.

**Achado adicional:** `customers.document` é **NOT NULL**. Um lead **sem** CPF/CNPJ nunca pode virar cliente, e a proposta 0076 anterior também falharia nesse caso, com erro técnico.

**Atomicidade (antes):** a transação já era atômica. Depois das falhas, nenhum cliente parcial ficou gravado e os leads continuaram `NEW`.

### B — `fn_convert_lead_to_opportunity`: ação de auditoria fora da lista

**Erro (antes):**
```
ERROR:  new row for relation "audit_logs" violates check constraint "audit_logs_action_check"
DETAIL:  Failing row contains (…, opportunities, …, INSERT, …)
```

**Causa:** a lista permitida pela restrição tem `CREATE`, não `INSERT`. As demais funções do CRM usam `CREATE` e `UPDATE`, com `actor_label = 'system'` e o `user_id` real; esse padrão foi mantido.

### C — responsável do lead × representante comercial

**Esquema:**
- `leads.responsible_user_id` → `users(id)`;
- `customers.default_sales_representative_id` → `sales_representatives(id)`;
- `sales_representatives` **não tem** coluna de usuário, e nenhum código liga usuário a representante.

**Prova (antes):** corrigindo só `legal_name`, a conversão de um lead com responsável falha em `customers_default_sales_representative_id_fkey: Key (…)=(<id do usuário>) is not present in table "sales_representatives"`.

**Decisão desta fase:** não inventar o vínculo. O representante fica vazio e o responsável continua no lead. Ele também passa à oportunidade como `owner_user_id`, campo que **é** usuário (vínculo inequívoco, mantido e testado). As opções estão no §9.

### D — integridade das duas conversões

| Situação | Antes | Depois (0089) |
|---|---|---|
| Duas conversões **simultâneas** do mesmo lead em cliente (2 conexões reais) | não testável: falhava por A | trava no lead → 1 cliente; as duas respostas trazem o mesmo cliente; 1 auditoria `CREATE` |
| Dois leads **diferentes** com o mesmo CNPJ (um com máscara, outro sem), ao mesmo tempo | o índice único só compara texto idêntico → 2 clientes com o mesmo CNPJ | trava curta por empresa + dígitos do documento (sem trava global) → **1 cliente** |
| Cliente já cadastrado com máscara e lead sem máscara | não reaproveitava (igualdade exata) | reaproveita pela comparação só dos dígitos; com **2 ou mais** clientes de mesmos dígitos, recusa e pede revisão |
| Lead sem CPF/CNPJ | erro técnico | recusa: "O lead LEAD-… não tem CPF/CNPJ. Informe o documento no lead antes de convertê-lo em cliente." |
| Repetir a conversão em cliente | — | devolve o mesmo cliente, sem novo `CREATE` |
| Duas conversões simultâneas do mesmo lead em oportunidade | não testável: falhava por B | 1 oportunidade; a outra recusada com "já tem a oportunidade OPP-… em aberto" |
| Pipeline de outra empresa, ou estágio de outro pipeline | recusado (FKs compostas existentes) | idem, com mensagem em português na API |
| Lead convertido editado ou "desconvertido" por UPDATE direto (RLS) | aceito (a policy só barrava *gravar* `CONVERTED`) | recusado; cliente também não é vinculado por edição direta |
| Usuário sem `leads.convert` / lead de outra empresa / lead inexistente | recusado | recusado (comportamento preservado) |
| Falha depois de inserir o cliente (gatilho temporário que derruba a marcação do lead) | — | **nada fica gravado**: sem cliente e lead `NEW` |
| Auditoria | — | `customers:CREATE` (quando cria) + `leads:UPDATE` (status); `opportunities:CREATE` + `leads:UPDATE` (NEW → QUALIFIED), sempre com o usuário real |

### Painéis — `fn_report_fiscal`, `fn_report_inventory`, `fn_report_production`

**Erros (antes):** `column reference "taxes_amount" / "total_value" / "produced_quantity" is ambiguous`.

**Causa:** em PL/pgSQL as colunas de saída de `RETURNS TABLE` são variáveis com o mesmo nome de colunas das tabelas lidas. As outras 5 funções de relatório respondem normalmente (controle).

### API × banco (CRM) — encontrados pelo E2E da API (`e2e-crm.mjs`)

| # | Situação | Antes | Causa |
|---|---|---|---|
| 1 | Regras de estado do banco (`P0001`) e parâmetros inválidos (`22023`) | **500** "Não foi possível concluir a operação" (9 casos: lead sem documento, oportunidade repetida, mover ou fechar encerrada, orçamento em rascunho, oportunidade sem cliente…) | `rpcError` só reconhecia três textos |
| 2 | IDs de **outra empresa** no corpo (responsável, origem, cliente, dono) | **201/200**: gravados | o cliente administrativo ignora a RLS e várias FKs são simples (só existência) |
| 3 | Ação sobre lead ou oportunidade de outra empresa | 403 "Permissão negada", que revela que o ID existe | a função do banco checa a existência antes da permissão |
| 4 | Editar lead ou oportunidade | checagem e gravação em passos separados (corrida com conversão ou fechamento) | `assertEditableStatus` + `update` sem condição |
| 5 | Mensagens com código interno | "(fn_convert_lead_to_customer)", "(status atual: WON)" | texto das funções do banco |

**Falso positivo do roteiro**, corrigido no roteiro: "pedido a partir do orçamento" esperava 201 com um orçamento **em rascunho**. Pela regra comercial existente, o pedido só nasce de orçamento **aprovado**. O sistema estava certo na recusa e errado só na mensagem (500), que entrou no item 1.

## 3. Correções implementadas

| Arquivo | O quê |
|---|---|
| `supabase/migrations/0089_crm_conversoes_de_lead.sql` | **A**, **B**, **C** (sem mapeamento) e **D**. Também: policy `leads_update`, que congela o lead convertido e impede vincular cliente fora da função |
| `supabase/migrations/0090_relatorios_sem_ambiguidade.sql` | as 3 funções com todas as colunas qualificadas pelo alias. Mesma assinatura, saída, filtros, cálculos e permissão. **Conferido mecanicamente:** o corpo é idêntico ao original, tirando a qualificação |
| `src/lib/crm/errors.ts` (novo) | classifica pelo código do PostgreSQL (`42501`→403, `P0002`→404, `22023`/`23503`→422, `P0001`→409 ou 422) e limpa a mensagem (situação em português, sem nome de função) |
| `src/lib/api/crm-handlers.ts` | mapeamento novo de erros; `assertInCompany` antes das funções (404 uniforme para outra empresa); `assertReferencesInCompany` em leads, oportunidades e atividades; edição com condição no próprio `UPDATE` |
| `src/lib/crm/forms.ts`, `src/components/crm/CrmDialogs.tsx` (novos) | formulários e diálogos do CRM (§7) |
| `src/app/app/(erp)/crm/{leads,oportunidades,atividades}/page.tsx` | ações nas telas (§7) |

**Escolhido em vez da proposta anterior** (`docs/CRM/proposta-0076-crm-conversoes.sql` e `proposta-relatorios-ambiguidade.sql`, mantidas como histórico):
- a proposta 0076 falharia com lead sem documento e não tratava duplicidade, máscara nem concorrência;
- nos painéis, qualificar as referências é explícito e não depende de diretiva de configuração.

## 4. Migrations criadas e estado de aplicação

| Migration | Aplicada em | **Não** aplicada em |
|---|---|---|
| `0089_crm_conversoes_de_lead.sql` | bancos locais descartáveis (`crm_fix`, `crm_test`, `crm_app`) | produção (Supabase), Neon remoto |
| `0090_relatorios_sem_ambiguidade.sql` | idem | idem |

- **Reprodutibilidade:** banco reconstruído do zero (plano + 0089 + 0090) → `OK 95/95`, em todas as reconstruções desta fase.
- **Plano do Neon** (`plan-prod-equivalente.txt`) **não foi alterado**: ele continua equivalente à produção. As novas entram nele só depois da sua aprovação.
- **Cutover:** nenhum arquivo de `poc/neon-full/migrate`, `poc/neon-full/sql`, `scripts/` ou `src/lib/database/pg` foi alterado.

**⚠ Numeração:** a branch `claude/e2e-empresa-nova-correcoes` (rodada dos 48 usuários, não integrada) já usa **0076 a 0088**. Por isso as novas são 0089 e 0090, o que deixa um intervalo nesta branch e evita colisão de nomes. A ordem de aplicação entre as duas branches precisa ser decidida antes de integrar (§9).

**Antes de aplicar na produção:**

```sql
-- clientes com o mesmo CPF/CNPJ só por formatação (a 0089 recusa a conversão nesse caso)
select company_id, regexp_replace(document, '\D', '', 'g') digitos, array_agg(code)
from customers group by 1, 2 having count(*) > 1;
-- leads convertidos que alguém "desconverteu" por edição direta
select id, code, status, converted_customer_id from leads where converted_customer_id is not null and status <> 'CONVERTED';
```

## 5. Resultados dos testes

### 5.1 Comparação antes × depois (mesmo teste, banco sem e com as migrations)

| Teste | Sem 0089/0090 | Com 0089/0090 |
|---|---|---|
| `tests/crm-conversoes-db.test.ts`: 20 casos, **2 conexões reais** nas corridas | 4 aprovados, 16 falhas | **20/20** |
| `tests/crm-funnel-db.test.ts`: os 3 `todo` viraram testes | 9 aprovados, 3 falhas | **12/12** |
| `tests/relatorios-paineis-db.test.ts`: valores calculados à mão | 3 aprovados, 6 falhas | **9/9** |

Os 4 casos que já passavam antes são as proteções existentes: pipeline de outra empresa, sem permissão, outra empresa e lead inexistente. Nos painéis, os 3 que já passavam eram permissão, isolamento e tipos.

**Valores dos painéis conferidos** (empresa A, outubro). As colunas da 4ª à 6ª mudam de painel para painel:

| Painel | Documentos/ordens | Entradas · saídas · autorizados | Rejeitados · cancelados · pendentes | Valores |
|---|---|---|---|---|
| Fiscal | 8 documentos | 1 · 7 · 3 | 2 · 1 · 2 | impostos **R$ 160,00** (só dos autorizados; o rejeitado de R$ 999 não soma) |
| Estoque | — | — | — | **20 un. / R$ 74,00** (custo nulo vale 0; saldo zerado fica fora); 2 entradas, 1 saída, 2 transferências, 1 ajuste; 2 reservas ativas; 2 produtos sem saída |
| Produção | 5 ordens | — | — | 2 abertas, 1 em andamento, 1 concluída, 1 cancelada; **11 produzidas**; **R$ 175,40** de material; **1,75** de refugo |

**Cobertura adicional dos painéis:**
- **Outra empresa:** a empresa B tem valores altos, que não aparecem em A.
- **Empresa sem dados:** zeros, sem erro.
- **Setembro:** 1 autorizado, R$ 77.
- **Período invertido:** zeros.
- **Vendedor:** recusado nos três painéis.
- **Retorno:** tipos e nomes de saída inalterados.

### 5.2 E2E com sessões reais (app compilado + dublê do Neon Auth)

| Roteiro | Resultado |
|---|---|
| `e2e-crm.mjs` (API do CRM: leads, oportunidades encerradas, orçamento/pedido, permissões, isolamento, corridas HTTP) | antes da correção da API **47/66** → depois **66/66** (repetido em ambiente recriado) |
| `e2e-crm-ui.mjs` (interface: Vendedor, Admin, Somente leitura, celular 390 px) | **32/32** |
| `e2e-paineis.mjs` (API dos painéis = função do banco para o mesmo usuário; telas sem erro; Vendedor 403; Produtos U-01) | **13/13** |
| `e2e-postgres.mjs` (E2E geral da plataforma, rodada anterior) | **210/210** |

Sobre o E2E geral: a 1ª execução deu 209/210. A divergência era a verificação "linha de base (bug de produção)", que **exigia** a falha da conversão lead → oportunidade. Ela passou a seguir o esquema em execução: sem a 0089, continua exigindo a falha de produção; com a 0089, exige 201 e `CREATE`. Não foi removida.

### 5.3 Suíte completa (`npm test`, banco recriado do zero com 0089 + 0090)

| | |
|---|---|
| Testes | **851** |
| Aprovados | **842** |
| Falhas | **0** |
| Cancelados | **7**: suíte de reserva, ver §8.3 |
| Pendentes (`todo`) | **2**: permissões de produtos, aguardando decisão (§6) |
| Ignorados | 0 |

Novos nesta fase: 48 (20 + 9 + 7 + 8 + 4), mais 3 `todo` que viraram testes. Os unitários (`crm-errors`, `crm-forms`) **não usam mocks de banco**. Toda comprovação de integração é com PostgreSQL ou HTTP reais.

## 6. Permissões da tela de Produtos — análise (NÃO alterado)

> **Atualização (missão de segurança multiempresa, 10/10/2026):** resolvido pela
> migration `0091` e pelo novo mapa `src/lib/api/entity-permissions.ts` (modelo
> da opção C, auditado). Ver `RELATORIO-PERMISSOES-PRODUTOS.md` e
> `RELATORIO-SEGURANCA-MULTIEMPRESA.md`. O texto abaixo registra o estado
> anterior.

**O que existe hoje:**

| Camada | Exige / tem |
|---|---|
| Rotas (`src/lib/api/handlers.ts`) | `units.read`, `unit_conversions.read`, `product_categories.read`, `product_brands.read` (e `.create/.update/.delete`) |
| Policies de RLS dessas tabelas | os mesmos códigos |
| `0005_rbac.sql` **do repositório** | cria esses códigos |
| `0005` **aplicada em produção** (`poc/neon-full/sql/prod-history/…_0005.sql`, a que o plano usa) | **não cria nenhum** deles; cria `categories.*` e `brands.*` (módulo `catalog`) |
| Papéis de sistema (0075) | recebem `categories.read` e `brands.read`, que **nenhuma rota usa** |

Resultado: nenhum papel consegue as permissões exigidas, e a tela de Produtos só funciona pela melhoria anterior (`CadastroPage` não bloqueia por lista auxiliar). Essa melhoria foi preservada e conferida no navegador: a lista carrega e aparece o aviso "Algumas informações complementares não foram carregadas".

**Achado de isolamento (registrado, não corrigido):** `units_select_authenticated … USING (true)`, vinda da produção, deixa qualquer usuário autenticado ler as unidades de **outras empresas**.
- **Medido:** o usuário Somente leitura da Gama vê as **10** unidades da Delta, e 0 clientes da Delta (controle).
- **Sensibilidade:** baixa (UN, KG…).
- **Por que não corrigi:** hoje essa policy é o **único** caminho de leitura de unidades pela RLS. Removê-la sem decidir o modelo deixaria ninguém ler unidades.

| | Opção A — permissões específicas | Opção B — usar `products.*` | Opção C — híbrida (catálogo existente + unidades) |
|---|---|---|---|
| O que é | criar `units.*`, `unit_conversions.*`, `product_categories.*` e `product_brands.*` no catálogo e conceder aos papéis | auxiliares de produto exigem `products.read` (ler) e `products.create/update` (gravar) | categorias e marcas usam `categories.*`/`brands.*` (já existem e já estão concedidas); unidades e conversões ganham `units.*`/`unit_conversions.*` no módulo `catalog`, concedidas a quem já tem a mesma ação em `categories.*` |
| Menor privilégio | **máximo**: separa quem cadastra unidades de quem cadastra produtos | menor: quem edita produto passa a editar unidades e conversões da empresa toda (afetam todos os produtos) | alto: segue o desenho do catálogo da produção |
| Administradores | mais caixas na matriz de papéis e risco de esquecer de conceder; papéis personalizados precisam ser revistos | nada a configurar | quase nada: o que já tem `categories.*` recebe o resto |
| Manutenção | catálogo coerente com a 0005 do repositório; diverge da história da produção | menos códigos; perde a granularidade que a 0005 previa | alinha repositório e produção; já implementado e testado na branch `claude/e2e-empresa-nova-correcoes` (migration 0076, junto com a remoção da policy `USING (true)`) |
| Isolamento de `units` | precisa remover `units_select_authenticated` junto | idem | a 0076 da outra branch já faz isso |

**Preparado e independente da decisão:** `tests/permissoes-produtos-db.test.ts`.
- 2 testes **aprovados**: o estado atual está documentado.
- 2 **`todo`**: "todas as permissões exigidas existem no catálogo" e "unidades não são legíveis por outra empresa". Eles viram aprovados quando a opção for aplicada.

## 7. Estado da interface operacional do CRM

**Mapeamento de ações:**

| Ação | API | Interface (esta fase) | Observação |
|---|---|---|---|
| Criar lead | `POST /api/leads` | ✅ "Novo lead" | |
| Editar lead | `PATCH /api/leads/:id` | ✅ "Editar" | não aparece em lead convertido |
| Ver detalhes | `GET` | ✅ painel (contato, comercial, cliente gerado, atividades, histórico) | o histórico exige a permissão de auditoria |
| Converter em cliente | `POST …/convert-to-customer` | ✅ com confirmação (explica o reaproveitamento por CPF/CNPJ) | |
| Converter em oportunidade | `POST …/convert-to-opportunity` | ✅ diálogo (pipeline, estágio, título, valor) | |
| Criar e editar oportunidade | `POST/PATCH /api/opportunities` | ✅ "Editar" só em aberta | o estágio não é editado no formulário |
| Mudar estágio | `POST …/move-stage` | ✅ "Mudar estágio" (e o Pipeline já existente) | |
| Encerrar (ganha/perdida) | `POST …/close` | ✅ com motivo da perda | só para quem tem `opportunities.close` (o Vendedor não tem) |
| Registrar atividade | `POST /api/activities` | ✅ a partir do lead, da oportunidade ou da tela Atividades | |
| Concluir ou cancelar atividade | `PATCH /api/activities/:id` | ✅ | |
| Consultar histórico | `audit_logs` | ✅ painel existente | |
| Associar responsável | `responsibleUserId` / `ownerUserId` | ✅ **só para quem pode listar usuários** (`users.read`) | o Vendedor não vê o campo; ver §9 |
| Pesquisar e filtrar | listas existentes | ✅ (inalterado) | |
| Orçamento ou pedido a partir da oportunidade | `POST …/convert-to-quote` / `…/convert-to-order` | ❌ **sem botão** | API corrigida e testada (66/66); falta um editor de itens, que não existe em nenhuma tela do ATLAS (nem em Comercial → Orçamentos). Proposta no §10 |
| Configurar pipelines, estágios e origens | APIs existem | ❌ não feito | fora do escopo; precisa de tela própria |

**Comportamento comum a todas as ações:**
- Cada ação só aparece com a permissão.
- As listas auxiliares (origens, usuários, clientes, pipelines) só são lidas por quem pode lê-las: **0 chamadas com 403/500** feitas pelas telas, para Vendedor e Admin.
- O botão fica bloqueado durante o envio: duplo clique em "Criar lead" grava **1** lead.
- A validação espelha os schemas Zod (o servidor continua sendo a autoridade).
- Erros chegam em português, vindos do servidor.
- A lista e o painel se atualizam após a ação.
- Os estados vazios e o "acesso restrito" já existentes foram mantidos.
- No celular (390 px) não há rolagem horizontal e o diálogo cabe na tela.

Capturas: `docs/homologacao/evidencias/crm-correcoes/telas/`.

**Observação:** o papel de sistema **Somente leitura** (0075) **não tem nenhuma permissão do CRM**, nem `leads.view`. A tela mostra "acesso restrito". Não alterei os papéis (§9).

## 8. Regressões, pendências e limitações

1. **Regressões:** nenhuma encontrada.
   - Suíte completa sem falhas.
   - E2E geral 210/210.
   - A única verificação antiga que mudou de resultado documentava o defeito corrigido (§5.2) e passou a seguir o esquema.
2. **Orçamento e pedido pela interface:** pendente (§7).
3. **Suíte de reserva (`tests/sales-order-reservation-db.test.ts`):** 7 testes **cancelados**, não aprovados.
   - **Causa comprovada:** o teste procura um local de estoque da empresa base "do seed fictício", e o seed do plano cria clientes, mas **nenhum** local.
   - **Contraprova:** é igual **sem** as migrations novas; e numa cópia descartável com **1** local fictício, a suíte passa **7/7**.
   - **Natureza:** dependência de dado do ambiente, anterior a esta fase. O teste **não foi alterado**.
   - **Sugestão:** o teste criar o próprio depósito e local, como os testes novos fazem.
4. **Limpar o responsável:** o formulário de edição não "esvazia" o responsável (a API trata vazio como "não alterar"). Comportamento pré-existente da API.
5. **Lead convertido depois da oportunidade:** a oportunidade não recebe o cliente sozinha. Pré-existente; decisão no §9.
6. **Mensagens de permissão** ainda mostram o código ("Permissão negada (leads.convert)") — U-13, aberto.
7. **Faixa "Homologação · dados fictícios"** sobrepõe o rodapé dos diálogos no celular. Ela só existe em homologação e não captura cliques.

## 9. Decisões de negócio necessárias

| # | Questão | Situação atual (não decidida por mim) |
|---|---|---|
| 1 | **Representante de vendas do cliente criado por lead** (defeito C): deixar vazio, casar usuário ↔ representante pelo e-mail, criar a coluna `user_id` em `sales_representatives`, ou escolher na conversão | fica vazio |
| 2 | **Permissões de Produtos:** opção A, B ou C (§6), e a remoção de `units_select_authenticated` | não alterado |
| 3 | **Converter lead Desqualificado** em cliente ou oportunidade: permitir? | permitido (como já era) |
| 4 | **Mais de uma oportunidade aberta** para o mesmo lead | a conversão recusa a 2ª; a criação direta (`POST /api/opportunities` com `leadId`) continua permitindo |
| 5 | **Atribuição automática do responsável** (ex.: quem cria o lead) e acesso do Vendedor à lista de usuários | não atribui; o Vendedor não vê o campo |
| 6 | **Somente leitura sem CRM** | mantido |
| 7 | **Nome fantasia do cliente criado por lead:** hoje recebe o nome do contato (`leads.name`), regra herdada da 0055 | mantido |
| 8 | **Oportunidade encerrada** pode gerar orçamento ou pedido? Hoje a API permite | mantido |
| 9 | **Ordem das migrations** entre esta branch (0089/0090) e `claude/e2e-empresa-nova-correcoes` (0076–0088), antes de integrar | numeração sem colisão; ordem a decidir |

## 10. Riscos residuais e próximos passos

**Riscos:**
- **Produção continua com os defeitos A, B e dos painéis** até aplicar 0089/0090 (Supabase e Neon), depois das consultas do §4.
- **Duplicidades por formatação:** se existirem clientes com o mesmo CPF/CNPJ só por formatação, a conversão desses leads passa a ser recusada (com mensagem) até alguém revisar os cadastros.
- **Vazamento de unidades entre empresas** (§6), enquanto a decisão de permissões não sai.
- **Volume:** o reaproveitamento por dígitos compara `regexp_replace(document)` sem índice, o que é aceitável para o volume de clientes por empresa. Com dezenas de milhares de clientes, considerar um índice de expressão.

**Próximos passos sugeridos:**
1. Decidir os itens do §9 (principalmente 1, 2 e 9).
2. Aplicar 0089 e 0090 em homologação real e repetir `e2e-crm.mjs`, `e2e-paineis.mjs` e o E2E geral lá.
3. Editor de itens reutilizável, para Orçamentos e para "Converter em orçamento/pedido".
4. Telas de configuração de pipelines, estágios e origens.

## 11. Como reproduzir as validações

Segredos só em arquivos locais fora do Git: `secrets.env` do dublê, `.env.local` e o estado do E2E.

```bash
# 1) bancos descartáveis: sem e com as migrations novas
bash poc/neon-full/build-local.sh crm_base poc/neon-full/plan-prod-equivalente.txt
(cat poc/neon-full/plan-prod-equivalente.txt; ls supabase/migrations/0089_*.sql supabase/migrations/0090_*.sql) > /tmp/plan-fix.txt
bash poc/neon-full/build-local.sh crm_fix /tmp/plan-fix.txt          # → OK 95/95

# 2) antes × depois no banco
for db in crm_base crm_fix; do
  POC_DATABASE_OWNER_URL=postgres://postgres@127.0.0.1:55440/$db node --import tsx --test \
    tests/crm-conversoes-db.test.ts tests/crm-funnel-db.test.ts tests/relatorios-paineis-db.test.ts tests/permissoes-produtos-db.test.ts
done

# 3) suíte completa (banco recriado do zero com as migrations)
POC_DATABASE_OWNER_URL=postgres://postgres@127.0.0.1:55440/crm_fix npm test

# 4) E2E: app compilado + dublê (ver poc/neon-full/README.md), depois
CRM_STATE=/fora/do/git/crm.json APP=http://localhost:3300 PGDB=crm_app OWNER_EMAIL=… node poc/neon-full/e2e/e2e-crm-setup.mjs
CRM_STATE=/fora/do/git/crm.json PGDB=crm_app node poc/neon-full/e2e/e2e-crm.mjs
CRM_STATE=/fora/do/git/crm.json PGDB=crm_app node poc/neon-full/e2e/e2e-crm-ui.mjs
CRM_STATE=/fora/do/git/crm.json PGDB=crm_app node poc/neon-full/e2e/e2e-paineis.mjs
```

Evidências desta fase: `docs/homologacao/evidencias/crm-correcoes/`
- `e2e-crm-api-antes.json` e `e2e-crm-api-depois.json`;
- `e2e-crm-ui.json`;
- `e2e-paineis.json`;
- `e2e-geral-postgres.txt`;
- `telas/`.
