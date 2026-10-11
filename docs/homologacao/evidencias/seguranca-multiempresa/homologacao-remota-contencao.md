# Homologação remota da contenção — Neon (11/10/2026)

- **Projeto Neon:** `educa-erp-prod` (`old-butterfly-53570465`). Apesar do
  nome, é o alvo da futura migração, **não** a produção atual (Supabase).
- **Branch de homologação:** `homolog` (`br-icy-cell-b62lgh06`), PostgreSQL
  17.11, banco `educa`, sem ledger de migrations. Só leitura de metadados.
- **Branch usada na validação:** `valida-contencao-20261011`
  (`br-restless-bonus-b6txjb6l`), **filha descartável** da `homolog`. A
  `homolog` não foi alterada.
- **Dados:** duas empresas e dois administradores **sintéticos** (Alfa, Beta;
  domínio `validacao.test`) e uma conta-caixa por empresa (1000 / 2000). Nenhum
  dado preexistente foi lido.
- **Meio:** conector Neon (`run_sql_transaction`). Sem connection string e
  sem credencial gravada.

## Estado da `homolog` (metadados, antes de qualquer ação)

| Item | Valor |
|---|---|
| `units_select_authenticated USING (true)` | presente |
| permissões `units.*` | 0 |
| 4 views | sem `security_invoker`, `anon` com SELECT |
| FKs `*_same_company_fk` (0091) | 0 |
| 0082 (fiscal simulado) / 0089 (CRM) | ausentes |
| papel do app `educa_app` | sem `bypassrls`; membro de `service_role` (`bypassrls`) |

A homologação remota tem as **mesmas exposições** da produção.

## Contenção na branch filha

Comandos de `docs/homologacao/producao/contencao-emergencial.sql`, na mesma
ordem, numa transação. As pré-condições passaram e a verificação final não
abortou.

| Verificação | Antes | Depois |
|---|---|---|
| sem policy `USING (true)` em `units` | ✖ | ✔ |
| nenhuma view com SELECT para `anon` | ✖ | ✔ |
| todas as views com `security_invoker` | ✖ | ✔ |
| `fn_resolve_applicable_tax_rules` sem execução por `anon` | ✖ | ✔ |
| `anon` lê `v_cash_flow_summary` | **3 empresas**, inclusive o saldo sintético da Beta (soma Alfa+Beta = 3000) | `permission denied for view v_cash_flow_summary` |
| administrador da Alfa lê unidades da Beta | **10** | 0 |
| administrador da Alfa lê o caixa da Beta | **1 linha, 2000** | 0 linhas |
| administrador da Alfa lê o próprio caixa | — | 1000 (correto) |
| `service_role` (usado pelo app) lê a view | — | 2 empresas sintéticas (inalterado) |

**Efeito esperado da contenção isolada:** sem a 0091, `units.read` não existe
no catálogo. Com a policy aberta removida, nenhum usuário lê `units`
**diretamente no banco**, nem a própria empresa (Alfa: 0). O app não muda:
- lê com `service_role`;
- a rota `/api/units` do código em produção já exige `units.read`
  inexistente e responde 403 hoje.

A leitura legítima por empresa volta com a 0091.
