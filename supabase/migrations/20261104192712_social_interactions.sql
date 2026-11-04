-- Server-filtered following feed; the fifth argument defaults to the global
-- feed so existing clients omitting it keep their current behavior. Remove the
-- old overload to keep PostgREST argument resolution unambiguous.
drop function public.cheesit_read_feed(uuid,text,timestamptz,uuid);
create function public.cheesit_read_feed(p_owner uuid default null,p_workout text default null,
  p_before timestamptz default null,p_before_id uuid default null,p_following boolean default false) returns jsonb
language sql stable security invoker set search_path='' as $$
  with page as materialized (
    select w.* from public.cheesit_social_workouts w
    where w.published and w.available and (p_owner is null or w.owner_id=p_owner)
      and (p_workout is null or (p_owner is not null and w.workout_id=p_workout))
      and (not coalesce(p_following,false) or exists(select 1 from public.cheesit_follows f
        where f.follower_id=(select auth.uid()) and f.followed_id=w.owner_id))
      and (p_before is null or (w.published_at,w.post_id)<(p_before,p_before_id))
    order by w.published_at desc,w.post_id desc limit 21
  ), visible as (select * from page order by published_at desc,post_id desc limit 20)
  select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
    'id',w.post_id,'owner_id',w.owner_id,'workout_id',w.workout_id,'created_at',w.published_at,
    'username',p.username,'display_name',p.display_name,'photo',p.photo,'workout',w.workout,'photo_path',w.photo_path,'caption',w.caption,
    'likes',(select count(*) from public.cheesit_post_likes l where l.workout_owner=w.owner_id and l.workout_id=w.workout_id),
    'comments',(select count(*) from public.cheesit_post_comments c where c.workout_owner=w.owner_id and c.workout_id=w.workout_id),
    'liked',exists(select 1 from public.cheesit_post_likes l where l.workout_owner=w.owner_id and l.workout_id=w.workout_id and l.owner_id=(select auth.uid()))
    ) order by w.published_at desc,w.post_id desc) from visible w join public.cheesit_social_profiles p using(owner_id)),'[]'::jsonb),
    'next',case when (select count(*) from page)>20 then (select jsonb_build_object('created_at',published_at,'id',post_id)
      from visible order by published_at,post_id limit 1) else null end);
$$;
revoke all on function public.cheesit_read_feed(uuid,text,timestamptz,uuid,boolean) from public,anon,authenticated;
grant execute on function public.cheesit_read_feed(uuid,text,timestamptz,uuid,boolean) to authenticated;

-- A notification actor is the person who acted; its workout owner is the
-- author of the target post. Those are different for likes and comments.
alter table public.cheesit_notifications
  add column workout_owner uuid references public.cheesit_social_profiles(owner_id) on delete cascade,
  add column comment_id uuid references public.cheesit_post_comments(id) on delete cascade;
update public.cheesit_notifications set workout_owner=actor_id where kind='workout';
do $$
declare constraint_name text;
begin
  for constraint_name in select conname from pg_constraint
    where conrelid='public.cheesit_notifications'::regclass and contype='c'
      and pg_get_constraintdef(oid) ~ '\mkind\M'
  loop
    execute format('alter table public.cheesit_notifications drop constraint %I',constraint_name);
  end loop;
end;
$$;
alter table public.cheesit_notifications
  add constraint cheesit_notification_kind check(kind in ('follow','workout','like','comment')),
  add constraint cheesit_notification_target check(
    (kind='follow' and workout_id is null and workout_owner is null and comment_id is null) or
    (kind in ('workout','like') and workout_id is not null and workout_owner is not null and comment_id is null) or
    (kind='comment' and workout_id is not null and workout_owner is not null and comment_id is not null));
create index cheesit_notification_workout_owner on public.cheesit_notifications(workout_owner) where workout_owner is not null;
create index cheesit_notification_comment on public.cheesit_notifications(comment_id) where comment_id is not null;

-- Preserve existing workout-generating triggers and older clients without
-- rewriting their account/training functions. This is trigger-only; clients
-- never have INSERT access to notifications.
create function cheesit_private.notification_target_owner() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.kind='workout' and new.workout_owner is null then new.workout_owner:=new.actor_id; end if;
  return new;
end;
$$;
revoke all on function cheesit_private.notification_target_owner() from public,anon,authenticated;
create trigger cheesit_notification_target_owner before insert on public.cheesit_notifications
  for each row execute function cheesit_private.notification_target_owner();

create function cheesit_private.notify_post_interaction() returns trigger
language plpgsql security definer set search_path='' as $$
declare event_kind text; event_comment uuid; event text;
begin
  -- Do not send historical notifications from administrative imports/backfills.
  -- The source-table RLS verifies INSERT authority; recheck the post here at
  -- the privileged trigger boundary and suppress self-interactions.
  if (select auth.uid()) is null or new.owner_id is distinct from (select auth.uid()) or
    new.owner_id=new.workout_owner then return new; end if;
  if not exists(select 1 from public.cheesit_social_workouts w
    join public.cheesit_social_profiles p on p.owner_id=w.owner_id
    where w.owner_id=new.workout_owner and w.workout_id=new.workout_id
      and w.published and w.available and p.activity_shared) then return new; end if;
  if tg_table_name='cheesit_post_comments' then
    event_kind:='comment'; event_comment:=(to_jsonb(new)->>'id')::uuid;
    event:='comment:'||event_comment::text;
  else
    event_kind:='like';
    event:='like:'||new.owner_id::text||':'||new.workout_owner::text||':'||new.workout_id;
  end if;
  insert into public.cheesit_notifications(recipient_id,actor_id,kind,workout_owner,workout_id,comment_id,event_key)
    values(new.workout_owner,new.owner_id,event_kind,new.workout_owner,new.workout_id,event_comment,event)
    on conflict(recipient_id,event_key) do nothing;
  return new;
end;
$$;
revoke all on function cheesit_private.notify_post_interaction() from public,anon,authenticated;
create trigger cheesit_new_post_like after insert on public.cheesit_post_likes
  for each row execute function cheesit_private.notify_post_interaction();
create trigger cheesit_new_post_comment after insert on public.cheesit_post_comments
  for each row execute function cheesit_private.notify_post_interaction();

-- Keep the same bounded notification page, unread count and marking API.
-- Resolve labels from the live, published projection using RLS. An unavailable
-- or unpublished post never leaks its name through an old notification. A
-- deleted comment removes its notification via the FK rather than leaving an
-- orphan, and comment bodies/notes are never part of the notification payload.
create or replace function public.cheesit_read_notifications(p_before timestamptz default null,p_before_id uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('unread',(select count(*) from public.cheesit_notifications where recipient_id=(select auth.uid()) and read_at is null),
    'items',coalesce((select jsonb_agg(to_jsonb(page) order by page.created_at desc,page.id desc) from (
      select n.id,n.actor_id,n.kind,n.workout_owner,n.workout_id,n.comment_id,n.created_at,n.read_at,p.username,p.display_name,p.photo,
        (select coalesce((select string_agg(g,' y ' order by g) from (select distinct e->>'group' g from jsonb_array_elements(w.workout->'exercises') e) groups),w.workout->>'name')
          from public.cheesit_social_workouts w where w.owner_id=n.workout_owner and w.workout_id=n.workout_id
            and w.published and w.available) workout_label
      from public.cheesit_notifications n join public.cheesit_social_profiles p on p.owner_id=n.actor_id
      where n.recipient_id=(select auth.uid()) and (p_before is null or (n.created_at,n.id)<(p_before,p_before_id))
      order by n.created_at desc,n.id desc limit 21
    ) page),'[]'::jsonb));
$$;
revoke all on function public.cheesit_read_notifications(timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.cheesit_read_notifications(timestamptz,uuid) to authenticated;
