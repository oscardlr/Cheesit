'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Plus, Settings2, Timer } from 'lucide-react';
import { copyPreviousSets, newSet, parseWeight, type Workout, type WorkoutExercise, type WorkoutSet } from '@/lib/model';
import { workoutExerciseSessions } from '@/lib/metrics';
import { effectiveLoad, exerciseLoadConvention, type AthleteProfile } from '@/lib/strength';
import LoadConvention from './LoadConvention';
import SessionAbilityNote from './SessionAbilityNote';
import ExerciseThumbnail from './ExerciseThumbnail';
import type { GameState } from '@/lib/game';

const elapsed = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export default function SessionEditor({ workout, history, profile, game, historical, saveState, message, busy, today, onChange, onConfirm, onFinish, onAdd, onBack, onAbandon, onProgress, onSubstitute }: {
  workout: Workout; history: Workout[]; profile: AthleteProfile; game: GameState; historical: boolean;
  saveState: string; message: string; busy: boolean; today: string;
  onChange: (workout: Workout) => void; onConfirm: (exercise: WorkoutExercise, set: WorkoutSet) => void;
  onFinish: () => void; onAdd: () => void; onBack: () => void; onAbandon: () => void;
  onProgress: (id: string) => void; onSubstitute: (id: string) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const tick = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(tick); }, []);
  const change = (next: Workout) => onChange({ ...next, updatedAt: new Date().toISOString() });
  const changeExercise = (id: string, update: (value: WorkoutExercise) => WorkoutExercise) => change({ ...workout, exercises: workout.exercises.map(ex => ex.id === id ? update(ex) : ex) });
  const changeSet = (exerciseId: string, setId: string, fields: Partial<WorkoutSet>) => changeExercise(exerciseId, ex => ({ ...ex, sets: ex.sets.map(set => set.id === setId ? { ...set, ...fields, confirmed: false } : set) }));
  const confirmed = workout.exercises.reduce((sum, ex) => sum + ex.sets.filter(set => set.confirmed).length, 0);
  const planned = workout.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
  const duration = Math.max(0, Math.floor(((workout.finishedAt ? Date.parse(workout.finishedAt) : now) - Date.parse(workout.startedAt ?? workout.createdAt)) / 1000));
  const rest = workout.restTimer;
  const remaining = rest?.endsAt ? Math.max(0, Math.ceil((Date.parse(rest.endsAt) - now) / 1000)) : rest?.remainingSeconds ?? 0;
  const startRest = (seconds: number) => change({ ...workout, restTimer: { durationSeconds: seconds, remainingSeconds: seconds, endsAt: new Date(Date.now() + seconds * 1000).toISOString() } });
  const reorder = (index: number, delta: number) => { const list = [...workout.exercises]; [list[index], list[index + delta]] = [list[index + delta], list[index]]; change({ ...workout, exercises: list }); };

  return <>
    <header className="page-header"><button className="icon-button back" aria-label="Volver" onClick={onBack}>‹</button><h1>{historical ? 'Editar entrenamiento' : 'Entrenamiento'}</h1><span className="header-spacer" /></header>
    <section className="session-compact" aria-label="Estado de la sesión"><div><strong>{confirmed} / {planned} series</strong><span>{historical&&(!workout.startedAt||!workout.finishedAt)?'Duración no registrada':`Duración · ${elapsed(duration)}`}</span></div><div className="progress-track"><span style={{ width: `${planned ? confirmed / planned * 100 : 0}%` }} /></div></section>
    <SessionAbilityNote workout={workout} game={game} /><fieldset className="session-fields" disabled={busy}>
    {!historical && <section className="rest-timer rest-compact" aria-label="Descanso"><div className="rest-main"><Timer size={19} /><strong>{rest ? (remaining ? elapsed(remaining) : 'Descanso completado') : `Descanso · ${elapsed(workout.defaultRestSeconds ?? 90)}`}</strong><button className="secondary" onClick={() => startRest(workout.defaultRestSeconds ?? 90)}>Iniciar descanso</button></div>
      {rest && <div className="rest-running-actions">{remaining > 0 && <button className="text-action" onClick={() => change({ ...workout, restTimer: { ...rest, remainingSeconds: remaining, endsAt: rest.endsAt ? null : new Date(Date.now() + remaining * 1000).toISOString() } })}>{rest.endsAt ? 'Pausar' : 'Reanudar'}</button>}<button className="text-action" onClick={() => startRest(Math.min(3600, remaining + 30))}>+30 s</button></div>}
      <details><summary>Ajustar descanso</summary><label>Segundos de descanso<input type="number" min={0} max={3600} step={15} value={workout.defaultRestSeconds ?? 90} onChange={event => { const seconds = Number(event.target.value); if (Number.isInteger(seconds) && seconds >= 0 && seconds <= 3600) change({ ...workout, defaultRestSeconds: seconds }); }} /></label><label className="check-label"><input type="checkbox" checked={workout.autoRest === true} onChange={event => change({ ...workout, autoRest: event.target.checked })} /> Iniciar al confirmar una serie</label><p className="muted">El contador continúa al cambiar de pantalla o volver a la app.</p></details>
    </section>}
    <p className="storage-status editor-save" role="status"><span>●</span> {historical ? 'Cambios pendientes de guardar' : saveState}</p>
    {!workout.exercises.length && <div className="empty-card"><h2>Tu primera serie empieza aquí.</h2><p>Añade un ejercicio, introduce la carga y las repeticiones y confirma la serie.</p></div>}
    {workout.exercises.map((ex, index) => {
      const previous = workoutExerciseSessions(history, ex.exerciseId).find(({ w, e }) => w.id !== workout.id && (w.date < workout.date || (w.date === workout.date && w.createdAt < workout.createdAt)) && e.mode === ex.mode);
      const convention = exerciseLoadConvention(ex, profile);
      const previousForCopy=previous?previous.e.sets.map(set=>{const weight=ex.mode==='bodyweight_reps'?0:Math.round(effectiveLoad(previous.e,set.weight??0,profile)/Math.max(1,convention.effectiveMultiplier)*100)/100;return {...set,weight,weightText:String(weight)}}):[];
      return <article className="exercise-card" key={ex.id}>
        <div className="exercise-head"><ExerciseThumbnail exerciseId={ex.exerciseId} /><div className="list-copy"><strong>{ex.name}</strong><small>{ex.group}</small></div><button className="icon-button" aria-label={`Quitar ${ex.name}`} onClick={() => { if (window.confirm(`¿Quitar ${ex.name} de esta sesión?`)) change({ ...workout, exercises: workout.exercises.filter(item => item.id !== ex.id) }); }}>×</button></div>
        <div className="exercise-actions"><button className="text-action" onClick={() => onProgress(ex.exerciseId)}>Ver progreso</button><button className="text-action" onClick={() => onSubstitute(ex.id)}>Sustituir</button><button className="icon-button" aria-label={`Subir ${ex.name}`} disabled={index === 0} onClick={() => reorder(index, -1)}><ArrowUp size={17} /></button><button className="icon-button" aria-label={`Bajar ${ex.name}`} disabled={index === workout.exercises.length - 1} onClick={() => reorder(index, 1)}><ArrowDown size={17} /></button></div>
        {(ex.repsMin || ex.targetWeight !== undefined || ex.notes) && <p className="prescription">{ex.repsMin ? `Objetivo: ${ex.repsMin}${ex.repsMax && ex.repsMax !== ex.repsMin ? `–${ex.repsMax}` : ''} reps` : ''}{ex.targetWeight !== undefined ? ` · ${ex.targetWeight} kg` : ''}{ex.notes ? ` · ${ex.notes}` : ''}</p>}
        {previous && <div className="previous"><span title="Al copiar, la carga se adapta a la convención del registro actual.">Anterior · {new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(new Date(`${previous.w.date}T12:00:00`))}</span><button onClick={() => changeExercise(ex.id, value => ({ ...value, sets: copyPreviousSets(value.sets, previousForCopy) }))}>Copiar todas las series</button>{previous.e.sets.map((set, i) => <button key={set.id} onClick={() => changeExercise(ex.id, value => ({ ...value, sets: copyPreviousSets(value.sets, previousForCopy, i) }))}>{set.weight} kg × {set.reps} <small>Copiar serie {i + 1}</small></button>)}</div>}
        <LoadConvention exercise={ex} profile={profile} />
        <div className="sets-heading"><span>Serie</span><span>{convention.inputSuffix.includes('total') ? 'Kg total' : convention.isDumbbell ? 'Kg / manc.' : 'Kg'}</span><span>Reps</span><span>Estado</span></div>
        {ex.sets.map((set, i) => <div className="set-with-options" key={set.id}><div className={`set-row ${set.confirmed ? 'set-confirmed' : ''}`}><span className="set-number">{i + 1}</span>
          <input aria-label={`Carga en kg, serie ${i + 1} de ${ex.name}`} inputMode="decimal" maxLength={32} placeholder="kg" disabled={ex.mode === 'bodyweight_reps'} value={ex.mode === 'bodyweight_reps' ? '0' : set.weightText ?? (set.weight === null ? '' : String(set.weight))} onChange={event => changeSet(ex.id, set.id, { weightText: event.target.value, weight: parseWeight(event.target.value) })} />
          <input aria-label={`Repeticiones, serie ${i + 1} de ${ex.name}`} inputMode="numeric" maxLength={32} placeholder="reps" value={set.repsText ?? (set.reps === null ? '' : String(set.reps))} onChange={event => changeSet(ex.id, set.id, { repsText: event.target.value, reps: /^\d{1,4}$/.test(event.target.value) ? Number(event.target.value) : null })} />
          <button className={`confirm-set ${set.confirmed ? 'done' : ''}`} aria-label={`${set.confirmed ? 'Realizada' : 'Confirmar serie'} ${i + 1}`} disabled={set.confirmed} onClick={() => onConfirm(ex, set)}>{set.confirmed ? <><Check size={14} /> Hecha</> : <><Plus size={13} /> Confirmar</>}</button>
          <button className="remove-set" aria-label={`Eliminar serie ${i + 1}`} onClick={() => { if (!set.confirmed || window.confirm('¿Eliminar esta serie confirmada?')) changeExercise(ex.id, value => ({ ...value, sets: value.sets.filter(item => item.id !== set.id) })); }}>×</button>
        </div><details className="set-options"><summary>Esfuerzo opcional · serie {i + 1}</summary><div className="optional-fields"><label>RPE, serie {i + 1}<select value={set.rpe ?? ''} onChange={event => changeSet(ex.id, set.id, { rpe: event.target.value ? Number(event.target.value) : undefined })}><option value="">Sin RPE</option>{Array.from({ length: 19 }, (_, n) => 1 + n * .5).map(n => <option key={n} value={n}>{n}</option>)}</select></label><label>RIR, serie {i + 1}<select value={set.rir ?? ''} onChange={event => changeSet(ex.id, set.id, { rir: event.target.value ? Number(event.target.value) : event.target.value === '0' ? 0 : undefined })}><option value="">Sin RIR</option>{Array.from({ length: 11 }, (_, n) => <option key={n} value={n}>{n}</option>)}</select></label></div><p>RPE: esfuerzo percibido, 1–10. RIR: repeticiones que quedaban, 0–10. Al editar, vuelve a confirmar.</p></details></div>)}
        <button className="add-set" disabled={ex.sets.length >= 50} onClick={() => changeExercise(ex.id, value => ({ ...value, sets: [...value.sets, newSet()] }))}>＋ Añadir serie</button>
        <details className="exercise-options"><summary>Notas y descanso de {ex.name}</summary><label>Notas del ejercicio<textarea maxLength={2000} placeholder="Opcional" value={ex.notes ?? ''} onChange={event => changeExercise(ex.id, value => ({ ...value, notes: event.target.value }))} /></label><label>Descanso del ejercicio, en segundos · por defecto {workout.defaultRestSeconds ?? 90}<input type="number" min={0} max={3600} step={15} value={ex.restSeconds ?? ''} placeholder="Opcional" onChange={event => { const value = Number(event.target.value); if (!event.target.value || (Number.isInteger(value) && value >= 0 && value <= 3600)) changeExercise(ex.id, item => ({ ...item, restSeconds: event.target.value ? value : undefined })); }} /></label></details>
      </article>;
    })}
    <button className="secondary wide" onClick={onAdd}>＋ Añadir ejercicio</button>
    <details className="editor-settings"><summary><Settings2 size={16} /> Detalles de la sesión</summary><div className="editor-meta">
      <label>Nombre<input maxLength={80} value={workout.name} onChange={event => change({ ...workout, name: event.target.value })} /></label>
      <label>Fecha<input type="date" max={today} value={workout.date} onChange={event => change({ ...workout, date: event.target.value })} /></label>
      <label>Notas de la sesión<textarea maxLength={2000} placeholder="Opcional" value={workout.notes ?? ''} onChange={event => change({ ...workout, notes: event.target.value })} /></label>
    </div></details>
    {message && <p className="error" role="alert">{message}</p>}
    <button className="primary wide finish" onClick={onFinish}>{busy ? 'Guardando…' : historical ? 'Guardar cambios' : 'Finalizar entrenamiento'}</button>
    {!historical && <button className="danger-link" onClick={onAbandon}>Abandonar borrador</button>}
    </fieldset>
  </>;
}
