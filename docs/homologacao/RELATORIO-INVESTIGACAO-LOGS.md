# Investigação de possível exposição anterior — logs da produção

Projeto Supabase `bshvfsxapwwfntowdxyr` · consultas de 12/10/2026 pelo
conector (`query_logs`, somente leitura). Foram lidos **apenas metadados**:
caminho, método, status HTTP, papel do JWT, prefixo da chave pública e
contagens. Nenhum IP, usuário, corpo de requisição ou resposta foi lido.

## 1. Retenção e visibilidade

| Fonte | Disponível | Observação |
|---|---|---|
| `edge_logs` (gateway da API: REST, Auth, Storage) | **24/09/2026 em diante** | antes disso não há eventos de gateway; a janela de consulta é de 24 h por chamada |
| `postgrest_logs` | dias esparsos (22, 24, 26/09) | sem menção às views, a `units` ou à função de regras fiscais em 22/09 |
| `postgres_logs` | desde 12/09 (amostra) | só checkpoints/conexões; `SELECT` não é registrado (`log_statement` padrão) |
| Conexões diretas ao banco (pooler/porta 5432) | **não aparecem** nos `edge_logs` | quem tivesse a senha do banco não seria visto aqui |

## 2. Período vulnerável

| Exposição | Desde | Fonte |
|---|---|---|
| E1 `units_select_authenticated USING (true)` | 11/09/2026 (0009 de produção, `20260911130849`) — tabela global até a `0006b` torná-la por empresa | ledger + `prod-history` |
| E2 views com `anon` | desde a criação das views (0035/0043/0047, aplicadas em produção em set/2026) | ledger |
| E3 regras fiscais | desde a 0038 | ledger |
| Situação em 12/10 | **as três continuam ativas** | catálogo |

## 3. Resultado (24/09 – 11/10, todos os dias com `edge_logs`)

Filtro: requisições `/rest/v1/` às 4 views, a `/rest/v1/units`, a
`/rest/v1/rpc/fn_resolve_applicable_tax_rules`, e qualquer requisição REST
sem JWT ou com papel `anon`.

| Dia | Views (papel) | `units` | RPC regras fiscais | REST sem JWT / anon |
|---|---|---|---|---|
| 24/09 – 25/09 | 0 fora do app | 0 | 0 | não conferido (só o filtro de recursos sensíveis) |
| 26/09 – 28/09 | — | — | — | — |
| 29/09 | — | — | — | 7 × `rpc/fn_get_invitation` (200) |
| 30/09 | — | — | — | 2 × `rpc/fn_get_invitation` |
| 01/10 | — | — | — | 2 × `rpc/fn_get_invitation` |
| 02/10 – 08/10 | — | — | — | — (04/10 sem tráfego de API) |
| 09/10 | **2 × service_role (200)** — o próprio app | — | — | 4 × `rpc/fn_get_invitation` |
| 10/10 | — | — | — | 1 × `rpc/fn_get_invitation` |
| 11/10 | — (sem tráfego de API) | — | — | — |

`fn_get_invitation` é o fluxo público de aceite de convite (esperado).
Usuários autenticados fazem chamadas REST diretas (≈1,4 mil em 09/10), mas
**nenhuma** a `units`, às views ou à função de regras fiscais.

**Linter de segurança do Supabase** (consultado em 12/10): `security_definer_view`
(**ERROR**) nas mesmas 4 views; 263 funções SECURITY DEFINER executáveis por
`anon` (WARN); `auth_leaked_password_protection` desligado (WARN).

## 4. Conclusão

- **No período coberto pelos logs de gateway (24/09 – 11/10)** não há
  registro de acesso anônimo ou de usuário às views financeiras, a `units`
  ou à função de regras fiscais. As views foram lidas apenas pelo app
  (`service_role`).
- **Isso não prova ausência de exploração**:
  - de 11/09 a 23/09 não há logs de gateway;
  - conexões diretas ao banco não passam pelo gateway;
  - `SELECT` não é registrado nos logs do Postgres;
  - a exposição continua aberta.
- Nenhuma notificação externa foi feita.

## 5. Como o administrador pode verificar pelo painel

1. Supabase → **Logs → API Gateway** (`edge_logs`): filtrar `request.path`
   por `v_cash_flow`, `inventory_valuation`, `v_sales_order_item_margin`,
   `/rest/v1/units`, `fn_resolve_applicable_tax_rules`; agrupar por
   `request.sb.jwt.authorization.payload.role`.
2. Supabase → **Advisors → Security**: confirmar que `security_definer_view`
   some depois da contenção.
3. Retenção maior exige plano com retenção estendida ou exportação de logs;
   recomenda-se habilitar `pgaudit`/log de statements para tabelas sensíveis
   se for necessário auditar acesso direto.
