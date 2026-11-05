import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { applyWorkoutPassive, snapshotWorkoutPassive } from '../src/lib/cheesit-passives';
import { addDays } from '../src/lib/dates';
import { currentSeasons, seasonBounds, watchSeasonClock, annualLevelProgress, characterLevelThreshold } from '../src/lib/seasons';
import { awardMissionRewards, economicXp, gameBalance, gameProgress, getLevelCrates, isGameState, normalizeGame, openLevelCrate, progressionSeasons, preserveSeasonMetadata, reconcileSeasonProgression, revealReservedOpening, transactionSeason, type GameState } from '../src/lib/game';
import { muscleActivity } from '../src/lib/muscles';
import { createBackup, previewBackup } from '../src/lib/backup';
import { emptyData, type AppData } from '../src/lib/model';
import { createStorageClient } from '../src/lib/storage';
import { mergeRemote, prepareOperation, queueChange, readOwner, recordReceipt } from '../src/lib/remote/queue';
import type { EntityPayload, RemoteEntity } from '../src/lib/remote/types';
import { representativeWorkout } from '../scripts/simulate-season-progression';
import { rewardProgress, workoutReward } from '../src/lib/rewards';

function clock(iso: string) { return mock.method(Date, 'now', () => Date.parse(iso)); }
const data = (game: GameState, workouts: AppData['workouts']): AppData => ({ ...emptyData(), game, workouts });

test('Madrid month/year boundaries, leap February, DST and civil dates never use browser UTC membership', () => {
  assert.deepEqual(currentSeasons(new Date('2026-12-31T22:59:59Z')), { day: '2026-12-31', month: '2026-12', year: '2026' });
  assert.deepEqual(currentSeasons(new Date('2026-12-31T23:00:00Z')), { day: '2027-01-01', month: '2027-01', year: '2027' });
  assert.equal(currentSeasons(new Date('2026-06-30T22:00:00Z')).month, '2026-07');
  assert.equal(currentSeasons(new Date('2028-02-28T23:00:00Z')).day, '2028-02-29');
  assert.equal(addDays('2028-02-29', 1), '2028-03-01');
  assert.equal(addDays('2027-02-28', 1), '2027-03-01');
  assert.deepEqual(seasonBounds('2028-02'), { start: '2028-02-01', next: '2028-03-01' });
  assert.deepEqual(seasonBounds('2026-12'), { start: '2026-12-01', next: '2027-01-01' });
  assert.deepEqual(seasonBounds('2026'), { start: '2026-01-01', next: '2027-01-01' });
  assert.equal(currentSeasons(new Date('2026-03-29T01:00:00Z')).day, '2026-03-29');
});

test('an open app refreshes on timer, focus, visibility and pageshow after months asleep, and cleans listeners', () => {
  const surface = new EventTarget(), page = new EventTarget();
  let tick = () => {}, cleared = false, instant = new Date('2026-12-31T22:59:59Z');
  const days: string[] = [];
  const stop = watchSeasonClock(day => days.push(day), { addEventListener: surface.addEventListener.bind(surface), removeEventListener: surface.removeEventListener.bind(surface), setInterval: ((callback: () => void) => { tick = callback; return 1; }) as Window['setInterval'], clearInterval: () => { cleared = true; } }, page, () => instant);
  instant = new Date('2026-12-31T23:00:00Z'); tick();
  instant = new Date('2027-05-01T10:00:00Z'); surface.dispatchEvent(new Event('focus'));
  instant = new Date('2027-09-01T10:00:00Z'); page.dispatchEvent(new Event('visibilitychange'));
  instant = new Date('2028-01-01T10:00:00Z'); surface.dispatchEvent(new Event('pageshow'));
  assert.deepEqual(days, ['2026-12-31','2027-01-01','2027-05-01','2027-09-01','2028-01-01']);
  stop(); surface.dispatchEvent(new Event('focus')); assert.equal(days.length, 5); assert.equal(cleared, true);
});

test('monthly map, XP, direct/secondary counts and detail reset together while annual XP and lifetime stats remain', () => {
  const jan = representativeWorkout('2026-01-31'), feb = representativeWorkout('2026-02-01');
  const history = [jan, feb];
  const january = muscleActivity(history, '2026-02-01', '2026-01');
  const february = muscleActivity(history, '2026-02-01', '2026-02');
  const march = muscleActivity(history, '2026-03-01', '2026-03');
  const chest = (list: typeof january) => list.find(muscle => muscle.id === 'chest')!;
  assert.equal(chest(january).sets, 3); assert.equal(chest(february).sets, 3);
  assert.equal(chest(march).level, 1); assert.equal(chest(march).xp, 0); assert.equal(chest(march).weightedSets, 0); assert.equal(chest(march).lastDate, null);
  assert.equal(chest(march).lifetimeSets, 6);
  assert.equal(january.find(muscle => muscle.id === 'triceps')!.secondarySets, 6);
  assert.equal(gameProgress(normalizeGame(), history, undefined, '2026').xp, rewardProgress(history).xp);
  assert.equal(gameProgress(normalizeGame(), history, undefined, '2027').xp, 0);
});

test('annual thresholds are shared at levels 1/98/99 and excess XP keeps a full bar without a next level', () => {
  assert.equal(annualLevelProgress(0).level, 1);
  for (const level of [2,25,50,75,98,99]) {
    const threshold = characterLevelThreshold(level);
    assert.equal(annualLevelProgress(threshold-1).level, level-1);
    assert.equal(annualLevelProgress(threshold).level, level);
  }
  const max = annualLevelProgress(characterLevelThreshold(99) + 1000000);
  assert.equal(max.level, 99); assert.equal(max.percent, 100); assert.equal(max.nextLevelXp, 0); assert.equal(max.levelXp, 1000000);
  assert.equal(annualLevelProgress(Infinity).xp, 0);
});

test('economic and character XP, purchases, pending prize and inventory survive January', () => {
  const time = clock('2026-12-31T12:00:00Z');
  try {
    let game = reconcileSeasonProgression(normalizeGame(), []);
    const history = [representativeWorkout('2026-12-31')];
    game = reconcileSeasonProgression(game, history);
    const opened = openLevelCrate(game, history, 2)!;
    const before = gameBalance(opened.game, history), lifetime = economicXp(opened.game, history);
    time.mock.mockImplementation(() => Date.parse('2027-01-01T12:00:00Z'));
    const next = reconcileSeasonProgression(opened.game, history);
    assert.equal(gameProgress(next, history).level, gameProgress(game, history).level);
    assert.equal(gameProgress(next, history).xp, gameProgress(game, history).xp);
    assert.equal(gameBalance(next, history), before); assert.equal(economicXp(next, history), lifetime);
    assert.deepEqual(next.inventory, opened.game.inventory); assert.deepEqual(next.pendingOpening, opened.game.pendingOpening);
    assert.equal(next.transactions[0].sourceSeason, '2026'); assert.ok(isGameState(next));
    assert.equal(openLevelCrate(next, history, 100), null);
  } finally { time.mock.restore(); }
});

test('rollover cannot reopen an old level and subsequent levels still unlock their crates', () => {
  const time = clock('2026-12-30T12:00:00Z');
  try {
    let game = reconcileSeasonProgression(normalizeGame(), []);
    const history = [representativeWorkout('2026-12-30'), representativeWorkout('2026-12-31')];
    game = reconcileSeasonProgression(game, history);
    game = revealReservedOpening(openLevelCrate(game, history, 2)!.game);
    assert.equal(openLevelCrate(game, history, 2), null);
    const before = getLevelCrates(game, history).find(crate => crate.level === 3);
    assert.ok(before && !before.claimed);
    time.mock.mockImplementation(() => Date.parse('2027-01-02T12:00:00Z'));
    history[0].status = 'deleted'; history[1].status = 'deleted';
    game = reconcileSeasonProgression(game, history);
    assert.ok(getLevelCrates(game, history, undefined, '2026').some(crate => crate.level === 3 && !crate.claimed));
    const retainedLevel = gameProgress(game, history).level;
    assert.ok(retainedLevel >= 3, 'deleting an old session does not lower the saved character level');
    assert.equal(openLevelCrate(game, history, 2, undefined, '2027'), null);
    history.push(...Array.from({ length: 4 }, (_, index) => representativeWorkout(addDays('2027-01-02', index))));
    game = reconcileSeasonProgression(game, history);
    const opened = openLevelCrate(game, history, retainedLevel + 1, undefined, '2027')!;
    assert.ok(opened);
    assert.equal(opened.item.crateId, `level:2027:${retainedLevel + 1}`);
    assert.equal(opened.game.transactions.filter(transaction => transaction.sourceLevel === 2).length, 1);
    assert.ok(isGameState(opened.game));
    assert.equal(openLevelCrate(revealReservedOpening(opened.game), history, retainedLevel + 1, undefined, '2027'), null);
    const oldPending = openLevelCrate(revealReservedOpening(opened.game), history, 3, undefined, '2026')!;
    assert.ok(oldPending); assert.equal(oldPending.game.transactions.at(-1)?.sourceSeason,'2026');
    assert.ok(oldPending.item.acquiredAt.startsWith('2027')); assert.ok(isGameState(oldPending.game));
  } finally { time.mock.restore(); }
});

test('migration is idempotent, preserves legacy claims/dates and grants only old-curve pending crates', () => {
  const time = clock('2025-12-31T12:00:00Z');
  try {
    const history = Array.from({ length: 8 }, (_, i) => representativeWorkout(addDays('2025-12-01',i)));
    const open = openLevelCrate(normalizeGame(), history, 2)!;
    let legacy = structuredClone(open.game);
    legacy.inventory[0].crateId = 'level:2'; delete legacy.transactions[0].sourceSeason;
    delete legacy.seasonProgressionVersion; delete legacy.seasonProgressionStartedOn; delete legacy.seasonCrateProgress;
    assert.ok(isGameState(legacy));
    time.mock.mockImplementation(() => Date.parse('2026-01-01T12:00:00Z'));
    const migrated = reconcileSeasonProgression(legacy, history);
    assert.deepEqual(reconcileSeasonProgression(migrated, history), migrated);
    assert.deepEqual(migrated.inventory, legacy.inventory); assert.deepEqual(migrated.transactions, legacy.transactions); assert.deepEqual(migrated.pendingOpening,legacy.pendingOpening);
    assert.equal(transactionSeason(migrated.transactions[0]), '2025');
    assert.equal(getLevelCrates(migrated, history).some(crate => crate.level === 2), false);
    assert.equal(gameBalance(migrated, history), gameBalance(legacy, history));
    assert.equal(gameProgress(migrated, history).xp, rewardProgress(history).xp);
    assert.deepEqual(normalizeGame(JSON.parse(JSON.stringify(migrated))), migrated);
    const copied = data(migrated,history), restored = previewBackup(createBackup(copied),emptyData());
    assert.equal(restored.conflicts.length, 0); assert.deepEqual(restored.merged.game, migrated);
  } finally { time.mock.restore(); }
});

test('new curve adoption does not retroactively grant annual crates and date edits move annual/monthly XP only', () => {
  const time = clock('2026-11-02T12:00:00Z');
  try {
    const history = Array.from({ length: 4 }, (_, i) => representativeWorkout(addDays('2026-10-20',i)));
    const game = reconcileSeasonProgression(normalizeGame(), history);
    const crates = getLevelCrates(game, history);
    assert.ok(crates.length < gameProgress(game, history).level-1);
    const beforeCredits = gameBalance(game,history);
    const moved = history.map(workout => ({ ...workout, date: workout.date.replace('2026-10','2025-09') }));
    assert.equal(gameProgress(game,moved,undefined,'2026').xp,0);
    assert.equal(gameProgress(game,moved,undefined,'2025').xp,rewardProgress(moved).xp);
    assert.equal(muscleActivity(moved,'2026-11-02','2026-10')[0].xp,0);
    assert.equal(gameBalance(game,moved),beforeCredits);
    assert.deepEqual(getLevelCrates(reconcileSeasonProgression(game,moved),moved),crates);
    assert.equal(workoutReward(moved[1],moved).records,workoutReward(history[1],history).records);
  } finally { time.mock.restore(); }
});

test('mission year uses its explicit award date, IDs cannot repeat and reloading/migration grants no historical missions', () => {
  const time = clock('2026-12-31T12:00:00Z');
  try {
    const workout = representativeWorkout('2026-12-31');
    const game = awardMissionRewards(normalizeGame(),[workout],'2026-12-31',workout.date);
    const xp2026 = gameProgress(game,[workout],undefined,'2026').objectiveXp;
    assert.ok(xp2026 > 0); assert.equal(gameProgress(game,[workout],undefined,'2027').objectiveXp,0);
    time.mock.mockImplementation(() => Date.parse('2027-01-01T12:00:00Z'));
    const next = reconcileSeasonProgression(game,[workout]);
    assert.deepEqual(next.missionRewards,game.missionRewards);
    const awarded = awardMissionRewards(next,[workout],'2027-01-01',workout.date);
    assert.deepEqual(awarded.missionRewards,game.missionRewards);
  } finally { time.mock.restore(); }
});

test('invalid season metadata and mismatched annual claim identities are rejected without accepting duplicate claims', () => {
  const time = clock('2026-11-02T12:00:00Z');
  try {
    const history=[representativeWorkout('2026-11-02')];
    const game=reconcileSeasonProgression(reconcileSeasonProgression(normalizeGame(),[]),history);
    const opened=openLevelCrate(game,history,2)!.game;
    assert.equal(isGameState({...game,seasonCrateProgress:[{season:'2026',baseline:1,reached:100}]}),false);
    assert.equal(isGameState({...game,seasonCrateProgress:[{season:'26',baseline:1,reached:2}]}),false);
    const invalid=structuredClone(opened);invalid.transactions[0].sourceSeason='2027';assert.equal(isGameState(invalid),false);
    const duplicate=structuredClone(opened),item={...opened.inventory[0],id:crypto.randomUUID()};
    duplicate.inventory.push(item);duplicate.transactions.push({...opened.transactions[0],id:crypto.randomUUID(),itemId:item.id});assert.equal(isGameState(duplicate),false);
    assert.throws(()=>previewBackup(createBackup(data(invalid,history)),emptyData()));
  }finally{time.mock.restore();}
});

test('two offline branches never combine independent draws; choosing either ledger retains season rights and discarded claims locks', () => {
  const time = clock('2026-11-02T12:00:00Z');
  try {
    const history=Array.from({length:4},(_,i)=>representativeWorkout(addDays('2026-10-25',i)));
    const initial=reconcileSeasonProgression(reconcileSeasonProgression(normalizeGame(),[]),history);
    const a=revealReservedOpening(openLevelCrate(initial,history,2)!.game);
    const b=revealReservedOpening(openLevelCrate(initial,history,3)!.game);
    const preview=previewBackup(createBackup(data(b,history)),data(a,history));
    assert.ok(preview.conflicts.length);
    for(const choice of ['local','incoming'] as const){
      const merged=previewBackup(createBackup(data(b,history)),data(a,history),{'game:ledger':choice});
      assert.equal(merged.conflicts.length,0);assert.equal(merged.merged.game!.inventory.length,1);
      assert.equal(openLevelCrate(merged.merged.game!,history,2),null);assert.equal(openLevelCrate(merged.merged.game!,history,3),null);
      assert.ok(isGameState(merged.merged.game));
      const again=previewBackup(createBackup(data(b,history)),merged.merged,{'game:ledger':'local'}).merged.game!;
      assert.equal(openLevelCrate(again,history,2),null);assert.equal(openLevelCrate(again,history,3),null);
    }
    assert.equal(isGameState(preserveSeasonMetadata(a,b)),true);
  }finally{time.mock.restore();}
});

test('IndexedDB offline save/reload retains migrated rights, old pending opening, balance and exact prize', async () => {
  const time=clock('2026-11-02T12:00:00Z');
  try{
    const history=[representativeWorkout('2026-11-02')];const game=reconcileSeasonProgression(reconcileSeasonProgression(normalizeGame(),[]),history);
    const opened=openLevelCrate(game,history,2)!.game;const client=createStorageClient();await client.loadData();await client.saveData(data(opened,history));
    const restored=await createStorageClient().loadData();assert.deepEqual(restored.game,opened);assert.equal(gameBalance(restored.game!,restored.workouts),gameBalance(opened,history));assert.equal(openLevelCrate(restored.game!,restored.workouts,2),null);
  }finally{time.mock.restore();}
});

test('mock remote retries, download, tombstones and revisions preserve civil training dates without moving season or adding XP twice', async () => {
  const owner=crypto.randomUUID(),device=crypto.randomUUID(),workout=representativeWorkout('2026-12-31');
  const payload=JSON.parse(JSON.stringify(workout)) as EntityPayload;
  await queueChange(owner,device,'session',payload);
  const first=await prepareOperation((await readOwner(owner)).operations[0]);assert.deepEqual(await prepareOperation(first),first);
  await recordReceipt(first,{status:'applied',revision:1});
  const row:RemoteEntity={owner_id:owner,entity_type:'session',id:workout.id,payload,deleted:false,revision:1,created_at:workout.createdAt,updated_at:workout.updatedAt};
  await mergeRemote(owner,[row,row]);const state=await readOwner(owner);assert.equal(state.entities.length,1);assert.equal(state.operations.length,0);assert.equal(state.entities[0].payload.date,'2026-12-31');
  const read=state.entities.map(entity=>entity.payload as unknown as typeof workout);assert.equal(gameProgress(normalizeGame(),read,undefined,'2027').xp,0);assert.equal(gameProgress(normalizeGame(),read,undefined,'2026').xp,rewardProgress([workout]).xp);
  await mergeRemote(owner,[{...row,deleted:true,revision:2}]);assert.equal((await readOwner(owner)).entities[0].deleted,true);
});


test('legacy backup baselines cannot revoke already earned seasonal crates or mint the recalibration gap', () => {
  const time=clock('2026-11-02T12:00:00Z');
  try {
    const first=[representativeWorkout('2026-10-01'),representativeWorkout('2026-10-02')];
    const current=reconcileSeasonProgression(reconcileSeasonProgression(normalizeGame(),[]),first);
    const legacyHistory=Array.from({length:8},(_,index)=>representativeWorkout(addDays('2026-09-01',index)));
    const legacy=normalizeGame();
    const preview=previewBackup(createBackup(data(legacy,legacyHistory)),data(current,first));
    assert.equal(preview.conflicts.length,0);
    const available=getLevelCrates(preview.merged.game!,preview.merged.workouts);
    for(const crate of getLevelCrates(current,first))assert.ok(available.some(candidate=>candidate.level===crate.level));
    assert.equal(available.some(crate=>crate.level===gameProgress(legacy,legacyHistory).level),false);
    assert.ok(isGameState(preview.merged.game));
  }finally{time.mock.restore();}
});


test('permanent levels and date corrections use the saved cheesit award and never the currently equipped passive', () => {
  const time=clock('2026-12-31T13:00:00Z');
  try {
    const item={id:crypto.randomUUID(),kind:'companion' as const,companionId:'athlete',rarity:'common' as const,acquiredAt:'2026-01-01T12:00:00Z',crateId:'starter',sold:false};
    const owned:GameState={...normalizeGame(),equippedCompanionId:'athlete',inventory:[item],transactions:[{id:crypto.randomUUID(),kind:'crate',amount:-100,itemId:item.id,createdAt:item.acquiredAt}]};
    const workout=applyWorkoutPassive(snapshotWorkoutPassive(representativeWorkout('2026-12-31'),owned),[]);
    assert.equal(workout.companionReward?.bonusXp,20);
    const game=reconcileSeasonProgression(owned,[workout]);const balance=gameBalance(game,[workout]);
    time.mock.mockImplementation(()=>Date.parse('2027-01-01T13:00:00Z'));
    const next={...reconcileSeasonProgression(game,[workout]),equippedCompanionId:null};
    assert.equal(gameProgress(next,[workout]).xp,workoutReward(workout,[workout]).totalXp);assert.equal(gameBalance(next,[workout]),balance);
    const moved={...workout,date:'2027-01-01'};
    assert.equal(gameProgress(next,[moved]).xp,workoutReward(workout,[workout]).totalXp);
    assert.equal(gameBalance(next,[moved]),balance);
    assert.deepEqual(applyWorkoutPassive(moved,[workout]).companionReward,workout.companionReward);
  }finally{time.mock.restore();}
});

test('new level entitlements stop at 99 even when statistical XP exceeds the final threshold', () => {
  const time=clock('2026-11-02T12:00:00Z');
  try {
    const initial=reconcileSeasonProgression(normalizeGame(),[]);
    const history=Array.from({length:300},()=>representativeWorkout('2026-10-01'));
    const game=reconcileSeasonProgression(initial,history);
    assert.equal(gameProgress(game,history).level,99);
    assert.ok(gameProgress(game,history).xp>characterLevelThreshold(99));
    const crates=getLevelCrates(game,history);assert.equal(crates.length,98);assert.equal(crates.at(-1)?.level,99);
    assert.equal(openLevelCrate(game,history,100),null);
    assert.ok(openLevelCrate(game,history,99));
    assert.equal(gameBalance(game,history),100+Math.floor(economicXp(game,history)/5));
  }finally{time.mock.restore();}
});


test('an empty year opened before January is not offered as a historical season after rollover', () => {
  const initial=reconcileSeasonProgression(normalizeGame(),[],undefined,'2026-12-31');
  const january=reconcileSeasonProgression(initial,[],undefined,'2027-01-01');
  assert.ok(january.seasonCrateProgress?.some(entry=>entry.season==='2026'));
  assert.deepEqual(progressionSeasons(january,[],'2027'),['2027']);
  const withRights={...january,seasonCrateProgress:[{season:'2026',baseline:1,reached:2},{season:'2027',baseline:1,reached:1}]};
  assert.deepEqual(progressionSeasons(withRights,[],'2027'),['2027','2026']);
});
