# Avaliação de UX/UI — ATLAS.ERP (10/10/2026)

Branch `claude/atlas-neon-ux-crm`. Avaliação de uso real, feita no app
**compilado** (`next build` + `next start`) em modo destino (`AUTH_PROVIDER=neon`,
`DATA_BACKEND=postgres`), com banco reconstruído pelo plano equivalente à
produção e dados criados pelas APIs oficiais (empresas fictícias "Alfa Neon" e
"Beta Neon", leads e oportunidades fictícios).

## 1. Como foi avaliado (e o que não foi)

| Escopo | Como | Perfis |
|---|---|---|
| 102 rotas da navegação (`src/lib/nav.ts`) | Chromium (Playwright), 1440×900: status, erro na tela, erros de console, estouro horizontal, textos em inglês, botões e campos sem rótulo acessível, alvos de toque, tempo de carga; captura de cada tela | administrador de empresa |
| 12 telas operacionais principais | mesmo roteiro em 390×844 (celular) | administrador de empresa |
| Login, senha errada, recuperação, link expirado, convite inválido, `/acesso` | 1280×800 e 390×844, com captura | sem sessão |
| Correções | reverificadas no navegador depois do build | administrador e leitura |

Vistas de fato (capturas analisadas uma a uma): login (celular), Leads (desktop
e celular), Produtos (antes e depois), Painel fiscal, Papéis (celular). As
demais telas foram avaliadas pelas medições automáticas acima.

**Não avaliado:** telas da plataforma pelo perfil Owner (abrem, mas não foram
revisadas como Owner); fluxo visual completo do convite pelo diálogo de
"Convidar usuário"; leitores de tela reais; o app de produção (Vercel não é
alcançável desta sessão). Não houve teste com pessoas.

### O que já funciona bem (manter)

- Linguagem visual consistente: mesma estrutura de página (rótulo do módulo,
  título, descrição, ações), trilha de navegação, barra lateral agrupada
  (Visão geral / Operação / Gestão / Cadastros) e busca global (`Ctrl K`).
- Tabelas com abas de visão rápida, busca, filtro, paginação, colunas
  configuráveis e exportação; no celular viram cartões, sem estouro horizontal
  nas 12 telas medidas.
- Acessibilidade básica: **0** botões sem rótulo e **0** campos sem rótulo nas
  102 telas.
- Estados de carregamento (esqueleto), vazio e erro presentes e em português.
- Telas de acesso claras: erro de senha não revela se o e-mail existe; link
  expirado e convite inválido explicam o que fazer e oferecem saída.

## 2. Problemas, por prioridade

Legenda do estado: **Corrigido e verificado** · **Proposta pronta** (precisa de
decisão) · **Aberto**.

### Crítica

**U-01 — Produtos: a lista inteira some para qualquer usuário de empresa**
- *Tela:* Cadastros → Produtos.
- *Situação:* "Não foi possível carregar os dados — Você não tem permissão para
  esta operação (units.read)". A tela carrega listas auxiliares (fornecedores,
  categorias, marcas, unidades) antes da lista; `/api/units`,
  `/api/product-categories` e `/api/product-brands` exigem permissões
  (`units.read`, `product_categories.read`, `product_brands.read`) que **não
  existem no catálogo de permissões** — nem no banco local nem na produção
  (consultado em 10/10). Nenhum papel consegue tê-las.
- *Impacto:* o cadastro de produtos — base de estoque, compras e vendas — fica
  inacessível. A mensagem expõe um código técnico.
- *Correção realizada:* `CadastroPage` passa a bloquear só pela falha da própria
  entidade; falhas de listas auxiliares viram aviso ("Algumas informações
  complementares não foram carregadas…"). Vale para todos os cadastros com
  dependências.
- *Validação:* navegador, antes (tela de erro) e depois (2 produtos listados +
  aviso).
- *Pendência:* causa-raiz. Decidir entre criar as permissões no catálogo (e
  concedê-las aos papéis de sistema) ou fazer a API usar `products.read` para
  esses auxiliares. É regra de RBAC: **não alterado**.
- *Estado:* **Corrigido e verificado** (sintoma) · causa-raiz **Aberta**.

**U-02 — Painéis Fiscal, Estoque e Produção sempre em erro**
- *Telas:* Painéis → Fiscal / Estoque / Produção; resumos de `/app/fiscal` e
  `/app/producao`.
- *Situação:* "Não foi possível carregar o relatório… Tente novamente". O banco
  responde `column reference "taxes_amount" / "total_value" /
  "produced_quantity" is ambiguous` em `fn_report_fiscal`,
  `fn_report_inventory` e `fn_report_production`. As três têm o mesmo corpo em
  produção.
- *Impacto:* três painéis de gestão inutilizáveis; o botão "Tentar novamente"
  sugere falha passageira e nunca resolve.
- *Melhoria:* diretiva `#variable_conflict use_column` nas três funções (mesma
  lógica). [`proposta-relatorios-ambiguidade.sql`](proposta-relatorios-ambiguidade.sql).
- *Validação:* cópia descartável do banco — as três falham antes e respondem
  depois.
- *Estado:* **Proposta pronta** (migration a aplicar no Supabase e no Neon).

### Alta

**U-03 — CRM não tem como ser operado pela interface**
- *Telas:* CRM → Leads, Oportunidades, Atividades, Pipeline.
- *Situação:* Leads, Oportunidades e Atividades são listas **só de consulta**:
  não há "Novo lead", converter, registrar atividade nem editar. O Pipeline só
  move a oportunidade entre estágios. Tudo isso existe na API.
- *Impacto:* o usuário entende que o CRM existe, mas não consegue cadastrar o
  primeiro lead. Coerente com a produção: **0 leads e 0 oportunidades**.
- *Melhoria:* formulários de lead/oportunidade/atividade e ações de conversão,
  reutilizando o padrão de `CadastroPage`/`EntityDrawer`. É desenvolvimento de
  funcionalidade, não ajuste de baixo risco — **não feito**.
- *Estado:* **Aberto** (detalhes em [`../CRM/FLUXO-DE-DADOS-CRM.md`](../CRM/FLUXO-DE-DADOS-CRM.md)).

**U-04 — Converter lead dá erro genérico**
- *Fluxo:* lead → cliente (documento ainda sem cliente) e lead → oportunidade
  (API).
- *Situação:* HTTP 500 "Não foi possível concluir a operação. Tente
  novamente." — sempre. Causas no banco: coluna inexistente
  `customers.legal_name` e ação de auditoria `INSERT` fora do permitido.
- *Impacto:* a passagem do lead para o comercial não funciona; a mensagem não
  ajuda.
- *Melhoria:* [`../CRM/proposta-0076-crm-conversoes.sql`](../CRM/proposta-0076-crm-conversoes.sql).
- *Validação:* `tests/crm-funnel-db.test.ts` — 3 `todo` passam com a proposta.
- *Estado:* **Proposta pronta**.

**U-05 — Convites e recuperação de senha não chegam (produção)**
- *Fluxo:* convite de usuário, "Esqueci minha senha".
- *Situação:* nos logs de produção das últimas 24 h, 7 convites recusados com
  `429: email rate limit exceeded` (SMTP padrão do Supabase). A tela de
  recuperação diz "você receberá em instantes um link" — mensagem correta por
  segurança (não revela contas), mas sem e-mail de fato.
- *Impacto:* primeiro acesso e recuperação dependem do administrador copiar e
  enviar o link manualmente (o app já oferece isso no convite).
- *Melhoria:* SMTP próprio com domínio verificado no provedor de auth
  ([`PREPARACAO-NEON-ETAPA-1.md`](PREPARACAO-NEON-ETAPA-1.md) §4).
- *Estado:* **Aberto** — depende de configuração externa.

### Média

**U-06 — Códigos internos em inglês no CRM**
- *Telas:* Leads (qualificação `HOT`/`WARM`/`COLD`), Atividades (`CALL`,
  `MEETING`…, `lead`/`opportunity`).
- *Correção:* rótulos Quente/Morno/Frio, Ligação/Reunião/Tarefa/Contato/
  Retorno/Anotação, Lead/Oportunidade/Cliente — na tela, na ordenação, no filtro
  e no CSV (nova fábrica `labelCol`).
- *Validação:* navegador (`HOT` não aparece; Quente/Morno/Frio aparecem).
- *Estado:* **Corrigido e verificado**.

**U-07 — Auditoria mostra ações em inglês**
- *Telas:* Administração → Auditoria; Gestão → Auditoria.
- *Situação:* só 15 das 37 ações aceitas pelo banco tinham rótulo; as demais
  apareciam como "Cancel", "Approve"…
- *Correção:* rótulos para as 37 (`src/lib/status.ts`).
- *Validação:* navegador ("Cancelamento" no lugar de "Cancel").
- *Estado:* **Corrigido e verificado**.

**U-08 — Matriz de papéis com ações em inglês**
- *Tela:* Administração → Papéis e permissões.
- *Situação:* 46 ações usadas nas permissões não têm nome no catálogo e
  apareciam como "Authorize", "Calculate", "Ready", "Submit authorization".
- *Correção:* rótulo em português quando o catálogo não tem nome (o nome do
  catálogo continua com prioridade).
- *Validação:* navegador (nenhum dos termos em inglês).
- *Pendência:* preencher `permission_actions` no banco tornaria isso
  desnecessário.
- *Estado:* **Corrigido e verificado**.

**U-09 — Link de convite anterior deixa de valer após reenvio**
- *Fluxo:* convite reenviado ao mesmo e-mail.
- *Situação:* nos logs de produção, o mesmo e-mail aparece convidado várias
  vezes e há 3 cliques em links já inválidos (`403: Email link is invalid or has
  expired`), vindos da página `/convite/…`. O erro é do servidor do Supabase.
- *Impacto:* a pessoa abre o primeiro e-mail e cai num erro.
- *Melhoria:* ao reenviar, avisar o administrador de que o link anterior deixa
  de valer; na tela de link expirado, orientar a usar o e-mail mais recente.
- *Estado:* **Aberto** — causa provável, não validada de ponta a ponta.

### Baixa

**U-10 — "Entrar" desabilitado sem explicação.** Com e-mail/senha vazios o botão
fica desabilitado, sem dizer o motivo. *Melhoria:* manter habilitado e validar
no envio, ou indicar os campos obrigatórios. **Aberto.**

**U-11 — Matriz de permissões no celular.** 370 alvos de toque menores que
24 px. Uso típico é no computador. *Melhoria:* linha inteira clicável ou caixas
maiores abaixo de `md`. **Aberto.**

**U-12 — Cartões de lead no celular.** Mostram nome e data, mas não empresa nem
qualificação. **Aberto.**

**U-13 — Mensagens de permissão com código técnico.** Ex.: "Você não tem
permissão para esta operação (leads.create)". Útil para suporte, mas estranho
para quem usa. *Melhoria:* nome da ação em português e o código em detalhe.
**Aberto.**

## 3. Resumo

| Prioridade | Total | Corrigidos e verificados | Proposta pronta | Abertos |
|---|---|---|---|---|
| Crítica | 2 | 1 (sintoma) | 1 | 1 causa-raiz (U-01) |
| Alta | 3 | — | 1 | 2 |
| Média | 4 | 3 | — | 1 |
| Baixa | 4 | — | — | 4 |

Arquivos alterados: `src/components/cadastro/CadastroPage.tsx`,
`src/components/data-table/columns.tsx`, `src/app/app/(erp)/crm/leads/page.tsx`,
`src/app/app/(erp)/crm/atividades/page.tsx`, `src/app/app/admin/roles/page.tsx`,
`src/lib/status.ts`. Lint e tipos limpos; 779/779 testes sem banco.
