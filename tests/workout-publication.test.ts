import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWorkoutPublication } from '../src/lib/workout-publication';
import { createBackup, previewBackup, validateData } from '../src/lib/backup';
import { emptyData, exerciseSnapshot, newSet, newWorkout } from '../src/lib/model';
import { CATALOG } from '../src/lib/catalog';

test('publication consent is explicit and survives storage/backup without publishing historical copies', () => {
  const workout = newWorkout();
  workout.status = 'finished';
  workout.exercises = [{ ...exerciseSnapshot(CATALOG[0]), id: crypto.randomUUID(), sets: [{ ...newSet(), weight: 20, reps: 10, confirmed: true }] }];
  const historical = { ...emptyData(), workouts: [workout] };
  assert.equal(validateData(historical).workouts[0].publication, undefined);
  const owner = crypto.randomUUID();
  workout.publication = { published: true, photoPath: `${owner}/${workout.id}/${crypto.randomUUID()}.jpg`, caption: 'Una buena sesión, paso a paso. 💪\nHoy tocaba volver.' };
  const backup = createBackup(historical);
  assert.deepEqual(previewBackup(backup, emptyData()).merged.workouts[0].publication, workout.publication);
  const changed = structuredClone(historical);
  changed.workouts[0].name = 'Otra versión';
  const duplicate = previewBackup(createBackup(changed), historical, { [`workouts:${workout.id}`]: 'duplicate' }).merged.workouts.find(w => w.id !== workout.id)!;
  assert.ok(duplicate);
  assert.equal(duplicate.publication, undefined);
  assert.equal(duplicate.cycleLink, undefined);
});

test('publication validation rejects malformed consent, external photos and paths from another workout', () => {
  const owner = crypto.randomUUID(), workout = crypto.randomUUID(), image = crypto.randomUUID();
  assert.equal(isWorkoutPublication({ published: false }), true);
  assert.equal(isWorkoutPublication({ published: true, caption: 'a'.repeat(1000) }), true);
  assert.equal(isWorkoutPublication({ published: false, caption: 'Privado' }), true);
  assert.equal(isWorkoutPublication({ published: true, caption: 'a'.repeat(1001) }), false);
  assert.equal(isWorkoutPublication({ published: true, caption: 42 }), false);
  assert.equal(isWorkoutPublication({ published: true, photoPath: `${owner}/${workout}/${image}.jpg` }, workout), true);
  for (const value of [null, [], true, {}, { published: 'true' }, { published: true, notes: 'private' }, { published: true, photoPath: 'https://example.com/photo.jpg' }, { published: true, photoPath: `${owner}/../${image}.jpg` }, { published: true, photoPath: `${owner}/${crypto.randomUUID()}/${image}.jpg` }]) assert.equal(isWorkoutPublication(value, workout), false);
});
