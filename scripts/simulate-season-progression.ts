/** Reproducible balance study; no IO to user data and no environment credentials. */
import { CATALOG } from '../src/lib/catalog';
import { addDays } from '../src/lib/dates';
import { applyWorkoutPassive, snapshotWorkoutPassive, workoutPassiveReward } from '../src/lib/cheesit-passives';
import { COMPANIONS } from '../src/lib/companions';
import { awardMissionRewards, gameProgress, normalizeGame, type GameState } from '../src/lib/game';
import { exerciseSnapshot, type Workout } from '../src/lib/model';
import { characterLevelThreshold } from '../src/lib/seasons';
import { normalizeProfile } from '../src/lib/strength';

export function representativeWorkout(date: string): Workout {
  const loads: [string, number][] = [['press-banca-barra', 50], ['remo-barra', 50], ['sentadilla-barra', 60], ['press-militar', 25], ['curl-barra', 20], ['extension-triceps-polea', 20]];
  return { id: crypto.randomUUID(), date, name: 'Sesión representativa', color: '#d8ff3e', status: 'finished', createdAt: `${date}T12:00:00Z`, updatedAt: `${date}T12:00:00Z`, exercises: loads.map(([id, weight]) => ({ ...exerciseSnapshot(CATALOG.find(exercise => exercise.id === id)!), id: crypto.randomUUID(), sets: Array.from({ length: 3 }, () => ({ id: crypto.randomUUID(), weight, reps: 10, confirmed: true, rpe: 7 })) })) };
}
export function simulate(sessionsPerWeek: number, companionId?: string) {
  const companion = COMPANIONS.find(companion => companion.id === companionId);
  const acquiredAt = '2026-01-01T00:00:00Z';
  const item = companion ? { id: crypto.randomUUID(), kind: 'companion' as const, companionId, rarity: companion.rarity, acquiredAt, crateId: 'starter', sold: false } : null;
  let game: GameState = { ...normalizeGame(), weeklyWorkoutGoal: sessionsPerWeek, ...(item ? { inventory: [item], transactions: [{ id: crypto.randomUUID(), kind: 'crate', itemId: item.id, amount: -100, createdAt: acquiredAt }], equippedCompanionId: companionId } : {}) };
  const history: Workout[] = [], reached: Record<string, string | null> = { 25: null, 50: null, 75: null, 99: null };
  const offsets = Array.from({ length: sessionsPerWeek }, (_, index) => Math.floor(index * 7 / sessionsPerWeek));
  const profile = normalizeProfile();
  const originalNow = Date.now;
  try {
    for (let week = 0; week < 52; week++) for (const offset of offsets) {
      const date = addDays('2026-01-05', week * 7 + offset);
      if (!date.startsWith('2026')) continue;
      Date.now = () => Date.parse(`${date}T13:00:00Z`);
      const workout = applyWorkoutPassive(snapshotWorkoutPassive(representativeWorkout(date), game), history, profile);
      history.push(workout);
      game = awardMissionRewards(game, history, date, date);
      const progress = gameProgress(game, history, profile, '2026');
      for (const target of Object.keys(reached)) if (!reached[target] && progress.level >= Number(target)) reached[target] = date;
    }
  } finally { Date.now = originalNow; }
  const progress = gameProgress(game, history, profile, '2026');
  return { sessionsPerWeek, companion: companionId ?? 'none', sessions: history.length, xp: progress.xp, level: progress.level, objectiveXp: progress.objectiveXp, passiveXp: history.reduce((sum, workout) => sum + workoutPassiveReward(workout).bonusXp, 0), reached };
}
if (process.argv[1]?.endsWith('simulate-season-progression.ts')) {
  console.log(JSON.stringify({ thresholds: Object.fromEntries([25,50,75,99].map(level => [level, characterLevelThreshold(level)])), profile: normalizeProfile(), results: [2,3,4,5].flatMap(rate => [simulate(rate), simulate(rate,'athlete')]), passiveSensitivity: COMPANIONS.map(companion => simulate(4,companion.id)) }, null, 2));
}
