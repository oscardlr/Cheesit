import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GEAR } from '../src/lib/gear';
import { GEAR_ART, GEAR_ART_ATLAS } from '../src/lib/gear-art';
import { GearArtwork } from '../src/components/GearArtwork';
import { AVATAR_VIEWBOX } from '../src/lib/avatar-fit';
import { ABILITIES, abilityMatches, getAbilityDefinition, isAbilityUse } from '../src/lib/abilities';
import { applyWorkoutAbility, equipCosmetic, gameBalance, getAbilityCharges, isGameState, normalizeGame, rewardForRoll, setActiveAbility, type GameState } from '../src/lib/game';
import { createBackup, previewBackup } from '../src/lib/backup';
import { rewardSetIndex, workoutReward } from '../src/lib/rewards';
import { muscleActivity, type MuscleId } from '../src/lib/muscles';
import type { AppData, Workout } from '../src/lib/model';

const expansion = GEAR.filter(gear => gear.artwork === 'forge');
const originalIds = ['purple-tank', 'lime-shorts', 'crimson-shorts', 'dragon-head', 'champion-crown', 'headphones', 'titan-sword', 'plasma-blaster', 'violet-cape', 'neon-wings', 'golden-armor', 'training-tank', 'phoenix-crown', 'celestial-armor', 'storm-tank', 'void-greaves', 'mecha-shorts', 'thunder-hammer', 'starlight-gauntlet', 'solar-cape'];
const groups: [string, string, MuscleId][] = [
  ['Pecho', 'press-banca-barra', 'chest'], ['Espalda', 'jalon-pecho', 'back'], ['Hombro', 'press-militar', 'shoulders'],
  ['Bíceps', 'curl-barra', 'biceps'], ['Tríceps', 'extension-triceps-polea', 'triceps'], ['Pierna y glúteo', 'extension-cuadriceps', 'quads'], ['Abdominales', 'crunch-abdominal', 'abs'],
];

function owned(gearId: string, copies = 1): GameState {
  const definition = GEAR.find(gear => gear.id === gearId)!;
  const acquiredAt = new Date(Date.now() - 1000).toISOString();
  const inventory = Array.from({ length: copies }, () => ({ id: crypto.randomUUID(), kind: 'gear' as const, gearId, rarity: definition.rarity, acquiredAt, crateId: 'starter', sold: false }));
  return { ...normalizeGame(), inventory, transactions: inventory.map(item => ({ id: crypto.randomUUID(), kind: 'crate' as const, itemId: item.id, amount: -100, createdAt: acquiredAt })) };
}

function workout(abilityId: string): Workout {
  return { id: crypto.randomUUID(), name: 'Entrenamiento de colección', color: '#0057C2', date: '2026-10-28', status: 'finished', createdAt: '2026-10-28T08:00:00Z', updatedAt: '2026-10-28T09:00:00Z', abilityId,
    exercises: groups.map(([group, exerciseId, muscle]) => ({ id: crypto.randomUUID(), exerciseId, name: group, group, mode: 'external_load_reps', sets: Array.from({ length: 3 }, () => ({ id: crypto.randomUUID(), weight: 50, reps: 10, confirmed: true })) })) };
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

test('all 15 pixel sprites use distinct valid atlas crops and anatomical worn art', () => {
  const atlas = readFileSync(new URL(`../public${GEAR_ART_ATLAS.src}`, import.meta.url));
  assert.deepEqual([...atlas.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(atlas.toString('ascii', 12, 16), 'IHDR');
  assert.equal(atlas.readUInt32BE(16), GEAR_ART_ATLAS.width);
  assert.equal(atlas.readUInt32BE(20), GEAR_ART_ATLAS.height);
  const sources = new Set<string>();
  const crops: { id: string; source: readonly [number, number, number, number]; sourceClip?: string }[] = [];
  for (const gear of expansion) {
    const metadata = GEAR_ART[gear.id];
    assert.ok(metadata, gear.id);
    assert.ok(metadata.bounds.every(Number.isFinite));
    assert.ok(metadata.bounds[2] > 0 && metadata.bounds[3] > 0);
    const [x, y, width, height] = metadata.source;
    assert.ok(metadata.source.every(Number.isSafeInteger), `${gear.id}: atlas pixel coordinates`);
    assert.ok(x >= 0 && y >= 0 && width > 32 && height > 32, `${gear.id}: meaningful sprite crop`);
    assert.ok(x + width <= GEAR_ART_ATLAS.width && y + height <= GEAR_ART_ATLAS.height, `${gear.id}: crop stays inside the atlas`);
    for (const crop of crops) {
      const [otherX, otherY, otherWidth, otherHeight] = crop.source;
      const disjoint = x + width <= otherX || otherX + otherWidth <= x || y + height <= otherY || otherY + otherHeight <= y;
      assert.ok(disjoint || (metadata.sourceClip && crop.sourceClip), `${gear.id} and ${crop.id} need explicit silhouettes where their atlas rectangles overlap`);
    }
    crops.push({ id: gear.id, source: metadata.source, sourceClip: metadata.sourceClip });
    sources.add(metadata.source.join(' '));
    if (gear.slot === 'top') assert.equal(metadata.silhouette, 'torso');
    if (gear.slot === 'bottom') {
      assert.ok(metadata.fabric, `${gear.id}: replace the initial boxer colour`);
      if (metadata.bounds[3] <= 200) assert.equal(metadata.silhouette, 'shorts');
    }
    const icon = renderToStaticMarkup(createElement(GearArtwork, { gearId: gear.id }));
    const worn = renderToStaticMarkup(createElement(GearArtwork, { gearId: gear.id, worn: true }));
    const content = renderToStaticMarkup(createElement('svg', null, createElement(GearArtwork, { gearId: gear.id, worn: true, contentOnly: true })));
    assert.match(icon, /gear-forge/);
    assert.ok(icon.includes(`viewBox="${metadata.source.join(' ')}"`));
    assert.ok(icon.includes(`href="${GEAR_ART_ATLAS.src}"`));
    assert.match(icon, /<image /);
    if (metadata.sourceClip) {
      assert.ok(icon.includes(`d="${metadata.sourceClip}"`));
      assert.ok(content.includes(`d="${metadata.sourceClip}"`));
    }
    assert.ok(worn.includes(`viewBox="${AVATAR_VIEWBOX}"`));
    assert.ok(worn.includes(`character-slot-${gear.slot}`));
    assert.ok(content.startsWith('<svg><g '));
    assert.ok(content.includes(`viewBox="${metadata.source.join(' ')}"`));
    assert.match(content, /overflow="hidden"/);
    assert.ok(content.includes(`href="${GEAR_ART_ATLAS.src}"`));
    assert.doesNotMatch(content, /character-equipped/);
  }
  assert.equal(sources.size, 15);
  assert.equal(renderToStaticMarkup(createElement(GearArtwork, { gearId: 'unknown' })), '');
  assert.equal(GEAR_ART['ronin-hand'].grip, true);
  assert.equal(GEAR_ART['glacier-hand'].grip, true);
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
