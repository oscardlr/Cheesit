'use client';

import type { Exercise, Routine, RoutineExercise } from '@/lib/model';
import { COLORS, validPlannedSets } from '@/lib/model';

export default function RoutineEditor({ routine, exercises, message, busy, onChange, onSave, onBack, onAdd }: {
  routine: Routine; exercises: Exercise[]; message: string; busy: boolean;
  onChange: (routine: Routine) => void; onSave: () => void; onBack: () => void; onAdd: () => void;
}) {
  const update = (id: string, fields: Partial<RoutineExercise>) => onChange({ ...routine, exercises: routine.exercises.map(item => item.id === id ? { ...item, ...fields } : item) });
  const move = (index: number, delta: number) => { const list = [...routine.exercises]; [list[index], list[index + delta]] = [list[index + delta], list[index]]; onChange({ ...routine, exercises: list }); };
  const optionalNumber = (text: string) => text === '' ? undefined : Number(text);
  return <>
    <header className="page-header"><button className="icon-button back" aria-label="Volver" onClick={onBack}>‹</button><h1>Editar rutina</h1><span /></header>
    <p className="notice">Guarda tus cambios antes de salir. Las series se preparan sin confirmar al empezar una sesión.</p>
    <fieldset className="session-fields" disabled={busy}>
      <div className="form-card"><label>Nombre de la rutina<input value={routine.name} maxLength={80} placeholder="Por ejemplo, Tren superior" onChange={event => onChange({ ...routine, name: event.target.value })} /></label>
        <fieldset className="color-field"><legend>Color</legend><div className="colors">{COLORS.map((color, i) => <button type="button" key={color} className={`color-choice ${routine.color === color ? 'selected' : ''}`} style={{ backgroundColor: color }} aria-label={`Color ${['azul', 'morado', 'verde', 'rojo', 'naranja', 'gris'][i]}`} aria-pressed={routine.color === color} onClick={() => onChange({ ...routine, color })}>{routine.color === color ? '✓' : ''}</button>)}</div></fieldset>
        <label>Notas de la rutina<textarea maxLength={2000} value={routine.notes ?? ''} onChange={event => onChange({ ...routine, notes: event.target.value })} /></label>
      </div>
      <h2>Ejercicios · {routine.exercises.length}</h2>
      {routine.exercises.map((item, index) => { const ex = exercises.find(value => value.id === item.exerciseId); return <article className="exercise-card" key={item.id}>
        <div className="exercise-head"><div className="list-copy"><strong>{ex?.name ?? 'Ejercicio no disponible'}</strong><small>{ex?.group}</small></div><div className="reorder"><button aria-label={`Subir ${ex?.name}`} disabled={!index} onClick={() => move(index, -1)}>↑</button><button aria-label={`Bajar ${ex?.name}`} disabled={index === routine.exercises.length - 1} onClick={() => move(index, 1)}>↓</button><button aria-label={`Quitar ${ex?.name}`} onClick={() => onChange({ ...routine, exercises: routine.exercises.filter(value => value.id !== item.id) })}>×</button></div></div>
        <div className="optional-fields"><label>Series previstas<input type="number" min={1} max={20} step={1} value={Number.isNaN(item.sets) ? '' : item.sets} aria-invalid={!validPlannedSets(item.sets)} aria-describedby={!validPlannedSets(item.sets) ? `sets-error-${item.id}` : undefined} onChange={event => update(item.id, { sets: event.target.value === '' ? NaN : Number(event.target.value) })} /></label>
          <label>Repeticiones mínimas<input type="number" min={1} max={1000} step={1} value={item.repsMin ?? ''} onChange={event => update(item.id, { repsMin: optionalNumber(event.target.value) })} /></label>
          <label>Repeticiones máximas<input type="number" min={1} max={1000} step={1} value={item.repsMax ?? ''} onChange={event => update(item.id, { repsMax: optionalNumber(event.target.value) })} /></label>
          <label>Carga objetivo, en kg<input type="number" min={0} max={1000} step={.01} value={item.targetWeight ?? ''} onChange={event => update(item.id, { targetWeight: optionalNumber(event.target.value) })} /></label>
          <label>Descanso, en segundos<input type="number" min={0} max={3600} step={15} value={item.restSeconds ?? ''} onChange={event => update(item.id, { restSeconds: optionalNumber(event.target.value) })} /></label></div>
        {!validPlannedSets(item.sets) && <p className="error" id={`sets-error-${item.id}`} role="alert">Las series previstas deben ser un entero entre 1 y 20.</p>}
        <label>Notas del ejercicio<textarea maxLength={2000} value={item.notes ?? ''} onChange={event => update(item.id, { notes: event.target.value })} /></label>
      </article>; })}
      <button className="secondary wide" onClick={onAdd}>＋ Añadir ejercicio</button>
      {message && <p className="error" role="alert">{message}</p>}
      <button className="primary wide finish" onClick={onSave}>{busy ? 'Guardando…' : 'Guardar rutina'}</button>
    </fieldset>
  </>;
}
