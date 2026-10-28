import { getAbilityDefinition, isAbilityUse, type AbilityUse } from './abilities';
import type { GameState, InventoryItem, Rarity } from './game';

// These limits describe historical saves only. Every newly revealed copy now
// grants one charge; keeping the old limits here never replenishes a balance.
const LEGACY_CHARGES_PER_DROP: Record<Rarity, number> = { common: 3, rare: 4, epic: 5, legendary: 5 };

type ChargeState = Pick<GameState, 'inventory' | 'abilityUses' | 'pendingOpening' | 'legacyAbilityUseIds'>;

export function getAvailableAbilityCharges(game: ChargeState, abilityId: string): number {
  if (!getAbilityDefinition(abilityId)) return 0;
  const copies = game.inventory.filter(item => item.gearId === abilityId && item.id !== game.pendingOpening?.itemId).length;
  const legacy = new Set(game.legacyAbilityUseIds ?? []);
  const used = (game.abilityUses ?? []).filter(use => use.abilityId === abilityId && !legacy.has(use.workoutId)).length;
  return Math.max(0, copies - used);
}

function revealedDates(inventory: readonly InventoryItem[], pendingItemId: string | null | undefined): Map<string, number[]> {
  const dates = new Map<string, number[]>();
  for (const item of inventory) {
    if (!item.gearId || item.id === pendingItemId) continue;
    const times = dates.get(item.gearId) ?? [];
    times.push(Date.parse(item.acquiredAt));
    dates.set(item.gearId, times);
  }
  for (const times of dates.values()) times.sort((left, right) => left - right);
  return dates;
}

function copiesAt(dates: Map<string, number[]>, use: AbilityUse): number {
  const times = dates.get(use.abilityId) ?? [], at = Date.parse(use.awardedAt);
  let first = 0, last = times.length;
  while (first < last) {
    const middle = Math.floor((first + last) / 2);
    if (times[middle] <= at) first = middle + 1;
    else last = middle;
  }
  return first;
}

/** Versionless snapshots retain the former caps; current snapshots only exempt
 * the exact events frozen during migration, never subsequent uses. */
export function validateAbilityChargeHistory(
  inventory: readonly InventoryItem[],
  uses: readonly AbilityUse[],
  pendingItemId: string | null | undefined,
  version: unknown,
  legacyIds: unknown,
): boolean {
  if (version !== undefined && version !== 1) return false;
  if (version === undefined && legacyIds !== undefined) return false;
  if (legacyIds !== undefined && (!Array.isArray(legacyIds) || legacyIds.length > uses.length ||
    legacyIds.some(id => typeof id !== 'string') || new Set(legacyIds).size !== legacyIds.length)) return false;
  const legacy = new Set<string>(legacyIds as string[] | undefined);
  const dates = revealedDates(inventory, pendingItemId);
  const workouts = new Set<string>(), counts = new Map<string, number>(), normalCounts = new Map<string, number>();
  if (uses.some(use => !isAbilityUse(use))) return false;
  for (const use of [...uses].sort((left, right) => Date.parse(left.awardedAt) - Date.parse(right.awardedAt))) {
    if (workouts.has(use.workoutId)) return false;
    workouts.add(use.workoutId);
    const ability = getAbilityDefinition(use.abilityId)!;
    const count = (counts.get(use.abilityId) ?? 0) + 1;
    counts.set(use.abilityId, count);
    const copies = copiesAt(dates, use);
    if (version === undefined || legacy.has(use.workoutId)) {
      if (count > copies * LEGACY_CHARGES_PER_DROP[ability.rarity]) return false;
    } else {
      const normalCount = (normalCounts.get(use.abilityId) ?? 0) + 1;
      normalCounts.set(use.abilityId, normalCount);
      if (normalCount > copies) return false;
    }
  }
  return [...legacy].every(id => workouts.has(id));
}

/** Preserve historical extra uses without charging them against future drops.
 * Each revealed copy still funds one ordinary use, including copies obtained
 * between historical events. */
export function getLegacyAbilityUseIds(
  inventory: readonly InventoryItem[],
  uses: readonly AbilityUse[],
  pendingItemId: string | null | undefined,
): string[] | null {
  if (!validateAbilityChargeHistory(inventory, uses, pendingItemId, undefined, undefined)) return null;
  const dates = revealedDates(inventory, pendingItemId);
  const counts = new Map<string, number>(), legacy: string[] = [];
  for (const use of [...uses].sort((left, right) => Date.parse(left.awardedAt) - Date.parse(right.awardedAt))) {
    const count = (counts.get(use.abilityId) ?? 0) + 1;
    if (count > copiesAt(dates, use)) legacy.push(use.workoutId);
    else counts.set(use.abilityId, count);
  }
  return legacy;
}
