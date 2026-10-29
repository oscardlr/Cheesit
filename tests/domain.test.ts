import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayMadrid, addDays, isCivilDate, weekStart } from '../src/lib/dates';
import { COLORS, LEGACY_ROUTINE_COLORS, WORKOUT_COLOR, newWorkout, parseWeight, validSet, type Routine, type Workout, type WorkoutExercise } from '../src/lib/model';
import { comparableSets, totals } from '../src/lib/metrics';
import { createBackup, previewBackup } from '../src/lib/backup';

const series = (weight: number | null, reps: number | null, confirmed = true) => ({ id: crypto.randomUUID(), weight, reps, confirmed });
const exercise = (sets: ReturnType<typeof series>[], mode: 'external_load_reps' | 'bodyweight_reps' = 'external_load_reps'): WorkoutExercise => ({ id: crypto.randomUUID(), exerciseId: 'press-banca-barra', name: 'Press', group: 'Pecho', mode, sets });
const workout = (exercises: WorkoutExercise[], status: Workout['status'] = 'finished'): Workout => ({ id: crypto.randomUUID(), date: '2026-10-26', name: 'Entreno', color: '#0057C2', status, createdAt: '2026-10-26T12:00:00Z', updatedAt: '2026-10-26T12:00:00Z', exercises });

test('new sessions use the app lime independently of their routine color', () => {
  const routine: Routine = { id: crypto.randomUUID(), name: 'Rutina morada', color: COLORS[1], archived: false, exercises: [{ id: crypto.randomUUID(), exerciseId: 'press-banca-barra', sets: 3 }] };
  const original = structuredClone(routine);
  assert.equal(newWorkout().color, WORKOUT_COLOR);
  const session = newWorkout(routine);
  assert.equal(session.color, WORKOUT_COLOR);
  assert.equal(session.name, routine.name);
  assert.equal(session.exercises[0].sets.length, 3);
  assert.deepEqual(routine, original);
});

test('backups round-trip lime sessions alongside historical and routine colors', () => {
  const routine: Routine = { id: crypto.randomUUID(), name: 'Rutina azul', color: COLORS[0], archived: false, exercises: [] };
  const saved = { routines: [routine], workouts: [newWorkout(routine), workout([exercise([series(50, 8)])])], customExercises: [] };
  const empty = { routines: [], workouts: [], customExercises: [] };
  const backup = JSON.parse(JSON.stringify(createBackup(saved)));
  const restored = previewBackup(backup, empty).merged;
  assert.deepEqual(restored, saved);
  assert.equal(restored.workouts[0].color, WORKOUT_COLOR);
  assert.equal(restored.workouts[1].color, LEGACY_ROUTINE_COLORS[0]);
  assert.equal(restored.routines[0].color, COLORS[0]);
  const invalid = structuredClone(saved);
  invalid.workouts[0].color = '#ffffff';
  assert.throws(() => previewBackup(createBackup(invalid), empty), /entrenamiento/);
});

test('civil dates remain in Madrid across midnight and DST', () => {
  assert.equal(todayMadrid(new Date('2026-10-26T23:30:00Z')), '2026-10-27');
  assert.equal(todayMadrid(new Date('2026-03-29T22:30:00Z')), '2026-03-30');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(isCivilDate('2025-02-29'), false);
  assert.equal(weekStart('2026-01-01'), '2025-12-29');
});

test('decimal and set validation reject ambiguous or invalid input', () => {
  assert.equal(parseWeight('12,5'), 12.5);
  assert.equal(parseWeight('12.5'), 12.5);
  for (const value of ['1,000.5', '-1', '1e2', '1000.01', '12.345', '']) assert.equal(parseWeight(value), null);
  assert.equal(validSet(series(0.29, 10), 'external_load_reps'), true);
  assert.equal(validSet(series(0, 10), 'bodyweight_reps'), true);
  assert.equal(validSet(series(5, 10), 'bodyweight_reps'), false);
  assert.equal(validSet(series(10, 0), 'external_load_reps'), false);
});

test('CA-15 counts only valid confirmed sets in finished workouts', () => {
  const first = exercise([series(50, 8), series(55, 8), series(100, 10, false)]);
  const body = exercise([series(0, 10)], 'bodyweight_reps');
  assert.deepEqual(totals([workout([first, body]), workout([exercise([series(100, 10)])], 'draft')]), { workouts: 1, sets: 3, reps: 26, volume: 840, excludedSets: 1 });
});

test('CA-16 only compares identical exercise, mode and one fixed condition', () => {
  const old = exercise([series(50, 8)]);
  const load = exercise([series(55, 8)]);
  assert.deepEqual(comparableSets(old, load).loads, [{ reps: 8, previous: 50, current: 55, change: 5, percent: 10 }]);
  const reps = exercise([series(50, 10)]);
  assert.deepEqual(comparableSets(old, reps).repetitions, [{ weight: 50, previous: 8, current: 10, change: 2, percent: 25 }]);
  assert.deepEqual(comparableSets(old, exercise([series(55, 3)])), { loads: [], repetitions: [] });
  assert.deepEqual(comparableSets(old, { ...load, exerciseId: 'different' }), { loads: [], repetitions: [] });
  assert.deepEqual(comparableSets(old, exercise([series(55, 8, false)])), { loads: [], repetitions: [] });
  assert.equal(comparableSets(exercise([series(0, 8)]), exercise([series(10, 8)])).loads[0].percent, null);
});

test('local backup previews duplicates, conflicts and rejects malformed data', () => {
  const original = { routines: [], workouts: [workout([exercise([series(50, 8)])])], customExercises: [] };
  const backup = createBackup(original);
  const preview = previewBackup(backup, original);
  assert.equal(preview.duplicateCounts.workouts, 1);
  assert.equal(preview.merged.workouts.length, 1);
  const conflict = structuredClone(original);
  conflict.workouts[0].name = 'Distinto';
  assert.equal(previewBackup(backup, conflict).conflicts.length, 1);
  assert.throws(() => previewBackup({ ...backup, data: { ...original, workouts: [{ ...original.workouts[0], date: '2025-02-29' }] } }, original));
});

test('local backup preserves multiple workouts for a date and reimport is idempotent', () => {
  const one = workout([exercise([series(50, 8)])]);
  const two = workout([exercise([series(55, 8)])]);
  const backup = createBackup({ routines: [], workouts: [one, two], customExercises: [] });
  const first = previewBackup(backup, { routines: [], workouts: [], customExercises: [] });
  assert.deepEqual(first.multipleDates, ['2026-10-26']);
  assert.equal(first.newCounts.workouts, 2);
  const again = previewBackup(backup, first.merged);
  assert.equal(again.newCounts.workouts, 0);
  assert.equal(again.duplicateCounts.workouts, 2);
  assert.equal(again.merged.workouts.length, 2);
});
