import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBackup, previewBackup } from '../src/lib/backup';
import { activityEconomyAdjustment, awardMissionRewards, equipItem, gameBalance, gameCreditStatus, getMissions, isGameState, normalizeGame, openCrate, QUOTES, revealReservedOpening, rewardForRoll, unlockedQuotes, type GameState, type InventoryItem } from '../src/lib/game';
import { GEAR } from '../src/lib/gear';
import type { AppData, Workout } from '../src/lib/model';
import { legacySaleSnapshot } from './fixtures/legacy-sale';

const day='2026-10-28';
const session=(date=day,count=1):Workout=>({id:crypto.randomUUID(),name:'Sesión',date,color:'#0057C2',status:'finished',createdAt:`${date}T12:00:00Z`,updatedAt:`${date}T12:00:00Z`,exercises:[{id:crypto.randomUUID(),exerciseId:'press-banca-barra',name:'Banca',group:'Pecho',mode:'external_load_reps',sets:Array.from({length:count},()=>({id:crypto.randomUUID(),weight:50,reps:8,confirmed:true}))}]});
const data=(game:GameState):AppData=>({game,workouts:[],routines:[],customExercises:[]});

test('static/quick reveal retains the reserved item, single debit and round-trip state, and is idempotent',()=>{
  const original=normalizeGame();
  const reserved=openCrate(original,[],'starter')!;
  const snapshot=structuredClone(reserved.game);
  const result=revealReservedOpening(reserved.game);
  assert.equal(result.pendingOpening,null);
  assert.deepEqual(result.inventory,snapshot.inventory);
  assert.deepEqual(result.transactions,snapshot.transactions);
  assert.equal(result.transactions.length,1);
  assert.equal(gameBalance(result,[]),gameBalance(original,[])-100);
  assert.ok(isGameState(result));
  assert.strictEqual(revealReservedOpening(result),result);
  const restored=previewBackup(createBackup(data(result)),data(normalizeGame())).merged.game!;
  assert.deepEqual(restored,result);
  assert.strictEqual(revealReservedOpening(restored),restored);
  assert.deepEqual(reserved.game,snapshot);
});

test('a legacy sold phrase is retired while sale and credit history remain unchanged',()=>{
  const quote=QUOTES[0],now=new Date().toISOString();
  const item:InventoryItem={id:crypto.randomUUID(),quoteId:quote.id,rarity:quote.rarity,acquiredAt:now,crateId:'starter',sold:false};
  const owned:GameState={...normalizeGame(),inventory:[item],transactions:[{id:crypto.randomUUID(),kind:'crate',itemId:item.id,amount:-100,createdAt:now}]};
  const sold=legacySaleSnapshot(owned,item.id),before=structuredClone(sold);
  assert.deepEqual(unlockedQuotes(sold).map(value=>value.id),[]);
  const selected=normalizeGame(equipItem(sold,item.id));
  assert.equal(selected.equippedQuoteId,null);
  assert.ok(isGameState(selected));
  assert.deepEqual(selected.transactions,before.transactions);
  assert.deepEqual(selected.inventory,before.inventory);
  assert.equal(gameBalance(selected,[]),gameBalance(sold,[]));
  assert.deepEqual(normalizeGame(JSON.parse(JSON.stringify(selected))),selected);
  assert.deepEqual(previewBackup(createBackup(data(selected)),{routines:[],workouts:[],customExercises:[]}).merged.game,selected);
  assert.deepEqual(previewBackup(createBackup(data(selected)),data(selected)).merged.game,selected);
});

test('weekly missions use distinct dates and explain a changed target after its reward was frozen',()=>{
  const weeklyDay = '2026-11-04';
  const history=[session(weeklyDay),session(weeklyDay),session(weeklyDay)];
  const initial=normalizeGame();
  const personal=getMissions(history,weeklyDay,initial).find(mission=>mission.id==='sessions:2026-11-02')!;
  assert.equal(personal.current,1);
  assert.equal(personal.complete,false);
  const paid=awardMissionRewards({...initial,weeklyWorkoutGoal:1},history,weeklyDay);
  const changed={...paid,weeklyWorkoutGoal:5};
  const mission=getMissions(history,weeklyDay,changed).find(mission=>mission.id===personal.id)!;
  assert.equal(mission.target,1);
  assert.equal(mission.current,1);
  assert.ok(mission.rewarded&&mission.complete);
  assert.match(mission.rewardNote!,/meta actual es 5/);
  assert.match(mission.rewardNote!,/cuando vuelva este objetivo/);
  assert.strictEqual(awardMissionRewards(changed,history,weeklyDay),changed);
  const deleted=getMissions(history.map(value=>({...value,status:'deleted' as const})),weeklyDay,changed).find(value=>value.id===personal.id)!;
  assert.equal(deleted.current,0);
  assert.ok(deleted.complete&&deleted.rewarded);
});

test('activity deletion exposes the clamped credit adjustment without changing existing economy or purchases',()=>{
  const before=[session(day,30)];
  const purchase=openCrate(normalizeGame(),before,'charged')!;
  const after=before.map(value=>({...value,status:'deleted' as const}));
  const status=gameCreditStatus(purchase.game,after,undefined,0);
  assert.equal(status.balance,0);
  assert.equal(status.deficit,150);
  assert.equal(gameBalance(purchase.game,after,undefined,0),0);
  const change=activityEconomyAdjustment(purchase.game,before,after);
  assert.ok(change.xpDelta<0&&change.balanceDelta<0);
  assert.equal(change.deficitBefore,0);
  assert.equal(change.deficitAfter,150);
  assert.equal(purchase.game.inventory.length,1);
  assert.equal(purchase.game.transactions.length,1);
});

test('guaranteed equipment draws retain rarity',()=>{
  const selected=rewardForRoll('rare',.9,0,true);
  assert.equal(selected.kind,'gear');assert.equal(selected.id,GEAR.find(value=>value.rarity==='rare')!.id);assert.equal(selected.rarity,'rare');
});

test('legacy record and profile economics stay unchanged until an explicit versioned migration exists',async()=>{
  const {workoutReward,rewardProgress}=await import('../src/lib/rewards');
  const {DEFAULT_PROFILE}=await import('../src/lib/strength');
  const baseline=session('2026-10-27'),current=session(day,6);
  current.exercises[0].sets=current.exercises[0].sets.map(set=>({...set,weight:55}));
  assert.equal(workoutReward(current,[baseline,current]).recordXp,6*75);
  // Pin compatibility deliberately: this behavior is explained in the migration proposal.
  const lighter=rewardProgress([current],{...DEFAULT_PROFILE,weightKg:70});
  const heavier=rewardProgress([current],{...DEFAULT_PROFILE,weightKg:100});
  assert.notEqual(lighter.xp,heavier.xp);
});
