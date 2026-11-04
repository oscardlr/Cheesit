import { currentSeasons, inSeason, isMonthSeason } from './seasons';
import { isWorkSet, validSet, type Workout } from './model';
import { rewardSetIndex } from './rewards';
import type { AthleteProfile } from './strength';

export type MuscleId = 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'abs' | 'quads' | 'hamstrings' | 'glutes' | 'calves';
export const MUSCLES: { id: MuscleId; label: string }[] = [
  { id: 'chest', label: 'Pecho' }, { id: 'back', label: 'Espalda' },
  { id: 'shoulders', label: 'Hombros' }, { id: 'biceps', label: 'Bíceps' },
  { id: 'triceps', label: 'Tríceps' }, { id: 'abs', label: 'Abdominales' },
  { id: 'quads', label: 'Cuádriceps' }, { id: 'hamstrings', label: 'Isquiotibiales' },
  { id: 'glutes', label: 'Glúteos' }, { id: 'calves', label: 'Gemelos' },
];
type Involvement = { primary: MuscleId[]; secondary: MuscleId[] };
const mapping: Record<string, Involvement> = {
  'press-banca-barra': { primary: ['chest'], secondary: ['triceps', 'shoulders'] },
  'press-inclinado-mancuernas': { primary: ['chest'], secondary: ['triceps', 'shoulders'] },
  'aperturas-mancuernas': { primary: ['chest'], secondary: ['shoulders'] },
  'aperturas-polea': { primary: ['chest'], secondary: ['shoulders'] },
  flexiones: { primary: ['chest'], secondary: ['triceps', 'shoulders', 'abs'] },
  'jalon-pecho': { primary: ['back'], secondary: ['biceps'] },
  'remo-barra': { primary: ['back'], secondary: ['biceps', 'shoulders'] },
  'remo-polea-baja': { primary: ['back'], secondary: ['biceps', 'shoulders'] },
  'remo-mancuerna': { primary: ['back'], secondary: ['biceps', 'shoulders'] },
  dominadas: { primary: ['back'], secondary: ['biceps'] },
  'sentadilla-barra': { primary: ['quads', 'glutes'], secondary: ['hamstrings', 'abs'] },
  'prensa-piernas': { primary: ['quads'], secondary: ['glutes'] },
  'peso-muerto-convencional': { primary: ['glutes', 'hamstrings'], secondary: ['back', 'quads', 'abs'] },
  'peso-muerto-rumano': { primary: ['hamstrings', 'glutes'], secondary: ['back'] },
  'hip-thrust': { primary: ['glutes'], secondary: ['hamstrings'] },
  'extension-cuadriceps': { primary: ['quads'], secondary: [] },
  'curl-femoral': { primary: ['hamstrings'], secondary: [] },
  'elevacion-gemelos': { primary: ['calves'], secondary: [] },
  'zancadas-mancuernas': { primary: ['quads', 'glutes'], secondary: ['hamstrings'] },
  'press-militar': { primary: ['shoulders'], secondary: ['triceps'] },
  'press-hombros-mancuernas': { primary: ['shoulders'], secondary: ['triceps'] },
  'elevaciones-laterales': { primary: ['shoulders'], secondary: [] },
  'elevaciones-frontales': { primary: ['shoulders'], secondary: [] },
  'pajaros-mancuernas': { primary: ['shoulders'], secondary: ['back'] },
  'curl-barra': { primary: ['biceps'], secondary: [] },
  'curl-alterno-mancuernas': { primary: ['biceps'], secondary: [] },
  'curl-martillo': { primary: ['biceps'], secondary: [] },
  'curl-polea': { primary: ['biceps'], secondary: [] },
  'extension-triceps-polea': { primary: ['triceps'], secondary: [] },
  'extension-cabeza-mancuerna': { primary: ['triceps'], secondary: [] },
  'press-frances': { primary: ['triceps'], secondary: [] },
  'crunch-abdominal': { primary: ['abs'], secondary: [] },
  'elevacion-piernas': { primary: ['abs'], secondary: [] },
  'crunch-polea': { primary: ['abs'], secondary: [] },
};
const groupFallback: Record<string, MuscleId[]> = {
  Pecho: ['chest'], Espalda: ['back'], Hombro: ['shoulders'], Bíceps: ['biceps'],
  Tríceps: ['triceps'], Abdominales: ['abs'], 'Pierna y glúteo': ['quads', 'hamstrings', 'glutes', 'calves'],
};

export type MuscleActivity = {
  id: MuscleId;
  label: string;
  sets: number;
  secondarySets: number;
  weightedSets: number;
  reps: number;
  lastDate: string | null;
  approximate: boolean;
  xp: number;
  level: number;
  levelXp: number;
  nextLevelXp: number;
  percent: number;
  lifetimeSets: number;
  rank: string;
};

export function muscleLevelFromXp(xp: number) {
  const safeXp = Number.isFinite(xp) ? Math.max(0, Math.round(xp * 10) / 10) : 0;
  let level = Math.max(1, Math.floor((-450 + Math.sqrt(450 ** 2 + 200 * safeXp)) / 100) + 1);
  const threshold = (value: number) => 500 * (value - 1) + 50 * (value - 1) * (value - 2);
  while (threshold(level + 1) <= safeXp) level++;
  while (threshold(level) > safeXp) level--;
  const levelXp = safeXp - threshold(level), nextLevelXp = 500 + (level - 1) * 100;
  return { xp: safeXp, level, levelXp, nextLevelXp, percent: levelXp / nextLevelXp * 100,
    rank: level >= 20 ? 'Titán' : level >= 10 ? 'Potencia' : level >= 5 ? 'En forma' : 'En construcción' };
}

/** All visible activity and RPG XP belong to one civil month; lifetime sets are separate. */
export function muscleActivity(history: Workout[], today: string, days: number | string = currentSeasons().month, profile?: AthleteProfile): MuscleActivity[] {
  // Numeric legacy window arguments now select the current month.
  const month = typeof days === 'string' && isMonthSeason(days) ? days : today.slice(0, 7);
  const result: MuscleActivity[] = MUSCLES.map(muscle => ({ ...muscle, sets: 0, secondarySets: 0, weightedSets: 0, reps: 0, lastDate: null, approximate: false, lifetimeSets: 0, ...muscleLevelFromXp(0) }));
  const byId = new Map(result.map(muscle => [muscle.id, muscle]));
  const earned = rewardSetIndex(history, profile), visited = new Set<string>();
  for (const workout of history) {
    if (workout.status === 'deleted' || workout.date > today) continue;
    for (const exercise of workout.exercises) {
      const known = exercise.primaryMuscles ? { primary: exercise.primaryMuscles, secondary: exercise.secondaryMuscles ?? [] } : mapping[exercise.exerciseId];
      const targets: Involvement = known ?? { primary: groupFallback[exercise.group] ?? [], secondary: [] };
      const sets = exercise.sets.filter(set => {
        if (!isWorkSet(set) || !set.confirmed || !validSet(set, exercise.mode) || visited.has(set.id)) return false;
        visited.add(set.id); return true;
      });
      if (!sets.length) continue;
      for (const primary of [true, false]) {
        for (const target of primary ? targets.primary : targets.secondary) {
          const muscle = byId.get(target);
          if (!muscle) continue;
          const factor = primary ? 1 : 0.5;
          muscle.lifetimeSets += sets.length * factor;
          if (inSeason(workout.date, month)) {
            muscle.xp += sets.reduce((sum, set) => sum + (earned.get(set.id)?.xp ?? 0) * factor, 0);
            if (primary) muscle.sets += sets.length;
            else muscle.secondarySets += sets.length;
            muscle.weightedSets += sets.length * factor;
            muscle.reps += sets.reduce((sum, set) => sum + set.reps!, 0);
            muscle.lastDate = !muscle.lastDate || workout.date > muscle.lastDate ? workout.date : muscle.lastDate;
          }
          if (inSeason(workout.date, month)) muscle.approximate ||= !known;
        }
      }
    }
  }
  return result.map(muscle => ({ ...muscle, ...muscleLevelFromXp(muscle.xp) }));
}
