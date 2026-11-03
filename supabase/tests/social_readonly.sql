-- Safe against existing accounts: read-only transaction, no account writes,
-- no follow mutations, no temporary users and no deletion statements.
begin read only;
do $$ begin
  perform set_config('cheesit.test_a',(select owner_id::text from public.cheesit_social_profiles order by owner_id limit 1),true);
  perform set_config('cheesit.test_b',(select owner_id::text from public.cheesit_social_profiles order by owner_id offset 1 limit 1),true);
  assert current_setting('cheesit.test_a',true) is not null, 'requires two completed accounts';
  assert current_setting('cheesit.test_b',true) is not null, 'requires two completed accounts';
end; $$;
set local role authenticated;
do $$
declare a uuid:=current_setting('cheesit.test_a')::uuid;
  b uuid:=current_setting('cheesit.test_b')::uuid;
  visible jsonb;
begin
  perform set_config('request.jwt.claim.sub',a::text,true);
  assert (select count(*) from public.cheesit_accounts where owner_id=a)=1;
  assert not exists(select 1 from public.cheesit_accounts where owner_id=b), 'private account leaked A to B';
  assert not exists(select 1 from public.cheesit_identities where owner_id=b), 'private identity leaked A to B';
  assert not exists(select 1 from public.cheesit_account_receipts where owner_id=b), 'private receipts leaked A to B';
  visible:=public.cheesit_read_social('',b)->0;
  assert visible->>'owner_id'=b::text, 'social profile unavailable';
  assert not (visible ?| array['email','data','profile','workouts','revision','completed_at']), 'private fields exposed';
  assert jsonb_array_length(public.cheesit_read_social(upper('@'||(visible->>'username'))))=1, 'canonical search failed';
  perform set_config('request.jwt.claim.sub',b::text,true);
  assert (select count(*) from public.cheesit_accounts where owner_id=b)=1;
  assert not exists(select 1 from public.cheesit_accounts where owner_id=a), 'private account leaked B to A';
  assert not exists(select 1 from public.cheesit_identities where owner_id=a), 'private identity leaked B to A';
  assert public.cheesit_read_social('',a)->0->>'owner_id'=a::text;
  assert not has_table_privilege('authenticated','public.cheesit_social_profiles','INSERT');
  assert not has_table_privilege('authenticated','public.cheesit_social_profiles','UPDATE');
  assert not has_table_privilege('authenticated','public.cheesit_follows','UPDATE');
  assert not has_function_privilege('authenticated','cheesit_private.sync_social_profile()','EXECUTE');
  perform set_config('request.jwt.claim.sub','',true);
  assert jsonb_array_length(public.cheesit_read_social('a'))=0;
  assert not exists(select 1 from public.cheesit_social_profiles);
end; $$;
set local role anon;
do $$ begin
  assert not has_table_privilege('anon','public.cheesit_social_profiles','SELECT');
  assert not has_table_privilege('anon','public.cheesit_follows','SELECT');
  assert not has_table_privilege('anon','public.cheesit_follows','INSERT');
  assert not has_table_privilege('anon','public.cheesit_follows','DELETE');
  assert not has_function_privilege('anon','public.cheesit_read_social(text,uuid,text,integer)','EXECUTE');
end; $$;
rollback;
