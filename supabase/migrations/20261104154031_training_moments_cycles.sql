-- Optional account-private training metadata. No rewards, public album or new grants.
create or replace function cheesit_private.validate_training_metadata(d jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare f jsonb; item jsonb; ex jsonb; s jsonb; layer jsonb; group_data jsonb; uuid_pattern text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'; field text; seen text[]; asset text;
begin
  for item in select * from jsonb_array_elements(coalesce(d->'routines','[]'::jsonb)) union all select d->'routineDraft' where d ? 'routineDraft' loop
    for ex in select * from jsonb_array_elements(coalesce(item->'exercises','[]'::jsonb)) loop
      if ex ? 'supersetId' and (jsonb_typeof(ex->'supersetId') is distinct from 'string' or coalesce(ex->>'supersetId','') !~ uuid_pattern) then raise exception 'invalid superset'; end if;
      if ex ? 'setKinds' then
        if jsonb_typeof(ex->'setKinds') is distinct from 'array' or jsonb_array_length(ex->'setKinds')>20 then raise exception 'invalid planned set kinds'; end if;
        if exists(select 1 from jsonb_array_elements(ex->'setKinds') k where jsonb_typeof(k) is distinct from 'string' or k #>> '{}' not in ('work','warmup')) then raise exception 'invalid planned set kind'; end if;
      end if;
    end loop;
  end loop;
  for item in select * from jsonb_array_elements(coalesce(d->'workouts','[]'::jsonb)) loop
    if item ? 'routineId' and (jsonb_typeof(item->'routineId') is distinct from 'string' or coalesce(item->>'routineId','') !~ uuid_pattern) then raise exception 'invalid routine source'; end if;
    if item ? 'cycleLink' then
      group_data:=item->'cycleLink';
      if jsonb_typeof(group_data) is distinct from 'object' or jsonb_typeof(group_data->'cycleId') is distinct from 'string' or coalesce(group_data->>'cycleId','') !~ uuid_pattern or jsonb_typeof(group_data->'routineId') is distinct from 'string' or coalesce(group_data->>'routineId','') !~ uuid_pattern or jsonb_typeof(group_data->'position') is distinct from 'number' or (group_data->>'position')::numeric not between 0 and 99 or (group_data->>'position')::numeric<>trunc((group_data->>'position')::numeric) then raise exception 'invalid cycle link'; end if;
    end if;
    for ex in select * from jsonb_array_elements(coalesce(item->'exercises','[]'::jsonb)) loop
      if ex ? 'supersetId' and (jsonb_typeof(ex->'supersetId') is distinct from 'string' or coalesce(ex->>'supersetId','') !~ uuid_pattern) then raise exception 'invalid superset'; end if;
      for s in select * from jsonb_array_elements(coalesce(ex->'sets','[]'::jsonb)) loop
        if s ? 'kind' and (jsonb_typeof(s->'kind') is distinct from 'string' or s->>'kind' not in ('work','warmup')) then raise exception 'invalid set kind'; end if;
      end loop;
    end loop;
  end loop;
  if not d ? 'training' then return; end if;
  f:=d->'training';
  if jsonb_typeof(f) is distinct from 'object' then raise exception 'invalid training metadata'; end if;
  foreach field in array array['moments','cycles','weeklyGoals'] loop
    if jsonb_typeof(f->field) is distinct from 'array' or jsonb_array_length(f->field) > (case field when 'moments' then 50000 when 'cycles' then 100 else 10000 end) then raise exception 'invalid training collection'; end if;
  end loop;
  seen:='{}';
  for item in select * from jsonb_array_elements(f->'moments') loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'id') is distinct from 'string' or length(item->>'id')>300 or item->>'id'=any(seen) or coalesce(item->>'kind','') not in ('first-session','weekly-goal','record','level') or coalesce(item->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or (item->>'date')::date::text<>item->>'date' or (item->>'date')::date<'1000-01-01'::date or jsonb_typeof(item->'title') is distinct from 'string' or length(item->>'title')>200 or jsonb_typeof(item->'description') is distinct from 'string' or length(item->>'description')>2000 or jsonb_typeof(item->'workoutIds') is distinct from 'array' or jsonb_array_length(item->'workoutIds')>100 then raise exception 'invalid moment'; end if;
    seen:=array_append(seen,item->>'id');
    if exists(select 1 from jsonb_array_elements(item->'workoutIds') id where jsonb_typeof(id) is distinct from 'string' or length(id #>> '{}')>100) then raise exception 'invalid moment sources'; end if;
    group_data:=item->'appearance';
    if group_data is null then raise exception 'missing moment appearance'; end if;
    if group_data <> 'null'::jsonb then
      if jsonb_typeof(group_data) is distinct from 'object' or jsonb_typeof(group_data->'layers') is distinct from 'array' or jsonb_array_length(group_data->'layers')>5 or jsonb_typeof(group_data->'level') is distinct from 'number' or (group_data->>'level')::numeric not between 1 and 99 or (group_data->>'level')::numeric<>trunc((group_data->>'level')::numeric) then raise exception 'invalid moment appearance'; end if;
      foreach field in array array['base','atlas','companion'] loop
        if field<>'companion' or group_data ? field then
          asset:=group_data->>field;
          if asset is null or length(asset)>300 or asset !~ '^/assets/[a-zA-Z0-9_./-]+$' or position('..' in asset)>0 then raise exception 'invalid moment asset'; end if;
        end if;
      end loop;
      foreach field in array array['atlasWidth','atlasHeight'] loop
        if jsonb_typeof(group_data->field) is distinct from 'number' or (group_data->>field)::numeric not between 1 and 20000 then raise exception 'invalid atlas dimensions'; end if;
      end loop;
      for layer in select * from jsonb_array_elements(group_data->'layers') loop
        if jsonb_typeof(layer->'id') is distinct from 'string' or length(layer->>'id')>100 or jsonb_typeof(layer->'order') is distinct from 'number' or (layer->>'order')::numeric not between 0 and 10 or (layer->>'order')::numeric<>trunc((layer->>'order')::numeric) then raise exception 'invalid appearance layer'; end if;
        foreach field in array array['source','target'] loop
          if jsonb_typeof(layer->field) is distinct from 'array' or jsonb_array_length(layer->field)<>4 then raise exception 'invalid layer geometry'; end if;
          if exists(select 1 from jsonb_array_elements(layer->field) n where jsonb_typeof(n) is distinct from 'number' or (n #>> '{}')::numeric not between -10000 and 10000) then raise exception 'invalid layer coordinates'; end if;
        end loop;
        if layer ? 'replacesHand' and jsonb_typeof(layer->'replacesHand') is distinct from 'boolean' then raise exception 'invalid hand replacement'; end if;
        if layer ? 'foregroundMask' and (jsonb_typeof(layer->'foregroundMask') is distinct from 'string' or length(layer->>'foregroundMask')>3000) then raise exception 'invalid layer mask'; end if;
      end loop;
    end if;
  end loop;
  seen:='{}';
  for item in select * from jsonb_array_elements(f->'cycles') loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'id') is distinct from 'string' or length(item->>'id')>100 or item->>'id'=any(seen) or jsonb_typeof(item->'name') is distinct from 'string' or length(btrim(item->>'name'))=0 or length(item->>'name')>80 or jsonb_typeof(item->'routineIds') is distinct from 'array' or jsonb_array_length(item->'routineIds')>100 or jsonb_typeof(item->'completedWorkoutIds') is distinct from 'array' or jsonb_array_length(item->'completedWorkoutIds')>50000 or jsonb_typeof(item->'position') is distinct from 'number' or (item->>'position')::numeric<0 or (item->>'position')::numeric<>trunc((item->>'position')::numeric) or (item->>'position')::numeric>=greatest(1,jsonb_array_length(item->'routineIds')) then raise exception 'invalid routine cycle'; end if;
    seen:=array_append(seen,item->>'id');
    if exists(select 1 from jsonb_array_elements(item->'routineIds') id where jsonb_typeof(id) is distinct from 'string' or length(id #>> '{}')>100) or exists(select 1 from jsonb_array_elements(item->'completedWorkoutIds') id where jsonb_typeof(id) is distinct from 'string' or length(id #>> '{}')>100) then raise exception 'invalid cycle sources'; end if;
  end loop;
  seen:='{}';
  for item in select * from jsonb_array_elements(f->'weeklyGoals') loop
    if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'week','') !~ '^\d{4}-\d{2}-\d{2}$' or (item->>'week')::date::text<>item->>'week' or (item->>'week')::date<'1000-01-01'::date or extract(isodow from (item->>'week')::date)<>1 or item->>'week'=any(seen) or coalesce(item->>'observedOn','') !~ '^\d{4}-\d{2}-\d{2}$' or (item->>'observedOn')::date::text<>item->>'observedOn' or date_trunc('week',(item->>'observedOn')::date)::date<>(item->>'week')::date or jsonb_typeof(item->'days') is distinct from 'number' or (item->>'days')::numeric not between 1 and 7 or (item->>'days')::numeric<>trunc((item->>'days')::numeric) or jsonb_typeof(item->'sets') is distinct from 'number' or (item->>'sets')::numeric not between 1 and 200 or (item->>'sets')::numeric<>trunc((item->>'sets')::numeric) then raise exception 'invalid observed weekly goal'; end if;
    seen:=array_append(seen,item->>'week');
  end loop;
end;
$$;
revoke all on function cheesit_private.validate_training_metadata(jsonb) from public,anon,authenticated;

-- Preserve every installed validator rule and its grants, adding only the optional field.
do $upgrade$
declare definition text;
begin
  select pg_get_functiondef('public.cheesit_validate_data(jsonb)'::regprocedure) into definition;
  if position('cheesit_private.validate_training_metadata(d)' in definition)=0 then
    if position('''personalProfile'',''preferences'',''game''' in definition)=0 then raise exception 'unexpected account validator; review migration'; end if;
    definition:=replace(definition,'''personalProfile'',''preferences'',''game''','''personalProfile'',''preferences'',''game'',''training''');
    definition:=replace(definition,'  if jsonb_typeof(d) is distinct','  perform cheesit_private.validate_training_metadata(d);' || chr(10) || '  if jsonb_typeof(d) is distinct');
    execute definition;
  end if;
end;
$upgrade$;

-- Existing explicit activity sharing retains the meaning of warmups/supersets;
-- the album, cycle links, snapshots and weekly goals never enter this allowlist.
create or replace function cheesit_private.social_workout(w jsonb) returns jsonb
language sql immutable security invoker set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',w->'id','date',w->'date','name',w->'name','color',w->'color','status',w->'status',
    'createdAt',w->'createdAt','updatedAt',w->'updatedAt','startedAt',w->'startedAt',
    'finishedAt',w->'finishedAt','notes',w->'notes','defaultRestSeconds',w->'defaultRestSeconds',
    'exercises',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id',e->'id','exerciseId',e->'exerciseId','name',e->'name','group',e->'group','mode',e->'mode',
      'supersetId',e->'supersetId','loadConvention',e->'loadConvention','repsMin',e->'repsMin','repsMax',e->'repsMax',
      'targetWeight',e->'targetWeight','restSeconds',e->'restSeconds','notes',e->'notes',
      'sets',(select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',s->'id','kind',s->'kind',
        'weight',s->'weight','reps',s->'reps','confirmed',s->'confirmed','rpe',s->'rpe','rir',s->'rir'))),'[]'::jsonb)
        from jsonb_array_elements(e->'sets') s)))) from jsonb_array_elements(w->'exercises') e),'[]'::jsonb)));
$$;
revoke all on function cheesit_private.social_workout(jsonb) from public,anon,authenticated;
-- Refresh existing explicitly shared projections without emitting new publications.
update public.cheesit_social_workouts shared set workout=cheesit_private.social_workout(w)
from public.cheesit_accounts a, lateral jsonb_array_elements(a.data->'workouts') w
where shared.owner_id=a.owner_id and shared.workout_id=w->>'id';

-- Old application versions may omit the entire optional field. Preserve it
-- server-side before validation/write. A new account-reset marker is the only
-- explicit reset; sending cycles:[] remains a legitimate cycle deletion.
create or replace function cheesit_private.preserve_training_document(document jsonb, previous_data jsonb, previous_migrations jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare prior jsonb; next_features jsonb; next_moments jsonb; next_cycles jsonb:='[]'; next_goals jsonb; old_item jsonb; next_item jsonb; old_receipt jsonb; receipts jsonb;
begin
  if exists(select 1 from jsonb_array_elements_text(document->'migrations') marker where marker like 'account-reset:%' and not coalesce(previous_migrations,'[]') ? marker) then return document; end if;
  prior:=previous_data->'training';
  if prior is null then return document; end if;
  if not (document->'data') ? 'training' then return jsonb_set(document,'{data,training}',prior); end if;
  next_features:=document->'data'->'training';
  -- Validate the caller's structure before reading arrays; no malformed data is repaired.
  perform cheesit_private.validate_training_metadata(document->'data');
  next_moments:=next_features->'moments';
  for old_item in select * from jsonb_array_elements(prior->'moments') loop
    select m into next_item from jsonb_array_elements(next_moments) m where m->>'id'=old_item->>'id';
    if next_item is null then next_moments:=next_moments || jsonb_build_array(old_item);
    elsif next_item is distinct from old_item then raise exception 'captured moment is immutable'; end if;
  end loop;
  for next_item in select * from jsonb_array_elements(next_features->'cycles') loop
    select c into old_item from jsonb_array_elements(prior->'cycles') c where c->>'id'=next_item->>'id';
    if old_item is not null then
      receipts:=next_item->'completedWorkoutIds';
      for old_receipt in select * from jsonb_array_elements(coalesce(old_item->'completedWorkoutIds','[]')) loop
        if not receipts ? (old_receipt #>> '{}') then receipts:=receipts || jsonb_build_array(old_receipt); end if;
      end loop;
      next_item:=jsonb_set(next_item,'{completedWorkoutIds}',receipts);
    end if;
    next_cycles:=next_cycles || jsonb_build_array(next_item);
  end loop;
  next_goals:=next_features->'weeklyGoals';
  for old_item in select * from jsonb_array_elements(prior->'weeklyGoals') loop
    if not exists(select 1 from jsonb_array_elements(next_goals) g where g->>'week'=old_item->>'week') then next_goals:=next_goals || jsonb_build_array(old_item); end if;
  end loop;
  next_features:=next_features || jsonb_build_object('moments',next_moments,'cycles',next_cycles,'weeklyGoals',next_goals);
  return jsonb_set(document,'{data,training}',next_features);
end;
$$;
revoke all on function cheesit_private.preserve_training_document(jsonb,jsonb,jsonb) from public,anon,authenticated;

do $upgrade_rpc$
declare definition text;
begin
  select pg_get_functiondef('public.cheesit_commit_account(uuid,uuid,integer,jsonb)'::regprocedure) into definition;
  if position('cheesit_private.preserve_training_document' in definition)=0 then
    if position('    perform public.cheesit_validate_data(p_document->''data'');' in definition)=0 then raise exception 'unexpected account RPC; review migration'; end if;
    definition:=replace(definition,'    perform public.cheesit_validate_data(p_document->''data'');',
      '    p_document:=cheesit_private.preserve_training_document(p_document,current_row.data,current_row.migrations);' || chr(10) || '    perform public.cheesit_validate_data(p_document->''data'');');
    execute definition;
  end if;
end;
$upgrade_rpc$;
