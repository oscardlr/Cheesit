import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { createBackup, previewBackup } from '../src/lib/backup';
import { COMPANIONS } from '../src/lib/companions';
import {
  completeOpening, gameBalance, isGameState, normalizeGame, openCrate, QUOTES,
  RARITIES, REVEAL_DURATION_MS, rewardForRoll, setOpeningStage, SPIN_DURATION_MS,
  type GameState, type InventoryItem, type Quote, type Rarity,
} from '../src/lib/game';
import type { AppData, Workout } from '../src/lib/model';
import { legacySaleSnapshot } from './fixtures/legacy-sale';

const rarities = Object.keys(RARITIES) as Rarity[];
const quoteRoll = .6;

function copy(quote: Quote): InventoryItem {
  return { id: crypto.randomUUID(), kind: 'quote', quoteId: quote.id, rarity: quote.rarity,
    acquiredAt: new Date().toISOString(), crateId: 'starter', sold: false };
}

function owned(inventory: InventoryItem[]): GameState {
  return { ...normalizeGame(), inventory,
    transactions: inventory.map(item => ({ id: crypto.randomUUID(), kind: 'crate',
      itemId: item.id, amount: -100, createdAt: item.acquiredAt })) };
}

const data = (game?: GameState, workouts: Workout[] = []): AppData => ({
  routines: [], customExercises: [], workouts, ...(game ? { game } : {}),
});

function reveal(game: GameState): GameState {
  const start = Date.parse(game.pendingOpening!.startedAt);
  const clock = mock.method(Date, 'now', () => start + SPIN_DURATION_MS);
  try {
    const revealing = setOpeningStage(game, 'revealing');
    clock.mock.mockImplementation(() => start + SPIN_DURATION_MS + REVEAL_DURATION_MS);
    return completeOpening(revealing);
  } finally { clock.mock.restore(); }
}

test('each rarity yields every unseen phrase once before its phrase pool is exhausted', () => {
  for (const rarity of rarities) {
    const expected = QUOTES.filter(quote => quote.rarity === rarity);
    const inventory: InventoryItem[] = [];
    for (let index = 0; index < expected.length; index++) {
      const before = structuredClone(inventory);
      const reward = rewardForRoll(rarity, quoteRoll, 0, false, inventory);
      assert.equal(reward.kind, 'quote');
      assert.equal(reward.rarity, rarity);
      assert.ok(expected.some(quote => quote.id === reward.id));
      assert.ok(!inventory.some(item => item.quoteId === reward.id), `${reward.id} must be new`);
      assert.deepEqual(inventory, before, 'choosing a reward must not mutate previous copies');
      inventory.push(copy(expected.find(quote => quote.id === reward.id)!));
    }
    assert.deepEqual(new Set(inventory.map(item => item.quoteId)), new Set(expected.map(quote => quote.id)));
    assert.equal(rewardForRoll(rarity, quoteRoll, 0, false, inventory).kind, 'gear');
  }
});

test('sold, legacy and still-hidden phrase copies all count as already obtained', () => {
  const common = QUOTES.filter(quote => quote.rarity === 'common');
  let game = owned(common.slice(0, 3).map(copy));
  delete game.inventory[0].kind; // Original saves did not record a quote kind.
  game = legacySaleSnapshot(game, game.inventory[1].id);
  const pending = game.inventory[2];
  game.pendingOpening = { itemId: pending.id, startedAt: pending.acquiredAt, stage: 'spinning' };
  assert.ok(isGameState(game));
  const snapshot = structuredClone(game);
  const remaining = common.slice(3);
  const rewards = remaining.map((_, index) => rewardForRoll('common', quoteRoll,
    (index + .5) / remaining.length, false, game.inventory));
  assert.deepEqual(new Set(rewards.map(reward => reward.id)), new Set(remaining.map(quote => quote.id)));
  assert.ok(rewards.every(reward => reward.kind === 'quote' && reward.rarity === 'common'));
  assert.deepEqual(game, snapshot);
});

test('exhausted phrase pools award gear of the rolled rarity and preserve companion and forced-gear choices', () => {
  const inventory = QUOTES.map(copy);
  for (const rarity of rarities) {
    for (const itemRoll of [0, .5, .999999]) {
      const reward = rewardForRoll(rarity, quoteRoll, itemRoll, false, inventory);
      assert.equal(reward.kind, 'gear');
      assert.equal(reward.rarity, rarity);
      assert.deepEqual(reward, rewardForRoll(rarity, 0, itemRoll));
      assert.deepEqual(rewardForRoll(rarity, quoteRoll, itemRoll, true, inventory), rewardForRoll(rarity, 0, itemRoll));
      const companion = rewardForRoll(rarity, .9, itemRoll, false, inventory);
      assert.equal(companion.kind, 'companion');
      assert.equal(companion.rarity, rarity);
      assert.ok(COMPANIONS.some(item => item.id === companion.id && item.rarity === rarity));
      assert.deepEqual(companion, rewardForRoll(rarity, .9, itemRoll));
    }
  }
});

test('real crate openings remember all acquired phrases after reload and backup without rewriting old duplicates or credit movements', () => {
  const history: Workout[] = [{ id: crypto.randomUUID(), name: 'Historial de entrenamiento',
    date: '2026-10-27', color: '#0057C2', status: 'finished',
    createdAt: '2026-10-27T12:00:00Z', updatedAt: '2026-10-27T12:00:00Z',
    exercises: Array.from({ length: 4 }, () => ({ id: crypto.randomUUID(), exerciseId: 'press-banca-barra',
      name: 'Press de banca con barra', group: 'Pecho', mode: 'external_load_reps',
      sets: Array.from({ length: 50 }, () => ({ id: crypto.randomUUID(), weight: 50, reps: 8, confirmed: true })) })) }];
  const rolls: Record<Rarity, number> = { common: .1, rare: .8, epic: .96, legendary: .995 };
  for (const rarity of rarities) {
    const missing = QUOTES.filter(quote => quote.rarity === rarity).at(-1)!;
    const inventory = QUOTES.filter(quote => quote.id !== missing.id).map(copy);
    inventory.push(copy(QUOTES[0])); // A valid historical duplicate must survive unchanged.
    delete inventory[0].kind;
    const original = legacySaleSnapshot(owned(inventory), inventory[0].id);
    assert.ok(isGameState(original));
    const reloaded = normalizeGame(JSON.parse(JSON.stringify(original)));
    assert.deepEqual(reloaded, original);
    const restored = previewBackup(createBackup(data(reloaded, history)), data()).merged;
    assert.deepEqual(restored.game, original);
    const game = restored.game!, before = structuredClone(game);
    const balance = gameBalance(game, history);
    assert.ok(balance >= 200, 'the saved training history funds both openings');
    const draws = [rolls[rarity], quoteRoll, 0, rolls[rarity], quoteRoll, 0];
    const random = mock.method(crypto, 'getRandomValues', (array: Uint32Array) => {
      assert.ok(array instanceof Uint32Array);
      assert.ok(draws.length, 'crate opening must use only its declared random draws');
      array[0] = Math.floor(draws.shift()! * 4294967296);
      return array;
    });
    try {
      const first = openCrate(game, history, 'starter');
      assert.ok(first);
      assert.equal(first.item.kind, 'quote');
      assert.equal(first.item.quoteId, missing.id);
      assert.equal(first.item.rarity, rarity);
      assert.equal(first.game.pendingOpening?.itemId, first.item.id);
      assert.equal(gameBalance(first.game, history), balance - 100);
      assert.deepEqual(first.game.inventory.slice(0, inventory.length), before.inventory);
      assert.deepEqual(first.game.transactions.slice(0, before.transactions.length), before.transactions);
      assert.equal(first.game.transactions.at(-1)?.amount, -100);
      assert.equal(openCrate(first.game, history, 'starter'), null, 'a pending opening cannot buy another prize');
      assert.deepEqual(game, before);
      const revealed = normalizeGame(JSON.parse(JSON.stringify(reveal(first.game))));
      const afterRestore = previewBackup(createBackup(data(revealed, history)), data()).merged.game!;
      const second = openCrate(afterRestore, history, 'starter');
      assert.ok(second);
      assert.equal(second.item.kind, 'gear', 'the now-complete rarity falls back to equipment');
      assert.equal(second.item.quoteId, undefined);
      assert.equal(second.item.rarity, rarity);
      assert.equal(gameBalance(second.game, history), balance - 200);
      assert.equal(second.game.inventory.length, before.inventory.length + 2);
      assert.equal(second.game.transactions.length, before.transactions.length + 2);
      assert.deepEqual(second.game.inventory.slice(0, before.inventory.length), before.inventory);
      assert.deepEqual(second.game.transactions.slice(0, before.transactions.length), before.transactions);
      assert.ok(isGameState(second.game));
      assert.equal(draws.length, 0);
    } finally { random.mock.restore(); }
  }
});
