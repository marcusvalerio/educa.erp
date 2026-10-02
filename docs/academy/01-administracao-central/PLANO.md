# Aula 01 — Administração Central

| | |
|---|---|
| **Público** | Owner e Admin da plataforma (quem vende e governa o ATLAS.ERP) |
| **Personagem** | **Marcus** — **Owner** (papel da plataforma) |
| **Viabilidade** | ✅ completa pela interface |
| **Duração estimada** | 11–13 min |

**O aluno sai sabendo:**

- entrar na Central;
- ler a visão geral;
- criar uma empresa cliente e convidar o primeiro administrador;
- mudar o ciclo de vida;
- contratar módulos;
- gerenciar membros da plataforma;
- consultar permissões, auditoria e políticas;
- explicar **o que o Owner faz e o administrador da empresa não faz**, e vice-versa.

## Cenário

**8h10 de segunda-feira.** O contrato da **Órbita Distribuidora** foi assinado na sexta. Marcus precisa:

1. criar a empresa;
2. deixar a Ana (futura administradora da Órbita) com o convite na caixa de entrada;
3. contratar os módulos do plano;
4. colocar a empresa em **Avaliação** — ela vira **Ativa** quando a implantação terminar, no fim da aula.

## Roteiro por parte

| # | Parte | Conteúdo | Telas / ações |
|---|---|---|---|
| 01 | Introdução | "A Administração Central é o painel de quem administra a **plataforma**, não uma empresa. Aqui nascem as empresas clientes e se decide o que cada uma contrata." Mostrar o símbolo de isolamento: a Central **não vê** pedidos, estoque nem financeiro. | — |
| 02 | Cenário | Marcus, Owner, 8h10, contrato assinado. | Menu da conta → **Administração Central** |
| 03 | Navegação | Visão geral: contadores, empresas por ciclo de vida, adoção de módulos (Gráfico/Tabela), aviso **Isolamento entre empresas**. Menu: Empresas, Módulos, Membros, Permissões, Auditoria, Políticas. Por que cada tela existe. | `/admincentral` 🔎 |
| 04 | Operação principal | (1) **Nova empresa**: Nome, razão social, CNPJ, contato, **Situação inicial** (Em avaliação), Plano, **Criar unidade inicial** (MATRIZ/Matriz). (2) **Criar empresa**: aviso *"Empresa criada."* e o próximo passo. (3) **Convidar administrador**: nome Ana, e-mail; *"Convite enviado ao administrador."*, bloco "Convite pendente" com validade. (4) Detalhe da empresa → **Módulos contratados**: ligar os módulos do plano; Núcleo e Cadastros são **Essenciais** (sem chave). | `/admincentral/companies` ✅ |
| 05 | O que acontece no ERP | Animação: a empresa nasce com **papéis padrão** (Administrador, Gerente, Operador, Vendedor, Somente leitura), unidade **Matriz** e módulos essenciais. O convite leva a Ana à **Administração da Empresa**, assunto da aula 10. **Contratar ≠ habilitar**: a Central contrata, a empresa habilita. | motion + detalhe |
| 06 | Caso realista | 17h: implantação concluída. Ciclo de vida → **Ativa**, com **Motivo** ("Implantação concluída") → **Aplicar situação** → confirmar. Contraponto: ao **suspender**, o aviso *"A empresa deixa de operar normalmente. Os dados dela não são apagados."* (mostrar a confirmação e **Cancelar**, sem suspender). | ✅ |
| 07 | Erros e exceções | Ver tabela abaixo. | ✅ |
| 08 | Conferência | Lista de empresas: Órbita com ciclo **Ativa** e 19 módulos contratados. **Auditoria da plataforma**: criação, ciclo de vida e contratos, com o autor. Bloco "Administrador da empresa" com o convite pendente ou aceito. | `/admincentral/audit` 🔎 |
| 09 | Relação | Central → **Administração da Empresa** (aula 10) → operação (aulas 02–08). Membros da plataforma: convidar um **Admin da plataforma** (diferença Owner × Admin; regra do **último Owner**). **Permissões** (Owner × Admin, "Só Owner"). **Políticas**: as 6 regras de governança e a documentação. | `/admincentral/platform-members` ✅ · `/permissions` 🔎 · `/settings` 🔎 |

**Quadro-síntese "quem faz o quê"** (motion, a partir do Manual de Administração §6.1):

| | Owner | Admin da plataforma | Administrador da empresa |
|---|---|---|---|
| Empresas | cria e muda o ciclo de vida | cria e muda o ciclo de vida | só a própria |
| Módulos | contrata | contrata | **habilita** os contratados |
| Membros da plataforma | Owners e Admins | só Admins | — |
| Usuários da empresa | convida o **primeiro** administrador | idem | convida e gerencia todos |
| Dados operacionais | **não vê** | **não vê** | vê, conforme o papel |

## Erros e exceções (reais)

| Erro | Por que acontece | Como resolver |
|---|---|---|
| *"Informe o nome da empresa."* | Campo obrigatório vazio | Preencher o nome |
| *"Já existe uma empresa com este documento."* | CNPJ já usado por outra empresa | Conferir o documento; se for a mesma empresa, abrir o registro existente |
| Proteção do **último Owner** (não pode ser rebaixado nem desativado) | A plataforma sempre mantém um Owner | Promover outro Owner antes |
| Ana (administradora da empresa) abre a Central: *"Acesso restrito à Administração Central"* | A Central é só para membros da plataforma | Explicar a separação; a Ana usa a Administração da Empresa |
| "Administrador de uma empresa não é convidado aqui" (janela de membros) | Membro da plataforma ≠ usuário de empresa | Convidar pelo detalhe da empresa (**Convidar administrador**) |

## Telas usadas

| Tela | Rota | Usuário | Legenda |
|---|---|---|---|
| Visão geral | `/app/admincentral` | Marcus | 🔎 |
| Empresas + assistente + detalhe | `/app/admincentral/companies` | Marcus | ✅ |
| Módulos | `/app/admincentral/modules` | Marcus | 🔎 |
| Membros | `/app/admincentral/platform-members` | Marcus | ✅ |
| Permissões · Auditoria · Políticas | `/app/admincentral/{permissions,audit,settings}` | Marcus | 🔎 |
| Acesso restrito | `/app/admincentral` | Ana | erro |

## Preparação de cena

- Ambiente Academy com a plataforma e o Owner **Marcus** (decisão 2 do README).
- Caixa de e-mail local para mostrar o convite chegando, se desejado.
- Nada ⛔ nesta aula.

## Observações

- Na gravação, o convite da Ana **não** é aceito. Ele é aceito no começo da aula 10, que mostra o primeiro acesso.
- Contratar e descontratar módulos não foi executado nos manuais; será a primeira execução real. Validar antes da gravação.
