import { RARITIES, type GameState } from '../../src/lib/game';

/** A saved snapshot from the former sale feature, for migration/backup coverage only. */
export function legacySaleSnapshot(game: GameState, itemId: string): GameState {
  const item = game.inventory.find(candidate => candidate.id === itemId)!;
  const inventory = game.inventory.map(candidate => candidate.id === itemId ? { ...candidate, sold: true } : candidate);
  const purchase = game.transactions.find(transaction => transaction.itemId === itemId && transaction.kind === 'crate');
  return {
    ...game,
    inventory,
    equippedGear: Object.fromEntries(Object.entries(game.equippedGear ?? {}).filter(([, equippedId]) => equippedId !== itemId)),
    equippedQuoteId: inventory.some(candidate => !candidate.sold && candidate.id !== game.pendingOpening?.itemId && candidate.quoteId === game.equippedQuoteId) ? game.equippedQuoteId : null,
    transactions: [...game.transactions, {
      id: crypto.randomUUID(), kind: 'sale', itemId, amount: RARITIES[item.rarity].sellValue,
      createdAt: item.acquiredAt, ...(purchase?.testFunded ? { testFunded: true } : {}),
    }],
  };
}
