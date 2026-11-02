import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBackup, previewBackup } from '../src/lib/backup';
import { economicXp, gameBalance, gameProgress, getLevelCrates, isGameState, normalizeGame, openLevelCrate, reconcileSeasonProgression, revealReservedOpening, type GameState, type InventoryItem } from '../src/lib/game';
import { migrateQuoteConversions, QUOTE_COMPENSATION } from '../src/lib/quote-conversion';
import { emptyData, type Workout } from '../src/lib/model';

function legacyPhraseGame(): GameState {
  const item: InventoryItem = { id: crypto.randomUUID(), kind: 'quote', quoteId: 'show-up', rarity: 'common', acquiredAt: '2025-12-01T12:00:00Z', crateId: 'starter', sold: false };
  const game: GameState = { ...normalizeGame(), inventory: [item], transactions: [{ id: crypto.randomUUID(), kind: 'crate', itemId: item.id, amount: -100, createdAt: item.acquiredAt }], equippedQuoteId: 'show-up' };
  delete game.quoteConversionVersion; delete game.quoteConversions;
  return game;
}
function training(date: string): Workout {
  return { id: crypto.randomUUID(), date, name: 'Sesión de integración', color: '#d8ff3e', status: 'finished', createdAt: `${date}T12:00:00Z`, updatedAt: `${date}T12:00:00Z`, exercises: [{ id: crypto.randomUUID(), exerciseId: 'press-banca-barra', name: 'Press de banca', mode: 'external_load_reps', group: 'Pecho', sets: Array.from({length: 20}, () => ({id: crypto.randomUUID(), weight: 50, reps: 8, confirmed: true})) }] };
}

test('season and phrase migrations commute, preserve economic XP, and remain idempotent together', () => {
  const legacy = legacyPhraseGame(), history = [training('2025-12-01')];
  assert.ok(isGameState(legacy));
  const seasonThenQuote = migrateQuoteConversions(reconcileSeasonProgression(legacy, history, undefined, '2026-11-02'));
  const quoteThenSeason = reconcileSeasonProgression(migrateQuoteConversions(legacy), history, undefined, '2026-11-02');
  assert.deepEqual(seasonThenQuote, quoteThenSeason);
  assert.deepEqual(reconcileSeasonProgression(normalizeGame(seasonThenQuote), history, undefined, '2026-11-02'), seasonThenQuote);
  assert.equal(economicXp(seasonThenQuote, history), economicXp(legacy, history));
  assert.equal(gameProgress(seasonThenQuote, history, undefined, '2026').xp, 0);
  assert.equal(seasonThenQuote.quoteConversions?.[0].amount, QUOTE_COMPENSATION.common);
  assert.deepEqual(seasonThenQuote.inventory, legacy.inventory);
});

test('a committed seasonal chest crosses January with its original reward while the next year can claim the same level', t => {
  t.mock.method(Date, 'now', () => Date.parse('2025-12-31T20:00:00Z'));
  const legacy = legacyPhraseGame(), first = training('2025-12-31');
  let game = reconcileSeasonProgression(normalizeGame(legacy), [], undefined, '2025-12-01');
  game = reconcileSeasonProgression(game, [first], undefined, '2025-12-31');
  assert.ok(getLevelCrates(game, [first], undefined, '2025').some(crate => crate.level === 2 && !crate.claimed));
  const opened = openLevelCrate(game, [first], 2, undefined, {}, '2025');
  assert.ok(opened); assert.equal(opened.item.kind, 'gear');
  const previousBalance = gameBalance(opened.game, [first], undefined, 0);
  t.mock.method(Date, 'now', () => Date.parse('2026-01-01T01:00:00Z'));
  const january = reconcileSeasonProgression(normalizeGame(opened.game), [first], undefined, '2026-01-01');
  assert.deepEqual(january.pendingOpening, opened.game.pendingOpening);
  assert.deepEqual(january.inventory, opened.game.inventory);
  assert.equal(january.transactions.at(-1)?.sourceSeason, '2025');
  assert.equal(gameBalance(january, [first], undefined, 0), previousBalance);
  assert.equal(gameProgress(january, [first]).level, 1);
  assert.equal(gameProgress(january, [first]).xp, 0);
  assert.equal(openLevelCrate(january, [first], 2, undefined, {}, '2026'), null);
  const second = training('2026-01-01'), history = [first, second];
  game = reconcileSeasonProgression(revealReservedOpening(january), history, undefined, '2026-01-01');
  const next = openLevelCrate(game, history, 2, undefined, {}, '2026');
  assert.ok(next); assert.equal(next.item.kind, 'gear');
  assert.deepEqual(next.game.transactions.filter(tx => tx.kind === 'level-crate').map(tx => tx.sourceSeason), ['2025', '2026']);
  assert.equal(next.game.quoteConversions?.length, 1);
  assert.ok(isGameState(next.game));
  const restored = previewBackup(createBackup({...emptyData(), workouts: history, game: next.game}), {...emptyData(), workouts: history, game: next.game});
  assert.deepEqual(restored.conflicts, []);
  assert.equal(gameBalance(restored.merged.game!, history, undefined, 0), gameBalance(next.game, history, undefined, 0));
  assert.equal(restored.merged.game?.quoteConversions?.length, 1);
  assert.deepEqual(restored.merged.game?.pendingOpening, next.game.pendingOpening);
});
