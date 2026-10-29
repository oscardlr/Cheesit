-- Add the Cheesit routine palette and optional icons; historical snapshots remain untouched.
-- Preserve authentication, revision checks, operation hashing, receipts and session validation.
create or replace function public.entrenos_apply_change(
  p_operation_id uuid,
  p_expected_owner uuid,
  p_device_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_base_revision integer,
  p_payload jsonb
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_owner uuid := auth.uid();
  v_hash text;
  v_receipt public.entrenos_operations%rowtype;
  v_current public.entrenos_entities%rowtype;
  v_result jsonb;
  v_new_revision integer;
  v_date date;
  v_exercise jsonb;
  v_set jsonb;
  v_confirmed integer := 0;
  v_kg numeric;
  v_reps numeric;
  v_mode text;
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  v_duplicate public.entrenos_entities%rowtype;
begin
  if v_owner is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_expected_owner is distinct from v_owner then raise exception 'account changed' using errcode = '28000'; end if;
  if p_operation_id is null or p_device_id is null or p_entity_id is null or
     p_entity_type is null or p_entity_type not in ('routine','session','exercise') or
     p_action is null or p_action not in ('upsert','delete') or
     p_base_revision is null or p_base_revision < 0 then
    raise exception 'invalid operation envelope' using errcode = '22023';
  end if;
  if p_action = 'upsert' and (p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 1048576) then
    raise exception 'invalid payload' using errcode = '22023';
  end if;
  -- Hash the exact canonical JSON request including the device and base revision.
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'device_id', p_device_id, 'entity_type', p_entity_type, 'entity_id', p_entity_id,
    'action', p_action, 'base_revision', p_base_revision, 'payload', p_payload
  )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 0));
  select * into v_receipt from public.entrenos_operations where owner_id = v_owner and operation_id = p_operation_id;
  if found then
    if v_receipt.request_hash <> v_hash then raise exception 'operation id reused with different content' using errcode = '22023'; end if;
    return v_receipt.response;
  end if;
  select * into v_current from public.entrenos_entities
    where owner_id = v_owner and entity_type = p_entity_type and id = p_entity_id for update;
  if (not found and p_base_revision <> 0) or (found and v_current.revision <> p_base_revision) then
    v_result := jsonb_build_object('status','conflict','reason','revision', 'revision', coalesce(v_current.revision,0),
      'entity', case when v_current.id is null then null else to_jsonb(v_current) end);
  elsif v_current.deleted then
    -- Tombstones require an explicit future restoration protocol; never silently resurrect.
    v_result := jsonb_build_object('status','conflict','reason','deleted','revision',v_current.revision,'entity',to_jsonb(v_current));
  elsif p_action = 'delete' and v_current.id is null then
    v_result := jsonb_build_object('status','invalid','reason','not_found');
  else
    if p_action = 'upsert' then
      -- Validate inside a subtransaction so malformed JSON types and dates become
      -- a user-visible validation result, not a partially applied update.
      begin
        if coalesce(p_payload->>'id','') <> p_entity_id::text then raise exception 'entity_id'; end if;
        if jsonb_typeof(p_payload->'name') is distinct from 'string' or length(btrim(p_payload->>'name')) not between 1 and 80 then raise exception 'name'; end if;
        if p_entity_type in ('session','routine') and coalesce(p_payload->>'color','') not in ('#0057C2','#6638A6','#176B43','#A61B29','#8B4500','#475569','#d8ff3e','#61C9A8','#7BB7F0','#B8A0FF','#F2C56B','#EC8997') then raise exception 'color'; end if;
        if p_entity_type = 'exercise' then
          if coalesce(p_payload->>'group','') not in ('Pecho','Espalda','Pierna y glúteo','Hombro','Bíceps','Tríceps','Abdominales') or
             coalesce(p_payload->>'mode','') not in ('external_load_reps','bodyweight_reps') then raise exception 'exercise'; end if;
        elsif p_entity_type = 'routine' then
          -- Legacy routines omit icon and display the default dumbbell on clients.
          if p_payload ? 'icon' and (jsonb_typeof(p_payload->'icon') is distinct from 'string' or p_payload->>'icon' not in ('dumbbell','biceps-flexed','target','flame','activity','timer','mountain','heart-pulse')) then raise exception 'routine_icon'; end if;
          if jsonb_typeof(p_payload->'archived') is distinct from 'boolean' or jsonb_typeof(p_payload->'exercises') is distinct from 'array' or jsonb_array_length(p_payload->'exercises') > 50 then raise exception 'routine'; end if;
          for v_exercise in select value from jsonb_array_elements(p_payload->'exercises') loop
            if v_exercise->>'exerciseId' is null or v_exercise->>'id' is null then raise exception 'exercise_id'; end if;
            if v_exercise->>'exerciseId' !~ '^[a-z0-9][a-z0-9-]{0,79}$' then raise exception 'exercise_key'; end if;
            perform (v_exercise->>'id')::uuid;
            if jsonb_typeof(v_exercise->'sets') is distinct from 'number' or (v_exercise->>'sets')::numeric <> trunc((v_exercise->>'sets')::numeric) or (v_exercise->>'sets')::numeric not between 1 and 20 then raise exception 'planned_sets'; end if;
          end loop;
        else
          if coalesce(p_payload->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'training_date'; end if;
          v_date := (p_payload->>'date')::date;
          if v_date > v_today then raise exception 'future_date'; end if;
          if coalesce(p_payload->>'status','') not in ('draft','finished') or jsonb_typeof(p_payload->'exercises') is distinct from 'array' or jsonb_array_length(p_payload->'exercises') > 50 then raise exception 'session'; end if;
          for v_exercise in select value from jsonb_array_elements(p_payload->'exercises') loop
            if v_exercise->>'exerciseId' is null or v_exercise->>'id' is null then raise exception 'exercise_id'; end if;
            if v_exercise->>'exerciseId' !~ '^[a-z0-9][a-z0-9-]{0,79}$' then raise exception 'exercise_key'; end if;
            perform (v_exercise->>'id')::uuid;
            v_mode := v_exercise->>'mode';
            if coalesce(v_mode,'') not in ('external_load_reps','bodyweight_reps') or jsonb_typeof(v_exercise->'name') is distinct from 'string' or length(btrim(v_exercise->>'name')) not between 1 and 80 or jsonb_typeof(v_exercise->'sets') is distinct from 'array' or jsonb_array_length(v_exercise->'sets') > 50 then raise exception 'session_exercise'; end if;
            if p_payload->>'status' = 'finished' and jsonb_array_length(v_exercise->'sets') = 0 then raise exception 'empty_exercise'; end if;
            for v_set in select value from jsonb_array_elements(v_exercise->'sets') loop
              if v_set->>'id' is null then raise exception 'set_id'; end if;
              perform (v_set->>'id')::uuid;
              if jsonb_typeof(v_set->'confirmed') is distinct from 'boolean' then raise exception 'confirmed'; end if;
              if v_set->'weight' is not null and v_set->'weight' <> 'null'::jsonb then
                if jsonb_typeof(v_set->'weight') is distinct from 'number' then raise exception 'weight'; end if;
                v_kg := (v_set->>'weight')::numeric;
                if v_kg not between 0 and 1000 or v_kg <> round(v_kg,2) or (v_mode = 'bodyweight_reps' and v_kg <> 0) then raise exception 'weight'; end if;
              end if;
              if v_set->'reps' is not null and v_set->'reps' <> 'null'::jsonb then
                if jsonb_typeof(v_set->'reps') is distinct from 'number' then raise exception 'reps'; end if;
                v_reps := (v_set->>'reps')::numeric;
                if v_reps not between 1 and 1000 or v_reps <> trunc(v_reps) then raise exception 'reps'; end if;
              end if;
              if (v_set->>'confirmed')::boolean then
                if jsonb_typeof(v_set->'weight') is distinct from 'number' or jsonb_typeof(v_set->'reps') is distinct from 'number' then raise exception 'set_values'; end if;
                v_kg := (v_set->>'weight')::numeric;
                v_reps := (v_set->>'reps')::numeric;
                if v_kg not between 0 and 1000 or v_kg <> round(v_kg,2) or v_reps not between 1 and 1000 or v_reps <> trunc(v_reps) or (v_mode = 'bodyweight_reps' and v_kg <> 0) then raise exception 'set_values'; end if;
                v_confirmed := v_confirmed + 1;
              elsif p_payload->>'status' = 'finished' then raise exception 'unconfirmed_finished_set';
              end if;
            end loop;
          end loop;
          if p_payload->>'status' = 'finished' and v_confirmed = 0 then raise exception 'no_confirmed_sets'; end if;
          select * into v_duplicate from public.entrenos_entities where owner_id = v_owner and entity_type = 'session' and not deleted and id <> p_entity_id and payload->>'date' = p_payload->>'date' and payload->>'status' in ('draft','finished') order by created_at, id limit 1;
          if found then
            v_result := jsonb_build_object('status','conflict','reason','date_occupied','entity',to_jsonb(v_duplicate));
          end if;
        end if;
      exception when others then
        v_result := jsonb_build_object('status','invalid','reason','validation','detail','Comprueba los campos y la fecha del entrenamiento.');
      end;
    end if;
    if v_result is null then
      v_new_revision := coalesce(v_current.revision,0) + 1;
      insert into public.entrenos_entities(owner_id,entity_type,id,revision,payload,deleted)
      values(v_owner,p_entity_type,p_entity_id,v_new_revision,case when p_action = 'delete' then v_current.payload else p_payload end,p_action = 'delete')
      on conflict(owner_id,entity_type,id) do update set revision = excluded.revision, payload = excluded.payload, deleted = excluded.deleted, updated_at = now()
      returning * into v_current;
      v_result := jsonb_build_object('status','applied','revision',v_current.revision,'entity',to_jsonb(v_current));
    end if;
  end if;
  insert into public.entrenos_operations(owner_id,operation_id,device_id,request_hash,response)
    values(v_owner,p_operation_id,p_device_id,v_hash,v_result);
  return v_result;
end;
$$;
revoke all on function public.entrenos_apply_change(uuid,uuid,uuid,text,uuid,text,integer,jsonb) from public, anon;
grant execute on function public.entrenos_apply_change(uuid,uuid,uuid,text,uuid,text,integer,jsonb) to authenticated;
