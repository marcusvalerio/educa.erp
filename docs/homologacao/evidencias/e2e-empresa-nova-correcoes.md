# Reteste E2E da empresa nova (NOVA ORBITA): correções P1–P15

**Onde:** ensaio local, com o mesmo código e as mesmas migrations do projeto: PostgreSQL 16, dublê do Neon Auth, app `next start`. **Não** é a homologação Neon, que continua inacessível a partir deste ambiente, e **produção não foi alterada**.

**Branch:** `claude/e2e-empresa-nova-correcoes`, criada a partir de `main` @ `1b61fd7`. Nada foi mesclado em `main`.

**Como o reteste foi feito:** o E2E rodou de novo, do zero, sobre o **mesmo retrato de banco** do ensaio original (só a ASTRA e as contas funcionais), com as migrations 0076–0080 aplicadas por cima. O cenário é o mesmo:

- o Owner cria a NOVA ORBITA;
- o administrador convida Gerente, Vendedor, Operador e Somente leitura;
- o isolamento é verificado contra a ASTRA nos dois sentidos;
- o fluxo completo executado foi: pedido → estoque → financeiro → logística → fiscal → auditoria.

**Contas usadas:**
- `owner@atlaserp.test`;
- na NOVA ORBITA: `admin.novaorbita@atlaserp.test`, `gerente.novaorbita@…`, `vendedor.novaorbita@…`, `operador.novaorbita@…` e `leitura.novaorbita@…`;
- na ASTRA: `gerente@atlaserp.test`, para o teste de isolamento.

## Resultado

| | Ensaio original | Reteste |
|---|---|---|
| Verificações do E2E | **91 / 101** | **122 / 122** |
| Problemas registrados pelo roteiro | 15 | 0 |
| Testes automatizados (`npm test` com banco) | 765 | **849** (0 falhas, 0 ignorados) |

Por seção do reteste:

| Seção | Resultado |
|---|---|
| Criação da empresa | 7/7 |
| Estado inicial | 21/21 |
| Convites | 13/13 |
| Isolamento | 8/8 |
| Gerente | 8/8 |
| Vendedor | 8/8 |
| Operador | 7/7 |
| Somente leitura | 4/4 |
| Fluxo integrado | 11/11 |
| Erros | 24/24 |
| Auditoria | 11/11 |

---

## CORRIGIDO: comprovado no reteste

Critério usado: um problema só aparece aqui se o fluxo foi executado de novo e a verificação passou. Código alterado, sozinho, não conta. As capturas estão em `antes-depois/Pxx-…/` (as `antes-*` vêm do ensaio original, as `depois-*` do reteste).

| # | Problema | Causa real | Correção | Comprovação no reteste (usuário · empresa · operação) |
|---|---|---|---|---|
| P1 | Local de estoque: HTTP 500 | O formulário só gravava o texto do armazém (coluna antiga, com opções fixas do protótipo: CD01/CD02/FIL03). O `warehouse_id`, obrigatório desde a 0008, nunca era enviado. A FK também aceitava depósito de outra empresa. | **0076**: FK composta (depósito da mesma empresa) e gatilho que resolve o depósito e recusa com mensagem clara. Tela: o campo virou **Depósito**, com os depósitos reais da empresa. | Gerente · NOVA ORBITA: cria NO-A01 pela tela (201), lista e edita (200). Operador: entrada de 40 un. (201). Gerente: reserva pela tela (reservado 0→5). Operador: separação, expedição, expedir e entregar. Gerente: aprova a expedição. Estoque final: físico 35, reservado 0. |
| P2 | Cadastros → Produtos não carregava | API e RLS exigiam `product_categories.*`, `product_brands.*`, `units.*`, que nunca existiram em nenhum ambiente: a 0005 aplicada em produção é anterior a eles. O catálogo real tem `categories.*` e `brands.*`. | **0076**: policies e API alinhadas a `categories.*`/`brands.*`; fornecedores do produto seguem `products.*`; criados `units.*` e `unit_conversions.*`, concedidos a quem já tem a mesma ação em `categories.*`. | Administrador, Gerente e Operador · NOVA ORBITA: a lista carrega com NO-001. |
| P3 | Papéis padrão sem consulta | A semeadura montava Operador e Somente leitura só com as ações read/create/update e deixava de fora as 86 permissões "view". | **0076**: modelos explícitos por papel. **Somente leitura**: tudo de consulta, exceto a configuração do provedor fiscal. **Operador**: consulta + criar/editar (sem excluir, aprovar ou governança) + execução de estoque e logística. Empresa nova: Operador 258 permissões, Leitura 105. | Operador vê Estoque. Somente leitura consulta o pedido. Criar, editar e excluir pela Somente leitura: 403. Operador aprovando a expedição: 403. |
| P4 | Relatório Fiscal: erro no banco | PL/pgSQL: a coluna de saída `taxes_amount` tinha o mesmo nome da coluna somada ("column reference is ambiguous"). | **0077**: colunas qualificadas pelo alias da tabela. O mesmo defeito existia em **Estoque** e **Produção** (novo, abaixo) e foi corrigido junto. | Administrador: painel sem erro (empresa sem movimento: zeros). Gerente: 1 documento, 1 pendente depois da NF-e. |
| P5 | CNPJ da empresa não validado | Campo de texto livre. | `src/lib/documents.ts` (dígitos verificadores) no esquema usado pelo formulário e pela API. | Owner: `00.000.000/0000-00` recusado no campo, sem chegar à API. `45.723.174/0001-10` aceito. |
| P6 | CNPJ do estabelecimento não validado | Esquema só exigia preenchimento. | Criação valida os dígitos. Alteração só revalida quando o CNPJ muda. | Gerente: `00.000.000/0000-00` → 422 "CNPJ inválido: confira os dígitos verificadores." |
| P7 | CNPJ do cliente: só tamanho | O formulário contava os dígitos. | A mesma regra no formulário e na API: CPF para pessoa física, CNPJ para jurídica. Na edição, só revalida se o documento ou o tipo mudar, porque os cadastros antigos da ASTRA têm documento fictício. | Vendedor: `11.111.111/1111-11` recusado na tela e na API (422). |
| P8 | NF-e sem NCM/CFOP: 500 genérico | As regras do banco (P0001) viravam 500. A geração parava no primeiro item e podia deixar um rascunho vazio. | `errors.ts`: regras escritas para o usuário → 422, com a mensagem. **0078**: confere tudo antes de criar o rascunho e lista, por produto, NCM e/ou CFOP e onde corrigir. | Gerente · pedido PV-0003: (1) sem os dois → 422 "o produto NO-001 … precisa de NCM e CFOP. Para corrigir: …"; (2) com NCM → 422 "precisa de CFOP"; nenhum rascunho criado; (3) com CFOP → 201. |
| P9 | Sem orientação para a 1ª NF-e | Nada na tela dizia o que falta. | **0078** `fn_fiscal_setup_status` + painel **"Preparação para a primeira NF-e"** no Fiscal, feito com o Panel existente, a partir dos cadastros reais. | Administrador: 5 pendências numa empresa nova. Gerente: o painel some quando tudo está pronto. |
| P10 | Auditoria com "system" | 131 gravações nas funções do banco com `actor_label` fixo `'system'`, embora `user_id` já fosse o usuário certo. | **0077**: um gatilho em `audit_logs` troca o rótulo genérico pelo nome do usuário de `user_id`. Eventos sem usuário continuam "system". Auditoria de cadastros intacta. | Na tela: aprovações, reserva, conta a receber, recebimento e NF-e → **Gerente Nova Orbita**; separação, embalagem, expedição e entrega → **Operador Nova Orbita**. Teste A→A / B→B no banco. |
| P11 | Central sem o nome | Limite deliberado: a plataforma não lê o cadastro da empresa. | **0079**: o perfil SaaS guarda só o **nome de exibição** (o nome digitado na criação, sincronizado se a empresa renomear). Razão social, CNPJ e dados continuam fora da Central. | Owner: lista e detalhe mostram "Nova Orbita". |
| P12 | "Módulos essenciais" | Texto antigo. | Texto: "todos os módulos da plataforma contratados e habilitados". A quantidade de módulos não mudou. | Owner: confirmação com o texto novo. |
| P13 | "Não é possível excluir…" na entrada de estoque | Toda violação de FK era traduzida como erro de exclusão. | `errors.ts`: FK na gravação → 422 dizendo o que não existe. | Operador: local inexistente → 422 "O local de estoque informado não existe nesta empresa." |
| P14 | Auditoria mistura técnico e inglês | Rótulos faltando. | 22 ações com rótulo (Aprovação, Recebimento…) e entidades em português ("Pedido de venda"). O nome técnico fica numa coluna "Tabela" oculta e no detalhe do evento. | Administrador: tela sem `sales_orders` nem "Approve". |
| P15 | Rótulo não ligado ao campo | O `FieldControl` do `EntityForm` recebia `id`/`aria-*` do `FormField` e não repassava ao controle. | Repasse para Input, Textarea, Select, Combobox e DatePicker. | Formulário de cliente: 12/12 rótulos ligados. `getByLabel("Código do local")` encontra o campo. |

## NÃO CORRIGIDO (permanece)

| Item | Situação | Por quê |
|---|---|---|
| Telas de cadastro fiscal | Estabelecimento, natureza de operação, CFOP, NCM e perfil fiscal do produto só existem na API; as telas de CFOP e NCM são só consulta. O E2E faz essa preparação pela API da sessão. | Criar essas telas é funcionalidade nova, fora do escopo ("sem redesign"). O painel do P9 diz isso claramente ao usuário. |
| NCM do formulário do produto × NCM da NF-e | O campo "NCM" do produto grava `products.ncm`; a NF-e usa o NCM do **perfil fiscal**. | Mudar a regra fiscal não fazia parte desta rodada. O painel do P9 avisa o usuário. |
| Papéis de empresas **existentes** | ASTRA (e, em produção, Senai) não tiveram Operador e Somente leitura recalculados. Receberam só as permissões novas do catálogo (`units.*`, `unit_conversions.*`). Continuam sem as consultas de CRM, Qualidade, Manutenção e Projetos. | Um administrador pode ter ajustado os papéis de sistema; recalcular sobrescreveria isso. Fazer esse backfill é decisão sua. |
| CNPJ na importação por CSV e em fornecedores | A importação de clientes usa só o esquema e não confere os dígitos; fornecedor e transportadora continuam validando só o tamanho. | O pedido cobria empresa, estabelecimento e cliente. Estender é simples, com a mesma função. |
| Manual de Administração §465 | Cita o texto antigo ("módulos essenciais"). | Os PDFs não foram regenerados nesta rodada. |
| Homologação Neon | Nada aplicado. | A rede deste ambiente bloqueia `*.neon.tech`. |

## NOVOS PROBLEMAS encontrados nesta rodada

| # | Problema | Situação |
|---|---|---|
| N1 | **Expedir** falhava com "cannot get array length of a scalar". A API grava `serial_numbers` como JSON null e cinco funções usam `jsonb_array_length`. Só apareceu agora, porque o ensaio original parava antes, na falta do local. | **Corrigido e comprovado**: **0080** normaliza JSON null para SQL NULL nas quatro tabelas de itens. O teste de banco falha sem a correção e passa com ela. O E2E expede e entrega. |
| N2 | Relatórios de **Estoque** e **Produção** com o mesmo erro de ambiguidade do Fiscal. | **Corrigido** (0077): as funções respondem. O painel de Estoque/Produção não foi capturado no E2E. |
| N3 | Policy `units_select_authenticated` (`USING (true)`, só em produção) deixava ler unidades de **outra empresa** direto no banco. | **Corrigido** (0076). Teste: a Somente leitura da empresa nova vê 0 unidades de outras empresas. |
| N4 | Regressão **minha**, pega pelo reteste: a regra de depósito com `.refine` quebrava o PATCH genérico (`.partial()`) → 500 ao editar local. | **Corrigido** antes da entrega, com um teste novo que exige que todo esquema de cadastro aceite `.partial()`. |
| N5 | Regressão **minha**, pega pelo reteste: as colunas "Entidade" e "Tabela" da auditoria tinham o mesmo id, e ocultar uma ocultava as duas. | **Corrigido** e comprovado pela verificação do P14. |
| N6 | Primeira versão da tradução de erros: passaria mensagens técnicas do PostgreSQL com código 22023/42501. | **Corrigido**: só passam mensagens escritas para o usuário. Há testes. |
| N7 | API de categorias de produto não envia `code` (NOT NULL): criar categoria pela API daria erro. | **Não corrigido.** Nenhuma tela cria categorias hoje. |
| N8 | Mesmo padrão `jsonb_array_length` em parâmetros (`p_serial_numbers`) de separação e produção. | **Não verificado**: não fazem parte do fluxo do E2E. |

## TESTES (números reais)

| Validação | Resultado |
|---|---|
| Lint (`eslint`) | 0 erros (2 avisos já existentes, em `poc/neon-full/functions`) |
| Typecheck (`tsc --noEmit`) | OK |
| Build (`next build`) | OK |
| Suíte completa (`npm test`, com banco) | **849 / 849**, 0 ignorados (antes: 765) |
| Testes de banco (PostgreSQL real) | 89 / 89 |
| RBAC / papéis | 37 / 37 |
| Auditoria (autor e rótulos) | 17 / 17 |
| Validação de CNPJ/CPF | 14 / 14 |
| Tradução de erros e esquemas (`.partial()`) | 28 / 28 |
| Acessibilidade do formulário (rótulo ↔ campo) | 3 / 3; o teste falha com o código antigo |
| Fiscal (validações e preparação) | 53 / 53 |

Testes novos:
- `empresa-nova-db` (15 casos: P1, P2, P3, P4, P8/P9, P10, N1, N3);
- `database-errors`;
- `documents`;
- `cadastro-schemas-partial`;
- `entity-form-labels`;
- `fiscal-setup`;
- `audit-labels`.

Os testes existentes não foram removidos. Três fixtures foram ajustados para as regras novas (CNPJ válido no estabelecimento; `warehouse_id` na linha do local; o teste de "local sem depósito" passou para o esquema de criação).

## EVIDÊNCIAS

As capturas não ficam no Git: foram entregues no pacote `E2E-NOVA-ORBITA-reteste.zip`.


- `antes-depois/P01…P15/`: 47 imagens. Para cada problema, as capturas do ensaio original (`antes-*`) e do reteste (`depois-*`).
- `e2e-reteste/`: as 147 capturas do reteste nas pastas 01–11, mais `resultados.jsonl` (122 verificações) e `state.json`.
- Nenhuma senha, token ou cookie nas capturas nem nos arquivos. Isso foi conferido.

## Migrations desta rodada

Estão em `supabase/migrations` e em `poc/neon-full/plan-prod-equivalente.txt`:

| Migration | Conteúdo |
|---|---|
| `0076_empresa_nova_estoque_e_papeis` | P1, P2, P3, N3 |
| `0077_relatorios_e_autor_da_auditoria` | P4, N2, P10 |
| `0078_nfe_pre_requisitos` | P8, P9 |
| `0079_nome_da_empresa_na_central` | P11 |
| `0080_itens_sem_numero_de_serie` | N1 |

Todas são idempotentes (aplicadas duas vezes no banco local sem erro). **Não foram aplicadas na homologação Neon nem em produção.** Aplicá-las em produção muda permissões e policies de todas as empresas; isso exige sua autorização explícita.
