# Aula 07 — Fiscal

> Plano de produção. Validado no código (`48775f5`) e ao vivo no ambiente local em 02/10/2026.
> Padrões comuns: [PADRAO-DE-PRODUCAO.md](../PADRAO-DE-PRODUCAO.md) · mapeamento: [MAPEAMENTO.md](../MAPEAMENTO.md).

## 1. Identidade da aula

| | |
|---|---|
| **Número** | 07 |
| **Título** | Fiscal — preparar a primeira NF-e e acompanhar o documento |
| **Personagem** | **Lucas** |
| **Papel real** | **Fiscal** (papel personalizado) |
| **Duração estimada** | 11–12 min ("aula de acompanhamento", README decisão 1-A) |
| **Nível** | Intermediário |
| **Cobertura** | 🔎 painel com a checklist "Preparação para a primeira NF-e" e listas (Notas fiscais, NF-e, NCM, CFOP, Regras tributárias, Faturamento) · ⛔ estabelecimento, CFOP, natureza de operação, NCM, perfil fiscal do produto, gerar, calcular e marcar "Pronta" (B2, D3) · **autorização na SEFAZ: indisponível neste ambiente** (sem provedor nem certificado) |
| **Objetivo principal** | Entender o que a empresa precisa ter para emitir a primeira NF-e, ler a checklist do painel Fiscal, acompanhar o documento de Rascunho até Pronta e saber exatamente onde esta versão para. |

## 2. Contexto de negócio

> Sexta-feira, 8h30. O pedido do Granito sai hoje para Santos. Antes do caminhão, precisa existir a nota fiscal.
>
> É a primeira NF-e da Órbita no ATLAS.ERP. O Lucas, do fiscal, abre o painel e encontra a checklist toda pendente: a empresa ainda não disse ao sistema quem emite a nota, com qual CFOP, em qual natureza de operação, nem qual é o NCM de cada produto.

## 3. O que o aluno vai aprender

- O que precisa existir antes da primeira NF-e: **estabelecimento emitente**, **CFOP**, **natureza de operação com CFOP padrão**, **NCM** e **perfil fiscal do produto**.
- Ler a checklist "Preparação para a primeira NF-e" e saber o que cada item significa.
- Por que o NCM do **cadastro do produto** não basta: a NF-e usa o NCM do **perfil fiscal** (D3).
- O caminho do documento: **Rascunho → Calculada → Pronta → (Autorizada)**.
- Onde acompanhar: Notas fiscais, NF-e e Comercial → Faturamento.
- Ler a mensagem de erro que orienta a correção quando falta o perfil fiscal.
- Onde esta versão para (Pronta) e por quê.

## 4. Conceito antes da tela

| Pergunta | Resposta |
|---|---|
| O que é | O módulo que transforma uma operação (venda, compra, devolução) em documento fiscal, com a classificação e a tributação corretas. |
| Por que existe | Mercadoria não circula sem nota. A nota precisa dizer quem vende (estabelecimento), o que é vendido (NCM), em que operação (natureza e CFOP) e com qual tributação (regras). Se faltar um desses dados, a nota não sai. |
| Quem executa | **Fiscal** (e Gerente, Administrador): configura a base fiscal, gera, calcula e prepara a NF-e. O Operador também cria NF-e e NCM (⚠️ B9). Vendedor e Financeiro não acessam. |
| Módulo responsável | Fiscal (`/app/fiscal`) |
| Quem recebe o resultado | Comercial (Faturamento e o campo "Documento fiscal" do pedido), Logística (a mercadoria sai com a nota, aula 08), Auditoria (criação e alterações do documento). |

**A base fiscal, peça por peça** (quadro da cena C):

| Peça | O que diz | Exemplo da Órbita |
|---|---|---|
| Estabelecimento emitente | Quem emite: CNPJ e regime tributário | Órbita Distribuidora — Matriz · 48.271.093/0001-15 · Simples Nacional |
| CFOP | O tipo de operação | 5102 — Venda de mercadoria adquirida ou recebida de terceiros |
| Natureza de operação | O nome da operação e o CFOP padrão | "Venda de mercadoria" → 5102 |
| NCM | A classificação da mercadoria | 39249000 |
| Perfil fiscal do produto | O NCM (e a origem) que a nota usa para cada produto | BAL-08 → 39249000, origem 0 |

**Quem pode o quê** (permissões reais): o Fiscal cria estabelecimento, CFOP, natureza, NCM e perfil fiscal, gera, calcula, marca "pronta" e (num ambiente com provedor) autoriza. **Regras tributárias**: o Fiscal só consulta; criar é do Gerente e do Operador.

## 5. Roteiro de navegação

```
PERSONAGEM: Lucas — Fiscal · sexta, 8h30

1. Entrar
   Rota: /login → /app
   Resultado: menu do papel: Painéis (Executivo, Fiscal), Pedidos de venda, Faturamento,
   Fiscal (Notas fiscais, NF-e, NCM, CFOP, Regras tributárias), Relatórios.
   ⚠️ B6/D11 no cartão "Resumo" do Início (igual à aula 06).

2. Painel Fiscal — antes
   Rota: /app/fiscal
   Tela: "Fiscal — Documentos fiscais, classificação e regras tributárias."
   Resultado: "Painel da área" (Documentos, Autorizados, Pendentes, Rejeitados) e
   "Preparação para a primeira NF-e — O que a empresa precisa ter cadastrado para gerar
   a NF-e de um pedido." com os cinco itens pendentes:
     Estabelecimento emitente (CNPJ e regime tributário)
     CFOP das operações de venda
     Natureza de operação de saída com CFOP padrão
     NCM dos produtos vendidos
     Produtos ativos com NCM no perfil fiscal

3. ⛔ Base fiscal — preparada fora da interface
   Quadro: "Nesta versão, os cadastros fiscais não têm tela. Foram registrados por
   integração pelo Lucas (Fiscal)."
   Rotas de conferência:
     /app/fiscal/cfop → 5102 · Venda de mercadoria… · Direção "SAIDA" · Abrangência
                        "INTERNAL" · Ativo   (⚠️ D10: rótulos técnicos)
     /app/fiscal/ncm  → 39249000 · Utilidades plásticas de uso doméstico · Ativo
   Painel: os quatro primeiros itens "— pronto"; o quinto "— pendente": "0 de 2
   produto(s) com NCM no perfil fiscal. A NF-e usa o NCM do perfil fiscal do produto
   (não o campo NCM do cadastro), e o perfil ainda sem tela de cadastro nesta versão —
   solicite ao administrador do sistema."

4. ⛔ Caso realista: gerar sem o perfil fiscal
   Quadro de erro (mensagem real da integração):
   "Não é possível gerar a NF-e do pedido PV-0001: o produto BAL-08 — Balde plástico 8 L
   precisa de NCM. Para corrigir: cadastre o NCM no perfil fiscal do produto
   (Fiscal → NCM e perfil fiscal)."
   Explicação: o NCM 39249000 está no cadastro do produto (aula 02), mas a NF-e lê o
   perfil fiscal.

5. ⛔ Perfil fiscal do BAL-08 e do BAL-12
   Painel: quinto item "— pronto" ("2 de 2").

6. ⛔ NF-e do PV-0001: gerar → calcular → pronta
   Rota: /app/fiscal/notas-fiscais
   Tela: "Documentos fiscais — NF-e, NFC-e, NFS-e, CT-e e MDF-e da empresa, do rascunho à
   autorização." Abas: Todos, Pendentes de autorização, Rejeitadas / denegadas.
   Filtros: Status, Tipo. Colunas: Documento, Tipo, Número, Cliente, Emissão, Total,
   Status.
   Resultado (gravado em três momentos): DF-0001 · NFE · — · Granito · sexta · R$ 194,00 ·
   Rascunho → Calculada → Pronta.

7. Conferir em outros lugares
   Rota: /app/fiscal/nfe ("Notas fiscais eletrônicas (NF-e) — Documentos fiscais do tipo
   NF-e.") → a mesma DF-0001.
   Rota: /app/comercial/faturamento ("Faturamento — Documentos fiscais emitidos a partir
   das vendas (mesma base do módulo Fiscal).") → a mesma DF-0001.
   Rota: /app/fiscal → Documentos 1 · Pendentes 1 · "Documentos fiscais recentes".
   Pedido PV-0001 → Informações: "Documento fiscal —" e "Chave de acesso —" (sem número:
   a numeração e a autorização não acontecem neste ambiente).

8. Regras tributárias (consulta)
   Rota: /app/fiscal/impostos → "Nenhum registro ainda". O Fiscal só consulta; a aula
   explica para que servem e quem cadastra.

9. Onde esta versão para
   Quadro: stepper Rascunho → Calculada → Pronta → ┄ Autorizada ┄ (tracejado):
   "A autorização exige provedor de transmissão e certificado digital A1. Neste ambiente
   de demonstração, a NF-e para em Pronta."
```

## 6. Demonstração (o que aparece na gravação)

| Cena | Enquadramento e câmera | Destaques e callouts | Pausas e resultado |
|---|---|---|---|
| Início do Lucas | Zoom no menu | Selo ⚠️ B6 | 2 s |
| Checklist toda pendente | Zoom 1,4× na checklist | Ícone pendente em cada item | 3 s |
| Base fiscal | Fundo escuro: as cinco peças montam a nota | Uma peça por vez, com o exemplo da Órbita | 6 s |
| Quadro ⛔ cadastros | Translúcido | — | 3 s |
| CFOP e NCM | Zoom nas linhas | Selo ⚠️ D10 nas colunas Direção e Abrangência | 2 s |
| Checklist quase pronta | Zoom no quinto item | Sublinhar "não o campo NCM do cadastro" | **4 s** |
| Erro de NCM | Quadro de erro (Mensagem · Por que · Como resolver) | Anel em "Para corrigir" | 4 s |
| Checklist completa | Cinco itens prontos | ✓ animados | 2 s |
| Notas fiscais | Três capturas do mesmo documento | Stepper Rascunho → Calculada → Pronta | 1,5 s por estado |
| Faturamento | Corte rápido | Callout "Mesma base do Fiscal" | 2 s |
| Pedido PV-0001 | Zoom em "Documento fiscal —" | Callout "Sem número: sem autorização" | 2 s |
| Onde para | Stepper com "Autorizada" tracejado | Quadro honesto | 4 s |

## 7. Narração

**[A — Abertura]**
ATLAS.ERP Academy. Aula sete: Fiscal.

**[B — Contexto]**
Sexta-feira, oito e meia. O pedido do Granito sai hoje. Antes do caminhão, precisa existir a nota fiscal. É a primeira da Órbita, e o Lucas, do fiscal, abre o painel.

**[C — Explicação]**
Uma nota fiscal responde a quatro perguntas. Quem vende? É o estabelecimento emitente, com CNPJ e regime tributário. Que operação é essa? É a natureza de operação e o seu CFOP. O que está sendo vendido? É o NCM de cada produto. E com qual tributação? São as regras tributárias. Se faltar uma resposta, a nota não sai.

**[D1 — A checklist]**
O painel fiscal tem uma checklist chamada Preparação para a primeira NF-e. Na Órbita, tudo está pendente. Nesta versão, esses cadastros fiscais ainda não têm tela. Eles foram registrados por integração, e a checklist vai mudando conforme cada peça entra.

**[D2 — O perfil fiscal]**
Quatro itens prontos. Mas repare no quinto: produtos com NCM no perfil fiscal. O balde tem NCM no cadastro do produto, preenchido na aula dois. Só que a nota fiscal lê o NCM do perfil fiscal, que é outro cadastro. Veja o que acontece ao tentar gerar a nota assim: o sistema recusa e explica exatamente o que falta e onde corrigir.

**[D3 — O documento]**
Com o perfil fiscal cadastrado, a checklist fica completa e a NF-e do pedido é gerada. O documento nasce em rascunho. Depois de calculado, os impostos e os totais estão preenchidos. Depois, ele é marcado como pronto: validado para ser transmitido.

**[E — Resultado]**
O mesmo documento aparece em três lugares: em Notas fiscais, em NF-e e, para o comercial, em Faturamento. No pedido, o campo documento fiscal continua sem número. E aqui está o limite desta versão: a autorização exige um provedor de transmissão e um certificado digital, que este ambiente de demonstração não tem. A nota para em pronta.

**[F — Erros e exceções]**
Alguns cuidados. O NCM do cadastro do produto não é o que a nota usa: confira sempre o item do perfil fiscal na checklist. O Lucas consulta as regras tributárias, mas não as cadastra; isso é do gerente. E alguns rótulos desta versão ainda aparecem em código, como saída e interna na lista de CFOP.

**[G — Exercício]**
Sua vez. No painel fiscal, leia a checklist e diga, item a item, o que significa. Depois, encontre a NF-e do Granito em três telas diferentes e diga em que estado ela está.

**[H — Fechamento]**
Resumindo: a nota precisa de quem emite, da operação, do produto e da tributação; a checklist mostra o que falta; e, nesta versão, o documento chega até pronto. Na próxima aula, o Bruno separa e expede o pedido do Granito.

## 8. Estados e fluxo

```
DOCUMENTO FISCAL (NF-e)
Rascunho ──(calcular ⛔)──► Calculada ──(pronta ⛔)──► Pronta ┄┄(autorizar: sem provedor)┄┄► Autorizada
                                                       └┄┄► Rejeitada · Denegada · Contingência
Cancelada (a partir dos estados permitidos, pela API)
```

```
CADASTROS (produto) ──► FISCAL: perfil fiscal ⛔ ─┐
FISCAL: estabelecimento ⛔ · CFOP ⛔ · natureza ⛔ ─┼──► NF-e do PEDIDO ⛔ ──► FATURAMENTO 🔎
COMERCIAL (pedido aprovado) ────────────────────┘                     └──► LOGÍSTICA (aula 08)
```

**Entrada:** PV-0001 aprovado e reservado; produtos com NCM no cadastro (sem perfil fiscal).
**Processamento:** base fiscal ⛔ → erro de NCM (perfil) → perfil fiscal ⛔ → NF-e gerada, calculada e pronta ⛔.
**Resultado:** DF-0001 · NF-e · R$ 194,00 · Pronta; checklist completa.
**Segue para:** Logística (aula 08).

## 9. Erros e exceções

| Situação | Mensagem apresentada | Causa | Impacto | Como identificar | Solução | Bug? |
|---|---|---|---|---|---|---|
| Produto sem perfil fiscal | "Não é possível gerar a NF-e do pedido PV-0001: o produto BAL-08 — Balde plástico 8 L precisa de NCM. Para corrigir: cadastre o NCM no perfil fiscal do produto (Fiscal → NCM e perfil fiscal)." | A NF-e lê o NCM do perfil fiscal, não o do cadastro | NF-e não gerada | Checklist: "Produtos ativos com NCM no perfil fiscal — pendente" | Cadastrar o perfil fiscal (⛔, D3) | ⚠️ D3 (sem tela) |
| Natureza sem CFOP padrão | "…precisa de CFOP. Para corrigir: configure o CFOP padrão da natureza de operação «…» (Fiscal → CFOP)." | Natureza incompleta | NF-e não gerada | Checklist: natureza pendente | Definir o CFOP padrão (⛔) | não |
| Pedido não aprovado | "Só é possível gerar documento fiscal a partir de um pedido aprovado (status atual: …)." | Regra | — | Status do pedido | Aprovar antes | não |
| NF-e para em "Pronta" | — | Sem provedor de transmissão e certificado neste ambiente | Sem número e chave de acesso | Stepper; "Documento fiscal —" no pedido | Não é erro do usuário | limitação do ambiente |
| Gerar, calcular e marcar pronta pela tela | — (sem botões) | ⛔ só pela API | Depende de integração | Listas só de consulta | Integração | ⚠️ **B2** |
| Fiscal tenta criar regra tributária | "Você não tem permissão para esta operação (tax_rules.create)." (API) | O papel só consulta | — | — | Gerente cadastra | não (regra) |
| Rótulos em código | CFOP: Direção "SAIDA", Abrangência "INTERNAL"; Notas: Tipo "NFE" | Valores técnicos sem tradução | Leitura | Colunas | Ler como Saída, Interna, NF-e | ⚠️ D10 (novo) |
| Operador cria NF-e e NCM | — | Papel padrão amplo | Segregação fraca | Matriz | Ajustar o papel (aula 10) | ⚠️ **B9** |
| Início do papel personalizado | "Não foi possível carregar o relatório executivo…" | Ver aula 06 | Visual | Cartão "Resumo" | — | ⚠️ **B6** |

## 10. Exercício prático

1. No painel Fiscal, leia os cinco itens da checklist e explique cada um com as suas palavras.
2. Diga onde está o NCM que a NF-e usa e por que ele é diferente do campo NCM do cadastro do produto.
3. Encontre a DF-0001 em **Notas fiscais**, em **NF-e** e em **Faturamento**.
4. Use a aba **Pendentes de autorização** e explique por que a nota aparece ali.
5. **Pergunta:** o que falta para a nota chegar a "Autorizada"?

## 11. Checklist de conclusão

- [ ] Sei as cinco peças da base fiscal e para que serve cada uma.
- [ ] Leio a checklist "Preparação para a primeira NF-e".
- [ ] Sei que a NF-e usa o NCM do perfil fiscal.
- [ ] Sei interpretar a mensagem de erro de NCM e onde corrigir.
- [ ] Acompanho o documento de Rascunho a Pronta.
- [ ] Encontro a nota em Notas fiscais, NF-e e Faturamento.
- [ ] Sei onde esta versão para e por quê.

## 12. Evidências

Salvar em `docs/academy/07-fiscal/evidencias/`:

| # | Captura | Comprova |
|---|---|---|
| 01 | `01-checklist-pendente.png` | Cinco itens pendentes |
| 02 | `02-cfop-ncm.png` | 5102 e 39249000 (⛔) |
| 03 | `03-checklist-perfil-pendente.png` | Texto do quinto item |
| 04 | `04-erro-ncm.png` | Mensagem real do erro (resposta da integração) |
| 05 | `05-checklist-completa.png` | Cinco itens prontos |
| 06 | `06-df-rascunho.png` | DF-0001 Rascunho |
| 07 | `07-df-calculada.png` | DF-0001 Calculada |
| 08 | `08-df-pronta.png` | DF-0001 Pronta |
| 09 | `09-faturamento.png` | A mesma nota no Comercial |
| 10 | `10-pedido-sem-numero.png` | "Documento fiscal —" no pedido |

## 13. Preparação técnica

Executar **entre as cenas**, na ordem, com a conta do Lucas (Fiscal).

| # | Etapa | Endpoint | Dados | Resultado esperado |
|---|---|---|---|---|
| 1 | Estabelecimento | `POST /api/fiscal-establishments` | `{ code: "EST-MATRIZ", name: "Órbita Distribuidora — Matriz", cnpj: "48.271.093/0001-15", taxRegime: "SIMPLES_NACIONAL", stateRegistration: "ISENTO", city: "São Paulo", state: "SP", address: "Rua das Embalagens, 120", zipCode: "01000-000" }` | Item 1 pronto |
| 2 | CFOP | `POST /api/fiscal-cfops` | `{ code: "5102", description: "Venda de mercadoria adquirida ou recebida de terceiros", direction: "SAIDA", scope: "INTERNAL" }` | Item 2 pronto |
| 3 | Natureza | `POST /api/fiscal-operation-natures` e `PATCH /api/fiscal-operation-natures/:id` | `{ code: "VENDA", name: "Venda de mercadoria", direction: "SAIDA" }` → `{ defaultCfopId: <5102> }` | Item 3 pronto |
| 4 | NCM | `POST /api/fiscal-ncms` | `{ code: "39249000", description: "Utilidades plásticas de uso doméstico" }` | Item 4 pronto → **gravar a cena 3** |
| 5 | Erro (antes do perfil) | `POST /api/sales-orders/:id/generate-fiscal-document` | `{ fiscalEstablishmentId, operationNatureId }` | 4xx com a mensagem de NCM → **capturar a resposta** (cena 4) |
| 6 | Perfis fiscais | `POST /api/product-fiscal-profiles` (BAL-08 e BAL-12) | `{ productId, ncmId: <39249000>, originCode: "0" }` | Item 5 pronto |
| 7 | Gerar | `POST /api/sales-orders/:id/generate-fiscal-document` | igual ao passo 5 | DF-0001 Rascunho → **gravar** |
| 8 | Calcular | `POST /api/fiscal-documents/:id/calculate` | — | Calculada → **gravar** |
| 9 | Pronta | `POST /api/fiscal-documents/:id/ready` | — | Pronta → **gravar** |

- **Irreversível?** Documentos fiscais não são excluídos (só cancelados pela API). Executar só no ambiente Academy.
- **Não executar** `authorize`/`begin-authorization`: não há provedor configurado; a aula mostra o limite.
- **Sem ambiente limpo:** a Órbita da homologação já tem a base fiscal e outras notas; usar a empresa limpa para mostrar a checklist pendente.

## Estrutura de cenas do vídeo

| Bloco | Cena | Tempo | Conteúdo |
|---|---|---|---|
| A | Abertura | 0:00–0:09 | Núcleo → "ATLAS.ERP Academy" → "07 · Fiscal" |
| B | Contexto | 0:09–0:40 | "Sexta, 8h30" · pílula Lucas/Fiscal |
| C | Explicação | 0:40–2:00 | As quatro perguntas da nota; as cinco peças |
| D1 | Checklist | 2:00–3:30 | Pendente → quadro ⛔ → CFOP e NCM |
| D2 | Perfil fiscal | 3:30–5:00 | Quinto item; erro de NCM; perfil |
| D3 | Documento | 5:00–6:40 | Rascunho → Calculada → Pronta |
| E | Resultado | 6:40–8:20 | NF-e, Faturamento, pedido sem número; onde para |
| F | Erros | 8:20–10:20 | D3, CFOP da natureza, B2, D10, regras tributárias, B9 |
| G | Exercício | 10:20–10:45 | Tela de exercício |
| H | Fechamento | 10:45–11:05 | 3 linhas → "Próxima aula: Logística" → lockup |
