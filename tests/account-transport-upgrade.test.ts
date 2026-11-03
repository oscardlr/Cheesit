import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { accountTransport } from '../src/lib/remote/account-sync';
import { remoteClient } from '../src/lib/remote/auth';
import type { AccountDocument } from '../src/lib/remote/document';

test('transport recovers a pre-upgrade lost receipt without changing the original write or accepting mutated reuse', async t => {
  const db = new PGlite();
  const owner = crypto.randomUUID(), operationId = crypto.randomUUID();
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const commits: { p_expected_owner: string; p_operation_id: string; p_base_revision: number; p_document: AccountDocument & { socialSummary?: unknown } }[] = [];
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb,raw_app_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    for (const migration of ['202611020001_accounts.sql','20261102233213_personal_profiles.sql','20261103000502_account_onboarding.sql','20261103102339_onboarding_google_compatibility.sql','20261103140756_social_follows.sql']) {
      await db.exec(readFileSync(`supabase/migrations/${migration}`, 'utf8'));
    }
    await db.query('insert into auth.users values($1,$2,$3,$4)', [owner,'upgrade@example.test',{ username:'upgrade',display_name:'Upgrade' },{ provider:'email',providers:['email'] }]);
    const asOwner = <T>(fn: (tx: PGlite) => Promise<T>) => db.transaction(async tx => {
      await tx.exec('set local role authenticated');
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [owner]);
      return fn(tx as unknown as PGlite);
    });
    const before = (await db.query<{ revision: number; data: AccountDocument['data'] }>('select revision,data from public.cheesit_accounts where owner_id=$1', [owner])).rows[0];
    const document: AccountDocument = { data: { ...before.data, routines: [{ id:crypto.randomUUID(),name:'Saved before upgrade',color:'#d8ff3e',archived:false,exercises:[] }] }, tombstones:[], migrations:[] };
    const original = (await asOwner(tx => tx.query<{ result: unknown }>('select public.cheesit_commit_account($1,$2,$3,$4) result',[owner,operationId,before.revision,document]))).rows[0].result;
    // This response was lost on the old client. Its outbox survives the upgrade.
    await db.exec(readFileSync('supabase/migrations/20261103194247_social_activity_notifications.sql', 'utf8'));
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://upgrade-fixture.invalid';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_upgrade_fixture';
    const user = { id:owner,email:'upgrade@example.test',aud:'authenticated',role:'authenticated',created_at:'2026-11-03T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{},identities:[] };
    let forcedError: { code: string; message: string } | undefined;
    t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (url.pathname === '/auth/v1/user') return Response.json(user);
      if (url.pathname === '/auth/v1/logout') return Response.json({});
      assert.equal(url.pathname, '/rest/v1/rpc/cheesit_commit_account');
      const body = JSON.parse(String(init?.body)); commits.push(body);
      if (forcedError) return Response.json(forcedError, { status:400 });
      try {
        const result = (await asOwner(tx => tx.query<{ result: unknown }>('select public.cheesit_commit_account($1,$2,$3,$4) result', [body.p_expected_owner,body.p_operation_id,body.p_base_revision,body.p_document]))).rows[0].result;
        return Response.json(result);
      } catch (e) {
        const error = e as Error & { code?: string };
        return Response.json({ code:error.code,message:error.message }, { status:400 });
      }
    });
    const token = `${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:owner,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',aud:'authenticated'})).toString('base64url')}.local-test-signature`;
    const client = remoteClient()!;
    const session = await client.auth.setSession({ access_token:token,refresh_token:'upgrade-test' });
    assert.ifError(session.error);
    const transport = accountTransport(owner);
    const op = { operationId,expectedRevision:before.revision,document };
    const recovered = await transport.apply(op);
    assert.deepEqual(recovered, original);
    assert.equal(commits.length,2);
    assert.ok(commits[0].p_document.socialSummary);
    assert.deepEqual(commits[1],{ p_expected_owner:owner,p_operation_id:operationId,p_base_revision:before.revision,p_document:document });
    assert.equal((await db.query<{ revision:number }>('select revision from public.cheesit_accounts where owner_id=$1',[owner])).rows[0].revision,before.revision+1,'receipt recovery never applies a second write');
    commits.length = 0;
    await assert.rejects(transport.apply({ ...op,document:{ ...document,data:{ ...document.data,routines:[] } } }), /La nube ha rechazado/);
    assert.equal(commits.length,2,'a mutated envelope is also rejected by the original receipt check');
    assert.deepEqual((await db.query<{data:unknown}>('select data from public.cheesit_accounts where owner_id=$1',[owner])).rows[0].data,document.data);
    commits.length = 0;
    forcedError = { code:'P0001',message:'other server validation' };
    await assert.rejects(transport.apply(op), /La nube ha rechazado/);
    assert.equal(commits.length,1,'other server errors never trigger the compatibility retry');
    forcedError = undefined;
    await client.auth.signOut({ scope:'local' });
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
    await db.close();
  }
});
