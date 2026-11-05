'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CalendarDays, Dumbbell, Plus, Scale } from 'lucide-react';
import { removeWeightGoal, setWeightGoal, weightEntries } from '@/lib/body-weight';
import { weekStart } from '@/lib/dates';
import { exerciseGoalProgress, MAX_EXERCISE_GOALS, validExerciseGoalWeight } from '@/lib/exercise-goals';
import { awardMissionRewards, normalizeGame } from '@/lib/game';
import { newId, type AppData, type Exercise } from '@/lib/model';
import { hasWorkSets, trainingFeatures } from '@/lib/training-features';
import './objectives-panel.css';

type Editor = { kind: 'new'; id: string } | { kind: 'weekly' | 'body' } | { kind: 'exercise'; id: string; exerciseId: string; targetKg: number };
const kg = (value: number) => `${value.toLocaleString('es-ES', { maximumFractionDigits: 2 })} kg`;

export default function ObjectivesPanel({ data, exercises, today, onSave }: {
  data: AppData;
  exercises: Exercise[];
  today: string;
  onSave: (update: (current: AppData) => AppData) => Promise<void>;
}) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (editor) formRef.current?.querySelector<HTMLElement>('input, select')?.focus(); }, [editor]);
  const { weeklyWorkoutGoal, weeklySetGoal, missionRewards } = normalizeGame(data.game);
  const monday = weekStart(today);
  const weeklyDays = useMemo(() => new Set(data.workouts.filter(w => w.status === 'finished' &&
    w.date >= monday && w.date <= today && hasWorkSets(w)).map(w => w.date)).size, [data.workouts, monday, today]);
  const weeklyAward = missionRewards?.find(reward => reward.id === `sessions:${monday}`);
  const tracking = data.profile?.weightTracking;
  const bodyTarget = tracking?.goalKg;
  const baseline = tracking?.baselineKg;
  const latestWeight = weightEntries(data.profile).filter(entry => entry.date <= today).at(-1);
  const bodyComplete = latestWeight !== undefined && bodyTarget !== undefined && (
    baseline === undefined || baseline === bodyTarget ? latestWeight.weightKg === bodyTarget :
      baseline < bodyTarget ? latestWeight.weightKg >= bodyTarget : latestWeight.weightKg <= bodyTarget
  );
  const exerciseGoals = data.training?.exerciseGoals;
  const progress = useMemo(() => new Map([...new Set(exerciseGoals?.map(goal => goal.exerciseId))].map(id =>
    [id, exerciseGoalProgress(data.workouts, id, today)])), [exerciseGoals, data.workouts, today]);
  const loadExercises = exercises.filter(exercise => exercise.mode === 'external_load_reps' && !exercise.archived);

  function open(next: Editor) {
    setNotice('');
    setEditor(next);
  }

  async function save(update: (current: AppData) => AppData, success: string) {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    setNotice('');
    try {
      await onSave(update);
      setEditor(null);
      setNotice(success);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se ha podido guardar el objetivo.');
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const fields = new FormData(event.currentTarget);
    const kind = editor.kind === 'new' ? fields.get('kind') : editor.kind;
    const target = Number(fields.get('target'));
    if (kind === 'weekly') {
      const sets = Number(fields.get('sets'));
      if (!Number.isInteger(target) || target < 1 || target > 7 || !Number.isInteger(sets) || sets < 1 || sets > 200) return;
      void save(current => ({
        ...current,
        game: awardMissionRewards({ ...normalizeGame(current.game), weeklyWorkoutGoal: target, weeklySetGoal: sets }, current.workouts, today),
      }), 'Objetivo semanal guardado.');
    } else if (kind === 'body') {
      void save(current => ({ ...current, profile: setWeightGoal(current.profile, target) }), 'Objetivo de peso guardado.');
    } else if (editor.kind === 'exercise' || editor.kind === 'new') {
      const exerciseId = String(fields.get('exerciseId') ?? '');
      if (!validExerciseGoalWeight(target) || (!loadExercises.some(exercise => exercise.id === exerciseId) &&
        !(editor.kind === 'exercise' && editor.exerciseId === exerciseId))) return;
      const next = { id: editor.id, exerciseId, targetKg: target };
      void save(current => {
        const training = trainingFeatures(current);
        const goals = training.exerciseGoals ?? [];
        const exists = goals.some(goal => goal.id === next.id);
        if (!exists && goals.length >= MAX_EXERCISE_GOALS) throw new Error('Has alcanzado el límite de objetivos de ejercicio.');
        return { ...current, training: { ...training, exerciseGoals: exists ? goals.map(goal => goal.id === next.id ? next : goal) : [...goals, next] } };
      }, 'Objetivo de ejercicio guardado.');
    }
  }

  const [newKind, setNewKind] = useState<'exercise' | 'body' | 'weekly'>('exercise');
  const activeKind = editor?.kind === 'new' ? newKind : editor?.kind;
  const selectedId = editor?.kind === 'exercise' ? editor.exerciseId : '';
  const initialTarget = activeKind === 'weekly' ? weeklyWorkoutGoal : activeKind === 'body' ? bodyTarget : editor?.kind === 'exercise' ? editor.targetKg : undefined;

  return <section className="objectives-panel" aria-label="Objetivos personales" aria-busy={saving}>
    <div className="section-heading objectives-heading">
      <p>Fija tus metas y sigue tu progreso con lo que ya registras en Cheesit.</p>
      <button className="primary" type="button" disabled={saving} onClick={() => { setNewKind('exercise'); open({ kind: 'new', id: newId() }); }}><Plus size={18}/> Nuevo objetivo</button>
    </div>
    {editor && <form ref={formRef} key={'id' in editor ? editor.id : editor.kind} className="settings-card objectives-editor" onSubmit={submit} aria-labelledby="objective-editor-title">
      <h2 id="objective-editor-title">{editor.kind === 'new' ? 'Nuevo objetivo' : 'Editar objetivo'}</h2>
      <fieldset disabled={saving}>
        {editor.kind === 'new' && <label>Tipo de objetivo<select name="kind" value={newKind} onChange={event => setNewKind(event.target.value as typeof newKind)}>
          <option value="exercise">Peso en un ejercicio</option><option value="body">Peso corporal</option><option value="weekly">Días de entrenamiento por semana</option>
        </select></label>}
        {activeKind === 'exercise' && <label>Ejercicio<select name="exerciseId" defaultValue={selectedId} required>
          <option value="" disabled>Elige un ejercicio</option>
          {selectedId && !loadExercises.some(exercise => exercise.id === selectedId) && <option value={selectedId}>{exercises.find(exercise => exercise.id === selectedId)?.name ?? 'Ejercicio no disponible'}</option>}
          {loadExercises.map(exercise => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}
        </select></label>}
        <label key={activeKind}>
          {activeKind === 'weekly' ? 'Días de entreno por semana' : activeKind === 'body' ? 'Peso objetivo (kg)' : 'Carga externa total (kg)'}
          <input name="target" type="number" required defaultValue={initialTarget} min={activeKind === 'weekly' ? 1 : activeKind === 'body' ? 30 : .01}
            max={activeKind === 'weekly' ? 7 : activeKind === 'body' ? 300 : 2000} step={activeKind === 'weekly' ? 1 : activeKind === 'body' ? .1 : .01}/>
        </label>
        {activeKind === 'weekly' && <label>Series de trabajo por semana<input name="sets" type="number" min={1} max={200} required defaultValue={weeklySetGoal}/></label>}
        {activeKind === 'exercise' && <p>Si usas dos mancuernas a la vez, indica la suma. Para un movimiento alterno, indica el peso de una.</p>}
        <div className="objectives-actions"><button className="primary" type="submit">{saving ? 'Guardando…' : 'Guardar objetivo'}</button><button className="secondary" type="button" onClick={() => setEditor(null)}>Cancelar</button></div>
      </fieldset>
    </form>}
    <p className={notice ? 'notice' : undefined} role="status">{notice}</p>
    <div className="objectives-grid">
      <article className="settings-card objective-card">
        <h2><CalendarDays size={20}/> Tu objetivo semanal</h2>
        <strong>{weeklyDays} de {weeklyWorkoutGoal} {weeklyWorkoutGoal === 1 ? 'día completado' : 'días completados'}</strong>
        <progress value={Math.min(weeklyDays, weeklyWorkoutGoal)} max={weeklyWorkoutGoal} aria-label="Progreso semanal"/>
        <p>{weeklyDays >= weeklyWorkoutGoal ? 'Objetivo cumplido' : weeklyDays === 0 ? 'Sin registros esta semana' : 'En progreso'}</p>
        <p>Meta de {weeklySetGoal} series de trabajo por semana.</p>
        {weeklyAward && weeklyAward.target !== weeklyWorkoutGoal && <p>La recompensa de esta semana ya se obtuvo con una meta de {weeklyAward.target} {weeklyAward.target === 1 ? 'día' : 'días'}.</p>}
        <div className="objectives-actions"><button className="secondary" type="button" disabled={saving} onClick={() => open({ kind: 'weekly' })}>Editar objetivo semanal</button></div>
      </article>
      {bodyTarget !== undefined && <article className="settings-card objective-card">
        <h2><Scale size={20}/> Peso corporal</h2>
        <strong>Meta de {kg(bodyTarget)}</strong>
        <p>{latestWeight ? `Último registro: ${kg(latestWeight.weightKg)} · ${bodyComplete ? 'Objetivo cumplido' : 'En progreso'}` : 'Sin registros'}</p>
        <div className="objectives-actions">
          <button className="secondary" type="button" disabled={saving} onClick={() => open({ kind: 'body' })}>Editar peso objetivo</button>
          <button className="text-action" type="button" disabled={saving} onClick={() => void save(current => ({ ...current, profile: removeWeightGoal(current.profile) }), 'Objetivo de peso eliminado.')}>Eliminar objetivo de peso</button>
        </div>
      </article>}
      {exerciseGoals?.map(goal => {
        const name = exercises.find(exercise => exercise.id === goal.exerciseId)?.name ?? 'Ejercicio no disponible';
        const result = progress.get(goal.exerciseId);
        return <article key={goal.id} className="settings-card objective-card">
          <h2><Dumbbell size={20}/> {name}</h2>
          <strong>Meta de {kg(goal.targetKg)}</strong>
          <p>{result?.latest ? `Última sesión: ${kg(result.latest.weightKg)} · Mejor carga: ${kg(result.best)}` : 'Sin registros'}</p>
          {result?.latest && <p>{result.best >= goal.targetKg ? 'Objetivo cumplido' : 'En progreso'}</p>}
          <div className="objectives-actions">
            <button className="secondary" type="button" disabled={saving} aria-label={`Editar objetivo de ${name}`} onClick={() => open({ kind: 'exercise', ...goal })}>Editar</button>
            <button className="text-action" type="button" disabled={saving} aria-label={`Eliminar objetivo de ${name}`} onClick={() => void save(current => {
              const training = trainingFeatures(current);
              return { ...current, training: { ...training, exerciseGoals: (training.exerciseGoals ?? []).filter(item => item.id !== goal.id) } };
            }, 'Objetivo de ejercicio eliminado.')}>Eliminar</button>
          </div>
        </article>;
      })}
    </div>
  </section>;
}
