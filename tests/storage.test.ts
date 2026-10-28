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
