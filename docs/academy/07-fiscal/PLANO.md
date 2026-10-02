# Aula 07 — Fiscal

| | |
|---|---|
| **Público** | Fiscal (e Gerente e Administrador) |
| **Personagem** | **Lucas** — **Fiscal** (papel **personalizado**) |
| **Viabilidade** | 🔎 **consulta + checklist**: painel "Preparação para a primeira NF-e" e listas 🔎 · estabelecimento, natureza, NCM, CFOP, perfil fiscal, gerar, calcular e "pronta" ⛔ (B2, D3) · **autorização SEFAZ: não existe neste ambiente** (sem certificado nem provedor) |
| **Duração estimada** | 10–12 min |
| **Status** | **decisão pendente** (README, decisão 1) |

**O aluno sai sabendo:**

- o que precisa existir antes da primeira NF-e: estabelecimento emitente, CFOP, natureza de operação, NCM e perfil fiscal do produto;
- o caminho do documento (Rascunho → Calculada → Pronta → Autorizada) e o que significa cada estado;
- até onde **esta versão chega** (Pronta);
- como conferir.

## Cenário

**Quinta-feira, 14h.** A venda **PV-0001** está aprovada, reservada e com título gerado. Lucas abre o painel Fiscal para preparar a NF-e. A checklist mostra o que está pronto e o que falta.

## Fluxo

PEDIDO → DOCUMENTO FISCAL (Rascunho) → **Calculada** (impostos e totais) → **Pronta** (validada para transmissão) → ┄ Autorizada (SEFAZ) ┄ *não disponível neste ambiente*

## Roteiro por parte

| # | Parte | Conteúdo | Telas / ações |
|---|---|---|---|
| 01 | Introdução | "O fiscal transforma a operação em documento fiscal. Para isso, o ERP precisa saber quem emite, o quê, para quem e com qual tributação." | — |
| 02 | Cenário | Lucas, papel Fiscal (personalizado), 14h. ⚠️ B6 na tela Início. | — |
| 03 | Navegação | **Painel Fiscal**: KPIs (Documentos, Autorizados, Pendentes, Rejeitados) e a checklist **Preparação para a primeira NF-e** (estabelecimento emitente com CNPJ e regime; CFOP das vendas; natureza de saída com CFOP padrão; NCM dos produtos; produtos com NCM no perfil fiscal) · **Notas fiscais** (abas Pendentes de autorização e Rejeitadas/denegadas) · NF-e · NCM · CFOP · Regras tributárias. | 🔎 |
| 04 | Operação principal | Explicar cada item da checklist (o que é, onde fica). Selos ⛔: "cadastros fiscais e geração da NF-e são feitos por integração nesta versão". Resultado real: **DF-0001 · NF-e · Rascunho** → **Calculada** (total preenchido) → **Pronta**. Em cada passo, o significado do estado. | 🔎 / ⛔ |
| 05 | O que acontece no ERP | O documento fica ligado ao pedido; aparece em Comercial → **Faturamento**; KPIs do Fiscal. **Autorização**: quadro honesto, com a etapa "Autorizada" tracejada: "Exige certificado digital A1 e provedor de transmissão. Neste ambiente de demonstração, a NF-e para em Pronta." | 🔎 + motion |
| 06 | Caso realista | Produto **sem NCM no perfil fiscal**: a geração recusa com a mensagem que orienta a correção (abaixo). O checklist mostra o item pendente (círculo tracejado). | ⛔ (mensagem real) |
| 07 | Erros e exceções | Ver tabela. | |
| 08 | Conferência | Status na lista, número do documento, total, vínculo com o pedido, KPIs, auditoria (o documento fiscal aparece como Criação/Alteração). | 🔎 |
| 09 | Relação | COMERCIAL → **FISCAL** → LOGÍSTICA (a mercadoria sai com o documento) · CADASTROS (produto, NCM). | motion |

## Erros e exceções (reais)

| Erro | Por que | Como resolver |
|---|---|---|
| *"…o produto OD-0xx … precisa de NCM. Para corrigir: cadastre o NCM no perfil fiscal do produto…"* | O perfil fiscal do produto não tem NCM (o campo NCM do cadastro **não** é o usado pela NF-e) | Preencher o perfil fiscal (⛔ D3; solicitar ao administrador) |
| Checklist com item pendente | Configuração fiscal incompleta | Completar antes da primeira NF-e |
| Lucas abre Contas a pagar ou Separação: *"Sem acesso a este recurso"* | Fora do papel | Correto |
| NF-e "Pronta" e não "Autorizada" | **Limitação do ambiente**: sem certificado nem provedor | Não é erro do usuário; explicar |

## Telas usadas

| Tela | Rota | Legenda |
|---|---|---|
| Fiscal (painel e checklist) | `/app/fiscal` | 🔎 |
| Notas fiscais | `/app/fiscal/notas-fiscais` | 🔎 |
| NF-e | `/app/fiscal/nfe` | 🔎 |
| NCM · CFOP · Regras tributárias | `/app/fiscal/{ncm,cfop,impostos}` | 🔎 |
| Faturamento | `/app/comercial/faturamento` | 🔎 |

## Preparação de cena (⛔)

- Estabelecimento, natureza de operação, CFOP 5102, NCM e perfil fiscal dos produtos (Lucas).
- Gerar, calcular e marcar "pronta" a NF-e do PV-0001 (Lucas).
- Um produto sem perfil fiscal, para o erro.
