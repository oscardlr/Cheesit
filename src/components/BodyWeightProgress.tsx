'use client';

import { useRef, useState } from 'react';
import { Scale, Target } from 'lucide-react';
import { bodyWeightXp, recordBodyWeight, setWeightGoal, weightEntries } from '@/lib/body-weight';
import { todayMadrid } from '@/lib/dates';
import type { AthleteProfile } from '@/lib/strength';
import InfoPopup from './InfoPopup';
import './body-weight-progress.css';

const fmt = (n: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(n);
const dateLabel = (date: string) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));

export default function BodyWeightProgress({ profile, onChange }: {
  profile?: AthleteProfile;
  onChange: (transform: (current?: AthleteProfile) => AthleteProfile) => Promise<void>;
}) {
  const entries = weightEntries(profile), tracking = profile?.weightTracking;
  const current = entries.at(-1)?.weightKg ?? profile?.weightKg, goal = tracking?.goalKg;
  const [date, setDate] = useState(todayMadrid());
  const [weight, setWeight] = useState(String(current ?? ''));
  const [goalInput, setGoalInput] = useState(String(goal ?? ''));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const save = async (transform: (p?: AthleteProfile) => AthleteProfile, message: string) => {
    if (lock.current) return;
    lock.current = true; setSaving(true); setNotice('');
    try { await onChange(transform); setNotice(message); setEditing(false); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'No se ha confirmado el guardado. Reintenta para sincronizar tus datos.'); }
    finally { lock.current = false; setSaving(false); }
  };
  const remaining = current !== undefined && goal !== undefined ? Math.abs(current - goal) : undefined;
  const initialDistance = goal !== undefined && tracking?.baselineKg !== undefined ? Math.abs(tracking.baselineKg - goal) : undefined;
  const percent = initialDistance === undefined || remaining === undefined ? 0 : initialDistance === 0 ? (remaining === 0 ? 100 : 0) : Math.max(0, Math.min(100, (1 - remaining / initialDistance) * 100));
  const values = [...entries.map(e => e.weightKg), ...(goal === undefined ? [] : [goal])];
  const low = Math.min(...values) - 1, high = Math.max(...values) + 1;
  const y = (v: number) => 176 - (v - low) / (high - low) * 140;
  const firstDay = entries.length ? Date.parse(entries[0].date) : 0, lastDay = entries.length ? Date.parse(entries.at(-1)!.date) : 0;
  const x = (d: string) => firstDay === lastDay ? 300 : 52 + (Date.parse(d) - firstDay) / (lastDay - firstDay) * 496;

  return <section className="body-weight-progress" aria-labelledby="body-weight-title" aria-busy={saving}>
    <div className="section-heading"><div><span className="eyebrow">TU OBJETIVO PERSONAL</span><h2 id="body-weight-title"><Scale size={22}/> Peso corporal<InfoPopup title="Peso corporal"><p>Ganas 100 XP por cada kg nuevo que te acerca a tu objetivo, al subir o al bajar. Alejarte no resta XP.</p><p>Corregir registros, repetir un tramo o cambiar de objetivo no vuelve a premiar ese progreso. Se guarda un peso por fecha; los registros anteriores a la última fecha no generan XP.</p></InfoPopup></h2></div><Target size={22}/></div>
    <div className="body-weight-stats"><div><small>Peso actual</small><strong>{current === undefined ? 'Sin registrar' : `${fmt(current)} kg`}</strong><span>{entries.length ? dateLabel(entries.at(-1)!.date) : profile ? 'Peso conservado del perfil · sin fecha original' : 'Añade tu primer registro'}</span></div><div><small>Mi objetivo</small><strong>{goal === undefined ? 'Por definir' : `Llegar a ${fmt(goal)} kg`}</strong><span>{remaining === undefined ? 'Puedes subir o bajar de peso' : remaining < .05 ? '¡Objetivo alcanzado!' : `A ${fmt(remaining)} kg de tu objetivo`}</span></div><div><small>Acercamiento al objetivo</small><strong>{Math.round(percent)}%</strong><span>{fmt(bodyWeightXp(profile))} XP de progreso acumulada</span></div></div>
    {goal !== undefined && <progress value={percent} max={100} aria-label="Acercamiento al objetivo de peso"/>}
    <div className="body-weight-forms"><form onSubmit={event => { event.preventDefault(); void save(p => recordBodyWeight(p, { date, weightKg: Number(weight) }), editing ? 'Registro corregido. La XP no se vuelve a premiar.' : 'Peso guardado.'); }}><h3>{editing ? 'Corregir registro' : 'Registrar peso'}</h3><fieldset disabled={saving}><label>Fecha del peso<input type="date" required max={todayMadrid()} value={date} readOnly={editing} onChange={event => setDate(event.target.value)}/></label><label>Peso corporal (kg)<input type="number" required min={30} max={300} step={.1} value={weight} onChange={event => setWeight(event.target.value)}/></label><button type="submit" className="primary">{saving ? 'Guardando…' : editing ? 'Guardar corrección' : 'Guardar peso'}</button>{editing && <button type="button" className="text-action" onClick={() => { setEditing(false); setDate(todayMadrid()); setWeight(String(current ?? '')); }}>Cancelar corrección</button>}</fieldset></form>
    <form onSubmit={event => { event.preventDefault(); void save(p => setWeightGoal(p, Number(goalInput)), 'Objetivo de peso guardado.'); }}><h3>Mi objetivo de peso</h3><fieldset disabled={saving}><label>Objetivo de peso (kg)<input type="number" required min={30} max={300} step={.1} placeholder="80" value={goalInput} onChange={event => setGoalInput(event.target.value)}/></label><button type="submit" className="secondary">Guardar objetivo</button></fieldset></form></div>
    {notice && <p className="notice" role="status">{notice}</p>}
    {entries.length > 0 ? <><figure className="progress-chart body-weight-chart"><figcaption>Evolución del peso · kg{goal !== undefined && <span> · Línea discontinua: objetivo {fmt(goal)} kg</span>}</figcaption><svg viewBox="0 0 600 215" role="img" aria-label="Evolución de tu peso corporal y objetivo; valores disponibles en el historial inferior"><text x="4" y="35">{fmt(high)}</text><text x="4" y="180">{fmt(low)}</text><line x1="52" y1="185" x2="548" y2="185" stroke="#8c7b9b"/>{goal !== undefined && <g className="body-weight-goal-line"><line x1="52" y1={y(goal)} x2="548" y2={y(goal)} stroke="#b8a0ff" strokeWidth="2" strokeDasharray="7 5"/><text x="548" y={y(goal) - 8} textAnchor="end">Objetivo {fmt(goal)} kg</text></g>}<polyline fill="none" stroke="#d8ff3e" strokeWidth="3" points={entries.map(e => `${x(e.date)},${y(e.weightKg)}`).join(' ')}/>{entries.map(e => <circle key={e.date} cx={x(e.date)} cy={y(e.weightKg)} r="5" fill="#d8ff3e"><title>{dateLabel(e.date)}: {fmt(e.weightKg)} kg</title></circle>)}</svg><div className="chart-dates"><span>{dateLabel(entries[0].date)}</span><span>{dateLabel(entries.at(-1)!.date)}</span></div></figure>
    <details className="body-weight-history"><summary>Historial de peso · {entries.length} registros</summary><ul>{[...entries].reverse().map(e => <li key={e.date}><time dateTime={e.date}>{dateLabel(e.date)}</time><strong>{fmt(e.weightKg)} kg</strong><button type="button" className="text-action" disabled={saving} aria-label={`Corregir peso del ${e.date}`} onClick={() => { setDate(e.date); setWeight(String(e.weightKg)); setEditing(true); setNotice(''); }}>{'Corregir'}</button></li>)}</ul></details></> : <p className="notice">Registra tu peso con fecha para empezar la gráfica. Tu peso anterior se conserva sin inventar una fecha.</p>}
  </section>;
}
