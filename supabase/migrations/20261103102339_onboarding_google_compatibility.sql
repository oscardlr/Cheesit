-- Preserve Google signup; email registrations still reserve handles atomically.
create or replace function cheesit_private.register_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  handle text := lower(regexp_replace(btrim(new.raw_user_meta_data->>'username'), '^@', ''));
  display_name text := btrim(new.raw_user_meta_data->>'display_name');
begin
  -- Auth owns this provider field. OAuth users choose their handle in onboarding.
  if new.raw_app_meta_data->>'provider' = 'google' then
    return new;
  end if;
  if handle is null or handle !~ '^[a-z0-9_][a-z0-9._]{2,29}$'
     or display_name is null or length(display_name) not between 1 and 80 then
    raise exception 'valid username and display name required' using errcode = '22023';
  end if;
  insert into public.cheesit_identities(owner_id,username) values(new.id,handle);
  insert into public.cheesit_accounts(owner_id,revision,data) values(new.id,1,
    jsonb_build_object('routines','[]'::jsonb,'workouts','[]'::jsonb,'customExercises','[]'::jsonb,
      'personalProfile',jsonb_build_object('displayName',display_name,'bio','','photo',null)));
  return new;
end;
$$;
