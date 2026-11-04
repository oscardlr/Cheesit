import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { CATALOG } from '../src/lib/catalog';
import { emptyData, exerciseSnapshot, newId, newSet, newWorkout } from '../src/lib/model';
import { normalizeGame } from '../src/lib/game';
import { observeWeeklyGoal, recoverMoments, snapshotAppearance } from '../src/lib/training-features';

test('PostgreSQL accepts legacy and new optional metadata, rejects malformed fields, keeps album private and all grants unchanged', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    for (const file of ['202611020001_accounts.sql','20261102233213_personal_profiles.sql','20261103000502_account_onboarding.sql','20261103140756_social_follows.sql','20261103194247_social_activity_notifications.sql']) await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
    const grants = (await db.query("select proacl from pg_proc where oid='public.cheesit_validate_data(jsonb)'::regprocedure")).rows;
    await db.exec(readFileSync('supabase/migrations/20261104150621_training_moments_cycles.sql', 'utf8'));
    assert.deepEqual((await db.query("select proacl from pg_proc where oid='public.cheesit_validate_data(jsonb)'::regprocedure")).rows, grants);
    await db.query('select public.cheesit_validate_data($1::jsonb)', [emptyData()]);
    const w = { ...newWorkout(), status: 'finished' as const, date: '2026-11-02', exercises: [{ id: newId(), ...exerciseSnapshot(CATALOG[0]), supersetId: newId(), sets: [{ ...newSet(), kind: 'warmup' as const, weight: 20, reps: 12, confirmed: true }] }] };
    const data = observeWeeklyGoal(recoverMoments({ ...emptyData(), game: normalizeGame(), workouts: [w] }), '2026-11-04');
    data.training!.moments.push({ id: 'private-proof', kind: 'level', date: '2026-11-04', title: 'Privado', description: 'No publicar', workoutIds: [w.id], appearance: snapshotAppearance(data) });
    data.training!.cycles.push({ id: newId(), name: 'ABC', routineIds: [], position: 0, completedWorkoutIds: [] });
    await db.query('select public.cheesit_validate_data($1::jsonb)', [data]);
    const sanitized = (await db.query<{ w: typeof w }>('select cheesit_private.social_workout($1::jsonb) w', [{ ...w, training: data.training, cycleLink: { cycleId: 'private', position: 0, routineId: 'private' } }])).rows[0].w;
    assert.equal(sanitized.exercises[0].sets[0].kind, 'warmup'); assert.equal(sanitized.exercises[0].supersetId, w.exercises[0].supersetId);
    assert.equal('training' in sanitized, false); assert.equal('cycleLink' in sanitized, false);
    for (const invalid of [
      { ...data, training: { ...data.training, moments: {} } },
      { ...data, training: { ...data.training, cycles: [{ ...data.training!.cycles[0], position: 2 }] } },
      { ...data, workouts: [{ ...w, exercises: [{ ...w.exercises[0], sets: [{ ...w.exercises[0].sets[0], kind: 'fake' }] }] }] },
      { ...data, training: { ...data.training, moments: [{ ...data.training!.moments[0], appearance: { ...snapshotAppearance(data), base: 'https://tracker.test/image.png' } }] } },
    ]) await assert.rejects(db.query('select public.cheesit_validate_data($1::jsonb)', [invalid]), /invalid/);
    // Real RPC: a valid old client omitting optional metadata cannot erase it.
    const owner = newId(); await db.query('insert into auth.users values($1,$2,$3)', [owner, 'training-private@example.test', {username:'training_private',display_name:'Privado'}]);
    await db.exec('set role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    let revision = (await db.query<{revision:number}>('select revision from public.cheesit_accounts where owner_id=$1', [owner])).rows[0].revision;
    const commit = async (document: unknown, op = newId()) => { const result = (await db.query<{result:{status:string;snapshot:{revision:number;data:typeof data}}}>('select public.cheesit_commit_account($1,$2,$3,$4::jsonb) result', [owner, op, revision, document])).rows[0].result; revision = result.snapshot.revision; return result; };
    data.training!.cycles[0].completedWorkoutIds = [w.id];
    const envelope = { data, tombstones: [], migrations: [] };
    await commit(envelope);
    const { training: _metadata, ...oldData } = data;
    const old = { ...envelope, data: oldData };
    const oldResult = await commit(old); assert.equal(oldResult.status, 'applied'); assert.deepEqual(oldResult.snapshot.data.training, data.training);
    const missing = structuredClone(envelope); missing.data.training!.moments = []; missing.data.training!.weeklyGoals = []; missing.data.training!.cycles[0].completedWorkoutIds = [];
    const preserved = await commit(missing); assert.deepEqual(preserved.snapshot.data.training, data.training);
    const changed = structuredClone(envelope); changed.data.training!.moments[0].description = 'Altered captured snapshot';
    await assert.rejects(commit(changed), /captured moment is immutable/);
    const deleted = structuredClone(envelope); deleted.data.training!.cycles = [];
    assert.equal((await commit(deleted)).snapshot.data.training!.cycles.length, 0);
    const reset = { data: { ...emptyData(), game: normalizeGame() }, tombstones: [`workouts:${w.id}`], migrations: [`account-reset:${newId()}`] };
    assert.equal((await commit(reset)).snapshot.data.training, undefined);
    await db.exec('reset role; set role anon'); await assert.rejects(db.query('select public.cheesit_validate_data($1::jsonb)', [data]), /permission denied/);
    await db.exec('reset role; set role authenticated'); await assert.rejects(db.query('select cheesit_private.validate_training_metadata($1::jsonb)', [data]), /permission denied/);
  } finally { await db.close(); }
});
