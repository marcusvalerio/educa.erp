# Aula 01 — Administração Central

> Plano de produção. Revalidado no código (`2b9112b`) e no ambiente local em 02/10/2026.
> Padrões comuns: [PADRAO-DE-PRODUCAO.md](../PADRAO-DE-PRODUCAO.md) · mapeamento: [MAPEAMENTO.md](../MAPEAMENTO.md).

## 1. Identidade da aula

| | |
|---|---|
| **Número** | 01 |
| **Título** | Administração Central — colocando uma nova empresa no ATLAS.ERP |
| **Personagem** | **Marcus** |
| **Papel real** | **Owner** da plataforma (membro da plataforma, não usuário de empresa) |
| **Coadjuvante** | **Ana** (futura Administradora da Órbita), só para mostrar o acesso negado |
| **Duração estimada** | 12–13 min |
| **Nível** | Introdutório (governança da plataforma) |
| **Cobertura** | ✅ completa pela interface |
| **Objetivo principal** | Colocar uma empresa cliente para operar com segurança: criar, entregar o acesso ao primeiro administrador, ajustar o contrato de módulos e controlar o ciclo de vida, entendendo o que a plataforma **pode** e **não pode** ver. |

> **Atualização pós-estabilização — rodada de teste com 48 usuários em 7 empresas (02/10/2026).** Criação de empresa, convite do administrador e primeiro acesso refeitos para **7 empresas e 48 usuários sem nenhuma falha** (166 verificações). Isolamento entre empresas: 3.395 tentativas, 0 vazamentos — a frase da aula "cada empresa só enxerga os próprios dados" está comprovada. Nenhuma cena muda.
> Vale para a build da branch `claude/e2e-empresa-nova-correcoes` (commits `3ca2878`, `081edc1` e seguinte); **enquanto não houver merge, produção continua com o comportamento anterior** — grave na build corrigida. Detalhes em [`RELATORIO-TESTE-48-USUARIOS-7-EMPRESAS.md`](../../homologacao/RELATORIO-TESTE-48-USUARIOS-7-EMPRESAS.md).

## 2. Contexto de negócio

> Segunda-feira, 8h10. A Órbita Distribuidora, uma distribuidora de utilidades plásticas de São Paulo, assinou o contrato com o ATLAS.ERP na sexta-feira. O plano contratado é o de **distribuição**: vender, comprar, estocar, expedir, faturar e controlar o financeiro. A Órbita não fabrica nada, então os módulos de produção, manutenção de ativos, qualidade e projetos não fazem parte do contrato.
>
> Marcus cuida da plataforma. Hoje ele precisa:
>
> - criar o ambiente da Órbita;
> - deixar o convite na caixa de entrada da Ana, que será a administradora da empresa;
> - ajustar os módulos ao plano.
>
> A empresa fica **em avaliação** até a implantação terminar. No fim do dia, com tudo pronto, ele a marca como **ativa**.

## 3. O que o aluno vai aprender

- Diferenciar **plataforma** (Administração Central) de **empresa** (Administração da Empresa).
- Ler a visão geral da Central: contadores, ciclo de vida, adoção de módulos.
- Criar uma empresa cliente com unidade inicial.
- Convidar o **primeiro administrador** da empresa e entender por que só ele é convidado pela plataforma.
- Entender **contratar × habilitar**: a plataforma contrata; a empresa habilita o que foi contratado.
- Ajustar os módulos contratados ao plano.
- Mudar o ciclo de vida (Avaliação, Ativa, Suspensa, Cancelada) com motivo registrado.
- Convidar um membro da plataforma e conhecer a regra do **último Owner**.
- Saber o que a Central **não vê**: pedidos, estoque, financeiro, cadastros da empresa.
- Conferir tudo na auditoria da plataforma.

## 4. Conceito antes da tela

| Pergunta | Resposta |
|---|---|
| O que é | O painel de governança de quem opera o ATLAS.ERP como serviço: empresas clientes, contratos de módulos, membros da plataforma, permissões, auditoria e políticas. |
| Por que existe | Cada empresa é um ambiente isolado. Alguém precisa criar esse ambiente, entregar a primeira chave (o administrador) e controlar o contrato, **sem** ter acesso aos dados da operação. |
| Quem executa | **Owner** e **Admin da plataforma**. Administradores de empresa **não** entram aqui. |
| Módulo responsável | Administração Central (`/app/admincentral`) |
| Quem recebe o resultado | A **Administração da Empresa**: a Ana recebe o convite, entra e configura a equipe (aula 10). Depois, todos os módulos que ficaram contratados. |

**Quadro "quem faz o quê"** (Manual de Administração, §6.1):

| | Owner | Admin da plataforma | Administrador da empresa |
|---|---|---|---|
| Empresas | cria, muda o ciclo de vida | cria, muda o ciclo de vida | só a própria |
| Módulos | contrata e descontrata | contrata e descontrata | **habilita** os contratados |
| Catálogo de módulos | mantém ("Só Owner"; ⛔ sem tela) | consulta | — |
| Membros da plataforma | Owners e Admins | só Admins | — |
| Usuários da empresa | convida o **primeiro** administrador | idem | convida e gerencia todos |
| Dados operacionais | **não vê** | **não vê** | vê, conforme o papel |

## 5. Roteiro de navegação

```
PERSONAGEM: Marcus — Owner da plataforma

1. Entrar no ATLAS.ERP
   Rota: /login · E-mail marcus@atlaserp.test (senha só por variável de ambiente)
   Resultado: sessão aberta; o menu da conta mostra "Administração Central".

2. Abrir a Administração Central
   Ação: menu da conta → Administração Central
   Rota: /app/admincentral
   Resultado: Visão geral com o aviso "Isolamento entre empresas", os contadores
   (Empresas, Ativas, Em avaliação, Suspensas, Módulos no catálogo, Membros ativos),
   "Empresas por ciclo de vida" e "Adoção de módulos" (Gráfico/Tabela).

3. Ir para Empresas
   Ação: menu lateral → Empresas
   Rota: /app/admincentral/companies
   Resultado: lista com Empresa, Ciclo de vida, Plano, Contratada em, Módulos contratados,
   Habilitados; aviso "Identificação pelo nome de exibição"; botão "Nova empresa".

4. Criar a empresa
   Ação: Nova empresa
   Janela: "Nova empresa" — "Cadastro da empresa cliente. Papéis padrão, perfil na
   plataforma e todos os módulos da plataforma (contratados e habilitados) são criados
   automaticamente."
   Dados:
     Nome da empresa*   Órbita Distribuidora
     Razão social       Órbita Distribuidora de Utilidades Ltda.
     CNPJ / documento   48.271.093/0001-15
     E-mail             contato@orbitadistribuidora.test
     Telefone           (11) 4000-0000
     Endereço           Rua das Embalagens, 120
     Cidade / UF / CEP  São Paulo / SP / 01000-000
     Situação inicial   Em avaliação          (opções reais: Em avaliação, Ativa)
     Plano              DISTRIBUICAO          (código livre, opcional)
     Criar unidade inicial  ligado
       Código*          MATRIZ
       Nome da unidade* Matriz
   Ação: Criar empresa
   Resultado: toast "Empresa criada."; a janela vira "Empresa criada":
   "Em avaliação, com os papéis padrão e todos os módulos da plataforma contratados e
   habilitados e a unidade inicial".

5. Convidar o administrador da empresa (na mesma janela)
   Bloco: "Próximo passo: configurar administrador da empresa —
   Convide quem vai administrar a empresa. É essa pessoa que convida os demais usuários."
   Dados:
     Nome do administrador*  Ana
     E-mail*                 ana@orbitadistribuidora.test
   Ação: Convidar administrador
   Resultado: toast "Convite enviado ao administrador." e alerta "Convite enviado",
   com o "Link do convite" (copiável). Se o e-mail não sair: "Convite criado — envie o link".
   Ação: Configurar depois (fecha a janela)

6. Abrir o detalhe da Órbita
   Ação: na lista, clicar em "Órbita Distribuidora"
   Resultado: painel lateral com Plano (DISTRIBUICAO), Contratada em, Suspensa em, Cancelada em;
   bloco "Administrador da empresa" com o selo "Convite pendente";
   bloco "Ciclo de vida" (Nova situação, Motivo, Aplicar situação);
   bloco "Módulos contratados" (chaves; Núcleo e Cadastros com selo "Essencial").

7. Ajustar os módulos ao plano
   Ação: desligar as chaves de Produção, Manutenção, Ativos, Qualidade, Projetos e Serviços
   Resultado: a cada chave, toast "<módulo> descontratado." (ex.: "Produção descontratado.")
   Ficam contratados: Núcleo, Cadastros, Estoque, Compras, Comercial, Logística, Financeiro,
   Fiscal, Custos, Controladoria, CRM, Relatórios, Workflow e Aprovações,
   Importação e Exportação.

8. Conferir o catálogo e as permissões
   Rotas: /app/admincentral/modules (catálogo, empresas contratantes, habilitado em,
   permissões governadas) · /app/admincentral/permissions (Owner × Admin; itens "Só Owner")

9. Convidar um membro da plataforma
   Rota: /app/admincentral/platform-members
   Ação: Convidar membro
   Janela: "Convidar membro da plataforma" — aviso "Administrador de uma empresa não é
   convidado aqui"
   Dados: Nome "Paula" · E-mail paula@atlaserp.test · Papel "Admin da plataforma"
   Ação: Enviar convite → toast "Convite enviado para paula@atlaserp.test."
   Mostrar também: Editar o próprio Marcus → alerta "O último Owner ativo não pode ser
   rebaixado nem desativado — a plataforma sempre mantém um Owner." → Cancelar.

10. Fim do dia: ativar a empresa
    Rota: /app/admincentral/companies → Órbita → Ciclo de vida
    Dados: Nova situação "Ativa" · Motivo "Implantação concluída — equipe treinada"
    Ação: Aplicar situação → confirmação "Alterar para ativa?" — "A empresa volta a operar
    conforme os módulos contratados." → Aplicar
    Resultado: toast "Ciclo de vida alterado para ativa."
    Mostrar sem aplicar: selecionar "Suspensa" → a confirmação vira "A empresa deixa de
    operar normalmente. Os dados dela não são apagados." (tom de alerta) → Cancelar.

11. Conferir
    Rotas: /app/admincentral (contadores atualizados) · /app/admincentral/audit
    Resultado: a trilha da plataforma registra a criação da empresa, as mudanças de
    contratação, o ciclo de vida e o convite do membro, com o autor (Marcus).

PERSONAGEM: Ana — (convite ainda não aceito na gravação; usar a conta dela já ativa só para esta cena)

12. Mostrar a fronteira
    Ação: Ana tenta abrir /app/admincentral
    Resultado: "Acesso restrito à Administração Central"
```

## 6. Demonstração (o que aparece na gravação)

| Cena | Enquadramento e câmera | Destaques e callouts | Pausas e resultado |
|---|---|---|---|
| Visão geral | Tela cheia → zoom 1,3× no aviso "Isolamento entre empresas" → recuo → pan pelos contadores | Anel no aviso; callout "A Central nunca vê dados operacionais" | 3 s no aviso |
| Lista de empresas | Zoom 1,25× na tabela; destaque na coluna Ciclo de vida | Rótulo "Empresas clientes" | — |
| Nova empresa | Janela centralizada, zoom 1,5× no formulário; câmera desce campo a campo | Callouts: **Nome da empresa** (obrigatório), **CNPJ** (validado pelos dígitos), **Situação inicial**, **Criar unidade inicial** ("usuários trabalham dentro de unidades") | Cursor e digitação reais; 0,8 s antes de "Criar empresa" |
| Empresa criada | Zoom 1,6× no alerta verde | Sublinhar "todos os módulos da plataforma contratados e habilitados" | **3 s** no texto; marcar como ponto de atenção para a cena dos módulos |
| Convite | Zoom no bloco "Próximo passo"; depois no alerta "Convite enviado" e no link | Callout "Só a pessoa com este e-mail consegue aceitar" | 2,5 s no toast |
| Detalhe | Painel lateral; câmera sobe e desce entre os blocos | Selo "Convite pendente" em anel | 2 s |
| Módulos | Zoom 1,7× na lista de chaves; as cinco chaves desligam em sequência | Selo "Essencial" com callout "não podem ser descontratados"; contador lateral "14 de 19 contratados" (motion) | Toast de cada chave visível 1,2 s |
| Permissões | Pan pela tabela Owner × Admin; destaque em "Só Owner" | — | — |
| Membro | Janela de convite; zoom no aviso azul | — | 2,5 s no toast |
| Último Owner | Zoom no alerta amarelo da edição | Quadro de regra | 3 s; Cancelar |
| Ciclo de vida | Zoom no bloco; seleção "Ativa"; motivo digitado | Callout "Motivo vai para a auditoria" | Confirmação 2 s → toast 2,5 s |
| Suspensa (sem aplicar) | Mesma cena, confirmação vermelha | Quadro de atenção | Cancelar |
| Auditoria | Tela cheia → zoom nas linhas novas | Anel em autor e ação | 3 s |
| Fronteira | Corte seco para a sessão da Ana | Pílula de personagem muda para Ana | 3 s na tela de acesso restrito |

Transições: deslize lateral entre telas da Central; a "fronteira" usa uma linha laranja vertical que separa "Plataforma" de "Empresa".

## 7. Narração

**[A — Abertura]**
ATLAS.ERP Academy. Aula um: Administração Central.

**[B — Contexto]**
Segunda-feira, oito e dez. A Órbita Distribuidora assinou o contrato na sexta-feira. Hoje é o primeiro dia dela no ATLAS.ERP. Quem coloca a empresa no ar é o Marcus. Ele não trabalha na Órbita: ele administra a plataforma. E essa diferença é o assunto desta aula.

**[C — Explicação]**
No ATLAS.ERP, cada empresa é um ambiente isolado. A Administração Central é onde esses ambientes nascem e são governados. Aqui se decide quais empresas existem, quais módulos cada uma contratou e em que situação ela está. O que a Central não faz é tão importante quanto o que ela faz: ela não vê pedidos, estoque, financeiro nem os cadastros de nenhuma empresa. Quem trabalha dentro da empresa é a própria empresa.

**[D1 — Visão geral]**
Esta é a visão geral. O primeiro aviso já diz a regra: isolamento entre empresas. Logo abaixo ficam os números da plataforma: quantas empresas existem, quantas estão ativas, quantas em avaliação. O gráfico mostra a adoção de cada módulo.

**[D2 — Nova empresa]**
Vamos criar a Órbita. Em Empresas, clique em Nova empresa. O único campo obrigatório é o nome. Mesmo assim, preencha o CNPJ: o sistema confere os dígitos verificadores e impede que duas empresas usem o mesmo documento. A situação inicial fica em avaliação, porque a implantação ainda não terminou. E mantenha ligada a unidade inicial: no ATLAS.ERP, os usuários trabalham dentro de unidades, e a matriz já nasce pronta.

**[D3 — Empresa criada]**
Empresa criada. Leia com atenção a mensagem: a Órbita nasceu com os papéis padrão, com a unidade Matriz e com todos os módulos da plataforma contratados e habilitados. Vamos voltar a esse ponto daqui a pouco.

**[D4 — Convite]**
O próximo passo é dar a primeira chave. A plataforma convida apenas o primeiro administrador da empresa: a Ana. A partir dela, é a própria Órbita que convida o restante da equipe. Só quem tem este e-mail consegue aceitar o convite.

**[D5 — Módulos]**
Agora, o contrato. A Órbita é uma distribuidora: compra, estoca, vende e entrega, mas não fabrica. Por isso desligamos Produção, Manutenção, Ativos, Qualidade e Projetos. Núcleo e Cadastros são essenciais e não podem ser descontratados. Guarde esta diferença: a plataforma contrata; dentro da empresa, a administradora habilita o que foi contratado.

**[D6 — Membros e permissões]**
A plataforma também tem a sua equipe. Em Membros da plataforma, o Marcus convida a Paula como Admin da plataforma. Repare no aviso: administrador de empresa não é convidado aqui. E uma regra de segurança: o último Owner ativo nunca pode ser rebaixado nem desativado. A plataforma sempre mantém um Owner.

**[E — Resultado]**
Fim do dia: a implantação terminou. No detalhe da empresa, o Marcus muda a situação para ativa e escreve o motivo. Esse motivo fica registrado na auditoria. Se um dia for preciso suspender a empresa, o sistema avisa: ela deixa de operar normalmente, mas os dados não são apagados. Na auditoria da plataforma, tudo o que o Marcus fez hoje tem nome, data e ação.

**[F — Erros e exceções]**
Alguns cuidados. Sem nome, a empresa não é criada. Um CNPJ com dígitos errados é recusado, e um CNPJ já usado por outra empresa também. Se você ligar a unidade inicial, informe código e nome. E veja o que acontece quando a Ana tenta entrar aqui: acesso restrito. A Central é exclusiva dos membros da plataforma.

**[G — Exercício]**
Agora é com você. Crie uma segunda empresa de teste, com o seu próprio CNPJ fictício, convide um administrador e descontrate os módulos que ela não vai usar. Depois confira tudo na auditoria.

**[H — Fechamento]**
Resumindo: a Central cria a empresa, entrega a primeira chave e controla o contrato, sem enxergar a operação. Na próxima aula, a Órbita começa a ganhar forma: vamos cadastrar fornecedores, locais, produtos e clientes.

## 8. Estados e fluxo

```
CICLO DE VIDA DA EMPRESA
Em avaliação ──► Ativa ──► Suspensa ──► Ativa (reativação)
      │            │            │
      └────────────┴────────────┴──► Cancelada
(qualquer mudança exige "Aplicar situação" + confirmação; o motivo vai para a auditoria)

ADMINISTRADOR DA EMPRESA
Pendente ──(Convidar administrador)──► Convite pendente ──(aceite)──► Configurado

MÓDULO PARA A EMPRESA
Contratado pela plataforma ──► Habilitado / desabilitado pela empresa
(Essenciais: Núcleo e Cadastros, sempre contratados)
```

**Entrada:** contrato assinado (fora do sistema).
**Processamento:** criação da empresa + convite + contrato de módulos.
**Resultado:** empresa em avaliação, com unidade, papéis padrão, depósitos e unidades de medida criados automaticamente, e o convite da administradora pendente.
**Segue para:** Administração da Empresa (aula 10) → Cadastros (aula 02) → operação.

## 9. Erros e exceções

| Situação | Mensagem apresentada | Causa | Impacto | Como identificar | Solução | Bug? |
|---|---|---|---|---|---|---|
| Nome vazio | "Informe o nome da empresa." | Campo obrigatório | Empresa não criada | Campo destacado em vermelho | Preencher o nome | não |
| CNPJ com dígito errado (ex.: 48.271.093/0001-00) | "CNPJ inválido: confira os dígitos verificadores." | Documento inválido | Não cria | Mensagem sob o campo | Conferir o documento | não |
| CNPJ já usado | "Já existe uma empresa com este documento." | Outra empresa com o mesmo CNPJ | Não cria | Toast de erro | Buscar a empresa existente na lista | não |
| Unidade inicial ligada, sem código ou nome | "Para criar a unidade inicial, informe código e nome." | Regra da unidade | Não cria | Mensagem sob "Nome da unidade" | Preencher ou desligar a unidade | não |
| E-mail inválido (empresa ou convite) | "Informe um e-mail válido." | Formato | Não salva | Campo destacado | Corrigir | não |
| Convite sem envio de e-mail | Alerta "Convite criado — envie o link" | Serviço de e-mail indisponível | A pessoa não recebe automaticamente | Alerta amarelo em vez de verde | Copiar o "Link do convite" e enviar por outro canal | não |
| Rebaixar ou desativar o último Owner | "O último Owner ativo não pode ser rebaixado nem desativado — a plataforma sempre mantém um Owner." | Regra de governança | Alteração bloqueada | Alerta na edição | Promover outro Owner antes | não |
| Admin da plataforma tenta gerenciar um Owner | "Admins gerenciam apenas outros Admins. Owners são geridos somente por Owners." | Hierarquia | Bloqueado | Alerta na janela | Pedir a um Owner | não |
| Administradora da empresa abre a Central | "Acesso restrito à Administração Central" | Não é membro da plataforma | Sem acesso | Tela de acesso restrito | Usar a Administração da Empresa | não |
| Esperar "contratar o plano" depois de criar | — (a empresa já nasce com **todos** os módulos contratados) | Comportamento do sistema | Módulos fora do plano ficam disponíveis | Coluna "Módulos contratados" = 19 | **Descontratar** os que não fazem parte do plano | ⚠️ atenção (comportamento, não bug) |
| Manter o catálogo de módulos ("Só Owner") | — | ⛔ não há tela | — | Tela Módulos é só consulta | Fora do escopo da aula | ⛔ |

## 10. Exercício prático

1. Crie a empresa **"Nébula Atacado"**. Gere um CNPJ fictício válido, use a situação Em avaliação e ligue a unidade inicial (`MATRIZ`).
2. Convide um administrador fictício (`admin@nebula.test`).
3. Descontrate **Produção** e **Projetos e Serviços**.
4. Na auditoria da plataforma, encontre as três ações que você fez.
5. **Pergunta:** a Nébula consegue ver os pedidos da Órbita? Por quê?

## 11. Checklist de conclusão

- [ ] Sei explicar a diferença entre Administração Central e Administração da Empresa.
- [ ] Criei uma empresa com unidade inicial.
- [ ] Convidei o primeiro administrador e sei por que só ele é convidado pela plataforma.
- [ ] Sei que a empresa nasce com todos os módulos contratados e ajustei o contrato.
- [ ] Sei a diferença entre contratar (plataforma) e habilitar (empresa).
- [ ] Mudei o ciclo de vida com motivo e sei o efeito de suspender.
- [ ] Conheço a regra do último Owner.
- [ ] Encontrei minhas ações na auditoria da plataforma.
- [ ] Sei que a Central não vê dados operacionais.

## 12. Evidências

Salvar em `docs/academy/01-administracao-central/evidencias/` no dia da gravação:

| # | Captura | Comprova |
|---|---|---|
| 01 | `01-visao-geral.png` | Visão geral com o aviso de isolamento |
| 02 | `02-nova-empresa-preenchida.png` | Formulário completo (CNPJ válido, unidade inicial) |
| 03 | `03-nova-empresa-erro-cnpj.png` | "CNPJ inválido…" |
| 04 | `04-empresa-criada.png` | Alerta com "todos os módulos… contratados e habilitados" |
| 05 | `05-convite-enviado.png` | "Convite enviado" + link (link mascarado) |
| 06 | `06-detalhe-convite-pendente.png` | Bloco Administrador: Convite pendente |
| 07 | `07-modulos-ajustados.png` | 14 contratados; Produção, Manutenção, Ativos, Qualidade e Projetos desligados |
| 08 | `08-membro-convidado.png` | Paula como Admin da plataforma |
| 09 | `09-ultimo-owner.png` | Alerta do último Owner |
| 10 | `10-ciclo-ativa.png` | "Ciclo de vida alterado para ativa." |
| 11 | `11-auditoria-plataforma.png` | Ações do Marcus na trilha |
| 12 | `12-ana-acesso-restrito.png` | Fronteira plataforma × empresa |

Regra: nenhum link de convite, token ou senha legível nas capturas (mascarar).

## 13. Preparação técnica

| Item | Como | Motivo | Resultado esperado |
|---|---|---|---|
| Ambiente Academy limpo | Banco novo com as migrations do repositório; app no mesmo build | História sem resíduos de teste (README, decisão 2) | Plataforma vazia, só com o Owner |
| Owner Marcus | Bootstrap do primeiro Owner (mesmo procedimento da homologação: `docs/homologacao/`) | É o personagem | `marcus@atlaserp.test` com papel Owner |
| Caixa de e-mail local | `mail-sink` da homologação | Mostrar o convite chegando, se desejado | Convites capturados localmente |
| Conta da Ana para a cena da fronteira | Aceitar o convite **depois** da cena 5, fora da gravação | A aula 10 mostra o primeiro acesso; aqui ela só precisa existir | Ana entra e vê o acesso restrito |
| CNPJs | Os da bíblia (`PADRAO-DE-PRODUCAO.md` §4) | Passam na validação | — |

- **Nenhuma etapa ⛔ nesta aula.**
- **Irreversível?** Criar empresa e membro não tem exclusão pela interface. Por isso, só gravar no ambiente Academy, nunca na homologação compartilhada sem autorização.
- **Sem ambiente limpo:** gravar com uma empresa nova de nome diferente ("Órbita Academy"), porque a Órbita Distribuidora já existe na homologação.

## Estrutura de cenas do vídeo

| Bloco | Cena | Tempo | Conteúdo |
|---|---|---|---|
| A | Abertura | 0:00–0:09 | Núcleo → "ATLAS.ERP Academy" → "01 · Administração Central" |
| B | Contexto | 0:09–0:45 | Fundo escuro: "Segunda, 8h10" · contrato assinado · pílula Marcus/Owner |
| C | Explicação | 0:45–1:50 | Diagrama Plataforma × Empresas (cada empresa num cofre); quadro "quem faz o quê" |
| D1 | Visão geral | 1:50–2:40 | Cena da visão geral |
| D2 | Nova empresa | 2:40–4:40 | Formulário completo, campo a campo |
| D3 | Empresa criada | 4:40–5:10 | Alerta e ponto de atenção |
| D4 | Convite | 5:10–6:00 | Convite da Ana |
| D5 | Módulos | 6:00–7:20 | Detalhe → descontratar 5 módulos; contratar × habilitar |
| D6 | Catálogo, permissões, membros | 7:20–8:50 | Módulos, Permissões, Convidar Paula, último Owner |
| E | Resultado | 8:50–10:00 | Ativar com motivo; mostrar a confirmação de suspensão; auditoria |
| F | Erros | 10:00–11:30 | Nome vazio, CNPJ inválido, documento duplicado, unidade sem código; Ana com acesso restrito |
| G | Exercício | 11:30–11:55 | Tela de exercício |
| H | Fechamento | 11:55–12:15 | 3 linhas de resumo → "Próxima aula: Cadastros" → lockup |
