import { workoutExerciseSessions } from './metrics';
import type { Workout } from './model';
import { effectiveLoad } from './strength';

export type ExerciseGoal = { id: string; exerciseId: string; targetKg: number };
export const MAX_EXERCISE_GOALS = 1000;

export function validExerciseGoalWeight(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= .01 && value <= 2000 &&
    Math.abs(value * 100 - Math.round(value * 100)) < 1e-8;
}

export function validExerciseGoals(value: unknown): value is ExerciseGoal[] {
  if (!Array.isArray(value) || value.length > MAX_EXERCISE_GOALS) return false;
  const ids = new Set<string>();
  return value.every(goal => {
    if (!goal || typeof goal.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(goal.id) || ids.has(goal.id) ||
      typeof goal.exerciseId !== 'string' || goal.exerciseId.length === 0 || goal.exerciseId.length > 100 ||
      !validExerciseGoalWeight(goal.targetKg)) return false;
    ids.add(goal.id);
    return true;
  });
}

export function exerciseGoalProgress(history: Workout[], exerciseId: string, today: string) {
  const sessions = workoutExerciseSessions(history, exerciseId, 'external_load_reps').filter(({ w }) => w.date <= today);
  let latest: { date: string; weightKg: number } | undefined;
  let best = 0;
  for (const { w, e } of sessions) {
    const weightKg = Math.round(Math.max(...e.sets.map(set => effectiveLoad(e, set.weight!))) * 100) / 100;
    latest ??= { date: w.date, weightKg };
    best = Math.max(best, weightKg);
  }
  return { latest, best };
}
