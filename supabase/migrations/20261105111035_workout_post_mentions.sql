-- The private account document keeps optional selections. Only server-resolved
-- bindings are copied into the readable post, and clients cannot insert notices.
alter table public.cheesit_social_workouts
  add column mentions jsonb not null default '{}'::jsonb;

-- Store directed blocks without exposing a received block to the other account.
create table public.cheesit_account_blocks (
  blocker_id uuid not null references public.cheesit_social_profiles(owner_id) on delete cascade,
  blocked_id uuid not null references public.cheesit_social_profiles(owner_id) on delete cascade,
  primary key (blocker_id,blocked_id),
  check (blocker_id<>blocked_id)
);
create index cheesit_blocks_received on public.cheesit_account_blocks(blocked_id);
alter table public.cheesit_account_blocks enable row level security;
revoke all on public.cheesit_account_blocks from public,anon,authenticated;
grant select,insert,delete on public.cheesit_account_blocks to authenticated;
create policy "manage own blocks" on public.cheesit_account_blocks for all to authenticated
  using (blocker_id=(select auth.uid())) with check (blocker_id=(select auth.uid()));

create function cheesit_private.post_visible_between(p_owner uuid,p_viewer uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select not exists(select 1 from public.cheesit_account_blocks b
    where (b.blocker_id=p_owner and b.blocked_id=p_viewer) or (b.blocker_id=p_viewer and b.blocked_id=p_owner));
$$;
revoke all on function cheesit_private.post_visible_between(uuid,uuid) from public,anon,authenticated;

-- A policy needs to test both directions without granting access to block rows.
create function cheesit_private.post_unblocked_for_viewer(p_owner uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and cheesit_private.post_visible_between(p_owner,auth.uid());
$$;
revoke all on function cheesit_private.post_unblocked_for_viewer(uuid) from public,anon,authenticated;
grant execute on function cheesit_private.post_unblocked_for_viewer(uuid) to authenticated;
create policy "exclude blocked accounts from posts" on public.cheesit_social_workouts as restrictive
  for select to authenticated using (cheesit_private.post_unblocked_for_viewer(owner_id));

create function public.cheesit_suggest_mentions(p_query text) returns jsonb
language sql stable security invoker set search_path='' as $$
  with query as (select lower(btrim(p_query)) as term, (select auth.uid()) as viewer),
  matches as materialized (
    select p.owner_id,p.username,p.display_name,p.photo,q.term,q.viewer
    from public.cheesit_social_profiles p cross join query q
    where q.viewer is not null and p.owner_id<>q.viewer and char_length(q.term) between 1 and 80
      and (strpos(p.username,q.term)>0 or strpos(lower(p.display_name),q.term)>0)
      and cheesit_private.post_unblocked_for_viewer(p.owner_id)
  ), ranked as (
    select m.owner_id,m.username,m.display_name,m.photo,
      (m.username=m.term)::int*8
      + exists(select 1 from public.cheesit_follows f where f.follower_id=m.viewer and f.followed_id=m.owner_id)::int*2
      + exists(select 1 from public.cheesit_follows f where f.follower_id=m.owner_id and f.followed_id=m.viewer)::int as rank
    from matches m order by rank desc,username limit 7
  )
  select coalesce(jsonb_agg(to_jsonb(r)-'rank' order by rank desc,username),'[]'::jsonb) from ranked r;
$$;
revoke all on function public.cheesit_suggest_mentions(text) from public,anon,authenticated;
grant execute on function public.cheesit_suggest_mentions(text) to authenticated;

create function cheesit_private.valid_mention_selections(p_selected jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
begin
  if jsonb_typeof(p_selected) is distinct from 'object' then return false; end if;
  return (select count(*)<=250 and coalesce(bool_and(key ~ '^[a-z0-9_][a-z0-9._]{2,29}$'
    and jsonb_typeof(value)='string'
    and (value #>> '{}') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),true)
    from jsonb_each(p_selected));
end;
$$;
revoke all on function cheesit_private.valid_mention_selections(jsonb) from public,anon,authenticated;

create function cheesit_private.resolve_post_mentions(p_owner uuid,p_workout text,p_caption text,p_selected jsonb,p_published boolean) returns jsonb
language sql stable set search_path='' as $$
  with previous as (
    select caption,mentions,published from public.cheesit_social_workouts where owner_id=p_owner and workout_id=p_workout
  ), tokens as (
    select distinct lower(m[1]) as token
    from regexp_matches(coalesce(p_caption,''),'(?<![[:alnum:]_@])@([A-Za-z0-9_][A-Za-z0-9._]*)','g') as m
  ), resolved as (
    select target.username,target.owner_id from tokens t left join previous old on true
    cross join lateral (
      select candidates.username,candidates.owner_id from (values (t.token),(rtrim(t.token,'.'))) names(username)
      cross join lateral (
        select names.username,
          coalesce(case when p.owner_id::text=p_selected->>names.username then p.owner_id::text end,
            old.mentions->>names.username,
            case when old.caption is distinct from p_caption or (p_published and not coalesce(old.published,false))
              then p.owner_id::text end) as owner_id
        from (select 1) anchor left join public.cheesit_social_profiles p on p.username=names.username
      ) candidates where candidates.owner_id is not null
      order by (candidates.username=t.token) desc limit 1
    ) target
  )
  select coalesce(jsonb_object_agg(username,owner_id),'{}'::jsonb) from resolved;
$$;
revoke all on function cheesit_private.resolve_post_mentions(uuid,text,text,jsonb,boolean) from public,anon,authenticated;

alter table public.cheesit_notifications
  drop constraint cheesit_notification_kind,
  drop constraint cheesit_notification_target,
  add constraint cheesit_notification_kind check(kind in ('follow','workout','like','comment','mention')),
  add constraint cheesit_notification_target check(
    (kind='follow' and workout_id is null and workout_owner is null and comment_id is null) or
    (kind in ('workout','like','mention') and workout_id is not null and workout_owner is not null and comment_id is null) or
    (kind='comment' and workout_id is not null and workout_owner is not null and comment_id is not null));

-- Remember first publication even for an ineligible recipient. Later edits
-- cannot turn a previously private or blocked mention into a new notification.
create table cheesit_private.post_mention_receipts (
  post_id uuid not null references public.cheesit_social_workouts(post_id) on delete cascade,
  recipient_id uuid not null references public.cheesit_social_profiles(owner_id) on delete cascade,
  primary key (post_id,recipient_id)
);
create index cheesit_mention_receipts_recipient on cheesit_private.post_mention_receipts(recipient_id);
alter table cheesit_private.post_mention_receipts enable row level security;
revoke all on cheesit_private.post_mention_receipts from public,anon,authenticated;

create function cheesit_private.notify_post_mentions() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.owner_id is distinct from (select auth.uid()) or not new.published or not new.available
    or new.mentions='{}'::jsonb then return new; end if;
  if tg_op='UPDATE' and old.published and old.mentions=new.mentions then return new; end if;
  with first_mentions as (
    insert into cheesit_private.post_mention_receipts(post_id,recipient_id)
      select distinct new.post_id,recipient.owner_id from jsonb_each_text(new.mentions) m
      join public.cheesit_social_profiles recipient on recipient.owner_id=m.value::uuid
      where recipient.owner_id<>new.owner_id
      on conflict do nothing
      returning recipient_id
  )
  insert into public.cheesit_notifications(recipient_id,actor_id,kind,workout_owner,workout_id,event_key)
    select first_mentions.recipient_id,new.owner_id,'mention',new.owner_id,new.workout_id,
      'mention:'||new.owner_id::text||':'||new.workout_id
    from first_mentions
    where cheesit_private.post_visible_between(new.owner_id,first_mentions.recipient_id)
      and exists(select 1 from public.cheesit_social_profiles where owner_id=new.owner_id and activity_shared)
    on conflict(recipient_id,event_key) do nothing;
  return new;
end;
$$;
revoke all on function cheesit_private.notify_post_mentions() from public,anon,authenticated;
create trigger cheesit_post_mentions after insert or update of mentions,published on public.cheesit_social_workouts
  for each row execute function cheesit_private.notify_post_mentions();

-- Extend the current projection and feed without replacing unrelated rules.
do $migration$
declare
  definition text;
  anchors text[] := array[
    $old$metadata-array['published','photoPath','caption']$old$,
    $old$      if metadata ? 'caption' and$old$,
    $old$published,published_at,photo_path,caption)$old$,
    $old$nullif(btrim(w->'publication'->>'caption'),''))$old$,
    $old$caption=excluded.caption,$old$,
    $old$or cheesit_social_workouts.caption is distinct from excluded.caption;$old$,
    $old$and f.follower_id<>new.owner_id on conflict do nothing;$old$
  ];
  replacements text[] := array[
    $new$metadata-array['published','photoPath','caption','mentions']$new$,
    $new$      if metadata ? 'mentions' and not cheesit_private.valid_mention_selections(metadata->'mentions') then
        raise exception 'invalid publication mentions' using errcode='22023';
      end if;
      if metadata ? 'caption' and$new$,
    $new$published,published_at,photo_path,caption,mentions)$new$,
    $new$nullif(btrim(w->'publication'->>'caption'),''),
        cheesit_private.resolve_post_mentions(new.owner_id,w->>'id',nullif(btrim(w->'publication'->>'caption'),''),
          w->'publication'->'mentions',is_published))$new$,
    $new$caption=excluded.caption,mentions=excluded.mentions,$new$,
    $new$or cheesit_social_workouts.caption is distinct from excluded.caption
        or cheesit_social_workouts.mentions is distinct from excluded.mentions;$new$,
    $new$and f.follower_id<>new.owner_id
          and cheesit_private.post_visible_between(new.owner_id,f.follower_id)
          and not exists(select 1 from public.cheesit_social_workouts post cross join lateral jsonb_each_text(post.mentions) mention
            where post.owner_id=new.owner_id and post.workout_id=w->>'id' and mention.value=f.follower_id::text)
        on conflict do nothing;$new$
  ];
  i integer;
begin
  definition:=pg_get_functiondef('cheesit_private.sync_social_activity()'::regprocedure);
  for i in 1..array_length(anchors,1) loop
    if length(definition)-length(replace(definition,anchors[i],'')) <> length(anchors[i]) then
      raise exception 'Unexpected activity projection definition at mention patch %',i;
    end if;
    definition:=replace(definition,anchors[i],replacements[i]);
  end loop;
  execute definition;

  definition:=pg_get_functiondef('public.cheesit_read_feed(uuid,text,timestamp with time zone,uuid,boolean)'::regprocedure);
  if length(definition)-length(replace(definition,$old$'caption',w.caption,$old$,'')) <> length($old$'caption',w.caption,$old$) then
    raise exception 'Unexpected feed definition for mention patch';
  end if;
  execute replace(definition,$old$'caption',w.caption,$old$,$new$'caption',w.caption,'mentions',w.mentions,$new$);
end;
$migration$;
