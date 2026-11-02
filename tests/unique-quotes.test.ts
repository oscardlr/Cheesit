import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { createBackup, previewBackup } from '../src/lib/backup';
import { COMPANIONS } from '../src/lib/companions';
import { GEAR } from '../src/lib/gear';
import { completeOpening, gameBalance, gameCreditStatus, isGameState, normalizeGame, openCrate, openLevelCrate, QUOTES, RARITIES, REVEAL_DURATION_MS, rewardForRoll, rewardPools, setOpeningStage, SPIN_DURATION_MS, GEAR_DROP_CHANCE, COMPANION_DROP_CHANCE, QUOTE_DROP_CHANCE, REWARD_CATEGORY_LABEL, CRATES, type GameState, type InventoryItem, type Quote, type Rarity, type RewardChoice } from '../src/lib/game';
import { acknowledgeQuoteConversions, mergeQuoteConversions, QUOTE_COMPENSATION, quoteConversionAmount, quoteConversionNotice } from '../src/lib/quote-conversion';
import type { AppData, Workout } from '../src/lib/model';
import { legacySaleSnapshot } from './fixtures/legacy-sale';

const rarities = Object.keys(RARITIES) as Rarity[];
function copy(quote: Quote): InventoryItem {
  return { id: crypto.randomUUID(), kind: 'quote', quoteId: quote.id, rarity: quote.rarity, acquiredAt: '2026-10-27T12:00:00Z', crateId: 'starter', sold: false };
}
function owned(inventory: InventoryItem[]): GameState {
  const game = { ...normalizeGame(), inventory, transactions: inventory.map(item => ({ id: crypto.randomUUID(), kind: 'crate' as const, itemId: item.id, amount: -100, createdAt: item.acquiredAt })) };
  delete game.quoteConversionVersion; delete game.quoteConversions;
  return game;
}
const legacyBackup = (game: GameState) => ({ format: 'entrenos-local', schema_version: 1, units: 'kg', data: data(game) });
const data = (game?: GameState): AppData => ({ routines: [], customExercises: [], workouts: [], ...(game ? { game } : {}) });
const history: Workout[] = [{ id: crypto.randomUUID(), name: 'Historial', date: '2026-10-27', color: '#0057C2', status: 'finished', createdAt: '2026-10-27T12:00:00Z', updatedAt: '2026-10-27T12:00:00Z', exercises: Array.from({ length: 4 }, () => ({ id: crypto.randomUUID(), exerciseId: 'press-banca-barra', name: 'Press de banca', group: 'Pecho', mode: 'external_load_reps', sets: Array.from({ length: 50 }, () => ({ id: crypto.randomUUID(), weight: 50, reps: 8, confirmed: true })) })) }];
function fixedRolls(rolls: number[]) {
  return mock.method(crypto, 'getRandomValues', (array: Uint32Array) => { assert.ok(rolls.length); array[0] = Math.floor(rolls.shift()! * 4294967296); return array; });
}

test('exact renormalized weights and rarity boundaries agree with UI and all catalog pools', () => {
  assert.equal(GEAR_DROP_CHANCE, .55 / .75); assert.equal(COMPANION_DROP_CHANCE, .20 / .75); assert.equal(QUOTE_DROP_CHANCE, 0);
  assert.equal(REWARD_CATEGORY_LABEL, '73,33% equipo · 26,67% cheesits');
  assert.deepEqual(CRATES.map(crate => [crate.cost, Object.values(crate.odds)]), [[100,[70,23,6,1]],[250,[35,43,18,4]],[500,[0,55,35,10]]]);
  for (const rarity of rarities) {
    const pools = rewardPools(rarity);
    assert.ok(pools.gear.length); assert.equal(pools.companions.length, 2);
    assert.equal(new Set(pools.gear.map(item => item.id)).size, pools.gear.length);
    for (const kindRoll of [0, .55, GEAR_DROP_CHANCE - 1e-10, GEAR_DROP_CHANCE, .8, .999999]) for (let index = 0; index < 100; index++) {
      const result = rewardForRoll(rarity, kindRoll, index / 100);
      assert.equal(result.rarity, rarity); assert.notEqual(result.kind, 'quote');
      assert.equal(result.kind, kindRoll < GEAR_DROP_CHANCE ? 'gear' : 'companion');
    }
  }
});

test('level draws ignore a legacy slot choice and give each eligible equipment ID one ticket', () => {
  for (const rarity of rarities) {
    const expected = GEAR.filter(item => item.rarity === rarity);
    const legacyChoice = { gearSlot: 'top' } as unknown as RewardChoice;
    const results = expected.map((_, i) => rewardForRoll(rarity, .9999, (i + .5) / expected.length, true, [], legacyChoice));
    assert.deepEqual(results.map(item => item.id), expected.map(item => item.id));
    assert.ok(results.every(item => item.kind === 'gear'));
  }
  const random = fixedRolls([.1, .99, .4]);
  try {
    const opened = openLevelCrate(normalizeGame(), history, 2, undefined, { gearSlot: 'top' } as unknown as RewardChoice)!;
    assert.equal(opened.item.kind, 'gear'); assert.equal(opened.game.transactions[0].amount, 0);
    assert.ok(isGameState(opened.game));
    assert.equal(openLevelCrate(opened.game, history, 2), null);
  } finally { random.mock.restore(); }
});

test('both cheesits per rarity remain reachable and optional duplicate prevention falls back to same-rarity gear', () => {
  for (const rarity of rarities) {
    const companions = COMPANIONS.filter(item => item.rarity === rarity);
    assert.deepEqual([0,.99999].map(roll => rewardForRoll(rarity,.9,roll).id), companions.map(item => item.id));
    const inventory = companions.map(companion => ({ ...copy(QUOTES[0]), kind: 'companion' as const, quoteId: undefined, companionId: companion.id, rarity }));
    assert.equal(rewardForRoll(rarity,.9,0,false,inventory).id, companions[0].id);
    assert.equal(rewardForRoll(rarity,.9,0,false,inventory.slice(0,1),{avoidCompanionDuplicates:true}).id, companions[1].id);
    const fallback = rewardForRoll(rarity,.9,0,false,inventory,{avoidCompanionDuplicates:true});
    assert.equal(fallback.kind,'gear'); assert.equal(fallback.rarity,rarity);
  }
});

test('each represented original quote copy converts by rarity exactly once without rewriting inventory, purchases or XP sources', () => {
  const inventory = rarities.flatMap(rarity => [copy(QUOTES.find(quote => quote.rarity === rarity)!),copy(QUOTES.find(quote => quote.rarity === rarity)!)]);
  delete inventory[0].kind;
  const original = owned(inventory); original.equippedQuoteId = inventory[0].quoteId!;
  const migrated = normalizeGame(original);
  assert.equal(migrated.quoteConversionVersion,1); assert.equal(migrated.quoteConversions!.length,8);
  assert.deepEqual(migrated.inventory,original.inventory); assert.deepEqual(migrated.transactions,original.transactions);
  assert.equal(migrated.equippedQuoteId,null); assert.deepEqual(migrated.missionRewards,original.missionRewards);
  for (const item of inventory) assert.equal(quoteConversionAmount(migrated,item),QUOTE_COMPENSATION[item.rarity]);
  assert.deepEqual(normalizeGame(JSON.parse(JSON.stringify(migrated))),migrated);
  assert.deepEqual(normalizeGame(original),migrated,'two independent devices derive exactly the same records');
  const notice = quoteConversionNotice(migrated); assert.equal(notice.count,8); assert.equal(notice.credits,810);
  assert.equal(quoteConversionNotice(acknowledgeQuoteConversions(migrated)).count,0);
});

test('conversion credit is applied once to its original funding pool and sold phrases receive zero', () => {
  const original = owned([copy(QUOTES[0])]);
  assert.equal(gameBalance(normalizeGame(original),[],undefined,0),15);
  const sold = normalizeGame(legacySaleSnapshot(original,original.inventory[0].id));
  assert.equal(quoteConversionAmount(sold,sold.inventory[0]),0); assert.equal(sold.quoteConversions![0].disposition,'previously-sold');
  assert.equal(gameBalance(sold,[],undefined,0),20);
  original.transactions[0].testFunded=true;
  const status = gameCreditStatus(normalizeGame(original),[],undefined,1000);
  assert.equal(status.earnedBalance,100); assert.equal(status.testingBalance,915);
});

test('repeat imports, two migrated devices and a legacy resend union conversions by original ID without added payments', () => {
  const legacy = owned([copy(QUOTES[0]),copy(QUOTES.find(quote=>quote.rarity==='epic')!)]);
  const a = normalizeGame(legacy), b = normalizeGame(JSON.parse(JSON.stringify(legacy)));
  assert.deepEqual(a,b);
  let current = data(a);
  for (const incoming of [legacy,b,legacy,a]) {
    const result = previewBackup(incoming.quoteConversionVersion ? createBackup(data(incoming)) : legacyBackup(incoming),current);
    assert.equal(result.conflicts.length,0); current=result.merged;
    assert.equal(current.game!.quoteConversions!.length,2);
    assert.equal(current.game!.transactions.length,legacy.transactions.length);
    assert.equal(gameBalance(current.game!,history,undefined,0),gameBalance(a,history,undefined,0));
  }
  assert.deepEqual(mergeQuoteConversions(a.quoteConversions!,b.quoteConversions!),a.quoteConversions);
});

test('conflicting backup ledger choices preserve audit identities, with no credit for discarded branch copies', () => {
  const a = normalizeGame(owned([copy(QUOTES[0])]));
  const b = normalizeGame(owned([copy(QUOTES[1])]));
  for (const choice of ['local','incoming'] as const) {
    const result=previewBackup(createBackup(data(b)),data(a),{'game:ledger':choice});
    assert.equal(result.conflicts.length,0);
    const merged=result.merged.game!;
    assert.equal(merged.inventory.length,1); assert.equal(merged.quoteConversions!.length,2);
    assert.equal(gameBalance(merged,[],undefined,0),15);
    assert.ok(isGameState(merged));
  }
});

test('a sale received from an old device suppresses conversion and its tombstone survives a stale unsold snapshot', () => {
  const original=owned([copy(QUOTES[0])]), converted=normalizeGame(original);
  const sold=legacySaleSnapshot(original,original.inventory[0].id);
  const merged=previewBackup(legacyBackup(sold),data(converted)).merged.game!;
  assert.equal(gameBalance(merged,[],undefined,0),20);
  assert.equal(merged.quoteConversions![0].amount,0);
  const repeated=previewBackup(createBackup(data(original)),data(merged)).merged.game!;
  assert.equal(gameBalance(repeated,[],undefined,0),20);
  assert.equal(repeated.quoteConversions![0].disposition,'previously-sold');
});

test('already committed gear, cheesit and phrase survive reload and timed/quick reveal without purchase or reroll', () => {
  for (const kind of ['gear','companion','quote'] as const) {
    const item=copy(QUOTES[0]);
    if(kind==='gear'){item.kind='gear';delete item.quoteId;item.gearId=GEAR.find(gear=>gear.rarity==='common')!.id;}
    if(kind==='companion'){item.kind='companion';delete item.quoteId;item.companionId=COMPANIONS.find(companion=>companion.rarity==='common')!.id;}
    const original=owned([item]);original.pendingOpening={itemId:item.id,startedAt:item.acquiredAt,stage:'spinning'};
    const game=normalizeGame(JSON.parse(JSON.stringify(original)));
    assert.deepEqual(game.inventory,original.inventory); assert.deepEqual(game.pendingOpening,original.pendingOpening);
    assert.equal(quoteConversionNotice(game).count,0);
    const clock=mock.method(Date,'now',()=>Date.parse(item.acquiredAt)+SPIN_DURATION_MS);
    try {
      assert.equal(openCrate(game,history,'starter'),null);
      const revealing=setOpeningStage(game,'revealing');
      const reloaded=normalizeGame(JSON.parse(JSON.stringify(revealing)));
      clock.mock.mockImplementation(()=>Date.parse(item.acquiredAt)+SPIN_DURATION_MS+REVEAL_DURATION_MS);
      const complete=completeOpening(reloaded);
      assert.equal(complete.pendingOpening,null);assert.deepEqual(complete.inventory,original.inventory);assert.deepEqual(complete.transactions,original.transactions);
      assert.deepEqual(completeOpening(complete),complete);
      if(kind==='quote')assert.equal(quoteConversionNotice(complete).credits,15);
    } finally {clock.mock.restore();}
  }
});

test('new purchases consume exactly three controlled rolls, debit once, and block repeated clicks against their reserved state', () => {
  for(const kindRoll of [.1,.9]) {
    const rolls=[.1,kindRoll,.5], random=fixedRolls(rolls);
    try {
      const base=normalizeGame(), balance=gameBalance(base,history);
      const opened=openCrate(base,history,'starter')!;
      assert.equal(opened.item.kind,kindRoll<GEAR_DROP_CHANCE?'gear':'companion');
      assert.equal(rolls.length,0);assert.equal(gameBalance(opened.game,history),balance-100);
      for(let click=0;click<5;click++)assert.equal(openCrate(opened.game,history,'starter'),null);
      assert.equal(opened.game.inventory.length,1);assert.equal(opened.game.transactions.length,1);
    } finally {random.mock.restore();}
  }
});

test('fabricated duplicate conversions or altered amounts are rejected without accepting a malformed backup', () => {
  const game=normalizeGame(owned([copy(QUOTES[0])]));
  const duplicate=structuredClone(game);duplicate.quoteConversions!.push(duplicate.quoteConversions![0]);assert.equal(isGameState(duplicate),false);
  const inflated=structuredClone(game);inflated.quoteConversions![0].amount++;assert.equal(isGameState(inflated),false);
  assert.throws(()=>previewBackup(createBackup(data(inflated)),data()));
});


test('normalization preserves committed annual chest identity while converting a separate legacy phrase', () => {
  const quote=copy(QUOTES[0]), game=owned([quote]);
  const gear=GEAR.find(item=>item.rarity==='common')!;
  const item: InventoryItem={id:crypto.randomUUID(),kind:'gear',gearId:gear.id,rarity:'common',crateId:'level:2026:2',acquiredAt:quote.acquiredAt,sold:false};
  const source:GameState={...game,inventory:[quote,item],transactions:[...game.transactions,{id:crypto.randomUUID(),kind:'level-crate',itemId:item.id,amount:0,sourceLevel:2,sourceSeason:'2026',createdAt:item.acquiredAt}],pendingOpening:{itemId:item.id,startedAt:item.acquiredAt,stage:'spinning'}};
  assert.ok(isGameState(source));
  const restored=normalizeGame(source);
  assert.equal(restored.transactions.at(-1)?.sourceSeason,'2026');
  assert.deepEqual(restored.pendingOpening,source.pendingOpening);
  assert.deepEqual(restored.inventory,source.inventory);
  assert.equal(restored.quoteConversions?.length,1);
});

test('accumulated audit identities cannot invalidate a new represented conversion or reset the game', () => {
  const original=owned([copy(QUOTES[0])]);
  original.quoteConversions=Array.from({length:100000},(_,index)=>({itemId:`00000000-0000-4000-8000-${index.toString(16).padStart(12,'0')}`,quoteId:'show-up',rarity:'common' as const,amount:0,disposition:'previously-sold' as const}));
  const migrated=normalizeGame(original);
  assert.equal(migrated.quoteConversions!.length,100001);
  assert.deepEqual(migrated.inventory,original.inventory);
  assert.deepEqual(migrated.transactions,original.transactions);
  assert.ok(isGameState(migrated));
  assert.equal(normalizeGame(migrated).quoteConversions!.length,100001);
  assert.equal(gameBalance(migrated,[],undefined,0),15,'audit-only identities cannot pay again');
});
