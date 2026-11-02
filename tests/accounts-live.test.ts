import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { blankDocument, type CloudSnapshot } from '../src/lib/remote/document';

// Explicit opt-in: run only against a development Supabase project, with two
// dedicated confirmed test accounts. Supply credentials through local env only.
test('LIVE Supabase: persistent login, two-account RLS, CAS, retry and deletion', { skip: process.env.CHEESIT_LIVE_TESTS !== '1' }, async () => {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  assert.ok(url&&key,'Missing public Supabase configuration');
  const a=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),b=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const login=async(client:typeof a,suffix:string)=>{const email=process.env[`CHEESIT_TEST_EMAIL_${suffix}`],password=process.env[`CHEESIT_TEST_PASSWORD_${suffix}`];assert.ok(email&&password,`Missing test account ${suffix}`);const {data,error}=await client.auth.signInWithPassword({email,password});assert.ifError(error);assert.ok(data.user);return data.user.id;};
  const owner=await login(a,'A'),other=await login(b,'B');assert.notEqual(owner,other);
  const {data:verified,error:authError}=await a.auth.getUser();assert.ifError(authError);assert.equal(verified.user?.id,owner);
  async function read():Promise<CloudSnapshot>{const {data,error}=await a.from('cheesit_accounts').select('*').eq('owner_id',owner).maybeSingle();assert.ifError(error);return data??{...blankDocument(),revision:0};}
  async function commit(base:CloudSnapshot,document:ReturnType<typeof blankDocument>,operationId=crypto.randomUUID()){const {data,error}=await a.rpc('cheesit_commit_account',{p_expected_owner:owner,p_operation_id:operationId,p_base_revision:base.revision,p_document:document});assert.ifError(error);return data;}
  const before=await read();const routine={id:crypto.randomUUID(),name:'CHEESIT LIVE TEST',color:'#d8ff3e',archived:false,exercises:[]};
  const document={data:{...before.data,routines:[...before.data.routines,routine]},tombstones:before.tombstones,migrations:before.migrations};const op=crypto.randomUUID();
  const reply=await commit(before,document,op);assert.equal(reply.status,'applied');assert.deepEqual(await commit(before,document,op),reply);
  try {
    const {data,error}=await b.from('cheesit_accounts').select('*').eq('owner_id',owner);assert.ifError(error);assert.deepEqual(data,[]);
    const cross=await b.rpc('cheesit_commit_account',{p_expected_owner:owner,p_operation_id:crypto.randomUUID(),p_base_revision:reply.snapshot.revision,p_document:document});assert.ok(cross.error,'Cross-account write must fail');
    assert.equal((await commit(before,document)).status,'conflict');
    const direct=await b.from('cheesit_accounts').update({data:document.data}).eq('owner_id',owner);assert.ok(direct.error,'Direct writes must fail');
  } finally {
    const latest=await read();const cleanup={data:{...latest.data,routines:latest.data.routines.filter(x=>x.id!==routine.id)},tombstones:[...latest.tombstones,`routines:${routine.id}`],migrations:latest.migrations};
    assert.equal((await commit(latest,cleanup)).status,'applied');
    await a.auth.signOut({scope:'local'});await b.auth.signOut({scope:'local'});
  }
});
