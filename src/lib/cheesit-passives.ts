import { COMPANIONS } from './companions';
import { isCivilDate, todayMadrid } from './dates';
import type { GameState } from './game';
import { isWorkSet, validSet, type Workout } from './model';
import { setReward } from './rewards';
import type { AthleteProfile } from './strength';

export type PassiveCondition = 'completion' | 'record' | 'variety' | 'bodyweight' | 'effort' | 'rest';
export type PassiveParameters = { xp: number; credits: number; minGroups?: number; restDays?: number };
export type CompanionPassive = {
  id: string; version: 1; companionId: string; name: string; description: string;
  valueLabel: string; condition: PassiveCondition; parameters: Readonly<PassiveParameters>;
};

/** Version 1 is immutable: future balance changes must add a new version. Flat,
 * session-capped awards never scale with load, repetitions or extra sets. */
export const COMPANION_PASSIVES: readonly CompanionPassive[] = [
  { id: 'neon-finish', version: 1, companionId: 'athlete', name: 'Impulso de neón', condition: 'completion', parameters: { xp: 20, credits: 0 }, valueLabel: '+20 XP', description: '+20 XP al terminar una sesión con al menos una serie válida confirmada. Una vez por sesión.' },
  { id: 'iron-milestone', version: 1, companionId: 'warrior', name: 'Marca de hierro', condition: 'record', parameters: { xp: 15, credits: 0 }, valueLabel: '+15 XP', description: '+15 XP si logras al menos un récord comparable con una sesión anterior: más peso con las mismas repeticiones o más repeticiones con el mismo peso. Una vez por sesión.' },
  { id: 'stellar-variety', version: 1, companionId: 'sorceress', name: 'Constelación variada', condition: 'variety', parameters: { xp: 20, credits: 0, minGroups: 3 }, valueLabel: '+20 XP', description: '+20 XP al terminar una sesión con series válidas confirmadas en al menos 3 grupos musculares. Una vez por sesión.' },
  { id: 'dragon-balance', version: 1, companionId: 'dragon-queen', name: 'Tesoro equilibrado', condition: 'variety', parameters: { xp: 0, credits: 4, minGroups: 2 }, valueLabel: '+4 créditos', description: '+4 créditos al terminar una sesión con series válidas confirmadas en al menos 2 grupos musculares. Una vez por sesión.' },
  { id: 'pulse-salvage', version: 1, companionId: 'iris', name: 'Chispa de taller', condition: 'completion', parameters: { xp: 0, credits: 2 }, valueLabel: '+2 créditos', description: '+2 créditos al terminar una sesión con al menos una serie válida confirmada. Una vez por sesión.' },
  { id: 'tidal-control', version: 1, companionId: 'lua', name: 'Marea propia', condition: 'bodyweight', parameters: { xp: 20, credits: 0 }, valueLabel: '+20 XP', description: '+20 XP al terminar una sesión con al menos un ejercicio de peso corporal y una serie válida confirmada en él. Una vez por sesión.' },
  { id: 'solar-awareness', version: 1, companionId: 'sol', name: 'Ritmo consciente', condition: 'effort', parameters: { xp: 15, credits: 0 }, valueLabel: '+15 XP', description: '+15 XP si todas las series válidas confirmadas incluyen una valoración RPE o RIR entre 0 y 10. Cualquier valoración válida sirve. Una vez por sesión.' },
  { id: 'astral-rest', version: 1, companionId: 'mara', name: 'Órbita de descanso', condition: 'rest', parameters: { xp: 25, credits: 0, restDays: 1 }, valueLabel: '+25 XP', description: '+25 XP al terminar tras al menos un día natural completo sin sesiones finalizadas desde tu sesión anterior. Requiere una sesión anterior; la primera no cuenta. Una vez por sesión.' },
];

export const getCompanionPassive = (companionId: string | null | undefined): CompanionPassive | undefined => COMPANION_PASSIVES.find(passive => passive.companionId === companionId);
export type CompanionPassiveSnapshot = {
  workoutId: string; companionId: string; passiveId: string; version: 1;
  parameters: PassiveParameters; fixedAt: string; fixedDate: string;
};
export type CompanionPassiveAward = CompanionPassiveSnapshot & {
  awardedAt: string; bonusXp: number; bonusCredits: number; eligible: boolean;
  reason: 'awarded' | 'condition-not-met' | 'historical-date' | 'invalid-session';
};

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const civilDayOrdinal = (value: string) => isCivilDate(value) ? Date.parse(`${value}T12:00:00Z`) / 86400000 : NaN;
function matchingParameters(value: unknown, expected: Readonly<PassiveParameters>): value is PassiveParameters {
  return object(value) && Object.keys(value).length === Object.keys(expected).length && Object.entries(expected).every(([key, amount]) => value[key] === amount);
}
export function isCompanionPassiveSnapshot(value: unknown): value is CompanionPassiveSnapshot {
  if (!object(value)) return false;
  const definition = typeof value.companionId === 'string' ? getCompanionPassive(value.companionId) : undefined;
  return !!definition && uuid(value.workoutId) && value.passiveId === definition.id && value.version === definition.version && matchingParameters(value.parameters, definition.parameters) && timestamp(value.fixedAt) && value.fixedDate === todayMadrid(new Date(value.fixedAt));
}
export function isCompanionPassiveAward(value: unknown): value is CompanionPassiveAward {
  if (!isCompanionPassiveSnapshot(value)) return false;
  const award = value as CompanionPassiveAward;
  return timestamp(award.awardedAt) && Date.parse(award.awardedAt) >= Date.parse(award.fixedAt) && typeof award.eligible === 'boolean' && ['awarded', 'condition-not-met', 'historical-date', 'invalid-session'].includes(award.reason) &&
    (award.eligible ? award.reason === 'awarded' && award.bonusXp === award.parameters.xp && award.bonusCredits === award.parameters.credits : award.reason !== 'awarded' && award.bonusXp === 0 && award.bonusCredits === 0);
}

/** Snapshot at session creation, never on first save/finish. A null snapshot is
 * intentional; missing snapshots belong to legacy drafts and remain ineligible. */
export function snapshotCompanionPassive(game: GameState | undefined, workoutId: string, fixedAt = new Date().toISOString()): CompanionPassiveSnapshot | null {
  const companionId = game?.equippedCompanionId;
  const passive = getCompanionPassive(companionId);
  if (!game || !passive || !uuid(workoutId) || !timestamp(fixedAt) || !COMPANIONS.some(companion => companion.id === companionId) ||
      !game.inventory.some(item => item.companionId === companionId && item.id !== game.pendingOpening?.itemId)) return null;
  return { workoutId, companionId: passive.companionId, passiveId: passive.id, version: passive.version, parameters: { ...passive.parameters }, fixedAt, fixedDate: todayMadrid(new Date(fixedAt)) };
}
/** Use only for a genuinely new ID. Repeating history starts a fresh event. */
export function snapshotWorkoutPassive(workout: Workout, game?: GameState): Workout {
  const { companionReward: _award, companionPassive: _snapshot, ...clean } = workout;
  return { ...clean, companionPassive: snapshotCompanionPassive(game, workout.id, workout.startedAt ?? workout.createdAt) };
}

/** Reconcile training edits without replacing an event that was already captured
 * in the authoritative copy. Shared by backup imports and revision conflicts. */
export function preserveWorkoutPassiveEvent(selected: Workout, authoritative: Workout): Workout {
  const captured = authoritative.companionPassive, incoming = selected.companionPassive;
  const sameCapture = captured == null || incoming == null ? captured === incoming
    : isCompanionPassiveSnapshot(captured) && isCompanionPassiveSnapshot(incoming) &&
      captured.workoutId === incoming.workoutId && captured.companionId === incoming.companionId && captured.passiveId === incoming.passiveId && captured.version === incoming.version && captured.fixedAt === incoming.fixedAt && captured.fixedDate === incoming.fixedDate;
  const companionReward = authoritative.companionReward ?? (authoritative.status === 'draft' && sameCapture ? selected.companionReward : undefined);
  const gearPassiveRewards = authoritative.gearPassiveRewards
    ?? (authoritative.status === 'draft' ? selected.gearPassiveRewards : undefined);
  return { ...selected, companionPassive: captured, companionReward, gearPassiveRewards,
    ...((companionReward || gearPassiveRewards) && selected.status === 'draft' ? { status: authoritative.status } : {}) };
}

/** The stored award is authoritative after the first finish, even for an unmet
 * condition (zero). Edits cannot retry a failed condition or recalculate history. */
export function applyWorkoutPassive(workout: Workout, history: Workout[], profile?: AthleteProfile): Workout {
  const previous = history.find(candidate => candidate.id === workout.id);
  const existing = previous?.companionReward ?? workout.companionReward;
  if (isCompanionPassiveAward(existing) && existing.workoutId === workout.id) {
    const { awardedAt: _at, bonusXp: _xp, bonusCredits: _credits, eligible: _eligible, reason: _reason, ...captured } = existing;
    return { ...workout, companionPassive: structuredClone(captured), companionReward: structuredClone(existing) };
  }
  // A finished legacy session cannot acquire a snapshot through a subsequent edit.
  if (previous?.status === 'finished' && !previous.companionReward) return { ...workout, companionPassive: previous.companionPassive, companionReward: undefined };
  const snapshot = previous ? previous.companionPassive : workout.companionPassive;
  if (workout.status !== 'finished' || !isCompanionPassiveSnapshot(snapshot) || snapshot.workoutId !== workout.id) return { ...workout, companionPassive: snapshot, companionReward: undefined };
  const definition = getCompanionPassive(snapshot.companionId)!;
  const exercises = workout.exercises.map(exercise => ({ exercise, sets: exercise.sets.filter(set => isWorkSet(set) && set.confirmed && validSet(set, exercise.mode)) })).filter(entry => entry.sets.length);
  const groups = new Set(exercises.map(({ exercise }) => exercise.group));
  const isCurrentDate = workout.date === snapshot.fixedDate;
  const hasSets = exercises.length > 0;
  let condition = definition.condition === 'completion';
  if (definition.condition === 'variety') condition = groups.size >= snapshot.parameters.minGroups!;
  if (definition.condition === 'bodyweight') condition = exercises.some(({ exercise }) => exercise.mode === 'bodyweight_reps');
  if (definition.condition === 'effort') condition = exercises.every(({ sets }) => sets.every(set => [set.rpe, set.rir].some(value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10)));
  if (definition.condition === 'record') condition = exercises.some(({ exercise, sets }) => sets.some(set => setReward(exercise, set, history, workout.id, workout.date, profile).record));
  if (definition.condition === 'rest') {
    // Same-date prior sessions disqualify too. Missing/invalid dates never qualify.
    const preceding = history.filter(candidate => candidate.id !== workout.id && candidate.status === 'finished' && candidate.date <= workout.date && candidate.exercises.some(exercise => exercise.sets.some(set => isWorkSet(set) && set.confirmed && validSet(set, exercise.mode)))).map(candidate => candidate.date).sort().at(-1);
    condition = !!preceding && civilDayOrdinal(workout.date) - civilDayOrdinal(preceding) >= snapshot.parameters.restDays! + 1;
  }
  const eligible = hasSets && isCurrentDate && condition;
  const award: CompanionPassiveAward = { ...structuredClone(snapshot), awardedAt: new Date(Math.max(Date.now(), Date.parse(snapshot.fixedAt))).toISOString(), eligible,
    bonusXp: eligible ? snapshot.parameters.xp : 0, bonusCredits: eligible ? snapshot.parameters.credits : 0,
    reason: !hasSets ? 'invalid-session' : !isCurrentDate ? 'historical-date' : condition ? 'awarded' : 'condition-not-met' };
  return { ...workout, companionPassive: snapshot, companionReward: award };
}

/** Read the frozen award only: no access to the equipped cheesit or catalog math. */
export function workoutPassiveReward(workout: Workout): { bonusXp: number; bonusCredits: number } {
  const award = workout.companionReward;
  if (workout.status !== 'finished' || !isCompanionPassiveAward(award) || award.workoutId !== workout.id || !workout.exercises.some(exercise => exercise.sets.some(set => isWorkSet(set) && set.confirmed && validSet(set, exercise.mode)))) return { bonusXp: 0, bonusCredits: 0 };
  return { bonusXp: award.bonusXp, bonusCredits: award.bonusCredits };
}
