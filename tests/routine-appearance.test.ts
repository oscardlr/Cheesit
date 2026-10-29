import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBackup, previewBackup } from '../src/lib/backup';
import { COLORS, DEFAULT_ROUTINE_ICON, LEGACY_ROUTINE_COLORS, ROUTINE_ICONS, emptyData, isRoutineColor, isRoutineIcon, resolvedRoutineIcon, type AppData, type Routine } from '../src/lib/model';
import { createStorageClient } from '../src/lib/storage';
import { mergeRemote, prepareOperation, queueChange, readOwner, recordReceipt, resolveRevision } from '../src/lib/remote/queue';
import type { RemoteEntity } from '../src/lib/remote/types';

const routine = (): Routine => ({ id: crypto.randomUUID(), name: 'Tren superior', color: LEGACY_ROUTINE_COLORS[1], archived: false, exercises: [{ id: crypto.randomUUID(), exerciseId: 'press-banca-barra', sets: 3 }] });
const withRoutine = (value: Routine): AppData => ({ ...emptyData(), routines: [value] });

test('legacy routines receive a display default while backup data and colors remain unchanged', () => {
  const original = routine();
  assert.equal(resolvedRoutineIcon(original.icon), DEFAULT_ROUTINE_ICON);
  assert.equal(resolvedRoutineIcon('unknown'), DEFAULT_ROUTINE_ICON);
  const restored = previewBackup(JSON.parse(JSON.stringify(createBackup(withRoutine(original)))), emptyData()).merged;
  assert.deepEqual(restored.routines[0], original);
  assert.equal(Object.hasOwn(restored.routines[0], 'icon'), false);
  for (const color of [...COLORS, ...LEGACY_ROUTINE_COLORS]) {
    assert.ok(isRoutineColor(color));
    const data = withRoutine({ ...original, color, icon: 'target' });
    assert.deepEqual(previewBackup(createBackup(data), emptyData()).merged.routines, data.routines);
  }
});

test('missing and explicit default icons are equivalent on repeated imports, including recovery drafts', () => {
  const old = routine();
  const current: AppData = { ...withRoutine(old), routineDraft: { ...old, name: 'Edición pendiente' } };
  const incoming: AppData = { ...withRoutine({ ...old, icon: DEFAULT_ROUTINE_ICON }), routineDraft: { ...current.routineDraft!, icon: DEFAULT_ROUTINE_ICON } };
  const preview = previewBackup(createBackup(incoming), current);
  assert.deepEqual(preview.conflicts, []);
  assert.equal(preview.duplicateCounts.routines, 1);
  assert.deepEqual(preview.merged, current);
});

test('selected icons survive import, deliberate conflict duplication and incomplete draft recovery', () => {
  const local = routine();
  const incoming: AppData = { ...withRoutine({ ...local, icon: 'mountain', color: COLORS[4] }), routineDraft: { ...local, icon: 'heart-pulse', exercises: [{ ...local.exercises[0], sets: null, targetWeight: null }] } };
  const restored = previewBackup(JSON.parse(JSON.stringify(createBackup(incoming))), emptyData()).merged;
  assert.deepEqual(restored, incoming);
  assert.equal(Object.hasOwn(restored.routines[0].exercises[0], 'targetWeight'), false);
  assert.equal(restored.routineDraft?.exercises[0].targetWeight, null);
  const conflict = previewBackup(createBackup(incoming), withRoutine(local));
  assert.equal(conflict.conflictDetails[0].key, `routines:${local.id}`);
  const both = previewBackup(createBackup(incoming), withRoutine(local), { [`routines:${local.id}`]: 'duplicate' }).merged;
  assert.equal(both.routines[0].icon, undefined);
  assert.equal(both.routines[1].icon, 'mountain');
  assert.equal(both.routines[1].color, COLORS[4]);
  assert.notEqual(both.routines[1].id, local.id);
  assert.notEqual(both.routines[1].exercises[0].id, local.exercises[0].id);
});

test('backup validation permits only known icons and retains required routine validation', () => {
  for (const icon of ROUTINE_ICONS) {
    assert.ok(isRoutineIcon(icon));
    assert.equal(previewBackup(createBackup(withRoutine({ ...routine(), icon })), emptyData()).merged.routines[0].icon, icon);
  }
  for (const icon of ['', 'arbitrary-icon', null, 0, {}]) {
    assert.equal(isRoutineIcon(icon), false);
    const invalid = createBackup(withRoutine(routine()));
    Object.assign(invalid.data.routines[0], { icon });
    assert.throws(() => previewBackup(invalid, emptyData()), /rutina/);
    invalid.data.routineDraft = { ...routine(), icon: 'flame' };
    invalid.data.routines = [];
    Object.assign(invalid.data.routineDraft, { icon });
    assert.throws(() => previewBackup(invalid, emptyData()), /borrador de rutina/);
  }
  const invalid = routine(); invalid.exercises[0].sets = 0;
  assert.throws(() => previewBackup(createBackup(withRoutine({ ...invalid, icon: 'flame' })), emptyData()), /ejercicio de rutina/);
});

test('local save and recovery preserve explicit icons, old colors and empty optional values', async () => {
  globalThis.indexedDB = new IDBFactory();
  const client = createStorageClient();
  await client.loadData();
  const original = { ...routine(), icon: 'timer' as const };
  const data: AppData = { ...withRoutine(original), routineDraft: { ...original, icon: 'activity', exercises: [{ ...original.exercises[0], sets: null, repsMin: null }] } };
  await client.saveData(data);
  const restored = await createStorageClient().loadData();
  assert.deepEqual(restored, data);
  assert.equal(restored.routines[0].color, LEGACY_ROUTINE_COLORS[1]);
  assert.equal(restored.routines[0].exercises[0].targetWeight, undefined);
  assert.equal(restored.routineDraft?.exercises[0].repsMin, null);
});

test('sync operations retain selected appearance on retry, acknowledgement, download and conflict resolution', async () => {
  globalThis.indexedDB = new IDBFactory();
  const owner = crypto.randomUUID(), device = crypto.randomUUID();
  const original = { ...routine(), icon: 'biceps-flexed' as const, color: COLORS[2] };
  await queueChange(owner, device, 'routine', original);
  let state = await readOwner(owner);
  const sending = await prepareOperation(state.operations[0]);
  assert.deepEqual(sending.payload, original);
  assert.deepEqual((await prepareOperation(sending)).payload, original);
  await recordReceipt(sending, { status: 'applied', revision: 1 });
  const payload = { ...original, icon: 'heart-pulse' as const };
  const remote: RemoteEntity = { owner_id: owner, entity_type: 'routine', id: original.id, revision: 2, payload, deleted: false, created_at: '2026-10-29T10:00:00Z', updated_at: '2026-10-29T10:01:00Z' };
  await mergeRemote(owner, [remote]);
  state = await readOwner(owner);
  assert.deepEqual(state.entities[0].payload, payload);
  await queueChange(owner, device, 'routine', { ...payload, icon: 'target' });
  const queued = await prepareOperation((await readOwner(owner)).operations[0]);
  await recordReceipt(queued, { status: 'conflict', reason: 'revision', entity: { ...remote, revision: 3 } });
  await resolveRevision(owner, queued.operationId, 'local', device);
  state = await readOwner(owner);
  assert.equal(state.operations[0].payload?.icon, 'target');
  assert.equal(state.operations[0].payload?.color, COLORS[2]);
  assert.equal(state.operations[0].baseRevision, 3);
});

test('account migration accepts every current and legacy routine appearance without rewriting stored rows', () => {
  const sql = readFileSync(new URL('../supabase/migrations/202610290001_routine_appearance.sql', import.meta.url), 'utf8');
  for (const color of [...COLORS, ...LEGACY_ROUTINE_COLORS]) assert.ok(sql.includes(`'${color}'`));
  for (const icon of ROUTINE_ICONS) assert.ok(sql.includes(`'${icon}'`));
  assert.match(sql, /p_payload \? 'icon'/);
  assert.doesNotMatch(sql, /update public\.entrenos_entities/);
});
