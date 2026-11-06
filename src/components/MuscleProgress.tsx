'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, Heart } from 'lucide-react';
import type { AppData } from '@/lib/model';
import { muscleActivity } from '@/lib/muscles';
import BodyFigure, { MUSCLE_LEVEL_COLORS, muscleLevelColor } from './MuscleMap';
import './game-hub.css';

const fmt = (value: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(value);

function ProgressBar({ value, label }: { value: number; label: string }) {
  return <div className="arcade-progress" role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${value}%` }} /></div>;
}

export default function MuscleProgress({ data, today }: { data: AppData; today: string }) {
  const [bodySide, setBodySide] = useState<'front' | 'back'>('front');
  const [selectedMuscle, setSelectedMuscle] = useState('chest');
  const muscles = useMemo(() => muscleActivity(data.workouts, today, data.profile), [data.workouts, today, data.profile]);
  const selected = muscles.find(muscle => muscle.id === selectedMuscle) ?? muscles[0];
  const selectMuscle = (id: string) => { setSelectedMuscle(id); if (['back','triceps','glutes','hamstrings'].includes(id)) setBodySide('back'); else if (['chest','biceps','abs','quads'].includes(id)) setBodySide('front'); };

  return <section className="game-hub arcade-redesign view-body" aria-label="Mapa muscular">
        <div className="arcade-section-head"><div><span className="eyebrow">MAPA MUSCULAR</span><h2>Actividad por músculo</h2></div></div>
        <div className="arcade-body-grid"><article className="body-map-card" data-side={bodySide}><div className="body-map-top"><span><i className="activity-dot" aria-hidden="true"/> NIVEL MUSCULAR</span><small>TOCA UN MÚSCULO</small></div><div className="body-view-controls" aria-label="Vista del mapa muscular"><button aria-pressed={bodySide==='front'} onClick={()=>setBodySide('front')}>Frente</button><button aria-pressed={bodySide==='back'} onClick={()=>setBodySide('back')}>Espalda</button></div><div className="body-figures"><BodyFigure back={false} muscles={muscles} selected={selectedMuscle} onSelect={selectMuscle} /><BodyFigure back muscles={muscles} selected={selectedMuscle} onSelect={selectMuscle} /></div><div className="body-legend">{MUSCLE_LEVEL_COLORS.map(({ min, max, color }) => <span key={min}><i style={{ background: color }} />{min === max ? min : `${min}–${max}`}</span>)}<small>niveles musculares</small></div></article>
          <aside className="body-detail"><span className="eyebrow">TU FOCO</span><h3>{selected?.label}</h3><div className="muscle-level-panel"><div><span className="eyebrow">PROGRESO ACUMULADO</span><strong style={{ color: muscleLevelColor(selected.level) }}>NIVEL {selected.level}</strong><small>{selected?.rank}</small></div><div className="muscle-level-xp"><span>{selected.nextLevelXp ? `${fmt(selected.levelXp)} / ${fmt(selected.nextLevelXp)} XP` : 'Nivel máximo'}</span><ProgressBar value={selected?.percent ?? 0} label={'Nivel muscular de ' + selected?.label}/></div><p>{fmt(selected.xp)} XP acumulada</p></div><div className="body-detail-total" style={{ color: muscleLevelColor(selected.level) }}><strong>{fmt(selected?.weightedSets ?? 0)}</strong><span>SERIES EQUIVALENTES</span></div><dl><div><dt>Series directas</dt><dd>{selected?.sets ?? 0}</dd></div><div><dt>Participación secundaria</dt><dd>{selected?.secondarySets ?? 0}</dd></div><div><dt>Repeticiones con participación</dt><dd>{fmt(selected?.reps ?? 0)}</dd></div><div><dt>Última actividad</dt><dd>{selected?.lastDate ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${selected.lastDate}T12:00:00Z`)) : 'Sin registrar'}</dd></div></dl><p>1 serie directa = 1 equivalente. Una participación secundaria suma 0,5.</p>{selected?.approximate && <p className="body-approximate">Incluye ejercicios personalizados: la asignación por grupo es aproximada.</p>}<div className="body-detail-hint"><Heart size={17} /><span>El color corresponde al nivel acumulado del músculo.</span></div></aside></div>
        <div className="muscle-list">{muscles.map(muscle => <button key={muscle.id} aria-pressed={selectedMuscle === muscle.id} onClick={() => selectMuscle(muscle.id)}><span className="muscle-list-dot" style={{ background: muscleLevelColor(muscle.level) }} /><span>{muscle.label}<small className="muscle-list-level">NIVEL {muscle.level}</small></span><strong>{fmt(muscle.weightedSets)} <small>series</small></strong><ChevronRight size={15} /></button>)}</div>

  </section>;
}
