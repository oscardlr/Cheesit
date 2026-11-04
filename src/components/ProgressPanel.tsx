'use client';

import { useMemo, useState } from 'react';
import { GROUPS } from '@/lib/catalog';
import { totals, workoutExerciseSessions } from '@/lib/metrics';
import { validSet, type AppData, type Exercise, type Workout } from '@/lib/model';
import ProgressWords from './ProgressWords';
import BodyWeightProgress from './BodyWeightProgress';
import ExerciseThumbnail from './ExerciseThumbnail';
import InfoPopup from './InfoPopup';
import type { AthleteProfile } from '@/lib/strength';
import { effectiveLoad, estimatedOneRepMax } from '@/lib/strength';
import filterStyles from './ExerciseLibrary.module.css';
import './training-controls.css';

const fmt = (n: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(n);
const dateLabel = (date: string) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const METRICS = [
  { id: 'weight', label: 'Carga total máxima · kg', description: 'Carga externa total por serie. Las cargas por mancuerna se convierten para poder comparar. Se muestra la modalidad más reciente.' },
  { id: 'reps', label: 'Repeticiones', description: 'Repeticiones máximas por serie en cada sesión. Se muestra la modalidad más reciente.' },
  { id: 'volume', label: 'Volumen · kg × reps', description: 'Carga externa efectiva × repeticiones. Se agrupan los bloques de cada sesión.' },
  { id: 'estimated', label: '1RM estimado · kg', description: 'Estimación informativa para banca, sentadilla y peso muerto con barra, en series de 1–10 reps.' },
] as const;
type Metric = (typeof METRICS)[number]['id'];

export default function ProgressPanel({ history, exercises, selectedId, onSelect, onWorkout, onBack, profile, onWeightChange, data }: {
  data?: AppData;
  profile?: AthleteProfile; onWeightChange: (transform: (p?: AthleteProfile) => AthleteProfile) => Promise<void>;
  history: Workout[]; exercises: Exercise[]; selectedId: string | null; onSelect: (id: string) => void; onWorkout: (id: string) => void; onBack: () => void;
}) {
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('all');
  const [metric, setMetric] = useState<Metric>('weight');
  const selectedMetric = METRICS.find(option => option.id === metric) ?? METRICS[0];
  const [limit, setLimit] = useState('all');
  const matches = useMemo(() => selectedId ? workoutExerciseSessions(history, selectedId) : [], [history, selectedId]);
  const available = [...new Map([...history.flatMap(w => w.exercises.map(ex => ({ id: ex.exerciseId, name: ex.name, group: ex.group, mode: ex.mode }))), ...exercises].map(ex => [ex.id, ex])).values()].filter(ex => (group === 'all' || ex.group === group) && fold(ex.name).includes(fold(search.trim())));
  const activeMode=matches[0]?.e.mode;
  const sameMode=matches.filter(item=>item.e.mode===activeMode);
  const points = [...sameMode].reverse().map(({ w, e }) => {
    const sets = e.sets.filter(set => set.confirmed && validSet(set, e.mode));
    const estimates = sets.flatMap(set => { const value = estimatedOneRepMax(e, set); return value === null ? [] : [value]; });
    return { w, e, weight: Math.max(0, ...sets.map(set => effectiveLoad(e,set.weight??0))), reps: Math.max(0, ...sets.map(set => set.reps ?? 0)), volume: totals([{ ...w, exercises: [e] }]).volume, estimated: estimates.length ? Math.max(...estimates) : null };
  }).filter(point => limit === 'all' || Date.parse(point.w.date) >= Date.now() - Number(limit) * 86400000);
  const plotted = points.filter(point => point[metric] !== null);
  const max = Math.max(1, ...plotted.map(point => point[metric] ?? 0));
  return <>
    <header className="page-header"><button className="icon-button back" aria-label="Volver" onClick={onBack}>‹</button><h1>Progreso</h1><span /></header>
    {!selectedId && <BodyWeightProgress profile={profile} onChange={onWeightChange}/>}
    <fieldset className={filterStyles.groupFilter}><legend>Grupo muscular</legend><div className={filterStyles.groupButtons}>{[{ id: 'all', label: 'Todos' }, ...GROUPS.map(value => ({ id: value, label: value }))].map(option => <button type="button" key={option.id} aria-pressed={group === option.id} onClick={() => { setGroup(option.id); onSelect(''); }}>{option.label}</button>)}</div></fieldset>
    <input type="search" aria-label="Buscar ejercicio" placeholder="Buscar ejercicio" value={search} onChange={event => {setSearch(event.target.value);onSelect('')}} />
    {!selectedId && (available.length ? <div className="list-card progress-search-list" aria-label="Ejercicios encontrados">{available.map(ex => <button type="button" className="list-row" key={ex.id} onClick={() => onSelect(ex.id)}><ExerciseThumbnail exerciseId={ex.id} image={'image' in ex ? ex.image as string : undefined}/><span className="list-copy"><strong>{ex.name}</strong><small>{ex.group}</small></span><span>→</span></button>)}</div> : <p className="notice" role="status">No hay ejercicios con ese nombre en el grupo seleccionado.</p>)}
    {selectedId && <><div className="progress-hero"><ExerciseThumbnail exerciseId={selectedId} image={exercises.find(ex=>ex.id===selectedId)?.image} large/><div><span className="eyebrow">TU EVOLUCIÓN</span><h2>{matches[0]?.e.name ?? exercises.find(ex => ex.id === selectedId)?.name}</h2></div></div>
      <button type="button" className="text-action progress-change-exercise" onClick={() => onSelect('')}>Cambiar ejercicio</button>
      <div className="progress-options"><fieldset><legend>Métrica</legend><div className={filterStyles.groupButtons}>{METRICS.map(option => <button type="button" key={option.id} aria-pressed={metric === option.id} onClick={() => setMetric(option.id)}>{option.label}</button>)}</div></fieldset><fieldset><legend>Periodo</legend><div className={filterStyles.groupButtons}>{[{ id: 'all', label: 'Todo el historial' }, { id: '30', label: 'Últimos 30 días' }, { id: '90', label: 'Últimos 90 días' }, { id: '365', label: 'Último año' }].map(option => <button type="button" key={option.id} aria-pressed={limit === option.id} onClick={() => setLimit(option.id)}>{option.label}</button>)}</div></fieldset></div>
      {plotted.length ? <figure className="progress-chart"><figcaption className="progress-chart-heading"><span>{selectedMetric.label}</span><InfoPopup title={selectedMetric.label}><p>{selectedMetric.description}</p></InfoPopup></figcaption><svg viewBox="0 0 600 200" role="img" aria-label={`Evolución en ${plotted.length} sesiones; consulta los valores en la tabla inferior`}><line x1="25" y1="175" x2="575" y2="175" stroke="#8c7b9b" /><polyline fill="none" stroke="#d8ff3e" strokeWidth="3" points={plotted.map((point, index) => `${25 + (plotted.length === 1 ? 275 : index * 550 / (plotted.length - 1))},${175 - (point[metric] ?? 0) / max * 145}`).join(' ')} />{plotted.map((point, index) => <circle key={`${point.w.id}-${point.e.mode}-${point.e.loadConvention}`} cx={25 + (plotted.length === 1 ? 275 : index * 550 / (plotted.length - 1))} cy={175 - (point[metric] ?? 0) / max * 145} r="5" fill="#b8a0ff"><title>{dateLabel(point.w.date)}: {fmt(point[metric] ?? 0)}</title></circle>)}</svg><div className="chart-dates"><span>{dateLabel(plotted[0].w.date)}</span><span>{dateLabel(plotted[plotted.length - 1].w.date)}</span></div></figure> : <p className="notice">{metric === 'estimated' ? 'No hay series válidas para estimar 1RM. No se estiman máquinas, ejercicios propios ni peso corporal.' : 'Aún no hay actividad en este periodo.'}</p>}
      <ProgressWords data={data} history={history} exerciseId={selectedId} workoutId={sameMode[0]?.w.id} onWorkout={onWorkout}/>
      <h2>Historial de sesiones</h2><div className="progress-table-scroll"><table className="progress-table"><caption>Máximos por serie y volumen de la sesión; abre una fecha para ver sus series.</caption><thead><tr><th>Sesión</th><th>Kg totales</th><th>Reps</th><th>Volumen</th><th>1RM</th></tr></thead><tbody>{[...points].reverse().map(point => <tr key={`${point.w.id}-${point.e.mode}-${point.e.loadConvention}`}><th><button className="text-action" onClick={() => onWorkout(point.w.id)}>{dateLabel(point.w.date)} · {point.w.name}</button></th><td>{fmt(point.weight)}</td><td>{point.reps}</td><td>{fmt(point.volume)}</td><td>{point.estimated === null ? '—' : fmt(point.estimated)}</td></tr>)}</tbody></table></div>
    </>}
  </>;
}
