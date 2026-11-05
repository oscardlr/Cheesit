import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { MASTER_CRATE_ID, revealReservedOpening, normalizeGame, isGameState, gameBalance, openCrate, sellItem, equipItem, equipGearItem, equipCompanion, unequipGear, getItemDefinition, itemLabel, getLevelCrates, openLevelCrate, levelCrate, rewardForRoll, setOpeningStage, completeOpening, SPIN_DURATION_MS, REVEAL_DURATION_MS, getDailyQuote, getMissions, CRATES, QUOTES, RARITIES, rarityForRoll, type GameState, type InventoryItem } from '../src/lib/game';
import { GEAR } from '../src/lib/gear';
import { rewardProgress } from '../src/lib/rewards';
import { createBackup, previewBackup } from '../src/lib/backup';
import { muscleActivity } from '../src/lib/muscles';
import type { AppData, Workout, WorkoutExercise } from '../src/lib/model';
import { legacySaleSnapshot } from './fixtures/legacy-sale';

const exercise = (exerciseId: string, group = 'Pecho', count = 1): WorkoutExercise => ({ id: crypto.randomUUID(), exerciseId, group, name: 'Ejercicio', mode: 'external_load_reps', sets: Array.from({ length: count }, () => ({ id: crypto.randomUUID(), weight: 50, reps: 8, confirmed: true })) });
const workout = (exercises: WorkoutExercise[], date = '2026-10-27', status: Workout['status'] = 'finished'): Workout => ({ id: crypto.randomUUID(), date, status, name: 'Sesión', color: '#0057C2', createdAt: `${date}T12:00:00Z`, updatedAt: `${date}T12:00:00Z`, exercises });
const data = (game?: AppData['game']): AppData => ({ routines: [], customExercises: [], workouts: [], ...(game ? { game } : {}) });
function reveal(game: GameState): GameState {
  if (!game.pendingOpening) return game;
  const start = Date.parse(game.pendingOpening.startedAt);
  const clock = mock.method(Date, 'now', () => start + SPIN_DURATION_MS);
  try {
    const opening = setOpeningStage(game, 'revealing');
    clock.mock.mockImplementation(() => start + SPIN_DURATION_MS + REVEAL_DURATION_MS);
    return completeOpening(opening);
  } finally { clock.mock.restore(); }
}
function revealedCrate(game: GameState, history: Workout[], crateId: string) {
  const result = openCrate(game, history, crateId)!;
  return { ...result, game: reveal(result.game) };
}

test('master crate rolls 25/50/25, debits exactly 1000 and reserves one catalog item', () => {
  const crate = CRATES.find(crate => crate.id === MASTER_CRATE_ID)!;
  assert.equal(crate.cost, 1000);
  const distribution = { common: 0, rare: 0, epic: 0, legendary: 0 };
  for (let roll = 0; roll < 10000; roll++) distribution[rarityForRoll(crate, roll / 10000)]++;
  assert.deepEqual(distribution, { common: 0, rare: 2500, epic: 5000, legendary: 2500 });

  const grant = { season: '2026', xp: 0, credits: 900, grantedAt: '2026-11-01T12:00:00Z', charges: {} };
  assert.equal(openCrate({ ...normalizeGame(), arcadeGrant: { ...grant, credits: 899 } }, [], crate.id), null);
  for (const [roll, rarity] of [[0, 'rare'], [0.25, 'epic'], [0.75, 'legendary']] as const) {
    const random = mock.method(crypto, 'getRandomValues', (bytes: Uint32Array) => {
      bytes[0] = roll * 2 ** 32;
      return bytes;
    });
    try {
      const result = openCrate({ ...normalizeGame(), arcadeGrant: grant }, [], crate.id)!;
      assert.equal(result.item.rarity, rarity);
      assert.equal(getItemDefinition(result.item)?.rarity, rarity);
      assert.equal(result.game.inventory.length, 1);
      assert.equal(result.game.transactions.length, 1);
      assert.equal(result.game.transactions[0].amount, -1000);
      assert.equal(result.game.transactions[0].itemId, result.item.id);
      assert.equal(gameBalance(result.game, []), 0);
      const reloaded = normalizeGame(JSON.parse(JSON.stringify(result.game)));
      assert.equal(reloaded.pendingOpening?.itemId, result.item.id);
      assert.equal(openCrate(reloaded, [], crate.id), null);
      const revealed = revealReservedOpening(reloaded);
      assert.equal(revealReservedOpening(revealed), revealed);
      assert.deepEqual(revealed.inventory, result.game.inventory);
      assert.deepEqual(revealed.transactions, result.game.transactions);
    } finally {
      random.mock.restore();
    }
  }
});

test('opening spends and awards atomically; blocked sales and reloading preserve the item and balance', () => {
  const original = normalizeGame();
  assert.equal(gameBalance(original, []), 100);
  const opened = revealedCrate(original, [], CRATES[0].id);
  assert.ok(opened);
  assert.ok(isGameState(opened.game));
  assert.equal(opened.game.inventory.length, 1);
  assert.equal(original.inventory.length, 0);
  assert.equal(gameBalance(opened.game, []), 0);
  assert.equal(openCrate(opened.game, [], CRATES[0].id), null);
  assert.equal(openCrate(original, [], 'missing'), null);
  const equipped = opened.item.gearId ? equipGearItem(opened.game, opened.item.id) : opened.item.companionId ? equipCompanion(opened.game, opened.item.companionId) : equipItem(opened.game, opened.item.id);
  if (opened.item.gearId) assert.equal(equipped.equippedGear?.[GEAR.find(gear => gear.id === opened.item.gearId)!.slot], opened.item.id);
  else if (opened.item.companionId) assert.equal(equipped.equippedCompanionId, opened.item.companionId);
  else assert.equal(equipped.equippedQuoteId, opened.item.quoteId);
  assert.strictEqual(sellItem(equipped, opened.item.id), equipped);
  assert.equal(gameBalance(equipped, []), 0);
  assert.deepEqual(normalizeGame(JSON.parse(JSON.stringify(equipped))), equipped);
});

test('no reward kind or rarity can be sold, including duplicate copies after reload and backup restore', () => {
  const acquiredAt = new Date().toISOString();
  for (const rarity of Object.keys(RARITIES) as (keyof typeof RARITIES)[]) {
    for (const kindRoll of [0, .55, .8]) {
      const definition = rewardForRoll(rarity, kindRoll, 0);
      const item: InventoryItem = { id: crypto.randomUUID(), kind: definition.kind, rarity, acquiredAt, crateId: 'starter', sold: false,
        ...(definition.kind === 'gear' ? { gearId: definition.id } : definition.kind === 'companion' ? { companionId: definition.id } : { quoteId: definition.id }) };
      const inventory = [item, { ...item, id: crypto.randomUUID() }];
      let game: GameState = { ...normalizeGame(), inventory, transactions: inventory.map(copy => ({ id: crypto.randomUUID(), kind: 'crate', itemId: copy.id, amount: -100, createdAt: acquiredAt })) };
      game = item.gearId ? equipGearItem(game, item.id) : item.companionId ? equipCompanion(game, item.companionId) : equipItem(game, item.id);
      assert.ok(isGameState(game));
      const snapshot = structuredClone(game);
      const balance = gameBalance(game, [], undefined, 0);
      for (const copy of inventory) assert.strictEqual(sellItem(game, copy.id), game);
      assert.strictEqual(sellItem(game, crypto.randomUUID()), game);
      assert.deepEqual(game, snapshot);
      assert.equal(gameBalance(game, [], undefined, 0), balance);
      const reloaded = normalizeGame(JSON.parse(JSON.stringify(game)));
      assert.strictEqual(sellItem(reloaded, item.id), reloaded);
      assert.deepEqual(reloaded, snapshot);
      const restored = previewBackup(createBackup(data(reloaded)), data()).merged.game!;
      assert.strictEqual(sellItem(restored, item.id), restored);
      assert.deepEqual(restored, snapshot);
    }
  }
});

test('credit balance follows valid XP and historical deletion cannot expose a negative balance', () => {
  const history = [workout([exercise('press-banca-barra', 'Pecho', 30)], '2026-10-27', 'draft')];
  const game = normalizeGame();
  const initialBalance = 100 + Math.floor(rewardProgress(history).xp / 5);
  assert.equal(gameBalance(game, history), initialBalance);
  const opened = revealedCrate(game, history, 'charged');
  assert.equal(gameBalance(opened.game, history), initialBalance - 250);
  history[0].status = 'deleted';
  assert.equal(gameBalance(opened.game, history), 0);
  assert.equal(openCrate(opened.game, history, 'starter'), null);
  assert.equal(gameBalance(normalizeGame(JSON.parse(JSON.stringify(opened.game))), []), 0);
  const futureEarnings = workout([exercise('press-banca-barra', 'Pecho', 1)], '2026-10-27', 'draft');
  assert.equal(gameBalance(opened.game, [...history, futureEarnings]), 0);
  futureEarnings.exercises[0].sets = exercise('press-banca-barra', 'Pecho', 16).sets;
  assert.equal(gameBalance(opened.game, [...history, futureEarnings]), Math.max(0, -150 + Math.floor(rewardProgress([futureEarnings]).xp / 5)));
  history[0].status = 'draft';
  assert.equal(gameBalance(opened.game, history), initialBalance - 250);
});

test('rarity boundaries and visible probabilities agree, and daily motivation is stable', () => {
  for (const crate of CRATES) assert.equal(Object.values(crate.odds).reduce((sum, odds) => sum + odds, 0), 100);
  assert.equal(rarityForRoll(CRATES[0], 0), 'common');
  assert.equal(rarityForRoll(CRATES[0], 0.7), 'rare');
  assert.equal(rarityForRoll(CRATES[0], 0.93), 'epic');
  assert.equal(rarityForRoll(CRATES[0], 0.99), 'legendary');
  assert.equal(rarityForRoll(CRATES[2], 0), 'rare');
  assert.equal(getDailyQuote('2026-10-27'), getDailyQuote('2026-10-27'));
  assert.notEqual(getDailyQuote('2026-10-27'), getDailyQuote('2026-10-28'));
  assert.ok(QUOTES.some(quote => quote.text === getDailyQuote('2026-10-27')));
});

test('missions use finished activity and count distinct days while the body map uses finished workouts', () => {
  const history = [workout([exercise('press-banca-barra')], '2026-11-02'), workout([exercise('press-banca-barra')], '2026-11-02'),
    workout([exercise('curl-barra', 'Bíceps')], '2026-11-02', 'draft'),
    workout([exercise('sentadilla-barra', 'Pierna y glúteo')], '2026-11-01')];
  const missions = getMissions(history, '2026-11-03', normalizeGame());
  assert.equal(missions[0].current, 1);
  assert.equal(missions[1].current, 2);
  const muscles = muscleActivity(history, '2026-11-03');
  assert.equal(muscles.find(muscle => muscle.id === 'chest')!.sets, 2);
  assert.equal(muscles.find(muscle => muscle.id === 'triceps')!.secondarySets, 2);
  assert.equal(muscles.find(muscle => muscle.id === 'triceps')!.weightedSets, 1);
  assert.equal(muscles.find(muscle => muscle.id === 'biceps')!.sets, 0);
  assert.equal(muscles.find(muscle => muscle.id === 'quads')!.weightedSets, 1);
  const custom = muscleActivity([workout([exercise('custom', 'Pierna y glúteo')], '2026-11-02')], '2026-11-03');
  assert.equal(custom.find(muscle => muscle.id === 'quads')!.approximate, true);
  const invalid = workout([exercise('press-banca-barra')], '2026-11-02');
  invalid.exercises[0].sets[0].confirmed = false;
  assert.ok(muscleActivity([invalid], '2026-11-03').every(muscle => muscle.weightedSets === 0));
});

test('backups preserve old data, reject fabricated ledgers and reconcile only direct economic continuations', () => {
  const original = normalizeGame();
  const opened = revealedCrate(original, [], 'starter');
  const sold = legacySaleSnapshot(opened.game, opened.item.id);
  const restored = previewBackup(createBackup(data(sold)), data());
  assert.deepEqual(restored.merged.game, sold);
  const repeated = previewBackup(createBackup(data(sold)), restored.merged);
  assert.equal(repeated.conflicts.length, 0);
  assert.deepEqual(repeated.merged.game, sold);
  assert.equal(gameBalance(repeated.merged.game!, []), gameBalance(sold, []));
  assert.equal(previewBackup(createBackup(data(opened.game)), restored.merged).merged.game!.inventory[0].sold, true);
  assert.deepEqual(previewBackup(createBackup(data()), data(sold)).merged.game, sold);
  const branch = revealedCrate(original, [], 'starter');
  assert.equal(previewBackup(createBackup(data(branch.game)), data(opened.game)).conflicts.length, 1);
  const corrupt = structuredClone(sold);
  corrupt.transactions.push({ ...corrupt.transactions[1], id: crypto.randomUUID() });
  assert.equal(isGameState(corrupt), false);
  assert.throws(() => previewBackup(createBackup(data(corrupt)), data()));
  const fabricated = structuredClone(opened.game);
  fabricated.transactions[0].amount = -1;
  assert.equal(isGameState(fabricated), false);
  assert.throws(() => previewBackup(createBackup(data(fabricated)), data()));
  const substituted = structuredClone(opened.game);
  if (opened.item.gearId) {
    const alternative = GEAR.find(gear => gear.rarity === opened.item.rarity && gear.id !== opened.item.gearId)!;
    substituted.inventory[0].gearId = alternative.id;
  } else if (opened.item.companionId) {
    substituted.inventory[0] = { ...substituted.inventory[0], kind: 'gear', gearId: GEAR.find(gear => gear.rarity === opened.item.rarity)!.id };
    delete substituted.inventory[0].companionId;
  } else substituted.inventory[0].quoteId = QUOTES.find(quote => quote.rarity === opened.item.rarity && quote.id !== opened.item.quoteId)!.id;
  assert.equal(isGameState(substituted), true);
  assert.equal(previewBackup(createBackup(data(substituted)), data(opened.game)).conflicts.length, 1);
  const orphan = { ...original, inventory: [opened.item] };
  assert.equal(isGameState(orphan), false);
  assert.throws(() => previewBackup(createBackup(data(orphan)), data()));
});

test('backups restore sound and effects preferences and accept old copies without replacing current preferences', () => {
  const incoming: AppData = { ...data(), preferences: { effects: false, sound: true } };
  const restored = previewBackup(createBackup(incoming), data());
  assert.deepEqual(restored.merged.preferences, { effects: false, sound: true });
  assert.notStrictEqual(restored.merged.preferences, incoming.preferences);
  const current: AppData = { ...data(), preferences: { effects: true, sound: false } };
  assert.deepEqual(previewBackup(createBackup(incoming), current).merged.preferences, current.preferences);
  assert.deepEqual(previewBackup(createBackup(data()), current).merged.preferences, current.preferences);
  assert.equal(previewBackup(createBackup(data()), data()).merged.preferences, undefined);
  const invalid = createBackup(data());
  assert.throws(() => previewBackup({ ...invalid, data: { ...invalid.data, preferences: { effects: true, sound: 'true' } } }, data()));
  assert.throws(() => previewBackup({ ...invalid, data: { ...invalid.data, preferences: null } }, data()));
});

test('every rarity drops only gear or a companion with stable atlas sprite IDs', () => {
  assert.equal(GEAR.filter(gear => gear.artwork !== 'forge').length, 20);
  assert.equal(GEAR.filter(gear => gear.artwork === 'forge').length, 15);
  assert.deepEqual(GEAR.filter(gear => gear.artwork !== 'forge' && (!gear.atlas || gear.atlas === 'core')).map(gear => gear.sprite).sort((left, right) => left - right), Array.from({ length: 12 }, (_, index) => index));
  assert.deepEqual(GEAR.filter(gear => gear.atlas === 'mythic').map(gear => gear.sprite).sort((left, right) => left - right), Array.from({ length: 8 }, (_, index) => index));
  for (const rarity of Object.keys(RARITIES) as (keyof typeof RARITIES)[]) {
    assert.equal(rewardForRoll(rarity, 0, 0).kind, 'gear');
    assert.equal(rewardForRoll(rarity, .54999, .99999).kind, 'gear');
    assert.equal(rewardForRoll(rarity, .55, 0).kind, 'gear');
    assert.equal(rewardForRoll(rarity, .7999, .9999).kind, 'companion');
    assert.equal(rewardForRoll(rarity, .8, .9999).kind, 'companion');
    assert.equal(rewardForRoll(rarity, .9999, .9999).kind, 'companion');
    assert.equal(rewardForRoll(rarity, .9999, .9999, true).kind, 'gear');
    assert.equal(rewardForRoll(rarity, 0, .5).rarity, rarity);
  }
});

test('pending openings enforce five seconds, automatically reveal and cannot award or sell early', () => {
  assert.equal(SPIN_DURATION_MS, 5000);
  assert.equal(REVEAL_DURATION_MS, 800);
  const clock = mock.method(Date, 'now', () => 2000000000000);
  try {
    const result = openCrate(normalizeGame(), [], 'starter')!;
    const pending = result.game;
    assert.equal(pending.pendingOpening?.stage, 'spinning');
    assert.ok(isGameState(pending));
    assert.deepEqual(normalizeGame(JSON.parse(JSON.stringify(pending))), pending);
    assert.strictEqual(setOpeningStage(pending, 'rarity'), pending);
    assert.strictEqual(setOpeningStage(pending, 'revealing'), pending);
    assert.strictEqual(completeOpening(pending), pending);
    assert.strictEqual(sellItem(pending, result.item.id), pending);
    assert.strictEqual(equipItem(pending, result.item.id), pending);
    assert.strictEqual(equipGearItem(pending, result.item.id), pending);
    assert.equal(openCrate(pending, [workout([exercise('press-banca-barra', 'Pecho', 30)])], 'starter'), null);
    clock.mock.mockImplementation(() => 2000000000000 + SPIN_DURATION_MS - 1);
    assert.strictEqual(setOpeningStage(pending, 'rarity'), pending);
    assert.strictEqual(setOpeningStage(pending, 'revealing'), pending);
    clock.mock.mockImplementation(() => 2000000000000 + SPIN_DURATION_MS);
    const rare = setOpeningStage(pending, 'rarity');
    assert.equal(rare.pendingOpening?.stage, 'rarity');
    assert.strictEqual(completeOpening(rare), rare);
    const revealing = setOpeningStage(pending, 'revealing');
    assert.equal(revealing.pendingOpening?.stage, 'revealing');
    assert.deepEqual(setOpeningStage(rare, 'revealing'), revealing);
    assert.deepEqual(normalizeGame(JSON.parse(JSON.stringify(revealing))), revealing);
    assert.strictEqual(completeOpening(revealing), revealing);
    clock.mock.mockImplementation(() => 2000000000000 + SPIN_DURATION_MS + REVEAL_DURATION_MS - 1);
    assert.strictEqual(completeOpening(revealing), revealing);
    clock.mock.mockImplementation(() => 2000000000000 + SPIN_DURATION_MS + REVEAL_DURATION_MS);
    const revealed = completeOpening(revealing);
    assert.equal(revealed.pendingOpening, null);
    assert.equal(revealed.inventory[0].id, result.item.id);
    assert.ok(isGameState(revealed));
    assert.strictEqual(sellItem(revealed, result.item.id), revealed);
    assert.equal(revealed.inventory[0].sold, false);
    const invalid = structuredClone(pending);
    invalid.pendingOpening!.itemId = crypto.randomUUID();
    assert.equal(isGameState(invalid), false);
    const earlyReveal = structuredClone(revealing);
    earlyReveal.pendingOpening!.revealStartedAt = earlyReveal.pendingOpening!.startedAt;
    assert.equal(isGameState(earlyReveal), false);
  } finally { clock.mock.restore(); }
});

test('legacy phrase inventories migrate without resetting credit movements and retires equipped quotes', () => {
  const now = new Date().toISOString(), itemId = crypto.randomUUID();
  const legacy = { inventory: [{ id: itemId, quoteId: 'show-up', rarity: 'common', acquiredAt: now, crateId: 'starter', sold: false }],
    transactions: [{ id: crypto.randomUUID(), kind: 'crate', itemId, amount: -100, createdAt: now }],
    weeklyWorkoutGoal: 4, weeklySetGoal: 42, equippedQuoteId: 'show-up' };
  assert.equal(isGameState(legacy), true);
  const migrated = normalizeGame(JSON.parse(JSON.stringify(legacy)));
  assert.equal(migrated.inventory.length, 1);
  assert.equal(migrated.transactions[0].id, legacy.transactions[0].id);
  assert.equal(migrated.equippedQuoteId, null);
  assert.deepEqual(migrated.equippedGear, {});
  assert.equal(migrated.pendingOpening, null);
  assert.equal(itemLabel(migrated.inventory[0]), QUOTES[0].text);
  assert.equal(getItemDefinition(migrated.inventory[0])?.kind, 'quote');
});

test('equipment is equipped by owned instance, replaced by slot and kept after blocked sales', () => {
  const now = new Date().toISOString();
  const inventory = ['dragon-head', 'headphones', 'titan-sword', 'violet-cape'].map(gearId => {
    const gear = GEAR.find(candidate => candidate.id === gearId)!;
    return { id: crypto.randomUUID(), kind: 'gear' as const, gearId, rarity: gear.rarity, acquiredAt: now, crateId: 'starter', sold: false };
  });
  const owned: GameState = { ...normalizeGame(), inventory, transactions: inventory.map(item => ({ id: crypto.randomUUID(), kind: 'crate' as const, itemId: item.id, amount: -100, createdAt: now })) };
  assert.ok(isGameState(owned));
  let equipped = equipGearItem(owned, inventory[0].id);
  assert.equal(equipped.equippedGear?.head, inventory[0].id);
  assert.strictEqual(equipGearItem(owned, inventory[0].id, 'hand'), owned);
  equipped = equipGearItem(equipped, inventory[1].id);
  assert.equal(equipped.equippedGear?.head, inventory[1].id);
  equipped = equipGearItem(equipped, inventory[2].id);
  const soldUnequipped = sellItem(equipped, inventory[0].id);
  assert.strictEqual(soldUnequipped, equipped);
  assert.equal(soldUnequipped.equippedGear?.head, inventory[1].id);
  const soldEquipped = sellItem(soldUnequipped, inventory[1].id);
  assert.strictEqual(soldEquipped, equipped);
  assert.equal(soldEquipped.equippedGear?.head, inventory[1].id);
  assert.equal(soldEquipped.equippedGear?.hand, inventory[2].id);
  assert.ok(isGameState(soldEquipped));
  assert.equal(unequipGear(soldEquipped, 'hand').equippedGear?.hand, undefined);
  assert.equal(equipGearItem(soldEquipped, null, 'hand').equippedGear?.hand, undefined);
  const fabricated = structuredClone(owned);
  fabricated.equippedGear = { head: crypto.randomUUID() };
  assert.equal(isGameState(fabricated), false);
});

test('every reached level has a tailored free gear crate and can be claimed only once across deletion and reload', () => {
  const history = [workout([exercise('press-banca-barra', 'Pecho', 40), exercise('curl-barra', 'Bíceps', 40)])];
  const initial = normalizeGame();
  const unlocked = getLevelCrates(initial, history);
  assert.ok(unlocked.length >= 1);
  assert.equal(unlocked[0].level, 2);
  assert.ok(unlocked[0].name.includes('nivel 2'));
  const result = openLevelCrate(initial, history, 2)!;
  assert.ok(result);
  assert.equal(result.item.kind, 'gear');
  assert.equal(result.item.crateId, 'level:2026:2');
  assert.equal(result.game.transactions[0].kind, 'level-crate');
  assert.equal(result.game.transactions[0].amount, 0);
  assert.equal(result.game.transactions[0].sourceLevel, 2);
  assert.equal(gameBalance(result.game, history), gameBalance(initial, history));
  assert.ok(isGameState(result.game));
  const revealed = reveal(result.game);
  const reloaded = normalizeGame(JSON.parse(JSON.stringify(revealed)));
  assert.equal(getLevelCrates(reloaded, history)[0].claimed, true);
  assert.equal(openLevelCrate(reloaded, history, 2), null);
  history[0].status = 'deleted';
  assert.equal(openLevelCrate(reloaded, history, 2), null);
  history[0].status = 'finished';
  assert.equal(openLevelCrate(reloaded, history, 2), null);
  assert.equal(openLevelCrate(initial, [], 2), null);
  assert.equal(openLevelCrate(initial, history, rewardProgress(history).level + 1), null);
  assert.equal(openLevelCrate(initial, history, 1), null);
  assert.equal(openLevelCrate(initial, history, 2.5), null);
  const duplicate = structuredClone(reloaded);
  const item = { ...duplicate.inventory[0], id: crypto.randomUUID() };
  duplicate.inventory.push(item);
  duplicate.transactions.push({ ...duplicate.transactions[0], id: crypto.randomUUID(), itemId: item.id });
  assert.equal(isGameState(duplicate), false);
  for (const level of [2, 3, 5, 10, 20, 99]) assert.equal(Object.values(levelCrate(level).odds).reduce((sum, value) => sum + value, 0), 100);
  assert.equal(levelCrate(5).odds.common, 0);
  assert.equal(levelCrate(10).odds.rare, 0);
  const restored = previewBackup(createBackup(data(reloaded)), data());
  assert.deepEqual(restored.merged.game, reloaded);
});

test('merging preserves a permanently obtained sold motto without exposing its hidden duplicate', () => {
  const now = new Date().toISOString();
  const oldItem = { id: crypto.randomUUID(), quoteId: 'show-up', rarity: 'common' as const, acquiredAt: now, crateId: 'starter', sold: false };
  const current: GameState = { ...normalizeGame(), inventory: [oldItem], equippedQuoteId: oldItem.quoteId,
    transactions: [{ id: crypto.randomUUID(), kind: 'crate', itemId: oldItem.id, amount: -100, createdAt: now }] };
  const sold = legacySaleSnapshot(current, oldItem.id);
  const hiddenDuplicate = { ...oldItem, id: crypto.randomUUID(), kind: 'quote' as const };
  const incoming: GameState = { ...sold, inventory: [...sold.inventory, hiddenDuplicate],
    transactions: [...sold.transactions, { id: crypto.randomUUID(), kind: 'crate', itemId: hiddenDuplicate.id, amount: -100, createdAt: now }],
    pendingOpening: { itemId: hiddenDuplicate.id, startedAt: now, stage: 'spinning' } };
  assert.ok(isGameState(current));
  assert.ok(isGameState(incoming));
  const merged = previewBackup(createBackup(data(incoming)), data(current));
  assert.equal(merged.conflicts.length, 0);
  assert.equal(merged.merged.game!.equippedQuoteId, null);
  assert.equal(merged.merged.game!.pendingOpening?.itemId, hiddenDuplicate.id);
  assert.strictEqual(equipItem(merged.merged.game!, hiddenDuplicate.id), merged.merged.game);
  const hiddenOnly:GameState={...normalizeGame(),inventory:[hiddenDuplicate],transactions:[incoming.transactions.at(-1)!],pendingOpening:incoming.pendingOpening};
  assert.ok(isGameState(hiddenOnly));
  assert.strictEqual(equipItem(hiddenOnly,hiddenDuplicate.id),hiddenOnly);
  assert.equal(hiddenOnly.equippedQuoteId,null);
  assert.equal(isGameState({...hiddenOnly,equippedQuoteId:oldItem.quoteId}),false);
});

test('backup merges retain valid equipped instances and do not resurrect sold gear or reset pending prizes', () => {
  const now = new Date().toISOString();
  const headphone = { id: crypto.randomUUID(), kind: 'gear' as const, gearId: 'headphones', rarity: 'common' as const, acquiredAt: now, crateId: 'starter', sold: false };
  const sword = { ...headphone, id: crypto.randomUUID(), gearId: 'titan-sword', rarity: 'epic' as const };
  const initial: GameState = { ...normalizeGame(), inventory: [headphone, sword], transactions: [headphone, sword].map(item => ({ id: crypto.randomUUID(), kind: 'crate' as const, itemId: item.id, amount: -100, createdAt: now })) };
  const equipped = equipGearItem(equipGearItem(initial, headphone.id), sword.id);
  const freshRestore = previewBackup(createBackup(data(equipped)), data());
  assert.equal(freshRestore.merged.game!.equippedGear?.head, headphone.id);
  assert.equal(freshRestore.merged.game!.equippedGear?.hand, sword.id);
  const sold = legacySaleSnapshot(equipped, headphone.id);
  const nextItem = { ...headphone, id: crypto.randomUUID() };
  const continued: GameState = { ...sold, inventory: [...sold.inventory, nextItem],
    transactions: [...sold.transactions, { id: crypto.randomUUID(), kind: 'crate', itemId: nextItem.id, amount: -100, createdAt: now }],
    pendingOpening: { itemId: nextItem.id, startedAt: now, stage: 'spinning' } };
  assert.ok(isGameState(continued));
  const merged = previewBackup(createBackup(data(continued)), data(equipped)).merged;
  assert.equal(merged.game!.equippedGear?.head, undefined);
  assert.equal(merged.game!.equippedGear?.hand, sword.id);
  assert.equal(merged.game!.pendingOpening?.itemId, nextItem.id);
  assert.equal(merged.game!.inventory.find(item => item.id === headphone.id)!.sold, true);
  const oldCopy = previewBackup(createBackup(data(equipped)), merged).merged;
  assert.equal(oldCopy.game!.pendingOpening?.itemId, nextItem.id);
  assert.equal(oldCopy.game!.equippedGear?.head, undefined);
  assert.equal(oldCopy.game!.equippedGear?.hand, sword.id);
  assert.equal(oldCopy.game!.inventory.find(item => item.id === headphone.id)!.sold, true);
});
