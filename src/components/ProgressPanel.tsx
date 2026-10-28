'use client';

import { useMemo, useState } from 'react';
import { comparableSets, totals, workoutExerciseSessions } from '@/lib/metrics';
import { validSet, type Exercise, type Workout } from '@/lib/model';
import { effectiveLoad, estimatedOneRepMax } from '@/lib/strength';

const fmt = (n: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(n);
const dateLabel = (date: string) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
type Metric = 'weight' | 'reps' | 'volume' | 'estimated';

export default function ProgressPanel({ history, exercises, selectedId, onSelect, onWorkout, onBack }: {
  history: Workout[]; exercises: Exercise[]; selectedId: string | null; onSelect: (id: string) => void; onWorkout: (id: string) => void; onBack: () => void;
}) {
  const [search, setSearch] = useState('');
  const [metric, setMetric] = useState<Metric>('weight');
  const [limit, setLimit] = useState('all');
  const matches = useMemo(() => selectedId ? workoutExerciseSessions(history, selectedId) : [], [history, selectedId]);
  const available = [...new Map([...exercises, ...history.flatMap(w => w.exercises.map(ex => ({ id: ex.exerciseId, name: ex.name, group: ex.group, mode: ex.mode })))].map(ex => [ex.id, ex])).values()].filter(ex => fold(ex.name).includes(fold(search)));
  const activeMode=matches[0]?.e.mode;
  const sameMode=matches.filter(item=>item.e.mode===activeMode);
  const points = [...sameMode].reverse().map(({ w, e }) => {
    const sets = e.sets.filter(set => set.confirmed && validSet(set, e.mode));
    const estimates = sets.flatMap(set => { const value = estimatedOneRepMax(e, set); return value === null ? [] : [value]; });
    return { w, e, weight: Math.max(0, ...sets.map(set => effectiveLoad(e,set.weight??0))), reps: Math.max(0, ...sets.map(set => set.reps ?? 0)), volume: totals([{ ...w, exercises: [e] }]).volume, estimated: estimates.length ? Math.max(...estimates) : null };
  }).filter(point => limit === 'all' || Date.parse(point.w.date) >= Date.now() - Number(limit) * 86400000);
  const plotted = points.filter(point => point[metric] !== null);
  const max = Math.max(1, ...plotted.map(point => point[metric] ?? 0));
  const previous=sameMode.find(item=>item.w.id!==sameMode[0]?.w.id);
  const comparison = previous && sameMode[0] ? comparableSets(previous.e, sameMode[0].e) : null;
  return <>
    <header className="page-header"><button className="icon-button back" aria-label="Volver" onClick={onBack}>‹</button><h1>Progreso</h1><span /></header>
    <label>Buscar progreso por ejercicio<input type="search" placeholder="Nombre de ejercicio" value={search} onChange={event => {setSearch(event.target.value);onSelect('')}} /></label>
    <label>Ejercicio<select value={selectedId ?? ''} onChange={event => onSelect(event.target.value)}><option value="">Elige un ejercicio</option>{available.map(ex => <option value={ex.id} key={ex.id}>{ex.name}</option>)}</select></label>
    {!selectedId && <div className="list-card progress-search-list">{available.map(ex => <button className="list-row" key={ex.id} onClick={() => onSelect(ex.id)}><span className="list-copy"><strong>{ex.name}</strong><small>{ex.group}</small></span><span>→</span></button>)}</div>}
    {selectedId && <><div className="progress-hero"><div><span className="eyebrow">TU EVOLUCIÓN</span><h2>{matches[0]?.e.name ?? exercises.find(ex => ex.id === selectedId)?.name}</h2></div></div>
      <div className="optional-fields"><label>Métrica<select value={metric} onChange={event => setMetric(event.target.value as Metric)}><option value="weight">Carga externa total máxima · kg</option><option value="reps">Repeticiones máximas por serie</option><option value="volume">Volumen externo · kg × reps</option><option value="estimated">1RM estimado · kg</option></select></label><label>Periodo<select value={limit} onChange={event => setLimit(event.target.value)}><option value="all">Todo el historial</option><option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option><option value="365">Último año</option></select></label></div>
      {plotted.length ? <figure className="progress-chart"><figcaption>{metric === 'estimated' ? 'Estimación informativa para banca, sentadilla y peso muerto con barra, en series de 1–10 reps.' : metric === 'volume' ? 'Carga externa efectiva × repeticiones. Se agrupan los bloques de cada sesión.' : 'Carga externa total por serie. Las cargas por mancuerna se convierten para poder comparar. Se muestra la modalidad más reciente.'}</figcaption><svg viewBox="0 0 600 200" role="img" aria-label={`Evolución en ${plotted.length} sesiones; consulta los valores en la tabla inferior`}><line x1="25" y1="175" x2="575" y2="175" stroke="#8c7b9b" /><polyline fill="none" stroke="#d8ff3e" strokeWidth="3" points={plotted.map((point, index) => `${25 + (plotted.length === 1 ? 275 : index * 550 / (plotted.length - 1))},${175 - (point[metric] ?? 0) / max * 145}`).join(' ')} />{plotted.map((point, index) => <circle key={`${point.w.id}-${point.e.mode}-${point.e.loadConvention}`} cx={25 + (plotted.length === 1 ? 275 : index * 550 / (plotted.length - 1))} cy={175 - (point[metric] ?? 0) / max * 145} r="5" fill="#b8a0ff"><title>{dateLabel(point.w.date)}: {fmt(point[metric] ?? 0)}</title></circle>)}</svg><div className="chart-dates"><span>{dateLabel(plotted[0].w.date)}</span><span>{dateLabel(plotted[plotted.length - 1].w.date)}</span></div></figure> : <p className="notice">{metric === 'estimated' ? 'No hay series válidas para estimar 1RM. No se estiman máquinas, ejercicios propios ni peso corporal.' : 'Aún no hay actividad en este periodo.'}</p>}
      {comparison && <div className="notice"><strong>Últimas dos sesiones · {dateLabel(previous!.w.date)} → {dateLabel(sameMode[0].w.date)}</strong>{comparison.loads.length || comparison.repetitions.length ? <>{comparison.loads.map(item => <p key={`w${item.reps}`}>{item.reps} reps · carga total: {fmt(item.previous)} → {fmt(item.current)} kg ({item.change >= 0 ? '+' : ''}{fmt(item.change)} kg)</p>)}{comparison.repetitions.map(item => <p key={`r${item.weight}`}>{fmt(item.weight)} kg totales: {item.previous} → {item.current} reps</p>)}</> : <p>No hay series con la misma modalidad, convención y carga o repeticiones para comparar.</p>}</div>}
      <h2>Historial de sesiones</h2><div className="progress-table-scroll"><table className="progress-table"><caption>Máximos por serie y volumen de la sesión; abre una fecha para ver sus series.</caption><thead><tr><th>Sesión</th><th>Kg totales</th><th>Reps</th><th>Volumen</th><th>1RM</th></tr></thead><tbody>{[...points].reverse().map(point => <tr key={`${point.w.id}-${point.e.mode}-${point.e.loadConvention}`}><th><button className="text-action" onClick={() => onWorkout(point.w.id)}>{dateLabel(point.w.date)} · {point.w.name}</button></th><td>{fmt(point.weight)}</td><td>{point.reps}</td><td>{fmt(point.volume)}</td><td>{point.estimated === null ? '—' : fmt(point.estimated)}</td></tr>)}</tbody></table></div>
    </>}
  </>;
}
