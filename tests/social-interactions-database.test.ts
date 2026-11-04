import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { CATALOG } from '../src/lib/catalog';
import { emptyData, exerciseSnapshot, newSet, newWorkout, type AppData, type Workout } from '../src/lib/model';
import type { FeedCursor, FeedPage } from '../src/lib/remote/feed';
import type { NotificationPage } from '../src/lib/remote/notifications';

test('following is filtered before keyset paging and interaction notifications persist with live authorization', async () => {
  const db = new PGlite();
  const a=crypto.randomUUID(),b=crypto.randomUUID(),c=crypto.randomUUID();
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`);
    for(const file of ['202611020001_accounts.sql','20261102233213_personal_profiles.sql','20261103000502_account_onboarding.sql',
      '20261103140756_social_follows.sql','20261103194247_social_activity_notifications.sql','20261104154031_training_moments_cycles.sql',
      '20261104192629_workout_feed.sql','20261104192645_workout_publication_caption.sql']) {
      await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'));
    }
    const as=async<T>(owner:string|null,fn:(tx:PGlite)=>Promise<T>,role='authenticated')=>db.transaction(async tx=>{
      await tx.exec(`set local role ${role}`);await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[owner??'']);return fn(tx as unknown as PGlite);
    });
    const profile={weightKg:80,heightCm:180,age:30,sex:'male' as const};
    async function account(id:string,name:string) {
      await db.query('insert into auth.users values($1,$2,$3)',[id,`${name}@private.test`,{username:name,display_name:name}]);
      await as(id,tx=>tx.query('select public.cheesit_complete_profile($1,$2,$3,$4)',[id,name,name,profile]));
    }
    const workout=(name:string,published=true):Workout=>({...newWorkout(),name,status:'finished',notes:'PRIVATE NOTES NEVER IN NOTIFICATIONS',
      publication:{published,caption:'Caption only on post'},exercises:[{id:crypto.randomUUID(),...exerciseSnapshot(CATALOG[0]),sets:[{...newSet(),weight:40,reps:10,confirmed:true}]}]});
    const data=(name:string):AppData=>({...emptyData(),profile,personalProfile:{displayName:name,photo:null,bio:''},workouts:[]});
    const da=data('Autor'),dbb=data('Lector'),dc=data('Otra');
    async function commit(id:string,next:AppData) {
      return as(id,async tx=>{
        const account=(await tx.query<{revision:number}>('select revision from public.cheesit_accounts where owner_id=$1',[id])).rows[0];
        return (await tx.query('select public.cheesit_commit_account($1,$2,$3,$4)',[id,crypto.randomUUID(),account.revision,{data:next,tombstones:next.workouts.filter(w=>w.status==='deleted').map(w=>`workouts:${w.id}`),migrations:[]}])).rows;
      });
    }
    const follow=(viewer:string,author:string)=>as(viewer,tx=>tx.query('insert into public.cheesit_follows(follower_id,followed_id) values($1,$2)',[viewer,author]));
    const unfollow=(viewer:string,author:string)=>as(viewer,tx=>tx.query('delete from public.cheesit_follows where follower_id=$1 and followed_id=$2',[viewer,author]));
    const like=(viewer:string,author:string,wid:string,spoof=viewer)=>as(viewer,tx=>tx.query('insert into public.cheesit_post_likes(workout_owner,workout_id,owner_id) values($1,$2,$3)',[author,wid,spoof]));
    const unlike=(viewer:string,author:string,wid:string)=>as(viewer,tx=>tx.query('delete from public.cheesit_post_likes where workout_owner=$1 and workout_id=$2 and owner_id=$3',[author,wid,viewer]));
    const comment=(viewer:string,author:string,wid:string,id=crypto.randomUUID(),body='SECRET COMMENT BODY NOT IN NOTIFICATIONS',spoof=viewer)=>as(viewer,tx=>tx.query('insert into public.cheesit_post_comments(id,workout_owner,workout_id,owner_id,body) values($1,$2,$3,$4,$5)',[id,author,wid,spoof,body]));
    const notifications=async(viewer:string,cursor?:FeedCursor):Promise<NotificationPage>=>(await as(viewer,tx=>tx.query<{result:NotificationPage}>('select public.cheesit_read_notifications($1,$2) result',[cursor?.created_at??null,cursor?.id??null]))).rows[0].result;
    async function allNotifications(viewer:string) {
      const items:NotificationPage['items']=[];let cursor:FeedCursor|undefined;
      for(;;) {const page=await notifications(viewer,cursor);const visible=page.items.slice(0,20);items.push(...visible);if(page.items.length<=20)return items;const last=visible.at(-1)!;cursor={created_at:last.created_at,id:last.id};}
    }
    const feed=async(viewer:string,following=false,cursor?:FeedCursor|null,owner:string|null=null,wid:string|null=null):Promise<FeedPage>=>(await as(viewer,tx=>tx.query<{result:FeedPage}>('select public.cheesit_read_feed($1,$2,$3,$4,$5) result',[owner,wid,cursor?.created_at??null,cursor?.id??null,following]))).rows[0].result;
    const privacy=(viewer:string,shared:boolean)=>as(viewer,tx=>tx.query('update public.cheesit_social_profiles set activity_shared=$1 where owner_id=$2',[shared,viewer]));
    await account(a,'autor');await account(b,'lector');await account(c,'otra');
    const main=workout('Entrenamiento de autor'),privateWorkout=workout('Sesión privada',false),other=workout('Sesión de otra persona');
    da.workouts.push(main,privateWorkout);dc.workouts.push(other);
    await commit(a,da);await commit(c,dc);await follow(b,a);
    const later=workout('Publicado con avisos legacy');da.workouts.push(later);await commit(a,da);
    await like(b,a,main.id);const preexistingComment=crypto.randomUUID();await comment(c,a,main.id,preexistingComment);
    const preMigrationNotifications=(await db.query('select * from public.cheesit_notifications order by id')).rows;
    await db.exec(readFileSync('supabase/migrations/20261104192712_social_interactions.sql','utf8'));
    assert.equal((await db.query('select * from public.cheesit_notifications')).rows.length,preMigrationNotifications.length,'migration never backfills interaction notifications');
    const legacy=(await notifications(b)).items.find(n=>n.kind==='workout')!;
    assert.equal(legacy.workout_owner,a);assert.equal(legacy.actor_id,a);assert.equal(legacy.workout_id,later.id);
    assert.equal(legacy.comment_id,null);assert.ok(legacy.workout_label);
    assert.equal((await db.query<{count:number}>("select count(*)::int count from pg_proc where pronamespace='public'::regnamespace and proname='cheesit_read_feed'")).rows[0].count,1,'one PostgREST overload remains');
    assert.equal((await as(b,tx=>tx.query<{result:FeedPage}>('select public.cheesit_read_feed() result'))).rows[0].result.items.length,3,'old clients omitting following still get global posts');
    assert.equal((await feed(b)).items.length,3);assert.equal((await feed(b,true)).items.length,2);
    assert.equal((await feed(c,true)).items.length,0,'following does not silently fall back to the global feed');

    await unlike(b,a,main.id);await like(b,a,main.id);
    let notices=await notifications(a);let likeNotice=notices.items.find(n=>n.kind==='like')!;
    assert.equal(likeNotice.actor_id,b);assert.equal(likeNotice.workout_owner,a);assert.equal(likeNotice.workout_id,main.id);assert.equal(likeNotice.comment_id,null);
    assert.ok(likeNotice.workout_label);assert.equal(notices.unread,2,'follow and first like are unread');
    await assert.rejects(like(b,a,main.id),/duplicate key/);
    await unlike(b,a,main.id);await like(b,a,main.id);
    notices=await notifications(a);assert.equal(notices.items.filter(n=>n.kind==='like').length,1,'unlike/re-like never duplicates the event');
    assert.equal(notices.items.find(n=>n.kind==='like')!.id,likeNotice.id);
    assert.equal((await notifications(c)).items.some(n=>n.kind==='like'),false,'interaction goes only to the post author');
    await like(a,a,main.id);await comment(a,a,main.id);
    assert.equal((await notifications(a)).items.length,2,'self interactions never notify');
    await assert.rejects(like(c,a,main.id,b),/row-level security/);
    await assert.rejects(comment(c,a,main.id,crypto.randomUUID(),'Spoof',b),/row-level security/);
    await assert.rejects(like(b,a,privateWorkout.id),/row-level security/);
    await assert.rejects(comment(b,a,privateWorkout.id),/row-level security/);
    await assert.rejects(as(b,tx=>tx.query("insert into public.cheesit_notifications(recipient_id,actor_id,kind,event_key) values($1,$2,'follow','spoof')",[a,b])),/permission denied/);
    await assert.rejects(as(b,tx=>tx.query('select cheesit_private.notify_post_interaction()')),/permission denied/);
    await assert.rejects(as(b,tx=>tx.query('select cheesit_private.notification_target_owner()')),/permission denied/);
    const cid=crypto.randomUUID();await comment(b,a,main.id,cid);
    let commentNotice=(await notifications(a)).items.find(n=>n.comment_id===cid)!;
    assert.equal(commentNotice.kind,'comment');assert.equal(commentNotice.workout_owner,a);assert.equal(commentNotice.actor_id,b);
    assert.ok(commentNotice.workout_label);
    assert.equal(JSON.stringify(await notifications(a)).includes('SECRET COMMENT BODY'),false);assert.equal(JSON.stringify(await notifications(a)).includes('PRIVATE NOTES'),false);
    await assert.rejects(comment(b,a,main.id,cid),/duplicate key/);
    assert.equal((await notifications(a)).items.filter(n=>n.comment_id===cid).length,1,'comment retry is idempotent');
    await as(c,tx=>tx.query('select public.cheesit_mark_notifications($1)',[commentNotice.id]));
    assert.equal((await notifications(a)).items.find(n=>n.id===commentNotice.id)!.read_at,null,'another user cannot mark a receipt');
    await as(a,tx=>tx.query('select public.cheesit_mark_notifications($1)',[commentNotice.id]));
    assert.ok((await notifications(a)).items.find(n=>n.id===commentNotice.id)!.read_at);
    assert.equal((await as(c,tx=>tx.query('select id from public.cheesit_notifications where recipient_id=$1',[a]))).rows.length,0,'raw receipt API is recipient-only');
    await as(c,tx=>tx.query('delete from public.cheesit_post_comments where id=$1',[cid]));
    assert.ok((await notifications(a)).items.some(n=>n.comment_id===cid),'another user cannot delete the triggering comment');
    await as(b,tx=>tx.query('delete from public.cheesit_post_comments where id=$1',[cid]));
    assert.equal((await notifications(a)).items.some(n=>n.comment_id===cid),false,'deleting a comment removes its notification');
    assert.equal((await notifications(a)).unread,2);

    // A private profile remains readable to its author; a per-post unpublish
    // or deletion always removes labels, including from the author's alerts.
    await privacy(a,false);
    assert.ok((await notifications(a)).items.find(n=>n.id===likeNotice.id)!.workout_label,'owner can still open own published post');
    assert.equal((await notifications(b)).items.find(n=>n.kind==='workout')!.workout_label,null,'followers cannot recover names after privacy changes');
    await assert.rejects(like(c,a,main.id),/row-level security/);
    await privacy(a,true);
    main.publication={published:false};await commit(a,da);
    assert.equal((await notifications(a)).items.find(n=>n.id===likeNotice.id)!.workout_label,null,'unpublished post label is hidden even from an old interaction alert');
    main.publication={published:true,caption:'Restaurada'};await commit(a,da);
    assert.ok((await notifications(a)).items.find(n=>n.id===likeNotice.id)!.workout_label);
    const newNoticeCount=(await notifications(b)).items.filter(n=>n.kind==='workout').length;
    const fresh=workout('Otro entrenamiento publicado');da.workouts.push(fresh);await commit(a,da);
    const freshNotice=(await notifications(b)).items.find(n=>n.workout_id===fresh.id)!;
    assert.equal(freshNotice.workout_owner,a,'legacy workout trigger gets target owner through compatibility trigger');
    assert.equal((await notifications(b)).items.filter(n=>n.kind==='workout').length,newNoticeCount+1);

    // Interleave many authors at exactly the same timestamp. Following must
    // filter before LIMIT, and cursor pages must be complete without repeats.
    da.workouts.push(...Array.from({length:26},(_,i)=>workout(`Autor ${i}`)));
    dc.workouts.push(...Array.from({length:29},(_,i)=>workout(`Otra ${i}`)));
    await commit(a,da);await commit(c,dc);
    await db.query("update public.cheesit_social_workouts set published_at='2026-11-04T13:00:00Z' where published");
    const first=await feed(b,true),second=await feed(b,true,first.next);
    assert.equal(first.items.length,20);assert.equal(second.items.length,9);assert.equal(second.next,null);
    const ids=[...first.items,...second.items].map(p=>p.id);assert.equal(new Set(ids).size,29);
    assert.equal([...first.items,...second.items].every(p=>p.owner_id===a),true,'all following pages exclude non-followed authors');
    const global1=await feed(b),global2=await feed(b,false,global1.next),global3=await feed(b,false,global2.next);
    const global=[...global1.items,...global2.items,...global3.items];assert.equal(global.length,59);assert.equal(new Set(global.map(p=>p.id)).size,59);
    assert.ok(global.some(p=>p.owner_id===c));assert.ok(global.some(p=>p.owner_id===a));
    dc.workouts.push(workout('Nueva de no seguido'));await commit(c,dc);
    assert.deepEqual((await feed(b,true,first.next)).items.map(p=>p.id),second.items.map(p=>p.id),'non-followed insert cannot shift following cursor');
    await unfollow(b,a);assert.equal((await feed(b,true)).items.length,0);
    await follow(b,c);const onlyC=await feed(b,true);assert.equal(onlyC.items.length,20);assert.ok(onlyC.items.every(p=>p.owner_id===c));
    await privacy(c,false);assert.equal((await feed(b,true)).items.length,0,'following never bypasses profile privacy');await privacy(c,true);

    // Notification paging retains the original keyset semantics and unread
    // accounting, including several comments in a single timestamp batch.
    for(let i=0;i<24;i++)await comment(c,a,main.id);
    await db.query("update public.cheesit_notifications set created_at='2026-11-04T15:00:00Z' where recipient_id=$1",[a]);
    const np1=await notifications(a),last=np1.items[19],np2=await notifications(a,{created_at:last.created_at,id:last.id});
    assert.equal(np1.items.length,21);assert.equal(np2.items.length,6);
    assert.equal(new Set([...np1.items.slice(0,20),...np2.items].map(n=>n.id)).size,26);
    await as(a,tx=>tx.query('select public.cheesit_mark_notifications(null)'));assert.equal((await notifications(a)).unread,0);
    main.status='deleted';await commit(a,da);
    assert.equal((await allNotifications(a)).find(n=>n.id===likeNotice.id)!.workout_label,null,'deleted post names cannot leak');
    await assert.rejects(as(null,tx=>tx.query('select public.cheesit_read_feed(null,null,null,null,true)'),'anon'),/permission denied/);
    await db.query('delete from auth.users where id=$1',[c]);
    assert.equal((await notifications(a)).items.some(n=>n.actor_id===c),false,'actor deletion cascades interaction alerts');
    await db.query('delete from auth.users where id=$1',[a]);
    assert.equal((await notifications(b)).items.some(n=>n.workout_owner===a),false,'post owner deletion cascades notification targets');
  } finally {await db.close();}
});
