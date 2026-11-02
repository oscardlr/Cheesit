import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rewardProgress, isPersonalRecord, SET_XP, WORKOUT_XP, workoutReward, setReward, levelProgress } from '../src/lib/rewards';
import type { Workout, WorkoutExercise, WorkoutSet } from '../src/lib/model';

const series = (weight: number | null, reps: number | null, confirmed = true): WorkoutSet => ({ id: crypto.randomUUID(), weight, reps, confirmed });
const exercise = (sets: WorkoutSet[], mode: WorkoutExercise['mode'] = 'external_load_reps'): WorkoutExercise => ({ id: crypto.randomUUID(), exerciseId: 'press', name: 'Press', group: 'Pecho', mode, sets });
const workout = (exercises: WorkoutExercise[], status: Workout['status'] = 'finished', date = '2026-10-26'): Workout => ({ id: crypto.randomUUID(), name: 'Entreno', color: '#0057C2', status, date, createdAt: `${date}T12:00:00Z`, updatedAt: `${date}T12:00:00Z`, exercises });
const record = (current: WorkoutExercise, history: Workout[], currentSet = current.sets[0]) => isPersonalRecord(current, currentSet, history, 'current', '2026-10-27');

test('XP includes confirmed draft sets, a finish bonus and exact level boundaries', () => {
  const finished = workout([exercise(Array.from({ length: 15 }, () => series(50, 8)))]);
  const draft = workout([exercise([series(0, 10)], 'bodyweight_reps')], 'draft');
  assert.deepEqual(rewardProgress([finished, draft]), {
    xp: 1160, level: 2, levelXp: 360, nextLevelXp: 860, percent: 360 / 860 * 100, sets: 16, workouts: 1,
  });
  assert.equal(SET_XP, 30);
  assert.equal(WORKOUT_XP, 200);
  assert.deepEqual(rewardProgress([]), {
    xp: 0, level: 1, levelXp: 0, nextLevelXp: 800, percent: 0, sets: 0, workouts: 0,
  });
});

test('level thresholds grow and finish popup distinguishes previously earned series from bonuses', () => {
  const previous = workout([exercise([series(50, 8)])]);
  const current = workout([
    exercise([series(55, 8)]),
    { ...exercise([series(40, 8)]), exerciseId: 'row', group: 'Espalda' },
    { ...exercise([series(30, 8)]), exerciseId: 'squat', group: 'Pierna y glúteo' },
  ], 'finished', '2026-10-27');
  assert.deepEqual(workoutReward(current, [previous, current]), {
    sets: 3, setXp: 184, finishXp: 200, varietyXp: 100, recordXp: 75, abilityXp: 0, abilityCredits: 0, companionXp: 0, companionCredits: 0,
    records: 1, bonusXp: 375, totalXp: 559, credits: 111,
  });
  assert.equal(workoutReward({ ...current, status: 'draft' }, [previous]).totalXp, 184);
  assert.equal(workoutReward({ ...current, status: 'deleted' }, [previous]).totalXp, 0);
  const large = workout([exercise(Array.from({ length: 45 }, () => series(50, 8)))], 'draft');
  const progress = rewardProgress([large]);
  assert.equal(progress.xp, 2700);
  assert.equal(progress.level, 4);
  assert.equal(progress.levelXp, 120);
  assert.equal(progress.nextLevelXp, 980);
  large.exercises[0].sets.pop();
  assert.equal(rewardProgress([large]).level, 4);
  assert.equal(rewardProgress([large]).levelXp, 60);
  assert.deepEqual(levelProgress(1660), { xp: 1660, level: 3, levelXp: 0, nextLevelXp: 920, percent: 0 });
});

test('bulk record rewards respect earlier dates and award each qualifying series once', () => {
  const baseline = workout([exercise([series(50, 8), series(60, 8)])], 'finished', '2026-10-25');
  const sameDay = workout([exercise([series(55, 8), series(65, 8), series(70, 8)])], 'finished', '2026-10-26');
  const later = workout([exercise([series(66, 8)])], 'finished', '2026-10-27');
  const excludedBaseline = workout([exercise([series(100, 8)])], 'draft', '2026-10-24');
  const history = [later, excludedBaseline, sameDay, baseline];
  assert.equal(workoutReward(sameDay, history).records, 2);
  assert.equal(workoutReward(later, history).records, 0);
  assert.equal(rewardProgress(history).xp, 1231);
  assert.equal(rewardProgress(history).xp, history.reduce((sum, session) => sum + workoutReward(session, history).totalXp, 0));
  sameDay.exercises[0].sets[1].confirmed = false;
  assert.equal(rewardProgress(history).xp, history.reduce((sum, session) => sum + workoutReward(session, history).totalXp, 0));
});

test('invalid, unconfirmed and deleted sets cannot add XP', () => {
  const active = workout([
    exercise([series(50, 8), series(50, 8, false), series(null, 8), series(50, 0), series(1001, 5)]),
    exercise([series(10, 8), series(0, 8)], 'bodyweight_reps'),
  ], 'draft');
  const deleted = workout([exercise([series(50, 8)])], 'deleted');
  const progress = rewardProgress([active, deleted]);
  assert.equal(progress.xp, 116);
  assert.equal(progress.sets, 2);
  assert.equal(progress.workouts, 0);
});

test('reconfirming and editing an existing set cannot accumulate duplicate XP', () => {
  const session = workout([exercise([series(50, 8)])], 'draft');
  assert.equal(rewardProgress([session]).xp, 60);
  session.exercises[0].sets[0].confirmed = false;
  assert.equal(rewardProgress([session]).xp, 0);
  session.exercises[0].sets[0] = { ...session.exercises[0].sets[0], confirmed: true, reps: 12 };
  assert.equal(rewardProgress([session]).xp, 68);
  assert.equal(rewardProgress([session]).xp, setReward(session.exercises[0],session.exercises[0].sets[0],[],session.id,session.date).xp);
  session.status = 'finished';
  assert.equal(rewardProgress([session]).xp, 268);
  session.name = 'Entreno editado';
  assert.equal(rewardProgress([session]).xp, 268);
});

test('records require a comparable earlier set and exceed its historical maximum', () => {
  const current = exercise([series(55, 8)]);
  assert.equal(record(current, []), false);
  assert.equal(record(current, [workout([exercise([series(50, 8)])])]), true);
  assert.equal(record(current, [workout([exercise([series(50, 8), series(60, 8)])])]), false);
  assert.equal(record(current, [workout([exercise([series(55, 8)])])]), false);
  assert.equal(record(current, [workout([exercise([series(50, 12)])])]), false);
  const reps = exercise([series(50, 12)]);
  assert.equal(record(reps, [workout([exercise([series(50, 10)])])]), true);
  assert.equal(record(reps, [workout([exercise([series(50, 10), series(50, 15)])])]), false);
});

test('records ignore other identities, modes, drafts, deleted, future and current sessions', () => {
  const current = exercise([series(55, 8)]);
  const other = { ...exercise([series(50, 8)]), exerciseId: 'squat' };
  const excluded = [
    workout([other]),
    workout([exercise([series(0, 8)], 'bodyweight_reps')]),
    workout([exercise([series(50, 8)])], 'draft'),
    workout([exercise([series(50, 8)])], 'deleted'),
    workout([exercise([series(50, 8)])], 'finished', '2026-10-27'),
    workout([exercise([series(50, 8)])], 'finished', '2026-10-28'),
    { ...workout([exercise([series(50, 8)])]), id: 'current' },
    workout([exercise([series(50, 8, false), series(null, 8)])]),
  ];
  assert.equal(record(current, excluded), false);
  assert.equal(record(exercise([series(null, 8)]), [workout([exercise([series(50, 8)])])]), false);
});

test('bodyweight records compare reps at zero load and decimal weights compare exactly', () => {
  const body = exercise([series(0, 12)], 'bodyweight_reps');
  assert.equal(record(body, [workout([exercise([series(0, 10)], 'bodyweight_reps')])]), true);
  assert.equal(record(body, [workout([exercise([series(0, 15)], 'bodyweight_reps')])]), false);
  const decimal = exercise([series(0.29, 12)]);
  assert.equal(record(decimal, [workout([exercise([series(0.29, 10)])])]), true);
});
