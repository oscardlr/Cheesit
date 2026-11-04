import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWorkoutPublication } from '../src/lib/workout-publication';
import { assertBackupPhotoReferences, createBackup, previewBackup, validateData } from '../src/lib/backup';
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

test('photo backups reject foreign accounts before staging and preserve every original reference', () => {
  const owner=crypto.randomUUID(),other=crypto.randomUUID();
  const workout=newWorkout();workout.status='finished';workout.notes='Notas privadas que deben conservarse';
  workout.exercises=[{...exerciseSnapshot(CATALOG[0]),id:crypto.randomUUID(),sets:[{...newSet(),weight:20,reps:10,confirmed:true}]}];
  workout.publication={published:false,photoPath:`${owner}/${workout.id}/${crypto.randomUUID()}.jpg`,caption:'Descripción de la foto'};
  const original={...emptyData(),workouts:[workout]};const backup=createBackup(original);
  const untouched=structuredClone(backup);const destination=emptyData();const current=structuredClone(destination);
  let writes=0;
  const stage=(account?:string)=>{assertBackupPhotoReferences(backup,account);const preview=previewBackup(backup,destination);writes++;return preview.merged;};
  const expected='Esta copia contiene referencias a fotos de otra cuenta. Restáurala en la cuenta original para conservar sus fotos.';
  assert.throws(()=>stage(other),{message:expected});assert.equal(writes,0);
  assert.throws(()=>stage(),{message:expected});assert.equal(writes,0,'guest import cannot persist unusable account photo references');
  assert.deepEqual(destination,current,'a rejected import never changes the destination');
  assert.deepEqual(backup,untouched,'rejecting a foreign owner never strips or rewrites the backup');
  const restored=stage(owner);assert.equal(writes,1);
  assert.deepEqual(restored.workouts[0],original.workouts[0],'same-account restore retains notes, caption and exact private photo path');
  assert.deepEqual(backup,untouched);
  assert.doesNotThrow(()=>assertBackupPhotoReferences(createBackup({...emptyData(),workouts:[{...workout,publication:{published:false}}]}),other),'backups without remote photo references remain portable');
});
