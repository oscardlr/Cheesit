import type { ExerciseProgressSession } from '@/lib/metrics';
import type { AppData, Workout } from '@/lib/model';
import { consistencyInsight, progressInsights, type ProgressInsight } from '@/lib/training-features';
import InfoPopup from './InfoPopup';

const fmt = (value: number) => value.toLocaleString('es-ES', { maximumFractionDigits: 2 });

function exerciseInsights(sessions: ExerciseProgressSession[]): ProgressInsight[] {
  const comparable = sessions.filter((session): session is ExerciseProgressSession & { kgReps: number } => session.kgReps !== null);
  const [latest, previous] = comparable;
  if (!latest || !previous) return [];
  const insights: ProgressInsight[] = [{
    kind: 'improvement',
    text: latest.kgReps === previous.kgReps
      ? `Igualaste el mejor valor de la sesión anterior, ${fmt(latest.kgReps)} kg × reps.`
      : `Tu mejor serie pasó de ${fmt(previous.kgReps)} a ${fmt(latest.kgReps)} kg × reps entre las dos últimas sesiones con carga registrada.`,
    workoutIds: [previous.workout.id, latest.workout.id],
    dates: [previous.workout.date, latest.workout.date],
  }];
  if (latest.newRecord) insights.push({
    kind: 'record',
    text: `Con ${fmt(latest.kgReps)} kg × reps superaste tu mejor serie de todas las sesiones anteriores.`,
    workoutIds: [latest.workout.id],
    dates: [latest.workout.date],
  });
  return insights;
}

export default function ProgressWords({ history, workoutId, exerciseSessions, onWorkout, data }: {
  data?: AppData;
  history: Workout[];
  workoutId?: string;
  exerciseSessions?: ExerciseProgressSession[];
  onWorkout: (id: string) => void;
}) {
  const progress = exerciseSessions ? exerciseInsights(exerciseSessions) : progressInsights(history, workoutId);
  const anchor = workoutId ? history.find(workout => workout.id === workoutId)?.date : [...history].sort((a, b) => b.date.localeCompare(a.date))[0]?.date;
  const consistency = data && anchor ? consistencyInsight(data, anchor) : null;
  const insights = [...progress.slice(0, consistency ? 5 : 6), ...(consistency ? [consistency] : [])];

  return <section className="training-feature progress-words" aria-label="Tu progreso explicado">
    <span className="eyebrow">TUS REGISTROS, EN PALABRAS</span>
    <div className="progress-words-heading">
      <h2>Qué ha cambiado</h2>
      <InfoPopup title="Tus registros en palabras">
        {exerciseSessions
          ? <p>Comparamos la mejor serie de cada sesión con carga externa registrada. Las cargas de mancuernas se convierten a carga externa total.</p>
          : <p>Las cargas de mancuernas se convierten a carga externa total. El volumen describe trabajo registrado; por sí solo no demuestra un aumento de fuerza.</p>}
      </InfoPopup>
    </div>
    {insights.length ? insights.map((insight, index) => <article key={index}>
      <strong>{insight.kind === 'record' ? 'Récord personal' : insight.kind === 'consistency' ? 'Constancia' : exerciseSessions ? 'Entre sesiones' : 'Mejora entre sesiones'}</strong>
      <p>{insight.text}</p>
      <div className="feature-actions">
        {insight.workoutIds.map((id, i) => <button type="button" className="text-action" key={id} onClick={() => onWorkout(id)}>Ver sesión · {insight.dates[i]}</button>)}
      </div>
    </article>) : <p>{exerciseSessions
      ? 'Registra al menos dos sesiones con carga externa para comparar tu mejor serie.'
      : 'Aún no hay mejoras comparables que explicar. Hace falta el mismo ejercicio y modalidad, con series de trabajo confirmadas que compartan carga o repeticiones. Los calentamientos no se comparan.'}</p>}
  </section>;
}
