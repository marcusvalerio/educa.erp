alter table public.branches enable row level security;
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
revoke execute on function public.fn_seed_default_roles() from public, anon, authenticated;
revoke execute on function public.fn_seed_default_roles_for_company(uuid) from public, anon, authenticated;
