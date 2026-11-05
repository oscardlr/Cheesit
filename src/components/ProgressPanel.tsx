'use client';

import { useMemo, useState } from 'react';
import { GROUPS } from '@/lib/catalog';
import { exerciseProgressSessions, type ExerciseProgressSession } from '@/lib/metrics';
import type { AppData, Exercise, Workout } from '@/lib/model';
import ProgressWords from './ProgressWords';
import ExerciseThumbnail from './ExerciseThumbnail';
import InfoPopup from './InfoPopup';
import filterStyles from './ExerciseLibrary.module.css';
import './training-controls.css';

const metricLabel = 'kg × reps';
const dateLabel = (date: string) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
const fmt = (value: number) => value.toLocaleString('es-ES', { maximumFractionDigits: 2 });
const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const periods = [
  { id: 'all', label: 'Todo el historial' },
  { id: '30', label: 'Últimos 30 días' },
  { id: '90', label: 'Últimos 90 días' },
  { id: '365', label: 'Último año' },
];

function ExerciseProgressDetail({ data, history, exercise, exerciseId, onWorkout }: {
  data?: AppData;
  history: Workout[];
  exercise?: Exercise;
  exerciseId: string;
  onWorkout: (id: string) => void;
}) {
  const [limit, setLimit] = useState('all');
  const [showAll, setShowAll] = useState(false);
  const sessions = useMemo(() => exerciseProgressSessions(history, exerciseId), [history, exerciseId]);
  const name = sessions[0]?.workout.exercises.find(item => item.exerciseId === exerciseId)?.name ?? exercise?.name;
  const visibleSessions = showAll ? sessions : sessions.slice(0, 5);
  const cutoff = limit === 'all' ? 0 : Date.now() - Number(limit) * 86400000;
  const plotted = sessions.filter((session): session is ExerciseProgressSession & { kgReps: number } =>
    session.kgReps !== null && (limit === 'all' || Date.parse(session.workout.date) >= cutoff)
  ).reverse();
  const max = plotted.reduce((best, session) => Math.max(best, session.kgReps), 1);
  const x = (index: number) => plotted.length === 1 ? 300 : 25 + index * 550 / (plotted.length - 1);
  const y = (value: number) => 175 - value / max * 145;

  return <>
    <div className="progress-hero">
      <ExerciseThumbnail exerciseId={exerciseId} image={exercise?.image} large/>
      <div><span className="eyebrow">TU EVOLUCIÓN</span><h2>{name}</h2></div>
    </div>
    <div className="progress-options">
      <fieldset>
        <legend>Periodo del gráfico</legend>
        <div className={filterStyles.groupButtons}>
          {periods.map(option => <button type="button" key={option.id} aria-pressed={limit === option.id} onClick={() => setLimit(option.id)}>{option.label}</button>)}
        </div>
      </fieldset>
    </div>
    {plotted.length ? <figure className="progress-chart">
      <figcaption className="progress-chart-heading">
        <span>{metricLabel}</span>
        <InfoPopup title={metricLabel}><p>Multiplicamos la carga externa total por las repeticiones de cada serie de trabajo confirmada. Cada sesión aporta su mejor serie. Una marca nueva supera el mejor valor de todas las sesiones anteriores.</p><p>El peso corporal sin carga externa queda sin valor en esta métrica.</p></InfoPopup>
      </figcaption>
      <svg viewBox="0 0 600 200" role="img" aria-label={`Evolución en ${metricLabel} de ${plotted.length} sesiones; consulta los valores en la tabla inferior`}>
        <line x1="25" y1="175" x2="575" y2="175" stroke="#8c7b9b"/>
        <polyline fill="none" stroke="#d8ff3e" strokeWidth="3" points={plotted.map((session, index) => `${x(index)},${y(session.kgReps)}`).join(' ')}/>
        {plotted.map((session, index) => <circle key={session.workout.id} cx={x(index)} cy={y(session.kgReps)} r="5" fill="#b8a0ff">
          <title>{dateLabel(session.workout.date)} · {fmt(session.kgReps)} {metricLabel}</title>
        </circle>)}
      </svg>
      <div className="chart-dates"><span>{dateLabel(plotted[0].workout.date)}</span><span>{dateLabel(plotted.at(-1)!.workout.date)}</span></div>
    </figure> : <p className="notice">Aún no hay series con carga externa registrada en este periodo.</p>}

    <h2>Historial de sesiones</h2>
    {sessions.length ? <>
      <div className="progress-table-scroll">
        <table className="progress-table">
          <caption>Mejor serie de cada sesión. Abre una fecha para consultar todas sus series.</caption>
          <thead><tr><th scope="col">Sesión</th><th scope="col">{metricLabel}</th></tr></thead>
          <tbody>
            {visibleSessions.map(({ workout, kgReps, newRecord }) => <tr key={workout.id}>
              <th scope="row"><button type="button" className="text-action" onClick={() => onWorkout(workout.id)}>{dateLabel(workout.date)} · {workout.name}</button></th>
              <td>{kgReps === null ? '—' : fmt(kgReps)}{newRecord && <strong className="progress-record-label"> Nueva marca</strong>}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {sessions.length > 5 && <button type="button" className="secondary" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}>{showAll ? 'Ver menos' : 'Ver más'}</button>}
    </> : <p className="notice">Aún no hay sesiones registradas para este ejercicio.</p>}
    <ProgressWords data={data} history={history} exerciseSessions={sessions} workoutId={sessions[0]?.workout.id} onWorkout={onWorkout}/>
  </>;
}

export default function ProgressPanel({ history, exercises, selectedId, onSelect, onWorkout, onBack, data }: {
  data?: AppData;
  history: Workout[];
  exercises: Exercise[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onWorkout: (id: string) => void;
  onBack: () => void;
}) {
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('all');
  const searchable = useMemo(() => [...new Map([
    ...history.flatMap(workout => workout.exercises.map(exercise => ({ id: exercise.exerciseId, name: exercise.name, group: exercise.group, image: undefined }))),
    ...exercises,
  ].map(exercise => [exercise.id, exercise])).values()], [exercises, history]);
  const query = fold(search.trim());
  const available = selectedId ? [] : searchable.filter(exercise => (group === 'all' || exercise.group === group) && fold(exercise.name).includes(query));

  return <>
    {selectedId ? <>
      <header className="page-header">
        <button type="button" className="icon-button back" aria-label="Volver" onClick={onBack}>‹</button>
        <h2>Marca por ejercicio</h2>
        <span/>
      </header>
      <ExerciseProgressDetail key={selectedId} data={data} history={history} exercise={exercises.find(exercise => exercise.id === selectedId)} exerciseId={selectedId} onWorkout={onWorkout}/>
    </> : <>
      <fieldset className={filterStyles.groupFilter}>
        <legend>Grupo muscular</legend>
        <div className={filterStyles.groupButtons}>
          {[{ id: 'all', label: 'Todos' }, ...GROUPS.map(value => ({ id: value, label: value }))].map(option =>
            <button type="button" key={option.id} aria-pressed={group === option.id} onClick={() => setGroup(option.id)}>{option.label}</button>
          )}
        </div>
      </fieldset>
      <input type="search" aria-label="Buscar ejercicio" placeholder="Buscar ejercicio" value={search} onChange={event => setSearch(event.target.value)}/>
      {available.length ? <div className="list-card progress-search-list" aria-label="Ejercicios encontrados">
        {available.map(exercise => <button type="button" className="list-row" key={exercise.id} onClick={() => onSelect(exercise.id)}>
          <ExerciseThumbnail exerciseId={exercise.id} image={exercise.image}/>
          <span className="list-copy"><strong>{exercise.name}</strong><small>{exercise.group}</small></span>
          <span>→</span>
        </button>)}
      </div> : <p className="notice" role="status">No hay ejercicios con ese nombre en el grupo seleccionado.</p>}
    </>}
  </>;
}
