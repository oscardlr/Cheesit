import { createServer, type IncomingMessage } from 'node:http';
import { readFileSync } from 'node:fs';
import { socialActivitySummary } from '../src/lib/social-activity';
import type { AppData } from '../src/lib/model';
import { PGlite } from '@electric-sql/pglite';

/** Local-only Auth/PostgREST fixture. Uses actual PostgreSQL RLS/RPCs, but does
 * NOT prove Supabase email delivery, JWT validation or refresh-server behavior. */
export async function accountsHarness(port = Number(process.env.CHEESIT_ACCOUNTS_PORT ?? 55440)) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
  await db.exec(readFileSync('supabase/migrations/202611020001_accounts.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261102233213_personal_profiles.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261103000502_account_onboarding.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261103102339_onboarding_google_compatibility.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261103140756_social_follows.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261103194247_social_activity_notifications.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261104154031_training_moments_cycles.sql','utf8'));
  // Storage fixture uses the actual migration policies for every object operation.
  await db.exec(`create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb default '{}'::jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select,insert,delete on storage.objects to authenticated;`);
  await db.exec(readFileSync('supabase/migrations/20261104192629_workout_feed.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261104192645_workout_publication_caption.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261104192654_profile_gym.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261104192712_social_interactions.sql','utf8'));
  const buckets = (await db.query<{id:string;file_size_limit:number;allowed_mime_types:string[]}>('select id,file_size_limit,allowed_mime_types from storage.buckets')).rows;
  const objects = new Map<string,{bytes:Buffer;type:string}>();
  const users = new Map<string, { id: string; email: string; password: string; confirmed: boolean }>();
  const authUser = (u: { id: string; email: string }) => ({ id:u.id,email:u.email,aud:'authenticated',role:'authenticated',created_at:new Date().toISOString(),app_metadata:{provider:'email'},user_metadata:{},identities:[] });
  const token = (u: {id:string}) => `${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:u.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',aud:'authenticated'})).toString('base64url')}.local-test-signature`;
  const session = (u: {id:string;email:string}) => ({ access_token:token(u),refresh_token:u.id,expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:authUser(u) });
  async function body(req: IncomingMessage) { const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));return Buffer.concat(chunks); }
  const server = createServer(async (req,res) => {
    res.setHeader('cache-control', 'no-store');
    res.setHeader('access-control-allow-origin','*');res.setHeader('access-control-allow-headers','*');res.setHeader('access-control-allow-methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');res.setHeader('content-type','application/json');
    const send=(status:number,data:unknown)=>{res.statusCode=status;res.end(JSON.stringify(data));};
    if(req.method==='OPTIONS'){send(200,{});return;}
    const url=new URL(req.url!,'http://localhost');
    try {
      const raw=await body(req);
      const isUpload=url.pathname.startsWith('/storage/v1/object/')&&['POST','PUT'].includes(req.method??'');
      const input=isUpload?{}:raw.length?JSON.parse(raw.toString()):{};
      let user:ReturnType<typeof users.get>;
      try { const jwt=req.headers.authorization?.replace('Bearer ','').split('.')[1];const id=jwt?JSON.parse(Buffer.from(jwt,'base64url').toString()).sub:null;user=[...users.values()].find(u=>u.id===id); } catch {}
      if(url.pathname==='/auth/v1/signup'){
        if(users.has(input.email)){send(400,{msg:'already registered'});return;}
        const u={id:crypto.randomUUID(),email:input.email,password:input.password,confirmed:false};await db.query('insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3)',[u.id,u.email,input.data]);users.set(input.email,u);send(200,{user:authUser(u),session:null});return;
      }
      if(url.pathname==='/auth/v1/token'){
        const u=url.searchParams.get('grant_type')==='refresh_token'?[...users.values()].find(x=>x.id===input.refresh_token):users.get(input.email);
        if(!u || !u.confirmed || (input.password && input.password!==u.password)){send(400,{error:'invalid_grant',error_description:'Invalid login credentials'});return;}
        send(200,session(u));return;
      }
      if(url.pathname==='/auth/v1/recover'||url.pathname==='/auth/v1/resend'){send(200,{});return;}
      if(url.pathname==='/auth/v1/logout'){send(200,{});return;}
      if(url.pathname==='/auth/v1/user'){
      if(!user){send(401,{msg:'invalid token'});return;}if(req.method==='PUT'&&input.password)user.password=input.password;
        send(200,authUser(user));return;
      }
      if(url.pathname==='/rest/v1/rpc/cheesit_username_available'){send(200,(await db.query<{available:boolean}>('select public.cheesit_username_available($1) available',[input.p_username])).rows[0].available);return;}
      if(!user){send(401,{message:'authentication required'});return;}
      const owner=user.id;
      // SET LOCAL confines JWT claims and role to this request's transaction.
      const result=await db.transaction(async tx=>{
        await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
        if(url.pathname.startsWith('/storage/v1/object/')) {
          const suffix=decodeURIComponent(url.pathname.slice('/storage/v1/object/'.length)).replace(/^authenticated\//,'');
          const slash=suffix.indexOf('/');const bucket=slash<0?suffix:suffix.slice(0,slash),path=slash<0?'':suffix.slice(slash+1);
          if(req.method==='POST'||req.method==='PUT') {
            let bytes=raw,type=req.headers['content-type']??'application/octet-stream';
            if(type.startsWith('multipart/form-data')) {
              const form=await new Request('http://fixture/upload',{method:'POST',headers:{'content-type':type},body:new Uint8Array(raw)}).formData();
              const file=[...form.values()].find(value=>typeof value!=='string') as File|undefined;
              if(!file)throw new Error('missing upload');bytes=Buffer.from(await file.arrayBuffer());type=file.type;
            }
            const settings=buckets.find(value=>value.id===bucket);
            if(!settings||bytes.length>Number(settings.file_size_limit)||!settings.allowed_mime_types.includes(type))throw new Error('unsupported storage object');
            const object=(await tx.query<{id:string}>('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3) returning id',[bucket,path,{mimetype:type,size:bytes.length}])).rows[0];
            objects.set(`${bucket}/${path}`,{bytes,type});return {Key:`${bucket}/${path}`,Id:object.id};
          }
          if(req.method==='GET') {
            const allowed=(await tx.query('select id from storage.objects where bucket_id=$1 and name=$2',[bucket,path])).rows.length;
            const object=allowed?objects.get(`${bucket}/${path}`):undefined;if(!object)throw new Error('object unavailable');
            return {fixtureBinary:object};
          }
          if(req.method==='DELETE') {
            const deleted=await tx.query<{name:string}>('delete from storage.objects where bucket_id=$1 and name=any($2::text[]) returning name',[bucket,input.prefixes??[]]);
            for(const item of deleted.rows)objects.delete(`${bucket}/${item.name}`);return deleted.rows;
          }
        }
        if(url.pathname==='/rest/v1/rpc/cheesit_read_feed') return (await tx.query<{result:unknown}>('select public.cheesit_read_feed($1,$2,$3,$4,$5) result',[input.p_owner??null,input.p_workout??null,input.p_before??null,input.p_before_id??null,input.p_following??false])).rows[0].result;
        if(url.pathname==='/rest/v1/rpc/cheesit_read_post_comments') return (await tx.query<{result:unknown}>('select public.cheesit_read_post_comments($1,$2,$3,$4) result',[input.p_owner,input.p_workout,input.p_before??null,input.p_before_id??null])).rows[0].result;
        if(url.pathname==='/rest/v1/cheesit_post_likes') {
          const filter=(name:string)=>url.searchParams.get(name)?.replace('eq.','');
          if(req.method==='POST')return (await tx.query('insert into public.cheesit_post_likes(workout_owner,workout_id,owner_id) values($1,$2,$3) returning *',[input.workout_owner,input.workout_id,input.owner_id])).rows;
          if(req.method==='DELETE')return (await tx.query('delete from public.cheesit_post_likes where workout_owner=$1 and workout_id=$2 and owner_id=$3 returning *',[filter('workout_owner'),filter('workout_id'),filter('owner_id')])).rows;
          return (await tx.query('select * from public.cheesit_post_likes where workout_owner=$1 and workout_id=$2 and owner_id=$3',[filter('workout_owner'),filter('workout_id'),filter('owner_id')])).rows;
        }
        if(url.pathname==='/rest/v1/cheesit_post_comments') {
          const filter=(name:string)=>url.searchParams.get(name)?.replace('eq.','');
          if(req.method==='POST')return (await tx.query('insert into public.cheesit_post_comments(id,workout_owner,workout_id,owner_id,body) values(coalesce($1::uuid,gen_random_uuid()),$2,$3,$4,$5) returning *',[input.id??null,input.workout_owner,input.workout_id,input.owner_id,input.body])).rows;
          if(req.method==='DELETE')return (await tx.query('delete from public.cheesit_post_comments where id=$1 and owner_id=$2 returning *',[filter('id'),filter('owner_id')??owner])).rows;
          return (await tx.query('select * from public.cheesit_post_comments where id=$1',[filter('id')])).rows;
        }
        if(url.pathname==='/rest/v1/rpc/cheesit_read_activity') return (await tx.query<{result:unknown}>('select public.cheesit_read_activity($1,$2,$3) result',[input.p_owner,input.p_workout,input.p_offset])).rows[0].result;
        if(url.pathname==='/rest/v1/rpc/cheesit_read_notifications') return (await tx.query<{result:unknown}>('select public.cheesit_read_notifications($1,$2) result',[input.p_before,input.p_before_id])).rows[0].result;
        if(url.pathname==='/rest/v1/rpc/cheesit_mark_notifications') { await tx.query('select public.cheesit_mark_notifications($1)',[input.p_id]); return null; }
        if(url.pathname==='/rest/v1/cheesit_social_profiles' && req.method==='PATCH') return (await tx.query('update public.cheesit_social_profiles set activity_shared=$1 where owner_id=$2 returning activity_shared',[input.activity_shared,url.searchParams.get('owner_id')?.replace('eq.','')])).rows[0]??null;
        if(url.pathname==='/rest/v1/cheesit_social_profiles' && req.method==='GET' && url.searchParams.get('owner_id')?.startsWith('neq.')) {
          const logic=url.searchParams.get('or');
          const literal=logic?.match(/^\(username\.imatch\.("(?:[^"\\]|\\.)*"),display_name\.imatch\.\1\)$/u)?.[1];
          if(logic&&!literal)throw new Error('unexpected directory search filter');
          return (await tx.query(`select p.owner_id,p.username,p.display_name,p.photo,
            coalesce((select jsonb_agg(jsonb_build_object('follower_id',f.follower_id)) from public.cheesit_follows f where f.followed_id=p.owner_id and f.follower_id=$1), '[]') outgoing,
            coalesce((select jsonb_agg(jsonb_build_object('followed_id',f.followed_id)) from public.cheesit_follows f where f.follower_id=p.owner_id and f.followed_id=$1), '[]') incoming
            from public.cheesit_social_profiles p where p.owner_id<>$1 and ($2::text is null or p.username ~* $2 or p.display_name ~* $2)
            order by p.username limit $3 offset $4`,[url.searchParams.get('owner_id')?.slice(4),literal?JSON.parse(literal):null,Number(url.searchParams.get('limit')??21),Number(url.searchParams.get('offset')??0)])).rows;
        }
        if(url.pathname==='/rest/v1/cheesit_social_profiles' && req.method==='GET')return (await tx.query('select username,display_name,photo from public.cheesit_social_profiles where owner_id=$1',[url.searchParams.get('owner_id')?.replace('eq.','')??owner])).rows[0]??null;
        if(url.pathname==='/rest/v1/rpc/cheesit_read_social') return (await tx.query<{result:unknown}>('select public.cheesit_read_social($1,$2,$3,$4) result',[input.p_query,input.p_owner,input.p_list,input.p_offset])).rows[0].result;
        if(url.pathname==='/rest/v1/cheesit_follows'){
          if(req.method==='POST')return (await tx.query('insert into public.cheesit_follows(follower_id,followed_id) values($1,$2) returning *',[input.follower_id,input.followed_id])).rows;
          if(req.method==='DELETE')return (await tx.query('delete from public.cheesit_follows where follower_id=$1 and followed_id=$2 returning *',[url.searchParams.get('follower_id')?.replace('eq.',''),url.searchParams.get('followed_id')?.replace('eq.','')])).rows;
        }
        if(url.pathname==='/rest/v1/cheesit_identities') return (await tx.query('select * from public.cheesit_identities where owner_id=$1',[owner])).rows[0]??null;
        if(url.pathname==='/rest/v1/rpc/cheesit_complete_profile') return (await tx.query<{result:unknown}>('select public.cheesit_complete_profile($1,$2,$3,$4) result',[input.p_expected_owner,input.p_display_name,input.p_username,input.p_profile])).rows[0].result;
        if(url.pathname==='/rest/v1/cheesit_accounts'){
          const id=url.searchParams.get('owner_id')?.replace('eq.','')??owner;
          return (await tx.query('select * from public.cheesit_accounts where owner_id=$1',[id])).rows[0]??null;
        }
        if(url.pathname==='/rest/v1/rpc/cheesit_commit_account')return (await tx.query<{result:unknown}>('select public.cheesit_commit_account($1,$2,$3,$4::jsonb) result',[input.p_expected_owner,input.p_operation_id,input.p_base_revision,JSON.stringify(input.p_document)])).rows[0].result;
        throw new Error('unknown fixture path');
      });
      if(result&&typeof result==='object'&&'fixtureBinary' in result) {
        const object=(result as {fixtureBinary:{bytes:Buffer;type:string}}).fixtureBinary;
        res.statusCode=200;res.setHeader('content-type',object.type);res.end(object.bytes);return;
      }
      const single=req.headers.accept?.includes('application/vnd.pgrst.object+json');
      send(200,single&&Array.isArray(result)?result[0]??null:result);
    }catch(error){send(400,{message:error instanceof Error?error.message:'fixture error',code:(error as {code?:string}).code??'22023'});}
  });
  await new Promise<void>(resolve=>server.listen(port,'127.0.0.1',resolve));
  return {
    /** Test/demo process only: never exposed by the HTTP fixture. */
    async applyMigration(fileName:string){if(!/^\d{14}_[a-z0-9_]+\.sql$/.test(fileName))throw new Error('Invalid local migration filename');await db.transaction(tx=>tx.exec(readFileSync(`supabase/migrations/${fileName}`,'utf8')));},
    async seed(email:string,password='test-password-123',data?:unknown,restoreOwnerId?:string){if(restoreOwnerId&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(restoreOwnerId))throw new Error('Invalid restored local account id');const u={id:restoreOwnerId??crypto.randomUUID(),email,password,confirmed:true};users.set(email,u);await db.query('insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3)',[u.id,email,{username:'u'+u.id.replaceAll('-','').slice(0,20),display_name:'Tu perfil'}]);if(data)await db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[u.id]);await tx.query('select public.cheesit_commit_account($1,$2,1,$3::jsonb)',[u.id,crypto.randomUUID(),JSON.stringify({data,socialSummary:socialActivitySummary(data as AppData),tombstones:((data as {workouts?:{id:string;status:string}[]}).workouts??[]).filter(w=>w.status==='deleted').map(w=>`workouts:${w.id}`),migrations:[]})]);});await db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[u.id]);await tx.query('select public.cheesit_complete_profile($1,$2,$3,$4)',[u.id,(data as {personalProfile?:{displayName:string}})?.personalProfile?.displayName||'Tu perfil','u'+u.id.replaceAll('-','').slice(0,20),{weightKg:70,heightCm:180,age:20,sex:'male',dumbbellLoad:'per_hand'}]);});return u;},
    confirm(email:string){const u=users.get(email)!;u.confirmed=true;return session(u);},
    recovery(email:string){const u=users.get(email)!;const s=session(u);return `?recovery=1#access_token=${s.access_token}&refresh_token=${s.refresh_token}&token_type=bearer&expires_in=3600&type=recovery`;},
    async social(email:string){const u=users.get(email)!;return (await db.query<{username:string}>('select username from public.cheesit_social_profiles where owner_id=$1',[u.id])).rows[0];},
    async account(email:string){const u=users.get(email)!;return (await db.query<{data:unknown;revision:number}>('select data,revision from public.cheesit_accounts where owner_id=$1',[u.id])).rows[0];},
    async commit(email:string,data:unknown){const u=users.get(email)!;return db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[u.id]);const account=(await tx.query<{revision:number}>('select revision from public.cheesit_accounts where owner_id=$1',[u.id])).rows[0];return (await tx.query('select public.cheesit_commit_account($1,$2,$3,$4::jsonb)',[u.id,crypto.randomUUID(),account.revision,JSON.stringify({data,socialSummary:socialActivitySummary(data as AppData),tombstones:((data as {workouts?:{id:string;status:string}[]}).workouts??[]).filter(w=>w.status==='deleted').map(w=>`workouts:${w.id}`),migrations:[]})])).rows;});},
    async setPublic(email:string,shared:boolean){const u=users.get(email)!;await db.query('update public.cheesit_social_profiles set activity_shared=$1 where owner_id=$2',[shared,u.id]);},
    async feed(email:string,author:string|null=null,workout:string|null=null){const u=users.get(email)!;return db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[u.id]);return (await tx.query<{result:{items:unknown[];next:unknown}}>('select public.cheesit_read_feed($1,$2,null,null) result',[author,workout])).rows[0].result;});},
    async close(){await new Promise<void>(resolve=>server.close(()=>resolve()));await db.close();},
  };
}
