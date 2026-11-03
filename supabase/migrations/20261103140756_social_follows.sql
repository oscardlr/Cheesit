-- Social projection only. Existing account documents, identities and policies
-- are never rewritten or exposed. Completed accounts are copied into this table.
create table public.cheesit_social_profiles (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  photo text,
  bio text not null
);
create index cheesit_social_username_prefix on public.cheesit_social_profiles(username text_pattern_ops);
alter table public.cheesit_social_profiles enable row level security;
revoke all on public.cheesit_social_profiles from public, anon, authenticated;
grant select on public.cheesit_social_profiles to authenticated;
create policy "signed in social profiles" on public.cheesit_social_profiles
  for select to authenticated using ((select auth.uid()) is not null);

-- Trigger-only privilege boundary: projects an explicit allowlist from private
-- accounts. Not API-callable, no user-supplied owner or data parameters.
create function cheesit_private.sync_social_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.cheesit_social_profiles(owner_id,username,display_name,photo,bio)
    select i.owner_id,i.username,coalesce(a.data->'personalProfile'->>'displayName',''),
      a.data->'personalProfile'->>'photo',coalesce(a.data->'personalProfile'->>'bio','')
    from public.cheesit_identities i join public.cheesit_accounts a using(owner_id)
    where i.owner_id=new.owner_id and i.completed_at is not null
    on conflict(owner_id) do update set username=excluded.username,
      display_name=excluded.display_name,photo=excluded.photo,bio=excluded.bio;
  if not exists(select 1 from public.cheesit_identities where owner_id=new.owner_id and completed_at is not null) then
    delete from public.cheesit_social_profiles where owner_id=new.owner_id;
  end if;
  return new;
end;
$$;
revoke all on function cheesit_private.sync_social_profile() from public,anon,authenticated;
create trigger cheesit_social_account after insert or update of data on public.cheesit_accounts
  for each row execute function cheesit_private.sync_social_profile();
create trigger cheesit_social_identity after insert or update on public.cheesit_identities
  for each row execute function cheesit_private.sync_social_profile();
insert into public.cheesit_social_profiles(owner_id,username,display_name,photo,bio)
  select i.owner_id,i.username,coalesce(a.data->'personalProfile'->>'displayName',''),
    a.data->'personalProfile'->>'photo',coalesce(a.data->'personalProfile'->>'bio','')
  from public.cheesit_identities i join public.cheesit_accounts a using(owner_id)
  where i.completed_at is not null;

create table public.cheesit_follows (
  follower_id uuid not null references public.cheesit_social_profiles(owner_id) on delete cascade,
  followed_id uuid not null references public.cheesit_social_profiles(owner_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(follower_id,followed_id),
  constraint cheesit_no_self_follow check(follower_id<>followed_id)
);
create index cheesit_followed_lookup on public.cheesit_follows(followed_id,follower_id);
alter table public.cheesit_follows enable row level security;
revoke all on public.cheesit_follows from public,anon,authenticated;
grant select,insert,delete on public.cheesit_follows to authenticated;
create policy "signed in follows" on public.cheesit_follows for select to authenticated
  using ((select auth.uid()) is not null);
create policy "create own follows" on public.cheesit_follows for insert to authenticated
  with check ((select auth.uid())=follower_id and exists(
    select 1 from public.cheesit_social_profiles where owner_id=(select auth.uid())));
create policy "delete own follows" on public.cheesit_follows for delete to authenticated
  using ((select auth.uid())=follower_id);

-- One bounded, RLS-respecting read for search, a profile, or either list.
-- No SECURITY DEFINER and no reference to private documents or Auth metadata.
create function public.cheesit_read_social(p_query text default '',p_owner uuid default null,
  p_list text default null,p_offset integer default 0) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with query as (select lower(regexp_replace(btrim(p_query),'^@','')) as handle),
  page as (
    select p.* from public.cheesit_social_profiles p cross join query q
    where (select auth.uid()) is not null and (
      (p_owner is null and p_list is null and q.handle ~ '^[a-z0-9_][a-z0-9._]{0,29}$'
        and p.username like replace(q.handle,'_','\_') || '%' escape '\')
      or (p_owner is not null and p_list is null and p.owner_id=p_owner)
      or (p_owner is not null and p_list='followers' and exists(
        select 1 from public.cheesit_follows f where f.followed_id=p_owner and f.follower_id=p.owner_id))
      or (p_owner is not null and p_list='following' and exists(
        select 1 from public.cheesit_follows f where f.follower_id=p_owner and f.followed_id=p.owner_id))
    ) order by p.username,p.owner_id limit 21 offset greatest(coalesce(p_offset,0),0)
  )
  select coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object(
    'followers',(select count(*) from public.cheesit_follows f where f.followed_id=p.owner_id),
    'following',(select count(*) from public.cheesit_follows f where f.follower_id=p.owner_id),
    'is_following',exists(select 1 from public.cheesit_follows f where f.follower_id=(select auth.uid()) and f.followed_id=p.owner_id),
    'follows_you',exists(select 1 from public.cheesit_follows f where f.followed_id=(select auth.uid()) and f.follower_id=p.owner_id)
  ) order by p.username,p.owner_id),'[]'::jsonb) from page p;
$$;
revoke all on function public.cheesit_read_social(text,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.cheesit_read_social(text,uuid,text,integer) to authenticated;
