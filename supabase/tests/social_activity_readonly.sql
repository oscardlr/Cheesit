-- Connected-project verification: never inserts users, follows or workouts.
begin read only;
do $$ begin
  perform set_config('cheesit.test_a',(select owner_id::text from public.cheesit_social_profiles order by owner_id limit 1),true);
  perform set_config('cheesit.test_b',(select owner_id::text from public.cheesit_social_profiles order by owner_id offset 1 limit 1),true);
  assert current_setting('cheesit.test_b',true) is not null, 'requires two completed accounts';
end; $$;
set local role authenticated;
do $$
declare a uuid:=current_setting('cheesit.test_a')::uuid; b uuid:=current_setting('cheesit.test_b')::uuid; activity jsonb;
begin
  perform set_config('request.jwt.claim.sub',a::text,true);
  assert not exists(select 1 from public.cheesit_accounts where owner_id=b);
  assert not exists(select 1 from public.cheesit_notifications where recipient_id<>a);
  activity:=public.cheesit_read_activity(b);
  if not (activity->>'shared')::boolean then
    assert activity->'summary'='null'::jsonb, 'private summary leaked';
    assert activity->'workouts'='[]'::jsonb, 'private history leaked';
    assert public.cheesit_read_activity(b,'unavailable')->'workouts'='[]'::jsonb;
  end if;
  assert public.cheesit_read_notifications()->'items' is not null;
  assert not has_table_privilege('authenticated','public.cheesit_notifications','INSERT');
  assert not has_table_privilege('authenticated','public.cheesit_notifications','DELETE');
  assert not has_column_privilege('authenticated','public.cheesit_notifications','actor_id','UPDATE');
  assert has_column_privilege('authenticated','public.cheesit_notifications','read_at','UPDATE');
  assert not has_table_privilege('authenticated','public.cheesit_social_workouts','UPDATE');
  assert not has_function_privilege('authenticated','cheesit_private.sync_social_activity()','EXECUTE');
  assert not has_function_privilege('authenticated','cheesit_private.notify_follow()','EXECUTE');
  perform set_config('request.jwt.claim.sub',b::text,true);
  assert not exists(select 1 from public.cheesit_accounts where owner_id=a);
  assert not exists(select 1 from public.cheesit_notifications where recipient_id<>b);
end; $$;
set local role anon;
do $$ begin
  assert not has_table_privilege('anon','public.cheesit_social_workouts','SELECT');
  assert not has_table_privilege('anon','public.cheesit_social_activity','SELECT');
  assert not has_table_privilege('anon','public.cheesit_notifications','SELECT');
  assert not has_function_privilege('anon','public.cheesit_read_activity(uuid,text,integer)','EXECUTE');
  assert not has_function_privilege('anon','public.cheesit_read_notifications(timestamptz,uuid)','EXECUTE');
  assert not has_function_privilege('anon','public.cheesit_mark_notifications(uuid)','EXECUTE');
end; $$;
rollback;
