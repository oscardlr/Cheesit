import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { emptyData } from '../src/lib/model';
import { blankDocument } from '../src/lib/remote/document';
import { normalizeGame, openCrate } from '../src/lib/game';

// PostgreSQL WASM, not a mock of RLS or PL/pgSQL. Auth users/JWT claims are
// supplied locally; actual Supabase mail/JWT issuance has a separate live suite.
test('PostgreSQL: migration, RLS isolation, anonymous denial, idempotence, CAS, tombstones and transactional validation', async () => {
  const db = new PGlite();
  const a = crypto.randomUUID(), b = crypto.randomUUID();
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
  await db.query('insert into auth.users values ($1),($2)', [a,b]);
  await db.exec(readFileSync('supabase/migrations/202611020001_accounts.sql','utf8'));
  async function user(owner: string, role = 'authenticated') { await db.exec(`reset role; set role ${role}`); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]); }
  async function commit(owner: string, op: string, revision: number, document = blankDocument()) { return (await db.query<{ result: { status: string; snapshot: { revision: number } } }>('select public.cheesit_commit_account($1,$2,$3,$4::jsonb) result',[owner,op,revision,JSON.stringify(document)])).rows[0].result; }
  await user(a); const op = crypto.randomUUID(); const doc = { ...blankDocument(), data: { ...emptyData(), game: normalizeGame() } };
  const result = await commit(a,op,0,doc); assert.equal(result.status,'applied'); assert.equal(result.snapshot.revision,1);
  assert.deepEqual(await commit(a,op,0,doc),result);
  await assert.rejects(commit(a,op,0), /operation id reused/);
  assert.equal((await commit(a,crypto.randomUUID(),0,doc)).status,'conflict');
  await assert.rejects(db.query('update public.cheesit_accounts set revision=42'), /permission denied/);
  await user(b);
  assert.equal((await db.query('select * from public.cheesit_accounts where owner_id=$1',[a])).rows.length,0);
  assert.equal((await db.query('select * from public.cheesit_account_receipts where owner_id=$1',[a])).rows.length,0);
  await assert.rejects(commit(a,crypto.randomUUID(),1,doc), /authentication required or account changed/);
  await commit(b,crypto.randomUUID(),0);
  await user('', 'anon'); await assert.rejects(db.query('select * from public.cheesit_accounts'),/permission denied/); await assert.rejects(commit(a,crypto.randomUUID(),1,doc),/permission denied/);
  await user(a);
  const bad = { ...doc, data: { ...doc.data, workouts: [{ id: crypto.randomUUID() }] } };
  await assert.rejects(commit(a,crypto.randomUUID(),1,bad as never),/invalid/);
  assert.equal((await db.query<{revision:number}>('select revision from public.cheesit_accounts')).rows[0].revision,1);
  const r = { id:crypto.randomUUID(), name:'Routine',color:'#d8ff3e',archived:false,exercises:[] };
  const withRoutine = { ...doc,data:{...doc.data,routines:[r]} }; await commit(a,crypto.randomUUID(),1,withRoutine);
  await assert.rejects(commit(a,crypto.randomUUID(),2,doc), /missing deletion marker/);
  const deleted = { ...doc,tombstones:[`routines:${r.id}`] }; await commit(a,crypto.randomUUID(),2,deleted);
  await assert.rejects(commit(a,crypto.randomUUID(),3,{ ...withRoutine,tombstones:deleted.tombstones }), /deleted record cannot reappear/);
  await assert.rejects(commit(a,crypto.randomUUID(),3,doc), /markers must be monotonic/);
  // Two clients based on revision 3: exactly one commit wins.
  const replies = await Promise.all([commit(a,crypto.randomUUID(),3,deleted),commit(a,crypto.randomUUID(),3,deleted)]);
  assert.deepEqual(replies.map(x=>x.status).sort(),['applied','conflict']);
  // Representative legacy history includes game purchases and historical conventions.
  const legacy=JSON.parse(readFileSync('tests/fixtures/legacy-account.json','utf8')).data;
  await db.exec('reset role');
  await db.query('select public.cheesit_validate_data($1::jsonb)',[JSON.stringify(legacy)]);
  const forged=structuredClone(legacy);forged.game.missionRewards[0].xp+=1;
  await assert.rejects(db.query('select public.cheesit_validate_data($1::jsonb)',[JSON.stringify(forged)]), /invalid mission reward/);
  await db.close();
});

test('PostgreSQL account validator accepts one master prize at its fixed price', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
    await db.exec(readFileSync('supabase/migrations/202611020001_accounts.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/20261105234124_master_crate.sql', 'utf8'));
    const original = { ...normalizeGame(), arcadeGrant: { season: '2026', xp: 0, credits: 900, grantedAt: '2026-11-01T12:00:00Z', charges: {} } };
    const { game } = openCrate(original, [], 'master')!;
    const validate = (value: typeof game) => db.query('select public.cheesit_validate_data($1::jsonb)', [JSON.stringify({ ...emptyData(), game: value })]);
    await validate(game);
    const wrongPrice = structuredClone(game);
    wrongPrice.transactions[0].amount = -999;
    await assert.rejects(validate(wrongPrice), /invalid purchase/);
    const duplicateDebit = structuredClone(game);
    duplicateDebit.transactions.push({ ...game.transactions[0], id: crypto.randomUUID() });
    await assert.rejects(validate(duplicateDebit), /invalid purchase history/);
  } finally {
    await db.close();
  }
});
