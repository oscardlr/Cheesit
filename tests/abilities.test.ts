import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GEAR } from '../src/lib/gear';
import { COMPANIONS } from '../src/lib/companions';
import { ABILITIES, getAbilityDefinition, isAbilityUse } from '../src/lib/abilities';
import { applyWorkoutAbility, equipCompanion, equipCosmetic, getAbilityCharges, isGameState, normalizeGame, sellItem, setActiveAbility, unlockedCompanions, unlockedGear, gameBalance, type GameState, type InventoryItem } from '../src/lib/game';
import { rewardProgress, rewardSetIndex, workoutReward } from '../src/lib/rewards';
import { muscleActivity } from '../src/lib/muscles';
import type { Workout } from '../src/lib/model';
import { createBackup, previewBackup } from '../src/lib/backup';
import type { AppData } from '../src/lib/model';
import { legacySaleSnapshot } from './fixtures/legacy-sale';

function owned(gearIds:string[]=[], companionIds:string[]=[]):GameState {
  const now=new Date(Date.now()-1000).toISOString();
  const inventory:InventoryItem[]=[...gearIds.map(gearId=>({id:crypto.randomUUID(),gearId,kind:'gear' as const,rarity:GEAR.find(gear=>gear.id===gearId)!.rarity,crateId:'starter',acquiredAt:now,sold:false})),...companionIds.map(companionId=>({id:crypto.randomUUID(),companionId,kind:'companion' as const,rarity:COMPANIONS.find(companion=>companion.id===companionId)!.rarity,crateId:'starter',acquiredAt:now,sold:false}))];
  return {...normalizeGame(),inventory,transactions:inventory.map(item=>({id:crypto.randomUUID(),kind:'crate' as const,itemId:item.id,amount:-100,createdAt:now}))};
}
function session(abilityId:string|null,group='Pierna y glúteo'):Workout {
  return {id:crypto.randomUUID(),name:'Sesión',color:'#0057C2',date:'2026-10-27',createdAt:'2026-10-27T12:00:00Z',updatedAt:'2026-10-27T12:00:00Z',status:'finished',abilityId,exercises:[{id:crypto.randomUUID(),exerciseId:group==='Pierna y glúteo'?'sentadilla-barra':group==='Bíceps'?'curl-barra':'press-banca-barra',name:'Ejercicio',group,mode:'external_load_reps',sets:[{id:crypto.randomUUID(),weight:50,reps:8,confirmed:true}]}]};
}

test('blocked sales preserve appearances and the independently selected charged ability',()=>{
  let game=owned(['lime-shorts','titan-sword']);
  assert.ok(isGameState(game));
  game=equipCosmetic(game,'titan-sword');
  game=setActiveAbility(game,'lime-shorts');
  assert.equal(game.cosmeticGear?.hand,'titan-sword');
  assert.equal(game.activeAbilityId,'lime-shorts');
  const sword=game.inventory.find(item=>item.gearId==='titan-sword')!;
  assert.strictEqual(sellItem(game,sword.id),game);
  assert.equal(game.inventory.find(item=>item.id===sword.id)?.sold,false);
  assert.equal(game.cosmeticGear?.hand,'titan-sword');
  assert.ok(unlockedGear(game).some(gear=>gear.id==='titan-sword'));
  assert.equal(getAbilityCharges(game,'titan-sword'),1);
  assert.equal(equipCosmetic(game,null,'hand').cosmeticGear?.hand,undefined);
  assert.strictEqual(equipCosmetic(game,'dragon-head'),game);
});

test('one eligible completion spends one charge and its frozen reward cannot be duplicated or changed by a new active item',()=>{
  let game=setActiveAbility(owned(['lime-shorts','plasma-blaster']),'lime-shorts');
  const workout=session(game.activeAbilityId!);
  const base=workoutReward(workout,[workout]);
  const awarded=applyWorkoutAbility(game,workout,[workout]);
  game=awarded.game;
  assert.ok(awarded.reward);
  assert.ok(isAbilityUse(awarded.reward));
  assert.ok(isGameState(game));
  assert.equal(game.abilityUses?.length,1);
  assert.equal(getAbilityCharges(game,'lime-shorts'),0);
  assert.equal(workoutReward(awarded.workout,[awarded.workout]).totalXp,base.totalXp+awarded.reward!.bonusXp);
  assert.ok(rewardSetIndex([awarded.workout]).get(workout.exercises[0].sets[0].id)!.abilityXp!>0);
  const muscle=muscleActivity([awarded.workout],'2026-10-27',7).find(item=>item.id==='quads')!;
  assert.equal(muscle.xp,base.setXp+awarded.reward!.bonusXp);
  const repeated=applyWorkoutAbility(game,{...workout,abilityId:'plasma-blaster'},[awarded.workout]);
  assert.equal(repeated.game.abilityUses?.length,1);
  assert.deepEqual(repeated.reward,awarded.reward);
  const points=rewardProgress([awarded.workout]).xp;
  game=setActiveAbility(game,'plasma-blaster');
  assert.equal(rewardProgress([awarded.workout]).xp,points);
  assert.equal(getAbilityCharges(game,'plasma-blaster'),1);
});

test('no benefit, an unfinished draft or missing starting selection never spends a charge',()=>{
  const game=setActiveAbility(owned(['lime-shorts']),'lime-shorts');
  assert.equal(applyWorkoutAbility(game,session('lime-shorts','Pecho'),[]).reward,null);
  assert.equal(applyWorkoutAbility(game,{...session('lime-shorts'),status:'draft'},[]).reward,null);
  assert.equal(applyWorkoutAbility(game,session(null),[]).reward,null);
  assert.equal(getAbilityCharges(game,'lime-shorts'),1);
  assert.equal(game.abilityUses?.length,0);
});

test('duplicates stack charges, pending copies do not, and exhausting charges preserves the appearance',()=>{
  let game=equipCosmetic(owned(['lime-shorts','lime-shorts']),'lime-shorts');
  assert.equal(getAbilityCharges(game,'lime-shorts'),2);
  const pending={...game,pendingOpening:{itemId:game.inventory[1].id,startedAt:game.inventory[1].acquiredAt,stage:'spinning' as const}};
  assert.equal(getAbilityCharges(pending,'lime-shorts'),1);
  for(let index=0;index<2;index++) {
    const result=applyWorkoutAbility(game,session('lime-shorts'),[]);
    assert.ok(result.reward);game=result.game;
  }
  assert.ok(isGameState(game));
  assert.equal(getAbilityCharges(game,'lime-shorts'),0);
  assert.equal(applyWorkoutAbility(game,session('lime-shorts'),[]).reward,null);
  assert.equal(setActiveAbility(game,'lime-shorts').activeAbilityId,null);
  assert.equal(game.cosmeticGear?.bottom,'lime-shorts');
  assert.equal(normalizeGame(JSON.parse(JSON.stringify(game))).abilityUses?.length,2);
});

test('every equipment rarity grants one charge for its first copy and one more for each revealed duplicate',()=>{
  for(const gear of GEAR){
    const ability=getAbilityDefinition(gear.id)!;
    const group=ability.target==='legs'?'Pierna y glúteo':ability.target==='arms'?'Bíceps':ability.target==='pull'?'Espalda':'Pecho';
    assert.equal(ability.chargesPerDrop,1);
    assert.equal(getAbilityCharges(owned([gear.id]),gear.id),1);
    let game=equipCosmetic(owned([gear.id,gear.id]),gear.id);
    assert.equal(getAbilityCharges(game,gear.id),2);
    const hidden={...game,pendingOpening:{itemId:game.inventory[1].id,startedAt:game.inventory[1].acquiredAt,stage:'spinning' as const}};
    assert.equal(getAbilityCharges(hidden,gear.id),1);
    const first=applyWorkoutAbility(game,session(gear.id,group),[]);
    assert.ok(first.reward,`${gear.id} should spend one charge on a useful workout`);
    assert.equal(getAbilityCharges(first.game,gear.id),1);
    const second=applyWorkoutAbility(first.game,session(gear.id,group),[first.workout]);
    assert.ok(second.reward);
    game=second.game;
    assert.equal(getAbilityCharges(game,gear.id),0);
    assert.ok(isGameState(game));
    assert.equal(game.cosmeticGear?.[gear.slot],gear.id);
    assert.equal(applyWorkoutAbility(game,session(gear.id,group),[first.workout,second.workout]).reward,null);
    const restored=normalizeGame(JSON.parse(JSON.stringify(game)));
    assert.equal(getAbilityCharges(restored,gear.id),0);
    assert.deepEqual(restored.abilityUses,game.abilityUses);
    assert.deepEqual(restored.inventory,game.inventory);
  }
});

test('legacy multi-charge histories migrate without losing rewards, refunding uses or permitting new overconsumption',()=>{
  const base:AppData={routines:[],customExercises:[],workouts:[]};
  for(const [gearId,formerCharges,group] of [['lime-shorts',3,'Pierna y glúteo'],['purple-tank',4,'Pecho'],['titan-sword',5,'Bíceps'],['plasma-blaster',5,'Pecho']] as const){
    const original=equipCosmetic(owned([gearId]),gearId);
    // Reconstruct genuine events produced under the former per-copy limits.
    const results=Array.from({length:formerCharges},()=>applyWorkoutAbility(original,session(gearId,group),[]));
    assert.ok(results.every(result=>result.reward));
    const history=results.map(result=>result.workout);
    const legacy={...original,abilityUses:results.map(result=>result.reward!)};
    delete legacy.abilityChargeVersion;
    delete legacy.legacyAbilityUseIds;
    const snapshot=structuredClone(legacy);
    assert.ok(isGameState(legacy),'unversioned historical snapshots retain their original validity');
    const migrated=normalizeGame(JSON.parse(JSON.stringify(legacy)));
    assert.equal(migrated.abilityChargeVersion,1);
    assert.deepEqual(migrated.legacyAbilityUseIds,legacy.abilityUses.slice(1).map(use=>use.workoutId));
    assert.deepEqual(migrated.inventory,snapshot.inventory);
    assert.deepEqual(migrated.transactions,snapshot.transactions);
    assert.deepEqual(migrated.abilityUses,snapshot.abilityUses);
    assert.equal(getAbilityCharges(migrated,gearId),0);
    assert.equal(gameBalance(migrated,history),gameBalance(legacy,history));
    assert.equal(applyWorkoutAbility(migrated,session(gearId,group),history).reward,null);
    assert.deepEqual(normalizeGame(JSON.parse(JSON.stringify(migrated))),migrated);
    const restored=previewBackup(createBackup({...base,game:migrated,workouts:history}),base).merged.game!;
    assert.deepEqual(restored,migrated);
    const oldRestore=previewBackup(createBackup({...base,game:legacy,workouts:history}),base).merged.game!;
    assert.deepEqual(oldRestore,migrated);
    const repeated=previewBackup(createBackup({...base,game:legacy,workouts:history}),{...base,game:restored,workouts:history});
    assert.deepEqual(repeated.conflicts,[]);
    assert.equal(getAbilityCharges(repeated.merged.game!,gearId),0);
    assert.deepEqual(repeated.merged.game?.abilityUses,migrated.abilityUses);

    const fabricated={...snapshot,abilityChargeVersion:1 as const};
    assert.equal(isGameState(fabricated),false,'a current snapshot cannot claim the former multi-charge budget');
    assert.throws(()=>previewBackup(createBackup({...base,game:fabricated,workouts:history}),base));
    const extra=applyWorkoutAbility(original,session(gearId,group),[]).reward!;
    assert.equal(isGameState({...migrated,abilityUses:[...migrated.abilityUses!,extra]}),false);
    assert.equal(isGameState({...migrated,abilityUses:[...migrated.abilityUses!,extra],legacyAbilityUseIds:[...migrated.legacyAbilityUseIds!,extra.workoutId]}),false,'grandfathered events remain bounded by the old catalog');
    assert.equal(isGameState({...migrated,legacyAbilityUseIds:[...migrated.legacyAbilityUseIds!,crypto.randomUUID()]}),false);
    assert.deepEqual(legacy,snapshot,'migration must not rewrite its input');

    let continued=restored;
    const acquiredAt=new Date(Math.max(...legacy.abilityUses.map(use=>Date.parse(use.awardedAt)))+1000).toISOString();
    for(let index=1;index<=formerCharges;index++){
      const copy={...original.inventory[0],id:crypto.randomUUID(),acquiredAt};
      continued={...continued,inventory:[...continued.inventory,copy],transactions:[...continued.transactions,{id:crypto.randomUUID(),kind:'crate',itemId:copy.id,amount:-100,createdAt:acquiredAt}]};
      assert.ok(isGameState(continued));
      assert.equal(getAbilityCharges(continued,gearId),1,'every new copy grants a usable charge immediately, without historical debt');
      const usable=applyWorkoutAbility(continued,session(gearId,group),history);
      assert.ok(usable.reward);
      assert.equal(getAbilityCharges(usable.game,gearId),0);
      assert.ok(isGameState(usable.game));
      assert.deepEqual(usable.game.legacyAbilityUseIds,migrated.legacyAbilityUseIds);
      assert.equal(applyWorkoutAbility(usable.game,session(gearId,group),history).reward,null);
      continued=usable.game;
      history.push(usable.workout);
    }
    const finalRestore=previewBackup(createBackup({...base,game:continued,workouts:history}),base).merged.game!;
    assert.equal(getAbilityCharges(finalRestore,gearId),0);
    assert.deepEqual(finalRestore.abilityUses,continued.abilityUses);
  }
});

test('legacy migration allocates one ordinary use to each copy acquired between historical extra uses',()=>{
  const now=Date.now(), original=owned(['lime-shorts','lime-shorts']);
  original.inventory[0].acquiredAt=new Date(now-10000).toISOString();
  original.inventory[1].acquiredAt=new Date(now-5000).toISOString();
  original.transactions=original.inventory.map(copy=>({id:crypto.randomUUID(),kind:'crate',itemId:copy.id,amount:-100,createdAt:copy.acquiredAt}));
  const uses=[-9000,-8000,-4000,-3000].map(offset=>({
    ...applyWorkoutAbility(original,session('lime-shorts'),[]).reward!,awardedAt:new Date(now+offset).toISOString(),
  }));
  const legacy={...original,abilityUses:uses};
  delete legacy.abilityChargeVersion;
  delete legacy.legacyAbilityUseIds;
  assert.ok(isGameState(legacy));
  const migrated=normalizeGame(legacy);
  assert.deepEqual(migrated.legacyAbilityUseIds,[uses[1].workoutId,uses[3].workoutId]);
  assert.deepEqual(migrated.abilityUses,uses);
  assert.equal(getAbilityCharges(migrated,'lime-shorts'),0);
  const copy={...original.inventory[0],id:crypto.randomUUID(),acquiredAt:new Date(now).toISOString()};
  const continued={...migrated,inventory:[...migrated.inventory,copy],transactions:[...migrated.transactions,{id:crypto.randomUUID(),kind:'crate' as const,itemId:copy.id,amount:-100,createdAt:copy.acquiredAt}]};
  assert.ok(isGameState(continued));
  assert.equal(getAbilityCharges(continued,'lime-shorts'),1);
  const spent=applyWorkoutAbility(continued,session('lime-shorts'),[]);
  assert.ok(spent.reward);
  assert.equal(getAbilityCharges(spent.game,'lime-shorts'),0);
  assert.ok(isGameState(spent.game));
});

test('credit abilities pay on a valid completed workout and deletion never refunds their consumed charge',()=>{
  const original=owned(['plasma-blaster']);
  const workout=session('plasma-blaster','Pecho');
  const awarded=applyWorkoutAbility(original,workout,[workout]);
  assert.equal(awarded.reward?.bonusCredits,40);
  assert.equal(awarded.reward?.bonusXp,0);
  assert.equal(getAbilityCharges(awarded.game,'plasma-blaster'),0);
  assert.equal(workoutReward(awarded.workout,[awarded.workout]).abilityCredits,40);
  assert.equal(gameBalance(awarded.game,[awarded.workout])-gameBalance(original,[workout]),40);
  assert.equal(gameBalance(awarded.game,[{...awarded.workout,status:'deleted'}]),gameBalance(awarded.game,[]));
  const again=applyWorkoutAbility(awarded.game,workout,[workout]);
  assert.equal(getAbilityCharges(again.game,'plasma-blaster'),0);
  assert.equal(again.game.abilityUses?.length,1);
});

test('all equipment has balanced definitions; malformed or repeated ability events are rejected',()=>{
  assert.equal(ABILITIES.length,GEAR.length);
  assert.ok(ABILITIES.every(ability=>ability.percent<=15&&ability.maxXp<=100&&ability.chargesPerDrop===1));
  assert.equal(getAbilityDefinition('void-greaves')?.target,'legs');
  const awarded=applyWorkoutAbility(owned(['lime-shorts']),session('lime-shorts'),[]);
  const invalid=structuredClone(awarded.game);
  invalid.abilityUses!.push({...invalid.abilityUses![0]});
  assert.equal(isGameState(invalid),false);
  assert.equal(isAbilityUse({...awarded.reward,bonusXp:999}),false);
  assert.equal(isAbilityUse({...awarded.reward,setBonuses:{bad:2}}),false);
  assert.equal(isGameState({...normalizeGame(),activeAbilityId:'lime-shorts'}),false);
});

test('adult companions unlock permanently, cannot be sold, and hidden drops cannot be equipped',()=>{
  let game=owned([],['dragon-queen']);
  assert.ok(isGameState(game));
  game=equipCompanion(game,'dragon-queen');
  assert.equal(game.equippedCompanionId,'dragon-queen');
  assert.strictEqual(sellItem(game,game.inventory[0].id),game);
  assert.equal(game.inventory[0].sold,false);
  assert.equal(game.equippedCompanionId,'dragon-queen');
  assert.equal(unlockedCompanions(game).length,1);
  assert.ok(COMPANIONS.every(companion=>companion.adult));
  const hidden=owned([],['athlete']);
  hidden.pendingOpening={itemId:hidden.inventory[0].id,startedAt:hidden.inventory[0].acquiredAt,stage:'spinning'};
  assert.ok(isGameState(hidden));
  assert.equal(unlockedCompanions(hidden).length,0);
  assert.strictEqual(equipCompanion(hidden,'athlete'),hidden);
});

test('restoring or reimporting an ability event never refunds charges or changes permanent sold cosmetics',()=>{
  const base:AppData={routines:[],customExercises:[],workouts:[]};
  const original=equipCosmetic(owned(['lime-shorts']),'lime-shorts');
  const applied=applyWorkoutAbility(original,session('lime-shorts'),[]);
  const sold=legacySaleSnapshot(applied.game,applied.game.inventory[0].id);
  const snapshot={...base,workouts:[applied.workout],game:sold};
  const restored=previewBackup(createBackup(snapshot),base);
  assert.equal(restored.conflicts.length,0);
  assert.equal(getAbilityCharges(restored.merged.game!,'lime-shorts'),0);
  assert.equal(restored.merged.game?.cosmeticGear?.bottom,'lime-shorts');
  const repeated=previewBackup(createBackup(snapshot),restored.merged);
  assert.equal(repeated.conflicts.length,0);
  assert.equal(repeated.merged.game?.abilityUses?.length,1);
  assert.equal(getAbilityCharges(repeated.merged.game!,'lime-shorts'),0);
  const old=previewBackup(createBackup({...base,game:original}),restored.merged);
  assert.equal(getAbilityCharges(old.merged.game!,'lime-shorts'),0);
  assert.equal(old.merged.game?.inventory[0].sold,true);
  assert.equal(old.merged.game?.cosmeticGear?.bottom,'lime-shorts');
});

test('independent ability spending branches conflict even when purchase transactions match',()=>{
  const base:AppData={routines:[],customExercises:[],workouts:[]};
  const original=owned(['lime-shorts']);
  const first=applyWorkoutAbility(original,session('lime-shorts'),[]);
  const second=applyWorkoutAbility(original,session('lime-shorts'),[]);
  assert.deepEqual(first.game.transactions,second.game.transactions);
  const result=previewBackup(createBackup({...base,game:second.game,workouts:[second.workout]}),{...base,game:first.game,workouts:[first.workout]});
  assert.ok(result.conflicts.some(conflict=>conflict.includes('habilidades')));
  assert.equal(result.merged.game?.abilityUses?.length,1);
});

test('copied ability rewards and missing consumption ledgers cannot grant credits or pass backup validation',()=>{
  const base:AppData={routines:[],customExercises:[],workouts:[]};
  const applied=applyWorkoutAbility(owned(['plasma-blaster']),session('plasma-blaster','Pecho'),[]);
  const copied={...applied.workout,id:crypto.randomUUID()};
  assert.equal(workoutReward(copied,[copied]).abilityCredits,0);
  assert.equal(gameBalance(applied.game,[copied]),gameBalance({...applied.game,abilityUses:[]},[copied]));
  assert.throws(()=>previewBackup(createBackup({...base,game:applied.game,workouts:[copied]}),base),/habilidad/);
  const missing={...applied.game,abilityUses:[]};
  assert.equal(gameBalance(missing,[applied.workout]),gameBalance(applied.game,[applied.workout])-40);
  assert.throws(()=>previewBackup(createBackup({...base,game:missing,workouts:[applied.workout]}),base),/movimiento/);
  const deleted={...applied.workout,status:'deleted' as const};
  const restored=previewBackup(createBackup({...base,game:applied.game,workouts:[deleted]}),base);
  assert.equal(getAbilityCharges(restored.merged.game!,'plasma-blaster'),0);
  assert.equal(gameBalance(restored.merged.game!,restored.merged.workouts),gameBalance(restored.merged.game!,[]));
});
