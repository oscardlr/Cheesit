-- The account document remains the source of truth. Existing profiles may omit gym.
-- Extend only the personal profile allowlist; preserve the full account validator.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.cheesit_validate_data(jsonb)'::regprocedure) into definition;
  if position('''displayName'',''bio'',''photo''' in definition)=0 or
     position('not (item ? ''photo'') then raise exception ''invalid personal profile''' in definition)=0 then
    raise exception 'unexpected personal profile validator; review migration';
  end if;
  definition := replace(definition,'''displayName'',''bio'',''photo''','''displayName'',''bio'',''photo'',''gym''');
  definition := replace(definition,
    'not (item ? ''photo'') then raise exception ''invalid personal profile''',
    '(item ? ''gym'' and (jsonb_typeof(item->''gym'') is distinct from ''string'' or length(item->>''gym'') > 100)) or' || chr(10) ||
    '       not (item ? ''photo'') then raise exception ''invalid personal profile''');
  execute definition;
end;
$$;

-- A projection with the same visibility as the existing public name and bio.
-- No new direct write grants: changes still require the owner-checked account CAS RPC.
alter table public.cheesit_social_profiles add column gym text check(gym is null or length(gym)<=100);

create or replace function cheesit_private.sync_social_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.cheesit_social_profiles(owner_id,username,display_name,photo,bio,gym)
    select i.owner_id,i.username,coalesce(a.data->'personalProfile'->>'displayName',''),
      a.data->'personalProfile'->>'photo',coalesce(a.data->'personalProfile'->>'bio',''),
      a.data->'personalProfile'->>'gym'
    from public.cheesit_identities i join public.cheesit_accounts a using(owner_id)
    where i.owner_id=new.owner_id and i.completed_at is not null
    on conflict(owner_id) do update set username=excluded.username,
      display_name=excluded.display_name,photo=excluded.photo,bio=excluded.bio,gym=excluded.gym;
  if not exists(select 1 from public.cheesit_identities where owner_id=new.owner_id and completed_at is not null) then
    delete from public.cheesit_social_profiles where owner_id=new.owner_id;
  end if;
  return new;
end;
$$;
revoke all on function cheesit_private.sync_social_profile() from public,anon,authenticated;

-- Synchronize existing projections without rewriting any private account document.
update public.cheesit_social_profiles p set gym=a.data->'personalProfile'->>'gym'
from public.cheesit_accounts a where a.owner_id=p.owner_id;

-- cheesit_read_social is SECURITY INVOKER and serializes to_jsonb(p), so its
-- bounded profile/search/follower results include gym automatically under RLS.
