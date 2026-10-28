import { validSet, type Workout, type WorkoutExercise, type WorkoutSet } from './model';
import { effectiveLoad, normalizeProfile, strengthReference, type AthleteProfile } from './strength';
import { isAbilityUse } from './abilities';

/** Base only: the full series reward also reflects reps, load and personal progress. */
export const SET_XP = 30;
export const WORKOUT_XP = 200;
export const VARIETY_XP = 100;
export const RECORD_XP = 75;
export const MAX_SET_XP = 130;

export function levelRank(level: number): string {
  return level >= 30 ? 'Leyenda del hierro' : level >= 20 ? 'Titán' : level >= 10 ? 'Imparable' : level >= 5 ? 'Atleta' : 'En construcción';
}

export type SetReward = { xp: number; baseXp: number; repsXp: number; loadXp: number; progressXp: number; relativeLoad: number; estimatedOneRepMax: number | null; record: boolean; abilityXp?: number };
type Previous = { score: number; weights: Map<number, number>; reps: Map<number, number> };
const conditionKey = (exercise: WorkoutExercise) => JSON.stringify([exercise.exerciseId, exercise.mode]);
function performanceScore(exercise: WorkoutExercise, set: WorkoutSet, profile?: AthleteProfile): number {
  return exercise.mode === 'bodyweight_reps' ? Math.min(set.reps!, 30) : effectiveLoad(exercise, set.weight!, profile) * (1 + Math.min(set.reps!, 15) / 30);
}
function calculateSet(exercise: WorkoutExercise, set: WorkoutSet, previous: Previous | undefined, profile?: AthleteProfile): SetReward {
  if (!validSet(set, exercise.mode)) return { xp: 0, baseXp: 0, repsXp: 0, loadXp: 0, progressXp: 0, relativeLoad: 0, estimatedOneRepMax: null, record: false };
  const reference = strengthReference(exercise, set, profile);
  const repsXp = 2 * Math.min(set.reps!, 15);
  const loadXp = exercise.mode === 'bodyweight_reps' ? 10 : Math.min(40, Math.round(20 * reference.relativeLoad));
  const score = performanceScore(exercise, set, profile);
  const progressXp = previous && previous.score > 0 ? Math.min(30, Math.round(100 * Math.max(0, score / previous.score - 1))) : 0;
  const weight = Math.round(set.weight! * 100), reps = set.reps!;
  const bestWeight = previous?.weights.get(reps), bestReps = previous?.reps.get(weight);
  const record = (bestWeight !== undefined && weight > bestWeight) || (bestReps !== undefined && reps > bestReps);
  return { xp: SET_XP + repsXp + loadXp + progressXp, baseXp: SET_XP, repsXp, loadXp, progressXp,
    relativeLoad: reference.relativeLoad, estimatedOneRepMax: reference.estimatedOneRepMax, record };
}
function updatePrevious(previous: Previous | undefined, exercise: WorkoutExercise, set: WorkoutSet, profile?: AthleteProfile): Previous {
  const result = previous ?? { score: 0, weights: new Map<number, number>(), reps: new Map<number, number>() };
  result.score = Math.max(result.score, performanceScore(exercise, set, profile));
  const weight = Math.round(set.weight! * 100), reps = set.reps!;
  result.weights.set(reps, Math.max(result.weights.get(reps) ?? -1, weight));
  result.reps.set(weight, Math.max(result.reps.get(weight) ?? -1, reps));
  return result;
}

/** Preview or confirmation: valid input may be evaluated before confirmed becomes true. */
export function setReward(exercise: WorkoutExercise, set: WorkoutSet, history: Workout[], workoutId: string, workoutDate: string, profile?: AthleteProfile): SetReward {
  let previous: Previous | undefined;
  for (const workout of history) {
    if (workout.status !== 'finished' || workout.id === workoutId || workout.date >= workoutDate) continue;
    for (const candidate of workout.exercises) {
      if (conditionKey(candidate) !== conditionKey(exercise)) continue;
      for (const old of candidate.sets) if (old.confirmed && validSet(old, candidate.mode)) previous = updatePrevious(previous, candidate, old, profile);
    }
  }
  return calculateSet(exercise, set, previous, profile);
}

/** One chronological pass; same-date sessions and drafts cannot raise the comparison baseline. */
export function rewardSetIndex(history: Workout[], profile?: AthleteProfile): Map<string, SetReward> {
  const currentProfile = normalizeProfile(profile);
  const sorted = history.filter(workout => workout.status !== 'deleted').sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const previous = new Map<string, Previous>();
  const rewards = new Map<string, SetReward>();
  let index = 0;
  while (index < sorted.length) {
    const date = sorted[index].date;
    const toPublish: { exercise: WorkoutExercise; set: WorkoutSet }[] = [];
    while (index < sorted.length && sorted[index].date === date) {
      const workout = sorted[index++];
      const ability = workout.status === 'finished' && isAbilityUse(workout.abilityReward) && workout.abilityReward.workoutId === workout.id && workout.abilityReward.abilityId === workout.abilityId ? workout.abilityReward : null;
      for (const exercise of workout.exercises) for (const set of exercise.sets) {
        if (!set.confirmed || !validSet(set, exercise.mode) || rewards.has(set.id)) continue;
        const core = calculateSet(exercise, set, previous.get(conditionKey(exercise)), currentProfile);
        const abilityXp = ability?.setBonuses[set.id] ?? 0;
        rewards.set(set.id, abilityXp ? { ...core, xp: core.xp + abilityXp, abilityXp } : core);
        if (workout.status === 'finished') toPublish.push({ exercise, set });
      }
    }
    for (const { exercise, set } of toPublish) previous.set(conditionKey(exercise), updatePrevious(previous.get(conditionKey(exercise)), exercise, set, currentProfile));
  }
  return rewards;
}

export function levelProgress(xp: number) {
  const safeXp = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  let level = Math.max(1, Math.floor((-875 + Math.sqrt(875 ** 2 + 500 * safeXp)) / 250) + 1);
  const threshold = (value: number) => 1000 * (value - 1) + 125 * (value - 1) * (value - 2);
  while (threshold(level + 1) <= safeXp) level++;
  while (threshold(level) > safeXp) level--;
  const levelXp = safeXp - threshold(level), nextLevelXp = 1000 + (level - 1) * 250;
  return { xp: safeXp, level, levelXp, nextLevelXp, percent: levelXp / nextLevelXp * 100 };
}
function sessionReward(workout: Workout, index: Map<string, SetReward>, visited = new Set<string>()) {
  let sets = 0, setXp = 0, records = 0, abilityXp = 0;
  const groups = new Set<string>();
  if (workout.status !== 'deleted') for (const exercise of workout.exercises) for (const set of exercise.sets) {
    const reward = index.get(set.id);
    if (!set.confirmed || !validSet(set, exercise.mode) || !reward || visited.has(set.id)) continue;
    visited.add(set.id); sets++; setXp += reward.xp - (reward.abilityXp ?? 0); abilityXp += reward.abilityXp ?? 0;
    if (reward.record) records++;
    groups.add(exercise.group);
  }
  const finished = workout.status === 'finished' && sets > 0;
  const finishXp = finished ? WORKOUT_XP : 0, varietyXp = finished && groups.size >= 3 ? VARIETY_XP : 0;
  if (!finished) { records = 0; abilityXp = 0; }
  const abilityCredits = finished && isAbilityUse(workout.abilityReward) && workout.abilityReward.workoutId === workout.id && workout.abilityReward.abilityId === workout.abilityId ? workout.abilityReward.bonusCredits : 0;
  const recordXp = records * RECORD_XP, bonusXp = finishXp + varietyXp + recordXp + abilityXp, totalXp = setXp + bonusXp;
  return { sets, setXp, finishXp, varietyXp, recordXp, records, abilityXp, abilityCredits, bonusXp, totalXp, credits: Math.floor(totalXp / 5) + abilityCredits };
}

/** Series are earned during the draft; only bonusXp is new on finish. */
export function workoutReward(workout: Workout, history: Workout[], profile?: AthleteProfile) {
  const complete = [...history.filter(candidate => candidate.id !== workout.id), workout];
  return sessionReward(workout, rewardSetIndex(complete, profile));
}
/** Recompute saved activity instead of accumulating awards, including after edits/deletions. */
export function rewardProgress(history: Workout[], profile?: AthleteProfile) {
  const index = rewardSetIndex(history, profile), visited = new Set<string>();
  let sets = 0, workouts = 0, xp = 0;
  for (const workout of history) {
    const reward = sessionReward(workout, index, visited);
    sets += reward.sets; xp += reward.totalXp;
    if (reward.finishXp) workouts++;
  }
  return { ...levelProgress(xp), sets, workouts };
}
/** A record needs an earlier equivalent condition, never a first attempt. */
export function isPersonalRecord(exercise: WorkoutExercise, set: WorkoutSet, history: Workout[], workoutId: string, workoutDate: string): boolean {
  return setReward(exercise, set, history, workoutId, workoutDate).record;
}
