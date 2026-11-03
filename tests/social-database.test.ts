import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { validSocialQuery } from '../src/lib/remote/social';

export const SOCIAL_MIGRATION = '20261103140756_social_follows.sql';
test('social search accepts canonical prefixes without SQL wildcard characters', () => {
  for (const q of ['@OSCAR', ' Oscar.G ', '_person', 'a']) assert.ok(validSocialQuery(q));
  for (const q of ['', '@', 'a%', '@@a', 'a b', 'álex']) assert.equal(validSocialQuery(q), false);
});

test('social projection, directed follows and RLS isolate private accounts across users', async () => {
  const db = new PGlite();
  const a = crypto.randomUUID(), b = crypto.randomUUID(), incomplete = crypto.randomUUID();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    for (const file of ['202611020001_accounts.sql', '20261102233213_personal_profiles.sql', '20261103000502_account_onboarding.sql']) await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
    async function as<T>(id: string | null, fn: (tx: PGlite) => Promise<T>, role = 'authenticated') {
      return db.transaction(async tx => {
        await tx.exec(`set local role ${role}`);
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [id ?? '']);
        return fn(tx as unknown as PGlite);
      });
    }
    const signup = (id: string, username: string) => db.query('insert into auth.users values($1,$2,$3)', [id, `${id}@private.test`, { username, display_name: username }]);
    const complete = (id: string, username: string) => as(id, tx => tx.query('select public.cheesit_complete_profile($1,$2,$3,$4)', [id, username, username, { weightKg: 77, heightCm: 181, age: 30, sex: 'male' }]));
    await signup(a, 'anna_one'); await signup(b, 'beto.two'); await signup(incomplete, 'anna_incomplete');
    await complete(a, 'anna_one');
    const before = (await db.query('select * from public.cheesit_accounts order by owner_id')).rows;
    await db.exec(readFileSync(`supabase/migrations/${SOCIAL_MIGRATION}`, 'utf8'));
    assert.deepEqual((await db.query('select * from public.cheesit_accounts order by owner_id')).rows, before, 'migration cannot change private documents');
    assert.equal((await db.query('select * from public.cheesit_social_profiles')).rows.length, 1, 'only completed profiles backfilled');
    await complete(b, 'beto.two');
    const read = async (viewer: string | null, query = '', owner: string | null = null, list: string | null = null, offset = 0) =>
      (await as(viewer, tx => tx.query<{ result: Record<string, unknown>[] }>('select public.cheesit_read_social($1,$2,$3,$4) result', [query, owner, list, offset]))).rows[0].result;
    assert.equal((await read(b, ' @ANNA_ ')).length, 1);
    assert.equal((await read(b, 'anna%')).length, 0);
    assert.equal((await read(b, '')).length, 0);
    assert.equal((await read(b, '', incomplete)).length, 0);
    assert.equal((await read(null, 'a')).length, 0);
    assert.deepEqual(Object.keys((await read(b, '', a))[0]).sort(), ['owner_id', 'username', 'display_name', 'photo', 'bio', 'followers', 'following', 'is_following', 'follows_you'].sort());
    for (const table of ['cheesit_accounts', 'cheesit_identities', 'cheesit_account_receipts']) assert.equal((await as(b, tx => tx.query(`select * from public.${table} where owner_id=$1`, [a]))).rows.length, 0);
    for (const table of ['cheesit_social_profiles', 'cheesit_follows']) await assert.rejects(as(null, tx => tx.query(`select * from public.${table}`), 'anon'), /permission denied/);
    await assert.rejects(as(null, tx => tx.query("select public.cheesit_read_social('anna')"), 'anon'), /permission denied/);
    await assert.rejects(as(b, tx => tx.query("update public.cheesit_social_profiles set bio='spoofed' where owner_id=$1", [a])), /permission denied/);
    await assert.rejects(as(b, tx => tx.query('select cheesit_private.sync_social_profile()')), /permission denied/);
    const follow = (viewer: string, follower: string, followed: string) => as(viewer, tx => tx.query('insert into public.cheesit_follows(follower_id,followed_id) values($1,$2)', [follower, followed]));
    await assert.rejects(follow(b, a, b), /row-level security/);
    await assert.rejects(follow(a, a, a), /cheesit_no_self_follow/);
    await assert.rejects(follow(a, a, incomplete), /foreign key/);
    await assert.rejects(follow(incomplete, incomplete, a), /row-level security/);
    await follow(a, a, b);
    await assert.rejects(follow(a, a, b), /unique/);
    assert.equal((await read(a, '', b))[0].is_following, true);
    assert.equal((await read(a, '', b))[0].follows_you, false, 'follow is independent');
    assert.equal((await read(b, '', a))[0].follows_you, true);
    assert.equal((await read(a, '', b))[0].followers, 1);
    assert.deepEqual((await read(b, '', a, 'following')).map(p => p.owner_id), [b]);
    assert.deepEqual((await read(b, '', b, 'followers')).map(p => p.owner_id), [a]);
    assert.equal((await as(b, tx => tx.query('delete from public.cheesit_follows where follower_id=$1 returning *', [a]))).rows.length, 0);
    await assert.rejects(as(a, tx => tx.query('update public.cheesit_follows set follower_id=$1', [b])), /permission denied/);
    await follow(b, b, a);
    assert.equal((await read(a, '', b))[0].follows_you, true);
    // Exercise the existing account RPC; the projection changes atomically.
    const account = (await as(a, tx => tx.query<{ revision: number; data: Record<string, unknown> }>('select revision,data from public.cheesit_accounts'))).rows[0];
    const photo = 'data:image/jpeg;base64,/9j/AAAA';
    const next = { ...account.data, personalProfile: { displayName: 'Ana actualizada', bio: 'Biografía actualizada', photo } };
    await as(a, tx => tx.query('select public.cheesit_commit_account($1,$2,$3,$4)', [a, crypto.randomUUID(), account.revision, { data: next, tombstones: [], migrations: [] }]));
    const visible = (await read(b, '', a))[0];
    assert.equal(visible.display_name, 'Ana actualizada'); assert.equal(visible.photo, photo); assert.equal(visible.bio, 'Biografía actualizada');
    await as(a, tx => tx.query('delete from public.cheesit_follows where follower_id=$1 and followed_id=$2', [a, b]));
    assert.equal((await read(a, '', b))[0].followers, 0);
    assert.equal((await read(a, '', b))[0].follows_you, true, 'unfollow preserves reverse edge');
    // Literal underscore and pagination, not LIKE wildcards or truncated lists.
    for (let i = 0; i < 23; i++) {
      const id = crypto.randomUUID(), username = `anna_page_${String(i).padStart(2, '0')}`;
      await signup(id, username); await complete(id, username);
    }
    assert.equal((await read(b, 'ANNA_PAGE_')).length, 21);
    assert.equal((await read(b, 'anna_page_', null, null, 20)).length, 3);
    assert.equal((await read(b, 'annaX')).length, 0);
    await db.exec(readFileSync('supabase/tests/social_readonly.sql', 'utf8'));
    const beforePermissions = (await db.query('select * from public.cheesit_accounts order by owner_id')).rows;
    await db.exec(readFileSync('supabase/tests/social_permissions.sql', 'utf8'));
    assert.deepEqual((await db.query('select * from public.cheesit_accounts order by owner_id')).rows, beforePermissions);
    await db.query('delete from auth.users where id=$1', [a]);
    assert.equal((await read(b, '', a)).length, 0);
    assert.equal((await read(b, '', b))[0].following, 0, 'deleting account cascades follows');
  } finally { await db.close(); }
});
