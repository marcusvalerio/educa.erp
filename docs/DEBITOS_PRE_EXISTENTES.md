# Débitos pré-existentes de produção (fora da migração)

Problemas que **já existem no Supabase de produção**, encontrados ao testar a
migração. **Nenhum foi corrigido** nesta branch. O E2E os trata como "linha de base"
(verifica que o Neon se comporta igual à produção). Cada um deve virar uma tarefa
própria, com teste, depois do cutover ou antes, mas sem misturar com a troca de
banco.

Legenda de prova: **SQL** = conferido por leitura no Supabase de produção;
**E2E** = reproduzido pelo app contra o esquema de produção (local e/ou Neon).

| # | Débito | Efeito para o usuário | Prova | Correção sugerida |
|---|---|---|---|---|
| 1 | Sem permissões `product_categories.*` e `units.*` no catálogo | criar/editar categoria e unidade → 403 para todos | SQL + E2E | seed das permissões + papéis |
| 2 | `POST /api/warehouse-locations` não envia `warehouse_id` (NOT NULL) | criar endereço de depósito falha | E2E | mapear `armazem` → `warehouse_id` no mapper |
| 3 | Vírgula/parênteses na busca entram crus no `.or()` de `table.ts` | busca com vírgula → 500 genérico | E2E | escapar/aspas no termo do `.or()` |
| 4 | `fn_convert_lead_to_opportunity` grava `audit_logs.action = 'INSERT'`, fora do CHECK (`CREATE`, …) | converter lead em oportunidade **sempre** falha (500) | SQL (definição idêntica, md5 `6d282313…`) + E2E | trocar para `'CREATE'` |
| 5 | `fn_start_workflow` declara `v_step record` e passa para `fn_materialize_workflow_instance_step(p_step workflow_steps)` | **nenhuma** instância de workflow/aprovação inicia (500) | SQL (`v_step record;` em produção) + E2E | declarar `v_step public.workflow_steps` |
| 6 | API de produtos não expõe `production_type` e não preenche `unit_id` (só o texto `unit`) | produto criado pelo app nunca vira "fabricado" e a BOM recusa a unidade: **ordem de produção impossível pelo app** | E2E | expor `production_type`; preencher `unit_id` a partir de `unit` |
| 7 | Papel `leitura` de empresa nova recebe 18 permissões (`*.read` do cadastro antigo); o `leitura` da ASTRA tem 104 (86 `*.view`) | em empresa nova, "leitura" não lê Financeiro, Fiscal, Produção, CRM, Qualidade, Projetos, Workflow nem Importação (403) | SQL + E2E | alinhar `fn_seed_default_roles_for_company` com o conjunto da ASTRA |
| 8 | Não há troca de senha com o usuário logado (só recuperação por e-mail) | usuário precisa usar "Esqueci a senha" para trocar | código (rotas `api/auth/*`) | tela + rota de troca (Neon Auth `change-password`) |
| 9 | 10 `public.users` sem `auth_user_id` e `user_roles` vazio | só o Owner entra hoje | SQL | convites + atribuição de papéis (runbook passo 22) |
| 10 | Owner com `emailVerified=false` no Neon Auth de produção | login recusado até o primeiro acesso/recuperação | SQL (`neon_auth.user`) | recuperação no smoke (runbook passo 18) |
| 11 | Neon Auth de produção: `email_password.enabled=false` e `allow_sign_up=true` | login por senha desligado; cadastro público aberto se ligarem o método | config | runbook passo 3 |
| 12 | 7 funções em produção sem as linhas de comentário do repositório | nenhum (cosmético) | SQL (md5 bate após remover comentários) | nenhum; registrar |
| 13 | Migrations do repositório não reconstroem produção (0057–0060 e pontes) | quem recriar do repo tem banco diferente | Fase A | usar o plano da POC como fonte ou corrigir as migrations |
