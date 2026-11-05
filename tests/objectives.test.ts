import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays } from '../src/lib/dates';
import { createBackup, previewBackup } from '../src/lib/backup';
import {
  awardMissionRewards, gameBalance, gameProgress, getLevelCrates, getMissions,
  isGameState, normalizeGame, openCrate, openLevelCrate, type GameState,
} from '../src/lib/game';
import type { AppData, Workout, WorkoutExercise } from '../src/lib/model';
import { missionRewardCredits, missionRewardXp, validMissionRewards } from '../src/lib/objectives';
import { levelProgress, rewardProgress } from '../src/lib/rewards';

const day = '2026-11-04', monday = '2026-11-02';
const data = (game?: GameState, workouts: Workout[] = []): AppData => ({
  routines: [], customExercises: [], workouts, ...(game ? { game } : {}),
});

function exercise(exerciseId = 'press-banca-barra', group = 'Pecho', count = 1, reps = 10): WorkoutExercise {
  return { id: crypto.randomUUID(), exerciseId, name: 'Ejercicio', group, mode: 'external_load_reps',
    sets: Array.from({ length: count }, () => ({ id: crypto.randomUUID(), weight: 50, reps, confirmed: true })) };
}

function workout(date: string, exercises = [exercise()], status: Workout['status'] = 'finished'): Workout {
  return { id: crypto.randomUUID(), date, name: 'Sesión', color: '#0057C2', status,
    createdAt: `${date}T12:00:00Z`, updatedAt: `${date}T12:00:00Z`, exercises };
}

const completedWeek = (dates = ['2026-11-02', '2026-11-03', '2026-11-04']) =>
  dates.map(date => workout(date, [exercise('press-banca-barra', 'Pecho', 10)]));

test('three weekly and 35 career objectives show stable IDs, targets, XP and credits', () => {
  const game = normalizeGame(), missions = getMissions([], day, game);
  assert.equal(missions.length, 38);
  assert.equal(missions.filter(mission => mission.scope === 'weekly').length, 3);
  assert.equal(missions.filter(mission => mission.scope === 'career').length, 35);
  assert.equal(new Set(missions.map(mission => mission.id)).size, 38);
  assert.ok(missions.every(mission => Number.isInteger(mission.target) && mission.target > 0 &&
    Number.isInteger(mission.xp) && mission.xp >= 50 && mission.credits === mission.xp / 5 && mission.title && mission.description &&
    mission.current === 0 && !mission.complete && !mission.rewarded));
  assert.deepEqual(new Set(missions.map(mission => mission.unit)), new Set(['días', 'series', 'grupos', 'entrenamientos', 'repeticiones', 'grupos musculares', 'ejercicios distintos']));
  const sunday = getMissions([], '2026-11-08', game);
  assert.deepEqual(sunday.map(mission => mission.id), missions.map(mission => mission.id));
  const nextWeek = getMissions([], '2026-11-11', game);
  assert.deepEqual(nextWeek.filter(mission => mission.scope === 'career').map(mission => mission.id), missions.filter(mission => mission.scope === 'career').map(mission => mission.id));
  assert.ok(missions.filter(mission => mission.scope === 'weekly').every(mission => mission.id.endsWith(`:${monday}`)));
  assert.ok(nextWeek.filter(mission => mission.scope === 'weekly').every(mission => mission.id.endsWith(':2026-11-09')));
  const seen = new Set<string>();
  let previous = new Set<string>();
  for (let index = 0; index < 60; index++) {
    const week = addDays(monday, index * 7);
    const keys = new Set(getMissions([], week, game).filter(mission => mission.scope === 'weekly').map(mission => mission.id.split(':')[0]));
    assert.equal(keys.size, 3);
    for (const key of keys) {
      assert.ok(!previous.has(key), `${key} repeated in consecutive weeks`);
      seen.add(key);
    }
    previous = keys;
  }
  assert.equal(seen.size, 17, 'all weekly definitions rotate, including across a year boundary');
});

test('objective counters use finished valid unique work only and exclude drafts, deleted sessions, invalid dates and future activity', () => {
  const first = workout('2026-11-02', [exercise('press-banca-barra', 'Pecho', 3, 10), exercise('sentadilla-barra', 'Pierna y glúteo', 2, 8)]);
  const second = workout('2026-11-03', [exercise('press-banca-barra', 'Pecho', 2, 6)]);
  const third = workout(day, [exercise('remo-barra', 'Espalda', 1, 12)]);
  const priorWeek = workout('2026-11-01', [exercise('curl-barra', 'Bíceps', 4, 5)]);
  const duplicatedSet = workout(day, [{ ...exercise('curl-barra', 'Bíceps'), sets: [{ ...first.exercises[0].sets[0] }] }]);
  const invalid = exercise();
  invalid.sets = [
    { id: crypto.randomUUID(), weight: 50, reps: 10, confirmed: false },
    { id: crypto.randomUUID(), weight: null, reps: 10, confirmed: true },
    { id: crypto.randomUUID(), weight: 50, reps: 0, confirmed: true },
    { id: crypto.randomUUID(), weight: -1, reps: 10, confirmed: true },
  ];
  const invalidBodyweight = { ...exercise('dominadas', 'Espalda'), mode: 'bodyweight_reps' as const };
  const history = [first, second, third, priorWeek, structuredClone(first), duplicatedSet,
    workout(day, [invalid, invalidBodyweight]),
    workout('2026-11-03', [exercise('curl-barra', 'Bíceps', 50)], 'draft'),
    workout('2026-11-03', [exercise('curl-barra', 'Bíceps', 50)], 'deleted'),
    workout('2026-11-05', [exercise('curl-barra', 'Bíceps', 50)]),
    workout('2026-02-30', [exercise('curl-barra', 'Bíceps', 50)]),
  ];
  const missions = new Map(getMissions(history, day, normalizeGame()).map(mission => [mission.id, mission]));
  const current = (id: string) => missions.get(id)!.current;
  assert.equal(current(`sessions:${monday}`), 3);
  assert.equal(current(`sets:${monday}`), 8);
  assert.equal(current(`variety:${monday}`), 3);
  assert.equal(current('career-sessions-1'), 4);
  assert.equal(current('career-sets-10'), 12);
  assert.equal(current('career-reps-100'), 90);
  assert.equal(current('career-groups-1'), 4);
  assert.equal(current('career-exercises-5'), 4);
  assert.equal(current('career-group-4-10'), 4);
});

test('completed objectives award once per stable ID and changing a personal goal cannot replay a frozen reward', () => {
  const history = completedWeek(), original = normalizeGame(), before = structuredClone(original);
  const expected = getMissions(history, day, original).filter(mission => mission.complete);
  const awarded = awardMissionRewards(original, history, day);
  assert.ok(expected.length > 5);
  assert.deepEqual(new Set(awarded.missionRewards!.map(reward => reward.id)), new Set(expected.map(mission => mission.id)));
  assert.equal(missionRewardXp(awarded), expected.reduce((sum, mission) => sum + mission.xp, 0));
  assert.equal(missionRewardCredits(awarded), expected.reduce((sum, mission) => sum + mission.credits, 0));
  assert.ok(validMissionRewards(awarded.missionRewards));
  assert.ok(isGameState(awarded));
  assert.deepEqual(original, before);
  assert.strictEqual(awardMissionRewards(awarded, history, day), awarded);
  const changed = { ...awarded, weeklyWorkoutGoal: 1, weeklySetGoal: 200 };
  assert.strictEqual(awardMissionRewards(changed, history, day), changed);
  const frozen = getMissions(history, day, changed).find(mission => mission.id === `sessions:${monday}`)!;
  assert.equal(frozen.target, 3);
  assert.ok(frozen.complete && frozen.rewarded);
  assert.deepEqual(changed.missionRewards, awarded.missionRewards);
  assert.deepEqual(awarded.transactions, original.transactions);
});

test('a new Madrid week grants new weekly IDs while career IDs never repeat', t => {
  t.mock.method(Date, 'now', () => Date.parse('2026-11-11T12:00:00Z'));
  const firstHistory = completedWeek(), first = awardMissionRewards(normalizeGame(), firstHistory, day);
  const history = [...firstHistory, ...completedWeek(['2026-11-09', '2026-11-10', '2026-11-11'])];
  const second = awardMissionRewards(first, history, '2026-11-11');
  const ids = second.missionRewards!.map(reward => reward.id);
  assert.ok(ids.includes('sessions:2026-11-02'));
  assert.ok(ids.includes('week-sets-10:2026-11-09'));
  assert.ok(!ids.includes('sessions:2026-11-09'));
  assert.equal(ids.filter(id => id === 'career-sessions-1').length, 1);
  assert.ok(ids.includes('career-sessions-5'));
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(second.missionRewards!.slice(0, first.missionRewards!.length), first.missionRewards);
  assert.strictEqual(awardMissionRewards(second, history, '2026-11-11', day), second);
  assert.ok(isGameState(second));
});

test('editing an earlier week can award its missed objectives without duplicating the current week or career milestones', t => {
  t.mock.method(Date, 'now', () => Date.parse('2026-11-11T12:00:00Z'));
  const earlier = completedWeek(), current = completedWeek(['2026-11-09', '2026-11-10', '2026-11-11']);
  const history = [...earlier, ...current];
  const awarded = awardMissionRewards(normalizeGame(), history, '2026-11-11', '2026-11-03');
  const ids = awarded.missionRewards!.map(reward => reward.id);
  assert.ok(ids.includes('sessions:2026-11-02'));
  assert.ok(ids.includes('week-sets-10:2026-11-09'));
  assert.ok(!ids.includes('sessions:2026-11-09'));
  assert.equal(ids.filter(id => id === 'career-sessions-1').length, 1);
  assert.equal(new Set(ids).size, ids.length);
  assert.strictEqual(awardMissionRewards(awarded, history, '2026-11-11', '2026-11-03'), awarded);
});

test('reload, backup restore, reimport and older backups preserve one permanent objective reward ledger', () => {
  const history = completedWeek(), original = normalizeGame();
  const earned = awardMissionRewards(original, history, day);
  const reloaded = normalizeGame(JSON.parse(JSON.stringify(earned)));
  assert.deepEqual(reloaded.missionRewards, earned.missionRewards);
  assert.strictEqual(awardMissionRewards(reloaded, history, day), reloaded);
  const backup = createBackup(data(reloaded, history));
  const first = previewBackup(backup, data());
  assert.deepEqual(first.conflicts, []);
  assert.deepEqual(first.merged.game?.missionRewards, earned.missionRewards);
  const again = previewBackup(backup, first.merged);
  assert.deepEqual(again.conflicts, []);
  assert.deepEqual(again.merged.game?.missionRewards, earned.missionRewards);
  const older = previewBackup(createBackup(data(original, history)), again.merged);
  assert.deepEqual(older.conflicts, []);
  assert.deepEqual(older.merged.game?.missionRewards, earned.missionRewards);
  const before = older.merged.game!;
  assert.strictEqual(awardMissionRewards(before, older.merged.workouts, day), before);
  assert.equal(missionRewardXp(before), missionRewardXp(earned));
});

test('selecting a conflicting backup purchase keeps previously earned objective rewards', () => {
  const [session] = completedWeek();
  const earned = awardMissionRewards(normalizeGame(), [session], day);
  const first = openCrate(earned, [session], 'starter')!.game;
  const second = openCrate(normalizeGame(), [], 'starter')!.game;
  const snapshot = createBackup(data(second));
  const merged = previewBackup(snapshot, data(first, [session]), { 'game:ledger': 'incoming' }).merged;
  assert.deepEqual(merged.game?.missionRewards, earned.missionRewards);
  assert.deepEqual(merged.game?.transactions, second.transactions);
  assert.equal(missionRewardCredits(merged.game!), missionRewardCredits(earned));
});

test('permanent objective XP raises levels, credits and level-crate access while edits and deletion recalculate only training XP', () => {
  const history = completedWeek(), original = normalizeGame(), earned = awardMissionRewards(original, history, day);
  const missionXp = missionRewardXp(earned), training = rewardProgress(history), progress = gameProgress(earned, history);
  assert.ok(missionXp >= 1000);
  assert.equal(progress.xp, training.xp + missionXp);
  assert.equal(progress.objectiveXp, missionXp);
  assert.equal(progress.level, levelProgress(training.xp + missionXp).level);
  assert.equal(gameBalance(earned, history, undefined, 0), gameBalance(original, history, undefined, 0) + missionXp / 5);
  const deleted = history.map(workout => ({ ...workout, status: 'deleted' as const }));
  assert.equal(rewardProgress(deleted).xp, 0);
  assert.equal(gameProgress(earned, deleted).xp, missionXp);
  assert.equal(gameBalance(earned, deleted, undefined, 0), 100 + Math.floor(missionXp / 5));
  assert.strictEqual(awardMissionRewards(earned, deleted, day), earned);
  const edited = history.map(workout => ({ ...workout, exercises: workout.exercises.map(exercise => ({ ...exercise, sets: exercise.sets.slice(0, 1) })) }));
  assert.ok(rewardProgress(edited).xp < training.xp);
  assert.equal(gameProgress(earned, edited).xp, rewardProgress(edited).xp + missionXp);
  assert.strictEqual(awardMissionRewards(earned, edited, day), earned);
  const restored = previewBackup(createBackup(data(earned, deleted)), data()).merged;
  assert.equal(gameProgress(restored.game!, restored.workouts).xp, missionXp);
  assert.deepEqual(restored.game?.missionRewards, earned.missionRewards);
  assert.ok(getMissions(deleted, day, earned).filter(mission => mission.rewarded).every(mission => mission.complete));
  assert.equal(getLevelCrates(original, []).length, 0);
  assert.equal(getLevelCrates(earned, []).length, levelProgress(missionXp).level - 1);
  const reward = openLevelCrate(earned, [], 2);
  assert.ok(reward, 'mission XP alone can unlock a free level crate');
  assert.ok(reward.item.gearId);
  assert.ok(isGameState(reward.game));
  assert.equal(getLevelCrates(reward.game, []).find(crate => crate.level === 2)?.claimed, true);
  assert.equal(gameProgress(reward.game, []).xp, missionXp);
  assert.equal(gameBalance(reward.game, [], undefined, 0), gameBalance(earned, [], undefined, 0));
});

test('unknown objective IDs, altered XP or targets, non-Monday weekly IDs and duplicate rewards cannot pass game or backup validation', () => {
  const history = completedWeek(), earned = awardMissionRewards(normalizeGame(), history, day);
  const weekly = earned.missionRewards!.find(reward => reward.id === `sets:${monday}`)!;
  const personal = earned.missionRewards!.find(reward => reward.id === `sessions:${monday}`)!;
  const career = earned.missionRewards!.find(reward => reward.id === 'career-sessions-1')!;
  const invalid = [
    [{ ...weekly, id: `unknown:${monday}` }],
    [{ ...weekly, xp: weekly.xp + 1 }],
    [{ ...weekly, target: weekly.target + 1 }],
    [{ ...personal, target: 8 }],
    [{ ...weekly, id: 'sets:2026-11-03' }],
    [{ ...weekly, id: 'sets' }],
    [{ ...career, id: 'career-sessions-1:2026-11-02' }],
    [{ ...weekly, awardedAt: '2026-11-01T12:00:00Z' }],
    [weekly, { ...weekly }],
  ];
  for (const missionRewards of invalid) {
    assert.equal(validMissionRewards(missionRewards), false);
    const corrupt = { ...earned, missionRewards };
    assert.equal(isGameState(corrupt), false);
    assert.throws(() => previewBackup(createBackup(data(corrupt, history)), data()));
  }
});

test('weekly reward timestamps use the Madrid date at the Monday midnight boundary', () => {
  const reward = { id: 'sets:2026-10-26', xp: 150, target: 30, awardedAt: '2026-10-25T23:30:00Z' };
  // After the October clock change, this UTC Sunday instant is Monday00:30 in Madrid.
  assert.equal(validMissionRewards([reward]), true);
  const game = { ...normalizeGame(), missionRewards: [reward] };
  assert.ok(isGameState(game));
  const restored = previewBackup(createBackup(data(game)), data()).merged.game!;
  assert.deepEqual(restored.missionRewards, [reward]);
  assert.equal(validMissionRewards([{ ...reward, awardedAt: '2026-10-25T22:30:00Z' }]), false);
});
