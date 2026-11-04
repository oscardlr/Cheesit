import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { isPersonalProfile } from '../src/lib/personal-profile';
import { emptyData, type AppData } from '../src/lib/model';
import { createBackup, previewBackup, validateData } from '../src/lib/backup';
import { blankDocument, mergeDocuments } from '../src/lib/remote/document';

const identity = { displayName: 'Atleta', bio: 'Cada rep cuenta.', photo: null };
const gymMigration = '20261104192654_profile_gym.sql';

test('gym is optional, bounded text and survives account merges, profile edits and backups', () => {
  assert.equal(isPersonalProfile(identity), true);
  for (const gym of ['', 'Gimnasio Central · Madrid', 'x'.repeat(100)]) {
    const profile = { ...identity, gym };
    assert.equal(isPersonalProfile(profile), true);
    const data = { ...emptyData(), personalProfile: profile };
    assert.deepEqual(validateData(data).personalProfile, profile);
    assert.deepEqual(previewBackup(createBackup(data), emptyData()).merged.personalProfile, profile);
    const base = blankDocument();
    const merged = mergeDocuments(base, { ...base, data }, base);
    assert.equal(merged.document.data.personalProfile?.gym, gym);
    assert.equal(isPersonalProfile({ ...profile, bio: 'Biografía editada' }), true);
  }
  for (const gym of [null, 123, false, {}, [], 'x'.repeat(101)]) {
    assert.equal(isPersonalProfile({ ...identity, gym }), false);
    assert.throws(() => validateData({ ...emptyData(), personalProfile: { ...identity, gym } }), /perfil personal/);
  }
});

test('gym commits atomically to the account and social projection, preserving RLS and legacy documents', async () => {
  const db = new PGlite();
  const a = crypto.randomUUID(), b = crypto.randomUUID();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated,anon;
      grant select,insert,delete on storage.objects to authenticated;`);
    for (const file of ['202611020001_accounts.sql', '20261102233213_personal_profiles.sql', '20261103000502_account_onboarding.sql', '20261103140756_social_follows.sql', '20261103194247_social_activity_notifications.sql', '20261104154031_training_moments_cycles.sql', '20261104192629_workout_feed.sql', '20261104192645_workout_publication_caption.sql']) {
      await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
    }
    const as = async <T>(viewer: string | null, operation: (tx: PGlite) => Promise<T>, role = 'authenticated') => db.transaction(async tx => {
      await tx.exec(`set local role ${role}`);
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [viewer ?? '']);
      return operation(tx as unknown as PGlite);
    });
    for (const [id, username] of [[a, 'gym_author'], [b, 'gym_reader']]) {
      await db.query('insert into auth.users values($1,$2,$3)', [id, `${username}@test.invalid`, { username, display_name: username }]);
      await as(id, tx => tx.query('select public.cheesit_complete_profile($1,$2,$3,$4)', [id,username,username,{weightKg:80,heightCm:180,age:30,sex:'male'}]));
    }
    const snapshot = async (owner: string) => (await db.query<{ revision: number; data: AppData }>('select revision,data from public.cheesit_accounts where owner_id=$1', [owner])).rows[0];
    const before = (await db.query('select owner_id,revision,data from public.cheesit_accounts order by owner_id')).rows;
    await db.exec(readFileSync(`supabase/migrations/${gymMigration}`, 'utf8'));
    assert.deepEqual((await db.query('select owner_id,revision,data from public.cheesit_accounts order by owner_id')).rows, before, 'migration never rewrites private account documents');
    const social = async (viewer = b) => (await as(viewer, tx => tx.query<{ result: { gym: string | null; bio: string; activity_shared: boolean }[] }>('select public.cheesit_read_social($1,$2,$3,$4) result', ['',a,null,0]))).rows[0].result[0];
    assert.equal((await social()).gym, null, 'legacy documents without a gym remain valid');
    async function commit(viewer: string, owner: string, revision: number, data: unknown) {
      return (await as(viewer, tx => tx.query<{ result: { status: string } }>('select public.cheesit_commit_account($1,$2,$3,$4) result', [owner,crypto.randomUUID(),revision,{data,tombstones:[],migrations:[]}]))).rows[0].result;
    }
    let state = await snapshot(a);
    let data = { ...state.data, personalProfile: { ...identity, gym: 'Gimnasio Central · Madrid' } };
    assert.equal((await commit(a,a,state.revision,data)).status, 'applied');
    assert.equal((await snapshot(a)).data.personalProfile?.gym, data.personalProfile.gym);
    assert.equal((await social()).gym, data.personalProfile.gym);
    assert.equal((await social()).bio, identity.bio);
    assert.equal((await commit(a,a,state.revision,{...data,personalProfile:{...data.personalProfile,gym:'Respuesta obsoleta'}})).status, 'conflict');
    state = await snapshot(a);
    for (const gym of [null, 4, 'x'.repeat(101)]) await assert.rejects(commit(a,a,state.revision,{ ...data,personalProfile:{...identity,gym} }), /invalid personal profile/);
    assert.equal((await snapshot(a)).revision, state.revision, 'rejected gyms never advance account revision');
    assert.equal((await social()).gym, data.personalProfile.gym, 'rejected writes never alter the social projection');
    await assert.rejects(commit(b,a,state.revision,data), /authentication required or account changed/);
    await assert.rejects(as(a, tx => tx.query('update public.cheesit_social_profiles set gym=$1 where owner_id=$2', ['spoofed',a])), /permission denied/);
    assert.equal((await as(b, tx => tx.query('select data from public.cheesit_accounts where owner_id=$1', [a]))).rows.length, 0);
    await assert.rejects(as(null, tx => tx.query('select gym from public.cheesit_social_profiles'), 'anon'), /permission denied/);
    await assert.rejects(as(null, tx => tx.query('select public.cheesit_read_social($1,$2)', ['',a]), 'anon'), /permission denied/);
    await as(a, tx => tx.query('update public.cheesit_social_profiles set activity_shared=false where owner_id=$1', [a]));
    assert.equal((await social()).gym, data.personalProfile.gym, 'gym shares the authorized name/bio visibility and never makes private workouts public');
    assert.equal((await social()).activity_shared, false);
    data = { ...data,personalProfile:{...identity,gym:''} };
    assert.equal((await commit(a,a,state.revision,data)).status,'applied');
    assert.equal((await social()).gym,'');
    state = await snapshot(a);
    assert.equal((await commit(a,a,state.revision,{...data,personalProfile:identity})).status,'applied');
    assert.equal((await social()).gym,null,'old clients without the optional field remain compatible');
  } finally { await db.close(); }
});
