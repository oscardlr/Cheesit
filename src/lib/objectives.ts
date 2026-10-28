import { addDays, isCivilDate, todayMadrid, weekStart } from './dates';
import { validSet, type Workout } from './model';

export type MissionReward = { id: string; xp: number; target: number; awardedAt: string };
export type Mission = { id: string; title: string; description: string; current: number; target: number; complete: boolean; unit: string; xp: number; scope: 'weekly' | 'career'; rewarded: boolean };
type MissionState = { weeklyWorkoutGoal: number; missionRewards?: MissionReward[] };
type Stats = { days: number; sessions: number; sets: number; reps: number; exercises: number; groups: number; byGroup: Map<string, number> };
type Metric = Exclude<keyof Stats, 'byGroup'> | `group:${string}`;
type Definition = { key: string; title: string; description: string; target: number; unit: string; xp: number; metric: Metric; scope: 'weekly' | 'career'; personal?: boolean };

const groups = ['Pecho', 'Espalda', 'Pierna y glúteo', 'Hombro', 'Bíceps', 'Tríceps', 'Abdominales'];
const weekly: Definition[] = [
  { key: 'sessions', title: 'Vuelve a por más', description: 'Cumple tus días de entrenamiento de esta semana.', target: 3, unit: 'días', xp: 200, metric: 'days', scope: 'weekly', personal: true },
  { key: 'sets', title: 'Repetir es construir', description: 'Completa 30 series válidas esta semana.', target: 30, unit: 'series', xp: 150, metric: 'sets', scope: 'weekly' },
  { key: 'variety', title: 'Fuerza equilibrada', description: 'Trabaja cuatro grupos musculares esta semana.', target: 4, unit: 'grupos', xp: 150, metric: 'groups', scope: 'weekly' },
  { key: 'week-sets-10', title: 'Diez con intención', description: 'Completa tus primeras diez series de la semana.', target: 10, unit: 'series', xp: 60, metric: 'sets', scope: 'weekly' },
  { key: 'week-sets-50', title: 'Semana de hierro', description: 'Acumula 50 series válidas esta semana.', target: 50, unit: 'series', xp: 220, metric: 'sets', scope: 'weekly' },
  { key: 'week-reps-100', title: 'Cien razones para volver', description: 'Suma cien repeticiones confirmadas esta semana.', target: 100, unit: 'reps', xp: 80, metric: 'reps', scope: 'weekly' },
  { key: 'week-reps-300', title: 'El ritmo se construye', description: 'Suma 300 repeticiones confirmadas esta semana.', target: 300, unit: 'reps', xp: 160, metric: 'reps', scope: 'weekly' },
  { key: 'week-exercises-5', title: 'Explora tu fuerza', description: 'Completa series de cinco ejercicios distintos esta semana.', target: 5, unit: 'ejercicios', xp: 120, metric: 'exercises', scope: 'weekly' },
  { key: 'week-days-2', title: 'Una segunda cita con el hierro', description: 'Entrena en dos días distintos de esta semana.', target: 2, unit: 'días', xp: 100, metric: 'days', scope: 'weekly' },
  { key: 'week-days-4', title: 'Constancia de cuatro días', description: 'Entrena en cuatro días distintos de esta semana.', target: 4, unit: 'días', xp: 200, metric: 'days', scope: 'weekly' },
  ...groups.map((group, index): Definition => ({ key: `week-group-${index}`, title: `Esta semana: ${group.toLocaleLowerCase('es-ES')}`, description: `Completa tres series de ${group.toLocaleLowerCase('es-ES')} esta semana.`, target: 3, unit: 'series', xp: 60, metric: `group:${group}`, scope: 'weekly' })),
];
const tiers = (metric: Metric, name: string, unit: string, thresholds: number[], rewards: number[]): Definition[] => thresholds.map((target, index) => ({
  key: `career-${metric}-${target}`, title: `${name} · ${target}`, description: `Acumula ${target} ${unit} en tus entrenamientos completados.`, target, unit, xp: rewards[index], metric, scope: 'career',
}));
const career: Definition[] = [
  ...tiers('sessions', 'Tu historia en el hierro', 'entrenamientos', [1, 5, 10, 25, 50, 100], [100, 200, 300, 500, 800, 1200]),
  ...tiers('sets', 'Una serie más', 'series', [10, 50, 100, 250, 500], [80, 150, 250, 450, 700]),
  ...tiers('reps', 'Repeticiones que cuentan', 'repeticiones', [100, 500, 1000, 5000], [80, 180, 300, 750]),
  ...tiers('groups', 'Construye todo tu cuerpo', 'grupos musculares', [1, 3, 7], [50, 150, 350]),
  ...tiers('exercises', 'Tu repertorio crece', 'ejercicios distintos', [5, 10, 20], [150, 250, 450]),
  ...groups.flatMap((group, index) => [10, 25].map((target): Definition => ({ key: `career-group-${index}-${target}`, title: `${group} · ${target} series`, description: `Acumula ${target} series de ${group.toLocaleLowerCase('es-ES')} en tu historial.`, target, unit: 'series', xp: target === 10 ? 120 : 220, metric: `group:${group}`, scope: 'career' }))),
];
const definitions = [...weekly, ...career];
const byKey = new Map(definitions.map(definition => [definition.key, definition]));

function stats(history: Workout[], start: string, end: string): Stats {
  const workouts = new Set<string>(), sets = new Set<string>(), days = new Set<string>(), exercises = new Set<string>(), byGroup = new Map<string, number>();
  let reps = 0;
  for (const workout of history) {
    if (workout.status !== 'finished' || !isCivilDate(workout.date) || workout.date < start || workout.date > end || workouts.has(workout.id)) continue;
    let useful = false;
    for (const exercise of workout.exercises) for (const set of exercise.sets) {
      if (!set.confirmed || !validSet(set, exercise.mode) || sets.has(set.id)) continue;
      useful = true; sets.add(set.id); reps += set.reps!; exercises.add(exercise.exerciseId);
      byGroup.set(exercise.group, (byGroup.get(exercise.group) ?? 0) + 1);
    }
    if (useful) { workouts.add(workout.id); days.add(workout.date); }
  }
  return { days: days.size, sessions: workouts.size, sets: sets.size, reps, exercises: exercises.size, groups: byGroup.size, byGroup };
}

/** A weekly ID includes its Madrid Monday; career milestones have a fixed ID. */
export function getObjectiveMissions(history: Workout[], day: string, game: MissionState): Mission[] {
  const start = weekStart(day), thisWeek = stats(history, start, day), lifetime = stats(history, '1000-01-01', day);
  const earned = new Map((game.missionRewards ?? []).map(reward => [reward.id, reward]));
  return definitions.map(definition => {
    const id = definition.scope === 'weekly' ? `${definition.key}:${start}` : definition.key;
    const reward = earned.get(id), target = reward?.target ?? (definition.personal ? game.weeklyWorkoutGoal : definition.target);
    const source = definition.scope === 'weekly' ? thisWeek : lifetime;
    const current = definition.metric.startsWith('group:') ? source.byGroup.get(definition.metric.slice(6)) ?? 0 : source[definition.metric as Exclude<keyof Stats, 'byGroup'>];
    return { id, title: definition.title, description: definition.description, current: reward ? Math.max(target, current) : current, target, unit: definition.unit, xp: definition.xp, scope: definition.scope, complete: Boolean(reward) || current >= target, rewarded: Boolean(reward) };
  });
}

export function validMissionRewards(value: unknown): value is MissionReward[] {
  if (!Array.isArray(value) || value.length > 100000) return false;
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
    const reward = raw as Record<string, unknown>;
    if (typeof reward.id !== 'string' || seen.has(reward.id) || typeof reward.awardedAt !== 'string' || !Number.isFinite(Date.parse(reward.awardedAt))) return false;
    const separator = reward.id.lastIndexOf(':'), key = separator < 0 ? reward.id : reward.id.slice(0, separator), week = separator < 0 ? null : reward.id.slice(separator + 1);
    const definition = byKey.get(key);
    if (!definition || reward.xp !== definition.xp || !Number.isInteger(reward.target)) return false;
    if (definition.personal ? (reward.target as number) < 1 || (reward.target as number) > 7 : reward.target !== definition.target) return false;
    if (definition.scope === 'weekly' ? !week || !isCivilDate(week) || weekStart(week) !== week || todayMadrid(new Date(reward.awardedAt)) < week : week !== null) return false;
    seen.add(reward.id);
  }
  return true;
}

export const missionRewardXp = (game: Pick<MissionState, 'missionRewards'>): number => validMissionRewards(game.missionRewards ?? []) ? (game.missionRewards ?? []).reduce((total, reward) => total + reward.xp, 0) : 0;

/** Freeze each completed reward once; edits, reloads and changing targets cannot replay it. */
export function awardObjectiveMissions<T extends MissionState>(game: T, history: Workout[], day = todayMadrid(), changedDate?: string): T {
  const weeks = new Set([weekStart(day)]);
  if (changedDate && isCivilDate(changedDate) && changedDate <= day) weeks.add(weekStart(changedDate));
  const earned = new Set((game.missionRewards ?? []).map(reward => reward.id));
  const additions: MissionReward[] = [];
  for (const week of weeks) {
    const end = [addDays(week, 6), day].sort()[0];
    for (const mission of getObjectiveMissions(history, end, game)) {
      if (!mission.complete || earned.has(mission.id)) continue;
      earned.add(mission.id);
      additions.push({ id: mission.id, xp: mission.xp, target: mission.target, awardedAt: new Date().toISOString() });
    }
  }
  return additions.length ? { ...game, missionRewards: [...(game.missionRewards ?? []), ...additions] } : game;
}
