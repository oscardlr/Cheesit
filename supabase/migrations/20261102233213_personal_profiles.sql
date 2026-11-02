-- Personal identity uses the existing private account, RLS, revision and receipts.
-- Only extend validation; preserve the existing training/economy contract and grants.
create or replace function public.cheesit_validate_data(d jsonb) returns void
language plpgsql set search_path = pg_catalog, public as $$
declare
  kind text; arr jsonb; item jsonb; ex jsonb; s jsonb; g jsonb; t jsonb;
  ids text[] := '{}'; nested text; confirmed integer; value numeric; mission_definition jsonb; mission_key text; mission_week text;
  mission_definitions jsonb := '{"sessions":{"xp":200,"target":3,"weekly":true,"personal":true},"sets":{"xp":150,"target":30,"weekly":true,"personal":false},"variety":{"xp":150,"target":4,"weekly":true,"personal":false},"week-sets-10":{"xp":60,"target":10,"weekly":true,"personal":false},"week-sets-50":{"xp":220,"target":50,"weekly":true,"personal":false},"week-reps-100":{"xp":80,"target":100,"weekly":true,"personal":false},"week-reps-300":{"xp":160,"target":300,"weekly":true,"personal":false},"week-exercises-5":{"xp":120,"target":5,"weekly":true,"personal":false},"week-days-2":{"xp":100,"target":2,"weekly":true,"personal":false},"week-days-4":{"xp":200,"target":4,"weekly":true,"personal":false},"week-group-0":{"xp":60,"target":3,"weekly":true,"personal":false},"week-group-1":{"xp":60,"target":3,"weekly":true,"personal":false},"week-group-2":{"xp":60,"target":3,"weekly":true,"personal":false},"week-group-3":{"xp":60,"target":3,"weekly":true,"personal":false},"week-group-4":{"xp":60,"target":3,"weekly":true,"personal":false},"week-group-5":{"xp":60,"target":3,"weekly":true,"personal":false},"week-group-6":{"xp":60,"target":3,"weekly":true,"personal":false},"career-sessions-1":{"xp":100,"target":1,"weekly":false,"personal":false},"career-sessions-5":{"xp":200,"target":5,"weekly":false,"personal":false},"career-sessions-10":{"xp":300,"target":10,"weekly":false,"personal":false},"career-sessions-25":{"xp":500,"target":25,"weekly":false,"personal":false},"career-sessions-50":{"xp":800,"target":50,"weekly":false,"personal":false},"career-sessions-100":{"xp":1200,"target":100,"weekly":false,"personal":false},"career-sets-10":{"xp":80,"target":10,"weekly":false,"personal":false},"career-sets-50":{"xp":150,"target":50,"weekly":false,"personal":false},"career-sets-100":{"xp":250,"target":100,"weekly":false,"personal":false},"career-sets-250":{"xp":450,"target":250,"weekly":false,"personal":false},"career-sets-500":{"xp":700,"target":500,"weekly":false,"personal":false},"career-reps-100":{"xp":80,"target":100,"weekly":false,"personal":false},"career-reps-500":{"xp":180,"target":500,"weekly":false,"personal":false},"career-reps-1000":{"xp":300,"target":1000,"weekly":false,"personal":false},"career-reps-5000":{"xp":750,"target":5000,"weekly":false,"personal":false},"career-groups-1":{"xp":50,"target":1,"weekly":false,"personal":false},"career-groups-3":{"xp":150,"target":3,"weekly":false,"personal":false},"career-groups-7":{"xp":350,"target":7,"weekly":false,"personal":false},"career-exercises-5":{"xp":150,"target":5,"weekly":false,"personal":false},"career-exercises-10":{"xp":250,"target":10,"weekly":false,"personal":false},"career-exercises-20":{"xp":450,"target":20,"weekly":false,"personal":false},"career-group-0-10":{"xp":120,"target":10,"weekly":false,"personal":false},"career-group-0-25":{"xp":220,"target":25,"weekly":false,"personal":false},"career-group-1-10":{"xp":120,"target":10,"weekly":false,"personal":false},"career-group-1-25":{"xp":220,"target":25,"weekly":false,"personal":false},"career-group-2-10":{"xp":120,"target":10,"weekly":false,"personal":false},"career-group-2-25":{"xp":220,"target":25,"weekly":false,"personal":false},"career-group-3-10":{"xp":120,"target":10,"weekly":false,"personal":false},"career-group-3-25":{"xp":220,"target":25,"weekly":false,"personal":false},"career-group-4-10":{"xp":120,"target":10,"weekly":false,"personal":false},"career-group-4-25":{"xp":220,"target":25,"weekly":false,"personal":false},"career-group-5-10":{"xp":120,"target":10,"weekly":false,"personal":false},"career-group-5-25":{"xp":220,"target":25,"weekly":false,"personal":false},"career-group-6-10":{"xp":120,"target":10,"weekly":false,"personal":false},"career-group-6-25":{"xp":220,"target":25,"weekly":false,"personal":false}}';
  uuid_pattern text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
begin
  if jsonb_typeof(d) is distinct from 'object' or octet_length(d::text) > 16777216 then raise exception 'invalid data'; end if;
  if exists(select 1 from jsonb_object_keys(d) k where k not in ('routines','workouts','customExercises','routineDraft','profile','personalProfile','preferences','game')) then raise exception 'unknown data field'; end if;
  foreach kind in array array['routines','workouts','customExercises'] loop
    arr := d->kind;
    if jsonb_typeof(arr) is distinct from 'array' or jsonb_array_length(arr) > (case when kind = 'workouts' then 50000 else 10000 end) then raise exception 'invalid collection'; end if;
    for item in select * from jsonb_array_elements(arr) loop
      if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'id','') !~ uuid_pattern or item->>'id' = any(ids) then raise exception 'invalid or duplicate id'; end if;
      ids := array_append(ids,item->>'id');
      if jsonb_typeof(item->'name') is distinct from 'string' or length(item->>'name') > 80 or (coalesce(item->>'status','') <> 'draft' and length(btrim(item->>'name')) = 0) then raise exception 'invalid name'; end if;
      if kind = 'customExercises' then
        if coalesce(item->>'mode','') not in ('external_load_reps','bodyweight_reps') or coalesce(item->>'group','') not in ('Pecho','Espalda','Pierna y glúteo','Hombro','Bíceps','Tríceps','Abdominales') then raise exception 'invalid exercise'; end if;
      else
        if coalesce(item->>'color','') not in ('#d8ff3e','#61C9A8','#7BB7F0','#B8A0FF','#F2C56B','#EC8997','#0057C2','#6638A6','#176B43','#A61B29','#8B4500','#475569') then raise exception 'invalid color'; end if;
        if jsonb_typeof(item->'exercises') is distinct from 'array' or jsonb_array_length(item->'exercises') > 50 then raise exception 'invalid exercises'; end if;
        if kind = 'routines' and jsonb_typeof(item->'archived') is distinct from 'boolean' then raise exception 'invalid routine'; end if;
        if kind = 'workouts' then
          if coalesce(item->>'status','') not in ('draft','finished','deleted') then raise exception 'invalid status'; end if;
          if not (item->>'status' = 'draft' and item->>'date' = '') then
            if coalesce(item->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or (item->>'date')::date::text <> item->>'date' or (item->>'date')::date > (now() at time zone 'Europe/Madrid')::date then raise exception 'invalid training date'; end if;
          end if;
          if item->>'createdAt' is null or item->>'updatedAt' is null or not isfinite((item->>'createdAt')::timestamptz) or not isfinite((item->>'updatedAt')::timestamptz) then raise exception 'invalid timestamp'; end if;
        end if;
        confirmed := 0;
        for ex in select * from jsonb_array_elements(item->'exercises') loop
          if jsonb_typeof(ex) is distinct from 'object' or coalesce(ex->>'id','') !~ uuid_pattern or ex->>'id' = any(ids) or length(coalesce(ex->>'exerciseId','')) not between 1 and 100 then raise exception 'invalid exercise id'; end if;
          ids := array_append(ids,ex->>'id');
          if kind = 'routines' then
            if jsonb_typeof(ex->'sets') is distinct from 'number' or (ex->>'sets')::numeric not between 1 and 20 or (ex->>'sets')::numeric <> trunc((ex->>'sets')::numeric) then raise exception 'invalid planned sets'; end if;
          else
            if coalesce(ex->>'mode','') not in ('external_load_reps','bodyweight_reps') or jsonb_typeof(ex->'sets') is distinct from 'array' or jsonb_array_length(ex->'sets') > 50 then raise exception 'invalid sets'; end if;
            for s in select * from jsonb_array_elements(ex->'sets') loop
              if jsonb_typeof(s) is distinct from 'object' or coalesce(s->>'id','') !~ uuid_pattern or s->>'id' = any(ids) or jsonb_typeof(s->'confirmed') is distinct from 'boolean' then raise exception 'invalid set'; end if;
              ids := array_append(ids,s->>'id');
              if jsonb_typeof(s->'weight') not in ('number','null') or s->'weight' is null or jsonb_typeof(s->'reps') not in ('number','null') or s->'reps' is null then raise exception 'invalid set values'; end if;
              if (s->>'confirmed')::boolean then
                if jsonb_typeof(s->'weight') is distinct from 'number' or jsonb_typeof(s->'reps') is distinct from 'number' then raise exception 'missing set values'; end if;
                value := (s->>'weight')::numeric;
                if value not between 0 and 1000 or value <> round(value,2) or (ex->>'mode' = 'bodyweight_reps' and value <> 0) then raise exception 'invalid load'; end if;
                value := (s->>'reps')::numeric;
                if value not between 1 and 1000 or value <> trunc(value) then raise exception 'invalid repetitions'; end if;
                confirmed := confirmed + 1;
              elsif item->>'status' = 'finished' then raise exception 'unconfirmed finished set';
              end if;
            end loop;
          end if;
        end loop;
        if kind = 'workouts' and item->>'status' = 'finished' and confirmed = 0 then raise exception 'empty finished workout'; end if;
        if kind = 'workouts' then perform public.cheesit_validate_passive(item); end if;
        if item ? 'companionReward' and (jsonb_typeof(item->'companionReward') is distinct from 'object' or item->'companionReward'->>'workoutId' is distinct from item->>'id' or item->>'status' = 'draft' or (item->'companionReward') - array['awardedAt','bonusXp','bonusCredits','eligible','reason'] is distinct from item->'companionPassive') then raise exception 'invalid passive reward'; end if;
        if item ? 'abilityReward' and not exists(select 1 from jsonb_array_elements(coalesce(d->'game'->'abilityUses','[]')) u where u = item->'abilityReward' and u->>'workoutId' = item->>'id') then raise exception 'ability use missing from ledger'; end if;
      end if;
    end loop;
  end loop;
  if d ? 'preferences' and (jsonb_typeof(d->'preferences') is distinct from 'object' or jsonb_typeof(d->'preferences'->'effects') is distinct from 'boolean' or jsonb_typeof(d->'preferences'->'sound') is distinct from 'boolean') then raise exception 'invalid preferences'; end if;
  -- Embedded account-private JPEG; legacy documents may omit personalProfile.
  if d ? 'personalProfile' then
    item := d->'personalProfile';
    if jsonb_typeof(item) is distinct from 'object' then raise exception 'invalid personal profile' using errcode = '22023'; end if;
    if exists(select 1 from jsonb_object_keys(item) k where k not in ('displayName','bio','photo')) or
       jsonb_typeof(item->'displayName') is distinct from 'string' or length(item->>'displayName') > 80 or
       jsonb_typeof(item->'bio') is distinct from 'string' or length(item->>'bio') > 300 or
       not (item ? 'photo') then raise exception 'invalid personal profile' using errcode = '22023'; end if;
    if item->'photo' <> 'null'::jsonb then
      if jsonb_typeof(item->'photo') is distinct from 'string' or length(item->>'photo') > 262144 or
         (length(item->>'photo') - 23) % 4 <> 0 or
         (item->>'photo') !~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]*={0,2}$' then
        raise exception 'invalid personal profile photo' using errcode = '22023';
      end if;
    end if;
  end if;
  if d ? 'profile' then
    item := d->'profile';
    if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'sex','') not in ('male','female') then raise exception 'invalid profile'; end if;
    if jsonb_typeof(item->'age') is distinct from 'number' or (item->>'age')::numeric not between 16 and 100 or (item->>'age')::numeric<>trunc((item->>'age')::numeric) or jsonb_typeof(item->'weightKg') is distinct from 'number' or (item->>'weightKg')::numeric not between 30 and 300 or jsonb_typeof(item->'heightCm') is distinct from 'number' or (item->>'heightCm')::numeric not between 100 and 250 or (item ? 'dumbbellLoad' and item->>'dumbbellLoad' not in ('per_hand','pair')) then raise exception 'invalid profile value'; end if;
  end if;
  if d ? 'routineDraft' then
    item := d->'routineDraft';
    if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'id','') !~ uuid_pattern or jsonb_typeof(item->'name') is distinct from 'string' or length(item->>'name') > 80 or jsonb_typeof(item->'exercises') is distinct from 'array' or jsonb_array_length(item->'exercises') > 50 then raise exception 'invalid routine draft'; end if;
  end if;
  if d ? 'game' then
    g := d->'game';
    if jsonb_typeof(g) is distinct from 'object' or jsonb_typeof(g->'inventory') is distinct from 'array' or jsonb_typeof(g->'transactions') is distinct from 'array' or jsonb_array_length(g->'inventory') > 50000 or jsonb_array_length(g->'transactions') > 100000 then raise exception 'invalid game ledger'; end if;
    if jsonb_typeof(g->'weeklyWorkoutGoal') is distinct from 'number' or (g->>'weeklyWorkoutGoal')::numeric not between 1 and 7 or (g->>'weeklyWorkoutGoal')::numeric <> trunc((g->>'weeklyWorkoutGoal')::numeric) or jsonb_typeof(g->'weeklySetGoal') is distinct from 'number' or (g->>'weeklySetGoal')::numeric not between 1 and 200 or (g->>'weeklySetGoal')::numeric <> trunc((g->>'weeklySetGoal')::numeric) then raise exception 'invalid goals'; end if;
    for item in select * from jsonb_array_elements(g->'inventory') loop
      if coalesce(item->>'id','') !~ uuid_pattern or item->>'id' = any(ids) or jsonb_typeof(item->'sold') is distinct from 'boolean' or coalesce(item->>'rarity','') not in ('common','rare','epic','legendary') or item->>'acquiredAt' is null or not isfinite((item->>'acquiredAt')::timestamptz) then raise exception 'invalid inventory item'; end if;
      ids := array_append(ids,item->>'id');
      if (select count(*) from jsonb_array_elements(g->'transactions') purchase where purchase->>'itemId'=item->>'id' and purchase->>'kind' in ('crate','level-crate')) <> 1 then raise exception 'invalid purchase history'; end if;
    end loop;
    for t in select * from jsonb_array_elements(g->'transactions') loop
      if coalesce(t->>'id','') !~ uuid_pattern or t->>'id' = any(ids) or coalesce(t->>'kind','') not in ('crate','sale','level-crate') or jsonb_typeof(t->'amount') is distinct from 'number' or (t->>'amount')::numeric <> trunc((t->>'amount')::numeric) or abs((t->>'amount')::numeric)>1000000 or not exists(select 1 from jsonb_array_elements(g->'inventory') i where i->>'id'=t->>'itemId') then raise exception 'invalid transaction'; end if;
      ids := array_append(ids,t->>'id');
      if t->>'kind' = 'level-crate' and (t->>'amount')::numeric <> 0 then raise exception 'invalid level reward'; end if;
      if t->>'kind' = 'crate' then
        select * into item from jsonb_array_elements(g->'inventory') i where i->>'id'=t->>'itemId';
        if (t->>'amount')::numeric is distinct from (case item->>'crateId' when 'starter' then -100 when 'charged' then -250 when 'legend' then -500 else null end) then raise exception 'invalid purchase'; end if;
      end if;
      if t->>'createdAt' is null or not isfinite((t->>'createdAt')::timestamptz) then raise exception 'invalid transaction timestamp'; end if;
    end loop;
    foreach nested in array array['abilityUses','missionRewards','quoteConversions','quoteConversionSeenIds','legacyAbilityUseIds','seasonCrateProgress','seasonCrateClaimLocks'] loop
      if g ? nested and (jsonb_typeof(g->nested) is distinct from 'array' or jsonb_array_length(g->nested)>100000) then raise exception 'invalid game collection'; end if;
    end loop;
    for item in select * from jsonb_array_elements(coalesce(g->'missionRewards','[]')) loop
      mission_key := regexp_replace(item->>'id', ':[0-9]{4}-[0-9]{2}-[0-9]{2}$', '');
      mission_definition := mission_definitions->mission_key;
      if mission_definition is null or item->'xp' is distinct from mission_definition->'xp' or jsonb_typeof(item->'target') is distinct from 'number' or (item->>'target')::numeric <> trunc((item->>'target')::numeric) or item->>'awardedAt' is null or not isfinite((item->>'awardedAt')::timestamptz) then raise exception 'invalid mission reward'; end if;
      if (mission_definition->>'personal')::boolean then
        if (item->>'target')::numeric not between 1 and 7 then raise exception 'invalid mission target'; end if;
      elsif item->'target' is distinct from mission_definition->'target' then raise exception 'invalid mission target'; end if;
      if (mission_definition->>'weekly')::boolean then
        mission_week := right(item->>'id',10);
        if mission_week !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or extract(isodow from mission_week::date)<>1 or ((item->>'awardedAt')::timestamptz at time zone 'Europe/Madrid')::date < mission_week::date then raise exception 'invalid mission week'; end if;
      elsif item->>'id' is distinct from mission_key then raise exception 'invalid mission id'; end if;
    end loop;
    if (select count(*) from jsonb_array_elements(coalesce(g->'missionRewards','[]'))) <> (select count(distinct m->>'id') from jsonb_array_elements(coalesce(g->'missionRewards','[]')) m) then raise exception 'duplicate mission reward'; end if;
  end if;
end;
$$;
revoke all on function public.cheesit_validate_data(jsonb) from public, anon, authenticated;
