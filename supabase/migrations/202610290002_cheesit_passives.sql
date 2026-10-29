-- Passive snapshots and awards live in the existing session JSON payload. No
-- backfill: old sessions/drafts deliberately remain without passive rewards.
-- Keep the existing RPC's revision lock, operation hash and receipt protocol.
create or replace function public.entrenos_guard_cheesit_passive()
returns trigger language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_snapshot jsonb := new.payload->'companionPassive';
  v_award jsonb := new.payload->'companionReward';
  v_expected jsonb;
  v_passive text;
  v_fixed_at timestamptz;
begin
  if new.entity_type <> 'session' then return new; end if;
  -- Deletion retains the frozen event in its tombstone. Updating an already
  -- captured session can neither swap its cheesit nor retry an unmet condition.
  if tg_op = 'UPDATE' then
    if old.payload->'companionPassive' is distinct from v_snapshot then
      raise exception 'cheesit passive snapshot is immutable' using errcode = '22023';
    end if;
    if (old.payload ? 'companionReward' or old.payload->>'status' = 'finished') and old.payload->'companionReward' is distinct from v_award then
      raise exception 'cheesit passive award is immutable' using errcode = '22023';
    end if;
  end if;
  if v_snapshot is null or v_snapshot = 'null'::jsonb then
    if v_award is not null then raise exception 'cheesit award without snapshot' using errcode = '22023'; end if;
    return new;
  end if;
  if jsonb_typeof(v_snapshot) <> 'object' or v_snapshot->>'workoutId' is distinct from new.id::text or v_snapshot->'version' is distinct from '1'::jsonb then
    raise exception 'invalid cheesit passive snapshot' using errcode = '22023';
  end if;
  case v_snapshot->>'companionId'
    when 'athlete' then v_passive := 'neon-finish'; v_expected := '{"xp":20,"credits":0}'::jsonb;
    when 'warrior' then v_passive := 'iron-milestone'; v_expected := '{"xp":15,"credits":0}'::jsonb;
    when 'sorceress' then v_passive := 'stellar-variety'; v_expected := '{"xp":20,"credits":0,"minGroups":3}'::jsonb;
    when 'dragon-queen' then v_passive := 'dragon-balance'; v_expected := '{"xp":0,"credits":4,"minGroups":2}'::jsonb;
    when 'iris' then v_passive := 'pulse-salvage'; v_expected := '{"xp":0,"credits":2}'::jsonb;
    when 'lua' then v_passive := 'tidal-control'; v_expected := '{"xp":20,"credits":0}'::jsonb;
    when 'sol' then v_passive := 'solar-awareness'; v_expected := '{"xp":15,"credits":0}'::jsonb;
    when 'mara' then v_passive := 'astral-rest'; v_expected := '{"xp":25,"credits":0,"restDays":1}'::jsonb;
    else raise exception 'unknown cheesit passive' using errcode = '22023';
  end case;
  if v_snapshot->>'passiveId' is distinct from v_passive or v_snapshot->'parameters' is distinct from v_expected then
    raise exception 'invalid cheesit passive parameters' using errcode = '22023';
  end if;
  v_fixed_at := (v_snapshot->>'fixedAt')::timestamptz;
  if v_fixed_at is null or not isfinite(v_fixed_at) or v_snapshot->>'fixedDate' is distinct from (v_fixed_at at time zone 'Europe/Madrid')::date::text then
    raise exception 'invalid cheesit passive capture date' using errcode = '22023';
  end if;
  if v_award is not null then
    if jsonb_typeof(v_award) <> 'object' or new.payload->>'status' = 'draft' or
       v_award - array['awardedAt','bonusXp','bonusCredits','eligible','reason'] is distinct from v_snapshot or
       jsonb_typeof(v_award->'eligible') is distinct from 'boolean' or
       jsonb_typeof(v_award->'awardedAt') is distinct from 'string' or
       (v_award->>'awardedAt')::timestamptz is null or not isfinite((v_award->>'awardedAt')::timestamptz) or
       (v_award->>'awardedAt')::timestamptz < v_fixed_at then
      raise exception 'invalid cheesit passive award' using errcode = '22023';
    end if;
    if (v_award->>'eligible')::boolean then
      if v_award->>'reason' is distinct from 'awarded' or v_award->'bonusXp' is distinct from v_expected->'xp' or v_award->'bonusCredits' is distinct from v_expected->'credits' then
        raise exception 'invalid cheesit passive bonus' using errcode = '22023';
      end if;
    elsif coalesce(v_award->>'reason','') not in ('condition-not-met','historical-date','invalid-session') or v_award->'bonusXp' is distinct from '0'::jsonb or v_award->'bonusCredits' is distinct from '0'::jsonb then
      raise exception 'invalid zero cheesit passive bonus' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.entrenos_guard_cheesit_passive() from public, anon, authenticated;
create trigger entrenos_cheesit_passive_guard before insert or update on public.entrenos_entities
for each row execute function public.entrenos_guard_cheesit_passive();
