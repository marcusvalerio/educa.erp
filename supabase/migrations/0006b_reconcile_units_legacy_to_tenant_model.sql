-- Fase 2b (correção, v2) — Reconciliação de public.units: modelo legado
-- global (code PK, sem id/company_id) -> modelo por-empresa REAL
-- esperado pelas migrations 0007+ (id uuid PK, company_id, unique
-- (company_id, code)).
--
-- POR QUE ESTA MIGRATION EXISTE: o Supabase remoto (bshvfsxapwwfntowdxyr)
-- já tem `public.units` criada com um desenho mais simples e anterior
-- (code text PK, name, created_at, 13 linhas reais). 0007+ pressupõem
-- id uuid + company_id.
--
-- POR QUE A v1 DESTA MIGRATION FOI CORRIGIDA: a v1 mantinha `code` como
-- PRIMARY KEY global e só adicionava `unique(company_id, code)` ao
-- lado. Revisão específica provou, por simulação estática da semântica
-- real do Postgres, que isso NÃO resolve multi-empresa: `insert into
-- units (...) on conflict (company_id, code) do nothing` (dentro de
-- fn_seed_company_units, 0007, disparada pelo trigger `seed_company_units`
-- toda vez que uma empresa é criada) só suprime conflito no índice
-- EXATAMENTE nomeado no ON CONFLICT. Uma 2ª empresa tentando obter seu
-- próprio código 'UN' ainda violaria a PK separada e global em `code`
-- (`units_pkey`), e esse erro NÃO é capturado pelo ON CONFLICT
-- (company_id, code) — a criação da 2ª empresa falharia inteira (erro
-- dentro de um trigger AFTER INSERT aborta a transação). `code`
-- PRECISA deixar de ser a única fonte de unicidade.
--
-- POR QUE RODA ANTES DE 0007 (nome `0006b`, entre 0006 e 0007): 0007
-- cria `unit_conversions` referenciando `units(id)` e roda
-- fn_seed_company_units() para toda empresa existente — ambos exigem
-- que o estado abaixo já exista quando 0007 executar.
--
-- ESTRATÉGIA ESCOLHIDA PARA OS RELACIONAMENTOS EXISTENTES (products.unit,
-- product_units.unit_code) — ver relatório desta tarefa para a matriz
-- de evidência completa. Resumo: o próprio código já converge para
-- unit_id (uuid) como caminho definitivo — 0007 cria E BACKFILLA
-- `products.unit_id` sozinho (linhas 174/229-233 de 0007), com
-- comentário explícito "unit é Depreciado — ver unit_id/units,
-- mantido em sincronia para compatibilidade de leitura"; 0027/0028/
-- 0029 (BOMs, ordens e consumo de produção) e 0050 (purchase/sale/
-- production_unit_id) só usam `unit_id`, nunca `code`. Ou seja,
-- Estratégia A (id) já é o caminho real do projeto para TUDO que é
-- código novo — não escolhido por preferência, mas porque é o único
-- padrão usado consistentemente em 0007-0063 e no schema.ts.
--
-- Só existem DUAS exceções — as FKs legadas em texto que já existiam
-- antes deste projeto adotar id: products.unit e product_units.unit_code.
-- Como `code` deixa de ser globalmente único nesta migration (exigência
-- do multi-empresa), uma FK simples de 1 coluna para units(code) deixa
-- de ser estruturalmente possível — o Postgres exige unique/PK sobre
-- EXATAMENTE as colunas referenciadas. A única forma de preservar essas
-- duas FKs sem apagar a relação é convertê-las para FK COMPOSTA
-- (company_id, unit)/(company_id, unit_code) -> units(company_id, code)
-- — Estratégia B, usada aqui só como ponte mecânica obrigatória para as
-- 2 colunas de texto legadas, não como desenho escolhido para o resto
-- do sistema. `products.unit_id` (Estratégia A) já vem populado por
-- 0007 e pode se tornar o caminho único mais adiante, numa migration
-- futura separada que finalmente aposente `products.unit`/
-- `product_units.unit_code` — não decidido nem feito aqui.
--
-- `product_units`: nenhuma linha de código em `src/` (schema.ts,
-- repositories.ts, handlers.ts, mappers.ts, rotas /api) referencia essa
-- tabela hoje — 0 linhas, nenhum tipo TS, nenhuma rota. Por isso NÃO
-- adiciono um `unit_id` novo nela: não há evidência de uso que
-- justifique esse campo agora (seria valor/estrutura inventada). Só a
-- FK existente é convertida para composta, pela mesma necessidade
-- mecânica de `products.unit`.
--
-- ESCOPO — o que esta migration EXPLICITAMENTE NÃO FAZ:
--   * NÃO preenche `base_unit_id` — fica NULL (sem dado confiável de
--     conversão ainda).
--   * NÃO preenche `fractionable` — fica NULL (ver nota na coluna).
--   * NÃO apaga `products.unit`/`product_units.unit_code` nem seus
--     dados — só reaponta a FK para a nova constraint.
--   * NÃO cria/altera nenhuma policy de RLS — proposta apresentada
--     separadamente no relatório desta tarefa, não aplicada aqui.
--   * NÃO cria o trigger `set_updated_at` em `units` — 0007 já cria
--     sem "if not exists"; criá-lo aqui faria 0007 falhar.
--
-- PRESERVAÇÃO DE DADOS: nenhum DELETE, nenhum DROP TABLE, nenhuma
-- reescrita de `code`/`name`/`created_at`/`unit`/`unit_code`. As duas
-- FKs recriadas mais abaixo são operações de METADADO (constraint),
-- não tocam em nenhuma linha/valor das tabelas de origem — o
-- relacionamento lógico (qual produto usa qual código de unidade)
-- permanece idêntico antes/depois.

-- ==================================================================
-- id — chave uuid que vai virar a PRIMARY KEY real (mais abaixo,
-- depois que as FKs legadas forem repontadas). Backfill defensivo além
-- do DEFAULT (gen_random_uuid() é volátil: o ADD COLUMN já reescreve a
-- tabela e popula cada linha existente; o UPDATE é uma segunda camada
-- de segurança, idempotente).
-- ==================================================================
alter table public.units
  add column if not exists id uuid default gen_random_uuid();

update public.units set id = gen_random_uuid() where id is null;

alter table public.units
  alter column id set not null;

-- ==================================================================
-- company_id — única empresa real hoje (00000000-0000-0000-0000-
-- 000000000001, ASTRA.ERP — confirmado por consulta direta ao banco
-- nesta e nas etapas anteriores). Sem ambiguidade: é a única linha em
-- public.companies.
-- ==================================================================
alter table public.units
  add column if not exists company_id uuid references public.companies(id) on delete cascade;

update public.units
set company_id = '00000000-0000-0000-0000-000000000001'
where company_id is null;

alter table public.units
  alter column company_id set not null;

-- Índice único em (company_id, code) — a ÚNICA fonte de unicidade de
-- code a partir de agora (substitui a antiga PK isolada em code, que
-- será removida mais abaixo). É o índice exato que fn_seed_company_units()
-- (0007) exige como alvo de "on conflict (company_id, code) do nothing".
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'units_company_id_code_key') then
    alter table public.units add constraint units_company_id_code_key unique (company_id, code);
  end if;
end;
$$;

-- ==================================================================
-- Reponta as duas FKs legadas (texto) para a nova constraint composta,
-- ANTES de remover a PK antiga em code — senão o Postgres recusa
-- "DROP CONSTRAINT units_pkey" enquanto essas FKs ainda dependerem
-- dela. Operação só de metadado: nenhuma linha de products/
-- product_units é lida, alterada ou apagada; os valores de
-- products.unit e product_units.unit_code continuam exatamente os
-- mesmos, só a constraint que os valida muda de alvo (de code isolado
-- para (company_id, code)). ON DELETE RESTRICT preservado, idêntico ao
-- comportamento anterior.
-- ==================================================================
alter table public.products
  drop constraint if exists products_unit_fkey;

alter table public.products
  add constraint products_unit_company_id_fkey
  foreign key (company_id, unit) references public.units (company_id, code) on delete restrict;

alter table public.product_units
  drop constraint if exists product_units_unit_code_fkey;

alter table public.product_units
  add constraint product_units_unit_code_company_id_fkey
  foreign key (company_id, unit_code) references public.units (company_id, code) on delete restrict;

-- ==================================================================
-- Troca de PRIMARY KEY: code -> id. Só é seguro agora porque nada mais
-- depende de units_pkey (as duas FKs acima já foram repontadas).
-- ==================================================================
alter table public.units
  drop constraint if exists units_pkey;

alter table public.units
  add constraint units_pkey primary key (id);

-- ==================================================================
-- symbol / unit_type / decimal_places — aditivas, sem valor de
-- negócio inventado. decimal_places usa o mesmo default (0) que
-- 0049_master_data_units_and_categories.sql já define — não é um
-- valor novo, é o mesmo default que o projeto já havia escolhido.
-- ==================================================================
alter table public.units
  add column if not exists symbol text,
  add column if not exists unit_type text,
  add column if not exists decimal_places integer not null default 0;

-- ==================================================================
-- base_unit_id — adicionado JÁ com a FK para units(id), incluída aqui
-- (e não deixada para 0049) porque 0049 usa `add column if not exists
-- base_unit_id uuid references public.units(id) ...`: se a coluna já
-- existir sem a FK, o "if not exists" pula a cláusula INTEIRA (coluna
-- + FK), e a FK nunca seria criada. Valor permanece NULL para as 13
-- linhas — sem dado confiável de conversão ainda.
-- ==================================================================
alter table public.units
  add column if not exists base_unit_id uuid references public.units(id) on delete set null;

-- ==================================================================
-- fractionable — ADITIVA, NULLABLE, SEM DEFAULT. Ver fn_seed_company_units
-- (0007) para os valores por unidade já registrados no próprio código
-- (UN=false, KG=true, G=true, L=true, ML=true, M=true, CM=true,
-- CX=false, FD=false, PAL=false; KIT/PC/T sem valor de referência) —
-- evidência real, não invenção, mas não aplicada aqui sem aprovação
-- explícita de preenchimento de dado.
-- ==================================================================
alter table public.units
  add column if not exists fractionable boolean;

-- ==================================================================
-- status — mesmo padrão estrutural de toda tabela do projeto.
-- ==================================================================
alter table public.units
  add column if not exists status text not null default 'active';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'units_status_check') then
    alter table public.units
      add constraint units_status_check
      check (status in ('active', 'inactive'));
  end if;
end;
$$;

-- ==================================================================
-- updated_at — coluna aditiva. Trigger set_updated_at deliberadamente
-- deixado para 0007 criar (evita "trigger already exists" quando 0007
-- rodar depois).
-- ==================================================================
alter table public.units
  add column if not exists updated_at timestamptz not null default now();

comment on column public.units.company_id is
  'Empresa dona desta unidade (modelo por-empresa, migration corretiva 0006b). Preenchida via backfill para a única empresa existente no momento desta migration.';
comment on column public.units.base_unit_id is
  'Unidade de referência do mesmo unit_type. Deixado NULL por esta migration — sem dado confiável de conversão ainda.';
comment on column public.units.fractionable is
  'Deixado NULL por esta migration — ver fn_seed_company_units (0007) para os valores por unidade já registrados no código como referência para preenchimento futuro; não aplicados aqui sem aprovação explícita.';
comment on constraint products_unit_company_id_fkey on public.products is
  'Substitui products_unit_fkey (que apontava para units.code isolado, impossível depois que code deixou de ser PK global). Ponte mecânica para o modelo por-empresa — o caminho definitivo já é products.unit_id (populado por 0007), que pode substituir esta FK por completo numa migration futura separada.';
comment on constraint product_units_unit_code_company_id_fkey on public.product_units is
  'Substitui product_units_unit_code_fkey pela mesma razão de products_unit_company_id_fkey. Sem unit_id equivalente nesta tabela — nenhum código em src/ consome product_units hoje (0 linhas), então não há evidência para adicionar essa coluna ainda.';
