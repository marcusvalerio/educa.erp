# Aula 10 — Configurações (Administração da Empresa)

> Plano de produção. Validado no código (`48775f5`) e ao vivo no ambiente local em 02/10/2026.
> Padrões comuns: [PADRAO-DE-PRODUCAO.md](../PADRAO-DE-PRODUCAO.md) · mapeamento: [MAPEAMENTO.md](../MAPEAMENTO.md) · anexo: [PERMISSOES-PAPEIS.md](PERMISSOES-PAPEIS.md).

## 1. Identidade da aula

| | |
|---|---|
| **Número** | 10 (na ordem de estudo, logo depois da aula 01) |
| **Título** | Configurações — preparar a empresa e a equipe antes de operar |
| **Personagem** | **Ana** |
| **Papel real** | **Administrador** (da empresa) |
| **Coadjuvante** | **Carlos** (Gerente), para mostrar o que ele não administra |
| **Duração estimada** | 14–16 min |
| **Nível** | Introdutório (administração) |
| **Cobertura** | ✅ quase completa: usuários, convites, papéis, matriz de permissões, setores, cargos, unidades, módulos, foco dos painéis, aparência, documentação · 🔎 parâmetros · ⚠️ "Dados da empresa" não abre para nenhum papel (D1) · ⚠️ B10, B16 · ⛔ configuração fiscal (aula 07) |
| **Objetivo principal** | Deixar a Órbita pronta para operar: primeiro acesso, estrutura (unidade, setores, cargos), papéis personalizados, convites com o papel certo, contexto de cada pessoa, módulos habilitados e foco dos painéis, entendendo a diferença entre **papel** e **cargo**. |

> **Atualização pós-estabilização — rodada de teste com 48 usuários em 7 empresas (02/10/2026).** (1) **B16 corrigido:** a matriz de permissões está em português (recursos como "Módulos da empresa", "Papéis e permissões", "Auditoria"; ação "Configurar"). (2) A tela **Papéis e permissões abre em ~0,6 s** (antes 7,8 s, e *timeout* com muitos usuários — R48-05). (3) **B6 corrigido** no Início dos papéis criados aqui. (4) **B9 reconfirmado como R48-04:** o papel padrão Operador cria conta a pagar, baixa recebimentos e cria NCM — continua aberto; a aula deve mostrar como criar um papel mais restrito.
> Vale para a build da branch `claude/e2e-empresa-nova-correcoes` (commits `3ca2878`, `081edc1` e seguinte); **enquanto não houver merge, produção continua com o comportamento anterior** — grave na build corrigida. Detalhes em [`RELATORIO-TESTE-48-USUARIOS-7-EMPRESAS.md`](../../homologacao/RELATORIO-TESTE-48-USUARIOS-7-EMPRESAS.md).

## 2. Contexto de negócio

> Segunda-feira, 8h40. Meia hora depois de o Marcus criar a Órbita (aula 01), a Ana abre o e-mail com o convite e entra pela primeira vez.
>
> A empresa está vazia: só ela tem acesso. Até as 9h, quando o Carlos e o Rafael começam os cadastros (aula 02), a equipe inteira precisa estar convidada, cada pessoa com o papel certo.
>
> Três funções da Órbita não existem como papéis padrão: financeiro, fiscal e logística. A Ana vai criá-las.

| Pessoa | Papel | Tipo |
|---|---|---|
| Carlos | Gerente | sistema |
| Juliana | Vendedor | sistema |
| Rafael | Operador | sistema |
| Fernanda | Financeiro | **personalizado** |
| Lucas | Fiscal | **personalizado** |
| Bruno | Logística | **personalizado** |

## 3. O que o aluno vai aprender

- O primeiro acesso pelo convite.
- A visão geral da Administração da Empresa e as **pendências de configuração**.
- Criar a estrutura: **unidade**, **setores** e **cargos**.
- Criar um **papel personalizado** e marcar a **matriz de permissões**.
- **Convidar** usuários com o papel certo; reenviar e cancelar convite; desativar e reativar acesso.
- Definir o **contexto organizacional** de cada pessoa (unidade, setor, cargo).
- **Habilitar e desabilitar** módulos contratados.
- Configurar o **foco dos painéis** por papel.
- Onde ficam Parâmetros, Aparência e Documentação, e o que ainda não abre (D1).
- A diferença entre **papel** (o que pode fazer) e **cargo** (o que a pessoa é).

## 4. Conceito antes da tela

| Pergunta | Resposta |
|---|---|
| O que é | A área onde a empresa se organiza: quem entra, com qual papel, em qual unidade, com quais módulos. Nada aqui afeta outras empresas da plataforma. |
| Por que existe | O papel define o que cada pessoa vê e faz. Sem papel certo, o funcionário não encontra o módulo ou, pior, faz o que não deveria. A estrutura (unidade, setor, cargo) dá contexto e orienta os painéis. |
| Quem executa | **Administrador**. O Gerente consulta usuários e unidades, mas não convida nem cria papéis, setores ou cargos. ⚠️ B10: o Somente leitura também abre esta área. |
| Módulo responsável | Administração da Empresa (`/app/admin`) e Configurações do ERP (`/app/configuracoes`) |
| Quem recebe o resultado | Todas as aulas: cada personagem opera com o papel criado aqui. |

**Papel × cargo** (quadro da cena C):

| | Papel | Cargo |
|---|---|---|
| O que é | Conjunto de permissões | Título da pessoa na empresa |
| Exemplo | Financeiro | "Analista financeira" |
| Muda o que a pessoa pode fazer? | **Sim** | Não (orienta o foco dos painéis) |
| Onde | Papéis e permissões | Cargos |

**Contratar × habilitar** (ligação com a aula 01): a plataforma **contrata** módulos; a Ana **habilita** os contratados. Na Órbita, 14 de 19 foram contratados.

## 5. Roteiro de navegação

```
PERSONAGEM: Ana — Administrador · segunda, 8h40

1. Primeiro acesso
   Ação: abrir o link do convite (e-mail) → definir a senha (mínimo de 8 caracteres,
   letras e números) → entrar.
   Resultado: Início da Ana; menu da conta com "Administração da Empresa".

2. Visão geral
   Rota: /app/admin
   Tela: "Administração da Empresa · Órbita Distribuidora — Usuários, papéis, estrutura
   organizacional e módulos desta empresa. Nada aqui altera outras empresas da
   plataforma."
   Resultado: Usuários ativos 1 · Papéis ativos 5 · Setores 0 · Cargos 0 · Unidades 1 ·
   Módulos em uso 14 · "Pendências de configuração" (Usuários ativos sem unidade
   liberada; Usuários ativos sem setor ou cargo) · "Seu acesso administrativo" ·
   "Áreas da administração".

3. Estrutura: unidade, setores e cargos
   Rota: /app/admin/branches → a unidade MATRIZ / Matriz já existe (criada com a empresa).
   Rota: /app/admin/departments → "Novo(a) setor": COMERCIAL, FINANCEIRO, FISCAL,
   LOGISTICA (código e nome).
   Rota: /app/admin/positions → "Novo(a) cargo": "Gerente comercial", "Vendedora",
   "Operador de armazém", "Analista financeira", "Analista fiscal", "Coordenador de
   logística" (com o setor).

4. Papel personalizado "Financeiro"
   Rota: /app/admin/roles
   Tela: "Papéis e permissões — Cada papel reúne permissões do catálogo. O acesso de um
   usuário é a soma dos papéis atribuídos a ele."
   Ação: Novo papel → Código "FINANCEIRO" (ajuda: "Identificador único na empresa,
   ex.: COMPRADOR."), Nome "Financeiro", Descrição → salvar → toast "Papel Financeiro
   criado."
   Matriz: módulos com contagem (ex.: "Núcleo 31/31") e a grade Recurso × Consultar,
   Ler, Criar, Editar, Excluir, Administrar, Atribuir, Configurar (recursos em português
   desde a rodada 48: "Auditoria", "Unidades", "Módulos da empresa", "Papéis e permissões").
   Ação: marcar as permissões do anexo (contas a pagar e a receber, pagamentos, contas e
   categorias financeiras, relatórios financeiros, pedidos de venda em consulta…) →
   rodapé "N adicionada(s) · 0 removida(s)" → Salvar permissões → toast "Permissões de
   Financeiro salvas."
   Repetir em ritmo rápido: Fiscal (44 permissões) e Logística (43).
   Mostrar: abrir "Administrador" → alerta "Papel protegido — As permissões do
   administrador de sistema não podem ser redefinidas — isso evita perder o acesso
   administrativo."

5. Convidar a equipe
   Rota: /app/admin/users → "Convidar usuário"
   Dados: Nome "Carlos" · E-mail carlos@orbitadistribuidora.test · Papel "Gerente"
   Ação: enviar → toast "Convite enviado para carlos@orbitadistribuidora.test." (ou
   "Convite criado." se o e-mail não sair, com o link copiável → "Link copiado.")
   Repetir: Juliana (Vendedor), Rafael (Operador), Fernanda (Financeiro), Lucas (Fiscal),
   Bruno (Logística).
   Resultado: lista com Acesso "Convite pendente"; abas Todos, Sem login, Convite
   pendente, Sem papel, Sem unidade.

6. Contexto de cada pessoa
   Ação: abrir a Fernanda → painel de acesso: Papéis, Unidades com acesso (Matriz),
   Contexto organizacional (setor FINANCEIRO, cargo "Analista financeira", unidade
   principal Matriz) → salvar → toast "Contexto organizacional atualizado."
   Resultado: a pendência "sem unidade liberada" diminui; depois de todos, zera.

7. Módulos
   Rota: /app/admin/modules
   Tela: "Módulos — 14 de 14 em uso — Módulos contratados pela empresa e quais estão
   habilitados para uso. Desabilitar um módulo oculta suas telas e bloqueia suas
   permissões."
   Ação: desabilitar "Importação e Exportação" (a Órbita não vai usar agora) →
   "Desabilitar Importação e Exportação?" → Desabilitar → toast "Importação e
   Exportação desabilitado." Núcleo e Cadastros têm o selo "Essencial".

8. Foco dos painéis
   Rota: /app/admin/settings
   Tela: "Configurações — Como os painéis priorizam informações para cada setor, cargo e
   papel…" Bloco "Foco dos painéis" (72 regras "Padrão da plataforma").
   Ação: Nova regra → diálogo "Nova regra de foco": Tipo de público "Papel" → público
   "Vendedor" · Foco "Pedidos" · Prioridade 10 → salvar → toast "Regra de foco salva."

9. Configurações do ERP
   /app/configuracoes/parametros → "Parâmetros do sistema" (consulta: moeda, fuso,
   regime tributário padrão…).
   /app/configuracoes/aparencia → tema Claro, Escuro ou Sistema.
   /app/configuracoes/documentacao → Manual do Usuário e Manual de Administração (Abrir,
   Baixar).
   /app/configuracoes/empresa → "Sem acesso a este recurso" (⚠️ D1: nenhum papel abre).

10. Caso realista: alguém saiu, alguém mudou de função
    Usuários → painel de acesso:
      convite errado → "Cancelar convite" → "Cancelar convite?" → toast "Convite cancelado."
      convite expirado → "Reenviar convite"
      funcionário desligado → "Desativar acesso" → "Desativar <nome>?" → toast "<nome>
      foi desativado." → "Reativar" desfaz.
      mudou de função → trocar o papel no painel de acesso.

PERSONAGEM: Carlos — Gerente (depois de aceitar o convite)

11. O limite do Gerente
    Rota: /app/admin/users → sem "Convidar usuário" (exige `users.create` e `roles.manage`);
    Papéis: sem "Novo papel" e sem edição da matriz (sem `roles.manage`); setores e cargos:
    só consulta (sem `departments.create`/`positions.create`).
```

## 6. Demonstração (o que aparece na gravação)

| Cena | Enquadramento e câmera | Destaques e callouts | Pausas e resultado |
|---|---|---|---|
| Primeiro acesso | Tela de definição de senha | Callout "Regras da senha" (sem mostrar a senha) | 2 s |
| Visão geral | Pan pelos seis números → pendências | Anel nas pendências | 3 s |
| Papel × cargo | Fundo escuro; quadro comparativo | — | 5 s |
| Setores e cargos | Diálogos rápidos | Selo "Novo(a)" sem destaque | 1 s por item |
| Novo papel | Diálogo; zoom no código | Callout "Código único, sem espaços" | 2 s |
| Matriz | Zoom 1,4× na grade; marcação em sequência | Rodapé "N adicionada(s)"; selo ⚠️ B16 (rótulos em inglês) | 3 s |
| Papel protegido | Alerta azul | — | 2,5 s |
| Convites | Diálogo; lista com "Convite pendente" | Callout "Papel escolhido no convite" | toast 2,5 s |
| Contexto | Painel de acesso | Callout "Unidade, setor e cargo" | toast 2,5 s |
| Módulos | Chave + confirmação vermelha | Callout "Contratar × habilitar" | toast 2,5 s |
| Foco | Diálogo de regra | — | toast 2 s |
| D1 | Tela "Sem acesso a este recurso" | Selo ⚠️ D1 | 2,5 s |
| Gerente | Corte para a sessão do Carlos | Ausência de "Convidar usuário" | 2 s |

## 7. Narração

**[A — Abertura]**
ATLAS.ERP Academy. Aula dez: Configurações da empresa.

**[B — Contexto]**
Segunda-feira, oito e quarenta. A Órbita existe há meia hora. A Ana acabou de aceitar o convite e é a única pessoa com acesso. Até as nove, a equipe inteira precisa estar convidada, com o papel certo.

**[C — Explicação]**
Duas ideias antes da tela. A primeira: papel é o que a pessoa pode fazer; cargo é o que ela é. O papel muda menus e botões; o cargo dá contexto e orienta os painéis. A segunda: a plataforma contratou os módulos da Órbita; aqui, a Ana decide quais ficam habilitados. Tudo o que ela fizer nesta área vale só para a Órbita.

**[D1 — Visão geral e estrutura]**
A visão geral mostra os números da empresa e as pendências de configuração: pessoas sem unidade, sem setor ou sem cargo. A unidade Matriz já veio com a empresa. A Ana cria os setores e os cargos.

**[D2 — Papéis personalizados]**
Financeiro, fiscal e logística não existem como papéis padrão. Em Papéis e permissões, a Ana cria o papel Financeiro e marca, na matriz, o que ele pode fazer: contas a pagar e a receber, pagamentos, relatórios financeiros e a consulta dos pedidos de venda. O rodapé conta o que foi adicionado. Salvar permissões. Repare que o papel Administrador é protegido: ninguém consegue tirar o acesso administrativo por engano.

**[D3 — Convites e contexto]**
Agora, os convites. Nome, e-mail e papel. Cada pessoa recebe o link e cria a própria senha. Na lista, o acesso aparece como convite pendente até o primeiro login. No painel de cada pessoa, a Ana libera a unidade e define o setor e o cargo. As pendências vão zerando.

**[D4 — Módulos e foco]**
Em Módulos, a Ana desabilita o que a Órbita não vai usar agora. Desabilitar esconde as telas e bloqueia as permissões daquele módulo. Núcleo e Cadastros são essenciais. Em Configurações, ela cria uma regra de foco: para quem vende, os pedidos aparecem primeiro.

**[E — Resultado]**
Às nove horas, a Órbita tem seis pessoas convidadas, três papéis personalizados, setores, cargos e o contexto de cada um. Cada personagem desta série vai entrar e ver um ATLAS.ERP diferente, do tamanho do seu papel.

**[F — Erros e exceções]**
Alguns cuidados. O gerente não convida usuários nem cria papéis: isso é do administrador. Na matriz, alguns nomes de recursos ainda aparecem em inglês; use a busca e a descrição. A tela Dados da empresa ainda não abre para nenhum papel, nem para o administrador. E atenção ao papel somente leitura: ele também abre esta área. Se uma pessoa sair da empresa, desative o acesso; não apague o usuário.

**[G — Exercício]**
Sua vez. Crie um papel personalizado chamado Comprador, com permissão para solicitações e pedidos de compra, convide um usuário com esse papel e defina o setor e o cargo dele.

**[H — Fechamento]**
Resumindo: estrutura, papéis, convites, contexto, módulos e foco. Com a equipe pronta, começa a operação: na aula de cadastros, o Carlos e o Rafael montam a base da Órbita.

## 8. Estados e fluxo

```
USUÁRIO
Convite pendente ──(aceite)──► Conta ativa ──(Desativar acesso)──► Inativo ──(Reativar)──► Conta ativa
       └──(Cancelar convite)──► cancelado          (Reenviar convite: novo link)

MÓDULO
Contratado (plataforma) ──► Habilitado ⇄ Desabilitado (empresa) · Essenciais sempre habilitados

PAPEL
Novo papel ──► matriz (adicionar/remover) ──► Salvar permissões · Papel de sistema "Administrador": protegido
```

**Entrada:** empresa criada (aula 01), com papéis padrão, unidade Matriz e 14 módulos contratados.
**Processamento:** estrutura, papéis, convites, contexto, módulos, foco.
**Resultado:** equipe convidada com papéis reais; pendências zeradas.
**Segue para:** Cadastros (aula 02) e todas as outras.

## 9. Erros e exceções

| Situação | Mensagem apresentada | Causa | Impacto | Como identificar | Solução | Bug? |
|---|---|---|---|---|---|---|
| Código de papel inválido | "Use letras, números, ponto, hífen ou underscore (até 64)." | Formato | Não cria | Mensagem no campo | Corrigir o código | não |
| Editar o Administrador | Alerta "Papel protegido…" | Proteção do acesso administrativo | — | Alerta azul | Criar outro papel | não |
| Sair da matriz sem salvar | Botões "Descartar" / "Salvar permissões" e o rodapé com alterações | Alterações pendentes | Perda de alterações | Rodapé "N adicionada(s)" | Salvar ou descartar | não |
| E-mail não enviado | "Convite criado." (em vez de "Convite enviado para…") | Serviço de e-mail indisponível | A pessoa não recebe | Toast | Copiar o link ("Link copiado.") | não |
| Gerente procura "Convidar usuário" | — (botão ausente) | Sem `users.create` | — | Lista sem botão | Administrador convida | não (regra) |
| Dados da empresa | "Sem acesso a este recurso" | Nenhum papel tem `companies.read` | Tela inacessível | Acesso negado até para o Administrador | Débito registrado | ⚠️ **D1** |
| Somente leitura abre a Administração | — | Modelo do papel | Exposição | Matriz | Rever o papel | ⚠️ **B10** |
| Rótulos em inglês na matriz | antes "Audit", "Rbac", "Company modules"… | — | — | — | — | B16 ✅ (rodada 48) |
| Operador com permissões amplas | — | Papel padrão inclui contas a pagar, baixa de recebimento e NCM (reconfirmado em 6 empresas) | Segregação fraca | Matriz | Criar papel mais restrito | ⚠️ **B9 / R48-04 (aberto)** |
| Texto "Novo(a) setor" | — | Rótulo genérico | Estética | Botões de Setores, Cargos, Unidades | — | ⚠️ observação |
| Início dos papéis personalizados | — (antes: "Não foi possível carregar o relatório executivo…") | O bloco executivo só aparece para quem tem reports.view e controlling.view | — | — | — | B6 ✅ (rodada 48) |

## 10. Exercício prático

1. Crie o papel **Comprador** (código `COMPRADOR`) com solicitações e pedidos de compra (ver, criar, editar) e consulta de fornecedores e produtos.
2. Convide um usuário fictício com esse papel e defina setor, cargo e unidade.
3. Cancele e reenvie o convite.
4. Desabilite e reabilite um módulo não essencial; leia as confirmações.
5. **Pergunta:** a pessoa tem o cargo "Gerente de compras", mas o papel Comprador. Ela consegue aprovar um pedido de compra? Por quê?

## 11. Checklist de conclusão

- [ ] Fiz o primeiro acesso e conheço a visão geral.
- [ ] Criei setores e cargos e sei a diferença entre papel e cargo.
- [ ] Criei um papel personalizado e salvei a matriz.
- [ ] Convidei usuários com o papel certo; sei reenviar, cancelar, desativar e reativar.
- [ ] Defini o contexto organizacional e zerei as pendências.
- [ ] Habilitei e desabilitei módulos contratados.
- [ ] Criei uma regra de foco dos painéis.
- [ ] Conheço D1, B10, B16 e B6.

## 12. Evidências

Salvar em `docs/academy/10-configuracoes/evidencias/`:

| # | Captura | Comprova |
|---|---|---|
| 01 | `01-visao-geral.png` | Números e pendências |
| 02 | `02-setores-cargos.png` | Estrutura criada |
| 03 | `03-papel-financeiro.png` | "Papel Financeiro criado." |
| 04 | `04-matriz.png` | Rodapé "N adicionada(s)" e B16 |
| 05 | `05-papel-protegido.png` | Alerta do Administrador |
| 06 | `06-convites.png` | Seis convites pendentes (links mascarados) |
| 07 | `07-contexto.png` | "Contexto organizacional atualizado." |
| 08 | `08-modulos.png` | Desabilitar com confirmação |
| 09 | `09-foco.png` | "Regra de foco salva." |
| 10 | `10-dados-empresa-d1.png` | "Sem acesso a este recurso" |
| 11 | `11-carlos-sem-convidar.png` | Limite do Gerente |

Regra: nenhum link de convite, token ou senha legível nas capturas.

## 13. Preparação técnica

| Item | Como | Motivo | Resultado esperado |
|---|---|---|---|
| Convite da Ana | Aula 01 (Marcus) | Primeiro acesso real | Link na caixa local (`mail-sink`) |
| Caixa de e-mail local | `mail-sink` da homologação | Mostrar os convites chegando | Convites capturados |
| Permissões dos papéis | [PERMISSOES-PAPEIS.md](PERMISSOES-PAPEIS.md) | Marcar a mesma matriz da homologação | Financeiro 43, Fiscal 44, Logística 43 |
| Aceite dos convites | Cada personagem aceita fora de cena | As aulas 02–09 precisam das contas ativas | "Conta ativa" para todos |
| Senhas | Só por variável de ambiente do script | Nunca em tela nem no Git | — |

- **Nenhuma etapa ⛔ nesta aula.**
- **Irreversível?** Usuários não são excluídos pela tela (desativar é o caminho). Executar no ambiente Academy.
- **Na gravação**, os papéis Fiscal e Logística podem ser preparados antes com a mesma matriz e mostrados prontos, para não alongar a aula (anunciar: "os outros dois papéis foram criados do mesmo jeito").

## Estrutura de cenas do vídeo

| Bloco | Cena | Tempo | Conteúdo |
|---|---|---|---|
| A | Abertura | 0:00–0:09 | Núcleo → "ATLAS.ERP Academy" → "10 · Configurações" |
| B | Contexto | 0:09–0:40 | "Segunda, 8h40" · pílula Ana/Administrador · quadro da equipe |
| C | Explicação | 0:40–1:50 | Papel × cargo; contratar × habilitar |
| D1 | Visão geral e estrutura | 1:50–3:20 | Pendências; setores; cargos |
| D2 | Papéis | 3:20–6:00 | Novo papel; matriz; papel protegido |
| D3 | Convites e contexto | 6:00–8:40 | Seis convites; contexto; pendências zeram |
| D4 | Módulos e foco | 8:40–10:20 | Desabilitar; regra de foco |
| E | Resultado | 10:20–11:00 | A equipe pronta |
| F | Erros | 11:00–13:20 | Gerente sem convidar, D1, B10, B16, B9, convite sem e-mail; desativar/reativar |
| — | Configurações do ERP | 13:20–13:50 | Parâmetros, Aparência, Documentação |
| G | Exercício | 13:50–14:15 | Tela de exercício |
| H | Fechamento | 14:15–14:35 | 3 linhas → "Próxima aula: Cadastros" → lockup |
