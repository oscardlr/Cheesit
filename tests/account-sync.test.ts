import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AccountStore, readCache, type Outbox, type Transport } from '../src/lib/remote/account-store';
import { blankDocument, documentAfter, mergeDocuments, same, type CloudSnapshot } from '../src/lib/remote/document';
import { createBackup, previewBackup } from '../src/lib/backup';
import { emptyData, type AppData, type Routine } from '../src/lib/model';
import { gameBalance, normalizeGame } from '../src/lib/game';
import { StorageConflictError } from '../src/lib/storage';
import { RemoteConnectionError } from '../src/lib/remote/errors';

const routine = (name: string): Routine => ({ id: crypto.randomUUID(), name, color: '#d8ff3e', archived: false, exercises: [] });
function server() {
  let snapshot: CloudSnapshot = { ...blankDocument(), revision: 0 };
  const receipts = new Map<string, { request: Outbox; snapshot: CloudSnapshot }>();
  let connected = true, loseResponse = false;
  const transport: Transport = {
    async download() { if (!connected) throw new Error('offline'); return structuredClone(snapshot); },
    async apply(op) {
      if (!connected) throw new Error('offline');
      const old = receipts.get(op.operationId);
      if (old) { assert.deepEqual(old.request, op); return { status: 'applied', snapshot: structuredClone(old.snapshot) }; }
      if (op.expectedRevision !== snapshot.revision) return { status: 'conflict', snapshot: structuredClone(snapshot) };
      snapshot = { ...structuredClone(op.document), revision: snapshot.revision + 1 };
      receipts.set(op.operationId, { request: structuredClone(op), snapshot: structuredClone(snapshot) });
      if (loseResponse) { loseResponse = false; throw new Error('response lost'); }
      return { status: 'applied', snapshot: structuredClone(snapshot) };
    },
  };
  return { transport, disconnect: () => { connected = false; }, connect: () => { connected = true; }, lose: () => { loseResponse = true; }, snapshot: () => snapshot, receipts };
}

test('durable offline queue, restart, lost response and retry preserve exact operation identity', async () => {
  const remote = server(), owner = crypto.randomUUID();
  let store = await new AccountStore(owner, remote.transport).initialize(); await store.synchronize();
  remote.disconnect();
  const data = { ...emptyData(), routines: [routine('Sin cobertura')] };
  await store.saveData(data); await assert.rejects(store.synchronize(), /offline/);
  assert.notEqual(store.status, 'synced'); store.dispose();
  store = await new AccountStore(owner, remote.transport).initialize(); assert.deepEqual(await store.loadData(), data);
  remote.connect(); remote.lose(); await assert.rejects(store.synchronize(), /response lost/);
  const op = (await readCache(owner))!.outbox!; assert.ok(op);
  store.dispose(); store = await new AccountStore(owner, remote.transport).initialize(); await store.synchronize();
  assert.equal(remote.receipts.size, 1); assert.equal(store.status, 'synced'); assert.equal(store.getSnapshot().outbox, undefined); store.dispose();
});

test('a failed connection stays pending even when the browser reports online, and retries without losing edits', async () => {
  const remote = server();
  let unavailable = false;
  const store = await new AccountStore(crypto.randomUUID(), {
    ...remote.transport,
    download: () => { if (unavailable) throw new RemoteConnectionError(); return remote.transport.download(); },
  }).initialize();
  await store.synchronize();
  await store.saveData({ ...emptyData(), routines: [routine('Sin cobertura real')] });
  unavailable = true;
  await assert.rejects(store.synchronize(), RemoteConnectionError);
  assert.equal(store.status, 'pending');
  assert.doesNotMatch(store.error, /iniciar sesión/);
  unavailable = false;
  await store.synchronize();
  assert.equal(store.status, 'synced');
  assert.equal(remote.snapshot().data.routines.length, 1);
  store.dispose();
});

test('independent devices combine routines; a stale deletion never resurrects', async () => {
  const remote = server();
  const a = await new AccountStore(crypto.randomUUID(), remote.transport).initialize();
  const b = await new AccountStore(crypto.randomUUID(), remote.transport).initialize();
  await a.synchronize(); await b.synchronize();
  const first = routine('A'), second = routine('B');
  await a.saveData({ ...emptyData(), routines: [first] }); await a.synchronize();
  await b.saveData({ ...emptyData(), routines: [second] }); await b.synchronize();
  assert.equal(remote.snapshot().data.routines.length, 2);
  await a.synchronize(); await a.saveData({ ...emptyData(), routines: [second] }); await a.synchronize();
  const stale = await b.loadData(); stale.routines.find(x => x.id === first.id)!.name = 'Old copy';
  await b.saveData(stale); await b.synchronize();
  assert.equal(b.status, 'conflict');
  await b.resolve({ [`routines:${first.id}`]: 'local' }); await b.synchronize();
  assert.ok(!remote.snapshot().data.routines.some(x => x.id === first.id)); a.dispose(); b.dispose();
});

test('activity and ledger conflicts require an explicit choice; no automatic economic merge', async () => {
  const base = blankDocument(); const local = structuredClone(base), remote = structuredClone(base);
  local.data.game = { ...normalizeGame(), weeklyWorkoutGoal: 4 };
  remote.data.game = { ...normalizeGame(), weeklyWorkoutGoal: 5 };
  let merge = mergeDocuments(base, local, remote);
  assert.equal(merge.unresolved[0].key, 'activity');
  merge = mergeDocuments(base, local, remote, { activity: 'local' }); assert.equal(merge.unresolved.length, 0);
  assert.deepEqual(merge.document.data.game, local.data.game);
});

test('two accounts retain isolated queues; disposed owner cannot send or save', async () => {
  const remoteA = server(), remoteB = server();
  const a = await new AccountStore(crypto.randomUUID(), remoteA.transport).initialize();
  const b = await new AccountStore(crypto.randomUUID(), remoteB.transport).initialize();
  await a.synchronize(); await b.synchronize(); await a.saveData({ ...emptyData(), routines: [routine('Private A')] });
  assert.ok(same(await b.loadData(), emptyData())); a.dispose();
  await assert.rejects(a.synchronize(), /sesión ha cambiado/); assert.throws(() => a.saveData(emptyData()), /sesión ha cambiado/); b.dispose();
});

test('stale tab writes are rejected atomically; in-app recovery retains its staged draft', async () => {
  const remote = server(), owner = crypto.randomUUID();
  const a = await new AccountStore(owner, remote.transport).initialize(); await a.synchronize();
  const b = await new AccountStore(owner, remote.transport).initialize();
  await a.saveData({ ...emptyData(), routines: [routine('Tab A')] });
  await assert.rejects(b.saveData({ ...emptyData(), routines: [routine('Tab B')] }), StorageConflictError);
  await b.recoverTab(); assert.equal((await b.loadData()).routines.length, 2); a.dispose(); b.dispose();
});

test('representative legacy migration preserves history, identifiers, economy and remains idempotent across interruption', async () => {
  const raw = JSON.parse(readFileSync('tests/fixtures/legacy-account.json', 'utf8'));
  const source = previewBackup(raw, emptyData()).merged;
  const remote = server(), owner = crypto.randomUUID();
  let store = await new AccountStore(owner, remote.transport).initialize(); await store.synchronize();
  const merged = previewBackup(createBackup(source), await store.loadData()).merged;
  const beforeBalance = gameBalance(normalizeGame(merged.game), merged.workouts, merged.profile);
  await store.migrate(merged, 'legacy:test'); remote.lose(); await assert.rejects(store.synchronize()); store.dispose();
  store = await new AccountStore(owner, remote.transport).initialize(); await store.migrate(merged, 'legacy:test'); await store.synchronize();
  const after = await store.loadData();
  assert.deepEqual(after.workouts, merged.workouts); assert.deepEqual(after.game, merged.game);
  assert.equal(gameBalance(normalizeGame(after.game), after.workouts, after.profile), beforeBalance);
  assert.deepEqual(remote.snapshot().migrations, ['legacy:test']); assert.equal(remote.receipts.size, 1); store.dispose();
});

test('tombstones are monotonic and unrelated records survive merging', () => {
  const r = routine('Gone'); const base = { ...blankDocument(), data: { ...emptyData(), routines: [r] } };
  const deleted = documentAfter(base, emptyData()); const old = structuredClone(base);
  assert.deepEqual(mergeDocuments(base, old, deleted).document.data.routines, []);
  assert.ok(same(deleted.tombstones, [`routines:${r.id}`]));
});

test('an edit staged during a download cannot overwrite a remote update', async () => {
  const remote = server(), first = routine('A');
  const author = await new AccountStore(crypto.randomUUID(),remote.transport).initialize(); await author.synchronize();
  await author.saveData({...emptyData(),routines:[first]}); await author.synchronize();
  const reader = await new AccountStore(crypto.randomUUID(),remote.transport).initialize(); await reader.synchronize();
  const visible = await reader.loadData();
  let release!:()=>void, started!:()=>void;
  const ready = new Promise<void>(resolve=>{started=resolve;}); const barrier = new Promise<void>(resolve=>{release=resolve;});
  const transport:Transport={...remote.transport,download:async()=>{started();await barrier;return remote.transport.download();}};
  // Initialize a separate device on the same remote snapshot.
  const owner=crypto.randomUUID(); const racer=await new AccountStore(owner,remote.transport).initialize();await racer.synchronize();const staleView=await racer.loadData();racer.dispose();
  const delayed=await new AccountStore(owner,transport).initialize();await delayed.loadData();
  await author.saveData({...emptyData(),routines:[{...first,name:'Remote edit'}]});await author.synchronize();
  const sync=delayed.synchronize();await ready;
  const latest={...staleView,preferences:{effects:false,sound:false}};delayed.stageData(latest);release();await sync;await delayed.flushData();await delayed.synchronize();
  assert.equal((await delayed.loadData()).routines[0].name,'Remote edit');
  assert.deepEqual(remote.snapshot().data.preferences,{effects:false,sound:false});
  reader.dispose();delayed.dispose();author.dispose();assert.equal(visible.routines.length,1);
});

test('a stale UI snapshot merges with an already downloaded record before local commit', async()=>{
  const remote=server(),a=await new AccountStore(crypto.randomUUID(),remote.transport).initialize(),b=await new AccountStore(crypto.randomUUID(),remote.transport).initialize();
  await a.synchronize();await b.synchronize();const stale=await b.loadData();
  const added=routine('Remote while editor open');await a.saveData({...emptyData(),routines:[added]});await a.synchronize();await b.synchronize();
  // Simulate input queued just before the UI remount observes the new download.
  await b.saveData({...stale,preferences:{effects:false,sound:true}});await b.synchronize();
  assert.equal(remote.snapshot().data.routines[0].id,added.id);assert.equal(remote.snapshot().data.preferences?.sound,true);a.dispose();b.dispose();
});

test('many unsaved keystrokes and queued saves are one local continuation, not a conflict', async()=>{
  const remote=server(),store=await new AccountStore(crypto.randomUUID(),remote.transport).initialize();await store.synchronize();await store.loadData();
  const r=routine('');
  for(const name of ['R','Ro','Rou'])store.stageData({...emptyData(),routineDraft:{...r,name}});
  const final={...emptyData(),routineDraft:{...r,name:'Routine'}};store.stageData(final);const first=store.saveData(final);
  const saved={...emptyData(),routines:[{...r,name:'Routine'}]};store.stageData(saved);const last=store.saveData(saved);
  await first;await last;
  // A delayed duplicate save from the previous render cannot restore the draft.
  await store.saveData(final);assert.equal(store.getSnapshot().draft.data.routineDraft,undefined);assert.equal(store.conflicts().length,0);
  await store.synchronize();assert.equal(store.status,'synced');store.dispose();
});

test('closing a session durably flushes staged changes without sending them', async()=>{
  const remote=server(),owner=crypto.randomUUID(),store=await new AccountStore(owner,remote.transport).initialize();await store.synchronize();
  const staged={...emptyData(),routines:[routine('Pending at sign-out')]};store.stageData(staged);await store.closePreservingPending();
  assert.equal(remote.receipts.size,0);const disk=await readCache(owner);assert.equal(disk?.draft.data.routines[0].name,'Pending at sign-out');
  const reopened=await new AccountStore(owner,remote.transport).initialize();await reopened.synchronize();assert.equal(remote.receipts.size,1);reopened.dispose();
});

test('profile and preferences in a migration require an explicit conflict decision', async()=>{
  const {previewLegacy}=await import('../src/lib/remote/migration');
  const current={...blankDocument(),data:{...emptyData(),profile:{weightKg:80,heightCm:180,age:25,sex:'male' as const},preferences:{effects:true,sound:false}}};
  const source={...emptyData(),profile:{weightKg:75,heightCm:180,age:25,sex:'male' as const},preferences:{effects:false,sound:true}};
  const pending=previewLegacy(source,current);assert.ok(pending.conflicts.includes('migration:profile'));assert.ok(pending.conflicts.includes('migration:preferences'));
  const resolved=previewLegacy(source,current,{'migration:profile':'incoming','migration:preferences':'local'});assert.equal(resolved.conflicts.length,0);assert.equal(resolved.merged.profile?.weightKg,75);assert.equal(resolved.merged.preferences?.sound,false);
});

test('a stalled network request never blocks durable training edits or local logout',async()=>{
  const remote=server(),owner=crypto.randomUUID();const store=await new AccountStore(owner,remote.transport).initialize();await store.synchronize();await store.loadData();store.dispose();
  let release!:()=>void,started!:()=>void;const barrier=new Promise<void>(r=>{release=r}),ready=new Promise<void>(r=>{started=r});
  const stalled=await new AccountStore(owner,{...remote.transport,download:async()=>{started();await barrier;return remote.transport.download();}}).initialize();await stalled.loadData();
  const network=stalled.synchronize();await ready;
  const next={...emptyData(),routines:[routine('Saved while network stalls')]};await stalled.saveData(next);
  assert.equal((await readCache(owner))?.draft.data.routines[0].name,'Saved while network stalls');
  await stalled.closePreservingPending();release();await assert.rejects(network,/sesión ha cambiado/);
});

test('sync preserves saved routine/exercise order and appends independent local additions',()=>{
  const a={...routine('First saved'),id:'ffffffff-ffff-4fff-bfff-ffffffffffff'};
  const b={...routine('Second saved'),id:'00000000-0000-4000-8000-000000000001'};
  const extra=routine('Added offline');
  const base={...blankDocument(),data:{...emptyData(),routines:[a,b]}};
  const local={...base,data:{...base.data,routines:[a,b,extra]}};
  const download=mergeDocuments(base,base,base);assert.deepEqual(download.document.data.routines.map(x=>x.id),[a.id,b.id]);
  const merged=mergeDocuments(base,local,base);assert.deepEqual(merged.document.data.routines.map(x=>x.id),[a.id,b.id,extra.id]);
  const newAccount=mergeDocuments(blankDocument(),base,blankDocument());assert.deepEqual(newAccount.document.data.routines.map(x=>x.id),[a.id,b.id]);
  const custom=[{id:a.id,name:'First own',group:'Pecho',mode:'external_load_reps' as const},{id:b.id,name:'Second own',group:'Espalda',mode:'external_load_reps' as const}];
  const exercises={...blankDocument(),data:{...emptyData(),customExercises:custom}};
  assert.deepEqual(mergeDocuments(exercises,exercises,exercises).document.data.customExercises.map(x=>x.id),[a.id,b.id]);
});
