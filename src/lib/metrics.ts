import { validSet, type Workout, type WorkoutExercise } from './model';

/** Derive from confirmed, valid sets. Cents keep decimal loads exact until display. */
export function totals(workouts: Workout[]) {
  let sets = 0, reps = 0, volumeCents = 0, excludedSets = 0;
  const finished = workouts.filter((workout) => workout.status === 'finished');
  for (const workout of finished) for (const exercise of workout.exercises) for (const set of exercise.sets) {
    if (!set.confirmed || !validSet(set, exercise.mode)) continue;
    sets++;
    reps += set.reps!;
    if (exercise.mode === 'external_load_reps') volumeCents += Math.round(set.weight! * 100) * set.reps!;
    else excludedSets++;
  }
  return { workouts: finished.length, sets, reps, volume: volumeCents / 100, excludedSets };
}

/** Compare only identical exercise identities and modes with one shared condition. */
export function comparableSets(previous: WorkoutExercise, current: WorkoutExercise) {
  if (previous.exerciseId !== current.exerciseId || previous.mode !== current.mode) return { loads: [], repetitions: [] };
  const eligible = (exercise: WorkoutExercise) => exercise.sets.filter((set) => set.confirmed && validSet(set, exercise.mode));
  const oldSets = eligible(previous), newSets = eligible(current);
  const oldByReps = new Map<number, number>(), newByReps = new Map<number, number>();
  const oldByWeight = new Map<number, number>(), newByWeight = new Map<number, number>();
  for (const [sets, byReps, byWeight] of [[oldSets, oldByReps, oldByWeight], [newSets, newByReps, newByWeight]] as const) {
    for (const set of sets) {
      const weight = Math.round(set.weight! * 100);
      const reps = set.reps!;
      byReps.set(reps, Math.max(byReps.get(reps) ?? -1, weight));
      byWeight.set(weight, Math.max(byWeight.get(weight) ?? -1, reps));
    }
  }
  const loads = [...newByReps].filter(([reps]) => oldByReps.has(reps)).map(([reps, currentCents]) => {
    const previousCents = oldByReps.get(reps)!;
    return { reps, previous: previousCents / 100, current: currentCents / 100, change: (currentCents - previousCents) / 100,
      percent: previousCents > 0 ? (currentCents - previousCents) / previousCents * 100 : null };
  });
  const repetitions = [...newByWeight].filter(([weight]) => oldByWeight.has(weight)).map(([weightCents, currentReps]) => {
    const previousReps = oldByWeight.get(weightCents)!;
    return { weight: weightCents / 100, previous: previousReps, current: currentReps, change: currentReps - previousReps,
      percent: previousReps > 0 ? (currentReps - previousReps) / previousReps * 100 : null };
  });
  return { loads, repetitions };
}
