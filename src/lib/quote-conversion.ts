import type { GameState, InventoryItem, Rarity } from './game';

/** Below the former resale values (20/60/150/400); no XP or extra drops. */
export const QUOTE_COMPENSATION: Readonly<Record<Rarity, number>> = Object.freeze({ common: 15, rare: 40, epic: 100, legendary: 250 });
export type QuoteConversion = { itemId: string; quoteId: string; rarity: Rarity; amount: number; disposition: 'converted' | 'previously-sold' };

/** Identity is the ORIGINAL owned copy, never a reconstructed drop or a random payment ID.
 * A sold tombstone wins forever if an old client later sends an unsold snapshot. */
export function mergeQuoteConversions(...sources: readonly QuoteConversion[][]): QuoteConversion[] {
  const records = new Map<string, QuoteConversion>();
  for (const source of sources) for (const entry of source) {
    const previous = records.get(entry.itemId);
    if (!previous || entry.disposition === 'previously-sold') records.set(entry.itemId, { ...entry });
  }
  return [...records.values()].sort((a, b) => a.itemId.localeCompare(b.itemId));
}

export function migrateQuoteConversions(game: GameState): GameState {
  const copies: QuoteConversion[] = game.inventory.flatMap(item => item.quoteId ? [{
    itemId: item.id, quoteId: item.quoteId, rarity: item.rarity,
    amount: item.sold ? 0 : QUOTE_COMPENSATION[item.rarity],
    disposition: item.sold ? 'previously-sold' as const : 'converted' as const,
  }] : []);
  return { ...game, equippedQuoteId: null, quoteConversionVersion: 1,
    quoteConversions: mergeQuoteConversions(game.quoteConversions ?? [], copies) };
}

/** Discarded ledger branches keep audit tombstones, but cannot mint spendable credit.
 * A later legacy sale also suppresses compensation, preventing sale + conversion. */
export function quoteConversionAmount(game: GameState, item: InventoryItem): number {
  if (!item.quoteId || item.sold) return 0;
  const entry = game.quoteConversions?.find(record => record.itemId === item.id);
  return entry ? entry.amount : QUOTE_COMPENSATION[item.rarity];
}
export function quoteConversionCredits(game: GameState, testFunded: boolean): number {
  const purchases = new Map(game.transactions.filter(tx => tx.kind === 'crate' || tx.kind === 'level-crate').map(tx => [tx.itemId, tx]));
  const amounts = new Map(game.quoteConversions?.map(record => [record.itemId, record.amount]));
  return game.inventory.reduce((sum, item) => sum + (item.quoteId && !item.sold && Boolean(purchases.get(item.id)?.testFunded) === testFunded ? amounts.get(item.id) ?? QUOTE_COMPENSATION[item.rarity] : 0), 0);
}
export function quoteConversionNotice(game: GameState) {
  const seen = new Set(game.quoteConversionSeenIds ?? []);
  const amounts = new Map(game.quoteConversions?.map(record => [record.itemId, record.amount]));
  const copies = game.inventory.filter(item => item.quoteId && item.id !== game.pendingOpening?.itemId && !seen.has(item.id));
  return { itemIds: copies.map(item => item.id), count: copies.length, credits: copies.reduce((sum, item) => sum + (item.sold ? 0 : amounts.get(item.id) ?? QUOTE_COMPENSATION[item.rarity]), 0) };
}
export function acknowledgeQuoteConversions(game: GameState): GameState {
  return { ...game, quoteConversionSeenIds: [...new Set([...(game.quoteConversionSeenIds ?? []), ...quoteConversionNotice(game).itemIds])].sort() };
}
