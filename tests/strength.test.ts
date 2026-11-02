import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROFILE, effectiveLoad, estimatedOneRepMax, exerciseLoadConvention, isAthleteProfile, normalizeProfile, strengthReference } from '../src/lib/strength';
import { CATALOG } from '../src/lib/catalog';
import { MAX_SET_XP, rewardProgress, rewardSetIndex, setReward, workoutReward } from '../src/lib/rewards';
import { muscleActivity, muscleLevelFromXp } from '../src/lib/muscles';
import type { Workout, WorkoutExercise, WorkoutSet } from '../src/lib/model';

const series = (weight: number | null, reps: number | null, confirmed = true): WorkoutSet => ({ id: crypto.randomUUID(), weight, reps, confirmed });
const exercise = (sets: WorkoutSet[], exerciseId = 'press-banca-barra', mode: WorkoutExercise['mode'] = 'external_load_reps'): WorkoutExercise => ({ id: crypto.randomUUID(), exerciseId, mode, sets, name: 'Press', group: 'Pecho' });
const workout = (exercises: WorkoutExercise[], date = '2026-10-26', status: Workout['status'] = 'finished'): Workout => ({ id: crypto.randomUUID(), name: 'Entreno', color: '#0057C2', status, date, createdAt: `${date}T12:00:00Z`, updatedAt: `${date}T12:00:00Z`, exercises });
const points = (weight: number, reps: number, history: Workout[] = [], id = 'press-banca-barra') => {
  const ex = exercise([series(weight, reps)], id);
  return setReward(ex, ex.sets[0], history, 'new-session', '2026-10-27');
};

test('profile defaults match the requested athlete and validation rejects fabricated demographic values', () => {
  assert.deepEqual(normalizeProfile(), { weightKg: 70, heightCm: 180, age: 20, sex: 'male', dumbbellLoad: 'per_hand' });
  assert.equal(isAthleteProfile({ ...DEFAULT_PROFILE, weightKg: NaN }), false);
  assert.equal(isAthleteProfile({ ...DEFAULT_PROFILE, weightKg: '70' }), false);
  assert.equal(isAthleteProfile({ ...DEFAULT_PROFILE, age: 20.2 }), false);
  assert.equal(isAthleteProfile({ ...DEFAULT_PROFILE, heightCm: 999 }), false);
  assert.equal(isAthleteProfile({ ...DEFAULT_PROFILE, dumbbellLoad: 'unknown' }), false);
  assert.equal(isAthleteProfile({ weightKg: 70, heightCm: 180, age: 20, sex: 'male' }), true);
  assert.deepEqual(normalizeProfile({ nonsense: true }), DEFAULT_PROFILE);
});

test('more working weight and more reps earn more XP, within explicit arcade caps', () => {
  assert.deepEqual(points(50, 8), { xp: 60, baseXp: 30, repsXp: 16, loadXp: 14, progressXp: 0, relativeLoad: 50 / 70, estimatedOneRepMax: 62.1, record: false });
  assert.ok(points(60, 8).xp > points(50, 8).xp);
  assert.ok(points(50, 10).xp > points(50, 8).xp);
  assert.equal(points(1000, 1000).xp, 100);
  assert.ok(points(1000, 1000).xp <= MAX_SET_XP);
  const ex = exercise([series(null, 8)]);
  assert.equal(setReward(ex, ex.sets[0], [], 'current', '2026-10-27').xp, 0);
  assert.equal(points(50, 8).progressXp, 0);
});

test('personal progression compares the same exercise with earlier finished activity, not drafts or the same day', () => {
  const baseline = workout([exercise([series(50, 8)])]);
  assert.equal(points(55, 8, [baseline]).xp, 72);
  assert.equal(points(55, 8, [baseline]).progressXp, 10);
  assert.equal(points(55, 8, [{ ...baseline, status: 'draft' }]).progressXp, 0);
  assert.equal(points(55, 8, [{ ...baseline, status: 'deleted' }]).progressXp, 0);
  assert.equal(points(55, 8, [{ ...baseline, date: '2026-10-27' }]).progressXp, 0);
  assert.equal(points(55, 8, [baseline], 'press-militar').progressXp, 0);
  assert.equal(points(40, 8, [baseline]).progressXp, 0);
  assert.equal(points(1000, 1000, [baseline]).xp, MAX_SET_XP);
  const body = exercise([series(0, 12)], 'flexiones', 'bodyweight_reps');
  const earlierBody = workout([exercise([series(0, 10)], 'flexiones', 'bodyweight_reps')]);
  assert.equal(setReward(body, body.sets[0], [earlierBody], 'new', '2026-10-27').progressXp, 20);
});

test('body mass normalizes load; age, sex and height have no invented population percentile multiplier', () => {
  const ex = exercise([series(50, 8)]);
  const base = setReward(ex, ex.sets[0], [], 'new', '2026-10-27', DEFAULT_PROFILE);
  const heavier = setReward(ex, ex.sets[0], [], 'new', '2026-10-27', { ...DEFAULT_PROFILE, weightKg: 100 });
  assert.ok(base.xp > heavier.xp);
  assert.equal(setReward(ex, ex.sets[0], [], 'new', '2026-10-27', { ...DEFAULT_PROFILE, sex: 'female', age: 60, heightCm: 160 }).xp, base.xp);
  assert.match(strengthReference(ex, ex.sets[0]).comparison, /no percentiles/);
});

test('two-dumbbell conventions alter total bilateral load without doubling unilateral loads', () => {
  const bilateral = exercise([series(20, 8)], 'press-hombros-mancuernas');
  assert.equal(effectiveLoad(bilateral, 20, { ...DEFAULT_PROFILE, dumbbellLoad: 'per_hand' }), 40);
  assert.equal(effectiveLoad(bilateral, 20, { ...DEFAULT_PROFILE, dumbbellLoad: 'pair' }), 20);
  const unilateral = exercise([series(20, 8)], 'remo-mancuerna');
  assert.equal(effectiveLoad(unilateral, 20), 20);
  assert.ok(setReward(bilateral, bilateral.sets[0], [], 'new', '2026-10-27', { ...DEFAULT_PROFILE, dumbbellLoad: 'per_hand' }).xp > setReward(bilateral, bilateral.sets[0], [], 'new', '2026-10-27', { ...DEFAULT_PROFILE, dumbbellLoad: 'pair' }).xp);
});

test('catalogue dumbbell instructions and XP share the same per-hand execution metadata', () => {
  const bilateralIds = ['press-inclinado-mancuernas', 'aperturas-mancuernas', 'zancadas-mancuernas', 'press-hombros-mancuernas', 'elevaciones-laterales', 'elevaciones-frontales', 'pajaros-mancuernas', 'curl-martillo'];
  for (const exerciseId of bilateralIds) {
    assert.ok(CATALOG.some(candidate => candidate.id === exerciseId));
    const ex = exercise([], exerciseId);
    const convention = exerciseLoadConvention(ex);
    assert.equal(convention.isDumbbell, true, exerciseId);
    assert.equal(convention.heading, 'Kg por mancuerna');
    assert.equal(convention.inputSuffix, 'kg por mancuerna');
    assert.equal(convention.effectiveMultiplier, 2);
    assert.match(convention.hint, /escribe 20 kg/);
    assert.match(convention.hint, /40 kg de carga total/);
    assert.equal(effectiveLoad(ex, 20), 40);
    const legacy = exerciseLoadConvention(ex, { ...DEFAULT_PROFILE, dumbbellLoad: 'pair' });
    assert.equal(legacy.effectiveMultiplier, 1);
    assert.match(legacy.heading, /perfil antiguo/);
    assert.match(legacy.hint, /anota 40 kg/);
    assert.equal(effectiveLoad(ex, 40, { ...DEFAULT_PROFILE, dumbbellLoad: 'pair' }), 40);
  }
  for (const exerciseId of ['remo-mancuerna', 'curl-alterno-mancuernas', 'extension-cabeza-mancuerna']) {
    const ex = exercise([], exerciseId);
    assert.equal(exerciseLoadConvention(ex).isDumbbell, true);
    assert.equal(exerciseLoadConvention(ex).effectiveMultiplier, 1);
    assert.equal(effectiveLoad(ex, 20), 20);
  }
  assert.match(exerciseLoadConvention(exercise([], 'extension-cabeza-mancuerna')).hint, /única mancuerna/);
  assert.equal(exerciseLoadConvention(exercise([], 'press-banca-barra')).isDumbbell, false);
  const custom = { ...exercise([], 'custom-id'), name: 'Press con mancuernas' };
  assert.equal(exerciseLoadConvention(custom).isDumbbell, false);
  assert.equal(effectiveLoad(custom, 20), 20);
  assert.equal(effectiveLoad(exercise([], 'curl-martillo', 'bodyweight_reps'), 20), 0);
});

test('identical physical two-dumbbell work earns identical XP in per-hand and legacy pair records', () => {
  const eachProfile = { ...DEFAULT_PROFILE, dumbbellLoad: 'per_hand' as const };
  const pairProfile = { ...DEFAULT_PROFILE, dumbbellLoad: 'pair' as const };
  const each = exercise([series(20, 8)], 'press-inclinado-mancuernas');
  const pair = exercise([series(40, 8)], 'press-inclinado-mancuernas');
  const earlierEach = workout([exercise([series(18, 8)], 'press-inclinado-mancuernas')]);
  const earlierPair = workout([exercise([series(36, 8)], 'press-inclinado-mancuernas')]);
  const currentEach = workout([each], '2026-10-27', 'draft');
  const currentPair = workout([pair], '2026-10-27', 'draft');
  const eachReward = setReward(each, each.sets[0], [earlierEach], currentEach.id, currentEach.date, eachProfile);
  const pairReward = setReward(pair, pair.sets[0], [earlierPair], currentPair.id, currentPair.date, pairProfile);
  assert.deepEqual(eachReward, pairReward);
  assert.ok(eachReward.loadXp > 0);
  assert.ok(eachReward.progressXp > 0);
  assert.equal(rewardProgress([earlierEach, currentEach], eachProfile).xp, rewardProgress([earlierPair, currentPair], pairProfile).xp);
});

test('1RM estimates only cover known bar movements with one to ten reps, never machines or custom exercises', () => {
  assert.equal(estimatedOneRepMax(exercise([]), series(50, 8)), 62.1);
  assert.equal(estimatedOneRepMax(exercise([]), series(50, 1)), 50);
  assert.equal(estimatedOneRepMax(exercise([]), series(50, 11)), null);
  assert.equal(estimatedOneRepMax(exercise([], 'prensa-piernas'), series(100, 8)), null);
  assert.equal(estimatedOneRepMax(exercise([], 'custom-id'), series(50, 8)), null);
  assert.equal(estimatedOneRepMax(exercise([], 'press-militar'), series(50, 8)), null);
  assert.equal(estimatedOneRepMax(exercise([], 'peso-muerto-rumano'), series(50, 8)), null);
  assert.equal(estimatedOneRepMax(exercise([], 'remo-barra'), series(50, 8)), null);
  assert.equal(estimatedOneRepMax(exercise([], 'flexiones', 'bodyweight_reps'), series(0, 8)), null);
});

test('bulk XP and single series previews agree independent of history order, and duplicate IDs cannot pay twice', () => {
  const sessions = [workout([exercise([series(40, 8), series(50, 6)])], '2026-10-24'), workout([exercise([series(45, 10), series(55, 6)])], '2026-10-25'), workout([exercise([series(50, 10), series(60, 6)])], '2026-10-26', 'draft')];
  const index = rewardSetIndex(sessions);
  for (const session of sessions) for (const ex of session.exercises) for (const set of ex.sets) {
    assert.deepEqual(index.get(set.id), setReward(ex, set, sessions, session.id, session.date));
  }
  assert.deepEqual(rewardProgress(sessions), rewardProgress([...sessions].reverse()));
  assert.equal(rewardProgress(sessions).xp, sessions.reduce((sum, session) => sum + workoutReward(session, sessions).totalXp, 0));
  assert.deepEqual(rewardProgress([sessions[0], sessions[0]]), rewardProgress([sessions[0]]));
});

test('muscle levels and heatmap activity use the same month with separate historical sets', () => {
  const older = workout([exercise(Array.from({ length: 9 }, () => series(50, 8)))], '2026-10-01');
  const seven = muscleActivity([older], '2026-10-27', 7);
  const thirty = muscleActivity([older], '2026-10-27', 30);
  const chest = seven.find(muscle => muscle.id === 'chest')!, triceps = seven.find(muscle => muscle.id === 'triceps')!;
  assert.equal(chest.sets, 9);
  assert.equal(chest.lifetimeSets, 9);
  assert.equal(chest.xp, 540);
  assert.equal(chest.level, 2);
  assert.equal(chest.levelXp, 40);
  assert.equal(chest.nextLevelXp, 600);
  assert.equal(triceps.xp, 270);
  assert.equal(triceps.lifetimeSets, 4.5);
  assert.equal(thirty.find(muscle => muscle.id === 'chest')!.sets, 9);
  assert.equal(thirty.find(muscle => muscle.id === 'chest')!.level, chest.level);
  assert.equal(muscleLevelFromXp(1100).level, 3);
});

test('muscle XP follows heavier work and edits, respects half XP and excludes removed or future activity', () => {
  const light = workout([exercise([series(10, 8)])]);
  const chestLight = muscleActivity([light], '2026-10-27', 7).find(muscle => muscle.id === 'chest')!;
  const tricepsLight = muscleActivity([light], '2026-10-27', 7).find(muscle => muscle.id === 'triceps')!;
  assert.equal(tricepsLight.xp, chestLight.xp / 2);
  const heavy = structuredClone(light); heavy.exercises[0].sets[0].weight = 100;
  assert.ok(muscleActivity([heavy], '2026-10-27', 7).find(muscle => muscle.id === 'chest')!.xp > chestLight.xp);
  heavy.exercises[0].sets[0].confirmed = false;
  assert.equal(muscleActivity([heavy], '2026-10-27', 7).find(muscle => muscle.id === 'chest')!.xp, 0);
  assert.equal(muscleActivity([{ ...light, status: 'deleted' }], '2026-10-27', 7).find(muscle => muscle.id === 'chest')!.xp, 0);
  assert.equal(muscleActivity([{ ...light, date: '2026-11-01' }], '2026-10-27', 7).find(muscle => muscle.id === 'chest')!.xp, 0);
  const duplicated = structuredClone(light); duplicated.exercises[0].sets.push(duplicated.exercises[0].sets[0]);
  assert.equal(muscleActivity([duplicated], '2026-10-27', 7).find(muscle => muscle.id === 'chest')!.xp, chestLight.xp);
});
