import { isWorkSet, validSet, type Workout, type WorkoutExercise } from './model';
import { effectiveLoad, type AthleteProfile } from './strength';

/** Derive from confirmed, valid sets. Cents keep decimal loads exact until display. */
export function totals(workouts: Workout[], profile?: AthleteProfile) {
  let sets = 0, reps = 0, volumeCents = 0, excludedSets = 0;
  const finished = workouts.filter((workout) => workout.status === 'finished');
  for (const workout of finished) for (const exercise of workout.exercises) for (const set of exercise.sets) {
    if (!isWorkSet(set) || !set.confirmed || !validSet(set, exercise.mode)) continue;
    sets++;
    reps += set.reps!;
    if (exercise.mode === 'external_load_reps') volumeCents += Math.round(effectiveLoad(exercise, set.weight!, profile) * 100) * set.reps!;
    else excludedSets++;
  }
  return { workouts: finished.length, sets, reps, volume: volumeCents / 100, excludedSets };
}

/** Compare only identical exercise identities and modes with one shared condition. */
export function comparableSets(previous: WorkoutExercise, current: WorkoutExercise) {
  if (previous.exerciseId !== current.exerciseId || previous.mode !== current.mode) return { loads: [], repetitions: [] };
  const eligible = (exercise: WorkoutExercise) => exercise.sets.filter((set) => isWorkSet(set) && set.confirmed && validSet(set, exercise.mode));
  const oldSets = eligible(previous), newSets = eligible(current);
  const oldByReps = new Map<number, number>(), newByReps = new Map<number, number>();
  const oldByWeight = new Map<number, number>(), newByWeight = new Map<number, number>();
  for (const [sets, byReps, byWeight] of [[oldSets, oldByReps, oldByWeight], [newSets, newByReps, newByWeight]] as const) {
    for (const set of sets) {
      // Compare physical external load, even if historical inputs used a pair total.
      const exercise = sets === oldSets ? previous : current;
      const weight = Math.round(effectiveLoad(exercise, set.weight!) * 100);
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

/** Each entry is one session and mode; repeated exercise blocks share one set list. */
export function workoutExerciseSessions(history: Workout[], exerciseId: string, mode?: WorkoutExercise['mode'], options: { includeWarmups?: boolean } = {}): { w: Workout; e: WorkoutExercise }[] {
  return history.filter(w => w.status === 'finished').flatMap(w => {
    const grouped = new Map<WorkoutExercise['mode'], WorkoutExercise[]>();
    for (const exercise of w.exercises) {
      if (exercise.exerciseId !== exerciseId || (mode && exercise.mode !== mode)) continue;
      grouped.set(exercise.mode, [...(grouped.get(exercise.mode) ?? []), exercise]);
    }
    return [...grouped.values()].map(blocks => {
      const first = blocks[0];
      const differentConventions = blocks.some(block => block.loadConvention !== first.loadConvention);
      const ids = new Set<string>();
      const sets = blocks.flatMap(block => block.sets.filter(set => {
        if (ids.has(set.id) || (!options.includeWarmups && !isWorkSet(set)) || !set.confirmed || !validSet(set, block.mode)) return false;
        ids.add(set.id); return true;
      }).map(set => differentConventions ? { ...set, weight: effectiveLoad(block, set.weight!) } : { ...set }));
      return { w, e: { ...first, ...(differentConventions ? { loadConvention: 'total' as const } : {}), sets } };
    }).filter(entry => entry.e.sets.length > 0);
  }).sort((a, b) => b.w.date.localeCompare(a.w.date) || b.w.createdAt.localeCompare(a.w.createdAt) || b.w.id.localeCompare(a.w.id) || a.e.mode.localeCompare(b.e.mode));
}

/** Session copying preserves all confirmed valid rows, including warmups, at their original positions. */
export function workoutCopySessions(history: Workout[], exerciseId: string, mode?: WorkoutExercise['mode']) {
  return workoutExerciseSessions(history, exerciseId, mode, { includeWarmups: true });
}

export type ExerciseProgressSession = {
  workout: Workout;
  kgReps: number | null;
  newRecord: boolean;
};

/** Track the best single work set per session using recorded external load. */
export function exerciseProgressSessions(history: Workout[], exerciseId: string): ExerciseProgressSession[] {
  const sessions = new Map<string, ExerciseProgressSession>();
  for (const { w, e } of workoutExerciseSessions(history, exerciseId, undefined, { includeWarmups: true })) {
    const session = sessions.get(w.id) ?? { workout: w, kgReps: null, newRecord: false };
    if (e.mode === 'external_load_reps') {
      for (const set of e.sets) {
        if (!isWorkSet(set)) continue;
        const loadCents = Math.round(effectiveLoad(e, set.weight!) * 100);
        session.kgReps = Math.max(session.kgReps ?? 0, loadCents * set.reps! / 100);
      }
    }
    sessions.set(w.id, session);
  }

  // The grouped entries arrive newest first. Compare each session against all earlier sessions.
  const latestFirst = [...sessions.values()];
  let best: number | null = null;
  for (let i = latestFirst.length - 1; i >= 0; i--) {
    const session = latestFirst[i];
    if (session.kgReps === null || session.kgReps === 0) continue;
    session.newRecord = best !== null && session.kgReps > best;
    best = Math.max(best ?? 0, session.kgReps);
  }
  return latestFirst;
}
