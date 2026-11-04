import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { emptyData, exerciseSnapshot, newSet, newWorkout, type AppData, type Workout } from '../src/lib/model';
import { CATALOG } from '../src/lib/catalog';
import { socialActivitySummary } from '../src/lib/social-activity';
import type { CommentPage, FeedPage } from '../src/lib/remote/feed';

const migration = '20261104192629_workout_feed.sql';
const captionMigration = '20261104192645_workout_publication_caption.sql';
test('workout feed persists per-post privacy, reactions, comments and storage RLS with stable server pagination', async () => {
  const db = new PGlite();
  const a = crypto.randomUUID(), b = crypto.randomUUID(), c = crypto.randomUUID(), fresh = crypto.randomUUID(), onboarding = crypto.randomUUID();
  const profile = { weightKg: 80, heightCm: 180, age: 30, sex: 'male' as const };
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
    for (const file of ['202611020001_accounts.sql','20261102233213_personal_profiles.sql','20261103000502_account_onboarding.sql','20261103140756_social_follows.sql','20261103194247_social_activity_notifications.sql']) {
      await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
    }
    const as = async <T>(owner: string | null, fn: (tx: PGlite) => Promise<T>, role = 'authenticated') => db.transaction(async tx => {
      await tx.exec(`set local role ${role}`);
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [owner ?? '']);
      return fn(tx as unknown as PGlite);
    });
    async function account(owner: string, name: string) {
      await db.query('insert into auth.users values($1,$2,$3)', [owner, `${name}@private.test`, { username: name, display_name: name }]);
      await as(owner, tx => tx.query('select public.cheesit_complete_profile($1,$2,$3,$4)', [owner,name,name,profile]));
    }
    async function commit(owner: string, data: AppData) {
      return as(owner, async tx => {
        const { rows: [row] } = await tx.query<{ revision: number }>('select revision from public.cheesit_accounts where owner_id=$1', [owner]);
        const document = { data, socialSummary: socialActivitySummary(data), tombstones: data.workouts.filter(w => w.status === 'deleted').map(w => `workouts:${w.id}`), migrations: [] };
        return (await tx.query<{ result: { status: string } }>('select public.cheesit_commit_account($1,$2,$3,$4) result', [owner,crypto.randomUUID(),row.revision,document])).rows[0].result;
      });
    }
    const workout = (name: string, published?: boolean): Workout => ({ ...newWorkout(), name, status: 'finished',
      ...(published === undefined ? {} : { publication: { published } }),
      notes: 'THIS IS A PRIVATE WORKOUT NOTE',
      exercises: [{ id: crypto.randomUUID(), ...exerciseSnapshot(CATALOG[0]), notes: 'PRIVATE EXERCISE NOTE',
        sets: [{ ...newSet(), weight: 40, reps: 10, confirmed: true, rpe: 8, rir: 2 }] }],
    });
    const feed = async (viewer: string, owner: string | null = null, id: string | null = null, cursor?: FeedPage['next']): Promise<FeedPage> =>
      (await as(viewer, tx => tx.query<{ result: FeedPage }>('select public.cheesit_read_feed($1,$2,$3,$4) result', [owner,id,cursor?.created_at ?? null,cursor?.id ?? null]))).rows[0].result;
    const comments = async (viewer: string, owner: string, id: string, cursor?: CommentPage['next']): Promise<CommentPage> =>
      (await as(viewer, tx => tx.query<{ result: CommentPage }>('select public.cheesit_read_post_comments($1,$2,$3,$4) result', [owner,id,cursor?.created_at ?? null,cursor?.id ?? null]))).rows[0].result;
    const privacy = (viewer: string, shared: boolean, owner = viewer) => as(viewer, tx => tx.query('update public.cheesit_social_profiles set activity_shared=$1 where owner_id=$2 returning owner_id', [shared,owner]));
    const photoRows = (viewer: string, path: string) => as(viewer, tx => tx.query('select name from storage.objects where bucket_id=$1 and name=$2', ['workout-photos',path]));
    await account(a,'pedro'); await account(b,'ana'); await account(c,'cora');
    const history = workout('Histórico privado');
    const data: AppData = { ...emptyData(), profile, personalProfile: { displayName: 'Pedro', photo: null, bio: '' }, workouts: [history] };
    await commit(a,data);
    assert.equal((await db.query<{summary:{workouts:number}}>('select summary from public.cheesit_social_activity where owner_id=$1',[a])).rows[0].summary.workouts,1,'legacy projection previously held all workout totals');
    const before = (await db.query('select data from public.cheesit_accounts order by owner_id')).rows;
    const fullAccountsBefore=(await db.query('select to_jsonb(a) payload from public.cheesit_accounts a order by owner_id')).rows;
    const oldWorkoutRows=(await db.query<{owner_id:string;workout_id:string;payload:unknown}>('select owner_id,workout_id,to_jsonb(w) payload from public.cheesit_social_workouts w order by owner_id,workout_id')).rows;
    const oldActivityRows=(await db.query<{owner_id:string;payload:unknown}>('select owner_id,to_jsonb(a) payload from public.cheesit_social_activity a order by owner_id')).rows;
    const migrationSql=readFileSync(`supabase/migrations/${migration}`,'utf8');
    // An interrupted rollout must roll back the full migration, including
    // snapshots, schema, sanitization and public summaries, without data loss.
    await assert.rejects(db.transaction(async tx=>{
      await tx.exec(migrationSql);
      assert.equal((await tx.query<{count:number}>('select count(*)::int count from cheesit_private.social_projection_archive')).rows[0].count,oldWorkoutRows.length+oldActivityRows.length);
      throw new Error('Simulated deployment rollback');
    }),/Simulated deployment rollback/);
    assert.equal((await db.query<{archive:string|null}>("select to_regclass('cheesit_private.social_projection_archive')::text archive")).rows[0].archive,null,'aborted migration leaves no partial archive/schema');
    assert.deepEqual((await db.query('select owner_id,workout_id,to_jsonb(w) payload from public.cheesit_social_workouts w order by owner_id,workout_id')).rows,oldWorkoutRows,'rollback preserves every original workout projection field');
    assert.deepEqual((await db.query('select owner_id,to_jsonb(a) payload from public.cheesit_social_activity a order by owner_id')).rows,oldActivityRows,'rollback preserves every original summary field');
    assert.deepEqual((await db.query('select data from public.cheesit_accounts order by owner_id')).rows,before);
    assert.deepEqual((await db.query('select to_jsonb(a) payload from public.cheesit_accounts a order by owner_id')).rows,fullAccountsBefore,'rollback preserves complete private accounts, revisions and ledgers');
    await db.transaction(tx=>tx.exec(migrationSql));
    for(const row of oldWorkoutRows) {
      const archived=(await db.query<{payload:unknown}>('select payload from cheesit_private.social_projection_archive where owner_id=$1 and kind=$2 and record_id=$3',[row.owner_id,'workout',row.workout_id])).rows[0].payload;
      assert.deepEqual(archived,row.payload,'complete original workout row, including private notes, is recoverable');
    }
    for(const row of oldActivityRows) {
      const archived=(await db.query<{payload:unknown}>('select payload from cheesit_private.social_projection_archive where owner_id=$1 and kind=$2 and record_id=$3',[row.owner_id,'activity','summary'])).rows[0].payload;
      assert.deepEqual(archived,row.payload,'complete original summary row is recoverable');
    }
    const archiveFlags=(await db.query<{rls:boolean;policies:number}>("select c.relrowsecurity rls,(select count(*)::int from pg_policy p where p.polrelid=c.oid) policies from pg_class c where c.oid='cheesit_private.social_projection_archive'::regclass")).rows[0];
    assert.equal(archiveFlags.rls,true);assert.equal(archiveFlags.policies,0,'archive is RLS-denied to all API callers');
    for(const [viewer,role] of [[a,'authenticated'],[b,'authenticated'],[null,'anon']] as const) {
      for(const statement of ['select * from cheesit_private.social_projection_archive',
        "insert into cheesit_private.social_projection_archive(owner_id,kind,record_id,payload) values('00000000-0000-4000-8000-000000000000','activity','fake','{}')",
        "update cheesit_private.social_projection_archive set payload='{}'",
        'delete from cheesit_private.social_projection_archive']) {
        await assert.rejects(as(viewer,tx=>tx.query(statement),role),/permission denied/);
      }
    }
    assert.equal((await db.query<{summary:unknown}>('select summary from public.cheesit_social_activity where owner_id=$1',[a])).rows[0].summary,null,'migration removes previously exposed private totals');
    assert.deepEqual((await db.query('select data from public.cheesit_accounts order by owner_id')).rows, before, 'migration does not rewrite private documents');
    assert.deepEqual((await db.query('select to_jsonb(a) payload from public.cheesit_accounts a order by owner_id')).rows,fullAccountsBefore,'successful rollout leaves every account field untouched');
    assert.equal((await db.query<{activity_shared:boolean}>('select activity_shared from public.cheesit_social_profiles where owner_id=$1',[a])).rows[0].activity_shared,false, 'existing private profile stays private');
    assert.equal((await db.query<{public:boolean}>('select public from storage.buckets where id=$1',['workout-photos'])).rows[0].public,false);
    await account(fresh,'nueva');
    assert.equal((await db.query<{activity_shared:boolean}>('select activity_shared from public.cheesit_social_profiles where owner_id=$1',[fresh])).rows[0].activity_shared,true,'new accounts default to public profile');
    // Real onboarding order: account CAS precedes identity completion. The
    // profile-insert trigger must derive posts without a repair write or a
    // spurious account revision, while legacy imported sessions stay hidden.
    await db.query('insert into auth.users values($1,$2,$3)',[onboarding,'importada@private.test',{username:'importada',display_name:'Importada'}]);
    const importedPost=workout('Publicación importada',true), importedLegacy=workout('Histórico importado');
    const importedData: AppData={...emptyData(),profile,personalProfile:{displayName:'Importada',photo:null,bio:''},workouts:[importedPost,importedLegacy]};
    await commit(onboarding,importedData);
    assert.equal((await feed(b,onboarding)).items.length,0,'incomplete identity has no social projection');
    const beforeOnboarding=(await db.query<{revision:number}>('select revision from public.cheesit_accounts where owner_id=$1',[onboarding])).rows[0].revision;
    await as(onboarding,tx=>tx.query('select public.cheesit_complete_profile($1,$2,$3,$4)',[onboarding,'Importada','importada',profile]));
    const importedFeed=await feed(b,onboarding);
    assert.equal(importedFeed.items.length,1); assert.equal(importedFeed.items[0].workout_id,importedPost.id);
    assert.equal((await db.query<{revision:number}>('select revision from public.cheesit_accounts where owner_id=$1',[onboarding])).rows[0].revision,beforeOnboarding+1,'projection adds no extra account revision');
    assert.equal((await db.query<{summary:unknown}>('select summary from public.cheesit_social_activity where owner_id=$1',[onboarding])).rows[0].summary,null);
    const beforeCaptionUpgrade=(await db.query('select owner_id,revision,data from public.cheesit_accounts order by owner_id')).rows;
    await db.exec(readFileSync(`supabase/migrations/${captionMigration}`, 'utf8'));
    const upgradedPost=(await feed(b,onboarding)).items[0];
    assert.equal(upgradedPost.id,importedFeed.items[0].id,'caption migration preserves existing post IDs');
    assert.equal(upgradedPost.created_at,importedFeed.items[0].created_at,'caption migration preserves feed ordering');
    assert.equal(upgradedPost.caption,null,'existing publications have an optional empty caption');
    assert.deepEqual((await db.query('select owner_id,revision,data from public.cheesit_accounts order by owner_id')).rows,beforeCaptionUpgrade,'caption migration never rewrites account or training data');
    await privacy(onboarding,false);
    await privacy(a,true);
    assert.equal((await privacy(b,false,a)).rows.length,0,'another account cannot change privacy');
    assert.equal((await feed(b)).items.length,0,'legacy workouts are never published implicitly');
    const pub = workout('Nuevo público',true), privateWorkout = workout('Nuevo privado',false);
    const photo = `${a}/${pub.id}/${crypto.randomUUID()}.jpg`;
    const caption='Primera sesión 💪\n<img src=x onerror="alert(1)"> & "texto"';
    pub.publication = { published: true, photoPath: photo, caption };
    privateWorkout.publication={published:false,caption:'CAPTION PRIVADO NO VISIBLE'};
    await as(a,tx=>tx.query('insert into storage.objects(bucket_id,name) values($1,$2)',['workout-photos',photo]));
    assert.equal((await photoRows(a,photo)).rows.length,1);
    assert.equal((await photoRows(b,photo)).rows.length,0,'unpublished uploads cannot be downloaded by others');
    await assert.rejects(as(b,tx=>tx.query('insert into storage.objects(bucket_id,name) values($1,$2)',['workout-photos',photo])),/row-level security/);
    await as(b,tx=>tx.query('insert into public.cheesit_follows values($1,$2,now())',[b,a]));
    data.workouts.push(pub,privateWorkout);
    assert.equal((await commit(a,data)).status,'applied');
    let result = await feed(b);
    assert.equal(result.items.length,1); assert.equal(result.items[0].workout_id,pub.id); assert.equal(result.items[0].photo_path,photo);
    assert.equal(result.items[0].caption,caption,'caption is preserved as plain text, separately from notes');
    assert.equal(result.items[0].liked,false); assert.equal(result.items[0].likes,0); assert.equal(result.items[0].comments,0);
    assert.equal((await feed(b,a)).items.length,1,'profile uses exactly the same visibility');
    assert.equal((await feed(b,a)).items[0].caption,caption);
    assert.equal((await feed(b,a,pub.id)).items.length,1);
    assert.equal((await feed(b,a,pub.id)).items[0].caption,caption,'direct links receive the same publication caption');
    assert.equal((await feed(b,a,privateWorkout.id)).items.length,0);
    const legacyActivity=(await as(b,tx=>tx.query<{result:{summary:unknown;workouts:Workout[]}}>('select public.cheesit_read_activity($1,null,0) result',[a]))).rows[0].result;
    assert.equal(legacyActivity.summary,null,'legacy activity RPC never exposes totals of private sessions');
    assert.equal(legacyActivity.workouts.length,1);
    assert.equal(legacyActivity.workouts[0].id,pub.id);
    assert.equal(JSON.stringify(legacyActivity).includes(privateWorkout.name),false);
    assert.equal(JSON.stringify(legacyActivity).includes(history.name),false);
    assert.equal(JSON.stringify(legacyActivity).includes('PRIVATE'),false);
    assert.equal(JSON.stringify(result).includes('CAPTION PRIVADO'),false);
    assert.equal('caption' in result.items[0].workout,false,'caption does not leak into the private-notes/detail structure');
    assert.equal((await db.query<{caption:string}>('select caption from public.cheesit_social_workouts where owner_id=$1 and workout_id=$2',[a,pub.id])).rows[0].caption,caption);
    const timestamp=result.items[0].created_at;
    pub.publication.caption='Descripción editada sin cambiar las notas'; await commit(a,data);
    assert.equal((await feed(b,a,pub.id)).items[0].caption,pub.publication.caption);
    assert.equal((await feed(b,a,pub.id)).items[0].created_at,timestamp,'caption editing does not reorder the feed');
    assert.equal((await db.query<{data:AppData}>('select data from public.cheesit_accounts where owner_id=$1',[a])).rows[0].data.workouts.find(w=>w.id===pub.id)?.notes,'THIS IS A PRIVATE WORKOUT NOTE');
    pub.publication.caption='x'.repeat(1000); await commit(a,data);
    assert.equal((await feed(b,a,pub.id)).items[0].caption?.length,1000);
    for(const invalid of ['x'.repeat(1001),null,12,true,{},[]]) {
      const badCaption=structuredClone(data);
      (badCaption.workouts.find(w=>w.id===pub.id)!.publication as unknown as {caption:unknown}).caption=invalid;
      await assert.rejects(commit(a,badCaption),/invalid publication caption/);
    }
    pub.publication.caption='   '; await commit(a,data);
    assert.equal((await feed(b,a,pub.id)).items[0].caption,null,'empty caption stays optional');
    delete pub.publication.caption; await commit(a,data);
    assert.equal((await feed(b,a,pub.id)).items[0].caption,null,'removing the caption is persistent');
    assert.equal((await as(b,tx=>tx.query<{summary:unknown}>('select summary from public.cheesit_social_activity where owner_id=$1',[a]))).rows[0].summary,null,'raw projection cannot leak private aggregates');
    assert.equal((await photoRows(b,photo)).rows.length,1,'published photo is downloadable');
    const serialized=JSON.stringify(result.items[0].workout);
    for(const secret of ['PRIVATE','notes','profile','publication','restTimer','companionReward','game']) assert.equal(serialized.includes(secret),false,secret);
    assert.equal(result.items[0].workout.exercises[0].sets[0].rpe,8);
    assert.equal((await as(b,tx=>tx.query('select * from public.cheesit_social_workouts where owner_id=$1',[a]))).rows.length,1,'raw Data API respects per-workout privacy');
    const notifications=(await as(b,tx=>tx.query<{result:{items:{workout_id:string|null}[]}}>('select public.cheesit_read_notifications() result'))).rows[0].result.items;
    assert.equal(notifications.length,1); assert.equal(notifications[0].workout_id,pub.id,'private session emits no notification');
    const like = (viewer:string,author:string,id:string,spoof=viewer) => as(viewer,tx=>tx.query('insert into public.cheesit_post_likes(workout_owner,workout_id,owner_id) values($1,$2,$3)',[author,id,spoof]));
    await like(b,a,pub.id);
    await assert.rejects(like(b,a,pub.id),/duplicate key/);
    await assert.rejects(like(c,a,pub.id,b),/row-level security/);
    await assert.rejects(like(b,a,privateWorkout.id),/row-level security/);
    await assert.rejects(like(b,a,history.id),/row-level security/);
    result=await feed(b,a,pub.id); assert.equal(result.items[0].likes,1); assert.equal(result.items[0].liked,true);
    assert.equal((await feed(c,a,pub.id)).items[0].liked,false);
    await as(c,tx=>tx.query('delete from public.cheesit_post_likes where owner_id=$1',[b]));
    assert.equal((await feed(b,a,pub.id)).items[0].likes,1,'users cannot unlike for another user');
    await as(b,tx=>tx.query('delete from public.cheesit_post_likes where owner_id=$1',[b]));
    assert.equal((await feed(b,a,pub.id)).items[0].likes,0);
    const commentId=crypto.randomUUID();
    const addComment=(viewer:string,body:string,id=crypto.randomUUID(),author=a,wid=pub.id,spoof=viewer)=>as(viewer,tx=>tx.query('insert into public.cheesit_post_comments(id,workout_owner,workout_id,owner_id,body) values($1,$2,$3,$4,$5)',[id,author,wid,spoof,body]));
    await addComment(b,'Buen entrenamiento',commentId);
    await assert.rejects(addComment(b,'Buen entrenamiento',commentId),/duplicate key/);
    await assert.rejects(addComment(c,'Suplantación',crypto.randomUUID(),a,pub.id,b),/row-level security/);
    await assert.rejects(as(b,tx=>tx.query('insert into public.cheesit_post_comments(workout_owner,workout_id,owner_id,body,created_at) values($1,$2,$3,$4,$5)',[a,pub.id,b,'Futuro','2099-01-01T00:00:00Z'])),/permission denied/);
    await assert.rejects(addComment(b,'Privado',crypto.randomUUID(),a,privateWorkout.id),/row-level security/);
    await assert.rejects(addComment(b,' '),/check constraint/);
    await assert.rejects(addComment(b,'x'.repeat(2001)),/check constraint/);
    assert.equal((await feed(b,a,pub.id)).items[0].comments,1);
    assert.equal((await comments(c,a,pub.id)).items[0].body,'Buen entrenamiento');
    await as(c,tx=>tx.query('delete from public.cheesit_post_comments where id=$1',[commentId]));
    assert.equal((await comments(b,a,pub.id)).items.length,1,'only authors delete comments');
    await as(b,tx=>tx.query('delete from public.cheesit_post_comments where id=$1',[commentId]));
    assert.equal((await feed(b,a,pub.id)).items[0].comments,0);
    // Neither visible comments nor likes can be injected with a timestamp,
    // but they remain ordered and bounded even when database timestamps tie.
    for(let i=0;i<25;i++) await addComment(b,`Comentario ${i}`);
    await db.query("update public.cheesit_post_comments set created_at='2026-11-04T12:00:00Z'");
    const cp1=await comments(b,a,pub.id),cp2=await comments(b,a,pub.id,cp1.next);
    assert.equal(cp1.items.length,20); assert.equal(cp2.items.length,5); assert.equal(cp2.next,null);
    assert.equal(new Set([...cp1.items,...cp2.items].map(x=>x.id)).size,25);
    const originalPost=(await feed(b,a,pub.id)).items[0];
    pub.name='Editado'; pub.updatedAt=new Date().toISOString(); await commit(a,data);
    assert.equal((await feed(b,a,pub.id)).items[0].created_at,originalPost.created_at,'editing never reorders a publication');
    data.workouts.push(...Array.from({length:43},(_,i)=>workout(`Sesión ${i}`,true)));
    await commit(a,data);
    await db.query("update public.cheesit_social_workouts set published_at='2026-11-04T13:00:00Z' where published");
    const fp1=await feed(b),fp2=await feed(b,null,null,fp1.next),fp3=await feed(b,null,null,fp2.next);
    assert.equal(fp1.items.length,20); assert.equal(fp2.items.length,20); assert.equal(fp3.items.length,4); assert.equal(fp3.next,null);
    assert.equal(new Set([...fp1.items,...fp2.items,...fp3.items].map(x=>x.id)).size,44,'same timestamp pages are unique and complete');
    // New uploads at the head do not shift an existing keyset page.
    data.workouts.push(workout('Recién publicado',true)); await commit(a,data);
    const fp2After=await feed(b,null,null,fp1.next);
    assert.deepEqual(fp2After.items.map(x=>x.id),fp2.items.map(x=>x.id));
    pub.publication.caption='CAPTION OCULTO POR PERFIL'; await commit(a,data);
    await privacy(a,false);
    assert.equal((await feed(b)).items.length,0); assert.equal((await feed(b,a,pub.id)).items.length,0);
    assert.equal((await comments(b,a,pub.id)).items.length,0);
    assert.equal((await photoRows(b,photo)).rows.length,0,'privacy immediately revokes photo downloads');
    assert.equal((await feed(a,a,pub.id)).items.length,1,'author retains own publication');
    assert.equal((await feed(a,a,pub.id)).items[0].caption,'CAPTION OCULTO POR PERFIL');
    assert.equal((await as(b,tx=>tx.query('select caption from public.cheesit_social_workouts where owner_id=$1 and workout_id=$2',[a,pub.id]))).rows.length,0,'raw projection cannot reveal captions from a private profile');
    await assert.rejects(like(b,a,pub.id),/row-level security/);
    await assert.rejects(addComment(b,'No autorizado'),/row-level security/);
    const hiddenNotification=(await as(b,tx=>tx.query<{result:{items:{workout_label:string|null}[]}}>('select public.cheesit_read_notifications() result'))).rows[0].result.items[0];
    assert.equal(hiddenNotification.workout_label,null);
    await privacy(a,true);
    pub.publication={published:false,photoPath:photo}; await commit(a,data);
    assert.equal((await feed(b,a,pub.id)).items.length,0); assert.equal((await photoRows(b,photo)).rows.length,0);
    pub.publication={published:true,photoPath:photo}; await commit(a,data);
    assert.equal((await feed(b,a,pub.id)).items[0].comments,25,'unpublishing retains comment history for the author');
    assert.equal((await photoRows(b,photo)).rows.length,1);
    const bad=structuredClone(data); bad.workouts[1].publication={published:true,photoPath:`${b}/${pub.id}/${crypto.randomUUID()}.jpg`};
    await assert.rejects(commit(a,bad),/invalid publication photo/);
    pub.status='deleted'; await commit(a,data);
    assert.equal((await feed(b,a,pub.id)).items.length,0); assert.equal((await photoRows(b,photo)).rows.length,0);
    await assert.rejects(as(null,tx=>tx.query('select public.cheesit_read_feed()'),'anon'),/permission denied/);
    await assert.rejects(as(b,tx=>tx.query('update public.cheesit_post_comments set body=$1',['hacked'])),/permission denied/);
    await assert.rejects(as(b,tx=>tx.query('select cheesit_private.sync_social_activity()')),/permission denied/);
    await db.query('delete from auth.users where id=$1',[a]);
    assert.equal((await feed(b)).items.length,0);
    assert.equal((await db.query('select * from public.cheesit_post_comments')).rows.length,0,'author deletion cascades social content');
  } finally { await db.close(); }
});
