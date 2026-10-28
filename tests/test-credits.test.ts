import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameBalance, isGameState, normalizeGame, type GameState } from '../src/lib/game';

test('removing the temporary allowance removes test purchases and sales from the real balance',()=>{
  const now=new Date().toISOString(), itemId=crypto.randomUUID();
  const game:GameState={...normalizeGame(),inventory:[{id:itemId,quoteId:'show-up',rarity:'common',acquiredAt:now,crateId:'starter',sold:true}],transactions:[{id:crypto.randomUUID(),kind:'crate',itemId,amount:-100,createdAt:now,testFunded:true},{id:crypto.randomUUID(),kind:'sale',itemId,amount:20,createdAt:now,testFunded:true}]};
  assert.ok(isGameState(game));
  assert.equal(gameBalance(game,[],undefined,1000000),1000020);
  assert.equal(gameBalance(game,[],undefined,0),100);
  assert.equal(gameBalance(JSON.parse(JSON.stringify(game)),[],undefined,0),100);
  assert.equal(isGameState({...game,transactions:game.transactions.map(transaction=>transaction.kind==='sale'?{...transaction,testFunded:false}:transaction)}),false);
});
