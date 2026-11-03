-- Identity reservation is separate from the versioned private activity document.
-- Email/password remain exclusively in Supabase Auth. No public profile directory.
create schema if not exists cheesit_private;
revoke all on schema cheesit_private from public, anon, authenticated;
grant usage on schema cheesit_private to anon, authenticated;

create table public.cheesit_identities (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  completed_at timestamptz,
  constraint cheesit_username_format check (username ~ '^[a-z0-9_][a-z0-9._]{2,29}$')
);
-- Defense in depth even if normalization changes in a later client.
create unique index cheesit_username_unique on public.cheesit_identities (lower(username));
alter table public.cheesit_identities enable row level security;
create policy "read own identity" on public.cheesit_identities for select to authenticated
  using ((select auth.uid()) = owner_id);
revoke all on public.cheesit_identities from public, anon, authenticated;
grant select on public.cheesit_identities to authenticated;

create function cheesit_private.normalize_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.username := lower(regexp_replace(btrim(new.username), '^@', ''));
  return new;
end;
$$;
create trigger normalize_cheesit_identity before insert or update on public.cheesit_identities
  for each row execute function cheesit_private.normalize_identity();

-- Intentionally callable before authentication: reveals availability of one exact
-- handle only, never email, owner ID, or any private profile information.
create function cheesit_private.username_available(p_username text) returns boolean
language sql stable security definer set search_path = '' as $$
  select lower(regexp_replace(btrim(p_username), '^@', '')) ~ '^[a-z0-9_][a-z0-9._]{2,29}$'
    and not exists (select 1 from public.cheesit_identities
      where lower(username) = lower(regexp_replace(btrim(p_username), '^@', '')));
$$;
create function public.cheesit_username_available(p_username text) returns boolean
language sql stable security invoker set search_path = '' as $$
  select cheesit_private.username_available(p_username);
$$;
revoke all on function public.cheesit_username_available(text) from public;
grant execute on function public.cheesit_username_available(text) to anon, authenticated;

-- Runs in Auth's signup transaction: duplicate handles roll back user creation.
-- There is no authenticated UID during signup. This trigger is not API-callable.
create function cheesit_private.register_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  handle text := lower(regexp_replace(btrim(new.raw_user_meta_data->>'username'), '^@', ''));
  display_name text := btrim(new.raw_user_meta_data->>'display_name');
begin
  if handle is null or handle !~ '^[a-z0-9_][a-z0-9._]{2,29}$'
     or display_name is null or length(display_name) not between 1 and 80 then
    raise exception 'valid username and display name required' using errcode = '22023';
  end if;
  insert into public.cheesit_identities(owner_id,username) values(new.id,handle);
  insert into public.cheesit_accounts(owner_id,revision,data) values(new.id,1,
    jsonb_build_object('routines','[]'::jsonb,'workouts','[]'::jsonb,'customExercises','[]'::jsonb,
      'personalProfile',jsonb_build_object('displayName',display_name,'bio','','photo',null)));
  return new;
end;
$$;
create trigger cheesit_register_identity after insert on auth.users
  for each row execute function cheesit_private.register_identity();

-- Privileged transaction confined to the caller's UID. Uses the same lock and
-- revision as cheesit_commit_account so onboarding cannot overwrite activity.
create function cheesit_private.complete_profile(p_expected_owner uuid, p_display_name text, p_username text, p_profile jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner uuid := auth.uid();
  identity public.cheesit_identities;
  account public.cheesit_accounts;
  next_data jsonb;
  handle text := lower(regexp_replace(btrim(p_username), '^@', ''));
begin
  if owner is null or owner is distinct from p_expected_owner then
    raise exception 'authentication required or account changed' using errcode = '28000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text,0));
  select * into identity from public.cheesit_identities where owner_id=owner for update;
  if identity.completed_at is not null then return to_jsonb(identity); end if;
  if handle is null or handle !~ '^[a-z0-9_][a-z0-9._]{2,29}$'
     or p_display_name is null or length(btrim(p_display_name)) not between 1 and 80 then
    raise exception 'invalid identity' using errcode = '22023';
  end if;
  if identity.owner_id is not null and identity.username <> handle then
    raise exception 'reserved handle cannot change' using errcode = '22023';
  end if;
  select * into account from public.cheesit_accounts where owner_id=owner for update;
  next_data := coalesce(account.data,'{"routines":[],"workouts":[],"customExercises":[]}'::jsonb);
  -- Existing accounts keep their already collected physical data.
  if next_data->'profile' is null or next_data->'profile' = 'null'::jsonb then
    if p_profile is null or jsonb_typeof(p_profile) <> 'object'
       or not (p_profile ?& array['weightKg','heightCm','age','sex']) then
      raise exception 'initial profile required' using errcode = '22023';
    end if;
    next_data := jsonb_set(next_data,'{profile}',p_profile);
  end if;
  next_data := jsonb_set(next_data,'{personalProfile}',
    coalesce(next_data->'personalProfile','{"bio":"","photo":null}'::jsonb)
      || jsonb_build_object('displayName',btrim(p_display_name)));
  perform public.cheesit_validate_data(next_data);
  insert into public.cheesit_accounts(owner_id,revision,data) values(owner,coalesce(account.revision,0)+1,next_data)
    on conflict(owner_id) do update set data=excluded.data,revision=excluded.revision,updated_at=now();
  insert into public.cheesit_identities(owner_id,username,completed_at) values(owner,handle,now())
    on conflict(owner_id) do update set completed_at=excluded.completed_at returning * into identity;
  return to_jsonb(identity);
end;
$$;
create function public.cheesit_complete_profile(p_expected_owner uuid, p_display_name text, p_username text, p_profile jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select cheesit_private.complete_profile(p_expected_owner,p_display_name,p_username,p_profile);
$$;
revoke all on all functions in schema cheesit_private from public, anon, authenticated;
grant execute on function cheesit_private.username_available(text) to anon, authenticated;
grant execute on function cheesit_private.complete_profile(uuid,text,text,jsonb) to authenticated;
revoke all on function public.cheesit_complete_profile(uuid,text,text,jsonb) from public, anon;
grant execute on function public.cheesit_complete_profile(uuid,text,text,jsonb) to authenticated;
