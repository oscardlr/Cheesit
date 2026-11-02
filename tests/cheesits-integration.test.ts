import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createBackup, previewBackup } from '../src/lib/backup';
import { COMPANION_PASSIVES, applyWorkoutPassive, snapshotWorkoutPassive } from '../src/lib/cheesit-passives';
import { COMPANIONS } from '../src/lib/companions';
import { COMPANION_DROP_CHANCE, CRATES, equipCompanion, gameBalance, GEAR_DROP_CHANCE, isGameState, normalizeGame, openCrate, QUOTE_DROP_CHANCE, rarityForRoll, revealReservedOpening, rewardForRoll, unlockedCompanions, type GameState, type InventoryItem, type Rarity } from '../src/lib/game';
import { newWorkout, type AppData, type Workout } from '../src/lib/model';
import { workoutReward } from '../src/lib/rewards';
import { mergeRemote, prepareOperation, queueChange, readOwner, recordReceipt, resolveRevision } from '../src/lib/remote/queue';
import type { EntityPayload, RemoteEntity } from '../src/lib/remote/types';
import { createStorageClient } from '../src/lib/storage';

const empty = (): AppData => ({ routines: [], workouts: [], customExercises: [] });
function owned(ids: string[]): GameState {
  const acquiredAt = new Date().toISOString();
  const inventory: InventoryItem[] = ids.map(companionId => ({
    id: crypto.randomUUID(), kind: 'companion', companionId,
    rarity: COMPANIONS.find(value => value.id === companionId)?.rarity ?? 'common',
    acquiredAt, crateId: 'starter', sold: false,
  }));
  const game: GameState = { ...normalizeGame(), inventory, transactions: inventory.map(item => ({ id: crypto.randomUUID(), kind: 'crate', itemId: item.id, amount: -100, createdAt: acquiredAt })) };
  assert.ok(isGameState(game));
  return game;
}
function completed(game: GameState): Workout {
  const draft = newWorkout(undefined, undefined, undefined, game);
  return applyWorkoutPassive({ ...draft, status: 'finished', exercises: [{
    id: crypto.randomUUID(), exerciseId: 'press-banca-barra', name: 'Press de banca', group: 'Pecho', mode: 'external_load_reps',
    sets: [{ id: crypto.randomUUID(), confirmed: true, weight: 50, reps: 8 }],
  }] }, []);
}
function remoteRow(owner: string, workout: Workout, revision: number, deleted = false): RemoteEntity {
  return { owner_id: owner, entity_type: 'session', id: workout.id, payload: JSON.parse(JSON.stringify(workout)) as EntityPayload,
    deleted, revision, created_at: workout.createdAt, updated_at: workout.updatedAt };
}

test('all eight cheesits use existing rarity and reward odds; both entries of each rarity are reachable', () => {
  assert.deepEqual([GEAR_DROP_CHANCE, QUOTE_DROP_CHANCE, COMPANION_DROP_CHANCE], [.55/.75, 0, .2/.75]);
  assert.deepEqual(CRATES.map(crate => crate.odds), [
    { common: 70, rare: 23, epic: 6, legendary: 1 },
    { common: 35, rare: 43, epic: 18, legendary: 4 },
    { common: 0, rare: 55, epic: 35, legendary: 10 },
  ]);
  for (const rarity of ['common', 'rare', 'epic', 'legendary'] as Rarity[]) {
    const pool = COMPANIONS.filter(value => value.rarity === rarity);
    assert.equal(pool.length, 2);
    assert.deepEqual(new Set([rewardForRoll(rarity, .8, 0).id, rewardForRoll(rarity, .9999, .9999).id]), new Set(pool.map(value => value.id)));
    assert.equal(rewardForRoll(rarity, .54999, 0).kind, 'gear');
    assert.equal(rewardForRoll(rarity, .55, 0).kind, 'gear');
    assert.equal(rewardForRoll(rarity, .79999, 0).kind, 'companion');
  }
  assert.equal(rarityForRoll(CRATES[0], .69999), 'common');
  assert.equal(rarityForRoll(CRATES[0], .7), 'rare');
});

test('crate purchases can repeat every cheesit even with a complete collection', () => {
  for (const [rarity, rarityRoll] of [['common', .1], ['rare', .8], ['epic', .95], ['legendary', .999]] as const) {
    const pool = COMPANIONS.filter(value => value.rarity === rarity);
    for (const [index, itemRoll] of [0, .99999].entries()) {
      const original = owned(COMPANIONS.map(value => value.id));
      const workout = completed(original);
      workout.exercises[0].sets = Array.from({ length: 200 }, () => ({ ...workout.exercises[0].sets[0], id: crypto.randomUUID() }));
      const rolls = [rarityRoll, .9, itemRoll];
      const random = mock.method(crypto, 'getRandomValues', (array: Uint32Array) => {
        assert.ok(rolls.length);
        array[0] = Math.floor(rolls.shift()! * 4294967296);
        return array;
      });
      try {
        const purchase = openCrate(original, [workout], 'starter')!;
        assert.ok(purchase);
        assert.equal(purchase.item.kind, 'companion');
        assert.equal(purchase.item.companionId, pool[index].id);
        assert.equal(purchase.item.rarity, rarity);
        const revealed = normalizeGame(revealReservedOpening(purchase.game));
        assert.equal(revealed.inventory.filter(item => item.companionId === pool[index].id).length, 2);
        assert.equal(original.inventory.length, COMPANIONS.length);
        assert.equal(revealed.transactions.length, original.transactions.length + 1);
        assert.equal(gameBalance(revealed, [workout]), gameBalance(original, [workout]) - 100);
        assert.ok(isGameState(revealed));
      } finally { random.mock.restore(); }
    }
  }
});

test('unknown cheesit IDs retain the complete ledger and known collection through normalization and backup', () => {
  const source = { ...owned(['athlete', 'future-cheesit']), equippedCompanionId: 'future-cheesit' };
  assert.ok(isGameState(source));
  const normalized = normalizeGame(JSON.parse(JSON.stringify(source)));
  assert.deepEqual(normalized.inventory, source.inventory);
  assert.deepEqual(normalized.transactions, source.transactions);
  assert.deepEqual(unlockedCompanions(normalized).map(value => value.id), ['athlete']);
  assert.strictEqual(equipCompanion(normalized, 'future-cheesit'), normalized);
  assert.equal(newWorkout(undefined, undefined, undefined, normalized).companionPassive, null);
  const restored = previewBackup(createBackup({ ...empty(), game: normalized }), empty()).merged;
  assert.deepEqual(restored.game, normalized);
  assert.equal(restored.game!.inventory.length, 2);
  assert.equal(equipCompanion(restored.game!, 'athlete').equippedCompanionId, 'athlete');
});

test('offline save, reload, changed equipment and repeated import preserve the frozen award', async () => {
  const initial = equipCompanion(owned(['athlete', 'iris']), 'athlete');
  const workout = completed(initial);
  assert.equal(workout.companionReward?.bonusXp, 20);
  const state: AppData = { ...empty(), game: equipCompanion(initial, 'iris'), workouts: [workout] };
  const writer = createStorageClient();
  await writer.loadData();
  await writer.saveData(state);
  const reloaded = await createStorageClient().loadData();
  assert.deepEqual(reloaded.workouts[0].companionReward, workout.companionReward);
  assert.equal(reloaded.game!.equippedCompanionId, 'iris');
  assert.deepEqual(applyWorkoutPassive(reloaded.workouts[0], reloaded.workouts).companionReward, workout.companionReward);
  const restored = previewBackup(createBackup(reloaded), empty()).merged;
  const repeated = previewBackup(createBackup(reloaded), restored);
  assert.deepEqual(repeated.conflicts, []);
  assert.equal(repeated.merged.workouts.length, 1);
  assert.deepEqual(repeated.merged.workouts[0].companionReward, workout.companionReward);
  assert.equal(gameBalance(repeated.merged.game!, repeated.merged.workouts, undefined, 0), gameBalance(state.game!, state.workouts, undefined, 0));
});

test('remote retries, pending edits and repeated downloads retain the same passive event and payout', async () => {
  const game = equipCompanion(owned(['iris']), 'iris');
  const workout = completed(game);
  const owner = crypto.randomUUID(), device = crypto.randomUUID();
  const payload = JSON.parse(JSON.stringify(workout)) as EntityPayload;
  await queueChange(owner, device, 'session', payload);
  const queued = (await readOwner(owner)).operations[0];
  const first = await prepareOperation(queued);
  assert.deepEqual(await prepareOperation(first), first, 'a retry preserves request identity and content');
  assert.deepEqual((first.payload as unknown as Workout).companionReward, workout.companionReward);
  await recordReceipt(first, { status: 'applied', revision: 1 });
  const renamed = { ...workout, name: 'Sesión editada sin volver a cobrar' };
  await queueChange(owner, device, 'session', JSON.parse(JSON.stringify(renamed)) as EntityPayload);
  await mergeRemote(owner, [remoteRow(owner, { ...workout, name: 'Versión remota anterior' }, 2)]);
  let downloaded = await readOwner(owner);
  assert.equal(downloaded.entities[0].payload.name, renamed.name);
  const second = await prepareOperation(downloaded.operations[0]);
  assert.equal(second.baseRevision, 1);
  await recordReceipt(second, { status: 'applied', revision: 2 });
  await mergeRemote(owner, [remoteRow(owner, renamed, 3)]);
  await mergeRemote(owner, [remoteRow(owner, renamed, 3)]);
  downloaded = await readOwner(owner);
  assert.equal(downloaded.operations.length, 0);
  assert.equal(downloaded.entities.length, 1);
  const synced = downloaded.entities[0].payload as unknown as Workout;
  assert.deepEqual(synced.companionPassive, workout.companionPassive);
  assert.deepEqual(synced.companionReward, workout.companionReward);
  assert.equal(workoutReward(synced, [synced]).companionCredits, 2);
  assert.equal(gameBalance(game, [synced, synced], undefined, 0), gameBalance(game, [workout], undefined, 0));
  await mergeRemote(owner, [remoteRow(owner, renamed, 4, true)]);
  downloaded = await readOwner(owner);
  assert.equal(downloaded.entities[0].deleted, true);
  assert.deepEqual((downloaded.entities[0].payload as unknown as Workout).companionReward, workout.companionReward);
});

test('repeating history creates a new snapshot while legacy drafts and historical sessions stay ineligible', () => {
  const originalGame = equipCompanion(owned(['athlete', 'iris']), 'athlete');
  const original = completed(originalGame);
  const changed = equipCompanion(originalGame, 'iris');
  const now = new Date().toISOString();
  const repeated = snapshotWorkoutPassive({ ...original, id: crypto.randomUUID(), status: 'draft', createdAt: now, updatedAt: now, startedAt: now }, changed);
  assert.equal(repeated.companionReward, undefined);
  assert.equal(repeated.companionPassive?.companionId, 'iris');
  assert.equal(repeated.companionPassive?.workoutId, repeated.id);
  assert.notEqual(repeated.companionPassive?.workoutId, original.id);
  assert.equal(original.companionReward?.companionId, 'athlete');
  const { companionPassive: _passive, companionReward: _reward, ...legacy } = original;
  const legacyDraft = { ...legacy, status: 'draft' as const };
  assert.equal(applyWorkoutPassive({ ...legacyDraft, status: 'finished' }, [legacyDraft]).companionReward, undefined);
  const historical = completed(changed);
  const backdated = { ...historical, id: crypto.randomUUID(), date: '2026-01-01', companionReward: undefined };
  backdated.companionPassive = { ...historical.companionPassive!, workoutId: backdated.id };
  assert.equal(applyWorkoutPassive(backdated, []).companionReward?.reason, 'historical-date');
  assert.equal(workoutReward(applyWorkoutPassive(backdated, []), []).companionCredits, 0);
});

test('both explicit revision-conflict choices retain one frozen award through synchronization', async () => {
  const game = equipCompanion(owned(['athlete']), 'athlete');
  const workout = completed(game);
  for (const choice of ['local', 'server'] as const) {
    const owner = crypto.randomUUID(), device = crypto.randomUUID();
    await mergeRemote(owner, [remoteRow(owner, workout, 1)]);
    await queueChange(owner, device, 'session', JSON.parse(JSON.stringify({ ...workout, name: 'Edición local' })) as EntityPayload);
    const pending = await prepareOperation((await readOwner(owner)).operations[0]);
    const server = remoteRow(owner, { ...workout, name: 'Edición remota' }, 2);
    await recordReceipt(pending, { status: 'conflict', reason: 'revision', entity: server });
    await resolveRevision(owner, pending.operationId, choice, device);
    let state = await readOwner(owner);
    if (choice === 'local') {
      assert.equal(state.operations.length, 1);
      const retry = await prepareOperation(state.operations[0]);
      assert.equal(retry.baseRevision, 2);
      assert.deepEqual((retry.payload as unknown as Workout).companionReward, workout.companionReward);
      await recordReceipt(retry, { status: 'applied', revision: 3 });
      state = await readOwner(owner);
    }
    assert.equal(state.operations.length, 0);
    assert.equal(state.entities.length, 1);
    assert.equal(state.entities[0].payload.name, choice === 'local' ? 'Edición local' : 'Edición remota');
    const resolved = state.entities[0].payload as unknown as Workout;
    assert.deepEqual(resolved.companionPassive, workout.companionPassive);
    assert.deepEqual(resolved.companionReward, workout.companionReward);
    assert.equal(gameBalance(game, [resolved], undefined, 0), gameBalance(game, [workout], undefined, 0));
  }
});

test('keeping local training edits during a remote conflict preserves the server passive event', async () => {
  const ownedGame = owned(['athlete', 'iris']);
  const local = completed(equipCompanion(ownedGame, 'athlete'));
  const alternate = snapshotWorkoutPassive({ ...local, status: 'draft', name: 'Versión del servidor' }, equipCompanion(ownedGame, 'iris'));
  const serverWorkout = applyWorkoutPassive({ ...alternate, status: 'finished' }, []);
  const owner = crypto.randomUUID(), device = crypto.randomUUID();
  await queueChange(owner, device, 'session', JSON.parse(JSON.stringify({ ...local, name: 'Mis cambios locales' })) as EntityPayload);
  const pending = await prepareOperation((await readOwner(owner)).operations[0]);
  const server = remoteRow(owner, serverWorkout, 3);
  await recordReceipt(pending, { status: 'conflict', reason: 'revision', entity: server });
  await resolveRevision(owner, pending.operationId, 'local', device);
  const state = await readOwner(owner);
  assert.equal(state.operations.length, 1);
  assert.equal(state.operations[0].baseRevision, server.revision);
  const resolved = state.entities[0].payload as unknown as Workout;
  assert.equal(resolved.name, 'Mis cambios locales');
  assert.deepEqual(resolved.exercises, local.exercises);
  assert.deepEqual(resolved.companionPassive, serverWorkout.companionPassive);
  assert.deepEqual(resolved.companionReward, serverWorkout.companionReward);
  assert.deepEqual((state.operations[0].payload as unknown as Workout).companionReward, serverWorkout.companionReward);
  assert.equal(workoutReward(resolved, [resolved]).companionXp, 0);
  assert.equal(workoutReward(resolved, [resolved]).companionCredits, 2);
  assert.equal(gameBalance(normalizeGame(), [resolved], undefined, 0), gameBalance(normalizeGame(), [serverWorkout], undefined, 0));
});

test('incoming backup edits preserve an already captured passive and its first finalization', () => {
  const game = equipCompanion(owned(['athlete', 'iris']), 'athlete');
  const original = completed(game);
  const erased = { ...original, name: 'Copia sin datos de pasiva', companionPassive: undefined, companionReward: undefined };
  const alternateDraft = snapshotWorkoutPassive({ ...original, status: 'draft', name: 'Copia con otro cheesit' }, equipCompanion(game, 'iris'));
  const alternate = applyWorkoutPassive({ ...alternateDraft, status: 'finished' }, []);
  for (const incoming of [erased, alternate]) {
    const current: AppData = { ...empty(), game, workouts: [original] };
    const imported = previewBackup(createBackup({ ...current, workouts: [incoming] }), current, { [`workouts:${original.id}`]: 'incoming' });
    assert.deepEqual(imported.conflicts, []);
    assert.equal(imported.merged.workouts[0].name, incoming.name, 'the selected training edit is accepted');
    assert.deepEqual(imported.merged.workouts[0].companionPassive, original.companionPassive);
    assert.deepEqual(imported.merged.workouts[0].companionReward, original.companionReward);
    assert.equal(workoutReward(imported.merged.workouts[0], []).companionXp, 20);
    assert.equal(workoutReward(imported.merged.workouts[0], []).companionCredits, 0);
  }
  const { companionPassive: _capture, companionReward: _award, ...legacy } = original;
  const existingLegacy: AppData = { ...empty(), game, workouts: [legacy] };
  const legacyImport = previewBackup(createBackup({ ...existingLegacy, workouts: [original] }), existingLegacy, { [`workouts:${original.id}`]: 'incoming' });
  assert.equal(legacyImport.merged.workouts[0].companionPassive, undefined);
  assert.equal(legacyImport.merged.workouts[0].companionReward, undefined, 'a finished legacy event cannot acquire a passive on import');
  const localDraft = { ...original, status: 'draft' as const, companionReward: undefined };
  const currentDraft: AppData = { ...empty(), game, workouts: [localDraft] };
  const completedImport = previewBackup(createBackup({ ...currentDraft, workouts: [original] }), currentDraft, { [`workouts:${original.id}`]: 'incoming' });
  assert.deepEqual(completedImport.merged.workouts[0].companionReward, original.companionReward, 'the same captured draft may receive its genuine first finalization');
});

test('account migration agrees with the versioned client catalog and preserves historical rows and the existing RPC', () => {
  const sql = readFileSync(new URL('../supabase/migrations/202610290002_cheesit_passives.sql', import.meta.url), 'utf8');
  const entries = [...sql.matchAll(/when '([^']+)' then v_passive := '([^']+)'; v_expected := '([^']+)'::jsonb/g)]
    .map(([, companionId, passiveId, parameters]) => ({ companionId, passiveId, parameters: JSON.parse(parameters) }));
  assert.deepEqual(entries, COMPANION_PASSIVES.map(passive => ({ companionId: passive.companionId, passiveId: passive.id, parameters: passive.parameters })));
  assert.match(sql, /create trigger entrenos_cheesit_passive_guard before insert or update on public\.entrenos_entities/i);
  assert.match(sql, /old\.payload->'companionPassive' is distinct from v_snapshot/);
  assert.match(sql, /old\.payload->'companionReward' is distinct from v_award/);
  assert.doesNotMatch(sql, /\bupdate\s+public\.entrenos_entities\s+set\b/i, 'no retroactive capture or reward backfill');
  assert.doesNotMatch(sql, /create or replace function public\.entrenos_apply_change/i, 'the authenticated, hashed and revisioned RPC stays intact');
});
