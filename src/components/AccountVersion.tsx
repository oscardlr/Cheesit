import type { AppData, Workout } from '../lib/model';
import type { GameState } from '../lib/game';
import { GEAR } from '../lib/gear';
import { PersonalAvatar } from './PersonalProfile';
import type { PersonalProfile } from '../lib/personal-profile';
import { COMPANIONS } from '../lib/companions';

/** User-facing comparison: people choose training/game versions, not JSON. */
export function AccountVersion({ value }: { value: unknown }) {
  if (value == null) return <p>Sin registro o eliminado en esta versión.</p>;
  if (typeof value !== 'object' || Array.isArray(value)) return <p>Valor: {String(value)}</p>;
  const data = value as Partial<AppData & Workout & GameState>;
  const game = data.game ?? (data.inventory ? data as GameState : undefined);
  const profile = data.profile ?? ('weightKg' in data ? data as AppData['profile'] : undefined);
  const personal = data.personalProfile ?? ('displayName' in data ? value as PersonalProfile : undefined);
  const preferences = data.preferences ?? ('effects' in data ? data as AppData['preferences'] : undefined);
  const workouts = data.workouts ?? (data.date && data.exercises ? [data as Workout] : []);
  return <div className="account-version">
    {data.name !== undefined && <p><strong>{data.name || 'Sin nombre'}</strong>{data.exercises && ` · ${data.exercises.length} ejercicios`}</p>}
    {personal && <div className="account-personal-version"><PersonalAvatar photo={personal.photo} name={personal.displayName || "Tu perfil"}/><p><strong>{personal.displayName || "Sin nombre"}</strong></p><p>{personal.bio || "Sin biografía"}</p></div>}
    {profile && <p>Perfil: {profile.weightKg} kg · {profile.heightCm} cm · {profile.age} años · registro de mancuernas {profile.dumbbellLoad === 'pair' ? 'por pareja' : 'por mano'}.</p>}
    {preferences && <p>Efectos: {preferences.effects ? 'activados' : 'desactivados'} · sonido: {preferences.sound ? 'activado' : 'desactivado'}.</p>}
    {game && <><p>{game.inventory.length} objetos · {game.transactions.length} movimientos · {game.abilityUses?.length ?? 0} usos de habilidades · {game.missionRewards?.length ?? 0} objetivos cobrados. Meta: {game.weeklyWorkoutGoal} días por semana.</p><details><summary>Ver colección de esta versión</summary><ul>{game.inventory.map(item => <li key={item.id}>{GEAR.find(g => g.id === item.gearId)?.name ?? COMPANIONS.find(c => c.id === item.companionId)?.name ?? (item.quoteId ? 'Frase histórica' : 'Objeto histórico')} · {new Date(item.acquiredAt).toLocaleDateString('es-ES')}</li>)}</ul></details></>}
    {Array.isArray(data.workouts) && <p>{workouts.length} entrenamientos guardados.</p>}
    {workouts.length > 0 && <div className="account-version-history">{workouts.map(workout => <details key={workout.id}><summary>{workout.date || 'Fecha pendiente'} · {workout.name || 'Sin nombre'} · {({ draft: 'borrador', finished: 'finalizado', deleted: 'eliminado' })[workout.status]}</summary><ul>{workout.exercises.map(ex => <li key={ex.id}><strong>{ex.name}</strong><ul>{ex.sets.map(set => <li key={set.id}>{set.weight ?? '—'} kg × {set.reps ?? '—'} reps{set.confirmed ? ' · realizada' : ' · pendiente'}</li>)}</ul></li>)}</ul></details>)}</div>}
    {!game && !profile && !personal && !preferences && !data.workouts && !data.exercises && !data.name && <p>Sin actividad en esta versión.</p>}
  </div>;
}
