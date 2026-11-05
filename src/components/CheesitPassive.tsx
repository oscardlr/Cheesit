import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { COMPANIONS } from '@/lib/companions';
import { getCompanionPassive, workoutPassiveReward } from '@/lib/cheesit-passives';
import { isCivilDate } from '@/lib/dates';
import type { Workout } from '@/lib/model';
import AbilityDetails from './AbilityDetails';
import CreditCoin from './CreditCoin';
import './cheesit-passive.css';

type Status = 'equipped' | 'available' | 'locked';
const statusLabels: Record<Status, string> = { equipped: 'Equipado', available: 'Disponible', locked: 'Pendiente de conseguir' };

export default function CheesitPassive({ companionId, status, compact = false, children }: { companionId: string; status?: Status; compact?: boolean; children?: ReactNode }) {
  const passive = getCompanionPassive(companionId);
  if (!passive) return null;
  return <div className={`cheesit-passive ${compact ? 'is-compact' : ''}`} data-passive-id={passive.id} data-passive-status={status} aria-label={`Pasiva: ${passive.name}`}>
    <AbilityDetails title={passive.name} icon={<Sparkles size={14} aria-hidden="true"/>}>
      <div className="cheesit-passive-heading"><span><Sparkles size={13} aria-hidden="true"/> PASIVA{status === 'equipped' ? ' ACTIVA' : ''}</span>{status && <small>{statusLabels[status]}</small>}</div>
      <strong className="cheesit-passive-value">{passive.parameters.credits > 0 && <><CreditCoin/> </>}{passive.valueLabel}</strong>
      <p>{passive.description}</p>
      {!compact && <small className="cheesit-passive-rule">Automática al equipar · Se fija al empezar la sesión.</small>}
      {children}
    </AbilityDetails>
  </div>;
}

export function SessionCheesitPassive({ workout }: { workout: Workout }) {
  const snapshot = workout.companionPassive;
  const companion = snapshot && COMPANIONS.find(item => item.id === snapshot.companionId);
  const startDay = snapshot && isCivilDate(snapshot.fixedDate) ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${snapshot.fixedDate}T12:00:00Z`)) : null;
  const note = workout.companionReward ? 'La condición y la bonificación ya quedaron guardadas al finalizar. Editar la sesión o cambiar de cheesit no vuelve a concederla ni la recalcula.'
    : snapshot && workout.date !== snapshot.fixedDate ? 'La fecha registrada no coincide con el día de inicio. Esta sesión no recibe bonificación del cheesit.'
      : 'Esta sesión conserva este cheesit aunque cambies el equipo. La condición se comprueba una sola vez al finalizar. Si terminas después de medianoche, conserva la fecha con la que empezó.';
  return <aside className="session-cheesit-passive" data-empty={!companion} aria-label="Pasiva del cheesit de esta sesión">
    {companion ? <CheesitPassive companionId={companion.id} compact><p>{companion.name} · Pasiva fijada al empezar</p>{startDay && <p>Inicio: {startDay} · hora de Madrid.</p>}<p>{note}</p></CheesitPassive>
      : <AbilityDetails title="Sesión sin pasiva de cheesit"><p>{snapshot === undefined ? 'Este registro se creó antes de las pasivas. Conserva sus recompensas habituales, sin bonificaciones retroactivas.' : 'Equipa un cheesit antes de la próxima sesión para activar su pasiva.'}</p></AbilityDetails>}
  </aside>;
}

export function WorkoutCheesitReward({ workout }: { workout: Workout }) {
  const award = workout.companionReward;
  const bonus = workoutPassiveReward(workout);
  const companion = award && COMPANIONS.find(item => item.id === award.companionId);
  const passive = award && getCompanionPassive(award.companionId);
  return <div className="workout-cheesit-reward" aria-label="Bonificación del cheesit">
    <span><Sparkles size={15} aria-hidden="true"/> Bonificación del cheesit</span>
    {companion && passive ? <><strong>{companion.name} · {passive.name}</strong><div><b>+{bonus.bonusXp} XP</b><b><CreditCoin/> +{bonus.bonusCredits} créditos directos</b></div><p>{award.reason === 'historical-date' ? 'Sin bonus: la fecha registrada no coincidía con el día de inicio de esta sesión.' : award.eligible ? 'Bonificación guardada al finalizar. Cambiar de cheesit o editar no vuelve a concederla.' : 'No se cumplió la condición de la pasiva al finalizar. La decisión queda guardada.'}</p></> : <><strong>+0 XP · <CreditCoin/> +0 créditos directos</strong><p>Esta sesión no tenía una pasiva elegible al empezar.</p></>}
  </div>;
}
