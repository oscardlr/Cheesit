import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { blankDocument } from '../src/lib/remote/document';
import { recordBodyWeight, setWeightGoal } from '../src/lib/body-weight';
import { DEFAULT_PROFILE } from '../src/lib/strength';
import type { AppData } from '../src/lib/model';

test('PostgreSQL account commits preserve weight dates, personal goal and one-time XP through retries and corrections', async () => {
  const db = new PGlite(), owner = crypto.randomUUID();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    await db.query('insert into auth.users values ($1)', [owner]);
    await db.exec(readFileSync('supabase/migrations/202611020001_accounts.sql', 'utf8'));
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    const profile = recordBodyWeight(setWeightGoal(DEFAULT_PROFILE, 80), { date: '2026-11-01', weightKg: 72 }, '2026-11-04');
    const document = { ...blankDocument(), data: { ...blankDocument().data, profile } }, operation = crypto.randomUUID();
    const commit = async (op: string, revision: number, doc: typeof document) => (await db.query<{ result: { status: string; snapshot: { data: AppData; revision: number } } }>('select public.cheesit_commit_account($1,$2,$3,$4::jsonb) result', [owner, op, revision, JSON.stringify(doc)])).rows[0].result;
    const first = await commit(operation, 0, document);
    assert.equal(first.status, 'applied');
    assert.deepEqual(first.snapshot.data.profile, profile);
    assert.deepEqual(await commit(operation, 0, document), first);
    const correction = recordBodyWeight(profile, { date: '2026-11-01', weightKg: 73 }, '2026-11-04');
    const second = await commit(crypto.randomUUID(), 1, { ...document, data: { ...document.data, profile: correction } });
    assert.equal(second.snapshot.data.profile?.weightKg, 73);
    assert.deepEqual(second.snapshot.data.profile?.weightTracking?.rewards, [{ date: '2026-11-01', xp: 200 }]);
    assert.equal(second.snapshot.data.profile?.weightTracking?.goalKg, 80);
  } finally { await db.close(); }
});
