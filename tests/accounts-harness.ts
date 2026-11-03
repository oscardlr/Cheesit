import { createServer, type IncomingMessage } from 'node:http';
import { readFileSync } from 'node:fs';
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
  const users = new Map<string, { id: string; email: string; password: string; confirmed: boolean }>();
  const authUser = (u: { id: string; email: string }) => ({ id:u.id,email:u.email,aud:'authenticated',role:'authenticated',created_at:new Date().toISOString(),app_metadata:{provider:'email'},user_metadata:{},identities:[] });
  const token = (u: {id:string}) => `${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:u.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',aud:'authenticated'})).toString('base64url')}.local-test-signature`;
  const session = (u: {id:string;email:string}) => ({ access_token:token(u),refresh_token:u.id,expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:authUser(u) });
  async function body(req: IncomingMessage) { let text='';for await(const chunk of req)text+=chunk;return text?JSON.parse(text):{}; }
  const server = createServer(async (req,res) => {
    res.setHeader('cache-control', 'no-store');
    res.setHeader('access-control-allow-origin','*');res.setHeader('access-control-allow-headers','*');res.setHeader('access-control-allow-methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');res.setHeader('content-type','application/json');
    const send=(status:number,data:unknown)=>{res.statusCode=status;res.end(JSON.stringify(data));};
    if(req.method==='OPTIONS'){send(200,{});return;}
    const url=new URL(req.url!,'http://localhost');
    try {
      const input=await body(req);
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
        if(url.pathname==='/rest/v1/cheesit_identities') return (await tx.query('select * from public.cheesit_identities where owner_id=$1',[owner])).rows[0]??null;
        if(url.pathname==='/rest/v1/rpc/cheesit_complete_profile') return (await tx.query<{result:unknown}>('select public.cheesit_complete_profile($1,$2,$3,$4) result',[input.p_expected_owner,input.p_display_name,input.p_username,input.p_profile])).rows[0].result;
        if(url.pathname==='/rest/v1/cheesit_accounts'){
          const id=url.searchParams.get('owner_id')?.replace('eq.','')??owner;
          return (await tx.query('select * from public.cheesit_accounts where owner_id=$1',[id])).rows[0]??null;
        }
        if(url.pathname==='/rest/v1/rpc/cheesit_commit_account')return (await tx.query<{result:unknown}>('select public.cheesit_commit_account($1,$2,$3,$4::jsonb) result',[input.p_expected_owner,input.p_operation_id,input.p_base_revision,JSON.stringify(input.p_document)])).rows[0].result;
        throw new Error('unknown fixture path');
      });send(200,result);
    }catch(error){send(400,{message:error instanceof Error?error.message:'fixture error',code:(error as {code?:string}).code??'22023'});}
  });
  await new Promise<void>(resolve=>server.listen(port,'127.0.0.1',resolve));
  return {
    async seed(email:string,password='test-password-123',data?:unknown){const u={id:crypto.randomUUID(),email,password,confirmed:true};users.set(email,u);await db.query('insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3)',[u.id,email,{username:'u'+u.id.replaceAll('-','').slice(0,20),display_name:'Tu perfil'}]);if(data)await db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[u.id]);await tx.query('select public.cheesit_commit_account($1,$2,1,$3::jsonb)',[u.id,crypto.randomUUID(),JSON.stringify({data,tombstones:((data as {workouts?:{id:string;status:string}[]}).workouts??[]).filter(w=>w.status==='deleted').map(w=>`workouts:${w.id}`),migrations:[]})]);});await db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[u.id]);await tx.query('select public.cheesit_complete_profile($1,$2,$3,$4)',[u.id,(data as {personalProfile?:{displayName:string}})?.personalProfile?.displayName||'Tu perfil','u'+u.id.replaceAll('-','').slice(0,20),{weightKg:70,heightCm:180,age:20,sex:'male',dumbbellLoad:'per_hand'}]);});return u;},
    confirm(email:string){const u=users.get(email)!;u.confirmed=true;return session(u);},
    recovery(email:string){const u=users.get(email)!;const s=session(u);return `?recovery=1#access_token=${s.access_token}&refresh_token=${s.refresh_token}&token_type=bearer&expires_in=3600&type=recovery`;},
    async account(email:string){const u=users.get(email)!;return (await db.query<{data:unknown;revision:number}>('select data,revision from public.cheesit_accounts where owner_id=$1',[u.id])).rows[0];},
    async close(){await new Promise<void>(resolve=>server.close(()=>resolve()));await db.close();},
  };
}
