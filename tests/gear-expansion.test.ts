import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GEAR } from '../src/lib/gear';
import { CHARACTER_ART, CHARACTER_ATLAS, CHARACTER_VIEWBOX, type CharacterRect } from '../src/lib/character-art';
import { GearArtwork } from '../src/components/GearArtwork';
import { ABILITIES, abilityMatches, getAbilityDefinition, isAbilityUse } from '../src/lib/abilities';
import { applyWorkoutAbility, equipCosmetic, gameBalance, getAbilityCharges, isGameState, normalizeGame, rewardForRoll, setActiveAbility, type GameState } from '../src/lib/game';
import { createBackup, previewBackup } from '../src/lib/backup';
import { rewardSetIndex, workoutReward } from '../src/lib/rewards';
import { muscleActivity, type MuscleId } from '../src/lib/muscles';
import type { AppData, Workout } from '../src/lib/model';

const expansion = GEAR.filter(gear => gear.artwork === 'forge');
const originalIds = ['purple-tank', 'lime-shorts', 'crimson-shorts', 'dragon-head', 'champion-crown', 'headphones', 'titan-sword', 'plasma-blaster', 'violet-cape', 'neon-wings', 'golden-armor', 'training-tank', 'phoenix-crown', 'celestial-armor', 'storm-tank', 'void-greaves', 'mecha-shorts', 'thunder-hammer', 'starlight-gauntlet', 'solar-cape'];
const groups: [string, string, MuscleId][] = [
  ['Pecho', 'press-banca-barra', 'chest'], ['Espalda', 'remo-barra', 'back'], ['Hombro', 'press-militar', 'shoulders'],
  ['Bíceps', 'curl-barra', 'biceps'], ['Tríceps', 'extension-triceps-polea', 'triceps'], ['Pierna y glúteo', 'sentadilla-barra', 'quads'], ['Abdominales', 'crunch-abdominal', 'abs'],
];

function owned(gearId: string, copies = 1): GameState {
  const definition = GEAR.find(gear => gear.id === gearId)!;
  const acquiredAt = new Date(Date.now() - 1000).toISOString();
  const inventory = Array.from({ length: copies }, () => ({ id: crypto.randomUUID(), kind: 'gear' as const, gearId, rarity: definition.rarity, acquiredAt, crateId: 'starter', sold: false }));
  return { ...normalizeGame(), inventory, transactions: inventory.map(item => ({ id: crypto.randomUUID(), kind: 'crate' as const, itemId: item.id, amount: -100, createdAt: acquiredAt })) };
}

function workout(abilityId: string): Workout {
  return { id: crypto.randomUUID(), name: 'Entrenamiento de colección', color: '#0057C2', date: '2026-10-28', status: 'finished', createdAt: '2026-10-28T08:00:00Z', updatedAt: '2026-10-28T09:00:00Z', abilityId,
    exercises: groups.map(([group, exerciseId, muscle]) => ({ id: crypto.randomUUID(), exerciseId, name: group, group, mode: 'external_load_reps', loadConvention: 'total', primaryMuscles: [muscle], secondaryMuscles: [], sets: Array.from({ length: 3 }, () => ({ id: crypto.randomUUID(), weight: 50, reps: 10, confirmed: true })) })) };
}

test('three complete native collections extend the original 20 stable gear definitions', () => {
  assert.equal(GEAR.length, 35);
  assert.deepEqual(GEAR.slice(0, 20).map(gear => gear.id), originalIds);
  assert.equal(new Set(GEAR.map(gear => gear.id)).size, 35);
  assert.deepEqual([...new Set(expansion.map(gear => gear.collection))], ['Ronin Carmesí', 'Guardián glacial', 'Explorador cósmico']);
  for (const collection of new Set(expansion.map(gear => gear.collection))) {
    const pieces = expansion.filter(gear => gear.collection === collection);
    assert.deepEqual(pieces.map(gear => gear.slot).sort(), ['back', 'bottom', 'hand', 'head', 'top']);
    assert.deepEqual(new Set(pieces.map(gear => gear.rarity)), new Set(['common', 'rare', 'epic', 'legendary']));
  }
  assert.equal(ABILITIES.length, GEAR.length);
  assert.equal(new Set(expansion.map(gear => gear.abilityName)).size, 15);
  for (const gear of expansion) {
    assert.ok(gear.description.length > 35);
    assert.equal(getAbilityDefinition(gear.id)?.name, gear.abilityName);
    assert.notEqual(gear.name, gear.abilityName);
    const game = equipCosmetic(owned(gear.id), gear.id);
    assert.ok(isGameState(game), gear.id);
    assert.equal(game.cosmeticGear?.[gear.slot], gear.id);
    const pool = GEAR.filter(candidate => candidate.rarity === gear.rarity);
    assert.equal(rewardForRoll(gear.rarity, 0, (pool.findIndex(candidate => candidate.id === gear.id) + .5) / pool.length).id, gear.id);
  }
});

test('all 35 cosmetics share registered icon and worn art without deforming their source', () => {
  const atlas = readFileSync(new URL(`../public${CHARACTER_ATLAS.src}`, import.meta.url));
  assert.deepEqual([...atlas.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(atlas.toString('ascii', 12, 16), 'IHDR');
  assert.equal(atlas.readUInt32BE(16), CHARACTER_ATLAS.width);
  assert.equal(atlas.readUInt32BE(20), CHARACTER_ATLAS.height);
  const sources = new Set<string>();
  const crops: { id: string; source: CharacterRect }[] = [];
  for (const gear of GEAR) {
    const metadata = CHARACTER_ART[gear.id];
    assert.ok(metadata, gear.id);
    assert.equal(metadata.slot, gear.slot);
    assert.ok(metadata.target.every(Number.isFinite));
    assert.ok(metadata.target[2] > 0 && metadata.target[3] > 0);
    const [x, y, width, height] = metadata.source;
    assert.ok(metadata.source.every(Number.isSafeInteger), `${gear.id}: atlas pixel coordinates`);
    assert.ok(x >= 0 && y >= 0 && width > 32 && height > 32, `${gear.id}: meaningful sprite crop`);
    assert.ok(x + width <= CHARACTER_ATLAS.width && y + height <= CHARACTER_ATLAS.height, `${gear.id}: crop stays inside the atlas`);
    const scaleX = metadata.target[2] / width;
    const scaleY = metadata.target[3] / height;
    assert.ok(Math.abs(scaleX - scaleY) < 1e-9, `${gear.id}: equipped art scales uniformly`);
    if (metadata.origin === 'tailored') assert.equal(scaleX, 1, `${gear.id}: tailored pixels retain their master registration`);
    for (const crop of crops) {
      const [otherX, otherY, otherWidth, otherHeight] = crop.source;
      const disjoint = x + width <= otherX || otherX + otherWidth <= x || y + height <= otherY || otherY + otherHeight <= y;
      assert.ok(disjoint, `${gear.id} and ${crop.id}: independent transparent crops cannot contain another cosmetic`);
    }
    crops.push({ id: gear.id, source: metadata.source });
    sources.add(metadata.source.join(' '));
    if (gear.slot === 'top' || gear.slot === 'bottom') assert.equal(metadata.origin, 'tailored', `${gear.id}: clothing is drawn for this master`);
    const icon = renderToStaticMarkup(createElement(GearArtwork, { gearId: gear.id }));
    const worn = renderToStaticMarkup(createElement(GearArtwork, { gearId: gear.id, worn: true }));
    const content = renderToStaticMarkup(createElement('svg', null, createElement(GearArtwork, { gearId: gear.id, worn: true, contentOnly: true })));
    assert.match(icon, /gear-forge/);
    assert.ok(icon.includes(`viewBox="${metadata.source.join(' ')}"`));
    assert.ok(icon.includes(`href="${CHARACTER_ATLAS.src}"`));
    assert.match(icon, /<image /);
    assert.ok(worn.includes(`viewBox="${CHARACTER_VIEWBOX}"`));
    assert.ok(worn.includes(`character-slot-${gear.slot}`));
    assert.ok(content.startsWith('<svg><svg '));
    assert.ok(content.includes(`viewBox="${metadata.source.join(' ')}"`));
    assert.match(content, /overflow="hidden"/);
    assert.ok(content.includes(`href="${CHARACTER_ATLAS.src}"`));
    assert.doesNotMatch(content, /character-equipped/);
    for (const rendered of [icon, worn, content]) {
      assert.ok(rendered.includes(`data-art-source="${metadata.source.join(' ')}"`), `${gear.id}: identical source in every renderer`);
      assert.match(rendered, /preserveAspectRatio="xMidYMid meet"/);
      assert.doesNotMatch(rendered, /preserveAspectRatio="none"|transform="scale\(/);
    }
    assert.equal(icon.match(/<image [^>]+>/)?.[0], worn.match(/<image [^>]+>/)?.[0], `${gear.id}: thumbnail and worn image are identical`);
  }
  assert.equal(sources.size, GEAR.length);
  assert.equal(GEAR.filter(gear => CHARACTER_ART[gear.id].origin === 'tailored').length, 16);
  assert.equal(GEAR.filter(gear => CHARACTER_ART[gear.id].origin === 'reused').length, 19);
  assert.equal(renderToStaticMarkup(createElement(GearArtwork, { gearId: 'unknown' })), '');
  assert.equal(CHARACTER_ART['ronin-hand'].grip, true);
  assert.equal(CHARACTER_ART['glacier-hand'].grip, true);
});

test('all 15 abilities apply real balanced rewards only to their intended exercise groups', () => {
  const targets = new Set<string>();
  for (const gear of expansion) {
    const ability = getAbilityDefinition(gear.id)!;
    targets.add(ability.target);
    assert.equal(ability.chargesPerDrop, 1);
    assert.ok(ability.percent > 0 && ability.percent <= 15);
    assert.ok(ability.maxXp <= 100);
    const game = setActiveAbility(owned(gear.id), gear.id);
    const session = workout(gear.id);
    const before = workoutReward(session, [session]);
    const result = applyWorkoutAbility(game, session, [session]);
    assert.ok(result.reward, gear.id);
    assert.ok(isAbilityUse(result.reward));
    assert.ok(isGameState(result.game));
    assert.equal(getAbilityCharges(result.game, gear.id), 0);
    assert.equal(result.game.activeAbilityId, null);
    const after = workoutReward(result.workout, [result.workout]);
    assert.equal(after.totalXp - before.totalXp, result.reward.bonusXp);
    assert.equal(after.abilityCredits, result.reward.bonusCredits);
    assert.equal(gameBalance(result.game, [result.workout]) - gameBalance(game, [session]), after.credits - before.credits);
    const setRewards = rewardSetIndex([result.workout]);
    for (const exercise of session.exercises) {
      for (const set of exercise.sets) {
        const bonus: number = result.reward.setBonuses[set.id] ?? 0;
        assert.equal(setRewards.get(set.id)?.abilityXp ?? 0, bonus);
        if (!abilityMatches(ability, exercise) || ability.target === 'credits') assert.equal(bonus, 0, `${gear.id}: ${exercise.group}`);
      }
    }
    const previousMuscles = muscleActivity([session], session.date, 7);
    const nextMuscles = muscleActivity([result.workout], session.date, 7);
    for (const [group, , muscle] of groups) {
      if (!abilityMatches(ability, { group }) || ability.target === 'credits') {
        assert.equal(nextMuscles.find(item => item.id === muscle)?.xp, previousMuscles.find(item => item.id === muscle)?.xp, `${gear.id} must not boost ${muscle}`);
      }
    }
    if (!['all', 'credits'].includes(ability.target)) {
      const wrong = { ...workout(gear.id), exercises: session.exercises.filter(exercise => !abilityMatches(ability, exercise)) };
      assert.equal(applyWorkoutAbility(game, wrong, []).reward, null);
      assert.equal(getAbilityCharges(game, gear.id), 1);
    }
  }
  assert.deepEqual(targets, new Set(['all', 'push', 'legs', 'arms', 'pull', 'credits']));
});

test('new cosmetics and spent duplicate charges persist across JSON and backup restoration', () => {
  const empty: AppData = { routines: [], workouts: [], customExercises: [] };
  for (const gear of expansion) {
    let game = equipCosmetic(owned(gear.id, 2), gear.id);
    const pending = { ...game, pendingOpening: { itemId: game.inventory[1].id, startedAt: game.inventory[1].acquiredAt, stage: 'spinning' as const } };
    assert.ok(isGameState(pending));
    assert.equal(getAbilityCharges(pending, gear.id), 1);
    const history: Workout[] = [];
    for (let index = 0; index < 2; index++) {
      const applied = applyWorkoutAbility(game, workout(gear.id), history);
      assert.ok(applied.reward);
      game = applied.game;
      history.push(applied.workout);
    }
    assert.equal(getAbilityCharges(game, gear.id), 0);
    assert.equal(applyWorkoutAbility(game, workout(gear.id), history).reward, null);
    const snapshot = normalizeGame(JSON.parse(JSON.stringify(game)));
    assert.deepEqual(snapshot, game);
    const restored = previewBackup(createBackup({ ...empty, game: snapshot, workouts: history }), empty).merged;
    assert.deepEqual(restored.game, game);
    assert.equal(getAbilityCharges(restored.game!, gear.id), 0);
    assert.equal(restored.game?.cosmeticGear?.[gear.slot], gear.id);
  }
});
