# Relatório — Teste com 48 usuários em 7 empresas (ATLAS.ERP)

> **Rodada 2 (04–05/10/2026):** correções e reteste — ver a seção **"RODADA 2"** no fim deste arquivo. As seções 1–13 abaixo são a rodada 1 e não foram alteradas.

> Rodada de **busca de problemas**, não de demonstração. Ambiente **exclusivamente local** (réplica da homologação:
> PostgreSQL 16 local, dublê do Neon Auth, caixa de e-mail local, `next start` da branch `claude/e2e-empresa-nova-correcoes`).
> **Nada foi feito em `main` nem em produção.** Todos os dados são fictícios. Nenhuma senha, token ou link de convite está
> neste relatório nem nas evidências (campos de senha e links mascarados nas capturas; credenciais só em arquivo local fora do Git).
>
> Data: 02/10/2026 · Evidências: [`docs/homologacao/evidencias/teste-48-usuarios/`](evidencias/teste-48-usuarios/) ·
> Testes de regressão: [`tests/teste-48-usuarios-regressao.test.ts`](../../tests/teste-48-usuarios-regressao.test.ts)

---

## 1. Resumo executivo

**O que está sólido:**
- **O isolamento entre empresas aguentou tudo o que foi tentado:** 3.395 tentativas, 0 vazamentos. Cada empresa tentou acessar as outras 6 por ID conhecido, PATCH/DELETE, ações, filtros, busca, exportação CSV, URL direta e associação cruzada.
- **O RBAC respeita a configuração em 100% dos casos:** 1.200 verificações de API e 624 de tela, cobrindo os 48 usuários.
- **Não houve corrupção de estoque nem baixa financeira dupla** em nenhum cenário de concorrência.

**O que não está sólido:**
1. 🔴 **Conta a receber duplicada para o mesmo pedido** quando duas pessoas (ou um duplo clique) geram o título ao mesmo tempo. Aconteceu em **4 de 6 execuções**. É operação financeira errada (o cliente seria cobrado duas vezes). **Não foi corrigido automaticamente**, conforme a regra: a correção exige *migration*. Está registrado com causa e recomendação.
2. 🟠 **Edição simultânea apagava em silêncio a alteração do colega.** Era o problema mais "invisível" da rodada. ✅ Corrigido com bloqueio otimista: o 2º recebe aviso claro.
3. 🟠 **Pedido com desconto maior que o valor** era gravado e **aprovado com total negativo** (−R$ 490). ✅ Corrigido.
4. 🟠 **Papel de sistema "Operador"** pode lançar conta a pagar, baixar recebimento e criar NCM em todas as empresas. É uma falha de segregação de funções. Não foi corrigido: é decisão de negócio e exige *migration*.
5. 🟠 A tela **Papéis e permissões levava 7,8 s parada** e **25 s com 48 usuários**, dando *timeout* na tela; o tempo cresce com o número de empresas da plataforma. ✅ Corrigido: agora ~0,6 s.
6. 🟡 Separação e expedição podem ser **criadas em dobro** sob concorrência. O estoque fica protegido: a 2ª expedição é barrada no envio, mas com mensagem técnica.
7. 🟡 Mensagens técnicas e HTTP 500:
   - campos obrigatórios respondiam "Invalid input: expected string, received undefined";
   - cinco entradas inválidas davam erro 500;
   - NF-e duplicada falava em "CPF/CNPJ".

   ✅ Corrigido.
8. 🟡 O **Início mostrava duas caixas vermelhas de erro** para os papéis Compras, Financeiro, Fiscal e Logística. ✅ Corrigido.

| Números | |
|---|---|
| Empresas / usuários | 7 / 48 (+ Owner da Central) |
| Verificações automatizadas executadas | ≈ 10.900 (+ 2.382 chamadas nos dois "dias simultâneos") — detalhe por suíte em §13 |
| Problemas registrados | 30 (1 🔴, 4 🟠, 11 🟡, 14 🟢) — IDs R48-01…31 (R48-18 unificado ao R48-06) |
| Corrigidos nesta rodada (FAIL → PASS comprovado) | 14 (13 diretos + 1 eliminado por consequência) |
| Testes de regressão adicionados | 31 (arquivo único) — suíte total 868 testes, 0 falhas |

---

## 2. Matriz das empresas

| # | Empresa | Perfil | CNPJ (fictício) | Usuários | Papéis personalizados | Produtos | Clientes | Pedidos | Compras |
|---|---|---|---|---|---|---|---|---|---|
| 01 | Cobalto Distribuidora | Distribuidora | 25.386.045/0001-77 | 8 | Financeiro, Fiscal, Logística, Compras | 17 | 14 | 12 | SC→PC→recebimento→CP |
| 02 | Ferrix Indústria | Indústria | 55.242.097/0001-30 | 7 | idem | 13 | 8 | 12 | idem |
| 03 | Mares Varejo | Varejo (muitos clientes) | 68.914.560/0001-95 | 8 | idem | 15 | 24 | 12 | idem |
| 04 | Prisma Serviços | Serviços / financeiro | 21.634.352/0001-79 | 5 | idem | 8 | 10 | 12 | idem |
| 05 | Sertão Atacado | Atacado / logística | 87.602.980/0001-80 | 7 | idem | 13 | 10 | 12 | idem |
| 06 | Lince Especialidades | Catálogo amplo | 16.529.677/0001-51 | 6 | idem | 42 | 12 | 12 | idem |
| 07 | Vértice Operações | Operação híbrida | 22.977.477/0001-64 | 7 | idem | 12 | 12 | 12 | idem |

**Papéis por empresa** (cada pessoa com um papel só, criada pelo fluxo oficial: Owner → convite do Administrador → convites da empresa → primeiro acesso pelo e-mail):

| Empresa | Papéis |
|---|---|
| Cobalto | Administrador, Gerente, Vendedor ×2, Operador, Financeiro, Logística, Compras |
| Ferrix | Administrador, Gerente, Operador ×2, Compras, Fiscal, Financeiro |
| Mares | Administrador, Gerente, Vendedor ×3, Operador, Financeiro, Somente leitura |
| Prisma | Administrador, Gerente, Financeiro ×2, Somente leitura |
| Sertão | Administrador, Gerente, Vendedor, Operador, Logística ×2, Fiscal |
| Lince | Administrador, Gerente, Vendedor, Operador, Compras, Fiscal |
| Vértice | Administrador, Gerente, Vendedor, Operador, Financeiro, Fiscal, Logística |

**Montagem:**
- Montagem pelo fluxo oficial: **166 PASS / 0 FAIL**. Resultado: 48 usuários ativos e 28 papéis personalizados (4 × 7), com as contagens batendo em todas as empresas.
- Massa de dados e fluxo completo em cada empresa:
  - 12 pedidos em todos os estados;
  - contas a receber e a pagar pagas, parciais, abertas e vencidas;
  - NF-e prontas e expedições entregues;
  - ciclo de compras (solicitação → aprovação → pedido de compra → recebimento → conferência → conta a pagar).
- **1.495 operações por API com as sessões reais de cada papel: 1.465 com 2xx.** As 30 restantes foram todas a criação de categoria de produto (B8 → R48-13).

Evidências: `01-empresas`, `02-usuarios`, `05…09`, `17-compras`.

---

## 3. Matriz de isolamento (7 × 6 = 42 pares)

**Método:**
- Para cada par A → B, o **Administrador** de A (o perfil mais forte) fez 49 tentativas contra B.
- Um **usuário comum** de A (Vendedor ou Operador) repetiu as leituras e as ações sensíveis.
- Foram testadas 3 telas por URL direta / busca com nomes de B.
- Ao final, conferiram-se 10 listas completas de A e o **banco de B antes × depois**: 15 medidas, incluindo saldos, reservas, status, `updated_at`, papéis e auditoria.

| Recurso | Tentativas por par | Exemplos | Resultado |
|---|---|---|---|
| Clientes / produtos / fornecedores | 10 | GET, PATCH, DELETE por ID; busca pelo nome de B | negado (404/403), sem vazamento |
| Pedidos | 9 | GET, PATCH, cancelar, aprovar, filtro `customerId` de B, busca pelo código de B, pedido de A com cliente/produto/condição de B | negado (404/405/422) |
| Estoque | 6 | saldos e movimentos filtrados por IDs de B, entrada no local de B, entrada do produto de B, reservar/liberar pedido de B | negado; lista vazia |
| Compras | 2 | GET pedido de compra de B; PC de A com fornecedor de B | negado |
| Financeiro | 6 | GET título de B, baixar parcela de B, gerar título do pedido de B, cancelar CP de B, filtro por cliente de B | negado |
| Fiscal | 3 | GET / cancelar NF-e de B; gerar NF-e do pedido de B | negado |
| Logística | 2 | GET / entregar expedição de B | negado |
| Usuários e papéis | 7 | GET usuário de B, atribuir papel (dos dois lados), vincular unidade, remover papel, desativar usuário de B, alterar permissões do papel de B | negado |
| Auditoria / exportação / Central | 5 | histórico por ID de B, CSV buscando nome de B, `/api/platform/*` | negado ou só dados de A |
| Telas (URL direta e busca) | 3 | `/app/comercial/pedidos-venda/:idB`, busca com nome/código de B | nenhum dado de B |

**Resultado: 3.395 verificações, 3.395 PASS, 0 FAIL, 0 vazamentos.**

| Item | Valor |
|---|---|
| Códigos HTTP devolvidos | 403 × 1.104 · 404 × 954 · 422 × 390 · 405 × 42 · 200 × 660 (só listas vazias ou de A, conferidas no banco) |
| Banco de cada empresa | intacto antes × depois nas 7 empresas |
| RLS | ativa e com política em **todas** as tabelas com `company_id` (0 sem RLS) |
| Efeitos colaterais | 0 papel de outra empresa atribuído; 0 movimento das tentativas |

Repetido na build final, depois de todas as correções: ver §13.

> Ressalva honesta: a aplicação usa um cliente de serviço em partes do servidor. O isolamento real é a soma `company_id` do contexto do servidor + RLS. Testei o comportamento, não provei formalmente cada consulta.

Evidências: `04-isolamento/00-isolamento-resumo.png`, uma tabela por empresa, `90-banco-antes-depois.png`, `01-url-direta-…png`.

---

## 4. Matriz de RBAC

**48 usuários** (os 7 administradores incluídos), cada um contra:
- **25 operações de API**: 12 leituras, criar cliente/pedido/solicitação de compra/conta a pagar/NCM, alterar produto, aprovar pedido de venda e de compra, reservar, entrada de estoque, baixar parcela, convidar usuário, alterar permissões de papel;
- **13 rotas de tela** por URL direta.

Regra: **permitido ⇔ o papel tem a permissão no banco**. Negado = 403 na API e "acesso restrito" na tela.

| Resultado | API | Telas |
|---|---|---|
| Verificações | 1.200 | 624 |
| Conforme a configuração | **1.175 + 25 falso-positivos** (ver abaixo) | **624** |
| Divergência real API × configuração | **0** | **0** |

- **Falso-positivo do roteiro (registrado, não é falha):** `GET /api/admin/users` para quem não tem `users.read` devolve 200 **com um único registro: o próprio usuário**, por causa da RLS (`auth_user_id = auth.uid()`). O roteiro esperava lista vazia. Não há vazamento. Sobre o 200 em vez de 403, ver R48-26.
- **Divergências de regra de negócio** (a API segue a configuração; a configuração é que é discutível), 18 casos = 3 operações × 6 empresas com Operador: **o papel de sistema Operador pode criar conta a pagar, baixar parcela a receber e criar NCM** → R48-04.
- **Sob carga:** na 1ª tentativa paralela, a tela `/app/admin/roles` não terminou de carregar em 20 s → R48-05 (corrigido). A Vértice foi refeita sozinha: 262 PASS.

Evidências: `03-rbac/00-rbac-resumo.png`, `0N-empresa-rbac-api.png` e `-rbac-telas.png` por empresa, menus por papel (Cobalto).

---

## 5. Concorrência (cenários A–G)

Sessões reais em paralelo (`Promise.all`) na Vértice e na Sertão, **2 rodadas antes da correção + 1 depois**. Cada cenário cria seus próprios dados e confere o resultado no banco.

| ID | Cenário | O que aconteceu | Resultado |
|---|---|---|---|
| A | Gerente e Operador salvam o mesmo produto ao mesmo tempo (formulário inteiro) | **Antes:** 200/200. Prevaleceu a última gravação e a alteração do outro sumiu sem aviso. Salvando a partir de uma cópia velha, o preço voltou de 40 para 25. A auditoria registrou as duas. **Depois:** 200/409 com instrução; o preço 40 foi preservado; a tela mostra "Este registro foi alterado por outra pessoa…". | 🟠 → ✅ corrigido |
| B | Gerente aprova enquanto Vendedor cancela e edita o mesmo pedido | Aprovação venceu. Vendedor: 403 ao cancelar (não tem a permissão); a edição não existe (405). Estado final coerente. | PASS |
| B2 | Vendedor tenta mudar itens/preço de pedido aprovado | Bloqueado: não há edição de pedido; itens intactos. | PASS |
| C1–C3 | **Estoque 10; A reserva 8 e B reserva 7 ao mesmo tempo** (Gerente × Logística) | **Nunca reservou 15.** Um ganha e o outro recebe 422 "Reserva de 7.0000 excede o saldo disponível." — nas rodadas 2 e 3 (na 1ª, o roteiro usou o Vendedor, que não pode reservar; corrigido). A trava `reserved ≤ on_hand` no banco segura. Porém o perdedor **não fica com reserva parcial dos 2–3 restantes**, ao contrário do que acontece em sequência. Mensagem com 4 casas decimais. | PASS (integridade) · 🟡 R48-14 |
| C4 | 3 cliques simultâneos em Reservar no mesmo pedido | Reservou 6 (não 12/18); os outros: 409. | PASS |
| D | Entrada + consulta + reserva + separação + saída no mesmo produto, simultâneas | Saldo 35 = razão 35, reservado 14 ≤ saldo, nenhum 5xx. | PASS |
| E1/E2 | Baixa da mesma parcela de R$ 500 por Financeiro + Gerente / duplo clique sem chave de idempotência | 1 pagamento, 1 lançamento, débito único de R$ 500; o 2º recebe 422 "Parcela no status PAID…". | PASS |
| E3 | Recebimento duplicado da mesma parcela | 1 recebimento; o 2º recebe 422. | PASS |
| **E4** | **Gerar a conta a receber do mesmo pedido 2× ao mesmo tempo** | **201/201 → 2 títulos para o mesmo pedido** (CR-0172/0173, CR-0175/0176, CR-0178/0179 e mais um na rodada final) em **4 de 6 execuções**. | 🔴 **R48-01, aberto** |
| F1 | Gerar a NF-e do mesmo pedido 2× ao mesmo tempo | 1 documento: o índice único do banco segura. O perdedor recebia "Já existe um registro com este documento (CPF/CNPJ)". | PASS · 🟡 mensagem → ✅ |
| F2 | Calcular / pronta / numerar / autorizar a mesma NF-e 2× | Itens não duplicam; 1 autorização; o outro recebe 409. | PASS |
| G1 | Criar separação do mesmo pedido 2× ao mesmo tempo | **2 listas ativas** em 3 de 4 rodadas. A 2ª pôde ser iniciada, separada e concluída num pedido **já entregue**; os contadores do pedido não dobraram. | 🟡 R48-06 |
| G2 | Separar o mesmo item e concluir 2× | Separado = 4 (não 8). | PASS |
| G3 | Criar expedição 2×, expedir 3× e entregar 2× | **2 expedições ativas** em 4 de 4 rodadas. Expedição: só 1 saiu, baixa de estoque única (10 → 6). A 2ª expedição passou por liberar/embalar/aprovar e só foi barrada no envio, com "Item 77de70ac-…: quantidade a expedir (4.0000) excede o saldo reservado disponível (0.0000)." | 🟡 R48-06 · 🟢 R48-17 |

Evidências: `12-concorrencia/00-concorrencia-rodada-1/2/3.png`; `16-correcoes/R48-A-ui-*.png` (dois navegadores, antes/depois).

---

## 6. Fluxos completos (por empresa)

Executados com a sessão do papel responsável por cada etapa. A auditoria registra o autor real.

| Fluxo | Etapas | 7 empresas |
|---|---|---|
| Venda → entrega | Vendedor cria e envia → Gerente aprova → Logística reserva, separa, embala → Gerente aprova a expedição → Logística expede e confirma a entrega | ✅ em todas |
| Financeiro do pedido | Financeiro gera o título (condição 28 dias) → recebimento total/parcial → vencidos atualizados | ✅ |
| Compras | Compras solicita → Gerente aprova → Compras cria o PC, envia para aprovação → Gerente aprova → Compras envia ao fornecedor → Operador lança o recebimento → Logística confere → Financeiro gera a conta a pagar | ✅ |
| Fiscal | Fiscal configura estabelecimento, CFOP 5102, natureza, NCM e perfis fiscais → gera NF-e dos pedidos entregues → calcula → marca como pronta | ✅ (autorização na SEFAZ fora do escopo — sem provedor) |
| Cadastro de categoria de produto | Gerente cria categorias | ❌ antes (422 em 7/7) → ✅ depois (R48-13) |

**Observações de fluxo:**
- **B11 (conhecido):** pedido entregue continua com status "Expedido".
- A expedição só fica "Entregue" pela API de evento de entrega (D12).

---

## 7. Problemas por severidade

> Nenhum problema foi apagado. Colunas: ID | Problema | Severidade | Evidência | Causa | Ação tomada | Resultado.

### 🔴 Crítico

| ID | Problema | Sev. | Evidência | Causa | Ação tomada | Resultado |
|---|---|---|---|---|---|---|
| R48-01 | Duas contas a receber para o mesmo pedido quando o título é gerado 2× ao mesmo tempo (duplo clique ou duas pessoas) | 🔴 | `12-concorrencia` E4; banco: CR-0172/0173 (PV-0436), CR-0175/0176 (PV-0451), CR-0178/0179 (PV-0466) | `fn_generate_accounts_receivable_from_sales_order` (0033) lê o pedido **sem `FOR UPDATE`**, verifica se já existe título e então insere: corrida *check-then-act*. Não há índice único em `accounts_receivable(company_id, origin_type, origin_id)`. | **Não corrigido** (regra 🔴 + exige *migration*). Execução daquela parte parada após a confirmação. | ABERTO — ver §9 |

### 🟠 Alto

| ID | Problema | Sev. | Evidência | Causa | Ação tomada | Resultado |
|---|---|---|---|---|---|---|
| R48-02 | Dois usuários editando o mesmo cadastro: a última gravação apagava a do outro sem aviso; salvar a partir de cópia velha desfazia alterações | 🟠 | Concorrência A; `16-correcoes/R48-A-ui-*.png` | PATCH genérico gravava o formulário inteiro sem conferir versão | Bloqueio otimista: a versão do formulário (`atualizadoEm`) é conferida e a gravação é condicional a `updated_at`; o 2º recebe 409 com instrução | ✅ PASS |
| R48-03 | Pedido/orçamento com desconto maior que o valor gravado e aprovado com total negativo (−R$ 490); depois disso, CR dizia "Pedido sem valor total", NF-e era criada e o cálculo dava 500 | 🟠 | Erros provocados; PV-0475/0479/0483 | Validação só exigia desconto ≥ 0 | Validação: desconto do item ≤ qtd × preço; desconto do pedido ≤ itens + frete | ✅ PASS |
| R48-04 | Papel de sistema **Operador** pode criar conta a pagar, baixar parcela a receber e criar NCM (6 empresas) | 🟠 | `03-rbac` (divergências de negócio) | Permissões do papel padrão `operator` (migrações de papéis) | **Não corrigido**: decisão de negócio + *migration* | ABERTO |
| R48-05 | Papéis e permissões: 7,8 s parado, p95 25 s com 48 usuários, *timeout* na tela; o tempo cresce com o nº de empresas da plataforma | 🟠 | Dia simultâneo; RBAC Vértice 1ª tentativa | `listAdminRoles` lia `role_permissions` e `user_roles` **de todas as empresas** (19.604 linhas) e a RLS avaliava `has_permission` linha a linha | Consulta só dos papéis/usuários da empresa | ✅ 7.791 ms → ~0,6 s |


### 🟡 Médio

| ID | Problema | Evidência | Causa | Ação tomada | Resultado |
|---|---|---|---|---|---|
| R48-06 | Separação e expedição criadas em dobro sob concorrência; 2ª separação concluída em pedido já entregue, sem alerta (inclui o antigo R48-18, unificado) | G1/G3; `15-dados` | Sem trava no pedido nem índice único | Não corrigido (*migration*; entrega parcial legítima precisa ser preservada) | ABERTO |
| R48-07 | Mensagens do Zod em inglês: "Invalid input: expected string, received undefined", "expected number, received NaN" | `14-erros` | Mensagem padrão do Zod em campos sem mensagem própria | Mapa global de mensagens em português com o nome do campo | ✅ "Informe o cliente.", "Informe o preço de venda como número…" |
| R48-08 | HTTP 500 em 5 entradas: preço negativo, quantidade 1 trilhão, data 30/02, ID malformado na URL, transferência para o mesmo local | `14-erros` | Erros 23514/22003/22008/22P02 sem tradução | Tradução para 4xx com instrução + validação na origem (preços ≥ 0; origem ≠ destino) | ✅ 422/404 |
| R48-09 | NF-e gerada 2× ao mesmo tempo: o perdedor lia "Já existe um registro com este documento (CPF/CNPJ)" | F1 | Classificação da duplicidade pelo **nome** da restrição (`fiscal_documents_…`) | Classifica pelas colunas da chave; mensagem própria para origem já gerada | ✅ unitário + E2E na rodada final: "Este documento já foi gerado a partir desta origem…" |
| R48-10 | Início com duas caixas vermelhas "Não foi possível carregar o relatório executivo" + "Tentar novamente" para Compras, Financeiro, Fiscal e Logística | `11-usabilidade/…compras1-desktop-inicio.png` | A tela checava `reports.view`; a função do banco também exige `controlling.view` | `reportAllowed()` com `alsoRequires`; 403 de relatório vira estado neutro "fora do seu perfil", sem "Tentar novamente" | ✅ |
| R48-11 | Reservas de pedidos expedidos continuam **"active"** (62 registros; nunca "consumed"); o saldo reservado do estoque está certo | `15-dados/00-integridade.png` | A expedição baixa o reservado no saldo mas não marca a reserva como consumida | Não corrigido (*migration*). Verificado: liberar reserva de pedido expedido é bloqueado, sem dano ao estoque | ABERTO |
| R48-12 | `/api/admin/audit?entityId=` ignorava o filtro e devolvia a trilha inteira (B17, reconfirmado) | `10-auditoria` | Parâmetro não era lido | Filtro por `entity_id` (só UUID válido) | ✅ |
| R48-13 | Categoria e marca de produto não podiam ser criadas (422 em 7/7 empresas) — B8 reconfirmado | `05-comercial`, massa | Coluna `code` obrigatória nunca preenchida | Código derivado do nome na criação | ✅ "MATERIA-PRIMA-…" |
| R48-14 | Matriz de Papéis e permissões em inglês: "Audit", "Branches", "Company modules", "Rbac", "Configure" | `11-usabilidade/…admin-desktop-papeis.png` | Código do recurso "humanizado" | Rótulos em português para 103 recursos e 48 ações | ✅ |
| R48-15 | Corrida de reserva: o perdedor recebe erro em vez de reserva parcial do saldo restante (em sequência, reservaria o restante); integridade preservada | Concorrência C1–C3 (rodada 2) | `fn_reserve_sales_order_stock` lê `available` sem trava; a trava real (`reserved ≤ on_hand`) aborta a transação inteira | Não corrigido (*migration*) | ABERTO |
| R48-16 | Dia simultâneo (48 usuários): p50 1,1 s, **p95 12,6 s**, máx 28 s; 6 telas sem carregar em 20 s | `13-dia-simultaneo` | Servidor único local (4 CPUs) + R48-05 | R48-05 corrigido → p95 **2,2 s**, 0 erro de tela (§13) | PARCIAL — repetir na homologação real (Vercel + Neon) |

### 🟢 Baixo

| ID | Problema | Ação | Resultado |
|---|---|---|---|
| R48-17 | Mensagem técnica com UUID: "Item 77de70ac-…: quantidade a expedir (4.0000) excede o saldo reservado…" | Não corrigido (função do banco) | ABERTO |
| R48-19 | Nome de cliente com 5.000 caracteres aceito | Limites: nome/razão 200, descrição 250, código 60 | ✅ |
| R48-20 | 404 "customers não encontrado." (nome da rota em inglês) | Rótulo do cadastro | ✅ "Cliente não encontrado." |
| R48-21 | CFOP mostra "SAIDA"/"INTERNAL"; auditoria mostra "stock_transfers" | Rótulos | ✅ |
| R48-22 | Números com 4 casas nas mensagens do banco: "disponível 4.0000", "Reserva de 7.0000", "saldo da parcela (670.0200)" | Não corrigido (funções do banco) | ABERTO |
| R48-23 | Convites do Owner na auditoria com `user_id` nulo e rótulo técnico `platform:OWNER:owner@…` | Não corrigido (exibição) | ABERTO |
| R48-24 | Pedido do Vendedor carrega `/api/warehouse-locations` e recebe 403 (ruído) | Não corrigido | ABERTO |
| R48-25 | "Pedido sem valor total — nada a gerar" (mensagem imprecisa para total negativo) | Causa eliminada por R48-03 | ✅ indireto |
| R48-26 | Lista de usuários devolve 200 com o próprio registro (não 403) para quem não tem `users.read` | Registrado (sem vazamento) | ABERTO |
| R48-27 | Pedido entregue continua "Expedido" (B11) | Reconfirmado | ABERTO |
| R48-28 | Não existe edição de pedido de venda (PATCH → 405) | Registrado como comportamento | — |
| R48-29 | Mensagem de quantidade em texto: "(ex.: 10,50 → 10.50)" ainda é técnica | Aceito por ora | ABERTO |
| R48-30 | 67 combinações tela × celular com alvos de toque < 32 px | Ver §10 | ABERTO (melhoria) |
| R48-31 | Menu com termos em inglês: "Picking", "Packing" | Ver §10 | ABERTO (melhoria) |

---

## 8. Corrigidos

Todos na branch `claude/e2e-empresa-nova-correcoes`, commits `3ca2878`, `081edc1` e o seguinte (B17 + relatório). **Sem migration**, só código da aplicação.

| ID | Problema | Causa | Arquivo(s) | Alteração | Teste | Resultado |
|---|---|---|---|---|---|---|
| R48-02 | Edição simultânea apagava a do colega | PATCH sem versão | `src/lib/database/table.ts`, `src/lib/api/handlers.ts`, `src/lib/database/errors.ts` | `expectedUpdatedAt` do formulário; checagem + `UPDATE … WHERE updated_at = versão lida`; 409 `STALE_RECORD` | regressão "R48-A" (4) + E2E A1–A4 | 200/200 → 200/409; preço 40 preservado; aviso na tela |
| R48-03 | Desconto > valor → total negativo | Validação incompleta | `src/lib/validations/commercial.ts` | `refine` no item e no cabeçalho (pedido e orçamento) | 4 testes | 201 → 422 |
| R48-05 | Papéis lento (7,8 s) | Consulta sem filtro + RLS linha a linha | `src/lib/api/admin-handlers.ts` | `.in("role_id", roleIds)`, `.in("user_id", userIds)` | 1 teste + medição | ~0,6 s |
| R48-07 | Zod em inglês | Mensagem padrão | `src/lib/validations/zod-messages.ts` (novo), importado em `errors.ts` | `z.config({ customError })` com nome do campo | 2 testes | "Informe o cliente." |
| R48-08 | HTTP 500 em 5 entradas | Códigos do PG sem tradução | `errors.ts`, `cadastros.ts`, `inventory.ts` | 22P02→404, 22003/22007/22008/23514→422; preços ≥ 0; origem ≠ destino | 3 testes | 500 → 4xx |
| R48-09 | NF-e duplicada falava em CPF/CNPJ | Classificação por nome da restrição | `errors.ts` | Classifica pelas colunas `Key (…)`; `DUPLICATE_SOURCE` | 3 testes | mensagem correta |
| R48-10 | Erro no Início para 4 papéis | Permissão incompleta na tela | `metrics.ts`, `AreaDashboard.tsx`, `ReportBlocks.tsx`, `Insights.tsx`, `ModuleWorkspace.tsx`, `dashboard/client.ts` | `reportAllowed()` + estado "fora do seu perfil" | 2 testes + captura | sem caixa vermelha |
| R48-12 | Filtro da trilha ignorado (B17) | Parâmetro não lido | `admin-handlers.ts` | `eq("entity_id", …)` | 1 teste + verificação no banco | ✅ devolve só a entidade pedida |
| R48-13 | Categoria/marca não criáveis (B8) | `code` obrigatório vazio | `table.ts`, `mappers.ts`, `repositories.ts` | `createDefaults` → `codeFromName()` | 4 testes | 201 |
| R48-14 | Matriz em inglês | `humanize(código)` | `src/lib/permission-labels.ts` (novo), `admin/roles/page.tsx` | Rótulos PT | 2 testes + captura | em português |
| R48-19 | Nome de 5.000 caracteres | Sem limite | `cadastros.ts` | `.max()` | 2 testes | 422 |
| R48-20 | "customers não encontrado." | Nome da rota | `handlers.ts`, `table.ts` | `entityLabel` | 1 teste | "Cliente não encontrado." |
| R48-21 | CFOP/auditoria com código cru | Sem rótulo | `fiscal/cfop/page.tsx`, `audit-labels.ts` | Mapas de rótulos | 2 testes | "Saída · Dentro do estado" |
| R48-25 | Mensagem imprecisa (efeito do R48-03) | — | — | — | — | eliminada |

Validação: `tsc` limpo, ESLint limpo, `npm test` **868/868**, `next build` ok, E2E pós-correção (§13).

---

## 9. Não corrigidos

| ID | Por quê | Risco | Recomendação |
|---|---|---|---|
| **R48-01** 🔴 | Regra do pedido: crítico não se corrige automaticamente; exige *migration* em função financeira | Cliente cobrado 2× (dois títulos e duas cobranças); exige duplo clique ou duas pessoas no mesmo segundo, mas a reprodução foi fácil (4 de 6) | (1) `select … for update` do pedido no início de `fn_generate_accounts_receivable_from_sales_order`; (2) índice único parcial `accounts_receivable(company_id, origin_type, origin_id) where status <> 'CANCELLED'`; (3) antes de criar o índice, **verificar duplicatas existentes em produção**; (4) botão "Gerar conta a receber" desabilitado durante o envio |
| R48-04 🟠 | Decisão de negócio (o que o Operador pode) + *migration* do papel padrão | Segregação de funções: quem mexe no estoque pode lançar e baixar títulos | Retirar `accounts_payable.create`, `receipts.create` e `fiscal_ncms.create` do papel `operator` (ou documentar a escolha) |
| R48-06 🟡 | *Migration*; entrega parcial legítima precisa continuar possível | Tarefas duplicadas confundem a operação; estoque protegido | Trava do pedido (`for update`) nas funções de criar separação/expedição + bloquear separação de pedido entregue |
| R48-11 🟡 | *Migration* (função de expedição) | Relatórios de "reservas ativas" inflados | Marcar a reserva como `consumed` (e `consumed_at`) ao expedir |
| R48-15 🟡 | *Migration* | Perdedor da corrida não reserva o saldo restante | Travar a linha do saldo antes de calcular `v_to_reserve` |
| R48-16 🟡 | Ambiente local de 1 processo | Latência sob carga real desconhecida | Repetir o "dia simultâneo" na homologação (Vercel + Neon) antes de produção |
| R48-17/22 🟢 | Mensagens dentro de funções do banco | Texto técnico | Formatar números (`to_char`) e trocar UUID pelo código do produto |
| R48-23/24/26/27/29 🟢 | Baixo impacto | Ruído / texto técnico | Lote de acabamento |
| **D1, B15, B18** (rodada anterior) | Aguardando sua decisão (código × *migration*) | — | Ver conversa anterior |

---

## 10. Melhorias de UX (separadas de bugs)

**Padrão geral:** 169 combinações tela × dispositivo (desktop 1440, tablet 820, celular 390; Cobalto em todos os papéis e amostra das outras empresas).
- **0 rolagem horizontal**, 0 `undefined`/`NaN` na tela e 0 botões sem nome acessível.
- Carga p50 de 0,8 s.

**Melhorias sugeridas:**
1. **Menu:** "Picking", "Packing" → "Separação", "Embalagem" (a tela já se chama "Separação (picking)").
2. **Celular:** alvos de toque abaixo de 32 px em 67 telas (ícones de linha, filtros). Sugestão: 40 px mínimo.
3. **Conflito de edição:** hoje o aviso pede "feche e abra de novo". Melhor oferecer "Recarregar dados" no próprio aviso, preservando o que o usuário digitou.
4. **Separação:** a lista mostrou duas separações para o mesmo pedido sem nenhum destaque. Um aviso "já existe separação ativa para este pedido" evitaria trabalho em dobro (mesmo antes da trava no banco).
5. **Reserva concorrente:** quando a reserva falha porque outra pessoa reservou antes, a mensagem poderia dizer "outra reserva usou o saldo; tente reservar o que restou" em vez de "Reserva de 7.0000 excede o saldo disponível".
6. **Auditoria:** exibir "Owner da plataforma (owner@…)" em vez de `platform:OWNER:owner@…`.
7. **Pedido entregue com status "Expedido"** (B11) confunde no painel e no fluxo do ERP.

---

## 11. Auditoria

Verificado direto no banco, nas 7 empresas:

| Verificação | Resultado |
|---|---|
| Registros por empresa (rodada 48) | presentes nas 7 empresas, autores variados por papel |
| Autor `system` / `Sistema` / `service_role` / `dev` / `postgres` | **0** |
| Ação gravada na empresa X por usuário da empresa Y | **0** |
| `entity_id` de outra empresa (clientes, produtos, pedidos) | **0** |
| `actor_label` diferente do nome/e-mail do autor | **0** |
| Datas no futuro ou antes da criação da empresa | **0** |
| Cobertura de ações críticas (pedido aprovado/cancelado, recebimento, pagamento, expedição, NF-e, papel) | **100%** auditadas |
| Registros sem autor (`user_id` nulo) | 7: os convites do Owner da Central para o administrador de cada empresa (autor identificado no rótulo `platform:OWNER:…`) → R48-23 |
| Histórico por registro (`/api/audit-logs?entityId=`) | correto |
| Trilha administrativa por registro (`/api/admin/audit?entityId=`) | ❌ ignorava o filtro → ✅ corrigido (R48-12) |

Evidências: `10-auditoria/00-auditoria-verificacoes.png`.

---

## 12. Dados

**Integridade (19 verificações no banco):**

| Verificação | Resultado |
|---|---|
| Saldo = soma do razão de movimentos (por produto/local) | ✅ 0 divergências |
| Saldo negativo / reservado > saldo | ✅ 0 |
| Chave de idempotência de estoque repetida | ✅ 0 |
| Recebido/pago > valor da parcela; status incoerente; soma das baixas ≠ parcela | ✅ 0 |
| Saldo da conta financeira = abertura ± lançamentos | ✅ 0 |
| Mais de uma NF-e ativa por pedido; número de NF-e repetido | ✅ 0 |
| Total do pedido = linhas − desconto + frete | ✅ 0 |
| Código de pedido repetido; vínculo com cadastro de outra empresa; papel de outra empresa | ✅ 0 |
| **Mais de uma conta a receber ativa por pedido** | ❌ 3 (todas do cenário E4) → R48-01 |
| **Mais de uma expedição ativa por pedido** | ❌ 4 (todas dos cenários G) → R48-06 |
| **Reservado no saldo ≠ reservas "ativas"** | ❌ 47 (reservas de pedidos expedidos nunca marcadas como consumidas) → R48-11 |

**Movimentação de dados na rodada:**

| Tipo | Quantidade |
|---|---|
| Criados | 7 empresas, 48 usuários, 28 papéis, 120 produtos (+ ~60 dos cenários), 90 clientes (+ ~70 do dia simultâneo), 84 pedidos de massa (+ ~170 dos cenários/dia), 7 ciclos de compras, 49 títulos a receber, 42 a pagar (35 avulsos + 7 de compras), 21 NF-e, 28 expedições |
| Modificados | estados de pedidos, títulos e expedições pelos fluxos; produtos dos cenários A/RBAC |
| Cancelados | 14 pedidos de massa (2 por empresa) + cenário B |
| Inativados | nenhum |
| Perdidos | **nenhum**, exceto as alterações perdidas por R48-02 **antes** da correção (cenário A, dados de teste) |
| Duplicados | 3 contas a receber, 4 expedições e ~4 separações, todos dos cenários de concorrência; mantidos no banco local como evidência |

**Lixo de teste deixado de propósito** (banco local, fictício): pedidos com total negativo PV-0475/0479/0483 (prova do R48-03) e as duplicatas acima.

Contagens por empresa: `15-dados/01-contagens.png`.

---

## 13. Pós-correção: FAIL → correção → PASS

Mesma entrada da 1ª passada, na build com as correções:

| ID | Antes | Depois | Resultado |
|---|---|---|---|
| R48-13 (B8) | Criar categoria → 422 | 201, código `MATERIA-PRIMA-…`; nome repetido → 409 "código" | ✅ |
| R48-02 (A1) | 200/200, alteração perdida | 200/409 + "Este registro foi alterado por outra pessoa…" | ✅ |
| R48-02 (A2) | Cópia velha → preço 40 → 25 | 409; preço 40 preservado | ✅ |
| R48-02 (A3) | — | PATCH parcial sem versão continua 200 (compatível) | ✅ |
| R48-02 (A4, tela) | 2º salvava por cima | Toast "Não foi possível salvar o cliente. Este registro foi alterado…" | ✅ captura |
| R48-03 | 201 com total −490 | 422 "O desconto do item não pode ser maior…" / "…do pedido…" | ✅ |
| R48-07 | "Invalid input: expected string…" | "Informe o nome." / "Informe o cliente." / "Informe a quantidade como número…" | ✅ |
| R48-08 | 500 × 5 | 422 × 4 ("negativo", "limite", "Data inválida", "origem e destino") + 404 | ✅ |
| R48-19 | 201 com 5.000 caracteres | 422 "Use no máximo 200 caracteres no nome." | ✅ |
| R48-20 | "customers não encontrado." | "Cliente não encontrado." | ✅ |
| R48-09 | "…documento (CPF/CNPJ)" | na 1ª verificação a corrida não se repetiu (5 tentativas); na rodada final se repetiu: "Este documento já foi gerado a partir desta origem. Atualize a tela…" | ✅ |
| R48-05 | 7.791 ms | 552–907 ms; 9 papéis, permissões e contagens iguais | ✅ |
| R48-14 | "Company modules", "Rbac", "Configure" | "Módulos da empresa", "Papéis e permissões", "Configurar" | ✅ captura |
| R48-10 | Caixas vermelhas para Compras/Financeiro | sem erro; resto do Início normal | ✅ captura |
| R48-21 | "SAIDA", "INTERNAL", "stock_transfers" | "Saída · Dentro do estado"; sem código cru | ✅ |

**Regressão final** — build final (todas as correções), mesma massa, mesmos roteiros:

| Suíte | 1ª passada | Build final | Observação |
|---|---|---|---|
| Isolamento 7 × 6 | 3.395 PASS / 0 FAIL | **3.395 PASS / 0 FAIL** | nenhuma correção abriu brecha |
| Concorrência A–G (34 por rodada) | 26/34 · 26/34 | **27/34** | o "FAIL" de A é o critério antigo do roteiro (esperava as duas gravações); o comportamento novo 200/409 é o correto e está comprovado em A1–A4. Seguem abertos: E4 (1 de 2), G1 (2 de 2), G3 (2 de 2) |
| Erros provocados (129 por passada) | 83 PASS / 46 FAIL | **116 PASS / 13 FAIL** | os 13 restantes são do classificador, não do sistema: busca SQL devolvendo lista vazia (correto); 403 por o papel não ter `stock.adjust` (regra); 409 com mensagem clara na soma das parcelas; papel substituído pelo Gerente onde a empresa não tem Vendedor/Somente leitura; reserva sem estoque responde 200 com o pedido, e a tela mostra "Nenhuma unidade reservada" |
| Dia simultâneo, 48 usuários | 1.194 chamadas · 0 × 5xx · p50 1,1 s · **p95 12,6 s** · máx 28 s · 6 telas sem carregar · 97 s | 1.188 chamadas · **0 × 5xx · p50 0,8 s · p95 2,2 s · máx 9,0 s · 0 erro de tela · 31 s** | melhora principal: R48-05; a 1ª passada também tinha *payloads* errados do roteiro (corrigidos) |
| Pós-correção (E2E) | — | **21/21 + 6/6 PASS** | inclui a corrida de NF-e, que se repetiu na rodada final e mostrou a mensagem nova (R48-09 comprovado também por E2E) |
| Auditoria (9) / dados (19) | 7/9 · 16/19 | **8/9 · 16/19** | abertos: R48-23 (convites do Owner sem `user_id`), R48-01, R48-06, R48-11 |
| Testes automatizados | 857 | **868 / 868** | `tsc` e ESLint limpos; `next build` ok |

---

## O que eu encontrei que você provavelmente não encontraria usando o sistema normalmente

1. **A conta a receber dupla (R48-01).** Uma pessoa sozinha, clicando uma vez, nunca vê isso. É preciso duplo clique ou duas pessoas no mesmo segundo. O sistema aceita sem nenhum aviso e o título dobrado aparece "normal" na lista. Você só notaria quando o cliente reclamasse da cobrança.
2. **A alteração que sumia (R48-02).** Duas pessoas com o mesmo cadastro aberto: a última salva por cima, a auditoria registra as duas e ninguém é avisado. Parece que "o sistema perdeu minha alteração", e a culpa cai no usuário.
3. **O Operador com poder financeiro (R48-04).** A tela de papéis só mostra o que você escolhe nos papéis personalizados. Os padrões vêm prontos e ninguém costuma abrir para conferir.
4. **A lentidão que cresce com o número de clientes da plataforma (R48-05).** Com uma empresa só, Papéis abre rápido. Com 16 empresas no banco, levava 7,8 s; com 48 pessoas usando, 25 s. Isso pioraria a cada empresa nova, sem nenhuma mudança na sua.
5. **O pedido com total negativo (R48-03).** Pela tela, o campo de desconto não impede o valor; ninguém digita R$ 500 de desconto num item de R$ 10… até alguém errar um zero. E o pedido foi **aprovado**.
6. **Reservas "ativas" que já saíram do estoque (R48-11)** e **expedições/separações em dobro (R48-06):** só aparecem cruzando tabelas no banco.
7. **O que não encontrei**, e procurei com força: nenhum vazamento entre empresas em 3.395 tentativas; nenhum caso de reservar mais que o saldo; nenhuma baixa financeira dupla; nenhuma NF-e duplicada; nenhum autor "system" ou de outra empresa na auditoria.

> **Limites desta rodada (sem maquiagem):**
> - Ambiente local de 1 processo, não a Vercel/Neon reais: a latência medida não vale para produção.
> - Não há provedor de NF-e (autorização na SEFAZ não testada).
> - A usabilidade foi medida por sinais automáticos + leitura das capturas, não por pessoas reais.
> - O isolamento foi testado por comportamento (caixa-preta + banco), não por revisão formal de cada consulta.
> - Parte dos "FAIL" iniciais eram erros do meu próprio roteiro e foram reclassificados com justificativa:
>   - papel substituído pelo Gerente onde a empresa não tinha o papel;
>   - lista de usuários com o próprio registro;
>   - o Vendedor usado por engano na reserva (C4);
>   - payloads do dia simultâneo.

---
---

# RODADA 2 — 04/10/2026 · testar → identificar → corrigir → comprovar → continuar testando

> Réplica **local** da homologação (PostgreSQL 16 local, dublê do Neon Auth, caixa de e-mail local, `next start`), as mesmas **7 empresas / 48 usuários / Owner** criadas pelo fluxo oficial com os roteiros da rodada 1 (`evidencias/teste-48-usuarios/roteiros/`) e dados fictícios.
> **Nada em `main`, produção, Vercel de produção ou banco de produção.** As migrations desta rodada (0081–0088) foram aplicadas **somente em bancos locais descartáveis**.
> Branch: `claude/e2e-empresa-nova-correcoes`. Evidências e roteiros: [`evidencias/teste-48-usuarios-rodada-2/`](evidencias/teste-48-usuarios-rodada-2/). Testes: [`tests/rodada2-regressao.test.ts`](../../tests/rodada2-regressao.test.ts) e [`tests/rodada2-integridade-db.test.ts`](../../tests/rodada2-integridade-db.test.ts).
> A rodada 1 (seções 1–13 acima) **não foi alterada**. As seções desta rodada usam a numeração **R2.x**; os problemas, **R2-xx**.

## R2.0 Incidente: o ambiente foi reiniciado no meio da rodada (e o que isso mudou)

No fim da primeira execução desta rodada o contêiner foi **reiniciado** e perdeu o clone de trabalho, o banco local e os roteiros que estavam só nele — inclusive **dois commits que eu ainda não tinha enviado** ao GitHub. O erro foi meu: devia ter enviado a cada etapa. Refiz a rodada inteira, desta vez **enviando a cada etapa** (16 commits ao final). Consequências, sem esconder nada:

- **Ambiente refeito do zero** pelo mesmo caminho da rodada 1: banco pelo plano equivalente à produção (98 migrations), dublê de autenticação, Owner pelo bootstrap oficial e as 7 empresas / 48 usuários / massa de dados pelos roteiros **commitados** da rodada 1 (`r1-setup`, `r2-dados`). Por isso os **códigos e números** (PV-…, CR-…, contagens) são diferentes dos da execução perdida.
- **As correções foram reescritas** a partir do registro da sessão: 0086 e 0087 e os testes de regressão foram recuperados literalmente; 0081–0085, 0088, o fiscal simulado e os roteiros `p1`/`p2`/`p3` foram reescritos e **comprovados de novo** (antes → depois) neste ambiente novo. Nenhum resultado abaixo vem da execução perdida, exceto onde está escrito "execução perdida".
- **Segunda interrupção:** no fim da reexecução a sessão foi suspensa de novo. Desta vez os arquivos sobreviveram (tudo já estava no GitHub), mas os processos pararam: o banco local, o servidor e o **RBAC final em andamento**. O banco voltou com a recuperação normal do PostgreSQL, os dados ficaram intactos (conferido) e o RBAC final foi **executado de novo do começo**. Nenhum resultado parcial foi aproveitado.
- O roteiro fiscal "antes" (2 PASS / 11 FAIL na execução perdida) **não pôde ser refeito** contra o banco antigo com os 48 usuários (o banco foi perdido e o novo já recebeu as migrations). A prova "antes" do fiscal nesta reexecução é a dos **testes de banco executados um a um sem as migrations** (R2.16).

## R2.1 Resumo executivo

| | |
|---|---|
| **Empresas / usuários** | 7 / 48 (+ Owner da Central), criados pelo fluxo oficial |
| **Verificações E2E e no banco** | **≈ 8.200**. Inclui:<br>• isolamento 3.395;<br>• RBAC 2 × 1.824;<br>• usabilidade 400 combinações;<br>• erros 2 × 131;<br>• reprodução 3 × 48;<br>• concorrência 3 × 34;<br>• fiscal 2 × 34;<br>• integridade 3 × 27;<br>• auditoria 51 + 28 |
| **Chamadas de API** | **> 8.400** contadas, das quais 2.395 nos dois "dias simultâneos" de 48 usuários |
| **Testes automatizados** | **964 / 964** (69 novos nesta rodada: 48 de regressão, 20 de banco e 1 do checklist fiscal) · lint 0 erros · typecheck limpo · build OK |
| **Problemas tratados** | **38**:<br>• 15 da rodada 1, reproduzidos de novo antes de mexer;<br>• **23 novos** (R2-01…R2-26, sem os números de decisão) |
| **Corrigidos com FAIL → PASS comprovado** | **33**, mais 1 parcial (R2-09) |
| **Abertos** | **4**:<br>• R48-16 desempenho 🟡: melhorou, falta medir no ambiente real;<br>• R2-12 impostos 🟡: depende de decisão fiscal;<br>• R48-30 alvos de toque 🔵;<br>• R2-21 `seed.sql` 🔵 |
| **Por severidade** | 🔴 1 (corrigido) · 🟠 7 (corrigidos; R2-09 parcial) · 🟡 9 (7 corrigidos, 2 abertos) · 🔵 21 (19 corrigidos, 2 abertos) |
| **Decisões suas** | ⚪ 8 (R2.19), não decididas por mim |

**O que melhorou (com prova nesta rodada):**
- **Recebível em dobro (🔴 R48-01) acabou.** O banco recusa o 2º título ativo do mesmo pedido, venha de onde vier. Repetir a geração devolve o título existente, com a mensagem "Este pedido já tem a conta a receber CR-…". Prova:
  - reprodução **6/8 FAIL → 8/8 PASS** (repetida na build final);
  - 3 rodadas da concorrência A–G;
  - 0 duplicatas no banco.
- **Separação e expedição em dobro acabaram**, também **em sequência** (R2-02, que nem precisava de concorrência). A expedição só sai do local onde o pedido reservou.
- **Reservas:**
  - a reserva é **consumida** na expedição;
  - a corrida de reserva deixa o perdedor com o que sobrou;
  - o cancelamento depois da separação libera ou recusa nomeando a tarefa.
  - No banco: **45 → 0** divergências saldo × reservas e **30 → 0** reservas fantasmas.
- **Fiscal simulado completo**, sem SEFAZ, certificado ou provedor real:
  - numerar, calcular, autorizar e cancelar na simulação;
  - chave de 44 dígitos com DV;
  - protocolo `SIMULACAO-`;
  - rejeições `SIM-1xx`;
  - documento visual com faixa e marca d'água "ATLAS.ERP — SIMULAÇÃO", que **nunca** se apresenta como NF-e autorizada.
  - Também foram corrigidos 6 problemas fiscais que existiam antes da simulação: o Fiscal não numerava, numeração trocada, número repetido na série, autorização manual aceitando chave "123", entre outros.
- **Concorrência A–G: 34/34** nas 3 rodadas (rodada 1: 26–27/34).
- **RBAC sem nenhum "200 disfarçado":** lista de usuários e trilha de auditoria agora dão **403** para quem não pode (25 + 25 casos).
- **Auditoria:** criação e envio para aprovação de pedidos agora aparecem na trilha, com o autor real (antes: 0 linhas de criação em 140 pedidos).
- **Mensagens:** sem UUID, sem "7.0000", sem código de status ou de permissão, valores em R$.
- **Desempenho:** igual ou melhor que a rodada 1, mesmo com as travas novas: p95 1,6–1,7 s contra 2,2 s, e 0 erros 5xx.

**O que continua:**
- **Operador** com acesso a contas a pagar, baixa de recebível e NCM: decisão sua, não alterado.
- **Pedido entregue continua "Expedido"**: decisão sua.
- **NF-e sai sem imposto**, porque não há regras tributárias (R2-12).
- **Alvos de toque pequenos** no celular e no tablet (R48-30).
- **Desempenho** ainda não medido em Vercel + Neon.

**O que é novo:**
- **23 problemas** encontrados nesta rodada; os mais sérios foram os fiscais e o cancelamento depois da separação.
- **6 deles apareceram só nas últimas execuções** (R2-21 a R2-26) e foram corrigidos e comprovados da mesma forma.

**Migrations:** 0081 a 0088, aplicadas **somente** em bancos locais descartáveis. **Nada** em `main`, produção, Vercel de produção ou banco de produção.

## R2.2 Método (e o que NÃO foi feito)

- **Reproduzir antes de corrigir.** Os problemas abertos foram executados de novo **contra o código e o banco originais**, num roteiro próprio (`p1-reproducao`), 4 vezes cada nas duas empresas de operação mais intensa (Vértice e Sertão). **Antes: 2 PASS / 46 FAIL.**
- **Corrigir no banco o que é do banco.** Corridas *check-then-act* foram fechadas com trava (`SELECT … FOR UPDATE`) e, onde cabe, **índice único**: o banco recusa a duplicidade venha de onde vier (tela, API, integração).
- **Migration só depois de conferir os dados.** Cada migration com índice único **confere duplicatas antes** e **para** se encontrar. As duplicatas criadas pela reprodução foram tratadas pela **API oficial**, com o papel responsável de cada empresa (o autor fica na auditoria): **6 títulos, 8 separações e 10 expedições excedentes cancelados**, nada apagado (`p0-limpeza.out.json`).
- **Comprovar com o mesmo roteiro e com teste que falha antes.** Rebuild, reinício e o **mesmo** roteiro de novo (FAIL → PASS), mais teste de regressão. Os 20 testes de banco foram executados **um a um contra um banco sem as migrations**: 19 falham (R2.16).
- **Falso positivo é do harness, não do ATLAS** — cada um justificado em R2.17. Onde o roteiro estava errado, **o roteiro foi corrigido** e a versão antiga guardada.
- **Não perseguir 100% PASS.** Decisões de negócio ficaram como estão (R2.19); o que não dava para corrigir com segurança ficou **aberto**, com causa e caminho.

## R2.3 Problemas da rodada 1 — estado atual (reproduzidos, não presumidos)

| ID | Problema | Rodada 1 | Reprodução nesta rodada (antes) | Depois da correção | Situação |
|---|---|---|---|---|---|
| R48-01 🔴 | Duas contas a receber para o mesmo pedido | 4 de 6 | **6 de 8** execuções com 2 títulos ativos (Vértice 4/4, Sertão 2/4) | 8/8 com 1 título; o 2º recebe "Este pedido já tem a conta a receber CR-0064. Nenhum título novo foi criado." | ✅ corrigido (0081) |
| R48-06 🟠 | Separação em dobro (G1) | 3 de 4 | **8 de 8** | 8/8: 1 separação; o 2º recebe "O pedido PV-0142 já tem a separação SEP-0072 em aberto. Use essa separação (ou cancele-a antes de criar outra)." | ✅ corrigido (0081) |
| R48-06 🟠 | Expedição em dobro (G3) | 4 de 4 | **8 de 8** (8 unidades em expedições para 4 reservadas) e também **em sequência** (G3b) | 8/8 + G3b: o 2º recebe "…a quantidade a expedir (4) é maior que o reservado ainda livre para expedição (0)…" | ✅ corrigido (0081) |
| R48-11 🟡 | Reserva "active" depois da expedição | 62 registros | 2 de 2; **30** reservas ativas de pedidos já expedidos; **45** divergências saldo reservado × reservas | reserva **consumida**; 30 → **0**; divergências 45 → **0** | ✅ corrigido (0081) |
| R48-15 🟡 | Corrida de reserva sem parcial | rodadas 2–3 | **8 de 8** (o perdedor: 422 "Reserva de 7.0000 excede o saldo disponível.") | 8/8: os dois 200; reservado 10 de 10 (o perdedor fica com o que sobrou) | ✅ corrigido (0081) |
| R48-04 🟠/⚪ | Operador lança conta a pagar, baixa recebível e cria NCM | 21 divergências | reconfirmado: **21** divergências = 3 operações × 7 Operadores (a Ferrix tem 2) | — | ⚪ **decisão de negócio** (não alterado) |
| R48-16 🟡 | Desempenho com 48 usuários | p95 2,2 s | rodada 1 depois do R48-05: p50 0,8 s · p95 2,2 s · máx. 9,0 s | 2 execuções: p50 **0,52 / 0,46 s** · p95 **1,62 / 1,75 s** · p99 3,9 / 4,0 s · máx. 7,5 / 6,2 s · 0 × 5xx | 🟡 melhorou; aberto até medir na homologação real (R2.14) |
| R48-17 🔵 | UUID na mensagem da expedição | aberto | reproduzido ("Item 79623d82-…: quantidade a expedir (5) excede…") | "…para o produto VO-…-M17 — Produto rodada 2 M17…, a quantidade a expedir (5)…"; sem UUID | ✅ corrigido |
| R48-22 🔵 | "4.0000" nas mensagens | aberto | reproduzido ("Reserva de 8.0000 excede…") | formatação central + `fn_fmt_qty` | ✅ corrigido |
| R48-23 🔵 | Convite do Owner como `platform:OWNER:owner@…` | aberto | reproduzido: 7 convites do Owner (1 por empresa) com `user_id` nulo e rótulo técnico | tela: "Owner da plataforma (owner@…)"; `user_id` nulo continua no dado | ✅ exibição corrigida |
| R48-24 🔵 | Vendedor recebe 403 de locais de estoque ao abrir o pedido | aberto | (código) a tela buscava os locais para todos | a tela só busca para quem pode reservar · r8: **0** chamadas com erro nas 80 telas de pedido (Gerente, Vendedor, Compras, Somente leitura) e nas 400 combinações | ✅ corrigido |
| R48-26 🔵 | Lista de usuários devolve o próprio registro (200) sem `users.read` | aberto | rodada 1: 200 com o próprio registro × 25 (o código não checava a permissão) | **403 × 25** nas duas execuções do RBAC (48 usuários) | ✅ corrigido |
| R48-27 / B11 🔵⚪ | Pedido entregue continua "Expedido" | aberto | reproduzido (nenhuma função grava "Concluído") | — | ⚪ decisão |
| R48-29 🔵 | "(ex.: 10,50 → 10.50)" | aberto | — | "Informe … só com números, com ponto antes dos centavos (ex.: 10.50)." | ✅ texto ajustado |
| R48-30 🔵 | Alvos de toque < 32 px no celular | 102 combinações (3 tamanhos) | persiste: **todas** as 320 combinações de celular/tablet têm ao menos um alvo < 32 px (medição ampliada: 5 tamanhos) | — | 🔵 aberto (melhoria de UX) |
| R48-31 🔵 | Menu "Picking"/"Packing" | aberto | reproduzido (menu e títulos das telas) | "Separação"/"Embalagem" (a busca por "picking"/"packing" continua achando) | ✅ corrigido |
| B15 🔵 | Código de permissão no 403 | rodada 7 empresas | "(stock.adjust)" | "(Estoque — Ajustar)" | ✅ corrigido |
| B18 🔵 | Item do pedido não herda a unidade do produto | rodada 7 empresas | **reproduzido** (2/2): produto "CX", item com unidade **nula** | item "CX" | ✅ corrigido (0085) |
| D1 | (decisão pendente desde a rodada de 7 empresas) | — | não reavaliado | — | ⚪ aguardando sua decisão |

**Roteiro de reprodução (`p1`, 48 verificações):** antes **2 PASS / 46 FAIL** → depois **48 / 0** e **48 / 0** de novo na build final (`p1-reproducao-final.out.json`).

## R2.4 Recebível — avaliação da correção (prioridade crítica)

**Causa (confirmada no código vivo do banco):** `fn_generate_accounts_receivable_from_sales_order` lia o pedido **sem trava**, procurava título existente e então inseria — *check-then-act*. Sem índice único na origem, duas transações simultâneas passavam pela verificação e criavam dois títulos.

| Requisito | Como ficou (migration 0081) |
|---|---|
| **O banco impede a duplicidade** | Índice único parcial `accounts_receivable_origin_active_unique (company_id, origin_type, origin_id) WHERE origin_id IS NOT NULL AND status <> 'CANCELLED'`: qualquer 2º título **ativo** do mesmo pedido é recusado pelo PostgreSQL, venha da tela, da API ou de integração. |
| **Concorrência** | `SELECT … FROM sales_orders … FOR UPDATE` no início: a 2ª geração espera a 1ª terminar e encontra o título. Se mesmo assim o índice recusar, a função devolve o título existente. |
| **Idempotência** | Repetir não cria nada. A API usa `fn_generate_receivable_for_sales_order`, que diz **se criou agora ou se já existia**: 201 "Conta a receber CR-… gerada." / 200 "Este pedido já tem a conta a receber CR-…. Nenhum título novo foi criado." A tela mostra a mensagem do servidor. |
| **Integridade financeira** | valor do título = total do pedido; soma das parcelas = valor (conferido no banco — R2.12). |
| **Vínculo com o pedido** | `origin_type='sales_order'`, `origin_id` = pedido; a auditoria grava também o código do pedido. |
| **Auditoria** | uma linha `APPROVE` por título criado, com o autor real; a repetição não gera auditoria falsa. |
| **Isolamento** | a permissão é conferida **na empresa do pedido** antes de revelar se existe título. |
| **Título cancelado** | não gera outro automaticamente para o mesmo pedido; a resposta diz isso (409). Gerar de novo após cancelar é ⚪ decisão (R2-15). |

**Antes de aplicar em homologação/produção, rode a conferência** (a migration para sozinha se encontrar duplicata):

```sql
select company_id, origin_id, array_agg(code order by created_at) titulos
from accounts_receivable
where origin_type = 'sales_order' and origin_id is not null and status <> 'CANCELLED'
group by 1, 2 having count(*) > 1;
```

**Prova:** reprodução 6/8 FAIL → 8/8 PASS; 3 rodadas da suíte A–G (E4) com 1 título; testes de banco "índice único recusa o 2º título ativo" e "geração idempotente diz se criou ou já existia" (ambos falham sem a 0081).

## R2.5 Separação e expedição

| Cenário | Antes | Depois |
|---|---|---|
| Pessoa 1 + Pessoa 2, mesmo pedido, mesmo instante — separação | 201/201, 2 separações (8/8) | 201 / 422 "O pedido PV-… já tem a separação SEP-… em aberto. Use essa separação (ou cancele-a antes de criar outra)." Trava + índice `pick_lists_open_per_order_unique` |
| Pessoa 1 + Pessoa 2 — expedição | 201/201, 8 unidades em expedições para 4 reservadas | 201 / 422 "Não é possível criar a expedição: para o produto …, a quantidade a expedir (4) é maior que o reservado ainda livre para expedição (0). 4 já está em outra expedição aberta deste pedido." |
| 2ª expedição **em sequência** com a mesma quantidade | **aceita** (sem concorrência!) | recusada (a criação desconta as expedições abertas) — R2-02 |
| Expedir 3× ao mesmo tempo | 1 saída de estoque (já protegido) | 1 saída; os outros: 409 "Só é possível expedir uma expedição pronta para envio (situação atual: Expedida)." |
| Expedir de um local onde a reserva é de OUTRO pedido | **criada** (só seria barrada no envio) | recusada na criação: "…o pedido PV-… não tem reserva suficiente neste local para o produto … (reservado livre aqui: 0). Expeça do local onde o estoque foi reservado." — R2-03 |
| Entregar 2× ao mesmo tempo | 2 conexões reais: **ok/ok → 2 eventos "entregue"** (`p6-entrega-dupla`, banco sem 0084) | uma confirma, a outra é recusada "…(situação atual: Entregue)" → **1 evento** (0084) — R2-10 |
| Impacto no estoque e contadores | — | saldo cai uma vez só; contadores do pedido não dobram (suíte A–G, G3) |

## R2.6 Reservas — ciclo completo

| Verificação | Antes | Depois |
|---|---|---|
| Reserva nunca acima do saldo (corrida 8 + 7 com saldo 10) | nunca passou de 10 ✅ | idem ✅ |
| Perdedor da corrida | 422 "Reserva de 7.0000 excede o saldo disponível.", sem reserva | reserva parcial do que sobrou, pedido em "Reserva pendente" |
| Expedição consome a reserva | reserva continuava "active" | `consumed_quantity` por item; reserva "consumed" ao terminar; expedição parcial consome só o que saiu |
| Saldo reservado = reservas ativas não consumidas | **45 divergências** | **0** |
| Reservas ativas de pedidos já expedidos | **30** | **0** (ajuste da 0081) |
| Cancelamento libera | só em "aprovado/reservado"; pedido em separação ou pronto para expedir **não cancelava** (422 "Um dos valores informados não é permitido") e a reserva ficava presa | sem tarefa aberta: cancela e libera o restante; com separação/expedição aberta: recusa nomeando a tarefa (R2-01/R2-16) |
| Cancelamento depois de expedição parcial | — | libera só o restante (teste de banco: expedido 2, reservado 2, cancelado 3, nenhuma reserva presa) |

## R2.7 Fiscal — simulação (sem SEFAZ, sem certificado, sem provedor real)

**Arquitetura:** o ATLAS.ERP já previa autorização por provedor (tentativa → resposta). Faltava o provedor. Foi criado o **SIMULACAO** (0082), que usa os mesmos caminhos (tentativa em `fiscal_authorization_attempts`, eventos, auditoria com o autor real):

- só em documento de **homologação**, só com o provedor **configurado explicitamente** no estabelecimento, e as rotas só existem com `APP_ENV=homologacao`;
- confere o documento como um validador faria e **rejeita** com códigos **próprios** `SIM-…` (não imita códigos oficiais): sem itens (SIM-101), NCM/CFOP inválido (SIM-102), destinatário sem CPF/CNPJ (SIM-103), total divergente (SIM-104), CFOP × direção (SIM-105), CFOP × destino (SIM-106);
- aprovado: chave de 44 dígitos no formato da NF-e, com DV módulo 11, e protocolo `SIMULACAO-…`;
- cancelamento simulado: justificativa ≥ 15 caracteres, prazo de 24 h, evento `SIMULACAO-CANC-…`.

**Documento visual** (`/app/fiscal/notas-fiscais/:id/documento-simulado`): estrutura parecida com o documento auxiliar, **sem** brasões ou logotipos oficiais e **sem** código de barras; faixa "ATLAS.ERP · DOCUMENTO FISCAL SIMULADO · SEM VALOR FISCAL · NÃO AUTORIZADO PELA SEFAZ", marca d'água "ATLAS.ERP — SIMULAÇÃO" repetida, carimbo "SIMULAÇÃO — SEM VALOR FISCAL" / "CANCELADO" / "NÃO AUTORIZADO" e texto final dizendo que não houve transmissão. **Em nenhum lugar se apresenta como NF-e autorizada.** Capturas: `02-fiscal-simulado/`. Nova tela de detalhe do documento (numerar, calcular, pronto, autorizar/cancelar na simulação, linha do tempo em português).

| Teste (Vértice e Sertão) | Resultado |
|---|---|
| C0 — série e provedor | o Administrador cadastra a série 1 do estabelecimento e o provedor SIMULACAO pelas rotas oficiais |
| S0 — checklist | a 1ª NF-e passa a contar a série de numeração (R2-09) |
| N1–N5 — numeração | o **Fiscal numera** (antes exigia permissão de configuração); numera depois de "pronto"; **não renumera**; a autorização manual recusa documento sem número e chave "123"; dois documentos numerados ao mesmo tempo têm números diferentes e nenhum número se repete na série |
| S1 — pedido → NF-e → numerar → calcular → pronta → autorizar | AUTHORIZED; chave de 44 dígitos com DV válido; protocolo `SIMULACAO-…`; pedido de origem, cliente, produto, quantidade (4), preço (37,50), NCM, CFOP e total conferidos no banco; 1 tentativa no provedor; autor real na auditoria. **Impostos: nenhum** (R2-12) |
| S2/S3 — autorizar de novo / 3 pessoas ao mesmo tempo | 1 autoriza; os outros 409 "O documento DF-… já foi autorizado (simulação), chave …. Nada foi refeito."; 1 tentativa, 1 evento |
| S4/S5 — rejeições | CFOP 6102 para cliente do mesmo estado → REJECTED **SIM-106**; CFOP 1102 em saída → REJECTED **SIM-105** |
| S6 — cancelamento | justificativa curta → 422; 2 pessoas ao mesmo tempo → 1 cancela, o outro "já está cancelado"; 1 auditoria CANCEL |
| S7 — NF-e do mesmo pedido 2× ao mesmo tempo | 1 documento; **só uma resposta 201**; o outro 200 "Este pedido já tem a NF-e DF-…. Nenhum documento novo foi criado." (R2-19) |
| S8 — permissão e isolamento | Vendedor/Operador 403; documento de outra empresa recusado e invisível (404) |
| S9 — documento visual | marca d'água e avisos presentes; nenhuma frase de "autorizado pela SEFAZ" |
| **S10 — entrada** | NF-e de ENTRADA a partir do recebimento de compra: **fornecedor como remetente**, sem cliente, CFOP 1102, autorizada na simulação; o documento visual mostra o fornecedor |
| Descontos | **não exercitado** com desconto ≠ 0 nos roteiros fiscais. No código o desconto do item é levado ao documento e a simulação recusa total divergente (SIM-104). Fica para a homologação real (R2.20) |

Roteiro fiscal: **34/34** (duas empresas) e **34/34** de novo na build final. Antes: execução perdida (2/11); nesta reexecução, a prova "antes" é a dos testes de banco sem 0082/0083 (R2.16).

## R2.8 Concorrência (cenários A–G da rodada 1 — sem reduzir execuções)

Mesma suíte da rodada 1, Vértice + Sertão, **3 rodadas completas** (critérios atualizados em R2.17):

| Rodada | Resultado |
|---|---|
| r2a · r2b · r2c (build com 0081–0088) | **34/34 · 34/34 · 34/34** |
| Rodada 1 (mesma suíte) | 26/34 · 26/34 · 27/34 |

Registro de cada corrida (empresa, usuários, operação, vencedor, resposta do perdedor, estado final) nos `r5-concorrencia-r2*.out.json` (roteiros). Exemplos:

| Corrida | Usuários | Vencedor | Perdedor recebeu | Estado final no banco |
|---|---|---|---|---|
| E4 — gerar título | Financeiro × Gerente | 201 | 200 "Este pedido já tem a conta a receber CR-…. Nenhum título novo foi criado." | 1 título ativo |
| G1 — separação | Logística × Logística 2 (Sertão) | 201 | 422 "…já tem a separação SEP-… em aberto…" | 1 separação |
| C — reserva 8 + 7 (saldo 10) | Gerente × Logística | ambos 200 | — (parcial do que sobrou) | reservado 10 = reservas 10 |
| C4 — 3 cliques em Reservar | Logística ×3 | 1 × 200 | 2 × 409 "…(situação atual: Reservado)." | reservado 6 |
| E1 — baixar a mesma parcela | Financeiro × Gerente | 201 | 422 com a situação da parcela por extenso | 1 recebimento, lançamento único |
| F2 — autorizar a mesma NF-e (manual, chave válida) | Fiscal ×2 | 200 | 409 "O documento DF-… já está autorizado…" | 1 autorização |
| G3 — entregar 2× | Logística × Logística | 201 | 409 "…(situação atual: Entregue)" | 1 evento de entrega |
| S3 — autorizar NF-e (simulação) | Fiscal × Gerente × Administrador | 1 | 2 × 409 "…já foi autorizado (simulação)…" | 1 tentativa, 1 evento |

## R2.9 RBAC (48 usuários × 25 operações de API + 13 telas por URL direta)

Mesmo roteiro da rodada 1 (`r4-rbac`): **48 usuários** × 25 operações de API + 13 rotas de tela por URL direta. Regra: **permitido ⇔ o papel tem a permissão no banco**. Rodado **duas vezes**: com a build das correções 0081–0088 (execução A) e com a build final, depois do R2-22 (execução final).

| | Rodada 1 | Rodada 2 — execução A | Rodada 2 — execução final |
|---|---|---|---|
| Verificações (API + telas) | 1.200 + 624 | **1.200 + 624** | **1.200 + 624** |
| Conforme a configuração | 1.175 + 25 falsos positivos | **1.824 / 0 FAIL** | **1.824 / 0 FAIL** |
| Divergência real API × configuração | 0 | **0** | **0** |
| `GET /api/admin/users` sem `users.read` (R48-26) | 200 com o próprio registro (25) | **403 × 25** ✅ | **403 × 25** ✅ |
| `GET /api/admin/audit` sem `audit_logs.read` (R2-22) | 200 com lista vazia (aceito pelo roteiro) | 200 com lista vazia × 25 → **registrado como R2-22** | **403 × 25** "(Auditoria — Ler)" ✅ — **0** respostas "200 vazio" na matriz inteira |
| Telas por URL direta | 624 conforme | **624 conforme** (371 abrem, 253 "acesso restrito") | **624 conforme** (371 / 253) |
| Divergências de **regra de negócio** (Operador) | 18 (rodada 1 contou 6 empresas) | **21** = 3 operações × 7 Operadores (a Ferrix tem 2) | **21** (não alterado) |

Respostas HTTP da execução A, por "configurado?" (na execução final: **sim** 200 × 434 · 201 × 81 · 409 × 64 · 422 × 80 · 404 × 21; **não** 403 × 520 — os 409 a mais são a 2ª passada sobre os mesmos dados, como o NCM de teste já criado na execução A: a permissão deixou passar e a regra recusou a duplicata):
- **sim:** 200 × 448 · 201 × 106 · 422 × 80 · 409 × 25 · 404 × 21. São todas recusas **de regra**, não de permissão: dado inválido ou situação errada, nunca 403.
- **não:** 403 × 495 · 200 vazio × 25 (os 25 do R2-22).

O critério do roteiro **não foi alterado**: ele continua aceitando "lista vazia" como negação, para comparar com a rodada 1. A diferença foi lida na tabela da matriz e registrada como problema do sistema (R2-22), e não escondida pelo critério.

**Operador (R48-04)** — **não alterado** (decisão de negócio). Na API, o Operador pode, nas 7 empresas:
- criar conta a pagar;
- baixar parcela a receber;
- criar NCM.

Evidências: `03-rbac/` (matriz por empresa, telas e menus por papel) e `roteiros/r4-rbac-a.out.json` / `r4-rbac-final.out.json`.

## R2.10 Isolamento multiempresa

Mesma matriz da rodada 1 (`r3-isolamento`): cada empresa tenta ler, alterar, excluir, filtrar, buscar, exportar e abrir por URL direta os dados das outras 6 (42 pares), além de associar cadastros cruzados.

| | Rodada 1 | Rodada 2 |
|---|---|---|
| Verificações | 3.395 | **3.395** |
| PASS / FAIL | 3.395 / 0 | **3.395 / 0** |
| **Vazamentos** | 0 | **0** |
| Respostas HTTP | 403 × 1.104 · 404 × 954 · 422 × 390 · 405 × 42 · 200 × 660 | **as mesmas**: 403 × 1.104 · 404 × 954 · 422 × 390 · 405 × 42 · 200 × 660. Os 200 são listas só com dados da própria empresa, conferidas no banco |
| Tabelas sem RLS | 0 | **0** |
| Banco da empresa-alvo antes × depois | intacto | **intacto nas 7** |

Também nesta rodada:
- documento fiscal de outra empresa: invisível e recusado na simulação (S8: 404);
- título e NF-e de pedido de outra empresa: recusados **antes** de revelar se existem;
- integridade no banco: 0 registros apontando para cadastro de outra empresa e 0 auditorias gravadas na empresa X por usuário da empresa Y (R2.12).

**Nenhum vazamento.**

## R2.11 Auditoria

| Verificação | Resultado |
|---|---|
| Autor "system", "Sistema" ou service_role nas 7 empresas | **0** ✅ |
| Registro gravado na empresa X por usuário da empresa Y | **0** ✅ |
| `entity_id` de outra empresa | **0** ✅ |
| Rótulo do autor diferente do nome do usuário | **0** ✅ |
| Datas no futuro ou antes da criação da empresa | **0** ✅ |
| Registros sem `user_id` | **7**, um por empresa: o convite do 1º administrador, criado pelo **Owner da plataforma**, que não é usuário da empresa. O autor está no rótulo, e a tela agora mostra "Owner da plataforma (owner@…)" (R48-23). É o mesmo item da rodada 1, mantido como FAIL do roteiro, porque o dado continua sem `user_id` |
| Cobertura das ações críticas da rodada (títulos, NF-e autorizadas/canceladas, expedições) | 0 sem auditoria (R2.12) ✅ |
| **Filtros da trilha** (`p4`, Vértice/Sertão/Cobalto): sem filtro, entidade (3 mais frequentes), ação (CREATE/UPDATE/APPROVE/CANCEL), autor, entidade + ação, histórico de 1 registro, `entityId` de outra empresa, paginação (sem repetição, mais recente primeiro), `entityId` malformado, ação inexistente, nenhuma linha de outra empresa | **51/51**. Cada total foi conferido com `count(*)` no banco |
| **Cobertura da criação (R2-18)** | antes: **0** linhas de criação para os **140** pedidos de venda e os **7** pedidos de compra do banco (`r218-antes.txt`). Depois da 0086: **100%** dos pedidos de venda criados depois da 0086 têm CREATE com o autor real e, quando enviados, SUBMIT: Vértice 93/93 (SUBMIT 89/89), Sertão 93/93 (89/89), Cobalto 21/21 (16/16) |
| Trilha sem permissão (R2-22) | antes: 200 com lista vazia; depois: 403 "(Auditoria — Ler)" — **403 × 25** no RBAC final |

Totais: rodada 1, 8/9; rodada 2, **8/9** (o mesmo item, os convites do Owner), mais os filtros, o R2-18 e o R2-22.

## R2.12 Dados e integridade (direto no banco)

Roteiro `p3-integridade`: **27 verificações** com SQL direto no banco local, executadas ao final de todas as suítes, depois do dia simultâneo.

Cada verificação separa o que nasceu **antes** da aplicação das migrations (`cut-0081.txt` = 2026-10-04T21:36:37Z) do que nasceu **depois**. O histórico é contado, nunca apagado.
- Regras que **não admitem histórico** precisam de **zero no total**: duplicidades, reservas fantasmas, vazamento entre empresas.
- As demais precisam de zero **depois** do corte.

| Verificação | Antes das migrations | Final |
|---|---|---|
| Saldo físico = soma do razão de movimentos (produto/local/lote) | — | **0** divergências |
| Saldo negativo ou reservado > físico | — | **0** |
| Reservado no saldo = reservas ativas não consumidas | **45** divergências | **0** |
| Reserva "active" de pedido expedido/cancelado/concluído | **30** | **0** |
| Consumo de reserva acima do reservado | (coluna não existia) | **0** |
| Item do pedido: reservado/separado/expedido/cancelado incoerentes | — | **0** |
| Reservado no item = reservas do pedido (ativas + consumidas) | — | **0** |
| Mais de uma separação **aberta** por pedido | 8 pares criados na reprodução (cancelados pela API) | **0** |
| Expedições abertas + expedido > reservado | 10 expedições excedentes da reprodução (canceladas pela API) | **0** |
| Saídas de estoque de expedição = quantidade expedida | — | **0** |
| Mais de um evento "entregue" por expedição (R2-10) | — | **0** |
| Expedição aberta de pedido cancelado | — | **0** |
| Mais de uma conta a receber **ativa** por pedido (R48-01) | 6 pares da reprodução (cancelados pela API) | **0** |
| Título com valor diferente do pedido | — | **0** |
| Soma das parcelas ≠ valor do título (a receber / a pagar) | — | **0 / 0** |
| Parcela recebida/paga acima do valor | — | **0** |
| Saldo da conta financeira = abertura ± lançamentos | — | **0** |
| Mais de uma NF-e ativa por pedido | — | **0** |
| Número de documento de saída repetido na série | — | **0** (o índice único da 0083 impede) |
| Documento AUTORIZADO sem número ou com chave fora do padrão | — | **0** |
| Documento simulado (protocolo `SIMULACAO-`) fora de homologação | — | **0** |
| Total do documento ≠ produtos − desconto + frete + seguro + outras + impostos | — | **0** |
| Registro apontando para cadastro de **outra empresa** | — | **0** |
| Auditoria na empresa X por usuário da empresa Y | — | **0** |
| Auditoria sem autor em ação de usuário (depois do corte) | — | **0** |
| Ações críticas sem auditoria (títulos, NF-e autorizadas/canceladas, expedições) | — | **0** |

**Resultado: 27/27.** Nenhuma regra precisou da tolerância "histórico": as duplicidades criadas pela reprodução foram canceladas **pela aplicação** antes das migrations (`p0-limpeza`). A 0081 converteu as 30 reservas fantasmas em consumidas.

Evidência: `03-integridade/00-integridade-final.png` e `roteiros/p3-integridade-final.out.json`.

## R2.13 Validação e erros

Mesmo roteiro da rodada 1 (`r7-erros`), com o classificador corrigido (R2.17), em 3 empresas (Mares, Prisma, Lince), mais as sondas extras (`r7b`: XSS, nome de 5.000 caracteres).

| | Rodada 1 | Rodada 2 (build final) |
|---|---|---|
| Entradas inválidas | 129 | **131** (as mesmas 129 + 2 sondas de permissão separadas da sonda de saldo) |
| PASS / FAIL / N/A | 116 / 13 / — | **129 / 0 / 2** |
| HTTP 500 | 0 | **0** |

Destino dos 13 FAIL da rodada 1, reexecutados e analisados um a um:
- **3 eram do sistema** (R2-17): a soma das parcelas respondia 409 e agora responde **422**, nas 3 empresas.
- **10 eram do roteiro** (R2.17):
  - busca SQL com lista vazia × 3;
  - reserva sem estoque × 3;
  - papel substituído pelo Gerente × 2 (agora N/A);
  - Operador sem "Estoque — Ajustar" × 2. Agora o saldo é testado com o Gerente (409 "Saldo insuficiente…") e a permissão do Operador à parte (403 por extenso).

Os 2 N/A são cenários de papel que a empresa não tem: Prisma sem Vendedor e Lince sem Somente leitura.

**Varredura das mensagens desta rodada** (API e tela, todas as suítes): **sem** inglês, códigos de status, nomes de tabela ou restrição, UUID, SQL, pilha ou nome de função nas respostas de erro conferidas. Exemplos reais:
- "Você não tem permissão para esta operação (Estoque — Ajustar)."
- "Só é possível reservar estoque de um pedido aprovado (situação atual: Reservado)."
- "Este pedido não tem reserva ativa para liberar (situação atual: Expedido)."
- "A soma das parcelas (90) não corresponde ao valor atualizado do título (100)." → com R2-24: "(R$ 90,00) … (R$ 100,00)"

Outras verificações:
- Login com senha errada e com e-mail inexistente: **mesma mensagem**.
- HTML injetado no nome do cliente: exibido como texto, **não executa**.

**Achados novos nesta suíte:**
- **R2-24:** "Recebimento (999999) excede o saldo da parcela (670,02)." Um valor formatado, o outro não, e nenhum em R$. Corrigido, comprovado no r7 final nas 3 empresas.
- **R2-23:** permissões em inglês ("Audit logs — Ler") em 14 códigos. Corrigido.

## R2.14 Desempenho (48 usuários simultâneos)

**Dia simultâneo** (`r6-dia`, o mesmo roteiro da rodada 1): **48 sessões** reais abertas ao mesmo tempo, 4 rodadas de operações por papel — vender, reservar, separar, expedir, receber, pagar, NF-e, telas e tentativas negadas. Duas execuções seguidas, na build final.

| | Rodada 1 (depois do R48-05) | Rodada 2 — A | Rodada 2 — B |
|---|---|---|---|
| Chamadas | 1.188 | **1.206** | **1.189** |
| 5xx | 0 | **0** | **0** |
| p50 | 0,8 s | **0,52 s** | **0,46 s** |
| p95 | 2,2 s | **1,62 s** | **1,75 s** |
| p99 | (não medido) | **3,9 s** | **4,0 s** |
| máximo | 9,0 s | **7,5 s** | **6,2 s** |
| Telas que não carregaram | 0 | **0** | **0** |
| 4xx | — | 16 × 403 (tentativas **propositais** de quem não pode: criar cliente, cancelar pedido) · 2 × 409 · 1 × 422 | idem |

Os 409 e o 422 **são as travas novas funcionando sob carga**:
- 409 "Só é possível reservar estoque de um pedido aprovado (situação atual: Reservado)": duas pessoas reservaram o mesmo pedido.
- 422 "O pedido PV-… já tem a separação SEP-… em aberto…".

**Mais lentos (p95):**
| Tela | Execução A | Execução B | Observação |
|---|---|---|---|
| Primeira tela `/app` | 7,5 s | 6,2 s | 2 chamadas, ambas na abertura simultânea das 48 sessões |
| `/app/logistica/estoque` | 6,1 s | 5,4 s | |
| `/app/financeiro/contas-receber` | 5,5 s | 3,9 s | |
| `/app/comercial/pedidos-venda` | 5,1 s | 4,4 s | |

As demais operações ficam abaixo de 3,8 s de p95.

**Papéis e permissões (R48-05, rodada 1: 7,8 s parado → ~0,6 s):** com o sistema parado, 10 aberturas por empresa (`p5`):
- Cobalto: p50 **0,53 s**, máx. 0,62 s;
- Vértice: p50 **0,49 s**, máx. 0,52 s;
- no dia simultâneo, "papéis": p95 2,1 / 2,5 s.

**As travas novas não pioraram o tempo:** p50 e p95 ficaram iguais ou menores que os da rodada 1.

**Limite desta medição:** é um servidor único local (Next + PostgreSQL na mesma máquina, sem rede). Os números servem para **comparar rodadas**, não para prever a homologação real (Vercel + Neon). Isso fica para a R2.20.

R48-16 (desempenho): **melhorou e continua 🟡 aberto**, até medir no ambiente real.

## R2.15 Usabilidade (390 · 393 · 430 · 768 · 1440 px)

Roteiro `r8-usabilidade-v2`: **5 tamanhos** (celular 390, 393 e 430, tablet 768, desktop 1440) × 80 telas por tamanho = **400 combinações**.
- Cobalto em todos os papéis e amostra das outras 6 empresas.
- Inclui o detalhe do pedido de venda para Vendedor/Somente leitura e o detalhe e o documento visual da NF-e simulada.

| Verificação | Rodada 1 (169 combinações, 3 tamanhos) | Rodada 2 (400 combinações, 5 tamanhos) |
|---|---|---|
| Rolagem horizontal | 0 | **0** |
| Inglês visível | não medido assim | **0** (detector corrigido: "Total"/"Item" são português) |
| Código cru (status, permissão) visível | — | **0** |
| `undefined`/`NaN` visível | 0 | **0** |
| UUID visível | — | **0** |
| Botões sem nome acessível | 0 | **0** |
| **Chamadas de API com erro feitas pela própria tela** (R48-24) | Vendedor com 403 de locais de estoque no pedido | **0** em todas as 400. As 80 telas de pedido (Gerente, Vendedor, Compras, Somente leitura) também ✅ |
| Carga (p50 / p95 / máx.) | p50 0,8 s | **0,68 s / 0,96 s / 1,2 s** |
| **Alvos de toque < 32 px** (R48-30) | 67 telas (102 combinações) | **todas** as 320 combinações de celular/tablet têm ao menos um alvo pequeno: em média 23 por tela no celular e 37 no tablet. Típicos: ícones de linha, filtros, paginação |

O aumento do R48-30 **é de medição, não de piora**:
- agora são 5 tamanhos em vez de 3;
- o tablet também é medido;
- cada combinação conta.

Nada foi alterado no tamanho dos botões nesta rodada. **R48-30 continua 🔵 aberto** (melhoria de UX), com a sugestão de mínimo de 40 px no celular.

**Telas novas desta rodada** (detalhe da NF-e e documento simulado):
- sem rolagem horizontal nos 5 tamanhos;
- a tabela de itens do documento rola dentro da própria caixa;
- faixa e marca d'água visíveis no celular (`11-usabilidade/`, `02-fiscal-simulado/`).

## R2.16 Problemas — ficha completa

Commits (branch `claude/e2e-empresa-nova-correcoes`):

| Commit | Conteúdo |
|---|---|
| **`e4f34c7`** | migrations 0081, 0084, 0085, 0086, 0087 |
| **`514d11b`** | migrations 0082, 0083, 0088 (fiscal) |
| **`85fb136`** | aplicação: recebível e NF-e idempotentes, mensagens, RBAC, telas; ajuste fino da mensagem da 0081; testes unitários |
| **`4e39bb0`** | testes de banco |
| **`8d29f00`** | fiscal simulado na aplicação |
| **`3a74d43`** | R2-22 e R2-23 |
| **`4b54129`** | R2-24 |
| **`e8461ec`**, **`d1fe862`** | R2-25 |
| **`d198026`** | R2-26 |

Testes:
- **U** = `tests/rodada2-regressao.test.ts` (sem banco).
- **DB** = `tests/rodada2-integridade-db.test.ts` (PostgreSQL real, banco descartável).
- **E2E** = roteiros desta rodada, com sessões reais dos 48 usuários (`p1`…`p6`, `r3`…`r9`).

### Problemas da rodada 1 reproduzidos nesta rodada

**R48-01 · 🔴 CRÍTICO · Financeiro (contas a receber)**
- **Cenário:** duas pessoas (Financeiro e Gerente) geram a conta a receber do mesmo pedido ao mesmo tempo (ou duplo clique).
- **Passos:** pedido aprovado → `POST /api/sales-orders/:id/generate-receivable` duas vezes em paralelo, com sessões diferentes.
- **Esperado:** 1 título; o 2º recebe aviso de que o título já existe.
- **Encontrado (antes):** **6 de 8** execuções com **2 títulos ativos** para o mesmo pedido: Vértice 4/4, Sertão 2/4. O cliente seria cobrado em dobro.
- **Causa:** `fn_generate_accounts_receivable_from_sales_order` lia o pedido sem trava, procurava título e inseria (*check-then-act*). Não havia índice único na origem.
- **Correção:**
  - índice único parcial `accounts_receivable_origin_active_unique`;
  - trava `FOR UPDATE` no pedido;
  - `fn_generate_receivable_for_sales_order` diz se criou ou se já existia;
  - a API responde 201/200/409 com mensagem;
  - a tela mostra a mensagem do servidor;
  - a migration 0081 confere duplicatas antes e para se encontrar alguma. Os 6 pares locais foram cancelados antes pela API oficial.
- **Commit:** `e4f34c7` + `85fb136`.
- **Teste:**
  - DB "índice único recusa o 2º título ativo" e "geração idempotente diz se criou ou já existia";
  - U "resposta da geração do título" e "índices únicos com mensagem própria";
  - E2E `p1` E4 e `r5` E4.
- **Resultado:**
  - FAIL 6/8 → **PASS 8/8** (p1);
  - 3 rodadas da concorrência A–G com 1 título;
  - integridade "mais de uma conta a receber ativa por pedido" = 0.

**R48-06 (G1) · 🟠 ALTO · Logística (separação)**
- **Cenário/Passos:** Logística e Logística 2 criam a separação do mesmo pedido ao mesmo tempo.
- **Esperado:** 1 separação; o 2º recebe recusa clara.
- **Encontrado:** **8/8** com 2 separações abertas.
- **Causa:** `fn_create_pick_list` sem trava nem índice.
- **Correção:** trava no pedido e índice `pick_lists_open_per_order_unique`. Mensagem: "O pedido PV-0142 já tem a separação SEP-0072 em aberto. Use essa separação (ou cancele-a antes de criar outra)." (0081).
- **Commit:** `e4f34c7`.
- **Teste:** DB "2ª separação aberta recusada"; U índice único; E2E p1 G1, r5 G1.
- **Resultado:** FAIL 8/8 → **PASS 8/8**.

**R48-06 (G3) · 🟠 ALTO · Logística (expedição)**
- **Cenário/Passos:** duas expedições do mesmo pedido ao mesmo tempo, **e também em sequência** (G3b).
- **Esperado:** nunca expedir mais que o reservado.
- **Encontrado:** **8/8** com 2 expedições somando 8 unidades para 4 reservadas. Em sequência também passava (R2-02).
- **Causa:** `fn_create_shipment` não descontava as expedições abertas nem travava o pedido.
- **Correção:** trava, desconto das expedições abertas e mensagem com produto e quantidades (0081).
- **Commit:** `e4f34c7`.
- **Teste:** DB "2ª expedição recusada"; E2E p1 G3/G3b, r5 G3.
- **Resultado:** FAIL 8/8 → **PASS 8/8**, mais G3b 2/2.

**R48-11 · 🟡 MÉDIO · Estoque (reservas)**
- **Cenário:** a reserva continuava "active" depois de o pedido ser expedido.
- **Esperado:** a expedição consome a reserva.
- **Encontrado:** 2/2 reproduções. **30** reservas ativas de pedidos expedidos e **45** divergências entre saldo reservado e reservas.
- **Causa:** a expedição baixava o saldo mas não marcava a reserva.
- **Correção:**
  - `consumed_quantity` por item;
  - `fn_consume_sales_order_reservation` (FIFO);
  - a reserva vira "consumed" quando termina;
  - ajuste das reservas antigas de pedidos já expedidos (0081).
- **Commit:** `e4f34c7`.
- **Teste:** DB "expedição consome a reserva"; E2E p1 R11; integridade "reservado no saldo = reservas ativas não consumidas".
- **Resultado:** FAIL → **PASS**. Divergências 45 → **0**; reservas fantasmas 30 → **0**.

**R48-15 · 🟡 MÉDIO · Estoque (corrida de reserva)**
- **Cenário:** duas reservas simultâneas (8 + 7) com saldo 10.
- **Esperado:** nunca passar do saldo; o perdedor fica com o que sobrou, como acontece em sequência.
- **Encontrado:** **8/8**: o perdedor recebia 422 "Reserva de 7.0000 excede o saldo disponível." e ficava sem nada.
- **Causa:** leitura do saldo sem trava.
- **Correção:** `FOR UPDATE` nas linhas de saldo, em ordem determinística por produto (0081).
- **Commit:** `e4f34c7`.
- **Teste:** E2E p1 C, r5 C/C4. O teste DB é sequencial e passa também sem a correção (R2.17).
- **Resultado:** FAIL 8/8 → **PASS 8/8** (reservado 10 de 10).

**R48-17 · 🔵 BAIXO · Mensagens**
- **Encontrado:** UUID na mensagem da expedição ("Item 79623d82-…: quantidade a expedir (5) excede…").
- **Correção:** código e nome do produto (`fn_product_label`), mais o filtro de UUID na API.
- **Commit:** `e4f34c7` + `85fb136`.
- **Teste:** U "sem UUID interno"; DB "mensagens sem UUID"; E2E p1 M17.
- **Resultado:** **FAIL 2/2 → PASS 2/2.**

**R48-22 · 🔵 BAIXO · Mensagens**
- **Encontrado:** quantidades como "8.0000" e "4.0000".
- **Causa:** `numeric(16,4)` convertido em texto.
- **Correção:** `fn_fmt_qty` no banco e `formatDbQuantity` na API.
- **Commit:** `e4f34c7` + `85fb136`.
- **Teste:** U "R48-22".
- **Resultado:** **FAIL → PASS.**

**R48-23 · 🔵 BAIXO · Auditoria**
- **Encontrado:** o convite do Owner aparecia como `platform:OWNER:owner@…`.
- **Correção:** a tela mostra "Owner da plataforma (owner@…)" (`auditActorLabel`).
- **O que continua:** o `user_id` nulo continua no dado, porque o Owner não é usuário da empresa.
- **Commit:** `85fb136`.
- **Teste:** U "R48-23".
- **Resultado:** **exibição FAIL → PASS.**

**R48-24 · 🔵 BAIXO · Comercial**
- **Encontrado:** o Vendedor recebia 403 de "locais de estoque" ao abrir o pedido.
- **Causa:** a tela buscava os locais para todos os usuários.
- **Correção:** a tela só busca quando o usuário pode reservar.
- **Commit:** `85fb136`.
- **Teste:** E2E usabilidade (coluna "API com erro" nas telas de pedido do Vendedor).
- **Resultado:** **0** chamadas com erro nas 80 telas de pedido (Gerente, Vendedor, Compras, Somente leitura) × 5 tamanhos — ✅ corrigido.

**R48-26 · 🔵 BAIXO · Administração (RBAC)**
- **Cenário:** usuário sem `users.read` chama `GET /api/admin/users`.
- **Esperado:** 403.
- **Encontrado:** 200 com o próprio registro (25 casos no RBAC da rodada 1). Não havia vazamento: a RLS só devolve a própria linha.
- **Causa:** o handler não checava a permissão e dependia só da RLS.
- **Correção:** `hasPermission(…, "users.read")` antes da consulta → 403 "Você não tem permissão para esta operação (Usuários — Ler)."
- **Commit:** `85fb136`.
- **Teste:** U "R48-26"; E2E RBAC dos 48 usuários.
- **Resultado:** FAIL 25 (rodada 1) → **403 × 25** nas duas execuções do RBAC (A e final).

**R48-29 · 🔵 BAIXO · Validação**
- **Encontrado:** texto técnico "(ex.: 10,50 → 10.50)".
- **Correção:** "Informe … só com números, com ponto antes dos centavos (ex.: 10.50)."
- **Commit:** `85fb136`.
- **Resultado:** **ajustado.**

**R48-31 · 🔵 BAIXO · Navegação**
- **Encontrado:** menu e títulos com "Picking"/"Packing".
- **Correção:** "Separação"/"Embalagem". A busca por "picking"/"packing" continua achando as telas.
- **Commit:** `85fb136`.
- **Teste:** U "R48-31" (menu e títulos).
- **Resultado:** **FAIL → PASS.**

**B15 · 🔵 BAIXO · Mensagens**
- **Encontrado:** 403 da API com "(stock.adjust)".
- **Correção:** permissão por extenso, "(Estoque — Ajustar)".
- **Commit:** `85fb136`.
- **Teste:** U "403 genérico sem o código"; E2E r7.
- **Resultado:** **FAIL → PASS.**

**B18 · 🔵 BAIXO · Comercial**
- **Encontrado:** o item do pedido não herdava a unidade do produto e gravava nulo (2/2).
- **Causa:** a função de criação não lia `products.unit`.
- **Correção:** gatilho `fn_item_unit_from_product` nos itens de pedido e de orçamento, com ajuste dos itens antigos (0085).
- **Commit:** `e4f34c7`.
- **Teste:** DB "B18"; E2E p1 B18.
- **Resultado:** **FAIL (nulo) → PASS ("CX") 2/2.**

**R48-04 · ⚪ DECISÃO DE NEGÓCIO (risco de segregação de funções) · RBAC**
- O papel de sistema **Operador** pode criar conta a pagar, baixar parcela a receber e criar NCM.
- Reconfirmado nesta rodada: **21 divergências** (7 Operadores × 3 operações; a Ferrix tem 2 Operadores) nas duas execuções do RBAC.
- **Não alterado**, porque a decisão é sua.

### Problemas novos desta rodada

**R2-01 · 🟠 ALTO · Comercial (cancelamento)**
- **Cenário:** cancelar pedido que já passou da reserva (em separação ou pronto para expedir).
- **Esperado:** cancelar e liberar a reserva, ou recusar dizendo o que impede.
- **Encontrado:** 422 genérico "Um dos valores informados não é permitido…", com a reserva presa (H1 e H1c, 2/2 cada).
- **Causa:** `fn_cancel_sales_order` só aceitava "aprovado/reservado", e o status inválido caía na restrição da tabela.
- **Correção (0081):**
  - sem separação ou expedição aberta: cancela e libera o restante;
  - com tarefa aberta: recusa nomeando a tarefa ("a separação SEP-0082 está em aberto. Cancele a separação antes…") — decisão R2-16;
  - a tela passou a oferecer o cancelamento nessas situações.
- **Commit:** `e4f34c7` + `85fb136`.
- **Teste:** DB "R2-01" (3 testes); E2E p1 H1/H1c.
- **Resultado:** FAIL → **PASS**.

**R2-02 · 🟠 ALTO · Logística**
- **Encontrado:** a 2ª expedição **em sequência** (sem concorrência) com a mesma quantidade era aceita (G3b, 2/2).
- **Causa e correção:** ver R48-06 G3 (desconto das expedições abertas).
- **Commit:** `e4f34c7`.
- **Teste:** DB G3/R2-02; E2E p1 G3b.
- **Resultado:** **FAIL → PASS.**

**R2-03 · 🟡 MÉDIO · Logística**
- **Encontrado:** a expedição podia ser criada a partir de um local onde a reserva era de **outro** pedido (H2, 2/2 → 201). Só era barrada no envio.
- **Correção:** a criação exige reserva livre **deste** pedido naquele local: "…não tem reserva suficiente neste local… Expeça do local onde o estoque foi reservado." (0081).
- **Commit:** `e4f34c7`.
- **Teste:** DB "R2-03"; E2E p1 H2.
- **Resultado:** **FAIL → PASS.**

**R2-04 · 🟠 ALTO · Fiscal**
- **Encontrado:** o papel Fiscal **não conseguia numerar** a NF-e, porque a numeração exigia permissão de configuração.
- **Correção:** `fn_assign_fiscal_document_number` com a permissão de cálculo; a sequência interna fica sem permissão exposta (0083).
- **Commit:** `514d11b`.
- **Teste:** DB "R2-04/05/06" (falha sem a 0083); E2E p2 N1.
- **Resultado:** **FAIL → PASS.**

**R2-05 · 🟡 MÉDIO · Fiscal**
- **Encontrado:** documento "pronto" sem número ficava travado e não podia mais ser numerado.
- **Correção:** permitir numerar em DRAFT/CALCULATED/READY/REJECTED (0083).
- **Commit:** `514d11b`.
- **Teste:** DB; E2E N2.
- **Resultado:** **FAIL → PASS.**

**R2-06 · 🟡 MÉDIO · Fiscal**
- **Encontrado:** numerar duas vezes trocava o número e abria buraco na série.
- **Correção:** recusa com "já tem o número" (0083).
- **Commit:** `514d11b`.
- **Teste:** DB; E2E N3.
- **Resultado:** **FAIL → PASS.**

**R2-07 · 🟠 ALTO · Fiscal**
- **Encontrado:** a autorização **manual** aceitava documento sem número e qualquer texto como chave ("123").
- **Correção:** exige número, chave de 44 dígitos com DV válido e o número dentro da chave (0083).
- **Commit:** `514d11b`.
- **Teste:** DB "R2-07"; E2E N4.
- **Resultado:** **FAIL → PASS.**

**R2-08 · 🟠 ALTO · Fiscal**
- **Encontrado:** dois documentos de SAÍDA podiam ter o mesmo número e série no estabelecimento.
- **Correção:** índice único `fiscal_documents_own_number_unique`, com pré-checagem que para se houver repetição (0083).
- **Commit:** `514d11b` + `85fb136` (mensagem).
- **Teste:** DB "R2-08"; U mensagem; E2E N5; integridade "número repetido".
- **Resultado:** **FAIL → PASS.**

**R2-09 · 🟠 ALTO · Fiscal (configuração)**
- **Encontrado:** sem série de numeração a NF-e não pode ser numerada, mas o checklist da primeira NF-e dizia "pronto". Não há tela para criar série.
- **Corrigido:** o checklist cita a série (`fiscal_series`).
- **Aberto:** tela de séries e número inicial (⚪ decisão).
- **Commit:** `514d11b` + `8d29f00`.
- **Teste:** U `fiscal-setup` "R2-09"; E2E p2 S0.
- **Resultado:** **parcial.**

**R2-10 · 🟡 MÉDIO · Logística (entrega)**
- **Cenário:** duas confirmações de entrega simultâneas da mesma expedição.
- **Encontrado:** com 2 conexões reais ao banco sem a 0084 (`p6-entrega-dupla`): **ok/ok e 2 eventos "entregue"**.
- **Causa:** `fn_confirm_delivery` e `fn_fail_delivery` sem trava.
- **Correção:** `FOR UPDATE` na expedição; o 2º recebe "…(situação atual: Entregue)" (0084).
- **Commit:** `e4f34c7`.
- **Teste:** E2E p6 (antes × depois), r5 G3 ("entregar 2×" → 1 evento); integridade "mais de um evento entregue".
- **Resultado:** **FAIL → PASS** (1 evento).

**R2-11 · 🔵 BAIXO · Mensagens**
- **Encontrado:** mensagens do banco com código de status ("status atual: shipped"), permissões por código e números com 4 casas.
- **Correção:** `humanizeErrorMessage` aplicada a toda resposta de erro da API. O rótulo é escolhido pela entidade citada na frase.
- **Commit:** `85fb136`.
- **Teste:** U (8 testes); E2E p1 R11b ("situação atual: Expedido").
- **Resultado:** **FAIL → PASS.**

**R2-12 · 🟡 MÉDIO · Fiscal (impostos)**
- **Encontrado:** a NF-e é autorizada (na simulação) **sem nenhum imposto calculado**. O banco local tem **0 regras tributárias** e o checklist da 1ª NF-e não as exige.
- **Não corrigido:** criar regras tributárias é decisão fiscal/contábil (regime, CST/CSOSN, alíquotas por UF/NCM). Não inventei regras.
- **Situação:** **aberto**, com recomendação.

**R2-13 · 🔵 BAIXO · Fiscal (linha do tempo)**
- **Encontrado:** eventos gravados na mesma transação tinham o **mesmo horário**, e a linha do tempo podia inverter a ordem.
- **Causa:** default `now()` (início da transação).
- **Correção:** `clock_timestamp()` (0088).
- **Commit:** `514d11b`.
- **Teste:** DB "R2-13" (FAIL sem a 0088).
- **Resultado:** **FAIL → PASS.** Eventos antigos não foram reescritos.

**R2-17 · 🔵 BAIXO · Financeiro (validação)**
- **Encontrado:** parcelas que não somam o total respondiam **409** (conflito de situação) em vez de **422** (dado inválido). A mensagem já era clara.
- **Correção:** classificação no mapeamento do Financeiro.
- **Commit:** `85fb136`.
- **Teste:** U "R2-17"; E2E r7 (3 empresas).
- **Resultado:** FAIL (409 × 3, rodada 1) → **PASS 422 × 3** nas duas execuções do r7.

**R2-18 · 🟡 MÉDIO · Auditoria (cobertura)**
- **Cenário:** filtrar a trilha por autor e ação para saber quem criou um pedido.
- **Esperado:** criação e envio para aprovação aparecem na trilha.
- **Encontrado:** pedido de venda, orçamento, solicitação e pedido de compra **não tinham linha de criação** (140 pedidos de venda e 7 pedidos de compra, 0 linhas "Criação"). A trilha começava na aprovação; o autor existia só em `created_by`.
- **Causa:** as funções de criação não gravavam auditoria.
- **Correção (0086):**
  - gatilhos `AFTER INSERT` (CREATE) nas 4 tabelas;
  - SUBMIT na transição rascunho → pendente;
  - ação SUBMIT ("Envio para aprovação") incluída na lista de ações;
  - autor = usuário da sessão.
- **Commit:** `e4f34c7` + `85fb136` (rótulo).
- **Teste:** DB "R2-18" (FAIL sem a 0086); U rótulo; E2E p4.
- **Resultado:** FAIL → **PASS** na verificação final, 100% dos pedidos criados depois da 0086 têm CREATE com o autor certo e SUBMIT quando enviados: Vértice 93/93 (89/89), Sertão 93/93 (89/89), Cobalto 21/21 (16/16). Linhas antigas não foram recriadas, porque a trilha não é reescrita.

**R2-19 · 🔵 BAIXO · Fiscal (resposta da geração)**
- **Cenário:** Fiscal e Gerente geram a NF-e do mesmo pedido ao mesmo tempo (S7).
- **Esperado:** 1 documento, e só quem criou recebe "criado".
- **Encontrado (execução perdida):** **201 / 201** e 1 documento. Não houve duplicidade, mas o 2º recebeu "criado" para um documento que não criou.
- **Causa:** `fn_create_fiscal_document` devolve o documento existente sem dizer que já existia.
- **Correção:** `fn_generate_fiscal_document_for_sales_order` (trava, permissão, diz se criou) e API 201/200 (0087).
- **Commit:** `e4f34c7` + `85fb136`.
- **Teste:** DB "R2-19"; U "R2-19"; E2E p2 S7 (exatamente uma resposta 201).
- **Resultado:** **PASS** nas 2 empresas.

**R2-20 · 🔵 BAIXO · Mensagens**
- **Encontrado:** "Saldo insuficiente: disponível 2.672 em estoque, solicitado 99999." Um número formatado, o outro não.
- **Correção:** formatação das quantidades depois de "solicitado", "disponível" e "reservado".
- **Commit:** `85fb136`.
- **Teste:** U "R2-20"; E2E r7.
- **Resultado:** FAIL ("solicitado 99999") → **PASS** no r7 final: "Saldo insuficiente: disponível 2.672 em estoque, solicitado 99.999." (3 empresas).

**R2-21 · 🔵 BAIXO · Ferramentas de desenvolvimento**
- **Encontrado:** `supabase/seed.sql` não roda no esquema atual: os locais de estoque exigem `warehouse_id` e o seed não informa.
- **Situação:** **aberto.** Não afeta produção. Os testes de banco desta rodada usam fixtures mínimas próprias.

**R2-22 · 🔵 BAIXO · Auditoria (RBAC)**
- **Cenário:** usuário sem `audit_logs.read` chama `GET /api/admin/audit` (RBAC dos 48 usuários).
- **Esperado:** 403, como as demais operações negadas.
- **Encontrado:** **200 com lista vazia** para os **25** usuários sem a permissão: Vendedor 8, Financeiro 6, Logística 4, Fiscal 4, Compras 3. Não há vazamento, porque a RLS filtra. O roteiro da rodada 1 aceitava "lista vazia" como negação, por isso o caso não aparecia como FAIL. É o mesmo padrão do R48-26: parece "não aconteceu nada" em vez de "você não pode ver".
- **Causa:** o handler não conferia a permissão; dependia só da RLS.
- **Correção:** `hasPermission(…, "audit_logs.read")` antes da consulta → 403 "Você não tem permissão para esta operação (Auditoria — Ler)."
  - As telas que usam essa rota já são restritas a quem tem a permissão: a tela de auditoria e o mapa de calor do painel.
  - O histórico do registro usa outra rota (`/api/audit-logs`).
- **Commit:** `3a74d43`.
- **Teste:** U "R2-22" (FAIL antes); E2E RBAC 48 usuários na build final.
- **Resultado:** FAIL 25 (200 vazio, execução A) → **403 × 25** "(Auditoria — Ler)" na execução final, 0 "200 vazio" na matriz.

**R2-23 · 🔵 BAIXO · Mensagens (permissões)**
- **Encontrado:** ao testar o R2-22, o 403 saiu como "(Audit logs — Ler)".
- **Causa:** 28 códigos de permissão têm prefixo diferente do recurso do catálogo ("audit_logs.read", "roles.manage", "units.read", "settings.company.update", "controlling.budget.create"…), e o texto caía no nome técnico humanizado em inglês: "Brands — Criar", "Controladoria — Budget create".
- **Correção:**
  - rótulos para os prefixos;
  - para códigos de 3 partes, a divisão recurso/ação que existe nos mapas, por exemplo "Configurações da empresa — Editar".
- **Commit:** `3a74d43`.
- **Teste:** U "R2-23" (15 códigos).
- **Resultado:** **FAIL 14/15 → PASS 15/15.**

**R2-24 · 🔵 BAIXO · Mensagens (financeiro)**
- **Encontrado (r7, 3 empresas):** "Recebimento (999999) excede o saldo da parcela (670,02)." Um valor formatado e o outro não, nenhum em R$.
- **Causa:** o banco devolve os dois `numeric` crus; a formatação de 4 casas pegava só o segundo.
- **Correção:** os valores depois de "Pagamento", "Recebimento", "soma das parcelas", "saldo da parcela" e "valor atualizado do título" saem em R$. Exemplo: "Recebimento (R$ 999.999,00) excede o saldo da parcela (R$ 670,02)."
- **Teste:** U "R2-24" (FAIL antes).
- **Ajuste justificado em teste existente:** o teste do R48-22 esperava "(670,02)" e passou a esperar "(R$ 670,02)". O objetivo dele, sem "670.0200", continua verificado.
- **Commit:** `4b54129`.
- **Resultado:** FAIL (r7 execução A, 3 empresas) → **PASS** no r7 final: "Recebimento (R$ 999.999,00) excede o saldo da parcela (R$ 670,02)." e "A soma das parcelas (R$ 90,00) não corresponde ao valor atualizado do título (R$ 100,00).".

**R2-25 · 🔵 BAIXO · Fiscal (documento simulado e detalhe)**
- **Encontrado** (captura no celular da NF-e de entrada, conta Fiscal da Vértice): "Origem: —", como se o documento não tivesse origem.
- **Causa:** o papel Fiscal dessa empresa não tem "Recebimentos — Consultar". A RLS devolve o código vazio, e a tela tratava "vazio" como "sem origem".
- **Correção:** "Recebimento de compra (código visível só para quem acessa Recebimentos)", no documento simulado e no detalhe. O código não é revelado a quem não pode vê-lo.
- **Commits:** `e8461ec` + `d1fe862`.
- **Teste:** U "R2-25" (3 verificações, FAIL antes); E2E captura no celular.
- **Resultado:** **FAIL → PASS** — capturas no celular e no tablet antes (`02-fiscal-simulado/08-…-antes-R2-25.png`, "Origem: —") e depois ("Recebimento de compra (código visível só para quem acessa Recebimentos)").

**R2-26 · 🔵 BAIXO · Fiscal (linha do tempo)**
- **Encontrado** (mesma captura do R2-25): o evento "Calculado" mostrava "Total: 337.5000 (produtos 337.5000 + impostos 0)". Havia 59 eventos assim no banco local.
- **Causa:** a função de cálculo (migrations 0039/0041, anteriores a esta rodada) grava o `numeric` cru no texto do evento.
- **Correção:** a tela formata os valores em R$, "Total: R$ 337,50 (produtos R$ 337,50 + impostos R$ 0,00)". O histórico **não** é reescrito.
- **Commit:** `d198026`.
- **Teste:** U "R2-26" (2 testes, FAIL antes).
- **Resultado:** **FAIL → PASS**. Captura do tablet depois (`08-vertice-detalhe-tablet-768.png`) e antes (`…-antes-R2-26.png`).

## R2.17 Falsos positivos do harness (não contados como bug)

Cada item abaixo foi **identificado na execução perdida** (salvo indicação) e o roteiro corrigido; a reexecução já usou o roteiro corrigido. A versão antiga de cada roteiro está nos roteiros da rodada 1 (`evidencias/teste-48-usuarios/roteiros/`), que não foram alterados.

| Onde | O que parecia | Por que era do roteiro | O que foi feito |
|---|---|---|---|
| R11b (reprodução) | "liberar reserva de pedido expedido" → 404 | o roteiro chamou `/release`; a rota real é `/release-reservation` | rota corrigida; o sistema recusa com 422 "Este pedido não tem reserva ativa para liberar (situação atual: Expedido)." |
| Testes de banco | 17 testes "cancelados" | conexão com `neondb_owner`, que não é dono das tabelas e cai na RLS ao montar os dados | rodados com o dono do banco local (como na rodada 1) |
| Concorrência A (edição simultânea) | "as duas gravações deveriam prevalecer" | critério da rodada 1, anterior ao bloqueio otimista (R48-02, corrigido na rodada 1) | critério = as duas gravam (campos diferentes) **ou** uma grava e a outra recebe 409; gravação com versão velha tem de receber 409. Nada pode se perder em silêncio |
| Concorrência F2 | "autorização simultânea: ≤ 1" passava com **0** | as chaves do roteiro eram inventadas; a 0083 as recusa e o passo deixara de testar a corrida | chave válida (a mesma regra da simulação); critério **mais rígido**: exatamente 1 autoriza |
| Concorrência F1 / E4 | "≤ 1 documento / título" | não verificava a resposta | F1: exatamente uma resposta 201; E4: contagem de títulos ativos no banco |
| Integridade | 3 FAIL, incl. auditorias "sem autor" | o corte "antes × depois" usava data errada e comparava datas como texto | corte = instante em que as migrations foram aplicadas (`cut-0081.txt`); violações antigas continuam **contadas** como histórico, e as regras que não admitem histórico (duplicidades, vazamento) exigem **zero total** |
| Sonda B18 | "Escolha uma opção válida para o produto" | o roteiro repetiu o código do produto (409) e o pedido ficou sem produto | código único; resultado real: unidade "CX" |
| Erros — busca `' or 1=1 --` (3 empresas) | 200 "sem mensagem" = FAIL | lista vazia é a resposta certa; o classificador ignorava a opção `instr:false` da própria sonda | classificador corrigido |
| Erros — "Vendedor tenta aprovar" (Prisma) e "Somente leitura cria cliente" (Lince) | 409/422 em vez de 403 | a empresa não tem esse papel; o roteiro **trocava pelo Gerente** (que pode) | sem troca: "N/A — a empresa não tem o papel" |
| Erros — "saída avulsa maior que o saldo" (Mares, Lince) | 403 em vez de 409/422 | o Operador dessas empresas não tem "Estoque — Ajustar": testava a permissão, não o saldo | saldo testado com o Gerente **e** a permissão do Operador testada à parte (403 por extenso) |
| Erros — "reservar sem estoque" (3 empresas) | 200 "sem mensagem" | o produto "zerado" tinha recebido estoque no dia simulado da rodada 1 e o critério procurava texto no JSON | pré-condição conferida (disponível no local = 0) e critério pela reserva **deste** pedido + situação "Reserva pendente" |
| Usabilidade — detector de inglês | "Total" e "Item" como palavras em inglês | as duas são português | removidas da lista; as demais palavras continuam |
| Auditoria R2-18 (Cobalto) | "0 pedidos com CREATE" | a Cobalto não criou pedido depois da 0086 | "N/A — sem dados" (a regra só se aplica a pedidos criados depois da migration) |
| R48-15 (teste de banco) | o teste passa **também** sem a 0081 | o caminho sequencial já era correto; a corrida só aparece com duas conexões | teste renomeado para "(sequencial; a corrida real é comprovada no E2E)"; a prova FAIL → PASS da corrida é o p1 C (8/8 → 0/8 falhas) |

**O que NÃO foi tratado como falso positivo:**
- **"Soma das parcelas" com 409** era do sistema (R2-17).
- **S7 201/201** era do sistema (R2-19).
- **R48-26** era do sistema: o 200 com o próprio registro foi trocado por 403.
- **Seed:** `supabase/seed.sql` **não roda** no esquema atual: os locais de estoque exigem `warehouse_id` e o seed não informa. É um problema pré-existente, R2-21 🔵, registrado e não corrigido nesta rodada. Os testes de banco usam fixtures mínimas próprias.

## R2.18 Migrations aplicadas no ambiente LOCAL

| Migration | Para quê | Conferência prévia | Ajuste de dados |
|---|---|---|---|
| `0081_integridade_pedido_recebivel_logistica.sql` | recebível único e idempotente; separação única aberta; expedição sem excesso e no local reservado; reserva consumida; corrida de reserva; cancelamento depois da separação; mensagens com produto e sem 4 casas | **para** se houver título ativo duplicado ou separação aberta duplicada | reservas de pedidos já expedidos/concluídos → `consumed` (30 no banco local) |
| `0082_fiscal_simulado.sql` | provedor SIMULACAO, validação SIM-1xx, chave/protocolo simulados, cancelamento simulado | — | — |
| `0083_fiscal_numeracao_e_autorizacao.sql` | Fiscal numera; numerar depois da conferência; não renumerar; número de saída único; autorização manual exige número e chave válida; checklist conta a série | **para** se houver número de saída repetido | — |
| `0084_entrega_sem_duplicidade.sql` | trava na confirmação/falha de entrega | — | — (eventos duplicados antigos ficariam como histórico) |
| `0085_unidade_do_item_herda_do_produto.sql` | item do pedido/orçamento herda a unidade do produto | — | itens antigos sem unidade completados pela unidade do produto |
| `0086_auditoria_criacao_documentos.sql` | CREATE na trilha para pedido de venda, orçamento, solicitação e pedido de compra; SUBMIT no envio para aprovação; ação SUBMIT na lista permitida | — | — (trilha antiga não reescrita) |
| `0087_nfe_do_pedido_idempotente.sql` | gerar NF-e do pedido diz se criou ou já existia (trava no pedido) | — | — |
| `0088_eventos_fiscais_em_ordem.sql` | horário real (`clock_timestamp()`) nos eventos fiscais | — | — |

**Nenhuma foi aplicada em produção nem na homologação real.** Antes de aplicar lá: rodar as consultas de conferência (títulos ativos duplicados por pedido, separações abertas duplicadas, números de saída repetidos) e decidir o tratamento de cada caso **antes**. A 0086 recria a lista de ações permitidas da auditoria (inclui SUBMIT): aplicar junto com a versão da aplicação que traz o rótulo "Envio para aprovação".

## R2.19 Decisões que são suas (não decidi sozinho)

| ID | Questão | Situação atual (mantida) | O que eu recomendaria (só recomendação) |
|---|---|---|---|
| R48-04 | O papel de sistema **Operador** pode criar conta a pagar, baixar parcela a receber e criar NCM | permitido pela configuração. **Não alterado**, como pedido | rever com o dono do processo financeiro; se a resposta for "não", é uma migration de permissões do papel de sistema |
| R48-27 / B11 | Pedido entregue deve virar "Concluído"? | continua "Expedido" (nenhuma função grava "Concluído") | definir quando o pedido conclui (entrega confirmada? faturado + entregue?) |
| D1 | pendente desde a rodada das 7 empresas | não reavaliado nesta rodada | — |
| R2-09 | Tela de séries de numeração e número inicial da série | o checklist da 1ª NF-e agora cita a série; a série é criada pela rota de configuração (o roteiro usou a rota oficial) | tela própria, com número inicial — importante em migração de outro sistema |
| R2-12 | Regras tributárias padrão e sua exigência no checklist | sem regras: a NF-e simulada sai **sem imposto** | definir as regras com o contador; incluir "regras tributárias" no checklist (ou ao menos um alerta) |
| R2-14 | A autorização **manual** (informar chave e protocolo) deve existir fora da homologação? | existe, agora exigindo número e chave válida (R2-07) | restringir a um papel/situação de contingência ou remover quando houver provedor real |
| R2-15 | Pode gerar outro título para o mesmo pedido depois de cancelar o primeiro? | não gera automaticamente; responde 409 explicando (lançar avulso) | decidir se "regerar após cancelar" é permitido e por quem |
| R2-16 | Cancelar pedido com separação/expedição aberta: recusar ou cancelar em cascata? | recusa nomeando a tarefa aberta ("cancele a separação SEP-… antes") | manter a recusa (mais segura) ou cascata com confirmação |

## R2.20 O que ainda precisa ser testado na homologação real

1. **Antes de aplicar 0081–0088 na homologação real:** rodar as consultas de conferência (R2.4 e R2.18) no banco de homologação e tratar as duplicatas existentes **pela aplicação** (cancelamento com autor), não por SQL direto. A 0081 para sozinha se encontrar duplicata.
2. **Banco Neon real com latência de rede:** as travas novas (`FOR UPDATE`) serializam operações no **mesmo** pedido/saldo; aqui a rede é local. Repetir a concorrência A–G e o "dia simultâneo" contra o Neon de homologação e comparar p95.
3. **Neon Auth real** (aqui foi o dublê): convite, primeiro acesso, troca de senha e expiração de sessão com os 48 usuários.
4. **E-mail real** (aqui, caixa local): entrega dos convites e links.
5. **Vercel (homologação):** funções serverless frias, *timeouts* e o tempo de `/api/admin/roles` com o número real de empresas.
6. **Fiscal:** NF-e **com desconto ≠ 0**, frete e outras despesas; NF-e com regras tributárias reais (depois de R2-12); devolução/entrada com fornecedor de outro estado; cancelamento fora do prazo de 24 h (aqui só pela regra no banco).
7. **Celular real** (iOS/Android) além das larguras do navegador: teclado numérico, alvos de toque (R48-30) e rolagem das tabelas.
8. **Navegadores:** aqui só Chromium.
9. **Volume:** listas com milhares de registros (paginação, exportação CSV) — a massa local tem centenas.
10. **Decisões da R2.19**, depois de tomadas.
