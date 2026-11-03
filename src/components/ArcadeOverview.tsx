'use client';

import { ArrowRight, Check, ChevronRight, Gift, Layers, LockKeyhole, Shirt, Sparkles, Target, TrendingUp, Zap } from 'lucide-react';
import { getAbilityDefinition } from '@/lib/abilities';
import { gameProgress, getAbilityCharges, getLevelCrates, unlockedCompanions, unlockedGear, type GameState } from '@/lib/game';
import type { Mission } from '@/lib/objectives';
import type { MuscleActivity } from '@/lib/muscles';
import { levelRank } from '@/lib/rewards';
import { CharacterParty, CompanionSprite, GearSprite } from './CharacterAvatar';
import CrateArtwork from './CrateArtwork';
import BodyFigure from './MuscleMap';
import type { ArcadeView } from './GameHub';

const fmt = (n: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(n);
type Props = {
  game: GameState;
  progress: ReturnType<typeof gameProgress>;
  missions: Mission[];
  muscles: MuscleActivity[];
  levelCrates: ReturnType<typeof getLevelCrates>;
  today: string;
  effectsEnabled: boolean;
  busy: boolean;
  onNavigate: (view: ArcadeView) => void;
  onOpenReward: (level: number, season: string) => void;
  onResumeOpening: () => void;
};

export default function ArcadeOverview({ game, progress, missions, muscles, levelCrates, today, effectsEnabled, busy, onNavigate, onOpenReward, onResumeOpening }: Props) {
  const ready = levelCrates.filter(crate => !crate.claimed);
  const reward = ready[0];
  const weekly = missions.filter(mission => mission.scope === 'weekly');
  const complete = weekly.filter(mission => mission.complete).length;
  const nextMission = [...weekly].sort((a, b) => Number(a.rewarded) - Number(b.rewarded) || b.current / b.target - a.current / a.target)[0];
  const gear = unlockedGear(game);
  const companions = unlockedCompanions(game);
  const ability = getAbilityDefinition(game.activeAbilityId);
  const charges=ability?getAbilityCharges(game,ability.id):0;
  const activeMuscles = muscles.filter(muscle => muscle.weightedSets > 0);
  const strongest = [...activeMuscles].sort((a, b) => b.weightedSets - a.weightedSets)[0];
  const xpRemaining = Math.max(0, progress.nextLevelXp - progress.levelXp);

  return <div className="arcade-overview-grid">
    <section className="arcade-player" aria-label="Tu personaje y nivel">
      <div className="arcade-player-copy">
        <span className="tile-kicker">TU ALTER EGO</span>
        <h2>Hecho de<br/><em>constancia.</em></h2>
        <div className="player-level"><span>{String(progress.level).padStart(2, '0')}</span><div><strong>Nivel actual</strong><span>{levelRank(progress.level)}</span></div></div>
        <button className="player-customize" onClick={() => onNavigate('looks')}>Personalizar personaje<ArrowRight size={17}/></button>
      </div>
      <div className="arcade-player-art"><CharacterParty game={game} level={progress.level} animated={effectsEnabled}/></div>
      <div className="arcade-player-xp">
        <div><span>{progress.level === 99 ? 'Nivel máximo' : `${fmt(progress.levelXp)} / ${fmt(progress.nextLevelXp)} XP`}</span><button onClick={() => onNavigate('ascent')}>Ver ascenso<TrendingUp size={15}/></button></div>
        <div className="arcade-progress" role="progressbar" aria-label="Experiencia del personaje" aria-valuenow={Math.round(progress.percent)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress.percent}%` }}/></div>
        <p>{progress.level === 99 ? `${fmt(progress.xp)} XP acumulados` : `${fmt(xpRemaining)} XP para el nivel ${progress.level + 1}`}<span>Temporada {today.slice(0, 4)}</span></p>
      </div>
    </section>

    <section className="arcade-reward-tile" aria-label="Recompensas disponibles">
      <span className="tile-kicker"><Gift size={14}/>RECOMPENSAS</span>
      <div className="reward-tile-copy"><h2>{game.pendingOpening ? 'Sorpresa pendiente.' : ready.length ? <>{ready.length}<span> {ready.length === 1 ? 'cofre' : 'cofres'}<br/>{' '}por abrir.</span></> : progress.level<2?'El próximo es tuyo.':'Todo al día.'}</h2><p>{game.pendingOpening ? 'Tu apertura está guardada.' : ready.length ? 'Los has ganado subiendo de nivel.' : progress.level<2?'Sube al nivel 2 para ganar tu primer cofre.':'Consulta tus recompensas en Ascenso.'}</p></div>
      <div className="reward-tile-art" aria-hidden="true"><CrateArtwork crateId={reward ? `level:${reward.level}` : 'starter'}/></div>
      <div className="reward-tile-actions">
        {game.pendingOpening ? <button className="primary" onClick={onResumeOpening}>Continuar apertura<ArrowRight size={16}/></button> : reward ? <button className="primary" disabled={busy} onClick={() => onOpenReward(reward.level, reward.season)}>{busy ? 'Guardando…' : 'Abrir gratis'}<ArrowRight size={16}/></button> : <button className="secondary" onClick={() => onNavigate('ascent')}>Ver mi ascenso<TrendingUp size={16}/></button>}
        <button className="reward-shop-link" onClick={() => onNavigate('crates')}>Todos los cofres<ChevronRight size={15}/></button>
      </div>
    </section>

    <button className="arcade-goal-tile arcade-destination" onClick={() => onNavigate('goals')}>
      <div className="tile-top"><span className="tile-kicker"><Target size={15}/>OBJETIVOS</span><ArrowRight size={19}/></div>
      <div className="goal-dial"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="43"/><circle cx="50" cy="50" r="43" className="goal-dial-fill" strokeDasharray={`${weekly.length ? complete / weekly.length * 270.18 : 0} 270.18`}/></svg><span><strong>{complete}</strong><small>/ {weekly.length}</small></span></div>
      <h2>{weekly.length>0&&complete===weekly.length?'Semana completa.':'Una meta más.'}</h2>
      <p>{nextMission ? nextMission.title : 'Elige tus días de entrenamiento.'}</p>
      <span className="tile-bottom">Objetivos semanales<ChevronRight size={14}/></span>
    </button>

    <button className="arcade-body-tile arcade-destination" onClick={() => onNavigate('body')}>
      <div className="tile-top"><span className="tile-kicker">MAPA MUSCULAR</span><ArrowRight size={19}/></div>
      <div className="body-tile-art" aria-hidden="true"><BodyFigure back={false} muscles={muscles}/></div>
      <div className="body-tile-copy"><strong>{activeMuscles.length}<small>/ 10</small></strong><h2>Músculos activos</h2><p>{strongest ? `${strongest.label} · ${fmt(strongest.weightedSets)} series` : 'Tu actividad de este mes.'}</p></div>
      <span className="tile-bottom">Ver mi actividad<ChevronRight size={14}/></span>
    </button>

    <button className="arcade-collection-tile arcade-destination" onClick={() => onNavigate('collection')}>
      <div className="tile-top"><span className="tile-kicker"><Layers size={15}/>COLECCIÓN</span><ArrowRight size={19}/></div>
      <div className="collection-tile-art" aria-hidden="true">{gear[0] ? <GearSprite gearId={gear[0].id}/> : <span className="collection-placeholder"><Shirt size={38}/></span>}{companions[0] ? <CompanionSprite companionId={companions[0].id} animated={effectsEnabled}/> : <span className="collection-placeholder"><LockKeyhole size={27}/></span>}</div>
      <div className="collection-tile-copy"><h2>Tu estilo. Tus reglas.</h2><p>{gear.length + companions.length} aspectos · {companions.length} cheesits</p></div>
      <span className="tile-bottom">Abrir inventario<ChevronRight size={14}/></span>
    </button>

    <button className="arcade-ability-tile arcade-destination" onClick={() => onNavigate('abilities')}>
      <span className="ability-tile-icon"><Zap size={24}/></span><div><span className="tile-kicker">PRÓXIMA SESIÓN</span><h2>{ability ? ability.name : 'Prepara tu habilidad'}</h2><p>{ability ? charges?`${fmt(charges)} ${charges===1?'carga disponible':'cargas disponibles'} · lista para entrenar`:'Sin cargas · consigue un duplicado' : 'Elige una bonificación entre las piezas de tu colección.'}</p></div><ArrowRight size={22}/>
    </button>
  </div>;
}
