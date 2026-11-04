import { WandSparkles } from 'lucide-react';
import { getAbilityDefinition } from '@/lib/abilities';
import { getAbilityCharges, type GameState } from '@/lib/game';
import type { Workout } from '@/lib/model';
import AbilityDetails from './AbilityDetails';
import './session-ability.css';

export default function SessionAbilityNote({workout,game}:{workout:Workout;game:GameState}){
  const ability=getAbilityDefinition(workout.abilityId);
  if(!ability)return null;
  const charges=getAbilityCharges(game,ability.id);
  const used=Boolean(workout.abilityReward);
  return <aside className="session-ability-note" aria-label="Habilidad de esta sesión"><AbilityDetails title={ability.name} icon={<WandSparkles size={18} aria-hidden="true"/>}><p>{ability.description}</p><small>{used?'Bonus aplicado: editar esta sesión no consume otra carga.':charges>0?`${charges} cargas disponibles. Solo se consume una al finalizar si aporta un bonus.`:'Sin cargas disponibles: puedes entrenar y conservar su aspecto.'}</small></AbilityDetails></aside>;
}
