# Testes — Fase 2 / 2b

## 1. Testes automatizados (não dependem de credenciais do Supabase)

```bash
npm test
```

Roda `node --test` sobre `tests/*.test.ts` (via `tsx`, sem dependências
de teste adicionais). Cobre a camada que não depende de rede:

- `tests/validations.test.ts` — os schemas Zod (`src/lib/validations/
  cadastros.ts`) rejeitam payloads incompletos/inválidos e aceitam os
  válidos, com os defaults corretos.
- `tests/mappers.test.ts` — mapeamento camelCase (entidade) ↔
  snake_case (linha do banco) para Produto/Cliente/Motorista,
  incluindo o caso que gerou um bug real durante o desenvolvimento:
  um update parcial (`{ descricao: "Novo nome" }`) não pode
  transformar campos não enviados em `NULL` no banco.
- `tests/catalog.test.ts` — validação e mapeamento das novas entidades
  de catálogo (categoria/marca/unidade/conversão/fornecedor do
  produto): categoria com/sem `categoriaPaiId`, conversão rejeita fator
  ≤ 0, `productToRowFields` não sobrescreve `category_id`/`brand_id`/
  `unit_id` não enviados em updates parciais.
- `tests/cnh-alert.test.ts` — a lógica de alerta de CNH vencida/a
  vencer em 30 dias continua correta após a migração para o banco
  (mesma função usada pela coluna "Validade CNH" da listagem).

`npm run lint` e `npm run build` (typecheck completo do Next.js)
também são parte da verificação desta fase — ambos devem terminar sem
erros antes de qualquer commit.

## 1.1 Verificação de RLS/RBAC (requer Supabase real)

`supabase/tests/rls_rbac.sql` roda dentro de uma transação com
`rollback` no final (nenhum dado de teste fica no banco) e verifica,
contra um projeto Supabase real com as migrations 0001-0007 aplicadas:

- Um usuário da empresa A não consegue **ver**, **alterar** nem
  **excluir** um produto da empresa B (RLS, não apenas a API).
- `bootstrap_admin_user()` falha na segunda chamada para a mesma
  empresa (não dá para criar um segundo "primeiro admin").
- O papel padrão `admin` não pode ser excluído, nem pelo próprio admin.
- Um usuário com o papel `viewer` (só `*.read`) consulta produtos, mas
  o INSERT é rejeitado pelo RLS (sem `products.create`) e o DELETE não
  afeta nenhuma linha (sem `products.delete`).

Rode com:

```bash
psql "$SUPABASE_DB_URL" -f supabase/tests/rls_rbac.sql
```

(ou cole o conteúdo no SQL Editor do Supabase). Se tudo passar, a
última linha impressa é `TODAS AS VERIFICAÇÕES DE RLS/RBAC PASSARAM`;
qualquer verificação que falhar interrompe o script com
`ASSERTION FAILED: <descrição>`.

## 2. Roteiro de testes manuais (requer Supabase configurado)

Execute depois de `npm run dev` com `.env.local` preenchido, migrations
0001-0007 aplicadas e seed rodado (ver `docs/SUPABASE.md`). **Novo
nesta fase:** crie um usuário em Authentication > Users no painel do
Supabase, rode `bootstrap_admin_user(...)` (docs/RBAC.md §4) e faça
login em `/login` com esse usuário — sem sessão autenticada e sem
permissão RBAC, toda rota de `/api/*` responde 401/403 antes mesmo de
chegar ao banco.

### 2.1 CRUD básico (repetir para os 8 cadastros)

- [ ] Criar um registro válido → aparece no topo da listagem, toast de
      sucesso.
- [ ] Tentar salvar com campos obrigatórios vazios → erros específicos
      por campo, nada é enviado ao servidor.
- [ ] Editar um registro existente → valores carregam corretos no
      formulário; salvar reflete na listagem.
- [ ] Visualizar (modo leitura) → todos os campos aparecem, incluindo
      relacionamentos e histórico de auditoria.
- [ ] Ativar/inativar → badge de status muda imediatamente, toast de
      sucesso.
- [ ] Excluir um registro sem vínculos → confirmação → desaparece da
      listagem.
- [ ] Pesquisar por texto (nome/código/documento) → filtra
      corretamente.
- [ ] Filtrar por status/categoria/tipo → resultado bate com o filtro.
- [ ] Paginação → navega entre páginas sem perder o filtro ativo.

### 2.2 Persistência real (obrigatório — ver `docs/SUPABASE.md` §9)

- [ ] Criar um fornecedor → **F5** → continua na listagem.
- [ ] Consultar `select * from public.suppliers` no Supabase → a linha
      existe.
- [ ] Repetir para produto, cliente e transportadora.

### 2.3 Relacionamentos

- [ ] Produto exibe (na visualização) o nome do fornecedor vinculado e
      a localização padrão.
- [ ] Fornecedor exibe a lista de produtos vinculados.
- [ ] Transportadora exibe motoristas e veículos vinculados.
- [ ] Motorista exibe a transportadora e os veículos onde é motorista
      principal.
- [ ] Veículo exibe transportadora e motorista principal.
- [ ] Local de estoque exibe os produtos que o usam como localização
      padrão.

### 2.4 Bloqueio de exclusão

- [ ] Criar um fornecedor, vincular um produto a ele (campo
      "Fornecedor" no formulário de produto).
- [ ] Tentar excluir o fornecedor → mensagem explicando o vínculo,
      exclusão bloqueada, opção de inativar continua disponível.
- [ ] Repetir para transportadora (com motorista/veículo vinculado) e
      para local de estoque (com produto vinculado).

### 2.5 Alerta de CNH

- [ ] Motorista com `cnh_expiration` no passado → badge "vencida".
- [ ] Motorista com vencimento nos próximos 30 dias → badge "a
      vencer".
- [ ] Motorista com vencimento distante → sem alerta.

### 2.6 Estados de carregamento e erro

- [ ] Ao abrir uma listagem, o spinner "Carregando..." aparece antes
      dos dados.
- [ ] Ao salvar, o botão muda para "Salvando..." e fica desabilitado
      até a resposta.
- [ ] Derrubar a conexão (ou usar uma URL Supabase inválida
      temporariamente) → tela de erro com "Tentar novamente" em vez de
      tela em branco ou crash.
- [ ] Um erro ao salvar mantém o formulário preenchido (nada é
      perdido) e mostra a mensagem de erro em português.

## 3. Problemas encontrados durante o desenvolvimento desta fase

- **IDs HTML duplicados** entre os campos do formulário e os campos de
  filtro (ambos usavam `id={chave}`) — corrigido prefixando os campos
  do formulário (`field-<chave>`) em `src/components/ui/Field.tsx`.
  Encontrado com um smoke test em navegador real durante a Fase 4;
  continua válido nesta fase.
- **Mapper `|| null` apagava campos não enviados** em updates parciais
  — encontrado pelo teste automatizado `mappers.test.ts` (ver acima) e
  corrigido com o helper `nullableText` em
  `src/lib/database/mappers.ts`.
- **`react-hooks/set-state-in-effect`** acusava `setState` síncrono no
  topo de `useEffect` para os efeitos de carregamento e de auditoria em
  `CadastroPage` — corrigido movendo o "ligar loading" para quem
  dispara o efeito (montagem inicial e o botão "Tentar novamente"),
  deixando o efeito reagir só à conclusão da Promise.
