# Relatório — Teste com 48 usuários em 7 empresas (ATLAS.ERP)

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
