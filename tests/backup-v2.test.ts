import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBackup, previewBackup } from '../src/lib/backup';
import { normalizeGame, openCrate, isGameState } from '../src/lib/game';
import { DEFAULT_PROFILE } from '../src/lib/strength';
import type { AppData } from '../src/lib/model';

test('V2 backup restores profile and preserves a pending opening without another charge', () => {
  const base:AppData={routines:[],workouts:[],customExercises:[]};
  const purchase=openCrate(normalizeGame(),[],'starter')!;
  const saved={...base,game:purchase.game,profile:{...DEFAULT_PROFILE,weightKg:75}};
  const restored=previewBackup(createBackup(saved),base).merged;
  assert.deepEqual(restored.profile,saved.profile);
  assert.deepEqual(restored.game,purchase.game);
  assert.equal(restored.game?.pendingOpening?.itemId,purchase.item.id);
  const again=previewBackup(createBackup(saved),restored);
  assert.deepEqual(again.conflicts,[]);
  assert.equal(again.merged.game?.transactions.length,1);
  assert.equal(again.merged.game?.pendingOpening?.itemId,purchase.item.id);
  assert.ok(isGameState(again.merged.game));
  const old=previewBackup(createBackup(base),restored).merged;
  assert.deepEqual(old.profile,saved.profile);
  assert.equal(old.game?.inventory.length,1);
});

test('V2 backups reject an invalid profile and retain legacy motivational cards', () => {
  const base:AppData={routines:[],workouts:[],customExercises:[]};
  assert.throws(()=>previewBackup(createBackup({...base,profile:{...DEFAULT_PROFILE,weightKg:0}}),base),/perfil/);
  const now=new Date().toISOString();
  const itemId=crypto.randomUUID();
  const legacy={transactions:[{id:crypto.randomUUID(),kind:'crate' as const,itemId,amount:-100,createdAt:now}],inventory:[{id:itemId,quoteId:'show-up',rarity:'common' as const,acquiredAt:now,crateId:'starter',sold:false}],weeklyWorkoutGoal:3,weeklySetGoal:30,equippedQuoteId:'show-up'};
  const result=previewBackup(createBackup({...base,game:legacy}),base);
  assert.equal(result.merged.game?.inventory[0].quoteId,'show-up');
  assert.equal(normalizeGame(result.merged.game).equippedQuoteId,'show-up');
});
