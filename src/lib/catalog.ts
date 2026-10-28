import type { Exercise, ExerciseMode } from './model';

// Stable identifiers distinguish variants even when a user renames a custom exercise.
const entries: [string, string, string, ExerciseMode?][] = [
  ['press-banca-barra', 'Press de banca con barra', 'Pecho'],
  ['press-inclinado-mancuernas', 'Press inclinado con mancuernas', 'Pecho'],
  ['aperturas-mancuernas', 'Aperturas con mancuernas', 'Pecho'],
  ['aperturas-polea', 'Aperturas en polea', 'Pecho'],
  ['flexiones', 'Flexiones', 'Pecho', 'bodyweight_reps'],
  ['jalon-pecho', 'Jalón al pecho', 'Espalda'],
  ['remo-barra', 'Remo con barra', 'Espalda'],
  ['remo-polea-baja', 'Remo en polea baja', 'Espalda'],
  ['remo-mancuerna', 'Remo con mancuerna', 'Espalda'],
  ['dominadas', 'Dominadas', 'Espalda', 'bodyweight_reps'],
  ['sentadilla-barra', 'Sentadilla con barra', 'Pierna y glúteo'],
  ['prensa-piernas', 'Prensa de piernas', 'Pierna y glúteo'],
  ['peso-muerto-convencional', 'Peso muerto convencional', 'Pierna y glúteo'],
  ['peso-muerto-rumano', 'Peso muerto rumano', 'Pierna y glúteo'],
  ['hip-thrust', 'Hip thrust', 'Pierna y glúteo'],
  ['extension-cuadriceps', 'Extensión de cuádriceps', 'Pierna y glúteo'],
  ['curl-femoral', 'Curl femoral', 'Pierna y glúteo'],
  ['elevacion-gemelos', 'Elevación de gemelos', 'Pierna y glúteo'],
  ['zancadas-mancuernas', 'Zancadas con mancuernas', 'Pierna y glúteo'],
  ['press-militar', 'Press militar', 'Hombro'],
  ['press-hombros-mancuernas', 'Press de hombros con mancuernas', 'Hombro'],
  ['elevaciones-laterales', 'Elevaciones laterales', 'Hombro'],
  ['elevaciones-frontales', 'Elevaciones frontales', 'Hombro'],
  ['pajaros-mancuernas', 'Pájaros con mancuernas', 'Hombro'],
  ['curl-barra', 'Curl con barra', 'Bíceps'],
  ['curl-alterno-mancuernas', 'Curl alterno con mancuernas', 'Bíceps'],
  ['curl-martillo', 'Curl martillo', 'Bíceps'],
  ['curl-polea', 'Curl en polea', 'Bíceps'],
  ['extension-triceps-polea', 'Extensión de tríceps en polea', 'Tríceps'],
  ['extension-cabeza-mancuerna', 'Extensión por encima de la cabeza con mancuerna', 'Tríceps'],
  ['press-frances', 'Press francés', 'Tríceps'],
  ['crunch-abdominal', 'Crunch abdominal', 'Abdominales', 'bodyweight_reps'],
  ['elevacion-piernas', 'Elevación de piernas', 'Abdominales', 'bodyweight_reps'],
  ['crunch-polea', 'Crunch en polea', 'Abdominales'],
];
export const CATALOG: Exercise[] = entries.map(([id, name, group, mode]) => ({ id, name, group, mode: mode ?? 'external_load_reps' }));
export const GROUPS = [...new Set(CATALOG.map((exercise) => exercise.group))];
export function normalizeSearch(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' '); }
