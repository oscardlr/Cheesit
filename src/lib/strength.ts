import { CATALOG_LOAD_CONVENTIONS, resolvedLoadConvention, isWorkSet, validSet, type WorkoutExercise, type WorkoutSet } from './model';
import { isWeightTracking, validBodyWeight, type WeightTracking } from './body-weight';

export type AthleteProfile = {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: 'male' | 'female';
  dumbbellLoad?: 'per_hand' | 'pair';
  rewardWeightKg?: number;
  weightTracking?: WeightTracking;
};
export const DEFAULT_PROFILE: AthleteProfile = { weightKg: 70, heightCm: 180, age: 20, sex: 'male', dumbbellLoad: 'per_hand' };
export const STRENGTH_SOURCES = [
  { title: 'ACSM: individualización y constancia (2026)', url: 'https://acsm.org/resistance-training-guidelines-update-2026/' },
  { title: 'Estimación de 1RM: validación en banca, sentadilla y peso muerto', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8471343/' },
  { title: 'El número de repeticiones condiciona la predicción de 1RM', url: 'https://pubmed.ncbi.nlm.nih.gov/12741856/' },
] as const;

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export function isAthleteProfile(value: unknown): value is AthleteProfile {
  return object(value) && typeof value.weightKg === 'number' && Number.isFinite(value.weightKg) && value.weightKg >= 30 && value.weightKg <= 300 &&
    typeof value.heightCm === 'number' && Number.isFinite(value.heightCm) && value.heightCm >= 100 && value.heightCm <= 250 &&
    typeof value.age === 'number' && Number.isInteger(value.age) && value.age >= 16 && value.age <= 100 &&
    (value.sex === 'male' || value.sex === 'female') && (value.dumbbellLoad === undefined || value.dumbbellLoad === 'per_hand' || value.dumbbellLoad === 'pair') &&
    (value.rewardWeightKg === undefined || validBodyWeight(value.rewardWeightKg)) && (value.weightTracking === undefined || isWeightTracking(value.weightTracking));
}
export function normalizeProfile(value?: unknown): AthleteProfile {
  if (!isAthleteProfile(value)) return { ...DEFAULT_PROFILE };
  return { weightKg: value.weightKg, heightCm: value.heightCm, age: value.age, sex: value.sex, dumbbellLoad: value.dumbbellLoad ?? 'per_hand', ...(value.rewardWeightKg !== undefined ? { rewardWeightKg: value.rewardWeightKg } : {}), ...(value.weightTracking ? { weightTracking: structuredClone(value.weightTracking) } : {}) };
}

/** Game targets, deliberately NOT population averages or exercise prescriptions. */
const GAME_REFERENCES: Record<string, { ratio: number; name: string }> = {
  'press-banca-barra': { ratio: 1, name: 'Banca: 1 × tu peso' },
  'sentadilla-barra': { ratio: 1.25, name: 'Sentadilla: 1,25 × tu peso' },
  'peso-muerto-convencional': { ratio: 1.5, name: 'Peso muerto: 1,5 × tu peso' },
  'peso-muerto-rumano': { ratio: 1.2, name: 'Peso muerto rumano: 1,2 × tu peso' },
  'press-militar': { ratio: 0.6, name: 'Press militar: 0,6 × tu peso' },
  'remo-barra': { ratio: 0.8, name: 'Remo: 0,8 × tu peso' },
};
const ESTIMATED_MAX_EXERCISES = new Set(['press-banca-barra', 'sentadilla-barra', 'peso-muerto-convencional']);

export type ExerciseLoadConvention = {
  isDumbbell: boolean;
  heading: string;
  hint: string;
  inputSuffix: string;
  effectiveMultiplier: number;
};

/** The editor and XP use this same declaration instead of separate exercise lists. */
export function exerciseLoadConvention(exercise: Pick<WorkoutExercise, 'exerciseId' | 'mode' | 'loadConvention'>, profile?: AthleteProfile): ExerciseLoadConvention {
  if (exercise.mode === 'bodyweight_reps') return { isDumbbell: false, heading: 'Peso corporal', hint: 'La carga externa es cero; la XP usa tus repeticiones y tu progreso.', inputSuffix: 'kg', effectiveMultiplier: 0 };
  const execution = Object.hasOwn(CATALOG_LOAD_CONVENTIONS, exercise.exerciseId) ? CATALOG_LOAD_CONVENTIONS[exercise.exerciseId] : undefined;
  const convention = resolvedLoadConvention(exercise, profile);
  if (convention === 'total' && !execution) return { isDumbbell: false, heading: 'Carga total registrada', hint: 'Introduce la carga externa total. El volumen suma esa carga × repeticiones.', inputSuffix: 'kg', effectiveMultiplier: 1 };
  if (convention === 'total') {
    return { isDumbbell: true, heading: 'Suma de las dos mancuernas · perfil antiguo', inputSuffix: 'kg en total', effectiveMultiplier: 1,
      hint: 'Este registro conserva la carga total: si cada mancuerna pesa 20 kg, anota 40 kg. La XP y el volumen utilizan ese total una sola vez.' };
  }
  if (convention === 'per_unit_bilateral') {
    return { isDumbbell: true, heading: 'Kg por mancuerna', inputSuffix: 'kg por mancuerna', effectiveMultiplier: 2,
      hint: 'Anota el peso de una sola mancuerna. Si llevas 20 kg en cada brazo, escribe 20 kg. La XP y el volumen tienen en cuenta las dos mancuernas: 40 kg de carga total.' };
  }
  if (convention === 'per_unit_alternating') {
    return { isDumbbell: true, heading: 'Kg por mancuerna', inputSuffix: 'kg por mancuerna', effectiveMultiplier: 1,
      hint: 'Anota el peso de una sola mancuerna y el total de repeticiones alternas. Si usas 20 kg en cada brazo, escribe 20 kg; la XP y el volumen consideran la carga de cada movimiento sin sumarla dos veces.' };
  }
  return { isDumbbell: true, heading: 'Kg de la mancuerna', inputSuffix: 'kg por mancuerna', effectiveMultiplier: 1,
    hint: exercise.exerciseId === 'extension-cabeza-mancuerna'
      ? 'Anota lo que pesa la única mancuerna: si sostienes una de 20 kg con ambas manos, escribe 20 kg. La XP cuenta esa carga una sola vez.'
      : 'Anota el peso de la mancuerna que levanta cada brazo. Si usas una de 20 kg, escribe 20 kg. La XP cuenta esa carga una sola vez.' };
}

export function effectiveLoad(exercise: Pick<WorkoutExercise, 'exerciseId' | 'mode' | 'loadConvention'>, weight: number, profile?: AthleteProfile): number {
  const multiplier = exerciseLoadConvention(exercise, profile).effectiveMultiplier;
  return multiplier === 0 ? 0 : weight * multiplier;
}

/** Informational Brzycki estimate. No extrapolation beyond ten reps, no machine/custom equivalence. */
export function estimatedOneRepMax(exercise: Pick<WorkoutExercise, 'exerciseId' | 'mode' | 'loadConvention'>, set: WorkoutSet): number | null {
  if (!isWorkSet(set) || exercise.mode !== 'external_load_reps' || !ESTIMATED_MAX_EXERCISES.has(exercise.exerciseId) || !validSet(set, exercise.mode) || set.weight! <= 0 || set.reps! > 10) return null;
  return Math.round(set.weight! * 36 / (37 - set.reps!) * 10) / 10;
}

export function strengthReference(exercise: Pick<WorkoutExercise, 'exerciseId' | 'mode' | 'loadConvention'>, set: WorkoutSet, profile?: AthleteProfile) {
  const current = normalizeProfile(profile);
  const target = GAME_REFERENCES[exercise.exerciseId];
  const effectiveWeightKg = effectiveLoad(exercise, set.weight ?? 0, current);
  const referenceKg = exercise.mode === 'external_load_reps' && target ? current.weightKg * target.ratio : null;
  return {
    referenceKg,
    estimatedOneRepMax: estimatedOneRepMax(exercise, set),
    effectiveWeightKg,
    relativeLoad: exercise.mode === 'bodyweight_reps' ? 0 : effectiveWeightKg / (referenceKg ?? current.weightKg),
    label: target ? `Referencia del juego · ${target.name}` : exercise.mode === 'bodyweight_reps' ? 'Peso corporal · progreso por repeticiones' : 'Carga relativa a tu peso · sin norma poblacional',
    comparison: 'Objetivos orientativos del juego, no percentiles ni medias de personas de tu edad. Tu progreso se compara con tus sesiones anteriores.',
  };
}
