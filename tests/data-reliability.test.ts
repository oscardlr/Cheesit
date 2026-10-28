import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBackup, previewBackup } from '../src/lib/backup';
import { copyPreviousSets, copiedName, emptyData, exerciseSnapshot, newWorkout, newSet, snapshotLoadConventions, validPlannedSets, validRoutinePrescription, type AppData, type Routine, type WorkoutExercise } from '../src/lib/model';
import { DEFAULT_PROFILE, effectiveLoad } from '../src/lib/strength';
import { comparableSets, totals, workoutExerciseSessions } from '../src/lib/metrics';
import { muscleActivity } from '../src/lib/muscles';
import { normalizeGame, openCrate } from '../src/lib/game';

const block = (weight = 20, exerciseId = 'press-inclinado-mancuernas'): WorkoutExercise => ({ id: crypto.randomUUID(), exerciseId, name: 'Press', group: 'Pecho', mode: 'external_load_reps', sets: [{ ...newSet(), weight, reps: 10, confirmed: true }] });
const session = (exercise = block()) => ({ ...newWorkout(), status: 'finished' as const, exercises: [exercise] });

test('an app backup restores unfinished draft input without weakening confirmed sets', () => {
  const draft = newWorkout();
  draft.name = '';
  draft.exercises = [{ id: crypto.randomUUID(), exerciseId: 'press-banca-barra', name: 'Press', group: 'Pecho', mode: 'external_load_reps', sets: [
    { ...newSet(), weight: null, reps: 0 }, { ...newSet(), weight: 12.5, reps: 1001 }, { ...newSet(), weight: null, reps: 2.5 },
  ] }];
  const saved: AppData = { ...emptyData(), workouts: [draft] };
  assert.deepEqual(previewBackup(JSON.parse(JSON.stringify(createBackup(saved))), emptyData()).merged, saved);
  saved.workouts[0].exercises[0].sets[0].confirmed = true;
  assert.throws(() => previewBackup(createBackup(saved), emptyData()), /valores de serie/);
});

test('new workouts reject fractional planned sets rather than silently rounding', () => {
  const routine: Routine = { id: crypto.randomUUID(), name: 'Rutina', color: '#0057C2', archived: false, exercises: [{ id: crypto.randomUUID(), exerciseId: 'press-banca-barra', sets: 2.5 }] };
  assert.throws(() => newWorkout(routine), /entero/);
  for (const sets of [0, 2.5, 21, Infinity, NaN]) assert.equal(validPlannedSets(sets), false);
  for (const sets of [1, 20]) assert.equal(validPlannedSets(sets), true);
});

test('import into an existing installation preserves its athlete and effects preferences', () => {
  const current: AppData = { ...emptyData(), profile: { ...DEFAULT_PROFILE, weightKg: 90 }, preferences: { effects: false, sound: false } };
  const incoming: AppData = { ...emptyData(), profile: { ...DEFAULT_PROFILE, weightKg: 75 }, preferences: { effects: true, sound: true } };
  const merged = previewBackup(createBackup(incoming), current).merged;
  assert.deepEqual(merged.profile, current.profile);
  assert.deepEqual(merged.preferences, current.preferences);
});

test('draft backup preserves raw input, empty date, timer and prescription, but confirms strictly', () => {
  const workout = newWorkout();
  workout.date = '';
  workout.notes = 'Volver a probar la máquina';
  workout.autoRest = true;
  workout.defaultRestSeconds = 90;
  workout.restTimer = { endsAt: null, durationSeconds: 90, remainingSeconds: 42 };
  workout.exercises = [{ ...block(), repsMin: 8, repsMax: 12, targetWeight: 17.5, restSeconds: 120, notes: 'Controlar ritmo', sets: [{ ...newSet(), weightText: '12,', repsText: '2.', rpe: 8.5, rir: 2 }] }];
  const data = { ...emptyData(), workouts: [workout] };
  assert.deepEqual(previewBackup(JSON.parse(JSON.stringify(createBackup(data))), emptyData()).merged, data);
  workout.exercises[0].sets[0].confirmed = true;
  assert.throws(() => previewBackup(createBackup(data), emptyData()), /valores de serie/);
});

test('one convention defines volume for bilateral, alternating, single and legacy pair input', () => {
  assert.equal(totals([session(block(20))]).volume, 400);
  assert.equal(totals([session(block(20, 'curl-alterno-mancuernas'))]).volume, 200);
  assert.equal(totals([session(block(20, 'remo-mancuerna'))]).volume, 200);
  assert.equal(totals([session({ ...block(40), loadConvention: 'total' })]).volume, 400);
  const pair = snapshotLoadConventions({ ...emptyData(), profile: { ...DEFAULT_PROFILE, dumbbellLoad: 'pair' }, workouts: [session(block(40))] });
  assert.equal(pair.workouts[0].exercises[0].sets[0].weight, 40);
  assert.equal(totals(pair.workouts, DEFAULT_PROFILE).volume, 400);
  assert.equal(effectiveLoad(pair.workouts[0].exercises[0], 40, DEFAULT_PROFILE), 40);
  assert.deepEqual(snapshotLoadConventions(pair), pair);
  const modern = { ...block(20), loadConvention: 'per_unit_bilateral' as const };
  assert.equal(comparableSets({ ...block(40), loadConvention: 'total' }, modern).loads[0].change, 0);
});

test('reimport remains idempotent after legacy conventions have been frozen on disk', () => {
  const source: AppData = { ...emptyData(), profile: { ...DEFAULT_PROFILE, dumbbellLoad: 'pair' }, workouts: [session(block(40))] };
  const backup = createBackup(source);
  const current = snapshotLoadConventions(source);
  const again = previewBackup(backup, current);
  assert.deepEqual(again.conflicts, []);
  assert.equal(again.duplicateCounts.workouts, 1);
  assert.equal(again.merged.workouts.length, 1);
  assert.equal(again.merged.workouts[0].exercises[0].loadConvention, 'total');
});

test('duplicate blocks form one session and same-day ordering is deterministic', () => {
  const first = session(); first.createdAt = '2026-10-28T08:00:00Z'; first.date = '2026-10-28';
  first.exercises.push(block(22));
  const second = session(); second.createdAt = '2026-10-28T18:00:00Z'; second.date = '2026-10-28';
  const matches = workoutExerciseSessions([first, second], 'press-inclinado-mancuernas');
  assert.deepEqual(matches.map(value => value.w.id), [second.id, first.id]);
  assert.equal(matches[1].e.sets.length, 2);
  assert.equal(first.exercises.length, 2);
});

test('copy creates missing rows with new identities and never confirms copied values', () => {
  const source = [block().sets[0], block(22).sets[0], block(24).sets[0]];
  const current = [newSet()];
  const one = copyPreviousSets(current, source, 2);
  assert.equal(one.length, 3);
  assert.equal(one[0].id, current[0].id);
  assert.equal(one[1].weight, null);
  assert.equal(one[2].weight, 24);
  assert.equal(one[2].confirmed, false);
  assert.notEqual(one[2].id, source[2].id);
  const all = copyPreviousSets(current, source);
  assert.deepEqual(all.map(set => set.weight), [20, 22, 24]);
  assert.ok(all.every(set => !set.confirmed));
  assert.equal(new Set([...all, ...source].map(set => set.id)).size, 6);
  assert.equal(current.length, 1);
});

test('prescription validates ordered integer ranges and initializes values without confirmation', () => {
  assert.equal(validRoutinePrescription({ repsMin: 12, repsMax: 8 }), false);
  assert.equal(validRoutinePrescription({ restSeconds: 2.5 }), false);
  assert.equal(validRoutinePrescription({ targetWeight: 10.555 }), false);
  assert.equal(validRoutinePrescription({ repsMin: 8, repsMax: 12, targetWeight: 12.5, restSeconds: 90 }), true);
  const workout = newWorkout({ id: crypto.randomUUID(), name: 'A', color: '#0057C2', archived: false, notes: 'Ritmo suave', exercises: [{ id: crypto.randomUUID(), exerciseId: 'press-banca-barra', sets: 2, repsMin: 8, repsMax: 12, targetWeight: 12.5, restSeconds: 90, notes: 'Banco' }] });
  assert.equal(workout.notes, 'Ritmo suave');
  assert.equal(workout.exercises[0].notes, 'Banco');
  assert.deepEqual(workout.exercises[0].sets.map(({ weight, reps, confirmed }) => ({ weight, reps, confirmed })), Array(2).fill({ weight: 12.5, reps: 8, confirmed: false }));
});

test('custom anatomy is snapshotted and does not attribute calf work to every leg muscle', () => {
  const custom = { id: crypto.randomUUID(), name: 'Mi gemelo', group: 'Pierna y glúteo', mode: 'external_load_reps' as const, loadConvention: 'total' as const, primaryMuscles: ['calves' as const], secondaryMuscles: [] };
  const ex = { ...block(), ...exerciseSnapshot(custom) };
  const activity = muscleActivity([session(ex)], newWorkout().date, 7);
  assert.equal(activity.find(muscle => muscle.id === 'calves')!.sets, 1);
  assert.equal(activity.find(muscle => muscle.id === 'quads')!.sets, 0);
  assert.equal(activity.find(muscle => muscle.id === 'calves')!.approximate, false);
});

test('backup resolves known versions explicitly and duplicate routine names stay valid', () => {
  const original = { ...emptyData(), workouts: [session(block(50, 'press-banca-barra'))] };
  const incoming = structuredClone(original); incoming.workouts[0].name = 'Sesión corregida';
  const preview = previewBackup(createBackup(incoming), original);
  assert.equal(preview.conflictDetails.length, 1);
  const key = preview.conflictDetails[0].key;
  assert.deepEqual(preview.conflictDetails[0].choices, ['local', 'incoming', 'duplicate']);
  assert.equal(previewBackup(createBackup(incoming), original, { [key]: 'local' }).merged.workouts[0].name, original.workouts[0].name);
  const replacement = previewBackup(createBackup(incoming), original, { [key]: 'incoming' });
  assert.equal(replacement.conflicts.length, 0);
  assert.equal(replacement.merged.workouts[0].name, 'Sesión corregida');
  const duplicate = previewBackup(createBackup(incoming), original, { [key]: 'duplicate' });
  assert.equal(duplicate.merged.workouts.length, 2);
  assert.notEqual(duplicate.merged.workouts[0].exercises[0].sets[0].id, duplicate.merged.workouts[1].exercises[0].sets[0].id);
  assert.equal(copiedName('x'.repeat(80)).length, 80);
  const firstName = copiedName('x'.repeat(80));
  const secondName = copiedName('x'.repeat(80), [firstName]);
  const thirdName = copiedName('x'.repeat(80), [firstName, secondName]);
  assert.ok(secondName.endsWith(' (2)'));
  assert.ok(thirdName.endsWith(' (3)'));
  assert.equal(secondName.length, 80);
  assert.equal(thirdName.length, 80);
  assert.equal(copiedName('Banca', ['  COPIA DE BÁNCA  ']), 'Copia de Banca (2)');
  assert.doesNotThrow(() => encodeURIComponent(copiedName('💪'.repeat(80))));
});

test('independent spending branches require a whole-ledger choice and never merge debits', () => {
  const original = { ...emptyData(), game: openCrate(normalizeGame(), [], 'starter')!.game };
  const incoming = { ...emptyData(), game: openCrate(normalizeGame(), [], 'starter')!.game };
  const raw = createBackup(incoming);
  const preview = previewBackup(raw, original);
  assert.equal(preview.conflictDetails.find(detail => detail.kind === 'game')?.key, 'game:ledger');
  const local = previewBackup(raw, original, { 'game:ledger': 'local' });
  const imported = previewBackup(raw, original, { 'game:ledger': 'incoming' });
  assert.equal(local.merged.game!.transactions.length, 1);
  assert.equal(imported.merged.game!.transactions.length, 1);
  assert.equal(local.merged.game!.inventory[0].id, original.game.inventory[0].id);
  assert.equal(imported.merged.game!.inventory[0].id, incoming.game.inventory[0].id);
});

test('incomplete routine recovery round-trips without weakening saved routine validation', () => {
  const routine: Routine = { id: crypto.randomUUID(), name: 'Rutina guardada', color: '#0057C2', archived: false, exercises: [{ id: crypto.randomUUID(), exerciseId: 'press-banca-barra', sets: 3 }] };
  const data: AppData = { ...emptyData(), routines: [routine], routineDraft: { ...routine, name: '', exercises: [{ ...routine.exercises[0], sets: null, repsMin: 12, repsMax: 2, targetWeight: -1 }, { id: crypto.randomUUID(), exerciseId: 'press-banca-barra', sets: 2.5 }] } };
  const restored = previewBackup(JSON.parse(JSON.stringify(createBackup(data))), emptyData()).merged;
  assert.deepEqual(restored, data);
  const invalid = structuredClone(data); invalid.routines[0].exercises[0].sets = 2.5;
  assert.throws(() => previewBackup(createBackup(invalid), emptyData()), /ejercicio de rutina/);
  const conflicting = structuredClone(data); conflicting.routineDraft!.name = 'Otra edición';
  const preview = previewBackup(createBackup(conflicting), data);
  assert.equal(preview.conflictDetails[0].key, 'routineDraft:recovery');
  assert.equal(previewBackup(createBackup(conflicting), data, { 'routineDraft:recovery': 'incoming' }).merged.routineDraft!.name, 'Otra edición');
});
