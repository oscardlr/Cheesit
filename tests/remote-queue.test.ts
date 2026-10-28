import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRemote, prepareOperation, queueChange, readOwner, recordReceipt, resolveRevision } from '../src/lib/remote/queue';
import type { RemoteEntity } from '../src/lib/remote/types';

const row = (owner: string, id: string, revision: number, name: string): RemoteEntity => ({
  owner_id: owner, entity_type: 'routine', id, revision, payload: { id, name }, deleted: false,
  created_at: '2026-10-27T00:00:00Z', updated_at: '2026-10-27T00:00:00Z',
});

test('queues are isolated, retain newer edits and only advance base after acknowledgement', async () => {
  const owner = crypto.randomUUID(), other = crypto.randomUUID(), id = crypto.randomUUID(), device = crypto.randomUUID();
  await queueChange(owner, device, 'routine', { id, name: 'first' });
  await queueChange(owner, device, 'routine', { id, name: 'second' });
  await queueChange(other, device, 'routine', { id, name: 'other' });
  let a = await readOwner(owner), b = await readOwner(other);
  assert.equal(a.operations.length, 2); assert.equal(b.operations.length, 1);
  assert.equal(a.entities[0].payload.name, 'second');
  const first = await prepareOperation(a.operations[0]);
  assert.equal(first.baseRevision, 0);
  const retry = await prepareOperation(first);
  assert.deepEqual(retry, first);
  await recordReceipt(first, { status: 'applied', revision: 1 });
  a = await readOwner(owner);
  assert.equal(a.entities[0].payload.name, 'second');
  assert.equal((await prepareOperation(a.operations[0])).baseRevision, 1);
  b = await readOwner(other); assert.equal(b.entities[0].payload.name, 'other');
});

test('download preserves pending data and revision conflict is resolved explicitly', async () => {
  const owner = crypto.randomUUID(), id = crypto.randomUUID(), device = crypto.randomUUID();
  await mergeRemote(owner, [row(owner, id, 2, 'remote')]);
  await queueChange(owner, device, 'routine', { id, name: 'local' });
  await mergeRemote(owner, [row(owner, id, 3, 'new remote')]);
  let state = await readOwner(owner);
  assert.equal(state.entities[0].payload.name, 'local');
  const op = await prepareOperation(state.operations[0]);
  assert.equal(op.baseRevision, 2);
  await recordReceipt(op, { status: 'conflict', reason: 'revision', entity: row(owner, id, 3, 'new remote') });
  state = await readOwner(owner); assert.equal(state.operations[0].state, 'blocked');
  await resolveRevision(owner, op.operationId, 'local', device);
  state = await readOwner(owner);
  assert.equal(state.operations.length, 1);
  assert.notEqual(state.operations[0].operationId, op.operationId);
  assert.equal(state.operations[0].baseRevision, 3);
  assert.equal(state.entities[0].payload.name, 'local');
});
