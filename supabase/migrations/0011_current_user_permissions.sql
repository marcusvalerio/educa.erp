-- Fase "RLS / RBAC / Catálogo — rodada 1" — suporte a /api/me.
--
-- `has_permission(company_id, code)` (0007) responde uma pergunta de
-- cada vez. Para a UI saber "o que este usuário pode fazer" (e decidir
-- o que mostrar — lembrando que isso nunca é a camada de segurança,
-- só de conveniência), é mais direto ter a lista inteira em uma
-- chamada. Não depende do usuário ter a permissão 'roles.read' (ao
-- contrário de simplesmente fazer SELECT em role_permissions/roles) —
-- é security definer de propósito, igual has_permission.
create or replace function public.current_user_permissions(p_company_id uuid)
returns table(code text)
language sql
security definer
stable
set search_path = public
as $$
  select distinct p.code
  from public.users u
  join public.user_roles ur on ur.user_id = u.id
  join public.roles r on r.id = ur.role_id
  join public.role_permissions rp on rp.role_id = r.id
  join public.permissions p on p.id = rp.permission_id
  where u.auth_user_id = auth.uid()
    and u.company_id = p_company_id
    and u.status = 'active'
    and r.status = 'active';
$$;

comment on function public.current_user_permissions is
  'Lista de códigos de permissão do usuário autenticado (auth.uid()) na empresa informada — usada por /api/me. Não substitui has_permission()/RLS como camada de segurança.';
