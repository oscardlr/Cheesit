import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { EMPTY_PERSONAL_PROFILE, isPersonalProfile, isProfilePhoto, recentProfileWorkouts } from '../src/lib/personal-profile';
import { blankDocument, mergeDocuments } from '../src/lib/remote/document';
import { createBackup, previewBackup, validateData } from '../src/lib/backup';
import { emptyData, newWorkout, type AppData } from '../src/lib/model';
import { totals } from '../src/lib/metrics';

const photo = 'data:image/jpeg;base64,/9j/2Q==';
const identity = { displayName: 'Álex', bio: 'Una serie cada vez. 🧀', photo };

test('personal profile validation, real activity, backups and independent conflict-safe merges', () => {
  assert.equal(isPersonalProfile(EMPTY_PERSONAL_PROFILE), true);
  assert.equal(isProfilePhoto(photo), true);
  for (const bad of [null, {}, { ...identity, photo: 'https://example.com/me.jpg' }, { ...identity, photo: 'data:image/svg+xml;base64,PHN2Zz4=' }, { ...identity, photo: 'data:image/jpeg;base64,/9j/=' }, { ...identity, photo: 'data:image/jpeg;base64,/9j/' + 'a'.repeat(262144) }, { ...identity, bio: 'a'.repeat(301) }, { ...identity, displayName: 'a'.repeat(81) }, { ...identity, ownerId: 'someone-else' }]) {
    assert.equal(isPersonalProfile(bad), false);
    assert.throws(() => validateData({ ...emptyData(), personalProfile: bad }), /perfil personal/);
  }
  const base = blankDocument();
  const training = newWorkout();
  const local = { ...base, data: { ...base.data, personalProfile: identity } };
  const remote = { ...base, data: { ...base.data, workouts: [training] } };
  const compatible = mergeDocuments(base, local, remote);
  assert.equal(compatible.unresolved.length, 0);
  assert.deepEqual(compatible.document.data.personalProfile, identity);
  assert.deepEqual(compatible.document.data.workouts, [training]);
  const divergent = { ...base, data: { ...base.data, personalProfile: { ...identity, displayName: 'Sam' } } };
  assert.equal(mergeDocuments(base, local, divergent).unresolved[0].key, 'personalProfile');
  assert.deepEqual(mergeDocuments(base, local, divergent, { personalProfile: 'local' }).document.data.personalProfile, identity);
  const removed = { ...local, data: { ...local.data, personalProfile: { ...identity, photo: null } } };
  assert.equal(mergeDocuments(local, removed, local).document.data.personalProfile?.photo, null);
  const imported = previewBackup(createBackup(local.data), emptyData());
  assert.deepEqual(imported.merged.personalProfile, identity);
  const conflict = previewBackup(createBackup(divergent.data), local.data);
  assert.equal(conflict.conflictDetails[0].kind, 'personalProfile');
  assert.deepEqual(previewBackup(createBackup(divergent.data), local.data, { 'personalProfile:identity': 'incoming' }).merged.personalProfile, divergent.data.personalProfile);
  // An old backup must never remove a newer profile, including a removed photo.
  assert.deepEqual(previewBackup(createBackup(emptyData()), removed.data).merged.personalProfile, removed.data.personalProfile);
  const old = { ...training, id: crypto.randomUUID(), status: 'finished' as const, date: '2026-01-01' };
  const latest = { ...old, id: crypto.randomUUID(), date: '2026-02-01' };
  const deleted = { ...latest, id: crypto.randomUUID(), status: 'deleted' as const };
  const all = [old, deleted, training, latest];
  assert.deepEqual(recentProfileWorkouts(all).map(w => w.id), [latest.id, old.id]);
  assert.deepEqual(all, [old, deleted, training, latest]);
  assert.equal(totals(all).workouts, 2);
  assert.equal(totals([]).sets, 0);
});

test('PostgreSQL: profiles persist privately; validation and photo removal are atomic through the existing account RPC', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    await db.exec(readFileSync('supabase/migrations/202611020001_accounts.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/20261102233213_personal_profiles.sql', 'utf8'));
    const a = crypto.randomUUID(), b = crypto.randomUUID();
    await db.query('insert into auth.users values ($1), ($2)', [a, b]);
    async function user(owner: string, role = 'authenticated') { await db.exec(`reset role; set role ${role}`); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]); }
    async function commit(owner: string, revision: number, data: unknown) { return (await db.query<{ result: { status: string; snapshot: { data: AppData } } }>('select public.cheesit_commit_account($1,$2,$3,$4::jsonb) result', [owner, crypto.randomUUID(), revision, JSON.stringify({ data, tombstones: [], migrations: [] })])).rows[0].result; }
    await user(a);
    const data = { ...emptyData(), personalProfile: identity };
    assert.deepEqual((await commit(a, 0, data)).snapshot.data, data);
    // A separately authenticated reader sees exactly the committed identity.
    await user(b); await commit(b, 0, emptyData());
    assert.equal((await db.query('select data from public.cheesit_accounts where owner_id=$1', [a])).rows.length, 0);
    await assert.rejects(commit(a, 1, data), /authentication required or account changed/);
    await user(a);
    assert.deepEqual((await db.query<{ data: AppData }>('select data from public.cheesit_accounts where owner_id=$1', [a])).rows[0].data, data);
    for (const personalProfile of [{ ...identity, bio: 'x'.repeat(301) }, { ...identity, displayName: 'x'.repeat(81) }, { ...identity, photo: 'https://example.com/photo.jpg' }, { ...identity, photo: false }, { ...identity, photo: 'data:image/jpeg;base64,/9j/=' }, { displayName: '', bio: '' }, null]) {
      await assert.rejects(commit(a, 1, { ...data, personalProfile }), /invalid personal profile/);
    }
    assert.equal((await db.query<{ revision: number }>('select revision from public.cheesit_accounts')).rows[0].revision, 1);
    const removed = { ...data, personalProfile: { ...identity, photo: null } };
    assert.deepEqual((await commit(a, 1, removed)).snapshot.data, removed);
    assert.equal((await commit(a, 1, data)).status, 'conflict');
    await assert.rejects(db.query('update public.cheesit_accounts set data=$1::jsonb', [JSON.stringify(data)]), /permission denied/);
    await user('', 'anon');
    await assert.rejects(db.query('select data from public.cheesit_accounts'), /permission denied/);
    await assert.rejects(commit(a, 2, data), /permission denied/);
  } finally { await db.close(); }
});
