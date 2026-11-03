-- LOCAL ISOLATED TEST DATABASE ONLY. Exercised automatically by npm test.
-- Never run this write test against the connected project or existing accounts.
-- All test users, account documents, receipts and follows are rolled back.
begin;
select set_config('cheesit.test_a',gen_random_uuid()::text,true);
select set_config('cheesit.test_b',gen_random_uuid()::text,true);
select set_config('cheesit.test_incomplete',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
  select current_setting('cheesit.test_a')::uuid,'social-test-a-'||current_setting('cheesit.test_a')||'@example.test',
    jsonb_build_object('username','test_'||left(replace(current_setting('cheesit.test_a'),'-',''),20),'display_name','Social test A')
  union all select current_setting('cheesit.test_b')::uuid,'social-test-b-'||current_setting('cheesit.test_b')||'@example.test',
    jsonb_build_object('username','test_'||left(replace(current_setting('cheesit.test_b'),'-',''),20),'display_name','Social test B')
  union all select current_setting('cheesit.test_incomplete')::uuid,'social-test-i-'||current_setting('cheesit.test_incomplete')||'@example.test',
    jsonb_build_object('username','test_'||left(replace(current_setting('cheesit.test_incomplete'),'-',''),20),'display_name','Incomplete');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('cheesit.test_a'),true);
select public.cheesit_complete_profile(current_setting('cheesit.test_a')::uuid,'Social test A',
  'test_'||left(replace(current_setting('cheesit.test_a'),'-',''),20),'{"weightKg":70,"heightCm":180,"age":30,"sex":"male"}'::jsonb);
select set_config('request.jwt.claim.sub',current_setting('cheesit.test_b'),true);
select public.cheesit_complete_profile(current_setting('cheesit.test_b')::uuid,'Social test B',
  'test_'||left(replace(current_setting('cheesit.test_b'),'-',''),20),'{"weightKg":80,"heightCm":175,"age":25,"sex":"female"}'::jsonb);
do $$
declare
  a uuid:=current_setting('cheesit.test_a')::uuid;
  b uuid:=current_setting('cheesit.test_b')::uuid;
  i uuid:=current_setting('cheesit.test_incomplete')::uuid;
  visible jsonb;
  account public.cheesit_accounts;
begin
  assert not exists(select 1 from public.cheesit_accounts where owner_id=a), 'private account leaked';
  assert not exists(select 1 from public.cheesit_identities where owner_id=a), 'private identity leaked';
  assert not exists(select 1 from public.cheesit_account_receipts where owner_id=a), 'private receipts leaked';
  assert jsonb_array_length(public.cheesit_read_social('',i))=0, 'incomplete profile leaked';
  visible:=public.cheesit_read_social('',a)->0;
  assert visible->>'display_name'='Social test A', 'social profile unavailable';
  assert not (visible ?| array['email','data','profile','workouts','revision','completed_at']), 'private data in social response';
  begin
    insert into public.cheesit_follows(follower_id,followed_id) values(a,b);
    raise exception 'spoofed follower accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.cheesit_follows(follower_id,followed_id) values(b,b);
    raise exception 'self follow accepted';
  exception when check_violation then null; end;
  begin
    insert into public.cheesit_follows(follower_id,followed_id) values(b,i);
    raise exception 'incomplete target accepted';
  exception when foreign_key_violation then null; end;
  insert into public.cheesit_follows(follower_id,followed_id) values(b,a);
  begin
    insert into public.cheesit_follows(follower_id,followed_id) values(b,a);
    raise exception 'duplicate accepted';
  exception when unique_violation then null; end;
  assert (public.cheesit_read_social('',a)->0->>'followers')::int=1;
  assert not (public.cheesit_read_social('',a)->0->>'follows_you')::boolean, 'reciprocal follow created';
  assert jsonb_array_length(public.cheesit_read_social('',a,'followers'))=1;
  assert jsonb_array_length(public.cheesit_read_social('',b,'following'))=1;
  begin
    update public.cheesit_social_profiles set bio='spoofed' where owner_id=a;
    raise exception 'direct social write accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.cheesit_follows set follower_id=a;
    raise exception 'follow reassignment accepted';
  exception when insufficient_privilege then null; end;
  -- The existing, versioned save RPC must update the projection in its transaction.
  select * into account from public.cheesit_accounts where owner_id=b;
  perform public.cheesit_commit_account(b,gen_random_uuid(),account.revision,
    jsonb_build_object('data',jsonb_set(account.data,'{personalProfile}',
      '{"displayName":"Updated social B","bio":"Updated bio","photo":null}'::jsonb),
      'tombstones',account.tombstones,'migrations',account.migrations));
  perform set_config('request.jwt.claim.sub',a::text,true);
  assert public.cheesit_read_social('',b)->0->>'display_name'='Updated social B';
  assert public.cheesit_read_social('',b)->0->>'bio'='Updated bio';
  assert (public.cheesit_read_social('',b)->0->>'follows_you')::boolean;
  assert not (public.cheesit_read_social('',b)->0->>'is_following')::boolean;
  delete from public.cheesit_follows where follower_id=b;
  assert exists(select 1 from public.cheesit_follows where follower_id=b and followed_id=a), 'deleted another person follow';
  insert into public.cheesit_follows(follower_id,followed_id) values(a,b);
  delete from public.cheesit_follows where follower_id=a and followed_id=b;
  assert (public.cheesit_read_social('',b)->0->>'follows_you')::boolean, 'reverse edge removed';
  perform set_config('request.jwt.claim.sub',i::text,true);
  begin
    insert into public.cheesit_follows(follower_id,followed_id) values(i,b);
    raise exception 'incomplete follower accepted';
  exception when insufficient_privilege then null; end;
end;
$$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  begin perform * from public.cheesit_social_profiles; raise exception 'anon profiles allowed';
  exception when insufficient_privilege then null; end;
  begin perform * from public.cheesit_follows; raise exception 'anon follows allowed';
  exception when insufficient_privilege then null; end;
  begin perform public.cheesit_read_social('test'); raise exception 'anon RPC allowed';
  exception when insufficient_privilege then null; end;
end; $$;
rollback;
