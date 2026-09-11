-- fn_set_product_category_path é `returns trigger` — só pode rodar em
-- contexto de trigger de qualquer forma (Postgres recusa chamada direta
-- a função de trigger), mas revogamos o EXECUTE explícito de
-- anon/authenticated por consistência com fn_seed_default_roles* (0008)
-- e para não aparecer no advisor de segurança.
revoke execute on function public.fn_set_product_category_path() from public, anon, authenticated;
