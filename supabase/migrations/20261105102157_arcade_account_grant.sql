-- Keep administrative Arcade grants authoritative across normal account writes.
create function cheesit_private.guard_arcade_account_grant() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare
  incoming jsonb := new.data #> '{game,arcadeGrant}';
  stored jsonb;
begin
  if auth.uid() is null then return new; end if;

  if tg_op = 'UPDATE' then
    stored := old.data #> '{game,arcadeGrant}';
  elsif incoming is not null then
    -- The account commit RPC uses INSERT ... ON CONFLICT DO UPDATE.
    select data #> '{game,arcadeGrant}' into stored
    from public.cheesit_accounts where owner_id = new.owner_id;
  end if;

  if incoming is not null and incoming is distinct from stored then
    raise exception 'Arcade grant belongs to another account or has changed' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' and stored is not null and incoming is null then
    if new.data->'workouts' = '[]'::jsonb and new.data->'routines' = '[]'::jsonb
       and new.data->'customExercises' = '[]'::jsonb
       and new.data #> '{game,inventory}' = '[]'::jsonb then
      -- The existing account reset intentionally clears game progression.
      return new;
    end if;
    if jsonb_typeof(new.data #> '{game,inventory}') is distinct from 'array'
       or new.data #> '{game,inventory}' = '[]'::jsonb then
      raise exception 'Refresh the account before saving Arcade progress' using errcode = '22023';
    end if;
    new.data := jsonb_set(new.data, '{game,arcadeGrant}', stored);
  end if;
  return new;
end;
$$;

revoke all on function cheesit_private.guard_arcade_account_grant() from public, anon, authenticated;
create trigger guard_arcade_account_grant
before insert or update of data on public.cheesit_accounts
for each row execute function cheesit_private.guard_arcade_account_grant();
