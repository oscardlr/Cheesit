import { isCivilDate } from './dates';
import { validSet, type Workout } from './model';
import { levelProgress, rewardProgress, rewardSetIndex } from './rewards';
import { GEAR, GEAR_SLOTS, type GearSlot } from './gear';
import type { AthleteProfile } from './strength';
import { COMPANIONS, type Companion } from './companions';
import { TEST_CREDITS } from './test-credits';
import { abilityMatches, getAbilityDefinition, isAbilityUse, type AbilityUse } from './abilities';
import { getAvailableAbilityCharges, getLegacyAbilityUseIds, validateAbilityChargeHistory } from './ability-charges';
import { awardObjectiveMissions, getObjectiveMissions, missionRewardXp, validMissionRewards, type Mission, type MissionReward } from './objectives';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITIES: Record<Rarity, { label: string; color: string; sellValue: number; order: number }> = {
  common: { label: 'Común', color: '#aeb8cc', sellValue: 20, order: 0 },
  rare: { label: 'Rara', color: '#58aaff', sellValue: 60, order: 1 },
  epic: { label: 'Épica', color: '#b68aff', sellValue: 150, order: 2 },
  legendary: { label: 'Legendaria', color: '#ffcf63', sellValue: 400, order: 3 },
};
export type Quote = { id: string; text: string; rarity: Rarity };
export const QUOTES: Quote[] = [
  { id: 'show-up', text: 'Presentarte ya es una victoria. Ahora ve a por la siguiente.', rarity: 'common' },
  { id: 'one-rep', text: 'Una repetición con intención vale más que diez con prisa.', rarity: 'common' },
  { id: 'your-pace', text: 'Tu ritmo también cuenta. Sigue construyendo.', rarity: 'common' },
  { id: 'rest', text: 'Descansar es parte del plan. Vuelve con energía.', rarity: 'common' },
  { id: 'technique', text: 'La técnica es tu primera marca personal.', rarity: 'common' },
  { id: 'small-steps', text: 'Los pequeños pasos repetidos dejan una huella enorme.', rarity: 'common' },
  { id: 'habit', text: 'La motivación te trae. Tu hábito te hace volver.', rarity: 'rare' },
  { id: 'own-race', text: 'Tu única competición es la versión de ti que empezó.', rarity: 'rare' },
  { id: 'quiet', text: 'El progreso trabaja en silencio y se nota con el tiempo.', rarity: 'rare' },
  { id: 'control', text: 'Domina el movimiento. El peso vendrá después.', rarity: 'rare' },
  { id: 'built', text: 'Estás construyendo a alguien que antes solo imaginabas.', rarity: 'epic' },
  { id: 'patience', text: 'La paciencia también es una forma de fuerza.', rarity: 'epic' },
  { id: 'promise', text: 'Cada sesión es una promesa que te cumples.', rarity: 'epic' },
  { id: 'legend', text: 'Tu historia no se mide en kilos. Se escribe cada vez que vuelves.', rarity: 'legendary' },
  { id: 'iron', text: 'El hierro tiene un límite. Lo que aprendes de ti, no.', rarity: 'legendary' },
];
export type Crate = { id: string; name: string; description: string; cost: number; odds: Record<Rarity, number> };
export const CRATES: Crate[] = [
  { id: 'starter', name: 'Cofre de hierro', description: 'Equipo, una frase o una compañera para tu colección.', cost: 100, odds: { common: 70, rare: 23, epic: 6, legendary: 1 } },
  { id: 'charged', name: 'Cofre de energía', description: 'Más posibilidades de conseguir equipo épico.', cost: 250, odds: { common: 35, rare: 43, epic: 18, legendary: 4 } },
  { id: 'legend', name: 'Cofre de leyenda', description: 'Una recompensa rara o mejor, garantizada.', cost: 500, odds: { common: 0, rare: 55, epic: 35, legendary: 10 } },
];
export type InventoryItem = { id: string; kind?: 'quote' | 'gear' | 'companion'; quoteId?: string; gearId?: string; companionId?: string; rarity: Rarity; acquiredAt: string; crateId: string; sold: boolean };
export type GameTransaction = { id: string; kind: 'crate' | 'sale' | 'level-crate'; itemId: string; amount: number; createdAt: string; sourceLevel?: number; testFunded?:boolean };
export const SPIN_DURATION_MS = 5000;
export const REVEAL_DURATION_MS = 800;
export const GEAR_DROP_CHANCE = .55;
export const QUOTE_DROP_CHANCE = .25;
export const COMPANION_DROP_CHANCE = .2;
export type RewardChoice = { avoidCompanionDuplicates?: boolean; gearSlot?: GearSlot };
export type PendingOpening = { itemId: string; startedAt: string; stage: 'spinning' | 'rarity' | 'revealing'; revealStartedAt?: string };
export type GameState = {
  transactions: GameTransaction[];
  inventory: InventoryItem[];
  weeklyWorkoutGoal: number;
  weeklySetGoal: number;
  equippedQuoteId: string | null;
  equippedGear?: Partial<Record<GearSlot, string>>;
  pendingOpening?: PendingOpening | null;
  cosmeticGear?: Partial<Record<GearSlot, string>>;
  equippedCompanionId?: string | null;
  activeAbilityId?: string | null;
  abilityUses?: AbilityUse[];
  abilityChargeVersion?: 1;
  legacyAbilityUseIds?: string[];
  missionRewards?: MissionReward[];
};

const baseGame = (): GameState => ({ transactions: [], inventory: [], weeklyWorkoutGoal: 3, weeklySetGoal: 30, equippedQuoteId: null, equippedGear: {}, pendingOpening: null, cosmeticGear: {}, equippedCompanionId: null, activeAbilityId: null, abilityUses: [], abilityChargeVersion: 1, missionRewards: [] });
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const date = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

export type ItemDefinition = { kind: 'quote' | 'gear' | 'companion'; id: string; name: string; description: string; rarity: Rarity; slot?: GearSlot; sprite?: number; atlas?: 'core' | 'mythic' };
export function getItemDefinition(item: InventoryItem): ItemDefinition | undefined {
  if (item.companionId) {
    const companion = COMPANIONS.find(candidate => candidate.id === item.companionId);
    return companion ? { ...companion, kind: 'companion' } : undefined;
  }
  if (item.gearId) {
    const gear = GEAR.find(candidate => candidate.id === item.gearId);
    return gear ? { ...gear, kind: 'gear' } : undefined;
  }
  const quote = QUOTES.find(candidate => candidate.id === item.quoteId);
  return quote ? { id: quote.id, name: 'Frase motivacional', description: quote.text, rarity: quote.rarity, kind: 'quote' } : undefined;
}
export const itemLabel = (item: InventoryItem): string => {
  const definition = getItemDefinition(item);
  return definition?.kind === 'quote' ? definition.description : definition?.name ?? 'Recompensa';
};

export type LevelCrate = { id: string; level: number; name: string; claimed: boolean; odds: Record<Rarity, number>; guaranteedGear: true };
const sourceLevel = (crateId: string): number | null => {
  const match = /^level:([1-9]\d{0,3})$/.exec(crateId);
  const level = match ? Number(match[1]) : 0;
  return level >= 2 ? level : null;
};
export function levelCrate(level: number): LevelCrate {
  const milestone = level % 10 === 0 ? 'Leyenda' : level % 5 === 0 ? 'Élite' : 'Ascenso';
  const common = Math.max(20, 60 - level * 2), epic = Math.min(25, 8 + Math.floor(level / 3)), legendary = Math.min(10, 1 + Math.floor(level / 8));
  const odds: Record<Rarity, number> = level % 10 === 0 ? { common: 0, rare: 0, epic: 70, legendary: 30 }
    : level % 5 === 0 ? { common: 0, rare: 60, epic: 32, legendary: 8 }
      : { common, rare: 100 - common - epic - legendary, epic, legendary };
  return { id: `level:${level}`, level, name: `Cofre ${milestone} · nivel ${level}`, claimed: false, odds, guaranteedGear: true };
}

export function getLevelCrates(game: GameState, history: Workout[], profile?: AthleteProfile): LevelCrate[] {
  const currentLevel = gameProgress(game, history, profile).level;
  const claimed = new Set(game.transactions.filter(transaction => transaction.kind === 'level-crate').map(transaction => transaction.sourceLevel));
  return Array.from({ length: Math.max(0, Math.min(9999, currentLevel) - 1) }, (_, index) => {
    const crate = levelCrate(index + 2);
    return { ...crate, claimed: claimed.has(crate.level) };
  });
}

/** Backups must carry the whole ledger: orphaned items or repeated sales are invalid. */
export function isGameState(value: unknown): value is GameState {
  if (!record(value) || !Array.isArray(value.inventory) || !Array.isArray(value.transactions) || value.inventory.length > 50000 || value.transactions.length > 100000 ||
    !Number.isInteger(value.weeklyWorkoutGoal) || (value.weeklyWorkoutGoal as number) < 1 || (value.weeklyWorkoutGoal as number) > 7 ||
    !Number.isInteger(value.weeklySetGoal) || (value.weeklySetGoal as number) < 1 || (value.weeklySetGoal as number) > 200 ||
    !(value.equippedQuoteId === null || typeof value.equippedQuoteId === 'string')) return false;
  const ids = new Set<string>();
  const items = new Map<string, InventoryItem>();
  for (const item of value.inventory) {
    if (!record(item) || !id(item.id) || ids.has(item.id) || !date(item.acquiredAt) || typeof item.sold !== 'boolean' || typeof item.crateId !== 'string') return false;
    const isGear = item.kind === 'gear' && typeof item.gearId === 'string' && item.quoteId === undefined && item.companionId === undefined && GEAR.some(gear => gear.id === item.gearId && gear.rarity === item.rarity);
    const isQuote = (item.kind === undefined || item.kind === 'quote') && item.gearId === undefined && item.companionId === undefined && typeof item.quoteId === 'string' && QUOTES.some(quote => quote.id === item.quoteId && quote.rarity === item.rarity);
    const isCompanion = item.kind === 'companion' && typeof item.companionId === 'string' && item.quoteId === undefined && item.gearId === undefined && COMPANIONS.some(companion => companion.id === item.companionId && companion.rarity === item.rarity);
    if (!isGear && !isQuote && !isCompanion) return false;
    const level = sourceLevel(item.crateId);
    const crate = level === null ? CRATES.find(crate => crate.id === item.crateId) : levelCrate(level);
    if (!crate || crate.odds[item.rarity as Rarity] <= 0 || (level !== null && !isGear)) return false;
    ids.add(item.id);
    items.set(item.id, item as InventoryItem);
  }
  const purchased = new Set<string>(), sold = new Set<string>(), levelClaims = new Set<number>();
  for (const transaction of value.transactions) {
    if (!record(transaction) || !id(transaction.id) || ids.has(transaction.id) || typeof transaction.itemId !== 'string' || !date(transaction.createdAt) || !Number.isSafeInteger(transaction.amount) || (transaction.testFunded!==undefined&&typeof transaction.testFunded!=='boolean')) return false;
    ids.add(transaction.id);
    const item = items.get(transaction.itemId);
    if (!item || Date.parse(transaction.createdAt) < Date.parse(item.acquiredAt)) return false;
    if (transaction.kind === 'crate') {
      const crate = CRATES.find(crate => crate.id === item.crateId);
      if (purchased.has(item.id) || !crate || transaction.amount !== -crate.cost || transaction.sourceLevel !== undefined) return false;
      purchased.add(item.id);
    } else if (transaction.kind === 'level-crate') {
      const level = sourceLevel(item.crateId);
      if (level === null || transaction.amount !== 0 || transaction.sourceLevel !== level || levelClaims.has(level) || purchased.has(item.id) || transaction.testFunded) return false;
      levelClaims.add(level); purchased.add(item.id);
    } else if (transaction.kind === 'sale') {
      const purchase=value.transactions.find(candidate=>record(candidate)&&(candidate.kind==='crate'||candidate.kind==='level-crate')&&candidate.itemId===item.id) as GameTransaction|undefined;
      if(Boolean(transaction.testFunded)!==Boolean(purchase?.testFunded))return false;
      if (!purchased.has(item.id) || sold.has(item.id) || !item.sold || transaction.amount !== RARITIES[item.rarity].sellValue || transaction.sourceLevel !== undefined) return false;
      sold.add(item.id);
    } else return false;
  }
  if (![...items.values()].every(item => purchased.has(item.id) && sold.has(item.id) === item.sold) ||
    (value.equippedQuoteId !== null && ![...items.values()].some(item => item.quoteId === value.equippedQuoteId))) return false;
  if (value.equippedGear !== undefined) {
    if (!record(value.equippedGear)) return false;
    for (const [slot, itemId] of Object.entries(value.equippedGear)) {
      if (!Object.prototype.hasOwnProperty.call(GEAR_SLOTS, slot) || typeof itemId !== 'string') return false;
      const item = items.get(itemId);
      if (!item || item.sold || !GEAR.some(gear => gear.id === item.gearId && gear.slot === slot)) return false;
    }
  }
  if (value.pendingOpening !== undefined && value.pendingOpening !== null) {
    const pending = value.pendingOpening;
    if (!record(pending) || typeof pending.itemId !== 'string' || !date(pending.startedAt) || !['spinning', 'rarity', 'revealing'].includes(pending.stage as string)) return false;
    const item = items.get(pending.itemId);
    if (!item || item.sold || Date.parse(pending.startedAt) < Date.parse(item.acquiredAt)) return false;
    if (pending.stage === 'revealing' && (!date(pending.revealStartedAt) || Date.parse(pending.revealStartedAt) < Date.parse(pending.startedAt) + SPIN_DURATION_MS)) return false;
    if (pending.stage !== 'revealing' && pending.revealStartedAt !== undefined) return false;
    if (record(value.equippedGear) && Object.values(value.equippedGear).includes(item.id)) return false;
    if (item.quoteId && value.equippedQuoteId === item.quoteId) {
      // A duplicate quote may already be equipped through an earlier owned card.
      if (![...items.values()].some(candidate => candidate.id !== item.id && candidate.quoteId === item.quoteId)) return false;
    }
  }
  const revealedGear = new Set([...items.values()].filter(item => item.id !== (record(value.pendingOpening) ? value.pendingOpening.itemId : null) && item.gearId).map(item => item.gearId));
  if (value.cosmeticGear !== undefined) {
    if (!record(value.cosmeticGear)) return false;
    for (const [slot, gearId] of Object.entries(value.cosmeticGear)) if (typeof gearId !== 'string' || !revealedGear.has(gearId) || !GEAR.some(gear => gear.id === gearId && gear.slot === slot)) return false;
  }
  if (value.equippedCompanionId !== undefined && value.equippedCompanionId !== null && (typeof value.equippedCompanionId !== 'string' || ![...items.values()].some(item => item.id !== (record(value.pendingOpening) ? value.pendingOpening.itemId : null) && item.companionId === value.equippedCompanionId))) return false;
  if (value.activeAbilityId !== undefined && value.activeAbilityId !== null && (typeof value.activeAbilityId !== 'string' || !revealedGear.has(value.activeAbilityId) || !getAbilityDefinition(value.activeAbilityId))) return false;
  if (value.abilityUses !== undefined && (!Array.isArray(value.abilityUses) || value.abilityUses.length > 100000)) return false;
  if (!validateAbilityChargeHistory([...items.values()], (value.abilityUses ?? []) as AbilityUse[], record(value.pendingOpening) ? value.pendingOpening.itemId as string : null, value.abilityChargeVersion, value.legacyAbilityUseIds)) return false;
  if (value.missionRewards !== undefined && !validMissionRewards(value.missionRewards)) return false;
  return true;
}

export function normalizeGame(value?: unknown): GameState {
  if (!record(value)) return baseGame();
  const candidate = { ...baseGame(), ...value };
  if (value.cosmeticGear === undefined && record(value.equippedGear) && Array.isArray(value.inventory)) {
    const inventory = value.inventory;
    candidate.cosmeticGear = Object.fromEntries(Object.entries(value.equippedGear).flatMap(([slot, itemId]) => {
      const item = inventory.find((entry: unknown) => record(entry) && entry.id === itemId) as InventoryItem | undefined;
      return item?.gearId ? [[slot, item.gearId]] : [];
    }));
  }
  if (value.abilityChargeVersion === undefined) {
    delete candidate.abilityChargeVersion;
    if (!isGameState(candidate)) return baseGame();
    const legacy = getLegacyAbilityUseIds(candidate.inventory, candidate.abilityUses ?? [], candidate.pendingOpening?.itemId);
    if (legacy === null) return baseGame();
    candidate.abilityChargeVersion = 1;
    if (legacy.length) candidate.legacyAbilityUseIds = legacy;
  }
  return isGameState(candidate) ? structuredClone(candidate) : baseGame();
}

export function gameProgress(game: GameState, history: Workout[], profile?: AthleteProfile) {
  const progress = rewardProgress(history, profile), objectiveXp = missionRewardXp(game);
  return { ...progress, ...levelProgress(progress.xp + objectiveXp), objectiveXp };
}

export function awardMissionRewards(game: GameState, history: Workout[], day: string, changedDate?: string): GameState {
  return isGameState(game) ? awardObjectiveMissions(game, history, day, changedDate) : game;
}

/** Deleted sessions can remove unspent earning power, never make the displayed balance negative. */
export function gameCreditStatus(game: GameState, history: Workout[], profile?: AthleteProfile, testAllowance=TEST_CREDITS) {
  const unique = new Set<string>();
  const abilityCredits = history.reduce((sum, workout) => {
    if (workout.status !== 'finished' || unique.has(workout.id) || !isAbilityUse(workout.abilityReward) || workout.abilityReward.workoutId !== workout.id || workout.abilityReward.abilityId !== workout.abilityId ||
      !workout.exercises.some(exercise => exercise.sets.some(set => set.confirmed && validSet(set, exercise.mode))) ||
      !(game.abilityUses ?? []).some(use => use.workoutId === workout.id && use.abilityId === workout.abilityReward!.abilityId && use.bonusCredits === workout.abilityReward!.bonusCredits)) return sum;
    unique.add(workout.id); return sum + workout.abilityReward.bonusCredits;
  }, 0);
  const rawEarned=100+Math.floor(gameProgress(game,history,profile).xp/5)+abilityCredits+game.transactions.filter(transaction=>!transaction.testFunded).reduce((sum,transaction)=>sum+transaction.amount,0);
  const earned=Math.max(0,rawEarned);
  const testing=testAllowance>0?testAllowance+game.transactions.filter(transaction=>transaction.testFunded).reduce((sum,transaction)=>sum+transaction.amount,0):0;
  return { balance: Math.max(0,earned+testing), earnedBalance: earned, deficit: Math.max(0,-rawEarned), testingBalance: testing };
}

export function gameBalance(game: GameState, history: Workout[], profile?: AthleteProfile, testAllowance=TEST_CREDITS): number {
  return gameCreditStatus(game, history, profile, testAllowance).balance;
}

/** Preview the existing recalculation policy before deleting activity; never rewrites the ledger. */
export function activityEconomyAdjustment(game: GameState, before: Workout[], after: Workout[], profile?: AthleteProfile) {
  const previous = gameCreditStatus(game, before, profile), next = gameCreditStatus(game, after, profile);
  return { xpDelta: gameProgress(game, after, profile).xp - gameProgress(game, before, profile).xp,
    balanceDelta: next.balance - previous.balance, deficitBefore: previous.deficit, deficitAfter: next.deficit };
}

function randomUnit(): number {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0] / 4294967296;
}

export function rarityForRoll(crate: Pick<Crate, 'odds'>, roll: number): Rarity {
  let accumulated = 0;
  for (const rarity of Object.keys(RARITIES) as Rarity[]) {
    accumulated += crate.odds[rarity];
    if (roll * 100 < accumulated) return rarity;
  }
  return 'legendary';
}

/** Quotes never repeat; a completed quote rarity converts its 25% share to gear. */
export function rewardForRoll(rarity: Rarity, kindRoll: number, itemRoll: number, forceGear = false, inventory: readonly InventoryItem[] = [], choice: RewardChoice = {}): ItemDefinition {
  const gearPool = () => {
    const sameRarity = GEAR.filter(candidate => candidate.rarity === rarity);
    const chosenSlot = forceGear && choice.gearSlot ? sameRarity.filter(candidate => candidate.slot === choice.gearSlot) : [];
    return (chosenSlot.length ? chosenSlot : sameRarity).map(candidate => ({ ...candidate, kind: 'gear' as const }));
  };
  let pool: ItemDefinition[];
  if (forceGear || kindRoll < GEAR_DROP_CHANCE) {
    pool = gearPool();
  } else if (kindRoll < GEAR_DROP_CHANCE + QUOTE_DROP_CHANCE) {
    // Includes historical sales, legacy cards and reserved prizes: once obtained,
    // a quote stays out of the draw after reloading or restoring a saved game.
    const obtained = new Set(inventory.map(item => item.quoteId));
    pool = QUOTES.filter(candidate => candidate.rarity === rarity && !obtained.has(candidate.id))
      .map(candidate => ({ id: candidate.id, name: 'Frase motivacional', description: candidate.text, rarity: candidate.rarity, kind: 'quote' as const }));
    if (!pool.length) pool = gearPool();
  } else {
    pool = COMPANIONS.filter(candidate => candidate.rarity === rarity).map(candidate => ({ ...candidate, kind: 'companion' as const }));
    if (choice.avoidCompanionDuplicates) {
      const fresh = pool.filter(candidate => !inventory.some(item => item.companionId === candidate.id));
      pool = fresh.length ? fresh : gearPool();
    }
  }
  return pool[Math.min(pool.length - 1, Math.max(0, Math.floor(itemRoll * pool.length)))];
}

function openReward(game: GameState, crateId: string, rarity: Rarity, transaction: { kind: 'crate'; amount: number } | { kind: 'level-crate'; amount: 0; sourceLevel: number }, choice: RewardChoice = {}) {
  const definition = rewardForRoll(rarity, randomUnit(), randomUnit(), transaction.kind === 'level-crate', game.inventory, choice);
  const now = new Date(Date.now()).toISOString();
  const item: InventoryItem = { id: crypto.randomUUID(), kind: definition.kind,
    ...(definition.kind === 'gear' ? { gearId: definition.id } : definition.kind === 'companion' ? { companionId: definition.id } : { quoteId: definition.id }),
    rarity, acquiredAt: now, crateId, sold: false };
  return { item, game: { ...game, inventory: [...game.inventory, item],
    transactions: [...game.transactions, { id: crypto.randomUUID(), ...transaction, ...(transaction.kind==='crate'&&TEST_CREDITS>0?{testFunded:true}:{}), itemId: item.id, createdAt: now }],
    pendingOpening: { itemId: item.id, startedAt: now, stage: 'spinning' as const } } };
}

/** Cost, hidden prize and recovery state commit together, before the roulette starts. */
export function openCrate(game: GameState, history: Workout[], crateId: string, profile?: AthleteProfile, choice: RewardChoice = {}): { game: GameState; item: InventoryItem } | null {
  const crate = CRATES.find(candidate => candidate.id === crateId);
  if (!crate || !isGameState(game) || game.pendingOpening || gameBalance(game, history, profile) < crate.cost) return null;
  const rarity = rarityForRoll(crate, randomUnit());
  return openReward(game, crate.id, rarity, { kind: 'crate', amount: -crate.cost }, choice);
}

export function openLevelCrate(game: GameState, history: Workout[], level: number, profile?: AthleteProfile, choice: RewardChoice = {}): { game: GameState; item: InventoryItem } | null {
  if (!isGameState(game) || game.pendingOpening || !Number.isInteger(level) || level < 2 || level > 9999 || level > gameProgress(game, history, profile).level ||
    game.transactions.some(transaction => transaction.kind === 'level-crate' && transaction.sourceLevel === level)) return null;
  const crate = levelCrate(level);
  return openReward(game, crate.id, rarityForRoll(crate, randomUnit()), { kind: 'level-crate', amount: 0, sourceLevel: level }, choice);
}

/** The prize stays hidden until both stages have finished, including after a reload. */
export function setOpeningStage(game: GameState, stage: 'rarity' | 'revealing'): GameState {
  const pending = game.pendingOpening;
  if (!pending || !isGameState(game) || Date.now() - Date.parse(pending.startedAt) < SPIN_DURATION_MS) return game;
  if (stage === 'rarity' && pending.stage === 'spinning') return { ...game, pendingOpening: { ...pending, stage } };
  if (stage === 'revealing' && (pending.stage === 'spinning' || pending.stage === 'rarity')) return { ...game, pendingOpening: { ...pending, stage, revealStartedAt: new Date(Date.now()).toISOString() } };
  return game;
}

export function completeOpening(game: GameState): GameState {
  const pending = game.pendingOpening;
  if (!pending || !isGameState(game) || pending.stage !== 'revealing' || !pending.revealStartedAt || Date.now() - Date.parse(pending.revealStartedAt) < REVEAL_DURATION_MS) return game;
  return { ...game, pendingOpening: null };
}

/** A static/quick reveal changes presentation only: the original debit and prize stay intact. */
export function revealReservedOpening(game: GameState): GameState {
  return game.pendingOpening && isGameState(game) ? { ...game, pendingOpening: null } : game;
}

/** Items cannot be sold. Keep the old entry point harmless for existing callers. */
export function sellItem(game: GameState, _itemId: string): GameState {
  return game;
}

export function equipItem(game: GameState, itemId: string | null): GameState {
  if (itemId === null) return { ...game, equippedQuoteId: null };
  // Old sales remain in the ledger; obtaining a quote permanently unlocks its motto.
  const item = game.inventory.find(candidate => candidate.id === itemId);
  return item?.quoteId && game.pendingOpening?.itemId !== item.id ? { ...game, equippedQuoteId: item.quoteId } : game;
}

export function equipGearItem(game: GameState, itemId: string | null, slot?: GearSlot): GameState {
  if (itemId === null) return slot ? unequipGear(game, slot) : game;
  if (!isGameState(game) || game.pendingOpening?.itemId === itemId) return game;
  const item = game.inventory.find(candidate => candidate.id === itemId && !candidate.sold);
  const definition = item?.gearId ? GEAR.find(gear => gear.id === item.gearId) : undefined;
  if (!definition || (slot && slot !== definition.slot)) return game;
  return { ...game, equippedGear: { ...game.equippedGear, [definition.slot]: itemId }, cosmeticGear: { ...normalizeGame(game).cosmeticGear, [definition.slot]: definition.id } };
}

export function unequipGear(game: GameState, slot: GearSlot): GameState {
  if (!game.equippedGear?.[slot] && !game.cosmeticGear?.[slot]) return game;
  const equippedGear = { ...game.equippedGear };
  const cosmeticGear = { ...normalizeGame(game).cosmeticGear };
  delete equippedGear[slot];
  delete cosmeticGear[slot];
  return { ...game, equippedGear, cosmeticGear };
}

/** Revealing a copy permanently unlocks its appearance, even if the copy is sold. */
export function unlockedGear(game: GameState) {
  const unlocked = new Set(game.inventory.filter(item => item.id !== game.pendingOpening?.itemId && item.gearId).map(item => item.gearId));
  return GEAR.filter(gear => unlocked.has(gear.id));
}
export function unlockedCompanions(game: GameState): Companion[] {
  const unlocked = new Set(game.inventory.filter(item => item.id !== game.pendingOpening?.itemId && item.companionId).map(item => item.companionId));
  return COMPANIONS.filter(companion => unlocked.has(companion.id));
}
export function unlockedQuotes(game: GameState): Quote[] {
  const obtained = new Set(game.inventory.filter(item => item.id !== game.pendingOpening?.itemId).map(item => item.quoteId));
  return QUOTES.filter(quote => obtained.has(quote.id));
}
export function equipCosmetic(game: GameState, gearId: string | null, slot?: GearSlot): GameState {
  if (!isGameState(game)) return game;
  if (gearId === null) {
    if (!slot) return game;
    const cosmeticGear = { ...normalizeGame(game).cosmeticGear };
    const equippedGear = { ...game.equippedGear };
    delete cosmeticGear[slot]; delete equippedGear[slot];
    return { ...game, cosmeticGear, equippedGear };
  }
  const gear = unlockedGear(game).find(candidate => candidate.id === gearId);
  if (!gear || (slot && slot !== gear.slot)) return game;
  return { ...game, cosmeticGear: { ...normalizeGame(game).cosmeticGear, [gear.slot]: gear.id } };
}
export function equipCompanion(game: GameState, companionId: string | null): GameState {
  if (!isGameState(game) || (companionId !== null && !unlockedCompanions(game).some(companion => companion.id === companionId))) return game;
  return { ...game, equippedCompanionId: companionId };
}
export function getAbilityCharges(game: GameState, abilityId: string): number {
  return getAvailableAbilityCharges(game, abilityId);
}
export function setActiveAbility(game: GameState, abilityId: string | null): GameState {
  if (!isGameState(game) || (abilityId !== null && getAbilityCharges(game, abilityId) <= 0)) return game;
  return { ...game, activeAbilityId: abilityId };
}

/** A completion atomically records one charge and a frozen reward, never current outfit state. */
export function applyWorkoutAbility(game: GameState, workout: Workout, history: Workout[], profile?: AthleteProfile): { game: GameState; workout: Workout; reward: AbilityUse | null } {
  if (workout.status !== 'finished' || !isGameState(game)) return { game, workout, reward: null };
  const existing = (game.abilityUses ?? []).find(use => use.workoutId === workout.id);
  if (existing) return { game, workout: { ...workout, abilityId: existing.abilityId, abilityReward: existing }, reward: existing };
  const ability = getAbilityDefinition(workout.abilityId);
  if (!ability || getAbilityCharges(game, ability.id) <= 0) return { game, workout, reward: null };
  const bare: Workout = { ...workout, abilityReward: undefined };
  const index = rewardSetIndex([...history.filter(previous => previous.id !== workout.id), bare], profile);
  const eligible = workout.exercises.flatMap(exercise => abilityMatches(ability, exercise)
    ? exercise.sets.filter(set => set.confirmed && validSet(set, exercise.mode)).map(set => ({ set, xp: index.get(set.id)?.xp ?? 0 })) : []);
  const setBonuses: Record<string, number> = {};
  let bonusXp = 0;
  if (ability.target !== 'credits') for (const { set, xp } of eligible) {
    if (!xp || setBonuses[set.id] !== undefined || bonusXp >= ability.maxXp) continue;
    const bonus = Math.min(ability.maxXp - bonusXp, Math.max(1, Math.round(xp * ability.percent / 100)));
    setBonuses[set.id] = bonus; bonusXp += bonus;
  }
  const bonusCredits = ability.target === 'credits' && eligible.length > 0 ? ability.credits : 0;
  if (!bonusXp && !bonusCredits) return { game, workout, reward: null };
  const latestSource = Math.max(...game.inventory.filter(item => item.gearId === ability.id && item.id !== game.pendingOpening?.itemId).map(item => Date.parse(item.acquiredAt)));
  const reward: AbilityUse = { workoutId: workout.id, abilityId: ability.id, bonusXp, bonusCredits, setBonuses, awardedAt: new Date(Math.max(Date.now(), latestSource)).toISOString() };
  const uses = [...(game.abilityUses ?? []), reward];
  const nextGame = { ...game, abilityUses: uses };
  if (nextGame.activeAbilityId === ability.id && getAbilityCharges(nextGame, ability.id) === 0) nextGame.activeAbilityId = null;
  return { game: nextGame, workout: { ...workout, abilityReward: reward }, reward };
}

export function getDailyQuote(day: string): string {
  const ordinal = isCivilDate(day) ? Math.floor(Date.parse(`${day}T12:00:00Z`) / 86400000) : 0;
  return QUOTES[((ordinal % QUOTES.length) + QUOTES.length) % QUOTES.length].text;
}

export type { Mission } from './objectives';
export type Achievement = Mission & { icon: string };
const mission = (id: string, title: string, description: string, current: number, target: number, unit: string): Mission => ({ id, title, description, current, target, complete: current >= target, unit, xp: 0, scope: 'career', rewarded: false });

export function getMissions(history: Workout[], day: string, game: GameState, _profile?: AthleteProfile): Mission[] {
  return getObjectiveMissions(history, day, game);
}

export function getAchievements(history: Workout[], profile?: AthleteProfile, game?: GameState): Achievement[] {
  const progress = game ? gameProgress(game, history, profile) : rewardProgress(history, profile);
  const sessions = history.filter(workout => workout.status === 'finished');
  const groups = new Set(sessions.flatMap(workout => workout.exercises.filter(exercise => exercise.sets.some(set => set.confirmed && validSet(set, exercise.mode))).map(exercise => exercise.group))).size;
  return [
    { ...mission('first', 'El primer paso', 'Termina tu primer entrenamiento.', progress.workouts, 1, 'sesión'), icon: 'flag' },
    { ...mission('ten', 'Ya es un hábito', 'Completa diez sesiones.', progress.workouts, 10, 'sesiones'), icon: 'flame' },
    { ...mission('hundred', 'Club de las 100', 'Confirma cien series válidas.', progress.sets, 100, 'series'), icon: 'dumbbell' },
    { ...mission('balanced', 'Cuerpo completo', 'Entrena los siete grupos principales.', groups, 7, 'grupos'), icon: 'activity' },
    { ...mission('level-five', 'En otra liga', 'Alcanza el nivel cinco.', progress.level, 5, 'nivel'), icon: 'trophy' },
    { ...mission('fifty', 'Constancia de hierro', 'Completa cincuenta entrenamientos.', progress.workouts, 50, 'sesiones'), icon: 'crown' },
  ];
}
