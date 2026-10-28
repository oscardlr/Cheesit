import { CATALOG, GROUPS } from './catalog';
import { isAthleteProfile } from './strength';
import { GEAR, type GearSlot } from './gear';
import { isCivilDate, todayMadrid } from './dates';
import { COLORS, WORKOUT_COLOR, newId, validName, type AppData, type Exercise, type Routine, type Workout } from './model';
import { getAbilityCharges, isGameState, normalizeGame, unlockedCompanions, unlockedGear, type GameState } from './game';
import { getAbilityDefinition, isAbilityUse } from './abilities';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const name = (value: unknown): value is string => typeof value === 'string' && validName(value);
const mode = (value: unknown) => value === 'external_load_reps' || value === 'bodyweight_reps';
const color = (value: unknown) => typeof value === 'string' && (COLORS as readonly string[]).includes(value);
const workoutColor = (value: unknown) => value === WORKOUT_COLOR || color(value);
const bounded = (value: unknown, max: number): value is unknown[] => Array.isArray(value) && value.length <= max;
const fail = (what: string): never => { throw new Error(`Copia no válida: ${what}. No se ha importado nada.`); };

export function createBackup(data: AppData) {
  return { format: 'entrenos-local', schema_version: 1, export_id: newId(), exported_at: new Date().toISOString(),
    origin: 'browser', units: 'kg', scope: 'local-device-only', data };
}

function validateData(value: unknown): AppData {
  if (!record(value) || !bounded(value.routines, 10000) || !bounded(value.workouts, 50000) || !bounded(value.customExercises, 10000)) return fail('estructura o cantidad de registros');
  const ids = new Set<string>();
  const add = (id: unknown) => { if (!uuid(id) || ids.has(id)) fail('identificador ausente, inválido o duplicado'); ids.add(id as string); };
  for (const exercise of value.customExercises) {
    if (!record(exercise) || !name(exercise.name) || !GROUPS.includes(exercise.group as string) || !mode(exercise.mode)) return fail('ejercicio personalizado');
    add(exercise.id);
  }
  const knownExercises = new Set([...CATALOG.map((exercise) => exercise.id), ...value.customExercises.map((exercise) => (exercise as Exercise).id)]);
  for (const routine of value.routines) {
    if (!record(routine) || !name(routine.name) || !color(routine.color) || typeof routine.archived !== 'boolean' || !bounded(routine.exercises, 50)) return fail('rutina');
    add(routine.id);
    for (const exercise of routine.exercises) {
      if (!record(exercise) || typeof exercise.exerciseId !== 'string' || !knownExercises.has(exercise.exerciseId) || !Number.isInteger(exercise.sets) || (exercise.sets as number) < 1 || (exercise.sets as number) > 20) return fail('ejercicio de rutina');
      add(exercise.id);
    }
  }
  for (const workout of value.workouts) {
    if (!record(workout) || !name(workout.name) || !workoutColor(workout.color) || typeof workout.date !== 'string' || !isCivilDate(workout.date) || workout.date > todayMadrid() || !['draft', 'finished', 'deleted'].includes(workout.status as string) || typeof workout.createdAt !== 'string' || !Number.isFinite(Date.parse(workout.createdAt)) || typeof workout.updatedAt !== 'string' || !Number.isFinite(Date.parse(workout.updatedAt)) || !bounded(workout.exercises, 50)) return fail('entrenamiento o fecha futura');
    add(workout.id);
    if(workout.abilityId!==undefined&&workout.abilityId!==null&&(typeof workout.abilityId!=='string'||!getAbilityDefinition(workout.abilityId)))return fail('habilidad de entrenamiento');
    if(workout.abilityReward!==undefined&&(!isAbilityUse(workout.abilityReward)||workout.abilityReward.workoutId!==workout.id||workout.abilityReward.abilityId!==workout.abilityId||workout.status==='draft'))return fail('recompensa de habilidad');
    let confirmed = 0;
    for (const exercise of workout.exercises) {
      if (!record(exercise) || typeof exercise.exerciseId !== 'string' || !exercise.exerciseId || !name(exercise.name) || !GROUPS.includes(exercise.group as string) || !mode(exercise.mode) || !bounded(exercise.sets, 50)) return fail('ejercicio de entrenamiento');
      add(exercise.id);
      for (const set of exercise.sets) {
        if (!record(set) || typeof set.confirmed !== 'boolean') return fail('serie');
        add(set.id);
        const weight = set.weight, reps = set.reps;
        if (!(weight === null || (typeof weight === 'number' && Number.isFinite(weight) && weight >= 0 && weight <= 1000 && Math.abs(weight * 100 - Math.round(weight * 100)) < 1e-8 && (exercise.mode !== 'bodyweight_reps' || weight === 0))) || !(reps === null || (typeof reps === 'number' && Number.isInteger(reps) && reps >= 1 && reps <= 1000)) || (set.confirmed && (weight === null || reps === null))) return fail('valores de serie');
        if (set.confirmed) confirmed++;
      }
    }
    if (workout.status === 'finished' && !confirmed) return fail('entrenamiento finalizado sin series confirmadas');
  }
  if (value.game !== undefined) {
    if (!isGameState(value.game)) return fail('economía, colección u objetivos');
    for (const item of value.game.inventory) add(item.id);
    for (const transaction of value.game.transactions) add(transaction.id);
  }
  for(const workout of value.workouts as Workout[]){
    if(workout.abilityReward&&(!value.game||!isGameState(value.game)||!(value.game.abilityUses??[]).some(use=>use.workoutId===workout.id&&canonical(use)===canonical(workout.abilityReward))))return fail('carga de habilidad sin movimiento correspondiente');
  }
  if (value.preferences !== undefined && (!record(value.preferences) || typeof value.preferences.effects !== 'boolean' || typeof value.preferences.sound !== 'boolean')) return fail('preferencias de efectos o sonido');
  if (value.profile !== undefined && !isAthleteProfile(value.profile)) return fail('perfil de entrenamiento');
  return { ...value, ...(value.game !== undefined ? { game: normalizeGame(value.game) } : {}) } as AppData;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

/** Only reconcile one ledger's direct continuation; independent spending branches conflict. */
function mergeGame(current: GameState | undefined, incoming: GameState | undefined, conflicts: string[]): GameState | undefined {
  if (!current) return incoming ? normalizeGame(incoming) : undefined;
  if (!incoming) return normalizeGame(current);
  current = normalizeGame(current);
  incoming = normalizeGame(incoming);
  const prefix = (older: GameState, newer: GameState) => {
    const inventory = new Map(newer.inventory.map(item => [item.id, item]));
    return older.transactions.every((transaction, index) => canonical(transaction) === canonical(newer.transactions[index])) && (older.abilityUses??[]).every((use,index)=>canonical(use)===canonical((newer.abilityUses??[])[index])) && older.inventory.every(item => {
      const candidate = inventory.get(item.id);
      return candidate && candidate.quoteId === item.quoteId && candidate.gearId === item.gearId && candidate.companionId===item.companionId && (candidate.kind??'quote') === (item.kind??'quote') && candidate.rarity === item.rarity && candidate.acquiredAt === item.acquiredAt && candidate.crateId === item.crateId;
    });
  };
  let merged: GameState;
  if (prefix(incoming, current)) merged = current;
  else if (prefix(current, incoming)) merged = incoming;
  else {
    conflicts.push('economía: las copias contienen compras, ventas o usos de habilidades independientes; se conserva el estado actual');
    return current;
  }
  const equipped = current.equippedQuoteId;
  const normalized=normalizeGame(current);
  const appearances=new Set(unlockedGear(merged).map(gear=>gear.id));
  const cosmeticGear=Object.fromEntries(Object.entries(normalized.cosmeticGear??{}).filter(([,gearId])=>appearances.has(gearId)));
  const companion=normalized.equippedCompanionId??null;
  const equippedCompanionId=unlockedCompanions(merged).some(value=>value.id===companion)?companion:null;
  const active=normalized.activeAbilityId??null;
  const activeAbilityId=active&&getAbilityCharges(merged,active)>0?active:null;
  const equippedGear=Object.fromEntries(Object.entries(current.equippedGear??{}).filter(([slot,itemId])=>merged.inventory.some(item=>!item.sold&&item.id!==merged.pendingOpening?.itemId&&item.id===itemId&&GEAR.some(gear=>gear.id===item.gearId&&gear.slot===slot)))) as Partial<Record<GearSlot,string>>;
  const missionRewards = new Map((current.missionRewards ?? []).map(reward => [reward.id, reward]));
  for (const reward of incoming.missionRewards ?? []) if (!missionRewards.has(reward.id)) missionRewards.set(reward.id, reward);
  return { ...merged, missionRewards: [...missionRewards.values()], weeklyWorkoutGoal: current.weeklyWorkoutGoal, weeklySetGoal: current.weeklySetGoal,
    equippedGear, cosmeticGear, equippedCompanionId, activeAbilityId, equippedQuoteId: merged.inventory.some(item => !item.sold && item.id!==merged.pendingOpening?.itemId && item.quoteId === equipped) ? equipped : null };
}
type Counts = { routines: number; workouts: number; customExercises: number };
export type BackupPreview = { newCounts: Counts; duplicateCounts: Counts; conflicts: string[]; multipleDates: string[]; merged: AppData };

export function previewBackup(raw: unknown, current: AppData): BackupPreview {
  if (!record(raw) || raw.format !== 'entrenos-local' || raw.schema_version !== 1 || raw.units !== 'kg') return fail('formato no reconocido; los respaldos antiguos aún no son compatibles');
  const incoming = validateData(raw.data);
  const newCounts: Counts = { routines: 0, workouts: 0, customExercises: 0 };
  const duplicateCounts: Counts = { routines: 0, workouts: 0, customExercises: 0 };
  const conflicts: string[] = [];
  function merge<T extends { id: string }>(kind: keyof Counts, existing: T[], additions: T[]): T[] {
    const byId = new Map(existing.map((item) => [item.id, item]));
    const result = [...existing];
    for (const item of additions) {
      const found = byId.get(item.id);
      if (found) {
        if (canonical(found) === canonical(item)) duplicateCounts[kind]++;
        else conflicts.push(`${kind}: ${item.id}`);
      } else { result.push(item); byId.set(item.id, item); newCounts[kind]++; }
    }
    return result;
  }
  const merged: AppData = { customExercises: merge<Exercise>('customExercises', current.customExercises, incoming.customExercises),
    routines: merge<Routine>('routines', current.routines, incoming.routines), workouts: merge<Workout>('workouts', current.workouts, incoming.workouts) };
  const game = mergeGame(current.game, incoming.game, conflicts);
  if (game) merged.game = game;
  const preferences = incoming.preferences ?? current.preferences;
  if (preferences) merged.preferences = { ...preferences };
  const profile=incoming.profile??current.profile;
  if(profile)merged.profile={...profile};
  // Detect UUID collisions in nested entities across the two sources too.
  // A top-level match with differing content is reported as a conflict above.
  if (!conflicts.length) validateData(merged);
  const dates = new Map<string, number>();
  for (const workout of merged.workouts) if (workout.status === 'finished') dates.set(workout.date, (dates.get(workout.date) ?? 0) + 1);
  return { newCounts, duplicateCounts, conflicts, multipleDates: [...dates].filter(([, count]) => count > 1).map(([date]) => date).sort(), merged };
}
