import 'fake-indexeddb/auto';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorageClient, StorageConflictError } from '../src/lib/storage';
import { emptyData } from '../src/lib/model';

function resetDatabase() { globalThis.indexedDB = new IDBFactory(); }

test('two tabs atomically reject a stale revision and preserve the committed history', async () => {
  resetDatabase();
  const first = createStorageClient(), second = createStorageClient();
  const a = await first.loadData(), b = await second.loadData();
  a.preferences = { effects: false, sound: false };
  b.preferences = { effects: true, sound: true };
  const results = await Promise.allSettled([first.saveData(a), second.saveData(b)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const failed = results.find(result => result.status === 'rejected');
  assert.ok(failed?.status === 'rejected' && failed.reason instanceof StorageConflictError);
  const winner = await createStorageClient().loadData();
  assert.deepEqual(winner.preferences, results[0].status === 'fulfilled' ? a.preferences : b.preferences);
  const loser = results[0].status === 'rejected' ? first : second;
  assert.equal(loser.hasPendingData(), true);
  await assert.rejects(loser.flushData(), StorageConflictError);
});

test('failed writes retain the latest staged data and retry only reports success after commit', async () => {
  resetDatabase();
  const committed: number[] = [];
  const client = createStorageClient(revision => committed.push(revision));
  await client.loadData();
  const pending = { ...emptyData(), preferences: { effects: false, sound: true } };
  client.stageData(pending);
  const open = indexedDB.open.bind(indexedDB);
  indexedDB.open = () => { throw new DOMException('Quota exhausted', 'QuotaExceededError'); };
  await assert.rejects(client.flushData(), { name: 'QuotaExceededError' });
  assert.equal(client.getPendingData(), pending);
  assert.deepEqual(committed, []);
  indexedDB.open = open;
  await client.flushData();
  assert.equal(client.hasPendingData(), false);
  assert.deepEqual(committed, [1]);
  assert.deepEqual((await createStorageClient().loadData()).preferences, pending.preferences);
});

test('queued writes snapshot values and flush writes the latest stage without a debounce', async () => {
  resetDatabase();
  const client = createStorageClient();
  await client.loadData();
  const first = { ...emptyData(), preferences: { effects: false, sound: true } };
  const saved = client.saveData(first);
  first.preferences.sound = false;
  await saved;
  assert.equal((await createStorageClient().loadData()).preferences?.sound, true);
  const latest = { ...emptyData(), preferences: { effects: true, sound: false } };
  client.stageData(latest);
  await client.flushData();
  assert.deepEqual((await createStorageClient().loadData()).preferences, latest.preferences);
});

test('a successful put request followed by transaction abort never reports a saved state', async () => {
  resetDatabase();
  const revisions: number[] = [];
  const client = createStorageClient(revision => revisions.push(revision));
  await client.loadData();
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value, key) {
    const request = put.call(this, value, key);
    if (key === 'local') request.addEventListener('success', () => this.transaction.abort());
    return request;
  };
  try {
    await assert.rejects(client.saveData({ ...emptyData(), preferences: { effects: false, sound: false } }));
    assert.deepEqual(revisions, []);
    assert.equal(client.hasPendingData(), true);
    assert.equal((await createStorageClient().loadData()).preferences, undefined);
  } finally { IDBObjectStore.prototype.put = put; }
  await client.flushData();
  assert.deepEqual(revisions, [1]);
});

test('quote migration commits once atomically across concurrent loads and purchase retry keeps one reserved prize', async () => {
  resetDatabase();
  const { normalizeGame, openCrate, gameBalance } = await import('../src/lib/game');
  const initial = createStorageClient(); await initial.loadData();
  const itemId = crypto.randomUUID(), now = '2026-10-27T12:00:00Z';
  const legacy = { ...emptyData(), game: { ...normalizeGame(), inventory: [{ id: itemId, quoteId: 'show-up', rarity: 'common' as const, acquiredAt: now, crateId: 'starter', sold: false }], transactions: [{ id: crypto.randomUUID(), kind: 'crate' as const, itemId, amount: -100, createdAt: now }] } };
  delete legacy.game.quoteConversionVersion; delete legacy.game.quoteConversions;
  // Seed a real old snapshot, bypassing the new save normalizer.
  const db = await new Promise<IDBDatabase>((resolve,reject) => { const request=indexedDB.open('entrenos-local',1); request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error); });
  await new Promise<void>((resolve,reject) => { const tx=db.transaction('state','readwrite');tx.objectStore('state').put(legacy,'local');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error); }); db.close();
  const a=createStorageClient(), b=createStorageClient();
  const [first,second]=await Promise.all([a.loadData(),b.loadData()]);
  assert.deepEqual(first,second);assert.equal(a.getRevision(),1);assert.equal(b.getRevision(),1);
  assert.equal(first.game!.quoteConversions!.length,1);assert.equal(gameBalance(first.game!,[],undefined,0),15);
  const reloaded=createStorageClient();assert.deepEqual(await reloaded.loadData(),first);assert.equal(reloaded.getRevision(),1);
  const purchase=openCrate(normalizeGame(),[],'starter')!;
  const next={...emptyData(),game:purchase.game};
  const open=indexedDB.open.bind(indexedDB);
  indexedDB.open=()=>{throw new DOMException('Quota exhausted','QuotaExceededError')};
  await assert.rejects(a.saveData(next),{name:'QuotaExceededError'});
  assert.equal(a.getPendingData()!.game!.pendingOpening!.itemId,purchase.item.id);
  assert.equal(openCrate(a.getPendingData()!.game!,[],'starter'),null);
  indexedDB.open=open;
  await Promise.all([a.flushData(),a.saveData(next)]);
  const saved=(await createStorageClient().loadData()).game!;
  assert.deepEqual(saved.inventory,purchase.game.inventory);assert.deepEqual(saved.transactions,purchase.game.transactions);
  assert.equal(saved.pendingOpening!.itemId,purchase.item.id);
});

test('synchronous IndexedDB put errors abort cleanly and retain the exact staged prize for retry', async () => {
  resetDatabase();
  const { normalizeGame, openCrate } = await import('../src/lib/game');
  const client=createStorageClient();await client.loadData();
  const prize=openCrate(normalizeGame(),[],'starter')!;
  const next={...emptyData(),game:prize.game};
  const put=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(value,key){if(key==='local')throw new DOMException('Quota exhausted','QuotaExceededError');return put.call(this,value,key)};
  try {await assert.rejects(client.saveData(next),{name:'QuotaExceededError'});assert.equal(client.getPendingData(),next);assert.equal(client.getRevision(),0);}
  finally {IDBObjectStore.prototype.put=put;}
  await client.flushData();
  const saved=(await createStorageClient().loadData()).game!;
  assert.deepEqual(saved.inventory,prize.game.inventory);assert.deepEqual(saved.transactions,prize.game.transactions);
});
