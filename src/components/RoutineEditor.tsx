'use client';

import PageTitle from './PageTitle';

import type { Exercise, Routine, RoutineExercise } from '@/lib/model';
import { COLORS, ROUTINE_COLOR_OPTIONS, ROUTINE_ICONS, resolvedRoutineIcon, validPlannedSets } from '@/lib/model';
import SupersetControl from './SupersetControl';
import SetKindControl from './SetKindControl';
import RoutineIcon, { ROUTINE_ICON_LABELS } from './RoutineIcon';
import ExerciseThumbnail from './ExerciseThumbnail';
import './routine-editor.css';

export default function RoutineEditor({ routine, exercises, message, busy, onChange, onSave, onBack, onAdd }: {
  routine: Routine; exercises: Exercise[]; message: string; busy: boolean;
  onChange: (routine: Routine) => void; onSave: () => void; onBack: () => void; onAdd: () => void;
}) {
  const update = (id: string, fields: Partial<RoutineExercise>) => onChange({ ...routine, exercises: routine.exercises.map(item => item.id === id ? { ...item, ...fields } : item) });
  const move = (index: number, delta: number) => { const list = [...routine.exercises]; [list[index], list[index + delta]] = [list[index + delta], list[index]]; onChange({ ...routine, exercises: list }); };
  const optionalNumber = (text: string) => text.trim() === '' ? undefined : Number(text);
  return <>
    <header className="page-header"><button className="icon-button back" aria-label="Volver" onClick={onBack}>‹</button><PageTitle>Editar rutina</PageTitle><span /></header>
    <p className="notice">Define los ejercicios y las series. Guarda la rutina para reutilizarla.</p>
    <fieldset className="session-fields" disabled={busy}>
      <div className="form-card"><label>Nombre de la rutina<input value={routine.name} maxLength={80} placeholder="Por ejemplo, Tren superior" onChange={event => onChange({ ...routine, name: event.target.value })} /></label>
        <fieldset className="color-field"><legend>Color</legend><div className="colors routine-colors">{ROUTINE_COLOR_OPTIONS.map(({ value: color, label }) => <button type="button" key={color} className={`color-choice ${routine.color === color ? 'selected' : ''}`} style={{ backgroundColor: color }} aria-label={`Color ${label}`} aria-pressed={routine.color === color} onClick={() => onChange({ ...routine, color })}>{routine.color === color ? '✓' : ''}</button>)}{!(COLORS as readonly string[]).includes(routine.color) && <button type="button" className="color-choice legacy-color selected" style={{ backgroundColor: routine.color }} aria-label="Color actual (anterior)" aria-pressed="true" title="Color actual (anterior)">✓</button>}</div></fieldset>
        <fieldset className="routine-icon-field"><legend>Icono</legend><div className="routine-icon-choices">{ROUTINE_ICONS.map(icon => <button type="button" key={icon} className={`routine-icon-choice ${resolvedRoutineIcon(routine.icon) === icon ? 'selected' : ''}`} aria-label={`Icono ${ROUTINE_ICON_LABELS[icon]}`} aria-pressed={resolvedRoutineIcon(routine.icon) === icon} title={ROUTINE_ICON_LABELS[icon]} onClick={() => onChange({ ...routine, icon })}><RoutineIcon icon={icon} size={22} /></button>)}</div></fieldset>
        <label>Notas de la rutina<textarea maxLength={2000} placeholder="Opcional" value={routine.notes ?? ''} onChange={event => onChange({ ...routine, notes: event.target.value })} /></label>
      </div>
      <h2>Ejercicios · {routine.exercises.length}</h2>{!routine.exercises.length&&<div className="empty-card"><h3>¿Qué vas a entrenar?</h3><p>Añade los ejercicios en el orden que prefieras.</p></div>}
      {routine.exercises.map((item, index) => { const ex = exercises.find(value => value.id === item.exerciseId); return <article className="exercise-card" key={item.id}>
        <div className="exercise-head"><ExerciseThumbnail exerciseId={item.exerciseId} image={ex?.image} /><div className="list-copy"><strong>{ex?.name ?? 'Ejercicio no disponible'}</strong><small>{ex?.group}</small></div><div className="reorder"><button aria-label={`Subir ${ex?.name}`} disabled={!index} onClick={() => move(index, -1)}>↑</button><button aria-label={`Bajar ${ex?.name}`} disabled={index === routine.exercises.length - 1} onClick={() => move(index, 1)}>↓</button><button aria-label={`Quitar ${ex?.name}`} onClick={() => onChange({ ...routine, exercises: routine.exercises.filter(value => value.id !== item.id) })}>×</button></div></div>
        <SupersetControl items={routine.exercises} item={item} name={value => exercises.find(ex => ex.id === value.exerciseId)?.name ?? 'Ejercicio'} onChange={items => onChange({ ...routine, exercises: items })}/><div className="optional-fields"><label>Series previstas<input type="number" min={1} max={20} step={1} value={Number.isNaN(item.sets) ? '' : item.sets} aria-invalid={!validPlannedSets(item.sets)} aria-describedby={!validPlannedSets(item.sets) ? `sets-error-${item.id}` : undefined} onChange={event => update(item.id, { sets: event.target.value === '' ? NaN : Number(event.target.value) })} /></label>
          <label>Repeticiones mínimas<input type="number" min={1} max={1000} step={1} placeholder="Opcional" value={item.repsMin ?? ''} onChange={event => update(item.id, { repsMin: optionalNumber(event.target.value) })} /></label>
          <label>Repeticiones máximas<input type="number" min={1} max={1000} step={1} placeholder="Opcional" value={item.repsMax ?? ''} onChange={event => update(item.id, { repsMax: optionalNumber(event.target.value) })} /></label>
          <label>Carga objetivo, en kg<input type="number" min={0} max={1000} step={.01} placeholder="Opcional" value={item.targetWeight ?? ''} onChange={event => update(item.id, { targetWeight: optionalNumber(event.target.value) })} /></label>
          <label>Descanso, en segundos<input type="number" min={0} max={3600} step={15} placeholder="Opcional" value={item.restSeconds ?? ''} onChange={event => update(item.id, { restSeconds: optionalNumber(event.target.value) })} /></label></div>
        {validPlannedSets(item.sets) && <fieldset className="routine-set-kinds"><legend>Tipo de cada serie</legend><div className="set-kind-grid">{Array.from({ length: item.sets }, (_, i) => <SetKindControl key={i} label={`Tipo de serie ${i + 1} de ${ex?.name}`} value={item.setKinds?.[i]} onChange={kind => update(item.id, { setKinds: Array.from({ length: item.sets }, (_, j) => j === i ? kind : item.setKinds?.[j] ?? 'work') })}/>)}</div><small>Los calentamientos se guardan, sin récords, XP ni objetivos de series o volumen.</small></fieldset>}{!validPlannedSets(item.sets) && <p className="error" id={`sets-error-${item.id}`} role="alert">Las series previstas deben ser un entero entre 1 y 20.</p>}
        <label>Notas del ejercicio<textarea maxLength={2000} placeholder="Opcional" value={item.notes ?? ''} onChange={event => update(item.id, { notes: event.target.value })} /></label>
      </article>; })}
      <button className="secondary wide" onClick={onAdd}>＋ Añadir ejercicio</button>
      {message && <p className="error" role="alert">{message}</p>}
      <button className="primary wide finish" onClick={onSave}>{busy ? 'Guardando…' : 'Guardar rutina'}</button>
    </fieldset>
  </>;
}
