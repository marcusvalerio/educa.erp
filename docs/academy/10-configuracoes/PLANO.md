# Aula 10 — Configurações (Administração da Empresa)

| | |
|---|---|
| **Público** | Administrador da empresa |
| **Personagem** | **Ana** — **Administrador** |
| **Viabilidade** | ✅ quase completa (usuários, convites, papéis, permissões, setores, cargos, unidades, módulos, foco dos painéis, aparência, documentação) · ⚠️ "Dados da empresa" não abre para nenhum papel (D1) · 🔎 parâmetros · ⛔ configuração fiscal |
| **Duração estimada** | 13–15 min |
| **Ordem de estudo** | logo depois da aula 01 |

**O aluno sai sabendo:**

- o primeiro acesso;
- o que configurar **antes** da operação começar e em que ordem;
- convidar a equipe com o papel certo;
- criar um **papel personalizado**;
- habilitar módulos;
- organizar setores, cargos e unidades;
- configurar o foco dos painéis;
- encontrar a documentação;
- a diferença entre **papel** (o que pode fazer) e **cargo** (o que a pessoa é).

## Cenário

**Segunda-feira, 8h.** Ana recebeu o convite que o Marcus enviou (aula 01), cria a senha e entra pela primeira vez. A Órbita está vazia. Até o meio-dia, a equipe precisa estar com acesso:

| Pessoa | Papel |
|---|---|
| Carlos | Gerente |
| Juliana | Vendedor |
| Rafael | Operador |
| Fernanda | Financeiro |
| Lucas | Fiscal |
| Bruno | Logística |

Financeiro, Fiscal e Logística **não existem como papéis padrão**: Ana vai criá-los.

## Checklist "antes de operar"

É a espinha da aula.

| # | Item | Onde | Legenda |
|---|---|---|---|
| 1 | Primeiro acesso e senha | convite por e-mail | ✅ |
| 2 | Unidade (Matriz) | Administração → Unidades | ✅ |
| 3 | Setores e cargos | Administração → Setores, Cargos | ✅ |
| 4 | Papéis personalizados (Financeiro, Fiscal, Logística) | Papéis e permissões → **Novo papel** + matriz | ✅ |
| 5 | Convidar a equipe com o papel certo | Usuários → **Convidar usuário** | ✅ |
| 6 | Unidade, setor e cargo de cada pessoa | painel de acesso do usuário | ✅ |
| 7 | Módulos habilitados | Administração → Módulos | ✅ |
| 8 | Foco dos painéis por público | Administração → Configurações | ✅ |
| 9 | Locais de estoque e cadastros base | aula 02 | ✅ |
| 10 | Configuração fiscal (estabelecimento, natureza, CFOP, NCM, perfil fiscal) | aula 07 | ⛔ |
| 11 | Dados da empresa | Configurações → Dados da empresa | ⚠️ D1 |

## Roteiro por parte

| # | Parte | Conteúdo | Telas / ações |
|---|---|---|---|
| 01 | Introdução | "A Administração da Empresa é onde a empresa se organiza: quem entra, com qual papel, em qual unidade, com quais módulos. Nada aqui afeta outras empresas." | — |
| 02 | Cenário | Ana, 8h, primeiro acesso (aceitar o convite e criar a senha: mínimo de 8 caracteres, letras e números). | convite ✅ |
| 03 | Navegação | Faixa "Administração da Empresa · alterações aqui afetam somente esta empresa" · **Visão geral** (Usuários ativos, Papéis ativos, Setores, Cargos, Unidades, Módulos em uso; **Pendências de configuração**) · menu da Administração · Configurações do ERP (Parâmetros, Aparência, Documentação). | ✅ 🔎 |
| 04 | Operação principal | (1) **Novo papel** "Financeiro" (código, nome, descrição) → matriz: filtrar "receivable" → marcar Ler, Criar, Aprovar… → *"N adicionada(s)"* → **Salvar permissões**. Fiscal e Logística em ritmo rápido. (2) **Convidar usuário**: Nome, E-mail, **Papel** (lista com sistema e personalizados) → **Enviar convite** (link copiável). (3) Painel de acesso: **Papéis**, **Unidades com acesso**, **Contexto organizacional** (setor, cargo, unidade principal) → *"Contexto organizacional atualizado."* (4) **Módulos**: habilitar e desabilitar contratados (Núcleo e Cadastros essenciais). (5) **Foco dos painéis**: "Para o papel Vendedor, priorizar Comercial". | ✅ |
| 05 | O que acontece no ERP | O papel define **menus e botões**: cada personagem vê um ERP diferente (animação com os menus reais de cada papel). As pendências de configuração zeram. A auditoria registra as mudanças. | ✅ + motion |
| 06 | Caso realista | Juliana mudou para o financeiro: trocar o papel. Alguém saiu da empresa: **desativar acesso** e reativar. Convite expirado: **reenviar** ou **cancelar**. | ✅ |
| 07 | Erros e exceções | Ver tabela. | |
| 08 | Conferência | Usuários: coluna Acesso ("Conta ativa", "Convite pendente") e Papéis · Visão geral sem pendências · Auditoria. | 🔎 |
| 09 | Relação | Configurações → **todas** as aulas: sem papel certo, o funcionário não vê o módulo. Próximo passo: aula 02, Cadastros. | motion |

## Erros e exceções (reais)

| Erro | Por que | Como resolver |
|---|---|---|
| Carlos (Gerente) não vê **Convidar usuário** nem **Novo papel** | Exige `users.create` e `roles.manage` (só o Administrador) | A Ana convida |
| Papel de sistema: **"Papel protegido"** | Papéis padrão não são editáveis como os personalizados | Criar um papel personalizado |
| Sair da matriz sem salvar: **Descartar** / **Salvar permissões** | Alterações pendentes | Salvar ou descartar conscientemente |
| ⚠️ **B9**: o Operador padrão cria contas a pagar e NCM | Modelo do papel amplo demais | Mostrar como conferir na matriz; segregação |
| ⚠️ **B10**: Somente leitura abre a Administração da Empresa | Modelo do papel | Avaliar se o papel atende |
| ⚠️ **B16**: rótulos técnicos em inglês na matriz ("Audit", "Rbac", "Company modules") | Débito | Usar o filtro e a descrição |
| ⚠️ **D1**: "Dados da empresa" não abre para ninguém | Nenhum papel tem `companies.read` | Débito registrado |
| E-mail do convite já usado | Usuário existente | Buscar o usuário e ajustar papéis |

## Telas usadas

| Tela | Rota | Legenda |
|---|---|---|
| Visão geral | `/app/admin` | 🔎 |
| Usuários (+ convite, + painel de acesso, + cadastro) | `/app/admin/users`, `/app/admin/users/cadastro` | ✅ |
| Papéis e permissões | `/app/admin/roles` | ✅ |
| Setores · Cargos · Unidades | `/app/admin/{departments,positions,branches}` | ✅ |
| Módulos | `/app/admin/modules` | ✅ |
| Configurações (foco) | `/app/admin/settings` | ✅ |
| Parâmetros | `/app/configuracoes/parametros` | 🔎 |
| Aparência · Documentação | `/app/configuracoes/{aparencia,documentacao}` | ✅ |

## Preparação de cena

- Convite da Ana enviado na aula 01.
- Caixa de e-mail local para os convites.
- Cada personagem aceita o próprio convite fora de cena.
