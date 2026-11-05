'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, Heart } from 'lucide-react';
import { todayMadrid } from '@/lib/dates';
import { normalizeGame } from '@/lib/game';
import type { AppData } from '@/lib/model';
import { muscleActivity } from '@/lib/muscles';
import { seasonBounds, seasonLabel } from '@/lib/seasons';
import BodyFigure, { activityColor } from './MuscleMap';
import './game-hub.css';

const fmt = (value: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(value);

function ProgressBar({ value, label }: { value: number; label: string }) {
  return <div className="arcade-progress" role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${value}%` }} /></div>;
}

export default function MuscleProgress({ data, today }: { data: AppData; today: string }) {
  const [bodySide, setBodySide] = useState<'front' | 'back'>('front');
  const [selectedMuscle, setSelectedMuscle] = useState('chest');
  const [monthChoice, setMonthChoice] = useState('');
  const game = useMemo(() => normalizeGame(data.game), [data.game]);
  const selectedMonth = monthChoice || today.slice(0, 7);
  const muscles = useMemo(() => muscleActivity(data.workouts, today, selectedMonth, data.profile), [data.workouts, today, selectedMonth, data.profile]);
  const selected = muscles.find(muscle => muscle.id === selectedMuscle) ?? muscles[0];
  const months = [...new Set([today.slice(0, 7), ...data.workouts.filter(workout => workout.status !== 'deleted').map(workout => workout.date.slice(0, 7)), ...(game.missionRewards ?? []).map(reward => todayMadrid(new Date(reward.awardedAt)).slice(0,7)), ...game.transactions.map(transaction => todayMadrid(new Date(transaction.createdAt)).slice(0,7))])].sort().reverse();
  const selectMuscle = (id: string) => { setSelectedMuscle(id); if (['back','triceps','glutes','hamstrings'].includes(id)) setBodySide('back'); else if (['chest','biceps','abs','quads'].includes(id)) setBodySide('front'); };

  return <section className="game-hub arcade-redesign view-body" aria-label="Mapa muscular">
        <div className="arcade-section-head"><div><span className="eyebrow">MAPA MUSCULAR</span><h2>Actividad por músculo</h2></div><label className="mission-filter">Mes muscular<select aria-label="Mes muscular" value={monthChoice} onChange={event => setMonthChoice(event.target.value)}><option value="">{seasonLabel(today.slice(0,7))} · actual</option>{months.filter(month => month !== today.slice(0,7)).map(month => <option key={month} value={month}>{seasonLabel(month)} · histórico</option>)}</select></label></div>
        <div className="arcade-body-grid"><article className="body-map-card" data-side={bodySide}><div className="body-map-top"><span><i className="activity-dot" aria-hidden="true"/> ACTIVIDAD REGISTRADA</span><small>TOCA UN MÚSCULO</small></div><div className="body-view-controls" aria-label="Vista del mapa muscular"><button aria-pressed={bodySide==='front'} onClick={()=>setBodySide('front')}>Frente</button><button aria-pressed={bodySide==='back'} onClick={()=>setBodySide('back')}>Espalda</button></div><div className="body-figures"><BodyFigure back={false} muscles={muscles} selected={selectedMuscle} onSelect={selectMuscle} /><BodyFigure back muscles={muscles} selected={selectedMuscle} onSelect={selectMuscle} /></div><div className="body-legend">{[['#40344f', '0'], ['#7160a0', '0,5–3,5'], ['#b8a0ff', '4–8,5'], ['#d8ff3e', '9+']].map(([color, label]) => <span key={label}><i style={{ background: color }} />{label}</span>)}<small>series equivalentes</small></div></article>
          <aside className="body-detail"><span className="eyebrow">TU FOCO</span><h3>{selected?.label}</h3><div className="muscle-level-panel"><div><span className="eyebrow">{selectedMonth === today.slice(0,7) ? 'TEMPORADA ACTUAL' : 'TEMPORADA HISTÓRICA'}</span><strong>NIVEL {selected?.level ?? 1}</strong><small>{selected?.rank}</small></div><div className="muscle-level-xp"><span>{fmt(selected?.levelXp ?? 0)} / {fmt(selected?.nextLevelXp ?? 500)} XP</span><ProgressBar value={selected?.percent ?? 0} label={'Nivel muscular de ' + selected?.label}/></div><p>{fmt(selected?.xp ?? 0)} XP en {seasonLabel(selectedMonth)}. Reinicio: {seasonBounds(selectedMonth).next}. {fmt(selected?.lifetimeSets ?? 0)} series equivalentes históricas. Nivel de juego basado en lo registrado; no mide condición física.</p></div><div className="body-detail-total" style={{ color: selected?.weightedSets ? activityColor(selected.weightedSets) : '#b59cc8' }}><strong>{fmt(selected?.weightedSets ?? 0)}</strong><span>SERIES EQUIVALENTES<br />{seasonLabel(selectedMonth).toLocaleUpperCase('es-ES')}</span></div><dl><div><dt>Series directas</dt><dd>{selected?.sets ?? 0}</dd></div><div><dt>Participación secundaria</dt><dd>{selected?.secondarySets ?? 0}</dd></div><div><dt>Repeticiones con participación</dt><dd>{fmt(selected?.reps ?? 0)}</dd></div><div><dt>Última actividad</dt><dd>{selected?.lastDate ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${selected.lastDate}T12:00:00Z`)) : 'Sin registrar'}</dd></div></dl><p>1 serie directa = 1 equivalente. Una participación secundaria suma 0,5.</p>{selected?.approximate && <p className="body-approximate">Incluye ejercicios personalizados: la asignación por grupo es aproximada.</p>}<div className="body-detail-hint"><Heart size={17} /><span>El color refleja actividad, no crecimiento ni recuperación muscular.</span></div></aside></div>
        <div className="muscle-list">{muscles.map(muscle => <button key={muscle.id} aria-pressed={selectedMuscle === muscle.id} onClick={() => selectMuscle(muscle.id)}><span className="muscle-list-dot" style={{ background: activityColor(muscle.weightedSets) }} /><span>{muscle.label}<small className="muscle-list-level">NIVEL {muscle.level}</small></span><strong>{fmt(muscle.weightedSets)} <small>series</small></strong><ChevronRight size={15} /></button>)}</div>

  </section>;
}
