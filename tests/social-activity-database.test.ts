import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { emptyData, newWorkout, newSet, exerciseSnapshot, type AppData, type Workout } from '../src/lib/model';
import { CATALOG } from '../src/lib/catalog';
import { socialActivitySummary } from '../src/lib/social-activity';
import { gameProgress, normalizeGame } from '../src/lib/game';
import { currentSeasons } from '../src/lib/seasons';

const migration = '20261103194247_social_activity_notifications.sql';
test('social activity summary matches owner progression without publishing physical or game data', () => {
  const data: AppData = { ...emptyData(), profile: { weightKg: 92, heightCm: 185, age: 40, sex: 'male' }, workouts: [{ ...newWorkout(), status: 'finished', exercises: [{ id: crypto.randomUUID(), ...exerciseSnapshot(CATALOG[0]), sets: [{ ...newSet(), weight: 65, reps: 10, confirmed: true }] }] }] };
  const summary = socialActivitySummary(data);
  assert.equal(summary.workouts, 1); assert.equal(summary.sets, 1);
  assert.equal(summary.seasons[currentSeasons().year], gameProgress(normalizeGame(data.game), data.workouts, data.profile).xp);
  assert.equal('profile' in summary, false); assert.equal('game' in summary, false);
});

test('shared activity, publication notifications, persistent reading, revocation and RLS across accounts', async () => {
  const db = new PGlite();
  const a = crypto.randomUUID(), b = crypto.randomUUID(), c = crypto.randomUUID();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    for (const file of ['202611020001_accounts.sql','20261102233213_personal_profiles.sql','20261103000502_account_onboarding.sql','20261103140756_social_follows.sql']) await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
    async function as<T>(id: string | null, fn: (tx: PGlite) => Promise<T>, role = 'authenticated') {
      return db.transaction(async tx => { await tx.exec(`set local role ${role}`); await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [id ?? '']); return fn(tx as unknown as PGlite); });
    }
    for (const [id, name] of [[a,'pedro'],[b,'ana'],[c,'cora']]) {
      await db.query('insert into auth.users values($1,$2,$3)', [id, `${name}@private.test`, { username: name, display_name: name }]);
      await as(id, tx => tx.query('select public.cheesit_complete_profile($1,$2,$3,$4)', [id,name,name,{ weightKg: 80, heightCm: 180, age: 30, sex: 'male' }]));
    }
    const history = { ...newWorkout(), name: 'Histórico', status: 'finished' as const, exercises: [{ id: crypto.randomUUID(), ...exerciseSnapshot(CATALOG[0]), sets: [{ ...newSet(), weight: 40, reps: 10, confirmed: true, rpe: 8, rir: 2 }] }] };
    const commit = async (owner: string, data: AppData, withSummary = true, op = crypto.randomUUID()) => as(owner, async tx => {
      const { rows: [account] } = await tx.query<{ revision: number }>('select revision from public.cheesit_accounts where owner_id=$1', [owner]);
      const document = { data, tombstones: data.workouts.filter(w => w.status === 'deleted').map(w => `workouts:${w.id}`), migrations: [], ...(withSummary ? { socialSummary: socialActivitySummary(data) } : {}) };
      return (await tx.query<{result:unknown}>('select public.cheesit_commit_account($1,$2,$3,$4) result', [owner,op,account.revision,document])).rows[0].result;
    });
    const data: AppData = { ...emptyData(), workouts: [history], personalProfile: { displayName: 'Pedro', photo: null, bio: '' }, profile: { weightKg: 80, heightCm: 180, age: 30, sex: 'male' } };
    await commit(a,data,false);
    const before = (await db.query('select data from public.cheesit_accounts order by owner_id')).rows;
    await db.exec(readFileSync(`supabase/migrations/${migration}`, 'utf8'));
    assert.deepEqual((await db.query('select data from public.cheesit_accounts order by owner_id')).rows, before);
    const activity = async (viewer: string, author = a, workout: string | null = null, offset = 0) => (await as(viewer, tx => tx.query<{ result: { shared: boolean; summary: unknown; workouts: typeof history[] } }>('select public.cheesit_read_activity($1,$2,$3) result', [author,workout,offset]))).rows[0].result;
    const notifications = async (viewer: string, before: string | null = null, beforeId: string | null = null) => (await as(viewer, tx => tx.query<{ result: { unread: number; items: {id:string;kind:string;actor_id:string;workout_id:string;workout_label:string|null;read_at:string|null;created_at:string}[] } }>('select public.cheesit_read_notifications($1,$2) result', [before,beforeId]))).rows[0].result;
    const share = (viewer: string, shared: boolean, author = viewer) => as(viewer, tx => tx.query('update public.cheesit_social_profiles set activity_shared=$1 where owner_id=$2 returning *', [shared,author]));
    assert.equal((await activity(b)).shared, false); assert.deepEqual((await activity(b)).workouts, []); assert.equal((await activity(b)).summary, null);
    assert.equal((await notifications(b)).items.length, 0, 'backfill emits nothing');
    assert.equal((await share(b,true,a)).rows.length,0);
    await assert.rejects(as(b, tx => tx.query("update public.cheesit_social_profiles set display_name='spoofed' where owner_id=$1", [a])), /permission denied/);
    await db.exec(readFileSync('supabase/tests/social_activity_readonly.sql','utf8'));
    await share(a,true); await commit(a,data);
    assert.equal((await activity(b)).workouts[0].name,'Histórico');
    assert.deepEqual((await activity(b)).summary,socialActivitySummary(data));
    const serialized=JSON.stringify(await activity(b));
    for (const field of ['weightKg','heightCm','email','profile','game','restTimer']) assert.equal(serialized.includes(`"${field}"`),false,field);
    assert.equal((await activity(b)).workouts[0].exercises[0].sets[0].rpe,8);
    const follow = (viewer:string, author:string) => as(viewer, tx => tx.query('insert into public.cheesit_follows(follower_id,followed_id) values($1,$2)',[viewer,author]));
    await follow(b,a);
    assert.equal((await notifications(a)).items[0].kind,'follow'); assert.equal((await notifications(a)).unread,1);
    await as(b, tx => tx.query('delete from public.cheesit_follows where follower_id=$1 and followed_id=$2',[b,a])); await follow(b,a);
    assert.equal((await notifications(a)).items.length,1,'refollow never duplicates the same notification');
    assert.equal((await notifications(b)).items.length,0);
    const draft: Workout = { ...history, id: crypto.randomUUID(), status:'draft' as const, name:'Pecho y tríceps', exercises: history.exercises.map(e=>({...e,id:crypto.randomUUID(),sets:e.sets.map(s=>({...s,id:crypto.randomUUID()}))})) };
    data.workouts.push(draft); await commit(a,data);
    assert.equal((await notifications(b)).items.length,0,'drafts do not notify');
    draft.status='finished'; await commit(a,data);
    let feed=await notifications(b); assert.equal(feed.unread,1); assert.equal(feed.items[0].workout_id,draft.id);
    assert.equal(feed.items[0].actor_id,a); assert.ok(feed.items[0].workout_label);
    await commit(a,data); draft.name='Editado'; await commit(a,data);
    assert.equal((await notifications(b)).items.length,1,'edits and repeated saves do not notify');
    await follow(c,a); await commit(a,data);
    assert.equal((await notifications(c)).items.length,0,'late followers do not receive old sessions');
    await as(c, tx => tx.query('select public.cheesit_mark_notifications($1)',[feed.items[0].id]));
    assert.equal((await notifications(b)).unread,1,'other accounts cannot mark receipts');
    await as(b, tx => tx.query('select public.cheesit_mark_notifications($1)',[feed.items[0].id]));
    assert.equal((await notifications(b)).unread,0); assert.ok((await notifications(b)).items[0].read_at);
    await share(a,false);
    assert.equal((await activity(b,a,draft.id)).workouts.length,0);
    assert.equal((await notifications(b)).items[0].workout_label,null,'revoked workout names do not leak');
    const privateSession={...draft,id:crypto.randomUUID(),exercises:draft.exercises.map(e=>({...e,id:crypto.randomUUID(),sets:e.sets.map(s=>({...s,id:crypto.randomUUID()}))}))};
    data.workouts.push(privateSession); await commit(a,data); await share(a,true); await commit(a,data);
    assert.equal((await notifications(b)).items.length,1,'sharing/editing old private sessions emits nothing');
    data.workouts[1]={...data.workouts[1],status:'deleted'}; await commit(a,data);
    assert.equal((await activity(b,a,draft.id)).workouts.length,0); assert.equal((await notifications(b)).items[0].workout_label,null);
    await commit(a,data,false); assert.equal((await activity(b)).summary,null,'older clients invalidate stale summary');
    for(const table of ['cheesit_social_activity','cheesit_social_workouts','cheesit_notifications']) {
      await assert.rejects(as(null,tx=>tx.query(`select * from public.${table}`),'anon'),/permission denied/);
      await assert.rejects(as(b,tx=>tx.query(`delete from public.${table}`)),/permission denied/);
    }
    assert.equal((await as(a,tx=>tx.query('select * from public.cheesit_notifications where recipient_id=$1',[b]))).rows.length,0);
    await assert.rejects(as(b,tx=>tx.query('update public.cheesit_notifications set actor_id=$1',[c])),/permission denied/);
    await assert.rejects(as(b,tx=>tx.query('select cheesit_private.notify_follow()')),/permission denied/);
    await as(a,tx=>tx.query('select public.cheesit_mark_notifications(null)'));
    assert.equal((await notifications(a)).unread,0);
    // Real keyset pagination: equal timestamps still produce complete, unique pages.
    await db.query(`insert into public.cheesit_notifications(recipient_id,actor_id,kind,event_key,created_at)
      select $1,$2,'follow','page:'||g,'2026-11-03T12:00:00Z' from generate_series(1,24) g`,[b,c]);
    feed=await notifications(b); const first=feed.items.slice(0,20), last=first.at(-1)!;
    const next=(await notifications(b,last.created_at,last.id)).items;
    assert.equal(new Set([...first,...next].map(n=>n.id)).size,25);
    await db.query('delete from auth.users where id=$1',[a]);
    assert.equal((await notifications(b)).items.every(n=>n.actor_id!==a),true);
  } finally { await db.close(); }
});
