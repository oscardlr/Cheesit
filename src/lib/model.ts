import { CATALOG } from './catalog';
import { todayMadrid } from './dates';
import type { GameState } from './game';
import type { AthleteProfile } from './strength';
import type { AbilityUse } from './abilities';

export type ExerciseMode = 'external_load_reps' | 'bodyweight_reps';
export type Exercise = { id: string; name: string; group: string; mode: ExerciseMode; image?: string };
export type WorkoutSet = { id: string; weight: number | null; reps: number | null; confirmed: boolean };
export type WorkoutExercise = { id: string; exerciseId: string; name: string; group: string; mode: ExerciseMode; sets: WorkoutSet[] };
export type Workout = { id: string; date: string; name: string; color: string; status: 'draft' | 'finished' | 'deleted'; createdAt: string; updatedAt: string; exercises: WorkoutExercise[]; abilityId?:string|null; abilityReward?:AbilityUse };
export type RoutineExercise = { id: string; exerciseId: string; sets: number };
export type Routine = { id: string; name: string; color: string; archived: boolean; exercises: RoutineExercise[] };
export type AppData = { routines: Routine[]; workouts: Workout[]; customExercises: Exercise[]; game?: GameState; profile?: AthleteProfile; preferences?: { effects: boolean; sound: boolean } };

export const COLORS = ['#0057C2', '#6638A6', '#176B43', '#A61B29', '#8B4500', '#475569'] as const;
export const WORKOUT_COLOR = '#d8ff3e';
export const emptyData = (): AppData => ({ routines: [], workouts: [], customExercises: [] });
export const newId = (): string => crypto.randomUUID();
export const newSet = (): WorkoutSet => ({ id: newId(), weight: null, reps: null, confirmed: false });

/** Copies exercise information at the time a session starts. */
export function newWorkout(routine?: Routine, exercises: Exercise[] = CATALOG): Workout {
  const now = new Date().toISOString();
  return {
    id: newId(), date: todayMadrid(), name: routine?.name ?? 'Entrenamiento', color: WORKOUT_COLOR,
    status: 'draft', createdAt: now, updatedAt: now,
    exercises: (routine?.exercises ?? []).flatMap((item) => {
      const exercise = exercises.find((candidate) => candidate.id === item.exerciseId);
      if (!exercise) return [];
      return [{ id: newId(), exerciseId: exercise.id, name: exercise.name, group: exercise.group, mode: exercise.mode,
        sets: Array.from({ length: Math.max(1, Math.min(20, item.sets)) }, () => newSet()) }];
    }),
  };
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
