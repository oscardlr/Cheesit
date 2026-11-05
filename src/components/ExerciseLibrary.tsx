'use client';

import { useLayoutEffect, useState } from 'react';
import { GROUPS } from '@/lib/catalog';
import { MUSCLES, type MuscleId } from '@/lib/muscles';
import { newId, validName, type Exercise } from '@/lib/model';
import ExerciseThumbnail from './ExerciseThumbnail';
import styles from './ExerciseLibrary.module.css';

const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function ExerciseLibrary({ exercises, onSelect, onSave }: {
  exercises: Exercise[]; onSelect?: (exercise: Exercise) => void; onSave: (exercise: Exercise) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('Todos');
  const [archived, setArchived] = useState(false);
  const [detail, setDetail] = useState<Exercise | null>(null);
  const [edit, setEdit] = useState<Exercise | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const editing = edit !== null;

  useLayoutEffect(() => {
    if (!editing) return;
    // Sync may finish while a local exercise draft is still open.
    const keepDraft = (event: Event) => event.preventDefault();
    window.addEventListener('cheesit:before-account-refresh', keepDraft);
    return () => window.removeEventListener('cheesit:before-account-refresh', keepDraft);
  }, [editing]);

  const isCustom = (ex: Exercise) => /^[0-9a-f]{8}-/i.test(ex.id);
  const visible = exercises.filter(ex => (archived || !ex.archived) && (group === 'Todos' || ex.group === group) && fold(ex.name).includes(fold(search)));
  async function save(exercise: Exercise, add = false) {
    if (!validName(exercise.name)) { setError('Introduce un nombre de 1 a 80 caracteres.'); return; }
    if (!exercise.primaryMuscles?.length) { setError('Elige al menos un músculo principal.'); return; }
    setBusy(true); setError('');
    try { const next = { ...exercise, name: exercise.name.trim() }; await onSave(next); setEdit(null); if (add) onSelect?.(next); } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se ha podido guardar. Puedes reintentar.'); } finally { setBusy(false); }
  }
  const changeMuscle = (id: MuscleId, key: 'primaryMuscles' | 'secondaryMuscles', checked: boolean) => {
    const other = key === 'primaryMuscles' ? 'secondaryMuscles' : 'primaryMuscles';
    setEdit(current => {
      if (!current) return current;
      const selected = current[key] ?? [];
      if (!checked) return { ...current, [key]: selected.filter(value => value !== id) };
      if (selected.includes(id)) return current;
      return { ...current, [key]: [...selected, id], [other]: current[other]?.filter(value => value !== id) };
    });
  };
  return <div className={`exercise-library ${styles.library}`}>
    <label>Buscar ejercicio<input type="search" placeholder="Busca por nombre" value={search} onChange={event => setSearch(event.target.value)} /></label>
    <fieldset className={styles.groupFilter}>
      <legend>Grupo muscular</legend>
      <div className={styles.groupButtons}>{['Todos', ...GROUPS].map(value => <button type="button" key={value} aria-pressed={group === value} onClick={() => setGroup(value)}>{value}</button>)}</div>
    </fieldset>
    <div className="library-results"><span role="status">{visible.length} {visible.length===1?'ejercicio':'ejercicios'}</span><label className="check-label"><input type="checkbox" checked={archived} onChange={event => setArchived(event.target.checked)} /> Mostrar ejercicios archivados</label></div>
    <div className="catalog-list">{visible.map(ex => <div className="catalog-entry" key={ex.id}><button className="list-row" onClick={() => onSelect && !ex.archived ? onSelect(ex) : setDetail(ex)}><ExerciseThumbnail exerciseId={ex.id} image={ex.image} /><span className="list-copy"><strong>{ex.name}</strong><small>{ex.group}{ex.archived ? ' · Archivado' : ex.mode === 'bodyweight_reps' ? ' · Peso corporal' : ''}</small></span><span>{onSelect && !ex.archived ? '＋' : '→'}</span></button><button className="text-action" aria-label={`Ficha técnica ${ex.id}`} onClick={() => setDetail(ex)}>Ficha</button>{isCustom(ex) && <button className="text-action" aria-label={`Editar ficha ${ex.id}`} onClick={() => { setEdit(structuredClone(ex)); setDetail(null); }}>Editar</button>}</div>)}{!visible.length && <div className="empty-card"><h3>Sin resultados</h3><p>Prueba otro nombre o cambia el grupo muscular.</p><button className="text-action" onClick={()=>{setSearch('');setGroup('Todos')}}>Limpiar búsqueda y filtros</button></div>}</div>
    <button className="secondary wide" onClick={() => { setEdit({ id: newId(), name: '', group: GROUPS[0], mode: 'external_load_reps', loadConvention: 'total', primaryMuscles: [], secondaryMuscles: [] }); setError(''); }}>Crear ejercicio propio</button>
    {detail && <section className="exercise-guide" aria-label={`Ficha: ${detail.name}`}><div className="section-heading"><h2>{detail.name}</h2><button className="icon-button" aria-label="Cerrar ficha" onClick={() => setDetail(null)}>×</button></div><ExerciseThumbnail exerciseId={detail.id} image={detail.image} large /><p>{detail.description ?? `Registro de ${detail.name.toLocaleLowerCase('es-ES')}. Conserva la misma variante y material para comparar tus sesiones.`}</p><p>{detail.technique ?? 'Prepara el material y el espacio, usa un recorrido que puedas controlar y termina la serie si aparece dolor. Ajusta la ejecución con un profesional si lo necesitas.'}</p><p>Material: {detail.equipment ?? (detail.mode === 'bodyweight_reps' ? 'Peso corporal' : detail.name.toLowerCase().includes('mancuerna') ? 'Mancuerna' : detail.name.toLowerCase().includes('barra') ? 'Barra y discos' : 'Máquina o polea específica')}</p><p className="muted">Fichas e ilustraciones esquemáticas propias de Cheesit · CC BY 4.0. Sin recursos de terceros.</p>{detail.resource && <p><a href={detail.resource.url} target="_blank" rel="noreferrer">{detail.resource.title}</a> · {detail.resource.license}</p>}</section>}
    {edit && <section className="form-card" aria-label="Editor de ejercicio propio"><h2>{exercises.some(ex => ex.id === edit.id) ? 'Editar ejercicio propio' : 'Nuevo ejercicio'}</h2><fieldset className="session-fields" disabled={busy}>
      <label>Nombre del ejercicio<input maxLength={80} value={edit.name} onChange={event => setEdit({ ...edit, name: event.target.value })} /></label>
      <label>Grupo del ejercicio<select value={edit.group} onChange={event => setEdit({ ...edit, group: event.target.value })}>{GROUPS.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Modalidad<select value={edit.mode} onChange={event => setEdit({ ...edit, mode: event.target.value as Exercise['mode'] })}><option value="external_load_reps">Carga externa y repeticiones</option><option value="bodyweight_reps">Peso corporal y repeticiones</option></select></label>
      {edit.mode === 'external_load_reps' && <label>Convención de carga<select value={edit.loadConvention ?? 'total'} onChange={event => setEdit({ ...edit, loadConvention: event.target.value as Exercise['loadConvention'] })}><option value="total">Carga total del movimiento</option><option value="per_unit_bilateral">Por mancuerna · dos a la vez</option><option value="per_unit_alternating">Por mancuerna · repeticiones alternas totales</option><option value="per_unit_single">Una mancuerna · repeticiones realizadas</option></select></label>}
      {(['primaryMuscles', 'secondaryMuscles'] as const).map(key => (
        <fieldset key={key} className="muscle-choices">
          <legend>{key === 'primaryMuscles' ? 'Músculos principales' : 'Músculos secundarios'}</legend>
          {MUSCLES.map(muscle => (
            <label className={`check-label ${styles.muscleChoice}`} key={muscle.id}>
              <input
                type="checkbox"
                checked={edit[key]?.includes(muscle.id) ?? false}
                onChange={event => changeMuscle(muscle.id, key, event.target.checked)}
              />
              <span>{muscle.label}</span>
            </label>
          ))}
        </fieldset>
      ))}
      <label>Descripción<textarea maxLength={2000} placeholder="Opcional" value={edit.description ?? ''} onChange={event => setEdit({ ...edit, description: event.target.value })} /></label>
      <div className="exercise-actions"><button className="primary" onClick={() => void save(edit, Boolean(onSelect))}>{busy ? 'Guardando…' : onSelect ? 'Guardar y añadir' : 'Guardar ejercicio'}</button><button className="secondary" onClick={() => setEdit(null)}>Cancelar</button>{exercises.some(ex => ex.id === edit.id) && <button className="text-action" onClick={() => void save({ ...edit, archived: !edit.archived })}>{edit.archived ? 'Restaurar ejercicio' : 'Archivar ejercicio'}</button>}</div>
      <p className="muted">Los cambios se aplican a sesiones nuevas. El historial conserva la modalidad, la carga y los músculos registrados.</p>
    </fieldset></section>}
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
