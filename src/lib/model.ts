import type { TrainingFeatures } from './training-features';
import { CATALOG } from './catalog';
import { todayMadrid } from './dates';
import type { GameState } from './game';
import type { AthleteProfile } from './strength';
import type { PersonalProfile } from './personal-profile';
import type { AbilityUse } from './abilities';
import type { MuscleId } from './muscles';
import { snapshotWorkoutPassive, type CompanionPassiveAward, type CompanionPassiveSnapshot } from './cheesit-passives';

export type ExerciseMode = 'external_load_reps' | 'bodyweight_reps';
/** Reps count the movements performed: alternating/single loads are never doubled. */
export type LoadConvention = 'total' | 'per_unit_bilateral' | 'per_unit_alternating' | 'per_unit_single';
export type ExerciseMetadata = { loadConvention?: LoadConvention; primaryMuscles?: MuscleId[]; secondaryMuscles?: MuscleId[] };
export type Exercise = ExerciseMetadata & { id: string; name: string; group: string; mode: ExerciseMode; image?: string; archived?: boolean; description?: string; technique?: string; equipment?: string; resource?: { title: string; url: string; license: string } };
export type SetKind = 'work' | 'warmup';
export const isWorkSet = (set: Pick<WorkoutSet, 'kind'>): boolean => set.kind !== 'warmup';
export type WorkoutSet = { kind?: SetKind; id: string; weight: number | null; reps: number | null; confirmed: boolean; rpe?: number | null; rir?: number | null; weightText?: string; repsText?: string };
export type ExercisePrescription = { repsMin?: number | null; repsMax?: number | null; targetWeight?: number | null; restSeconds?: number | null; notes?: string };
export type WorkoutExercise = { supersetId?: string } & ExerciseMetadata & ExercisePrescription & { id: string; exerciseId: string; name: string; group: string; mode: ExerciseMode; sets: WorkoutSet[] };
/** Historical sessions without this field remain unpublished. */
export type WorkoutPublication = { published: boolean; photoPath?: string; caption?: string; mentions?: import('./post-mentions').PostMentions };
export type Workout = { publication?: WorkoutPublication; routineId?: string; cycleLink?: { cycleId: string; position: number; routineId: string }; id: string; date: string; name: string; color: string; status: 'draft' | 'finished' | 'deleted'; createdAt: string; updatedAt: string; exercises: WorkoutExercise[]; abilityId?:string|null; abilityReward?:AbilityUse; companionPassive?: CompanionPassiveSnapshot | null; companionReward?: CompanionPassiveAward; notes?: string; startedAt?: string; finishedAt?: string; autoRest?: boolean; defaultRestSeconds?: number; restTimer?: { endsAt: string | null; remainingSeconds: number; durationSeconds: number } };
export type RoutineExercise = { setKinds?: SetKind[]; supersetId?: string } & ExercisePrescription & { id: string; exerciseId: string; sets: number };
export const ROUTINE_ICONS = ['dumbbell', 'biceps-flexed', 'target', 'flame', 'activity', 'timer', 'mountain', 'heart-pulse'] as const;
export type RoutineIconId = typeof ROUTINE_ICONS[number];
export const DEFAULT_ROUTINE_ICON: RoutineIconId = 'dumbbell';
export const isRoutineIcon = (value: unknown): value is RoutineIconId => typeof value === 'string' && (ROUTINE_ICONS as readonly string[]).includes(value);
/** Missing icons in historical snapshots resolve without rewriting their data. */
export const resolvedRoutineIcon = (value: unknown): RoutineIconId => isRoutineIcon(value) ? value : DEFAULT_ROUTINE_ICON;
export type Routine = { id: string; name: string; color: string; icon?: RoutineIconId; archived: boolean; exercises: RoutineExercise[]; notes?: string };
export type RoutineDraft = Omit<Routine, 'exercises'> & { exercises: (Omit<RoutineExercise, 'sets'> & { sets: number | null })[] };
export type AppData = { training?: TrainingFeatures; routines: Routine[]; workouts: Workout[]; customExercises: Exercise[]; routineDraft?: RoutineDraft; game?: GameState; profile?: AthleteProfile; personalProfile?: PersonalProfile; preferences?: { effects: boolean; sound: boolean } };

export const ROUTINE_COLOR_OPTIONS = [
  { value: '#d8ff3e', label: 'lima' }, { value: '#61C9A8', label: 'jade' },
  { value: '#7BB7F0', label: 'azul cielo' }, { value: '#B8A0FF', label: 'lavanda' },
  { value: '#F2C56B', label: 'ámbar' }, { value: '#EC8997', label: 'coral' },
] as const;
export const COLORS = ROUTINE_COLOR_OPTIONS.map(color => color.value);
/** Historical colors remain valid for local data, backups and account sync. */
export const LEGACY_ROUTINE_COLORS = ['#0057C2', '#6638A6', '#176B43', '#A61B29', '#8B4500', '#475569'] as const;
export const isRoutineColor = (value: unknown): value is string => typeof value === 'string' && ([...COLORS, ...LEGACY_ROUTINE_COLORS] as readonly string[]).includes(value);
export const WORKOUT_COLOR = '#d8ff3e';
export const emptyData = (): AppData => ({ routines: [], workouts: [], customExercises: [] });
export const newId = (): string => crypto.randomUUID();
export const newSet = (): WorkoutSet => ({ id: newId(), weight: null, reps: null, confirmed: false });

/** Copies exercise information at the time a session starts. */
export function newWorkout(routine?: Routine, exercises: Exercise[] = CATALOG, profile?: AthleteProfile, game?: GameState): Workout {
  if (routine?.exercises.some(item => !validPlannedSets(item.sets))) throw new Error('Las series previstas deben ser un entero entre 1 y 20.');
  if (routine?.exercises.some(item => !validRoutinePrescription(item))) throw new Error('Revisa los rangos de repeticiones, carga y descanso de la rutina.');
  const now = new Date().toISOString();
  return snapshotWorkoutPassive({
    id: newId(), date: todayMadrid(), name: routine?.name ?? 'Entrenamiento', color: WORKOUT_COLOR,
    ...(routine ? { routineId: routine.id } : {}), status: 'draft', createdAt: now, updatedAt: now, startedAt: now, ...(routine?.notes ? { notes: routine.notes } : {}),
    exercises: (routine?.exercises ?? []).flatMap((item) => {
      const exercise = exercises.find((candidate) => candidate.id === item.exerciseId);
      if (!exercise) return [];
      const { id: _id, exerciseId: _exerciseId, sets: _sets, setKinds, ...prescription } = item;
      return [{ ...prescription, ...exerciseSnapshot(exercise, profile), id: newId(),
        sets: Array.from({ length: item.sets }, (_, index) => ({ ...newSet(), kind: setKinds?.[index] ?? 'work', weight: exercise.mode === 'bodyweight_reps' ? 0 : item.targetWeight ?? null, reps: item.repsMin ?? null })) }];
    }),
  }, game);
}

export function validSet(set: WorkoutSet, mode: ExerciseMode): boolean {
  return set.weight !== null && Number.isFinite(set.weight) && set.weight >= 0 && set.weight <= 1000 &&
    Math.abs(set.weight * 100 - Math.round(set.weight * 100)) < 1e-8 && (mode !== 'bodyweight_reps' || set.weight === 0) &&
    set.reps !== null && Number.isInteger(set.reps) && set.reps >= 1 && set.reps <= 1000;
}

/** Accept Spanish decimal commas or points, rejecting grouping and exponent notation. */
export function parseWeight(input: string): number | null {
  const value = input.trim();
  if (!/^\d{1,4}(?:[.,]\d{1,2})?$/.test(value)) return null;
  const number = Number(value.replace(',', '.'));
  return number <= 1000 ? number : null;
}

export function validName(name: string): boolean { return name.trim().length >= 1 && name.trim().length <= 80; }

export function validPlannedSets(value: number): boolean { return Number.isInteger(value) && value >= 1 && value <= 20; }

export function validRoutinePrescription(value: ExercisePrescription): boolean {
  const optional = (number: number | null | undefined, min: number, max: number, integer = false) => number == null || (Number.isFinite(number) && number >= min && number <= max && (!integer || Number.isInteger(number)));
  return optional(value.repsMin, 1, 1000, true) && optional(value.repsMax, 1, 1000, true) && (value.repsMin == null || value.repsMax == null || value.repsMin <= value.repsMax) && optional(value.targetWeight, 0, 1000) && (value.targetWeight == null || Math.abs(value.targetWeight * 100 - Math.round(value.targetWeight * 100)) < 1e-8) && optional(value.restSeconds, 0, 3600, true) && (value.notes === undefined || value.notes.length <= 4000);
}

/** A duplicate remains a valid name even when the original already uses all 80 characters. */
export function copiedName(value: string, existingNames: string[] = []): string {
  const fold = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-ES').trim().replace(/\s+/g, ' ');
  const existing = new Set(existingNames.map(fold));
  const base = `Copia de ${value.trim()}`;
  const bounded = (text: string, length: number) => text.slice(0, length).replace(/[\uD800-\uDBFF]$/, '').trimEnd();
  let candidate = bounded(base, 80), number = 2;
  while (existing.has(fold(candidate))) {
    const suffix = ` (${number++})`;
    candidate = `${bounded(base, 80 - suffix.length)}${suffix}`;
  }
  return candidate;
}

export const CATALOG_LOAD_CONVENTIONS: Readonly<Record<string, LoadConvention>> = {
  'press-inclinado-mancuernas': 'per_unit_bilateral', 'aperturas-mancuernas': 'per_unit_bilateral',
  'zancadas-mancuernas': 'per_unit_bilateral', 'press-hombros-mancuernas': 'per_unit_bilateral',
  'elevaciones-laterales': 'per_unit_bilateral', 'elevaciones-frontales': 'per_unit_bilateral',
  'pajaros-mancuernas': 'per_unit_bilateral', 'curl-martillo': 'per_unit_bilateral',
  'curl-alterno-mancuernas': 'per_unit_alternating', 'remo-mancuerna': 'per_unit_single',
  'extension-cabeza-mancuerna': 'per_unit_single',
};
export function resolvedLoadConvention(exercise: Pick<WorkoutExercise, 'exerciseId' | 'mode' | 'loadConvention'>, profile?: AthleteProfile): LoadConvention {
  if (exercise.loadConvention) return exercise.loadConvention;
  if (exercise.mode === 'bodyweight_reps') return 'total';
  const known = Object.hasOwn(CATALOG_LOAD_CONVENTIONS, exercise.exerciseId) ? CATALOG_LOAD_CONVENTIONS[exercise.exerciseId] : 'total';
  return known === 'per_unit_bilateral' && profile?.dumbbellLoad === 'pair' ? 'total' : known;
}

/** Store the convention and anatomy with the session, so later edits cannot reinterpret it. */
export function exerciseSnapshot(exercise: Exercise, profile?: AthleteProfile): Pick<WorkoutExercise, 'exerciseId' | 'name' | 'group' | 'mode' | 'loadConvention' | 'primaryMuscles' | 'secondaryMuscles'> {
  return { exerciseId: exercise.id, name: exercise.name, group: exercise.group, mode: exercise.mode,
    loadConvention: resolvedLoadConvention({ ...exercise, exerciseId: exercise.id }, profile),
    ...(exercise.primaryMuscles ? { primaryMuscles: [...exercise.primaryMuscles] } : {}),
    ...(exercise.secondaryMuscles ? { secondaryMuscles: [...exercise.secondaryMuscles] } : {}) };
}

export function snapshotLoadConventions(data: AppData): AppData {
  return { ...data, workouts: data.workouts.map(workout => ({ ...workout, exercises: workout.exercises.map(exercise => exercise.loadConvention ? exercise : { ...exercise, loadConvention: resolvedLoadConvention(exercise, data.profile) }) })) };
}

/** Reuse values without confirming them; fill missing rows with independent IDs. */
export function copyPreviousSets(current: WorkoutSet[], previous: WorkoutSet[], index?: number): WorkoutSet[] {
  const result = current.map(set => ({ ...set }));
  const indices = index === undefined ? previous.map((_, i) => i) : [index];
  for (const i of indices) {
    if (!Number.isInteger(i) || i < 0 || i >= 50 || !previous[i]) continue;
    while (result.length <= i) result.push(newSet());
    const source = previous[i];
    result[i] = { ...result[i], weight: source.weight, reps: source.reps, confirmed: false, kind: source.kind ?? 'work', rpe: source.rpe, rir: source.rir, weightText: undefined, repsText: undefined };
  }
  return result;
}
