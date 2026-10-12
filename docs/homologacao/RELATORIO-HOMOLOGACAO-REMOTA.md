# Homologação remota — Neon (11–12/10/2026)

## 1. Ambiente identificado

| Item | Valor |
|---|---|
| Projeto | `educa-erp-prod` (`old-butterfly-53570465`), aws-sa-east-1. **Não é a produção atual** (produção = Supabase `bshvfsxapwwfntowdxyr`); é o alvo da futura migração |
| Branch de homologação | `homolog` (`br-icy-cell-b62lgh06`), PostgreSQL 17.11, banco `educa` |
| Estado da `homolog` (metadados) | objetos de 0070–0075 presentes; 0076+ ausentes; **mesmas exposições da produção** (policy aberta em `units`, 4 views com `anon`, sem `units.*`); sem ledger |
| Acesso | conector Neon desta sessão (`run_sql` / `run_sql_transaction`). **Conexão direta bloqueada**: a política de rede da organização recusa `*.neon.tech` (CONNECT 403 no proxy) — nem `psql` nem o driver HTTP |
| Branch `homolog` alterada? | **Não.** Toda mutação foi feita em branches filhas descartáveis |

Branches criadas (podem ser excluídas pelo administrador; não foram excluídas
por esta sessão):

| Branch | Id | Uso |
|---|---|---|
| `valida-contencao-20261011` | `br-restless-bonus-b6txjb6l` | contenção (seção 2) |
| `valida-sequencia-20261012` | `br-blue-king-b6mrb350` | migrations 0091–0093 (seção 3). Contém o papel `validador_seq` (sem acesso de dono; a função auxiliar usada foi removida) |

Dados: só sintéticos (empresas "Alfa/Beta … (sintética)", e-mails
`@validacao.test`). Nenhum dado preexistente foi lido.

## 2. Contenção (`contencao-emergencial.sql`)

Aplicada na branch filha com as mesmas instruções do arquivo, numa transação
(pré-condições e verificação internas não abortaram).

| Verificação | Antes | Depois |
|---|---|---|
| metadados (policy aberta / views anon / security_invoker / regras fiscais anon) | ✖ ✖ ✖ ✖ | ✔ ✔ ✔ ✔ |
| anon → `v_cash_flow_summary` | 3 empresas (inclui o saldo sintético da Beta) | `permission denied` |
| Alfa (admin) → unidades da Beta | 10 | 0 |
| Alfa (admin) → caixa da Beta | 1 linha (2000) | 0 |
| Alfa (admin) → próprio caixa | — | 1000 |
| `service_role` (app) → view | — | 2 empresas (inalterado) |

## 3. Migrations 0091, 0092, 0093 (correção definitiva)

**Como:** o conector aceita um comando por chamada e a rede bloqueia conexão
direta. Cada arquivo foi enviado uma única vez numa instrução que devolve o
`md5` do texto recebido e o executa como dono, por uma função auxiliar
criada só nessa branch e **removida** ao final.

| Arquivo | md5 local | md5 recebido no servidor |
|---|---|---|
| 0091_isolamento_catalogo_e_views.sql | `8f532df0f54759234f1f4e4b3b1618d9` | idêntico |
| 0092_margem_por_pedido.sql | `842e6b994b3e2d38378642c8291f26a9` | idêntico |
| 0093_regras_fiscais_sem_execucao_publica.sql | `3d3544fd32bea0245e85b2cefa69af92` | idêntico |

**Resultado (metadados):** policy aberta 0; FKs por empresa **18/18
validadas sobre os dados da homologação**; 4/4 views `security_invoker`; 8
códigos `units.*`/`unit_conversions.*`; regras fiscais sem execução por anon.

**Matriz de papéis (empresa sintética nova) — igual à local:**

| Papel | CRM | units.read | escrita em unidades | total |
|---|---|---|---|---|
| admin | 20 | ✔ | ✔ | 360 |
| gerente | 20 | ✔ | ✔ | 340 |
| leitura (Somente leitura) | **0** | ✔ | — | 20 |
| operador | 10 | ✔ | ✔ | 173 |
| vendedor | 15 | ✔ | — | 41 |

**RLS com identidades sintéticas:**

| Caso | Resultado |
|---|---|
| Alfa · Somente leitura lê unidades | 10 próprias; 0 da Beta; 1 empresa visível; caixa da Beta 0 |
| Alfa · admin | unidades da Beta 0; próprio saldo 1000; caixa da Beta 0; `has_permission(Beta, units.read)` = false |
| Alfa · admin insere unidade na Beta | `new row violates row-level security policy` |
| conversão Alfa → unidade da Beta (mesmo como `service_role`) | `violates foreign key constraint "unit_conversions_to_unit_id_same_company_fk"` |
| Alfa · Somente leitura insere unidade própria | `new row violates row-level security policy` |
| anon → `inventory_valuation` | `permission denied` |

## 4. O que NÃO foi validado remotamente (bloqueio real)

- **0076–0088 e 0089–0090 na homologação Neon.** Exigiria transcrever ~144 KB
  de SQL pelo conector (sem conexão direta por política de rede), com risco à
  integridade das migrations. Validadas localmente (vazio, incremental e
  sobre o banco da homologação de 48 usuários). Para executar remotamente:
  liberar a saída para `*.neon.tech` no ambiente (ou rodar
  `poc/neon-full/integracao/validar-sequencia.sh` de uma máquina com acesso)
  apontando para uma branch filha da `homolog`.
- **E2E do app contra o Neon**: mesmo bloqueio de rede.
- Supabase: não existe ambiente remoto de homologação no Supabase; a produção
  só foi lida (metadados/contagens).
