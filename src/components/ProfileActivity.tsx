import { ChevronRight, Dumbbell, Layers, Zap } from 'lucide-react';
import type { Workout } from '@/lib/model';
import { totals } from '@/lib/metrics';
import { levelRank } from '@/lib/rewards';
import ExerciseThumbnail from './ExerciseThumbnail';

const number = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 });
const dateLabel = (date: string) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));

export function ProfileStats({ workouts, sets, level, xp }: { workouts: number; sets: number; level: number; xp?: number }) {
  return <><dl className="profile-stats" aria-label="Resumen de actividad"><div><dt><Dumbbell size={16}/>Entrenamientos</dt><dd>{number(workouts)}</dd><span>completados</span></div><div><dt><Layers size={16}/>Series</dt><dd>{number(sets)}</dd><span>realizadas</span></div><div><dt><Zap size={16}/>Nivel actual</dt><dd>{number(level)}</dd><span>{levelRank(level)}</span></div></dl>{xp !== undefined && <p className="profile-xp">{number(xp)} XP esta temporada</p>}</>;
}

export function ProfileWorkouts({ workouts, onWorkout }: { workouts: Workout[]; onWorkout: (id: string) => void }) {
  return <div className="profile-workout-list">{workouts.map(workout => { const summary = totals([workout]); return <button className="profile-workout" key={workout.id} onClick={() => onWorkout(workout.id)}><ExerciseThumbnail exerciseId={workout.exercises[0]?.exerciseId || ''}/><span className="profile-workout-copy"><time dateTime={workout.date}>{dateLabel(workout.date)}</time><strong>{workout.name}</strong><span>{workout.exercises.length} {workout.exercises.length === 1 ? 'ejercicio' : 'ejercicios'} · {summary.sets} {summary.sets === 1 ? 'serie' : 'series'} · {number(summary.reps)} reps</span></span><ChevronRight size={18}/></button>; })}</div>;
}
