import { CATALOG, GROUPS } from './catalog';
import { isAthleteProfile } from './strength';
import { GEAR, type GearSlot } from './gear';
import { isCivilDate, todayMadrid } from './dates';
import { WORKOUT_COLOR, copiedName, isRoutineColor, isRoutineIcon, newId, resolvedRoutineIcon, snapshotLoadConventions, validName, validPlannedSets, validSet, type AppData, type Exercise, type Routine, type Workout, type WorkoutSet } from './model';
import { getAbilityCharges, isGameState, normalizeGame, unlockedCompanions, unlockedGear, type GameState } from './game';
import { getAbilityDefinition, isAbilityUse } from './abilities';
import { MUSCLES } from './muscles';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const name = (value: unknown): value is string => typeof value === 'string' && validName(value);
const mode = (value: unknown) => value === 'external_load_reps' || value === 'bodyweight_reps';
const color = isRoutineColor;
const routineIcon = (value: unknown) => value === undefined || isRoutineIcon(value);
const workoutColor = (value: unknown) => value === WORKOUT_COLOR || color(value);
const bounded = (value: unknown, max: number): value is unknown[] => Array.isArray(value) && value.length <= max;
const fail = (what: string): never => { throw new Error(`Copia no válida: ${what}. No se ha importado nada.`); };
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const optionalText = (value: unknown, max = 4000) => value === undefined || (typeof value === 'string' && value.length <= max);
const optionalNumber = (value: unknown, min: number, max: number, integer = false) => value === undefined || value === null || (finite(value) && value >= min && value <= max && (!integer || Number.isInteger(value)));
const timestamp = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const muscleIds = new Set(MUSCLES.map(muscle => muscle.id));
function metadata(value: Record<string, unknown>) {
  const muscles = (items: unknown) => items === undefined || (bounded(items, 10) && new Set(items).size === items.length && items.every(id => muscleIds.has(id as never)));
  return (value.loadConvention === undefined || ['total', 'per_unit_bilateral', 'per_unit_alternating', 'per_unit_single'].includes(value.loadConvention as string)) && muscles(value.primaryMuscles) && muscles(value.secondaryMuscles) && !(Array.isArray(value.primaryMuscles) && Array.isArray(value.secondaryMuscles) && value.primaryMuscles.some(id => (value.secondaryMuscles as unknown[]).includes(id)));
}
function prescription(value: Record<string, unknown>) {
  return optionalText(value.notes) && optionalNumber(value.repsMin, 1, 1000, true) && optionalNumber(value.repsMax, 1, 1000, true) && (value.repsMin == null || value.repsMax == null || (value.repsMin as number) <= (value.repsMax as number)) && optionalNumber(value.targetWeight, 0, 1000) && (value.targetWeight == null || Math.abs((value.targetWeight as number) * 100 - Math.round((value.targetWeight as number) * 100)) < 1e-8) && optionalNumber(value.restSeconds, 0, 3600, true);
}

export function createBackup(data: AppData) {
  return { format: 'entrenos-local', schema_version: 1, export_id: newId(), exported_at: new Date().toISOString(),
    origin: 'browser', units: 'kg', scope: 'local-device-only', data };
}

function validateData(value: unknown): AppData {
  if (!record(value) || !bounded(value.routines, 10000) || !bounded(value.workouts, 50000) || !bounded(value.customExercises, 10000)) return fail('estructura o cantidad de registros');
  const ids = new Set<string>();
  const add = (id: unknown) => { if (!uuid(id) || ids.has(id)) fail('identificador ausente, inválido o duplicado'); ids.add(id as string); };
  for (const exercise of value.customExercises) {
    if (!record(exercise) || !name(exercise.name) || !GROUPS.includes(exercise.group as string) || !mode(exercise.mode) || !metadata(exercise) || (exercise.archived !== undefined && typeof exercise.archived !== 'boolean') || !optionalText(exercise.description) || !optionalText(exercise.technique) || !optionalText(exercise.equipment, 160)) return fail('ejercicio personalizado');
    if (exercise.resource !== undefined && (!record(exercise.resource) || !name(exercise.resource.title) || typeof exercise.resource.url !== 'string' || !/^https:\/\//i.test(exercise.resource.url) || !optionalText(exercise.resource.license, 300))) return fail('recurso del ejercicio');
    add(exercise.id);
  }
  const knownExercises = new Set([...CATALOG.map((exercise) => exercise.id), ...value.customExercises.map((exercise) => (exercise as Exercise).id)]);
  if (value.routineDraft !== undefined) {
    const draft = value.routineDraft;
    if (!record(draft) || !uuid(draft.id) || typeof draft.name !== 'string' || draft.name.length > 80 || !color(draft.color) || !routineIcon(draft.icon) || typeof draft.archived !== 'boolean' || !optionalText(draft.notes) || !bounded(draft.exercises, 50)) return fail('borrador de rutina');
    // This is an editor snapshot of a saved routine; its identifiers may intentionally match it.
    const draftIds = new Set<string>([draft.id]);
    for (const exercise of draft.exercises) {
      if (!record(exercise) || !uuid(exercise.id) || draftIds.has(exercise.id) || typeof exercise.exerciseId !== 'string' || !knownExercises.has(exercise.exerciseId) || !(exercise.sets === null || finite(exercise.sets)) || !optionalText(exercise.notes) || !['repsMin', 'repsMax', 'targetWeight', 'restSeconds'].every(key => exercise[key] === undefined || exercise[key] === null || finite(exercise[key]))) return fail('valores del borrador de rutina');
      draftIds.add(exercise.id);
    }
  }
  for (const routine of value.routines) {
    if (!record(routine) || !name(routine.name) || !color(routine.color) || !routineIcon(routine.icon) || typeof routine.archived !== 'boolean' || !bounded(routine.exercises, 50) || !optionalText(routine.notes)) return fail('rutina');
    add(routine.id);
    for (const exercise of routine.exercises) {
      if (!record(exercise) || typeof exercise.exerciseId !== 'string' || !knownExercises.has(exercise.exerciseId) || !validPlannedSets(exercise.sets as number) || !prescription(exercise)) return fail('ejercicio de rutina');
      add(exercise.id);
    }
  }
  for (const workout of value.workouts) {
    if (!record(workout) || (workout.status === 'draft' ? !optionalText(workout.name, 80) || typeof workout.name !== 'string' : !name(workout.name)) || !workoutColor(workout.color) || typeof workout.date !== 'string' || (workout.status === 'draft' ? workout.date !== '' && !isCivilDate(workout.date) : !isCivilDate(workout.date) || workout.date > todayMadrid()) || !['draft', 'finished', 'deleted'].includes(workout.status as string) || !timestamp(workout.createdAt) || !timestamp(workout.updatedAt) || !bounded(workout.exercises, 50) || !optionalText(workout.notes)) return fail('entrenamiento o fecha futura');
    if ((workout.startedAt !== undefined && !timestamp(workout.startedAt)) || (workout.finishedAt !== undefined && !timestamp(workout.finishedAt)) || (workout.autoRest !== undefined && typeof workout.autoRest !== 'boolean') || (workout.defaultRestSeconds !== undefined && !optionalNumber(workout.defaultRestSeconds, 0, 3600, true))) return fail('duración o descanso');
    if (workout.restTimer !== undefined && (!record(workout.restTimer) || !(workout.restTimer.endsAt === null || timestamp(workout.restTimer.endsAt)) || !finite(workout.restTimer.remainingSeconds) || workout.restTimer.remainingSeconds < 0 || workout.restTimer.remainingSeconds > 3600 || !finite(workout.restTimer.durationSeconds) || !Number.isInteger(workout.restTimer.durationSeconds) || workout.restTimer.durationSeconds < 0 || workout.restTimer.durationSeconds > 3600)) return fail('temporizador de descanso');
    add(workout.id);
    if(workout.abilityId!==undefined&&workout.abilityId!==null&&(typeof workout.abilityId!=='string'||!getAbilityDefinition(workout.abilityId)))return fail('habilidad de entrenamiento');
    if(workout.abilityReward!==undefined&&(!isAbilityUse(workout.abilityReward)||workout.abilityReward.workoutId!==workout.id||workout.abilityReward.abilityId!==workout.abilityId||workout.status==='draft'))return fail('recompensa de habilidad');
    let confirmed = 0;
    for (const exercise of workout.exercises) {
      if (!record(exercise) || typeof exercise.exerciseId !== 'string' || !exercise.exerciseId || !name(exercise.name) || !GROUPS.includes(exercise.group as string) || !mode(exercise.mode) || !bounded(exercise.sets, 50) || !metadata(exercise) || !prescription(exercise)) return fail('ejercicio de entrenamiento');
      add(exercise.id);
      for (const set of exercise.sets) {
        if (!record(set) || typeof set.confirmed !== 'boolean') return fail('serie');
        add(set.id);
        const weight = set.weight, reps = set.reps;
        // Pending input is recoverable even while incomplete or outside confirmation bounds.
        if (!(weight === null || finite(weight)) || !(reps === null || finite(reps)) || (set.confirmed && !validSet(set as WorkoutSet, exercise.mode as Exercise['mode'])) || !optionalText(set.weightText, 100) || !optionalText(set.repsText, 100) || !optionalNumber(set.rpe, 0, 10) || !optionalNumber(set.rir, 0, 10)) return fail('valores de serie');
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
  if (record(value)) return `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
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
    equippedGear, cosmeticGear, equippedCompanionId, activeAbilityId, equippedQuoteId: merged.inventory.some(item => item.id!==merged.pendingOpening?.itemId && item.quoteId === equipped) ? equipped : null };
}
type Counts = { routines: number; workouts: number; customExercises: number };
export type BackupResolution = 'local' | 'incoming' | 'duplicate';
export type BackupConflict = { key: string; kind: keyof Counts | 'game' | 'routineDraft'; id: string; name: string; local: unknown; incoming: unknown; choices: BackupResolution[] };
export type BackupPreview = { newCounts: Counts; duplicateCounts: Counts; conflicts: string[]; conflictDetails: BackupConflict[]; multipleDates: string[]; merged: AppData };

export function previewBackup(raw: unknown, current: AppData, resolutions: Record<string, BackupResolution> = {}): BackupPreview {
  if (!record(raw) || raw.format !== 'entrenos-local' || raw.schema_version !== 1 || raw.units !== 'kg') return fail('formato no reconocido; los respaldos antiguos aún no son compatibles');
  let incoming = validateData(raw.data);
  // Imported records retain the source convention when the destination uses another profile.
  if (current.profile && canonical(current.profile) !== canonical(incoming.profile)) incoming = snapshotLoadConventions(incoming);
  const newCounts: Counts = { routines: 0, workouts: 0, customExercises: 0 };
  const duplicateCounts: Counts = { routines: 0, workouts: 0, customExercises: 0 };
  const conflicts: string[] = [];
  const conflictDetails: BackupConflict[] = [];
  const remappedExercises = new Map<string, string>();
  const conflict = (detail: BackupConflict) => { conflictDetails.push(detail); const choice = resolutions[detail.key]; if (!choice || !detail.choices.includes(choice)) conflicts.push(`${detail.kind}: ${detail.name} (${detail.id})`); return choice; };
  function duplicate<T extends { id: string }>(kind: keyof Counts, item: T, existingNames: string[]): T {
    const copy = structuredClone(item) as T & { name?: string; exercises?: { id: string; sets?: number | { id: string }[] }[] };
    copy.id = newId();
    if (copy.name) copy.name = copiedName(copy.name, existingNames);
    for (const exercise of copy.exercises ?? []) { exercise.id = newId(); for (const set of Array.isArray(exercise.sets) ? exercise.sets : []) set.id = newId(); }
    if (kind === 'customExercises') remappedExercises.set(item.id, copy.id);
    return copy;
  }
  function merge<T extends { id: string }>(kind: keyof Counts, existing: T[], additions: T[]): T[] {
    const byId = new Map(existing.map((item) => [item.id, item]));
    const result = [...existing];
    for (const item of additions) {
      const found = byId.get(item.id);
      if (found) {
        const snapshot = (value: T, profile: AppData['profile']) => kind === 'workouts' ? snapshotLoadConventions({ routines: [], customExercises: [], workouts: [value as unknown as Workout], profile }).workouts[0] : kind === 'routines' ? { ...value, icon: resolvedRoutineIcon((value as unknown as Routine).icon) } : value;
        if (canonical(snapshot(found, current.profile)) === canonical(snapshot(item, incoming.profile))) duplicateCounts[kind]++;
        else {
          const choices: BackupResolution[] = kind === 'workouts' && (item as unknown as Workout).abilityReward ? ['local', 'incoming'] : ['local', 'incoming', 'duplicate'];
          const key = `${kind}:${item.id}`;
          const choice = conflict({ key, kind, id: item.id, name: (item as T & { name?: string }).name ?? item.id, local: found, incoming: item, choices });
          if (choice === 'incoming') result[result.findIndex(value => value.id === item.id)] = item;
          else if (choice === 'duplicate' && choices.includes('duplicate')) { const copy = duplicate(kind, item, result.flatMap(value => { const name = (value as T & { name?: string }).name; return name ? [name] : []; })); result.push(copy); newCounts[kind]++; }
        }
      } else { result.push(item); byId.set(item.id, item); newCounts[kind]++; }
    }
    return result;
  }
  const customExercises = merge<Exercise>('customExercises', current.customExercises, incoming.customExercises);
  if (remappedExercises.size) incoming = { ...incoming, ...(incoming.routineDraft ? { routineDraft: { ...incoming.routineDraft, exercises: incoming.routineDraft.exercises.map(exercise => ({ ...exercise, exerciseId: remappedExercises.get(exercise.exerciseId) ?? exercise.exerciseId })) } } : {}), routines: incoming.routines.map(routine => ({ ...routine, exercises: routine.exercises.map(exercise => ({ ...exercise, exerciseId: remappedExercises.get(exercise.exerciseId) ?? exercise.exerciseId })) })), workouts: incoming.workouts.map(workout => ({ ...workout, exercises: workout.exercises.map(exercise => ({ ...exercise, exerciseId: remappedExercises.get(exercise.exerciseId) ?? exercise.exerciseId })) })) };
  const merged: AppData = { customExercises, routines: merge<Routine>('routines', current.routines, incoming.routines), workouts: merge<Workout>('workouts', current.workouts, incoming.workouts) };
  const draftSnapshot = (draft: AppData['routineDraft']) => draft ? { ...draft, icon: resolvedRoutineIcon(draft.icon) } : draft;
  if (current.routineDraft && incoming.routineDraft && canonical(draftSnapshot(current.routineDraft)) !== canonical(draftSnapshot(incoming.routineDraft))) {
    const choice = conflict({ key: 'routineDraft:recovery', kind: 'routineDraft', id: incoming.routineDraft.id, name: 'Borrador de rutina pendiente', local: current.routineDraft, incoming: incoming.routineDraft, choices: ['local', 'incoming'] });
    merged.routineDraft = choice === 'incoming' ? incoming.routineDraft : current.routineDraft;
  } else if (current.routineDraft ?? incoming.routineDraft) merged.routineDraft = current.routineDraft ?? incoming.routineDraft;
  const gameConflicts: string[] = [];
  let game = mergeGame(current.game, incoming.game, gameConflicts);
  if (gameConflicts.length) {
    const choice = conflict({ key: 'game:ledger', kind: 'game', id: 'ledger', name: 'Economía, colección y usos de habilidades completos', local: current.game, incoming: incoming.game, choices: ['local', 'incoming'] });
    // Choose one complete ledger. Never combine independent purchases or consumption.
    if (choice === 'incoming') game = incoming.game ? normalizeGame(incoming.game) : undefined;
  }
  if (game) merged.game = game;
  const preferences = current.preferences ?? incoming.preferences;
  if (preferences) merged.preferences = { ...preferences };
  const profile=current.profile??incoming.profile;
  if(profile)merged.profile={...profile};
  // Detect UUID collisions in nested entities across the two sources too.
  // A top-level match with differing content is reported as a conflict above.
  if (!conflicts.length) validateData(merged);
  const dates = new Map<string, number>();
  for (const workout of merged.workouts) if (workout.status === 'finished') dates.set(workout.date, (dates.get(workout.date) ?? 0) + 1);
  return { newCounts, duplicateCounts, conflicts, conflictDetails, multipleDates: [...dates].filter(([, count]) => count > 1).map(([date]) => date).sort(), merged };
}
