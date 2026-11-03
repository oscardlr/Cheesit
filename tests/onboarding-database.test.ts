import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { normalizeUsername, validateIdentity, validateInitialProfile } from '../src/lib/account-profile';

const profile = { weightKg: 81.5, heightCm: 181, age: 28, sex: 'male' };
test('username normalization and initial data validation', () => {
  assert.equal(normalizeUsername(' @Oscar.Garcia '), 'oscar.garcia');
  assert.equal(normalizeUsername('Oscar'), 'oscar');
  for (const name of ['@@oscar', 'álex', 'ab', 'a b', 'a'.repeat(31)]) assert.throws(() => validateIdentity('Nombre', name));
  validateIdentity('Óscar García', '@Oscar.Garcia');
  for (const invalid of [{ ...profile, age: 20.5 }, { ...profile, weightKg: 0 }, { ...profile, heightCm: NaN }, { ...profile, sex: '' }]) assert.throws(() => validateInitialProfile(invalid as typeof profile & { sex: 'male' }));
});

test('database reserves canonical usernames atomically, validates onboarding, isolates accounts and persists weight', async () => {
  const db = new PGlite();
  const a = crypto.randomUUID(), b = crypto.randomUUID(), old = crypto.randomUUID();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    await db.query('insert into auth.users(id) values ($1)', [old]);
    for (const file of ['202611020001_accounts.sql','20261102233213_personal_profiles.sql','20261103000502_account_onboarding.sql','20261103102339_onboarding_google_compatibility.sql']) await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
    const signup = (id: string, username: string) => db.query('insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3)', [id, `${id}@example.test`, { username, display_name: 'Óscar García' }]);
    const google = crypto.randomUUID();
    await db.query('insert into auth.users values ($1,$2,$3,$4)', [google, 'google@example.test', { full_name: 'Google Person' }, { provider: 'google' }]);
    assert.equal((await db.query('select * from public.cheesit_identities where owner_id=$1', [google])).rows.length, 0);
    await assert.rejects(db.query('insert into auth.users values ($1,$2,$3,$4)', [crypto.randomUUID(), 'spoof@example.test', { provider: 'google' }, { provider: 'email' }]), /valid username/);
    await signup(a, '@Oscar.Garcia');
    await assert.rejects(signup(b, 'OSCAR.GARCIA'), /unique/i);
    assert.equal((await db.query('select * from auth.users where id=$1',[b])).rows.length,0);
    await signup(b, 'other.person');
    assert.equal((await db.query<{ username: string }>('select username from public.cheesit_identities where owner_id=$1',[a])).rows[0].username,'oscar.garcia');
    async function as<T>(owner: string | null, fn: (tx: PGlite) => Promise<T>, role = 'authenticated') {
      return db.transaction(async tx => { await tx.exec(`set local role ${role}`); await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[owner ?? '']); return fn(tx as unknown as PGlite); });
    }
    async function complete(owner: string, data: unknown = profile, handle = 'oscar.garcia', expected = owner) {
      return as(owner, tx => tx.query<{ result: { completed_at: string } }>('select public.cheesit_complete_profile($1,$2,$3,$4) result',[expected,'Óscar García',handle,data]));
    }
    await assert.rejects(complete(a, { ...profile, age: 1 }), /invalid profile/);
    await assert.rejects(complete(a, { weightKg: 80 }), /profile required/);
    await assert.rejects(complete(a, profile, 'oscar.garcia', b), /authentication/);
    await assert.rejects(as(null, tx => tx.query('select public.cheesit_complete_profile($1,$2,$3,$4)',[a,'Name','user',profile]), 'anon'), /permission denied/);
    await assert.rejects(complete(google, profile, 'oscar.garcia'), /unique/i);
    assert.ok((await complete(google, profile, 'google.person')).rows[0].result.completed_at);
    assert.ok((await complete(a)).rows[0].result.completed_at);
    // Repeat after a lost response: the original physical profile is retained.
    await complete(a, { ...profile, weightKg: 99 });
    await complete(b, { ...profile, sex: 'female' }, 'other.person');
    await assert.rejects(as(b, tx => tx.query('update public.cheesit_identities set username=$1 where owner_id=$2',['oscar.garcia',b])),/permission denied/);
    assert.equal((await as(b, tx => tx.query('select * from public.cheesit_identities where owner_id=$1',[a]))).rows.length,0);
    assert.equal((await as(b, tx => tx.query('select * from public.cheesit_accounts where owner_id=$1',[a]))).rows.length,0);
    assert.equal((await as(null, tx => tx.query<{available:boolean}>('select public.cheesit_username_available($1) available',['@OSCAR.GARCIA']), 'anon')).rows[0].available,false);
    await assert.rejects(as(null, tx => tx.query('select * from public.cheesit_identities'), 'anon'),/permission denied/);
    const row = (await as(a, tx => tx.query<{ revision: number; data: Record<string, unknown> }>('select revision,data from public.cheesit_accounts'))).rows[0];
    assert.deepEqual(row.data.profile,profile);
    const updated = { ...row.data, profile: { ...profile, weightKg: 85 } };
    await as(a, tx => tx.query('select public.cheesit_commit_account($1,$2,$3,$4)',[a,crypto.randomUUID(),row.revision,{data:updated,tombstones:[],migrations:[]}]));
    const secondDevice = await as(a, tx => tx.query<{ data: typeof updated }>('select data from public.cheesit_accounts'));
    assert.equal(secondDevice.rows[0].data.profile.weightKg,85);
    // Existing accounts can claim an identifier without entering saved data again.
    await db.query('insert into public.cheesit_accounts(owner_id,revision,data) values($1,1,$2)',[old,{routines:[],workouts:[],customExercises:[],profile}]);
    await complete(old, null, 'legacy.person');
    assert.deepEqual((await as(old,tx=>tx.query<{data:{profile:unknown}}>('select data from public.cheesit_accounts'))).rows[0].data.profile,profile);
    assert.equal((await as(old, tx => tx.query<{username:string}>('select username from public.cheesit_identities'))).rows[0].username,'legacy.person');
  } finally { await db.close(); }
});
