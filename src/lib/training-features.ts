import { addDays, isCivilDate, todayMadrid, weekStart } from './dates';
import { gameProgress, normalizeGame, unlockedGear } from './game';
import { comparableSets, totals, workoutExerciseSessions } from './metrics';
import { isWorkSet, validSet, type AppData, type Workout, type WorkoutExercise, type WorkoutSet } from './model';
import { effectiveLoad } from './strength';
import { CHARACTER_ART, CHARACTER_ATLAS, CHARACTER_MASTER, CHARACTER_SLOT_ORDER } from './character-art';
import { CHEESIT_ART } from './cheesit-art';
import { validExerciseGoals, type ExerciseGoal } from './exercise-goals';

export type Appearance = { base: string; atlas: string; atlasWidth: number; atlasHeight: number; layers: { id: string; order: number; source: number[]; target: number[]; replacesHand?: boolean; foregroundMask?: string }[]; companion?: string; level: number };
export type Moment = { id: string; kind: 'first-session' | 'weekly-goal' | 'record' | 'level'; date: string; title: string; description: string; workoutIds: string[]; appearance: Appearance | null };
export type RoutineCycle = { id: string; name: string; routineIds: string[]; position: number; completedWorkoutIds: string[] };
export type WeeklyGoal = { week: string; days: number; sets: number; observedOn: string };
export type TrainingFeatures = { moments: Moment[]; cycles: RoutineCycle[]; weeklyGoals: WeeklyGoal[]; exerciseGoals?: ExerciseGoal[] };
export const trainingFeatures = (data: AppData): TrainingFeatures => data.training ?? { moments: [], cycles: [], weeklyGoals: [] };
export const hasWorkSets = (w: Workout) => w.exercises.some(e => e.sets.some(s => isWorkSet(s) && s.confirmed && validSet(s, e.mode)));
const chronological = (a: Workout, b: Workout) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
export function snapshotAppearance(data: AppData): Appearance {
  const game = normalizeGame(data.game), available = unlockedGear(game);
  const chosen = game.cosmeticGear !== undefined ? Object.values(game.cosmeticGear) : Object.values(game.equippedGear ?? {}).map(id => game.inventory.find(item => item.id === id)?.gearId);
  const layers = available.filter(gear => chosen.includes(gear.id) && CHARACTER_ART[gear.id]).sort((a, b) => CHARACTER_SLOT_ORDER[a.slot] - CHARACTER_SLOT_ORDER[b.slot]).map(gear => ({ id: gear.id, order: CHARACTER_SLOT_ORDER[gear.slot], ...structuredClone(CHARACTER_ART[gear.id]), source: [...CHARACTER_ART[gear.id].source], target: [...CHARACTER_ART[gear.id].target] }));
  return { base: CHARACTER_MASTER.src, atlas: CHARACTER_ATLAS.src, atlasWidth: CHARACTER_ATLAS.width, atlasHeight: CHARACTER_ATLAS.height, layers, ...(game.equippedCompanionId && CHEESIT_ART[game.equippedCompanionId] ? { companion: CHEESIT_ART[game.equippedCompanionId].src } : {}), level: gameProgress(game, data.workouts, data.profile).level };
}
/** Group membership lives on exercise blocks, surviving reorders and independent set counts. */
export function supersetLabel(exercises: { id: string; supersetId?: string }[], id: string): string | null {
  const item = exercises.find(e => e.id === id);
  const members = item?.supersetId ? exercises.filter(e => e.supersetId === item.supersetId) : [];
  if (members.length < 2) return null;
  const groups = [...new Set(exercises.filter(e => e.supersetId && exercises.filter(x => x.supersetId === e.supersetId).length > 1).map(e => e.supersetId))];
  return `${String.fromCharCode(65 + groups.indexOf(item!.supersetId))}${members.findIndex(e => e.id === id) + 1}`;
}
export function groupWith<T extends { id: string; supersetId?: string }>(items: T[], id: string, target: string): T[] {
  const source = items.find(e => e.id === id), destination = items.find(e => e.id === target);
  if (!source || !destination || id === target) return items;
  const group = destination.supersetId ?? destination.id;
  return items.map(e => e.id === id || e.id === target || (source.supersetId && e.supersetId === source.supersetId) ? { ...e, supersetId: group } : e);
}
export function ungroup<T extends { id: string; supersetId?: string }>(items: T[], id: string): T[] {
  const group = items.find(e => e.id === id)?.supersetId;
  return items.map(e => group && e.supersetId === group ? { ...e, supersetId: undefined } : e);
}
/** Rest only once every existing row in this round is confirmed. Missing rows are not a blocker. */
export function completesRound(workout: Workout, exercise: WorkoutExercise, set: WorkoutSet): boolean {
  const members = workout.exercises.filter(e => exercise.supersetId && e.supersetId === exercise.supersetId);
  if (members.length < 2) return true;
  const index = exercise.sets.findIndex(s => s.id === set.id);
  return index >= 0 && members.every(e => !e.sets[index] || e.sets[index].id === set.id || e.sets[index].confirmed);
}
export function nextCycleRoutine(data: AppData, cycle: RoutineCycle) {
  for (let i = 0; i < cycle.routineIds.length; i++) {
    const position = (cycle.position + i) % cycle.routineIds.length;
    const routine = data.routines.find(r => r.id === cycle.routineIds[position] && r.exercises.length > 0);
    if (routine) return { routine, position };
  }
  return null;
}
export function advanceCycle(data: AppData, workout: Workout): AppData {
  const link = workout.cycleLink, features = trainingFeatures(data);
  if (workout.status !== 'finished' || !link) return data;
  const cycles = features.cycles.map(cycle => {
    if (cycle.id !== link.cycleId || cycle.completedWorkoutIds.includes(workout.id)) return cycle;
    // Finishing an old linked draft must not undo a manual skip or a newer completion.
    const next = nextCycleRoutine(data, cycle);
    const matchesRecordedStep = cycle.position === link.position && cycle.routineIds[link.position] === link.routineId;
    const matchesAvailableStep = next?.position === link.position && next.routine.id === link.routineId;
    const position = matchesRecordedStep || matchesAvailableStep ? (link.position + 1) % Math.max(1, cycle.routineIds.length) : cycle.position;
    return { ...cycle, position, completedWorkoutIds: [...cycle.completedWorkoutIds, workout.id] };
  });
  return { ...data, training: { ...features, cycles } };
}
export function observeWeeklyGoal(data: AppData, day = todayMadrid()): AppData {
  const features = trainingFeatures(data), game = normalizeGame(data.game), week = weekStart(day);
  const goal: WeeklyGoal = { week, days: game.weeklyWorkoutGoal, sets: game.weeklySetGoal, observedOn: day };
  const previous = features.weeklyGoals.find(g => g.week === week);
  if (previous?.days === goal.days && previous?.sets === goal.sets) return data;
  return { ...data, training: { ...features, weeklyGoals: [...features.weeklyGoals.filter(g => g.week !== week), goal] } };
}
/** Historical recovery uses session dates and dated goal awards only; never reconstructs outfits or levels. */
export function recoverMoments(data: AppData): AppData {
  const features = trainingFeatures(data), moments = [...features.moments];
  const first = data.workouts.filter(w => w.status === 'finished' && hasWorkSets(w)).sort(chronological)[0];
  if (first && !moments.some(m => m.id === 'first-session')) moments.push({ id: 'first-session', kind: 'first-session', date: first.date, title: 'Tu primera sesión registrada', description: `${first.name}: aquí empieza el historial que conservas.`, workoutIds: [first.id], appearance: null });
  const reward = normalizeGame(data.game).missionRewards?.filter(r => r.id.startsWith('sessions:')).sort((a, b) => a.awardedAt.localeCompare(b.awardedAt))[0];
  if (reward && !moments.some(m => m.id === 'first-weekly-goal')) moments.push({ id: 'first-weekly-goal', kind: 'weekly-goal', date: todayMadrid(new Date(reward.awardedAt)), title: 'Tu primer objetivo semanal cumplido', description: `Recompensa registrada por ${reward.target} días de entrenamiento en la semana del ${reward.id.slice(9)}.`, workoutIds: [], appearance: null });
  return moments.length === features.moments.length ? data : { ...data, training: { ...features, moments } };
}
/** Called only on live confirmation/completion. No awards or economic writes occur here. */
export function captureMoments(before: AppData, after: AppData, workout?: Workout, now = new Date()): AppData {
  const features = trainingFeatures(after), moments = [...features.moments], appearance = snapshotAppearance(after);
  const add = (moment: Omit<Moment, 'appearance'>) => { if (!moments.some(m => m.id === moment.id)) moments.push({ ...moment, appearance }); };
  if (workout?.status === 'finished') {
    const earlier = before.workouts.some(w => w.status === 'finished' && hasWorkSets(w));
    if (!earlier && hasWorkSets(workout)) add({ id: 'first-session', kind: 'first-session', date: workout.date, title: 'Tu primera sesión registrada', description: `Has completado ${workout.name}. Tu historia ya tiene un comienzo.`, workoutIds: [workout.id] });
    for (const ex of workout.exercises) if (ex.sets.some(set => isWorkSet(set) && set.confirmed && explainedRecord(ex, set, after.workouts, workout))) add({ id: `record:${workout.id}:${ex.exerciseId}`, kind: 'record', date: workout.date, title: `Récord personal · ${ex.name}`, description: 'Superaste una marca anterior con la misma carga o las mismas repeticiones. Consulta las series de esta sesión.', workoutIds: [workout.id] });
    const oldRewards = new Set(before.game?.missionRewards?.map(r => r.id));
    const goal = after.game?.missionRewards?.find(r => r.id.startsWith('sessions:') && !oldRewards.has(r.id));
    if (goal) add({ id: 'first-weekly-goal', kind: 'weekly-goal', date: todayMadrid(new Date(goal.awardedAt)), title: 'Tu primer objetivo semanal cumplido', description: `Objetivo acreditado: ${goal.target} días de entrenamiento.`, workoutIds: [workout.id] });
  }
  const oldLevel = gameProgress(normalizeGame(before.game), before.workouts, before.profile).level;
  const newLevel = gameProgress(normalizeGame(after.game), after.workouts, after.profile).level;
  for (let level = oldLevel + 1; level <= newLevel; level++) add({ id: `level:${todayMadrid(now).slice(0, 4)}:${level}`, kind: 'level', date: todayMadrid(now), title: `Has llegado al nivel ${level}`, description: 'Tu actividad registrada ha hecho subir de nivel a tu personaje.', workoutIds: workout ? [workout.id] : [] });
  return { ...after, training: { ...features, moments } };
}
/** PR explanation uses physical load and every earlier compatible work session. No reward recalculation. */
function explainedRecord(exercise: WorkoutExercise, set: WorkoutSet, history: Workout[], current: Workout): boolean {
  if (!isWorkSet(set) || !set.confirmed || !validSet(set, exercise.mode)) return false;
  const load = Math.round(effectiveLoad(exercise, set.weight!) * 100);
  const previous = workoutExerciseSessions(history, exercise.exerciseId, exercise.mode).filter(s => s.w.id !== current.id && chronological(s.w, current) < 0);
  const sameReps = previous.flatMap(s => s.e.sets.filter(old => old.reps === set.reps).map(old => Math.round(effectiveLoad(s.e, old.weight!) * 100)));
  const sameLoad = previous.flatMap(s => s.e.sets.filter(old => Math.round(effectiveLoad(s.e, old.weight!) * 100) === load).map(old => old.reps!));
  return (sameReps.length > 0 && load > Math.max(...sameReps)) || (sameLoad.length > 0 && set.reps! > Math.max(...sameLoad));
}
export function consistencyInsight(data: AppData, anchor: string): ProgressInsight | null {
  const game = normalizeGame(data.game), features = trainingFeatures(data), ids: string[] = [], dates: string[] = [];
  let start = weekStart(anchor), count = 0, skippedCurrent = false;
  for (let i = 0; i < 105; i++) {
    const week = addDays(start, -7 * i), goal = game.missionRewards?.find(r => r.id === `sessions:${week}`)?.target ?? features.weeklyGoals.find(g => g.week === week)?.days;
    const sessions = data.workouts.filter(w => w.status === 'finished' && hasWorkSets(w) && w.date >= week && w.date <= addDays(week, 6)).sort(chronological);
    if (!goal || new Set(sessions.map(w => w.date)).size < goal) { if (i === 0 && !skippedCurrent) { skippedCurrent = true; start = addDays(start, -7); i = -1; continue; } break; }
    count++; if (count <= 4 && sessions.length) { ids.push(sessions.at(-1)!.id); dates.push(sessions.at(-1)!.date); }
  }
  return count >= 2 ? { kind: 'consistency', text: `${count} semanas seguidas cumpliendo tu objetivo de días registrado, del ${addDays(start, -7 * (count - 1))} al ${addDays(start, 6)}. Es constancia registrada, independiente de tus récords de carga.`, workoutIds: ids, dates } : null;
}

export type ProgressInsight = { kind: 'improvement' | 'record' | 'consistency'; text: string; workoutIds: string[]; dates: string[] };
export function progressInsights(history: Workout[], workoutId?: string, exerciseId?: string): ProgressInsight[] {
  const current = history.filter(w => w.status === 'finished' && (!workoutId || w.id === workoutId)).sort(chronological).at(-1);
  if (!current) return [];
  const insights: ProgressInsight[] = [];
  for (const id of new Set(current.exercises.filter(e => !exerciseId || e.exerciseId === exerciseId).map(e => e.exerciseId))) {
    const sessions = workoutExerciseSessions(history, id).filter(({ w, e }) => e.sets.length && chronological(w, current) <= 0);
    for (const latest of sessions.filter(s => s.w.id === current.id)) {
      const previous = sessions.find(s => s.w.id !== current.id && s.e.mode === latest.e.mode && chronological(s.w, current) < 0);
      if (!previous) continue;
      const comparison = comparableSets(previous.e, latest.e);
      const reps = comparison.repetitions.filter(c => c.change > 0).sort((a, b) => b.change - a.change)[0];
      const load = comparison.loads.filter(c => c.change > 0).sort((a, b) => b.change - a.change)[0];
      const condition = latest.e.mode === 'bodyweight_reps' ? 'con peso corporal' : `con ${reps?.weight.toLocaleString('es-ES')} kg externos totales`;
      const text = reps ? `${latest.e.name}: ${reps.change} ${reps.change === 1 ? 'repetición más' : 'repeticiones más'} ${condition} en tu mejor serie comparable (${reps.previous} → ${reps.current}).` : load ? `${latest.e.name}: aumentaste la carga externa total ${load.change.toLocaleString('es-ES')} kg para ${load.reps} repeticiones (${load.previous} → ${load.current} kg).` : null;
      if (text) insights.push({ kind: 'improvement', text, workoutIds: [previous.w.id, current.id], dates: [previous.w.date, current.date] });
      const records = latest.e.sets.filter(set => explainedRecord(latest.e, set, history, current));
      if (records.length && text) insights.push({ kind: 'record', text: `${latest.e.name}: también es un récord personal frente a tus sesiones anteriores con condiciones equivalentes.`, workoutIds: [current.id], dates: [current.date] });
    }
  }
  return insights;
}
export function weeklySummary(data: AppData, anchor: string, today = todayMadrid()) {
  const start = weekStart(anchor), end = addDays(start, 6), current = weekStart(today) === start;
  const sessions = data.workouts.filter(w => w.status === 'finished' && w.date >= start && w.date <= end && w.date <= today).sort(chronological);
  const working = sessions.filter(hasWorkSets), stats = totals(sessions, data.profile);
  const days = new Set(working.map(w => w.date)).size;
  const warmups = sessions.flatMap(w => w.exercises.flatMap(e => e.sets.filter(s => !isWorkSet(s) && s.confirmed && validSet(s, e.mode)))).length;
  const game = normalizeGame(data.game), reward = game.missionRewards?.find(r => r.id === `sessions:${start}`);
  const savedGoal = trainingFeatures(data).weeklyGoals.find(g => g.week === start);
  const goal = reward?.target ?? savedGoal?.days ?? (current ? game.weeklyWorkoutGoal : null);
  const setGoal = savedGoal?.sets ?? (current ? game.weeklySetGoal : null);
  const insights = working.flatMap(w => progressInsights(data.workouts, w.id)).filter(i => i.kind === 'improvement');
  // Mission awards carry an exact weekly ID. Training XP is derived and cannot safely be attributed historically.
  const rewards = game.missionRewards?.filter(r => r.id.endsWith(`:${start}`)).reduce((sum, r) => sum + r.xp, 0) ?? 0;
  const previous = data.workouts.some(w => w.status === 'finished' && w.date >= addDays(start, -7) && w.date < start && hasWorkSets(w));
  let streak = 0;
  for (let i = 0; i < 104; i++) {
    const week = addDays(start, -7 * i), award = game.missionRewards?.find(r => r.id === `sessions:${week}`), observed = trainingFeatures(data).weeklyGoals.find(g => g.week === week);
    const target = award?.target ?? observed?.days;
    const count = new Set(data.workouts.filter(w => w.status === 'finished' && w.date >= week && w.date <= addDays(week, 6) && hasWorkSets(w)).map(w => w.date)).size;
    if (!target || count < target) break;
    streak++;
  }
  const text = !sessions.length ? 'Esta semana no tiene sesiones registradas. Cada semana puede empezar a tu ritmo.' : `${days} ${days === 1 ? 'día de entrenamiento' : 'días de entrenamiento'}, ${sessions.length} ${sessions.length === 1 ? 'sesión' : 'sesiones'} y ${stats.sets} series de trabajo.${insights.length ? ` ${insights.length} ${insights.length === 1 ? 'mejora entre sesiones' : 'mejoras entre sesiones'} con condiciones comparables.` : ' Aún no hay mejoras comparables para destacar.'}`;
  return { start, end, current, sessions, days, stats, warmups, goal, setGoal, insights, rewards, previous, streak, text };
}

/** Strict optional feature metadata validation used for account documents and JSON backups. */
export function validTrainingFeatures(value: unknown): value is TrainingFeatures {
  if (!value || typeof value !== 'object') return false;
  const f = value as TrainingFeatures;
  const text = (v: unknown, max = 2000): v is string => typeof v === 'string' && v.length <= max;
  const list = (v: unknown, max: number): v is unknown[] => Array.isArray(v) && v.length <= max;
  const unique = (values: { id: string }[]) => new Set(values.map(v => v.id)).size === values.length;
  const asset = (v: unknown) => text(v, 300) && /^\/assets\/[a-zA-Z0-9_./-]+$/.test(v) && !v.includes('..');
  if (!list(f.moments, 50000) || !list(f.cycles, 100) || !list(f.weeklyGoals, 10000)) return false;
  if (f.exerciseGoals !== undefined && !validExerciseGoals(f.exerciseGoals)) return false;
  if (!f.moments.every(m => m && text(m.id, 300) && ['first-session', 'weekly-goal', 'record', 'level'].includes(m.kind) && isCivilDate(m.date) && text(m.title, 200) && text(m.description) && list(m.workoutIds, 100) && m.workoutIds.every(id => text(id, 100)) && (m.appearance === null || (m.appearance && asset(m.appearance.base) && asset(m.appearance.atlas) && Number.isFinite(m.appearance.atlasWidth) && Number.isFinite(m.appearance.atlasHeight) && m.appearance.atlasWidth > 0 && m.appearance.atlasWidth <= 20000 && m.appearance.atlasHeight > 0 && m.appearance.atlasHeight <= 20000 && (m.appearance.companion === undefined || asset(m.appearance.companion)) && Number.isInteger(m.appearance.level) && m.appearance.level >= 1 && m.appearance.level <= 99 && list(m.appearance.layers, 5) && m.appearance.layers.every(l => l && text(l.id, 100) && Number.isInteger(l.order) && l.order >= 0 && l.order <= 10 && list(l.source, 4) && l.source.length === 4 && list(l.target, 4) && l.target.length === 4 && [...l.source, ...l.target].every(n => Number.isFinite(n) && n >= -10000 && n <= 10000) && (l.replacesHand === undefined || typeof l.replacesHand === 'boolean') && (l.foregroundMask === undefined || text(l.foregroundMask, 3000))))))) return false;
  return unique(f.moments) && f.cycles.every(c => c && text(c.id, 100) && text(c.name, 80) && !!c.name.trim() && list(c.routineIds, 100) && c.routineIds.every(id => text(id, 100)) && Number.isInteger(c.position) && c.position >= 0 && (c.routineIds.length === 0 ? c.position === 0 : c.position < c.routineIds.length) && list(c.completedWorkoutIds, 50000) && c.completedWorkoutIds.every(id => text(id, 100))) && unique(f.cycles) && f.weeklyGoals.every(g => g && isCivilDate(g.week) && weekStart(g.week) === g.week && isCivilDate(g.observedOn) && weekStart(g.observedOn) === g.week && Number.isInteger(g.days) && g.days >= 1 && g.days <= 7 && Number.isInteger(g.sets) && g.sets >= 1 && g.sets <= 200) && new Set(f.weeklyGoals.map(g => g.week)).size === f.weeklyGoals.length;
}

/** Immutable album snapshots and completion receipts survive stale devices and chosen conflict branches. */
export function preserveTrainingHistory(selected: AppData, authoritative: AppData): AppData {
  if (!selected.training && !authoritative.training) return selected;
  if (!selected.training && authoritative.training) return { ...selected, training: structuredClone(authoritative.training) };
  const chosen = trainingFeatures(selected), prior = trainingFeatures(authoritative);
  const moments = new Map(prior.moments.map(m => [m.id, m]));
  for (const moment of chosen.moments) if (!moments.has(moment.id)) moments.set(moment.id, moment);
  return { ...selected, training: { ...chosen, moments: [...moments.values()], weeklyGoals: [...prior.weeklyGoals.filter(goal => !chosen.weeklyGoals.some(g => g.week === goal.week)), ...chosen.weeklyGoals], cycles: chosen.cycles.map(cycle => ({ ...cycle, completedWorkoutIds: [...new Set([...cycle.completedWorkoutIds, ...(prior.cycles.find(c => c.id === cycle.id)?.completedWorkoutIds ?? [])])] })) } };
}
