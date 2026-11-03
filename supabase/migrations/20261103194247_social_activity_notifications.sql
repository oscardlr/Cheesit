-- No account data is removed or rewritten. Unavailable projections are retained.
-- Existing activity remains private until its owner explicitly enables sharing.
alter table public.cheesit_social_profiles add column activity_shared boolean not null default false;
grant update(activity_shared) on public.cheesit_social_profiles to authenticated;
create policy "change own activity visibility" on public.cheesit_social_profiles for update to authenticated
  using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);

-- Derived numbers are committed with the very same account revision. Old clients
-- omit this column and invalidate the summary rather than displaying stale XP.
alter table public.cheesit_accounts add column activity_summary jsonb;

-- Only numeric aggregates may cross the account/activity boundary.
create function cheesit_private.valid_activity_summary(s jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare k text; v jsonb;
begin
  if s is null then return true; end if;
  if jsonb_typeof(s) is distinct from 'object' or octet_length(s::text)>20000 or
    s - array['workouts','sets','reps','volume','excludedSets','seasons'] <> '{}'::jsonb then return false; end if;
  foreach k in array array['workouts','sets','reps','volume','excludedSets'] loop
    v := s->k;
    if jsonb_typeof(v) is distinct from 'number' then return false; end if;
    if (v::text)::numeric < 0 or (v::text)::numeric > 1000000000000000 then return false; end if;
  end loop;
  if jsonb_typeof(s->'seasons') is distinct from 'object' then return false; end if;
  for k,v in select * from jsonb_each(s->'seasons') loop
    if k !~ '^[1-9][0-9]{3}$' or jsonb_typeof(v) is distinct from 'number' then return false; end if;
    if (v::text)::numeric < 0 or (v::text)::numeric > 1000000000000000 then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function cheesit_private.valid_activity_summary(jsonb) from public,anon,authenticated;
alter table public.cheesit_accounts add constraint cheesit_safe_activity_summary check(cheesit_private.valid_activity_summary(activity_summary));

create table public.cheesit_social_activity (
  owner_id uuid primary key references public.cheesit_social_profiles(owner_id) on delete cascade,
  summary jsonb
);
create table public.cheesit_social_workouts (
  owner_id uuid not null references public.cheesit_social_profiles(owner_id) on delete cascade,
  workout_id text not null,
  workout jsonb not null,
  workout_date text not null,
  created_at text not null,
  available boolean not null default true,
  primary key(owner_id,workout_id)
);
create index cheesit_social_workout_order on public.cheesit_social_workouts(owner_id,workout_date desc,created_at desc,workout_id desc);
alter table public.cheesit_social_activity enable row level security;
alter table public.cheesit_social_workouts enable row level security;
revoke all on public.cheesit_social_activity,public.cheesit_social_workouts from public,anon,authenticated;
grant select on public.cheesit_social_activity,public.cheesit_social_workouts to authenticated;
create policy "read shared activity" on public.cheesit_social_activity for select to authenticated using (
  (select auth.uid()) is not null and exists(select 1 from public.cheesit_social_profiles p where p.owner_id=cheesit_social_activity.owner_id and (p.activity_shared or p.owner_id=(select auth.uid()))));
create policy "read shared workouts" on public.cheesit_social_workouts for select to authenticated using (
  available and (select auth.uid()) is not null and exists(select 1 from public.cheesit_social_profiles p where p.owner_id=cheesit_social_workouts.owner_id and (p.activity_shared or p.owner_id=(select auth.uid()))));

-- Private ledger survives a workout deletion or privacy change. Edits, retries,
-- re-sharing and re-importing an old id cannot publish it a second time.
create table cheesit_private.workout_publications (
  owner_id uuid not null references auth.users(id) on delete cascade,
  workout_id text not null,
  primary key(owner_id,workout_id)
);
revoke all on cheesit_private.workout_publications from public,anon,authenticated;
alter table cheesit_private.workout_publications enable row level security;
create table public.cheesit_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.cheesit_social_profiles(owner_id) on delete cascade,
  actor_id uuid not null references public.cheesit_social_profiles(owner_id) on delete cascade,
  kind text not null check(kind in ('follow','workout')),
  workout_id text,
  event_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique(recipient_id,event_key),
  check(recipient_id<>actor_id),
  check((kind='follow' and workout_id is null) or (kind='workout' and workout_id is not null))
);
create index cheesit_notification_order on public.cheesit_notifications(recipient_id,created_at desc,id desc);
create index cheesit_notification_unread on public.cheesit_notifications(recipient_id) where read_at is null;
alter table public.cheesit_notifications enable row level security;
revoke all on public.cheesit_notifications from public,anon,authenticated;
grant select on public.cheesit_notifications to authenticated;
grant update(read_at) on public.cheesit_notifications to authenticated;
create policy "read own notifications" on public.cheesit_notifications for select to authenticated using ((select auth.uid())=recipient_id);
create policy "mark own notifications" on public.cheesit_notifications for update to authenticated
  using ((select auth.uid())=recipient_id) with check ((select auth.uid())=recipient_id);

-- Trigger-only allowlist, no profile, physical data, drafts, timers or account ledger.
create function cheesit_private.social_workout(w jsonb) returns jsonb
language sql immutable security invoker set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',w->'id','date',w->'date','name',w->'name','color',w->'color','status',w->'status',
    'createdAt',w->'createdAt','updatedAt',w->'updatedAt','startedAt',w->'startedAt',
    'finishedAt',w->'finishedAt','notes',w->'notes','defaultRestSeconds',w->'defaultRestSeconds',
    'exercises',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id',e->'id','exerciseId',e->'exerciseId','name',e->'name','group',e->'group','mode',e->'mode',
      'loadConvention',e->'loadConvention','repsMin',e->'repsMin','repsMax',e->'repsMax',
      'targetWeight',e->'targetWeight','restSeconds',e->'restSeconds','notes',e->'notes',
      'sets',(select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',s->'id',
        'weight',s->'weight','reps',s->'reps','confirmed',s->'confirmed','rpe',s->'rpe','rir',s->'rir'))),'[]'::jsonb)
        from jsonb_array_elements(e->'sets') s)))) from jsonb_array_elements(w->'exercises') e),'[]'::jsonb)));
$$;
revoke all on function cheesit_private.social_workout(jsonb) from public,anon,authenticated;

create function cheesit_private.sync_social_activity() returns trigger
language plpgsql security definer set search_path='' as $$
declare w jsonb; first_publication boolean;
begin
  if not exists(select 1 from public.cheesit_social_profiles where owner_id=new.owner_id) then return new; end if;
  insert into public.cheesit_social_activity(owner_id,summary) values(new.owner_id,new.activity_summary)
    on conflict(owner_id) do update set summary=excluded.summary;
  update public.cheesit_social_workouts p set available=false where p.owner_id=new.owner_id and p.available and not exists(
    select 1 from jsonb_array_elements(new.data->'workouts') x where x->>'id'=p.workout_id and x->>'status'='finished');
  for w in select value from jsonb_array_elements(new.data->'workouts') where value->>'status'='finished' loop
    insert into public.cheesit_social_workouts(owner_id,workout_id,workout,workout_date,created_at) values(new.owner_id,w->>'id',cheesit_private.social_workout(w),w->>'date',w->>'createdAt')
      on conflict(owner_id,workout_id) do update set workout=excluded.workout,workout_date=excluded.workout_date,created_at=excluded.created_at,available=true
      where cheesit_social_workouts.workout is distinct from excluded.workout or not cheesit_social_workouts.available;
    insert into cheesit_private.workout_publications values(new.owner_id,w->>'id') on conflict do nothing;
    first_publication := found;
    if first_publication and tg_op='UPDATE' and exists(select 1 from public.cheesit_social_profiles where owner_id=new.owner_id and activity_shared)
      and not exists(select 1 from jsonb_array_elements(old.data->'workouts') x where x->>'id'=w->>'id' and x->>'status'='finished') then
      insert into public.cheesit_notifications(recipient_id,actor_id,kind,workout_id,event_key)
        select f.follower_id,new.owner_id,'workout',w->>'id','workout:'||new.owner_id::text||':'||(w->>'id')
        from public.cheesit_follows f where f.followed_id=new.owner_id and f.follower_id<>new.owner_id on conflict do nothing;
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function cheesit_private.sync_social_activity() from public,anon,authenticated;
-- Account profile projection must run first (existing trigger names sort before z).
create trigger z_cheesit_social_activity after insert or update of data,activity_summary on public.cheesit_accounts
  for each row execute function cheesit_private.sync_social_activity();
insert into public.cheesit_social_activity(owner_id,summary) select owner_id,null from public.cheesit_social_profiles;
insert into public.cheesit_social_workouts(owner_id,workout_id,workout,workout_date,created_at)
  select a.owner_id,w->>'id',cheesit_private.social_workout(w),w->>'date',w->>'createdAt'
  from public.cheesit_accounts a join public.cheesit_social_profiles p using(owner_id)
  cross join lateral jsonb_array_elements(a.data->'workouts') w where w->>'status'='finished';
insert into cheesit_private.workout_publications select owner_id,workout_id from public.cheesit_social_workouts;

create function cheesit_private.notify_follow() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.cheesit_notifications(recipient_id,actor_id,kind,event_key)
    values(new.followed_id,new.follower_id,'follow','follow:'||new.follower_id::text) on conflict do nothing;
  return new;
end;
$$;
revoke all on function cheesit_private.notify_follow() from public,anon,authenticated;
create trigger cheesit_new_follower after insert on public.cheesit_follows for each row execute function cheesit_private.notify_follow();

-- Bounded pages and live permission checks. Notification storage contains no
-- workout name: revoked/deleted activity cannot leak through a stale notification.
create function public.cheesit_read_activity(p_owner uuid,p_workout text default null,p_offset integer default 0) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('shared',p.activity_shared,'summary',a.summary,
    'workouts',coalesce((select jsonb_agg(page.workout order by page.workout_date desc,page.created_at desc,page.workout_id desc) from (
      select * from public.cheesit_social_workouts w where w.owner_id=p.owner_id and (p_workout is null or w.workout_id=p_workout)
      order by w.workout_date desc,w.created_at desc,w.workout_id desc limit 21 offset greatest(coalesce(p_offset,0),0)
    ) page),'[]'::jsonb))
  from public.cheesit_social_profiles p left join public.cheesit_social_activity a using(owner_id)
  where p.owner_id=p_owner and (select auth.uid()) is not null;
$$;
revoke all on function public.cheesit_read_activity(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.cheesit_read_activity(uuid,text,integer) to authenticated;

create function public.cheesit_read_notifications(p_before timestamptz default null,p_before_id uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('unread',(select count(*) from public.cheesit_notifications where recipient_id=(select auth.uid()) and read_at is null),
    'items',coalesce((select jsonb_agg(to_jsonb(page) order by page.created_at desc,page.id desc) from (
      select n.id,n.actor_id,n.kind,n.workout_id,n.created_at,n.read_at,p.username,p.display_name,p.photo,
        (select coalesce((select string_agg(g,' y ' order by g) from (select distinct e->>'group' g from jsonb_array_elements(w.workout->'exercises') e) groups),w.workout->>'name')
         from public.cheesit_social_workouts w where w.owner_id=n.actor_id and w.workout_id=n.workout_id) workout_label
      from public.cheesit_notifications n join public.cheesit_social_profiles p on p.owner_id=n.actor_id
      where n.recipient_id=(select auth.uid()) and (p_before is null or (n.created_at,n.id)<(p_before,p_before_id))
      order by n.created_at desc,n.id desc limit 21
    ) page),'[]'::jsonb));
$$;
revoke all on function public.cheesit_read_notifications(timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.cheesit_read_notifications(timestamptz,uuid) to authenticated;

create or replace function public.cheesit_commit_account(p_expected_owner uuid, p_operation_id uuid, p_base_revision integer, p_document jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  owner uuid := auth.uid(); current_row public.cheesit_accounts%rowtype;
  receipt public.cheesit_account_receipts%rowtype; request_hash text; response jsonb;
  snapshot jsonb; old_workout jsonb; next_workout jsonb; kind text;
begin
  if owner is null or owner is distinct from p_expected_owner then raise exception 'authentication required or account changed' using errcode='28000'; end if;
  if p_operation_id is null or p_base_revision is null or p_base_revision < 0 or jsonb_typeof(p_document) is distinct from 'object' or octet_length(p_document::text)>18000000 or jsonb_typeof(p_document->'tombstones') is distinct from 'array' or jsonb_typeof(p_document->'migrations') is distinct from 'array' then raise exception 'invalid envelope' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_document->'tombstones') v where jsonb_typeof(v) <> 'string' or length(v#>>'{}')>200) or exists(select 1 from jsonb_array_elements(p_document->'migrations') v where jsonb_typeof(v) <> 'string' or length(v#>>'{}')>200) then raise exception 'invalid markers'; end if;
  request_hash := encode(sha256(convert_to(jsonb_build_object('base',p_base_revision,'document',p_document)::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(owner::text, 0));
  select * into receipt from public.cheesit_account_receipts where owner_id=owner and operation_id=p_operation_id;
  if found then
    if receipt.request_hash is distinct from request_hash then raise exception 'operation id reused'; end if;
    return receipt.response;
  end if;
  select * into current_row from public.cheesit_accounts where owner_id=owner for update;
  snapshot := case when current_row.owner_id is null then jsonb_build_object('revision',0,'data',jsonb_build_object('workouts','[]'::jsonb,'routines','[]'::jsonb,'customExercises','[]'::jsonb),'tombstones','[]'::jsonb,'migrations','[]'::jsonb) else to_jsonb(current_row)-array['owner_id','updated_at','activity_summary'] end;
  if coalesce(current_row.revision,0) <> p_base_revision then
    response := jsonb_build_object('status','conflict','snapshot',snapshot);
  else
    perform public.cheesit_validate_data(p_document->'data');
    -- A stale client or a repeated migration cannot erase deletion/migration markers.
    if not (p_document->'tombstones' @> coalesce(current_row.tombstones,'[]')) or not (p_document->'migrations' @> coalesce(current_row.migrations,'[]')) then raise exception 'markers must be monotonic'; end if;
    for old_workout in select * from jsonb_array_elements(coalesce(current_row.data->'workouts','[]')) loop
      select value into next_workout from jsonb_array_elements(p_document->'data'->'workouts') where value->>'id'=old_workout->>'id';
      if next_workout is not null and (old_workout->'companionPassive' is distinct from next_workout->'companionPassive' or ((old_workout ? 'companionReward' or old_workout->>'status' = 'finished') and old_workout->'companionReward' is distinct from next_workout->'companionReward')) then raise exception 'captured reward is immutable'; end if;
    end loop;
    -- Verify deletions are represented durably, and disallow resurrection.
    foreach kind in array array['workouts','routines','customExercises'] loop
      for old_workout in select * from jsonb_array_elements(coalesce(current_row.data->kind,'[]')) loop
        if not exists(select 1 from jsonb_array_elements(p_document->'data'->kind) x where x->>'id'=old_workout->>'id') and not (p_document->'tombstones' ? (kind||':'||(old_workout->>'id'))) then raise exception 'missing deletion marker'; end if;
      end loop;
      for next_workout in select * from jsonb_array_elements(p_document->'data'->kind) loop
        if kind='workouts' and next_workout->>'status'='deleted' and not (p_document->'tombstones' ? ('workouts:'||(next_workout->>'id'))) then raise exception 'missing deletion marker'; end if;
        if p_document->'tombstones' ? (kind||':'||(next_workout->>'id')) and not (kind='workouts' and next_workout->>'status'='deleted') then raise exception 'deleted record cannot reappear'; end if;
      end loop;
    end loop;
    insert into public.cheesit_accounts(owner_id,revision,data,tombstones,migrations,activity_summary) values(owner,p_base_revision+1,p_document->'data',p_document->'tombstones',p_document->'migrations',p_document->'socialSummary')
    on conflict(owner_id) do update set revision=excluded.revision,data=excluded.data,activity_summary=excluded.activity_summary,tombstones=excluded.tombstones,migrations=excluded.migrations,updated_at=now() returning * into current_row;
    snapshot := to_jsonb(current_row)-array['owner_id','updated_at','activity_summary'];
    response := jsonb_build_object('status','applied','snapshot',snapshot);
  end if;
  insert into public.cheesit_account_receipts(owner_id,operation_id,request_hash,response) values(owner,p_operation_id,request_hash,response);
  return response;
end;
$$;
revoke all on function public.cheesit_commit_account(uuid,uuid,integer,jsonb) from public, anon;
grant execute on function public.cheesit_commit_account(uuid,uuid,integer,jsonb) to authenticated;

create function public.cheesit_mark_notifications(p_id uuid default null) returns void
language sql volatile security invoker set search_path='' as $$
  update public.cheesit_notifications set read_at=now()
  where recipient_id=(select auth.uid()) and read_at is null and (p_id is null or id=p_id);
$$;
revoke all on function public.cheesit_mark_notifications(uuid) from public,anon,authenticated;
grant execute on function public.cheesit_mark_notifications(uuid) to authenticated;
