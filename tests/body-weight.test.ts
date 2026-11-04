import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bodyWeightXp, recordBodyWeight, setWeightGoal, weightEntries } from '../src/lib/body-weight';
import { DEFAULT_PROFILE, isAthleteProfile, normalizeProfile } from '../src/lib/strength';
import { economicXp, gameBalance, gameProgress, normalizeGame } from '../src/lib/game';
import { createBackup, previewBackup } from '../src/lib/backup';
import { emptyData, type Workout } from '../src/lib/model';
import { resetAccountData } from '../src/lib/account-reset';
import { blankDocument, mergeDocuments } from '../src/lib/remote/document';
import { GEAR } from '../src/lib/gear';
import { GEAR_CATALOG_ART } from '../src/lib/gear-catalog-art';
import { CHARACTER_ATLAS } from '../src/lib/character-art';

const day = '2026-11-04';
const record = (p: ReturnType<typeof setWeightGoal>, date: string, weightKg: number) => recordBodyWeight(p, { date, weightKg }, day);

test('both directions earn identical goal XP and moving away never subtracts it', () => {
  for (const [from, to] of [[70, 72], [90, 88]]) {
    const original = { ...DEFAULT_PROFILE, weightKg: from };
    const goal = setWeightGoal(original, 80), next = record(goal, '2026-11-01', to);
    assert.equal(bodyWeightXp(next), 200);
    assert.equal(gameProgress(normalizeGame(), [], next, '2026').xp, 200);
    assert.equal(gameBalance(normalizeGame(), [], next, 0), 140);
    assert.equal(bodyWeightXp(record(next, '2026-11-02', from)), 200);
    assert.equal(original.weightKg, from);
    assert.equal(next.rewardWeightKg, from);
  }
});

test('editing, backfilling, repeated saves, oscillation, overshooting and changing goals cannot repay progress', () => {
  let p = setWeightGoal(DEFAULT_PROFILE, 80);
  p = record(p, '2026-10-28', 72);
  p = record(p, '2026-10-28', 72);
  p = record(p, '2026-10-28', 74); // correction earns nothing
  p = record(p, '2026-10-27', 70); // backfill earns nothing
  assert.equal(p.weightKg, 74);
  assert.equal(bodyWeightXp(p), 200);
  p = record(p, '2026-10-29', 72); // return to already reached distance
  assert.equal(bodyWeightXp(p), 200);
  p = record(p, '2026-10-30', 74);
  assert.equal(bodyWeightXp(p), 400);
  p = record(p, '2026-10-31', 82); // closer, overshooting the target
  assert.equal(bodyWeightXp(p), 800);
  p = record(p, '2026-11-01', 80);
  assert.equal(bodyWeightXp(p), 1000);
  p = record(p, '2026-11-02', 79);
  p = record(p, '2026-11-03', 80);
  assert.equal(bodyWeightXp(p), 1000);
  const total = bodyWeightXp(p);
  p = setWeightGoal(p, 70);
  p = record(p, '2026-11-04', 72);
  assert.equal(bodyWeightXp(p), total); // the same physical interval was already rewarded
});

test('weight-only logging is XP neutral and legacy training rewards do not change on weight gain or loss', () => {
  const workout: Workout = { id: crypto.randomUUID(), name: 'Banca', date: '2026-10-01', color: '#d8ff3e', status: 'finished', createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z', exercises: [{ id: crypto.randomUUID(), exerciseId: 'press-banca-barra', name: 'Banca', group: 'Pecho', mode: 'external_load_reps', sets: [{ id: crypto.randomUUID(), weight: 70, reps: 10, confirmed: true }] }] };
  const game = normalizeGame(), original = economicXp(game, [workout], DEFAULT_PROFILE);
  for (const weightKg of [60, 90]) {
    const p = recordBodyWeight(DEFAULT_PROFILE, { date: day, weightKg }, day);
    assert.equal(economicXp(game, [workout], p), original);
    assert.equal(bodyWeightXp(p), 0);
    assert.equal(normalizeProfile(p).weightKg, weightKg);
  }
});

test('the first measurement without a known legacy weight creates a baseline and validates dates/values', () => {
  const p = record(setWeightGoal(undefined, 80), day, 90);
  assert.equal(bodyWeightXp(p), 0);
  assert.equal(p.weightTracking?.baselineKg, 90);
  for (const entry of [{ date: '2026-11-05', weightKg: 72 }, { date: '2026-02-30', weightKg: 72 }, { date: day, weightKg: NaN }, { date: day, weightKg: 72.22 }]) assert.throws(() => recordBodyWeight(p, entry, day));
  assert.equal(isAthleteProfile({ ...p, weightTracking: { ...p.weightTracking, rewards: [{ date: day, xp: -10 }] } }), false);
});

test('weight history and its replay ledger survive backups, sync conflicts and annual resets', () => {
  let profile = record(setWeightGoal(DEFAULT_PROFILE, 80), '2025-12-31', 72);
  profile = record(profile, '2026-01-01', 74);
  const data = { ...emptyData(), profile, game: normalizeGame() };
  const restored = previewBackup(createBackup(data), emptyData()).merged;
  assert.deepEqual(restored.profile, profile);
  assert.equal(bodyWeightXp(restored.profile, '2025'), 200);
  assert.equal(bodyWeightXp(restored.profile, '2026'), 200);
  const base = blankDocument(), local = { ...base, data }, server = { ...base, data: { ...emptyData(), profile: record(profile, day, 76) } };
  const conflict = mergeDocuments(base, local, server);
  assert.ok(conflict.unresolved.some(c => c.key === 'activity'));
  assert.deepEqual(mergeDocuments(base, local, server, { activity: 'local' }).document.data.profile, profile);
  const reset = resetAccountData(data);
  assert.deepEqual(weightEntries(reset.profile), weightEntries(profile));
  assert.equal(bodyWeightXp(reset.profile), 0);
  assert.equal(bodyWeightXp(record(reset.profile!, day, 72)), 0);
});

test('every cosmetic has original catalog artwork independent from equipped art', () => {
  for (const gear of GEAR) {
    const art = GEAR_CATALOG_ART[gear.id];
    assert.ok(art, gear.id);
    assert.notEqual(art.src, CHARACTER_ATLAS.src);
    const png = readFileSync(new URL(`../public${art.src}`, import.meta.url));
    assert.equal(png.readUInt32BE(16), art.width);
    assert.equal(png.readUInt32BE(20), art.height);
    const [x, y, w, h] = art.source;
    assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= art.width && y + h <= art.height, gear.id);
  }
});
