-- 0343 - setup inicial visual sem reabrir instalacoes existentes.

alter table public.platform_settings
  add column if not exists setup_completed_at timestamptz,
  add column if not exists setup_completed_by uuid;

comment on column public.platform_settings.setup_completed_at is
  'Instante em que o setup inicial da instalacao foi concluido.';
comment on column public.platform_settings.setup_completed_by is
  'Usuario criado ou promovido pelo setup inicial. Sem FK para preservar a proveniencia.';

alter table public.platform_branding
  add column if not exists support_email public.citext;

comment on column public.platform_branding.support_email is
  'Email publico de suporte da marca da instalacao.';

-- Uma instalacao atualizada que ja tenha administrador nunca pode reabrir o
-- setup. A primeira concessao ativa e a evidencia duravel disponivel.
insert into public.platform_settings (id)
select 1
where exists (
  select 1 from public.platform_admins where revoked_at is null
)
on conflict (id) do nothing;

update public.platform_settings ps
   set setup_completed_at = coalesce(ps.setup_completed_at, pa.granted_at),
       setup_completed_by = coalesce(ps.setup_completed_by, pa.user_id)
  from lateral (
    select user_id, granted_at
      from public.platform_admins
     where revoked_at is null
     order by granted_at asc, user_id asc
     limit 1
  ) pa
 where ps.id = 1
   and ps.setup_completed_at is null;

create or replace function public.fn_complete_initial_setup(
  p_actor uuid,
  p_org_name text,
  p_org_slug text,
  p_locale text,
  p_app_name text,
  p_support_email text default null,
  p_logo_url text default null,
  p_accent_hex text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings public.platform_settings%rowtype;
  v_org public.organizations%rowtype;
  v_completed_at timestamptz := clock_timestamp();
begin
  perform pg_advisory_xact_lock(hashtextextended('platform-initial-setup', 0));

  insert into public.platform_settings (id) values (1)
  on conflict (id) do nothing;

  select * into v_settings
    from public.platform_settings
   where id = 1
   for update;

  if v_settings.setup_completed_at is not null
     or exists (select 1 from public.platform_admins where revoked_at is null)
  then
    raise exception 'setup_already_completed' using errcode = '55000';
  end if;

  if not exists (select 1 from auth.users where id = p_actor) then
    raise exception 'setup_actor_not_found' using errcode = '23503';
  end if;

  if p_org_name is null or btrim(p_org_name) = '' or length(p_org_name) > 120
     or p_app_name is null or btrim(p_app_name) = '' or length(p_app_name) > 120
     or p_org_slug is null or p_org_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
     or p_locale not in ('pt-BR', 'es')
     or length(coalesce(p_support_email, '')) > 200
     or length(coalesce(p_logo_url, '')) > 2048
     or (nullif(btrim(p_accent_hex), '') is not null
         and lower(p_accent_hex) !~ '^#[0-9a-f]{6}$')
  then
    raise exception 'setup_invalid_input' using errcode = '22023';
  end if;

  insert into public.organizations (
    display_name, slug, legal_name, locale, status, created_by
  ) values (
    btrim(p_org_name), p_org_slug, btrim(p_org_name), p_locale, 'active', p_actor
  ) returning * into v_org;

  insert into public.user_organizations (
    organization_id, user_id, role, accepted_at
  ) values (
    v_org.id, p_actor, 'admin', v_completed_at
  );

  insert into public.platform_admins (
    user_id, granted_by, scope, mfa_required, reason
  ) values (
    p_actor, p_actor, 'full', false, 'Setup inicial visual da instalacao'
  );

  insert into public.platform_branding (
    id, app_name, logo_url, accent_hex, support_email,
    show_powered_by, seeded_from_env, updated_by
  ) values (
    1,
    btrim(p_app_name),
    nullif(btrim(p_logo_url), ''),
    lower(nullif(btrim(p_accent_hex), '')),
    nullif(btrim(p_support_email), '')::public.citext,
    true,
    false,
    p_actor
  )
  on conflict (id) do update set
    app_name = excluded.app_name,
    logo_url = excluded.logo_url,
    accent_hex = excluded.accent_hex,
    support_email = excluded.support_email,
    seeded_from_env = false,
    updated_by = excluded.updated_by,
    fallback_at = null,
    fallback_reason = null;

  update public.platform_settings
     set setup_completed_at = v_completed_at,
         setup_completed_by = p_actor,
         updated_by = p_actor
   where id = 1;

  return jsonb_build_object(
    'organization_id', v_org.id,
    'setup_completed_at', v_completed_at
  );
end;
$$;

revoke execute on function public.fn_complete_initial_setup(
  uuid, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.fn_complete_initial_setup(
  uuid, text, text, text, text, text, text, text
) to service_role;

notify pgrst, 'reload schema';
