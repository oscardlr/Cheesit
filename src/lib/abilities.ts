import { GEAR } from './gear';
import type { Rarity } from './game';
import { isWorkSet, validSet, type Workout, type WorkoutExercise } from './model';

export type AbilityUse = { workoutId: string; abilityId: string; bonusXp: number; bonusCredits: number; awardedAt: string; setBonuses: Record<string, number> };
export type Ability = { id: string; name: string; description: string; target: 'all' | 'legs' | 'arms' | 'push' | 'pull' | 'credits'; percent: number; maxXp: number; credits: number; chargesPerDrop: number; rarity: Rarity };
const balance: Record<Rarity, { percent: number; maxXp: number; credits: number; chargesPerDrop: number }> = {
  common: { percent: 3, maxXp: 20, credits: 5, chargesPerDrop: 1 },
  rare: { percent: 6, maxXp: 35, credits: 10, chargesPerDrop: 1 },
  epic: { percent: 10, maxXp: 60, credits: 20, chargesPerDrop: 1 },
  legendary: { percent: 15, maxXp: 100, credits: 40, chargesPerDrop: 1 },
};
const targets: Record<string, Ability['target']> = {
  'purple-tank': 'push', 'lime-shorts': 'legs', 'crimson-shorts': 'legs', 'dragon-head': 'pull',
  'champion-crown': 'all', headphones: 'all', 'titan-sword': 'arms', 'plasma-blaster': 'credits',
  'violet-cape': 'pull', 'neon-wings': 'all', 'golden-armor': 'push', 'training-tank': 'all',
  'phoenix-crown': 'all', 'celestial-armor': 'push', 'storm-tank': 'push', 'void-greaves': 'legs',
  'mecha-shorts': 'legs', 'thunder-hammer': 'arms', 'starlight-gauntlet': 'arms', 'solar-cape': 'credits',
  'ronin-head': 'all', 'ronin-top': 'push', 'ronin-bottom': 'legs', 'ronin-hand': 'arms', 'ronin-back': 'pull',
  'glacier-head': 'all', 'glacier-top': 'push', 'glacier-bottom': 'legs', 'glacier-hand': 'pull', 'glacier-back': 'credits',
  'cosmic-head': 'all', 'cosmic-top': 'push', 'cosmic-bottom': 'legs', 'cosmic-hand': 'arms', 'cosmic-back': 'credits',
};
const targetLabels = { all: 'tus series', legs: 'pierna y glúteo', arms: 'bíceps y tríceps', push: 'pecho, hombro y tríceps', pull: 'espalda y bíceps', credits: 'créditos por sesión' };
export const ABILITIES: Ability[] = GEAR.map(gear => {
  const target = targets[gear.id] ?? 'all';
  const values = balance[gear.rarity];
  const percent = target === 'all' ? values.percent / 2 : values.percent;
  return { id: gear.id, name: gear.abilityName ?? gear.name, rarity: gear.rarity, target, ...values, percent,
    description: target === 'credits' ? `+${values.credits} créditos al terminar un entrenamiento válido.`
      : `+${new Intl.NumberFormat('es-ES').format(percent)} % XP en ${targetLabels[target]}, máximo ${values.maxXp} XP por entreno.` };
});
export const getAbilityDefinition = (id: string | null | undefined): Ability | undefined => ABILITIES.find(ability => ability.id === id);
export function abilityMatches(ability: Ability, exercise: Pick<WorkoutExercise, 'group'>): boolean {
  return ability.target === 'all' || ability.target === 'credits' ||
    (ability.target === 'legs' && exercise.group === 'Pierna y glúteo') ||
    (ability.target === 'arms' && ['Bíceps', 'Tríceps'].includes(exercise.group)) ||
    (ability.target === 'push' && ['Pecho', 'Hombro', 'Tríceps'].includes(exercise.group)) ||
    (ability.target === 'pull' && ['Espalda', 'Bíceps'].includes(exercise.group));
}
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function isAbilityUse(value: unknown): value is AbilityUse {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const use = value as Record<string, unknown>;
  const ability = typeof use.abilityId === 'string' ? getAbilityDefinition(use.abilityId) : undefined;
  if (!ability || !uuid(use.workoutId) || typeof use.awardedAt !== 'string' || !Number.isFinite(Date.parse(use.awardedAt)) ||
    !Number.isSafeInteger(use.bonusXp) || !Number.isSafeInteger(use.bonusCredits) || typeof use.setBonuses !== 'object' || use.setBonuses === null || Array.isArray(use.setBonuses)) return false;
  const entries = Object.entries(use.setBonuses);
  if (entries.length > 2500 || entries.some(([id, amount]) => !uuid(id) || !Number.isSafeInteger(amount) || amount <= 0 || amount > ability.maxXp)) return false;
  const total = entries.reduce((sum, [, amount]) => sum + amount, 0);
  return ability.target === 'credits'
    ? use.bonusXp === 0 && total === 0 && use.bonusCredits === ability.credits
    : use.bonusCredits === 0 && use.bonusXp === total && total > 0 && total <= ability.maxXp;
}

/** Keep earned outfit rewards independent of the currently equipped pieces. */
export function validGearPassiveRewards(value: unknown, workoutId: string): value is AbilityUse[] {
  if (!Array.isArray(value) || value.length > 5) return false;
  const slots = new Set<string>();
  for (const reward of value) {
    if (!isAbilityUse(reward) || reward.workoutId !== workoutId) return false;
    const slot = GEAR.find(gear => gear.id === reward.abilityId)?.slot;
    if (!slot || slots.has(slot)) return false;
    slots.add(slot);
  }
  return true;
}

export function workoutGearPassiveRewards(workout: Workout): AbilityUse[] {
  return workout.status === 'finished' && !workout.abilityReward && validGearPassiveRewards(workout.gearPassiveRewards, workout.id)
    ? workout.gearPassiveRewards
    : [];
}

export function workoutGearPassiveCredits(workout: Workout): number {
  if (!workout.exercises.some(exercise => exercise.sets.some(set => isWorkSet(set) && set.confirmed && validSet(set, exercise.mode)))) return 0;
  return workoutGearPassiveRewards(workout).reduce((credits, reward) => credits + reward.bonusCredits, 0);
}
