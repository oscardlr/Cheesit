import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../src/lib/catalog';
import { emptyData, exerciseSnapshot, newId, newSet, newWorkout, copyPreviousSets, type AppData, type Routine, type Workout } from '../src/lib/model';
import { totals, comparableSets, workoutCopySessions, workoutExerciseSessions } from '../src/lib/metrics';
import { gameProgress, normalizeGame, applyWorkoutAbility } from '../src/lib/game';
import { rewardProgress, setReward, workoutReward } from '../src/lib/rewards';
import { getObjectiveMissions } from '../src/lib/objectives';
import { createBackup, previewBackup, validateData } from '../src/lib/backup';
import { advanceCycle, captureMoments, completesRound, consistencyInsight, groupWith, nextCycleRoutine, observeWeeklyGoal, progressInsights, recoverMoments, snapshotAppearance, supersetLabel, trainingFeatures, ungroup, validTrainingFeatures, weeklySummary } from '../src/lib/training-features';
import { blankDocument, mergeDocuments } from '../src/lib/remote/document';
import { addDays } from '../src/lib/dates';

function session(date: string, reps = 8, weight = 40, kind?: 'work' | 'warmup'): Workout {
  return { ...newWorkout(), date, status: 'finished', exercises: [{ id: newId(), ...exerciseSnapshot(CATALOG.find(e => e.id === 'press-banca-barra')!), sets: [{ ...newSet(), weight, reps, kind, confirmed: true }] }] };
}
const routine = (name: string): Routine => ({ id: newId(), name, color: '#d8ff3e', archived: false, exercises: [{ id: newId(), exerciseId: 'press-banca-barra', sets: 2, setKinds: ['warmup', 'work'] }] });

test('warmups persist and validate without work metrics, XP, records, missions, ability charges or e1RM; legacy sets stay work', () => {
  const warmup = session('2026-11-03', 100, 500, 'warmup'), legacy = session('2026-11-02');
  assert.equal(workoutExerciseSessions([warmup],warmup.exercises[0].exerciseId).length,0);
  assert.equal(totals([warmup]).sets, 0); assert.equal(totals([warmup]).volume, 0);
  assert.equal(rewardProgress([warmup]).xp, 0); assert.equal(workoutReward(warmup, [warmup]).totalXp, 0);
  assert.equal(setReward(warmup.exercises[0], warmup.exercises[0].sets[0], [legacy], warmup.id, warmup.date).record, false);
  assert.equal(getObjectiveMissions([warmup], warmup.date, normalizeGame()).find(m => m.id.startsWith('sessions:'))!.current, 0);
  assert.equal(getObjectiveMissions([warmup], warmup.date, normalizeGame()).find(m => m.id.startsWith('sets:'))!.current, 0);
  assert.equal(applyWorkoutAbility(normalizeGame(), warmup, []).reward, null);
  assert.equal(totals([legacy, warmup]).sets, 1);
  assert.deepEqual(comparableSets(legacy.exercises[0], warmup.exercises[0]), { loads: [], repetitions: [] });
  assert.equal(validateData({ ...emptyData(), workouts: [warmup, legacy] }).workouts[0].exercises[0].sets[0].kind, 'warmup');
  const next = session('2026-11-04', 11); assert.match(progressInsights([legacy, warmup, next], next.id)[0].text, /3 repeticiones más/);
});

test('routine, previous-set copy and JSON backup preserve individual kinds and superset identities', () => {
  const r = routine('A'); r.exercises.push({ ...r.exercises[0], id: newId() });
  r.exercises = groupWith(r.exercises, r.exercises[0].id, r.exercises[1].id);
  const w = newWorkout(r); assert.deepEqual(w.exercises[0].sets.map(s => s.kind), ['warmup', 'work']);
  assert.equal(supersetLabel(w.exercises, w.exercises[0].id), 'A1'); assert.equal(supersetLabel(w.exercises, w.exercises[1].id), 'A2');
  assert.equal(copyPreviousSets([newSet()], [{ ...newSet(), kind: 'warmup', weight: 10, reps: 12, confirmed: true }])[0].kind, 'warmup');
  const data = { ...emptyData(), routines: [r], workouts: [w] };
  assert.deepEqual(previewBackup(createBackup(data), emptyData()).merged, data);
  assert.equal(ungroup(w.exercises, w.exercises[0].id).every(e => !e.supersetId), true);
});

test('three-way superset grouping, incomplete rounds and unequal rows rest only on round completion', () => {
  const w = newWorkout(); w.exercises = Array.from({ length: 3 }, () => ({ ...session('2026-11-02').exercises[0], sets: [newSet(), newSet()] }));
  w.exercises = groupWith(groupWith(w.exercises, w.exercises[0].id, w.exercises[1].id), w.exercises[2].id, w.exercises[0].id);
  const [a, b, c] = w.exercises; c.sets.pop();
  assert.equal(supersetLabel(w.exercises, c.id), 'A3');
  assert.equal(completesRound(w, a, a.sets[0]), false); a.sets[0].confirmed = true;
  assert.equal(completesRound(w, b, b.sets[0]), false); b.sets[0].confirmed = true;
  assert.equal(completesRound(w, c, c.sets[0]), true);
  assert.equal(completesRound(w, a, a.sets[1]), false); a.sets[1].confirmed = true;
  assert.equal(completesRound(w, b, b.sets[1]), true);
});

test('cycles wrap, skip unavailable routines, ignore drafts/outside activity and do not replay after edit, reload, sync or manual skip', () => {
  const a = routine('A'), b = routine('B'), c = routine('C'); b.archived = true;
  const cycle = { id: newId(), name: 'ABC', routineIds: [a.id, b.id, c.id], position: 1, completedWorkoutIds: [] };
  let data: AppData = { ...emptyData(), routines: [a, b, c], training: { moments: [], cycles: [cycle], weeklyGoals: [] } };
  assert.equal(nextCycleRoutine({ ...data, routines: [a, c] }, cycle)?.routine.id, c.id);
  assert.equal(nextCycleRoutine(data, cycle)?.routine.id, b.id, 'legacy archive flags do not hide routines');
  const w = { ...newWorkout(b), cycleLink: { cycleId: cycle.id, position: 1, routineId: b.id } };
  assert.deepEqual(advanceCycle(data, w), data);
  const final = { ...w, status: 'finished' as const }; data = advanceCycle(data, final);
  assert.equal(data.training!.cycles[0].position, 2); assert.deepEqual(advanceCycle(data, final), data);
  const restored = JSON.parse(JSON.stringify(data)); assert.deepEqual(advanceCycle(restored, final), data);
  const skipped = { ...data, training: { ...data.training!, cycles: [{ ...data.training!.cycles[0], position: 0 }] } };
  assert.equal(advanceCycle(skipped, { ...final, id: newId() }).training!.cycles[0].position, 0);
  assert.deepEqual(advanceCycle(data, session('2026-11-02')), data);
  const wrap = { ...final, id: newId(), cycleLink: { ...final.cycleLink, position: 2, routineId: c.id } };
  assert.equal(advanceCycle(data, wrap).training!.cycles[0].position, 0);
  assert.equal(nextCycleRoutine({ ...data, routines: [] }, cycle), null);
});

test('album capture/recovery is idempotent, immutable and never changes the economy or fabricates historical looks/levels', () => {
  const first = session('2026-11-02'), second = session('2026-11-03', 11);
  const base = { ...emptyData(), game: normalizeGame() }, before = { ...base, workouts: [first] };
  const recovered = recoverMoments(before); assert.equal(recovered.training!.moments.length, 1); assert.equal(recovered.training!.moments[0].appearance, null);
  assert.deepEqual(recoverMoments(recovered), recovered);
  const after = { ...recovered, workouts: [first, second] }, captured = captureMoments(recovered, after, second, new Date('2026-11-04T12:00:00Z'));
  assert.equal(captured.training!.moments.filter(m => m.kind === 'record').length, 1);
  assert.deepEqual(captureMoments(captured, captured, second), captured);
  assert.deepEqual(captured.game, before.game); assert.equal(gameProgress(normalizeGame(captured.game), captured.workouts).xp, gameProgress(normalizeGame(after.game), after.workouts).xp);
  const appearance = captured.training!.moments.find(m => m.kind === 'record')!.appearance;
  const changed = { ...captured, game: { ...captured.game!, cosmeticGear: {} } }; assert.deepEqual(changed.training!.moments.find(m => m.kind === 'record')!.appearance, appearance);
  assert.equal(validTrainingFeatures(captured.training), true);
  assert.deepEqual(previewBackup(createBackup(captured), emptyData()).merged.training, captured.training);
  const merged = mergeDocuments(blankDocument(), { ...blankDocument(), data: captured }, { ...blankDocument(), data: before }, { activity: 'local' });
  assert.deepEqual(merged.document.data.training!.moments, captured.training!.moments);
});

test('weekly summary handles Madrid Monday/Sunday, empty/first weeks, separately logged warmups and unknown historical targets', () => {
  const monday = session('2026-11-02'), sunday = session('2026-11-08'), nextMonday = session('2026-11-09'), warm = session('2026-11-03', 8, 10, 'warmup');
  const data = { ...emptyData(), workouts: [monday, sunday, nextMonday, warm], game: normalizeGame() };
  const week = weeklySummary(data, '2026-11-04', '2026-11-09');
  assert.equal(week.start, '2026-11-02'); assert.equal(week.end, '2026-11-08'); assert.equal(week.days, 2); assert.equal(week.stats.sets, 2); assert.equal(week.warmups, 1); assert.equal(week.goal, null); assert.equal(week.previous, false);
  assert.equal(weeklySummary(data, '2026-10-26', '2026-11-09').sessions.length, 0);
  assert.equal(weeklySummary(data, '2026-11-09', '2026-11-09').current, true);
  const observed = observeWeeklyGoal(data, '2026-11-04'); assert.equal(weeklySummary(observed, '2026-11-02', '2026-11-09').goal, 3);
  assert.deepEqual(observeWeeklyGoal(observed, '2026-11-04'), observed);
});

test('explained progress converts dumbbell pair/per-unit loads, separates modes, ignores pending rows and proves four weeks of goals', () => {
  const a = session('2026-10-01', 8, 40), b = session('2026-10-02', 11, 20);
  for (const w of [a, b]) w.exercises[0].exerciseId = 'press-inclinado-mancuernas';
  a.exercises[0].loadConvention = 'total'; b.exercises[0].loadConvention = 'per_unit_bilateral';
  const words = progressInsights([a, b], b.id); assert.match(words[0].text, /3 repeticiones más con 40 kg externos totales/); assert.equal(words[1].kind, 'record');
  const body = structuredClone(b); body.exercises[0].mode = 'bodyweight_reps'; body.exercises[0].sets[0].weight = 0; assert.equal(progressInsights([a, body], body.id).length, 0);
  b.exercises[0].sets[0].confirmed = false; assert.equal(progressInsights([a, b], b.id).length, 0);
  const workouts = Array.from({ length: 4 }, (_, i) => session(addDays('2026-10-12', i * 7)));
  const data: AppData = { ...emptyData(), workouts, training: { moments: [], cycles: [], weeklyGoals: workouts.map(w => ({ week: w.date, observedOn: w.date, days: 1, sets: 10 })) } };
  assert.match(consistencyInsight(data, '2026-11-02')!.text, /4 semanas seguidas/); assert.equal(consistencyInsight(data, '2026-11-02')!.workoutIds.length, 4);
  data.training!.weeklyGoals = []; assert.equal(consistencyInsight(data, '2026-11-02'), null);
  const loaded = snapshotAppearance(data); assert.equal(loaded.base, '/assets/grind-avatar-base.png'); assert.ok(loaded.atlasWidth > 0);
});

test('malformed new metadata is rejected and completed cycle receipts/moment looks survive stale conflict branches', () => {
  assert.throws(() => validateData({ ...emptyData(), training: { moments: [], cycles: [], weeklyGoals: [{ week: '2026-11-03', observedOn: '2026-11-03', days: 3, sets: 30 }] } }));
  const data = recoverMoments({ ...emptyData(), workouts: [session('2026-11-02')] });
  data.training!.cycles.push({id:newId(),name:'AB',routineIds:[],position:0,completedWorkoutIds:[data.workouts[0].id]});
  data.training!.weeklyGoals.push({week:'2026-11-02',observedOn:'2026-11-02',days:3,sets:30});
  const server = { ...blankDocument(), data }, local = { ...blankDocument(), data: { ...data, training: undefined, workouts: [...data.workouts, session('2026-11-03')] } };
  const result = mergeDocuments(server, local, server); assert.deepEqual(result.document.data.training, data.training);
  const deletion = mergeDocuments(server, {...server,data:{...data,training:{...data.training!,cycles:[]}}},server);
  assert.equal(deletion.document.data.training!.cycles.length,0);
  assert.equal(trainingFeatures(emptyData()).cycles.length, 0);
});

test('copying previous rows retains warmup then work in order while charts exclude warmups', () => {
  const w=session('2026-11-02'); w.exercises[0].sets.unshift({...newSet(),weight:10,reps:12,confirmed:true,kind:'warmup'});
  const rows=workoutCopySessions([w],w.exercises[0].exerciseId)[0].e.sets;
  assert.deepEqual(rows.map(s=>[s.weight,s.kind??'work']),[[10,'warmup'],[40,'work']]);
  assert.deepEqual(copyPreviousSets([newSet(),newSet()],rows).map(s=>[s.weight,s.kind??'work']),[[10,'warmup'],[40,'work']]);
  assert.equal(totals([w]).sets,1);
});
