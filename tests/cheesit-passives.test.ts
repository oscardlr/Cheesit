import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMPANIONS } from '../src/lib/companions';
import { COMPANION_PASSIVES, applyWorkoutPassive, getCompanionPassive, isCompanionPassiveAward, isCompanionPassiveSnapshot, snapshotWorkoutPassive } from '../src/lib/cheesit-passives';
import { createBackup, previewBackup } from '../src/lib/backup';
import { equipCompanion, gameBalance, gameProgress, isGameState, normalizeGame, type GameState, type InventoryItem } from '../src/lib/game';
import { newWorkout, type AppData, type Workout, type WorkoutExercise } from '../src/lib/model';
import { rewardProgress, workoutReward } from '../src/lib/rewards';

const START = '2026-10-27T10:00:00.000Z';
function owned(...ids: string[]): GameState {
  const inventory: InventoryItem[] = ids.map(companionId => ({ id: crypto.randomUUID(), companionId, kind: 'companion', rarity: COMPANIONS.find(companion => companion.id === companionId)!.rarity, crateId: 'starter', acquiredAt: START, sold: false }));
  return { ...normalizeGame(), inventory, transactions: inventory.map(item => ({ id: crypto.randomUUID(), itemId: item.id, kind: 'crate', amount: -100, createdAt: START })) };
}
function exercise(group = 'Pecho', weight = 50, reps = 10, mode: WorkoutExercise['mode'] = 'external_load_reps'): WorkoutExercise {
  return { id: crypto.randomUUID(), exerciseId: mode === 'bodyweight_reps' ? 'flexiones' : 'press-banca-barra', name: 'Prueba', group, mode, sets: [{ id: crypto.randomUUID(), weight: mode === 'bodyweight_reps' ? 0 : weight, reps, confirmed: true }] };
}
function draft(companionId: string | null = 'athlete', exercises = [exercise()]): Workout {
  const game = owned(...COMPANIONS.map(companion => companion.id));
  return snapshotWorkoutPassive({ ...newWorkout(), date: '2026-10-27', createdAt: START, updatedAt: START, startedAt: START, exercises }, equipCompanion(game, companionId));
}
const finish = (workout: Workout, history: Workout[] = []) => applyWorkoutPassive({ ...workout, status: 'finished', finishedAt: START }, history);
const data = (workouts: Workout[] = [], game?: GameState): AppData => ({ routines: [], customExercises: [], workouts, ...(game ? { game } : {}) });

test('eight adult cheesits retain original IDs and have distinct permanent passive IDs', () => {
  assert.equal(COMPANIONS.length, 8);
  assert.deepEqual(COMPANIONS.slice(0, 4).map(companion => companion.id), ['athlete', 'warrior', 'sorceress', 'dragon-queen']);
  assert.ok(COMPANIONS.every(companion => companion.adult && getCompanionPassive(companion.id)));
  assert.equal(new Set(COMPANION_PASSIVES.map(passive => passive.id)).size, 8);
  assert.ok(COMPANION_PASSIVES.every(passive => passive.version === 1 && !('charges' in passive)));
  for (const rarity of ['common', 'rare', 'epic', 'legendary']) assert.equal(COMPANIONS.filter(companion => companion.rarity === rarity).length, 2);
});

test('equipment owns one passive, unequipping affects new sessions and consumes no active charges', () => {
  const game = owned('athlete', 'iris');
  assert.ok(isGameState(game));
  assert.strictEqual(equipCompanion(game, 'warrior'), game);
  const equipped = equipCompanion(game, 'athlete');
  const started = newWorkout(undefined, undefined, undefined, equipped);
  assert.equal(started.companionPassive?.companionId, 'athlete');
  const switched = equipCompanion(equipped, 'iris');
  assert.equal(newWorkout(undefined, undefined, undefined, switched).companionPassive?.companionId, 'iris');
  assert.equal(newWorkout(undefined, undefined, undefined, equipCompanion(switched, null)).companionPassive, null);
  const initial = structuredClone(game);
  const awarded = finish({ ...started, exercises: [exercise()] });
  assert.equal(awarded.companionReward?.bonusXp, 20);
  assert.equal(awarded.companionReward?.bonusCredits, 0);
  assert.deepEqual(game, initial);
  assert.deepEqual(game.abilityUses, []);
  assert.equal(awarded.abilityReward, undefined);
});

test('one snapshot survives equipment changes before completion, edits and reloads', () => {
  const started = draft();
  const completed = finish(started, [started]);
  assert.equal(completed.companionReward?.passiveId, 'neon-finish');
  const changed = snapshotWorkoutPassive({ ...completed, status: 'draft' }, equipCompanion(owned('iris'), 'iris'));
  const resaved = finish(changed, [completed]);
  assert.deepEqual(resaved.companionReward, completed.companionReward);
  assert.deepEqual(resaved.companionPassive, completed.companionPassive);
  const reloaded = JSON.parse(JSON.stringify(completed)) as Workout;
  assert.deepEqual(finish(reloaded, [completed]).companionReward, completed.companionReward);
  assert.equal(rewardProgress([completed, reloaded]).xp, rewardProgress([completed]).xp);
  assert.equal(gameBalance(normalizeGame(), [completed, reloaded]), gameBalance(normalizeGame(), [completed]));
});

test('flat bonuses have an exact integer cap and use the existing XP to credit floor', () => {
  const small = finish(draft());
  const many = finish(draft('athlete', Array.from({ length: 20 }, () => exercise())));
  assert.equal(small.companionReward?.bonusXp, 20);
  assert.equal(many.companionReward?.bonusXp, 20);
  const normal = { ...small, companionReward: undefined };
  const base = workoutReward(normal, []), reward = workoutReward(small, []);
  assert.equal(reward.totalXp - base.totalXp, 20);
  assert.equal(reward.companionXp, 20);
  assert.equal(reward.credits, Math.floor(reward.totalXp / 5));
  const credits = finish(draft('iris'));
  assert.equal(credits.companionReward?.bonusCredits, 2);
  assert.equal(workoutReward(credits, []).companionCredits, 2);
  const before = gameBalance(normalizeGame(), [{ ...credits, companionReward: undefined }]);
  assert.equal(gameBalance(normalizeGame(), [credits]) - before, 2);
});

test('variety thresholds count only groups with valid confirmed sets and award once', () => {
  const incomplete = exercise('Espalda'); incomplete.sets[0].confirmed = false;
  const notEnough = finish(draft('sorceress', [exercise(), exercise('Pierna y glúteo'), incomplete]));
  assert.equal(notEnough.companionReward?.bonusXp, 0);
  const varied = finish(draft('sorceress', [exercise(), exercise('Espalda'), exercise('Pierna y glúteo')]));
  assert.equal(varied.companionReward?.bonusXp, 20);
  const balanced = finish(draft('dragon-queen', [exercise(), exercise('Espalda')]));
  assert.equal(balanced.companionReward?.bonusCredits, 4);
  assert.equal(finish(draft('dragon-queen')).companionReward?.bonusCredits, 0);
});

test('Kira needs a comparable previous record and caps multiple records at 15 XP', () => {
  const before = { ...draft(null), date: '2026-10-25', status: 'finished' as const };
  assert.equal(finish(draft('warrior')).companionReward?.bonusXp, 0);
  assert.equal(finish(draft('warrior', [exercise('Pecho', 55, 10), exercise('Pecho', 60, 10)]), [before]).companionReward?.bonusXp, 15);
  assert.equal(finish(draft('warrior', [exercise('Pecho', 55, 11)]), [before]).companionReward?.bonusXp, 0);
});

test('Lúa rewards a valid bodyweight exercise; Sol rewards effort notes without demanding high effort', () => {
  assert.equal(finish(draft('lua')).companionReward?.bonusXp, 0);
  assert.equal(finish(draft('lua', [exercise('Pecho', 0, 8, 'bodyweight_reps')])).companionReward?.bonusXp, 20);
  const tracked = exercise(); tracked.sets[0].rpe = 0;
  assert.equal(finish(draft('sol', [tracked])).companionReward?.bonusXp, 15);
  tracked.sets.push({ ...tracked.sets[0], id: crypto.randomUUID(), rpe: null, rir: 10 });
  assert.equal(finish(draft('sol', [tracked])).companionReward?.bonusXp, 15);
  tracked.sets.push({ ...tracked.sets[0], id: crypto.randomUUID(), rpe: null, rir: null });
  assert.equal(finish(draft('sol', [tracked])).companionReward?.bonusXp, 0);
});

test('Mara requires a prior session and a complete natural rest day', () => {
  const previous = { ...draft(null), date: '2026-10-25', status: 'finished' as const };
  assert.equal(finish(draft('mara')).companionReward?.bonusXp, 0);
  assert.equal(finish(draft('mara'), [previous]).companionReward?.bonusXp, 25);
  assert.equal(finish(draft('mara'), [{ ...previous, date: '2026-10-26' }]).companionReward?.bonusXp, 0);
  assert.equal(finish(draft('mara'), [{ ...previous, date: '2026-10-27' }]).companionReward?.bonusXp, 0);
  assert.equal(finish(draft('mara'), [{ ...previous, status: 'deleted' }]).companionReward?.bonusXp, 0);
});

test('legacy drafts, old finished sessions, changed historical dates and empty sessions cannot gain retroactive rewards', () => {
  const legacy = { ...draft(), companionPassive: undefined };
  assert.equal(finish(legacy).companionReward, undefined);
  assert.equal(finish({ ...draft(), id: legacy.id }, [{ ...legacy, status: 'finished' }]).companionReward, undefined);
  const historical = finish({ ...draft(), date: '2026-10-20' });
  assert.equal(historical.companionReward?.bonusXp, 0);
  assert.equal(historical.companionReward?.reason, 'historical-date');
  const empty = finish(draft('athlete', []));
  assert.equal(empty.companionReward?.bonusXp, 0);
  assert.equal(empty.companionReward?.reason, 'invalid-session');
});

test('editing preserves a frozen zero or positive result; deleting removes its earning power', () => {
  const failed = finish(draft('sorceress'));
  const edited = finish({ ...failed, exercises: [exercise(), exercise('Espalda'), exercise('Pierna y glúteo')] }, [failed]);
  assert.deepEqual(edited.companionReward, failed.companionReward);
  const earned = finish(draft());
  const editedLess = finish({ ...earned, exercises: [exercise('Espalda')] }, [earned]);
  assert.deepEqual(editedLess.companionReward, earned.companionReward);
  const withoutSets = { ...earned, exercises: [] };
  assert.equal(workoutReward(withoutSets, []).companionXp, 0);
  const deleted = { ...earned, status: 'deleted' as const };
  assert.equal(workoutReward(deleted, []).totalXp, 0);
  assert.equal(gameProgress(normalizeGame(), [deleted]).xp, 0);
});

test('snapshot and ledger validators reject modified parameters, copied IDs and fabricated grants', () => {
  const workout = finish(draft());
  assert.ok(isCompanionPassiveSnapshot(workout.companionPassive));
  assert.ok(isCompanionPassiveAward(workout.companionReward));
  assert.equal(isCompanionPassiveSnapshot({ ...workout.companionPassive, version: 2 }), false);
  assert.equal(isCompanionPassiveSnapshot({ ...workout.companionPassive, parameters: { xp: 999, credits: 0 } }), false);
  assert.equal(isCompanionPassiveAward({ ...workout.companionReward, bonusXp: 21 }), false);
  assert.equal(isCompanionPassiveAward({ ...workout.companionReward, eligible: false }), false);
  assert.equal(workoutReward({ ...workout, id: crypto.randomUUID() }, []).companionXp, 0);
});

test('backup re-import is idempotent, conflicting historical duplicates lose passive event data', () => {
  const workout = finish(draft('iris'));
  const raw = createBackup(data([workout]));
  const restored = previewBackup(raw, data());
  assert.deepEqual(restored.merged.workouts[0].companionReward, workout.companionReward);
  const repeated = previewBackup(raw, restored.merged);
  assert.equal(repeated.newCounts.workouts, 0);
  assert.equal(repeated.merged.workouts.length, 1);
  const edited = { ...workout, name: 'Nombre modificado' };
  const copied = previewBackup(createBackup(data([edited])), data([workout]), { [`workouts:${workout.id}`]: 'duplicate' });
  assert.equal(copied.conflicts.length, 0);
  assert.equal(copied.merged.workouts.length, 2);
  assert.equal(copied.merged.workouts[1].companionPassive, null);
  assert.equal(copied.merged.workouts[1].companionReward, undefined);
  assert.equal(workoutReward(copied.merged.workouts[1], []).companionCredits, 0);
  const corrupt = { ...workout, companionReward: { ...workout.companionReward!, workoutId: crypto.randomUUID() } };
  assert.throws(() => previewBackup(createBackup(data([corrupt])), data()), /cheesit/);
});
