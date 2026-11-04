-- Per-workout publishing. Existing profile choices and historical account
-- documents are untouched; only explicitly marked workouts enter the feed.
-- Preserve complete legacy social projections BEFORE any ALTER or sanitization.
-- cheesit_accounts remains the untouched source of truth; neither account
-- history nor the old projections' information is destroyed. The API-facing
-- copy below can exclude private notes/totals while these exact pre-migration
-- snapshots remain recoverable by the database administrator in a private
-- schema. Only explicit account deletion removes its archive via the FK.
create table cheesit_private.social_projection_archive (
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check(kind in ('workout','activity')),
  record_id text not null,
  payload jsonb not null,
  archived_at timestamptz not null default now(),
  primary key(owner_id,kind,record_id)
);
alter table cheesit_private.social_projection_archive enable row level security;
revoke all on cheesit_private.social_projection_archive from public,anon,authenticated;
insert into cheesit_private.social_projection_archive(owner_id,kind,record_id,payload)
  select w.owner_id,'workout',w.workout_id,to_jsonb(w) from public.cheesit_social_workouts w;
insert into cheesit_private.social_projection_archive(owner_id,kind,record_id,payload)
  select a.owner_id,'activity','summary',to_jsonb(a) from public.cheesit_social_activity a;

alter table public.cheesit_social_profiles alter column activity_shared set default true;
alter table public.cheesit_social_workouts
  add column post_id uuid not null default gen_random_uuid(),
  add column published boolean not null default false,
  add column published_at timestamptz,
  add column photo_path text;
alter table public.cheesit_social_workouts add constraint cheesit_social_post_id unique(post_id);
create index cheesit_feed_order on public.cheesit_social_workouts(published_at desc,post_id desc) where available and published;
create index cheesit_profile_feed_order on public.cheesit_social_workouts(owner_id,published_at desc,post_id desc) where available and published;

-- A public projection never includes the athlete's private notes, timers,
-- measurements, game state or publication metadata.
create or replace function cheesit_private.social_workout(w jsonb) returns jsonb
language sql immutable security invoker set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',w->'id','date',w->'date','name',w->'name','color',w->'color','status',w->'status',
    'createdAt',w->'createdAt','updatedAt',w->'updatedAt','startedAt',w->'startedAt','finishedAt',w->'finishedAt',
    'exercises',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id',e->'id','exerciseId',e->'exerciseId','name',e->'name','group',e->'group','mode',e->'mode',
      'loadConvention',e->'loadConvention','supersetId',e->'supersetId',
      'sets',(select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',s->'id',
        'weight',s->'weight','reps',s->'reps','confirmed',s->'confirmed','rpe',s->'rpe','rir',s->'rir','kind',s->'kind'))),'[]'::jsonb)
        from jsonb_array_elements(e->'sets') s)))) from jsonb_array_elements(w->'exercises') e),'[]'::jsonb)));
$$;
revoke all on function cheesit_private.social_workout(jsonb) from public,anon,authenticated;
-- Sanitize only the API-facing derived copy; its complete original row has
-- already been preserved in cheesit_private.social_projection_archive above.
update public.cheesit_social_workouts set workout=cheesit_private.social_workout(workout);
-- Legacy totals included every private and historical workout. Never expose
-- those aggregates through the old activity RPC or its directly readable table.
-- Owner progression continues to use the unchanged private account/local
-- document, and the exact previous summary is retained in the private archive.
update public.cheesit_social_activity set summary=null;

drop policy "read shared workouts" on public.cheesit_social_workouts;
create policy "read published workouts" on public.cheesit_social_workouts for select to authenticated using (
  available and (select auth.uid()) is not null and (
    owner_id=(select auth.uid()) or (published and exists(
      select 1 from public.cheesit_social_profiles p where p.owner_id=cheesit_social_workouts.owner_id and p.activity_shared))));

create or replace function cheesit_private.sync_social_activity() returns trigger
language plpgsql security definer set search_path='' as $$
declare w jsonb; first_publication boolean; is_published boolean; path text; metadata jsonb;
begin
  -- Validate even drafts: malformed markers never become silently public.
  for w in select value from jsonb_array_elements(new.data->'workouts') loop
    if w ? 'publication' then
      metadata:=w->'publication';
      if jsonb_typeof(metadata) is distinct from 'object' or
        jsonb_typeof(metadata->'published') is distinct from 'boolean' or
        metadata-array['published','photoPath'] <> '{}'::jsonb then
        raise exception 'invalid publication' using errcode='22023';
      end if;
      if metadata ? 'photoPath' and (jsonb_typeof(metadata->'photoPath') is distinct from 'string' or
        metadata->>'photoPath' !~ ('^'||new.owner_id::text||'/'||(w->>'id')||'/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$')) then
        raise exception 'invalid publication photo' using errcode='22023';
      end if;
    end if;
  end loop;
  if not exists(select 1 from public.cheesit_social_profiles where owner_id=new.owner_id) then return new; end if;
  insert into public.cheesit_social_activity(owner_id,summary) values(new.owner_id,null)
    on conflict(owner_id) do update set summary=excluded.summary;
  update public.cheesit_social_workouts p set available=false where p.owner_id=new.owner_id and p.available and not exists(
    select 1 from jsonb_array_elements(new.data->'workouts') x where x->>'id'=p.workout_id and x->>'status'='finished');
  for w in select value from jsonb_array_elements(new.data->'workouts') where value->>'status'='finished' loop
    is_published:=coalesce(w->'publication'->'published'='true'::jsonb,false);
    path:=w->'publication'->>'photoPath';
    insert into public.cheesit_social_workouts(owner_id,workout_id,workout,workout_date,created_at,published,published_at,photo_path)
      values(new.owner_id,w->>'id',cheesit_private.social_workout(w),w->>'date',w->>'createdAt',is_published,
        case when is_published then clock_timestamp() else null end,path)
      on conflict(owner_id,workout_id) do update set workout=excluded.workout,workout_date=excluded.workout_date,
        available=true,published=excluded.published,photo_path=excluded.photo_path,
        published_at=coalesce(cheesit_social_workouts.published_at,excluded.published_at)
      where cheesit_social_workouts.workout is distinct from excluded.workout or not cheesit_social_workouts.available
        or cheesit_social_workouts.published is distinct from excluded.published
        or cheesit_social_workouts.photo_path is distinct from excluded.photo_path;
    insert into cheesit_private.workout_publications values(new.owner_id,w->>'id') on conflict do nothing;
    first_publication:=found;
    if first_publication and is_published and tg_op='UPDATE' and
      exists(select 1 from public.cheesit_social_profiles where owner_id=new.owner_id and activity_shared) and
      not exists(select 1 from jsonb_array_elements(old.data->'workouts') x where x->>'id'=w->>'id' and x->>'status'='finished') then
      insert into public.cheesit_notifications(recipient_id,actor_id,kind,workout_id,event_key)
        select f.follower_id,new.owner_id,'workout',w->>'id','workout:'||new.owner_id::text||':'||(w->>'id')
        from public.cheesit_follows f where f.followed_id=new.owner_id and f.follower_id<>new.owner_id on conflict do nothing;
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function cheesit_private.sync_social_activity() from public,anon,authenticated;

-- Onboarding writes the account before completing its identity. A social
-- profile may therefore appear after the account's final write. Derive its
-- explicit publications immediately, without changing data/revision, touching
-- the profile trigger again, or emitting historical notifications.
create function cheesit_private.project_new_social_activity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.cheesit_accounts set activity_summary=activity_summary where owner_id=new.owner_id;
  return new;
end;
$$;
revoke all on function cheesit_private.project_new_social_activity() from public,anon,authenticated;
create trigger cheesit_project_new_social_activity after insert on public.cheesit_social_profiles
  for each row execute function cheesit_private.project_new_social_activity();

create table public.cheesit_post_likes (
  workout_owner uuid not null,
  workout_id text not null,
  owner_id uuid not null references public.cheesit_social_profiles(owner_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(workout_owner,workout_id,owner_id),
  foreign key(workout_owner,workout_id) references public.cheesit_social_workouts(owner_id,workout_id) on delete cascade
);
create index cheesit_likes_owner on public.cheesit_post_likes(owner_id);
create table public.cheesit_post_comments (
  id uuid primary key default gen_random_uuid(),
  workout_owner uuid not null,
  workout_id text not null,
  owner_id uuid not null references public.cheesit_social_profiles(owner_id) on delete cascade,
  body text not null check(length(btrim(body)) between 1 and 2000 and body=btrim(body)),
  created_at timestamptz not null default now(),
  foreign key(workout_owner,workout_id) references public.cheesit_social_workouts(owner_id,workout_id) on delete cascade
);
create index cheesit_comments_order on public.cheesit_post_comments(workout_owner,workout_id,created_at desc,id desc);
create index cheesit_comments_owner on public.cheesit_post_comments(owner_id);
alter table public.cheesit_post_likes enable row level security;
alter table public.cheesit_post_comments enable row level security;
revoke all on public.cheesit_post_likes,public.cheesit_post_comments from public,anon,authenticated;
grant select,delete on public.cheesit_post_likes,public.cheesit_post_comments to authenticated;
grant insert(workout_owner,workout_id,owner_id) on public.cheesit_post_likes to authenticated;
grant insert(id,workout_owner,workout_id,owner_id,body) on public.cheesit_post_comments to authenticated;
create policy "read visible post likes" on public.cheesit_post_likes for select to authenticated using (
  owner_id=(select auth.uid()) or exists(select 1 from public.cheesit_social_workouts w
    where w.owner_id=workout_owner and w.workout_id=cheesit_post_likes.workout_id and w.published));
create policy "like visible posts" on public.cheesit_post_likes for insert to authenticated with check (
  owner_id=(select auth.uid()) and exists(select 1 from public.cheesit_social_workouts w
    where w.owner_id=workout_owner and w.workout_id=cheesit_post_likes.workout_id and w.published));
create policy "remove own likes" on public.cheesit_post_likes for delete to authenticated using (owner_id=(select auth.uid()));
create policy "read visible post comments" on public.cheesit_post_comments for select to authenticated using (
  owner_id=(select auth.uid()) or exists(select 1 from public.cheesit_social_workouts w
    where w.owner_id=workout_owner and w.workout_id=cheesit_post_comments.workout_id and w.published));
create policy "comment visible posts" on public.cheesit_post_comments for insert to authenticated with check (
  owner_id=(select auth.uid()) and exists(select 1 from public.cheesit_social_workouts w
    where w.owner_id=workout_owner and w.workout_id=cheesit_post_comments.workout_id and w.published));
create policy "remove own comments" on public.cheesit_post_comments for delete to authenticated using (owner_id=(select auth.uid()));

create function public.cheesit_read_feed(p_owner uuid default null,p_workout text default null,
  p_before timestamptz default null,p_before_id uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$
  with page as materialized (
    select w.* from public.cheesit_social_workouts w
    where w.published and w.available and (p_owner is null or w.owner_id=p_owner)
      and (p_workout is null or (p_owner is not null and w.workout_id=p_workout))
      and (p_before is null or (w.published_at,w.post_id)<(p_before,p_before_id))
    order by w.published_at desc,w.post_id desc limit 21
  ), visible as (select * from page order by published_at desc,post_id desc limit 20)
  select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
    'id',w.post_id,'owner_id',w.owner_id,'workout_id',w.workout_id,'created_at',w.published_at,
    'username',p.username,'display_name',p.display_name,'photo',p.photo,'workout',w.workout,'photo_path',w.photo_path,
    'likes',(select count(*) from public.cheesit_post_likes l where l.workout_owner=w.owner_id and l.workout_id=w.workout_id),
    'comments',(select count(*) from public.cheesit_post_comments c where c.workout_owner=w.owner_id and c.workout_id=w.workout_id),
    'liked',exists(select 1 from public.cheesit_post_likes l where l.workout_owner=w.owner_id and l.workout_id=w.workout_id and l.owner_id=(select auth.uid()))
    ) order by w.published_at desc,w.post_id desc) from visible w join public.cheesit_social_profiles p using(owner_id)),'[]'::jsonb),
    'next',case when (select count(*) from page)>20 then (select jsonb_build_object('created_at',published_at,'id',post_id)
      from visible order by published_at,post_id limit 1) else null end);
$$;
revoke all on function public.cheesit_read_feed(uuid,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.cheesit_read_feed(uuid,text,timestamptz,uuid) to authenticated;

create function public.cheesit_read_post_comments(p_owner uuid,p_workout text,
  p_before timestamptz default null,p_before_id uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$
  with page as materialized (
    select c.* from public.cheesit_post_comments c
    where c.workout_owner=p_owner and c.workout_id=p_workout
      and exists(select 1 from public.cheesit_social_workouts w where w.owner_id=p_owner and w.workout_id=p_workout and w.published)
      and (p_before is null or (c.created_at,c.id)<(p_before,p_before_id))
    order by c.created_at desc,c.id desc limit 21
  ), visible as (select * from page order by created_at desc,id desc limit 20)
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object(
      'username',p.username,'display_name',p.display_name,'photo',p.photo) order by c.created_at desc,c.id desc)
      from visible c join public.cheesit_social_profiles p on p.owner_id=c.owner_id),'[]'::jsonb),
    'next',case when (select count(*) from page)>20 then (select jsonb_build_object('created_at',created_at,'id',id)
      from visible order by created_at,id limit 1) else null end);
$$;
revoke all on function public.cheesit_read_post_comments(uuid,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.cheesit_read_post_comments(uuid,text,timestamptz,uuid) to authenticated;

-- Private storage: downloads are authorized afresh against the same published
-- row and profile visibility. No public URLs or durable signed URLs are issued.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('workout-photos','workout-photos',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy "upload own workout photos" on storage.objects for insert to authenticated with check (
  bucket_id='workout-photos' and (select auth.uid()) is not null and
  name ~ ('^'||(select auth.uid())::text||'/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'));
create policy "read authorized workout photos" on storage.objects for select to authenticated using (
  bucket_id='workout-photos' and (select auth.uid()) is not null and (
    split_part(name,'/',1)=(select auth.uid())::text or exists(
      select 1 from public.cheesit_social_workouts w where w.published and w.available and w.photo_path=name)));
create policy "remove own workout photos" on storage.objects for delete to authenticated using (
  bucket_id='workout-photos' and split_part(name,'/',1)=(select auth.uid())::text);
