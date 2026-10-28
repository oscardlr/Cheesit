'use client';

import { ArrowUpRight, Shirt, Sparkles } from 'lucide-react';
import { useId, type CSSProperties } from 'react';
import type { AppData } from '@/lib/model';
import { GEAR, type GearSlot } from '@/lib/gear';
import { COMPANIONS } from '@/lib/companions';
import { gameProgress, normalizeGame, unlockedGear, unlockedCompanions, type GameState } from '@/lib/game';
import { getAbilityDefinition } from '@/lib/abilities';
import { AVATAR_FITS, AVATAR_SLOT_ORDER, AVATAR_VIEWBOX, RIGHT_HAND_SILHOUETTE, SHORTS_SILHOUETTE, TORSO_SILHOUETTE } from '@/lib/avatar-fit';
import './character-avatar.css';
import './wardrobe-v3.css';

export const SLOT_LABELS: Record<GearSlot, string> = { head: 'Cabeza', top: 'Torso', bottom: 'Piernas', hand: 'Mano', back: 'Espalda' };
const auraColors={common:'#aeb8cc',rare:'#58aaff',epic:'#b68aff',legendary:'#ffcf63'};
export function GearSprite({ gearId, className = '' }: { gearId: string; className?: string }) {
  const definition=GEAR.find(item=>item.id===gearId);
  if(!definition)return null;
  const sprite=definition.sprite, mythic=definition.atlas==='mythic';
  const style={backgroundPosition:`${(sprite%4)*100/3}% ${Math.floor(sprite/4)*(mythic?100:50)}%`,'--gear-aura':auraColors[definition.rarity]} as CSSProperties;
  return <span className={`gear-sprite ${mythic?'gear-atlas-mythic':''} rarity-${definition.rarity} ${className}`} data-gear-id={gearId} data-rarity={definition.rarity} style={style} role="img" aria-label={definition.name}/>;
}
export function CompanionSprite({companionId,className='',animated=true}:{companionId:string;className?:string;animated?:boolean}){
  const definition=COMPANIONS.find(item=>item.id===companionId);
  if(!definition)return null;
  const style={backgroundPosition:`${definition.sprite*100/3}% 50%`,'--companion-aura':auraColors[definition.rarity]} as CSSProperties;
  return <span className={`companion-sprite companion-${definition.id} rarity-${definition.rarity} ${animated?'is-animated':''} ${className}`} role="img" aria-label={`${definition.name}, compañera adulta`} style={style} data-companion-id={definition.id}/>;
}
export function appearanceGear(game:GameState){
  const available=new Set(unlockedGear(game).map(item=>item.id));
  if(game.cosmeticGear!==undefined)return Object.entries(game.cosmeticGear).flatMap(([slot,id])=>{
    const definition=GEAR.find(item=>item.id===id&&item.slot===slot&&available.has(item.id));
    return definition?[{slot,definition}]:[];
  });
  return Object.entries(game.equippedGear??{}).flatMap(([slot,instanceId])=>{
    const instance=game.inventory.find(item=>item.id===instanceId&&item.id!==game.pendingOpening?.itemId);
    const definition=GEAR.find(item=>item.id===instance?.gearId&&available.has(item.id));
    return definition?[{slot,definition}]:[];
  });
}

/** Inventory icons keep their atlas layout; worn art has its own anatomical fit. */
function WornGear({ gearId }: { gearId: string }) {
  const id = useId();
  const definition = GEAR.find(item => item.id === gearId);
  const fit = AVATAR_FITS[gearId];
  if (!definition || !fit) return null;
  const [sx, sy, sw, sh] = fit.source;
  const [x, y, width, height] = fit.target;
  const mythic = definition.atlas === 'mythic';
  const silhouette = fit.silhouette === 'torso' ? TORSO_SILHOUETTE : fit.silhouette === 'shorts' ? SHORTS_SILHOUETTE : undefined;
  return <svg
    className={`character-equipped character-slot-${definition.slot} character-gear-${definition.id} rarity-${definition.rarity}`}
    viewBox={AVATAR_VIEWBOX}
    style={{ '--gear-aura': auraColors[definition.rarity], zIndex: definition.slot === 'back' ? 0 : AVATAR_SLOT_ORDER[definition.slot] + 2 } as CSSProperties}
    role="img" aria-label={definition.name} data-gear-id={definition.id} data-rarity={definition.rarity} data-avatar-fit="anatomical"
  >
    <defs>
      {silhouette && <clipPath id={`${id}-body`}><path d={silhouette}/></clipPath>}
      {fit.sourceClip && <clipPath id={`${id}-source`}><path d={fit.sourceClip}/></clipPath>}
    </defs>
    <g clipPath={silhouette ? `url(#${id}-body)` : undefined}>
      {fit.fabric && <path d={silhouette ?? SHORTS_SILHOUETTE} fill={fit.fabric}/>}
      <svg x={x} y={y} width={width} height={height} viewBox={`${sx} ${sy} ${sw} ${sh}`} preserveAspectRatio="none" overflow="hidden">
        <g clipPath={fit.sourceClip ? `url(#${id}-source)` : undefined} transform={fit.flipY ? `translate(0 ${sy * 2 + sh}) scale(1 -1)` : undefined}>
          <image href={mythic ? '/assets/grind-gear-mythic.png' : '/assets/grind-gear.png'} width={mythic ? 1774 : 1448} height={mythic ? 887 : 1086}/>
        </g>
      </svg>
    </g>
  </svg>;
}
export default function CharacterAvatar({game,level,animated=true,compact=false}:{game:GameState;level:number;animated?:boolean;compact?:boolean}){
  const id=useId();
  const equipped=appearanceGear(game);
  const gripping=equipped.some(({definition})=>definition.slot==='hand'&&AVATAR_FITS[definition.id]?.grip);
  return <div className={`character-avatar ${animated?'is-animated':''} ${compact?'is-compact':''}`} aria-label={`Tu personaje, nivel ${level}${equipped.length?`, equipado con ${equipped.map(item=>item.definition.name).join(', ')}`:', equipamiento inicial'}`}>
    <div className="character-glow" aria-hidden="true"/><div className="character-orbit" aria-hidden="true"/>
    <div className="character-layers" data-avatar-viewbox={AVATAR_VIEWBOX}><span className="character-base" aria-hidden="true"/>{equipped.map(({slot,definition})=><WornGear key={slot} gearId={definition.id}/>)}{gripping&&<svg className="character-foreground" viewBox={AVATAR_VIEWBOX} aria-hidden="true"><defs><clipPath id={`${id}-grip`}><path d={RIGHT_HAND_SILHOUETTE}/></clipPath></defs><image href="/assets/grind-avatar-base.png" width="1145" height="1374" clipPath={`url(#${id}-grip)`}/></svg>}</div>
    <div className="character-platform" aria-hidden="true"/><span className="character-level"><Sparkles size={11}/> NIVEL {level}</span>
  </div>;
}
export function CharacterParty({game,level,animated=true,compact=false}:{game:GameState;level:number;animated?:boolean;compact?:boolean}){
  const companion=unlockedCompanions(game).find(item=>item.id===game.equippedCompanionId);
  return <div className={`character-party ${companion?'has-companion':''} ${compact?'is-compact':''} ${animated?'is-animated':''}`}><CharacterAvatar game={game} level={level} animated={animated} compact={compact}/>{companion&&<div className="character-companion"><CompanionSprite companionId={companion.id} animated={animated}/><span>{companion.name}</span></div>}</div>;
}
export function CharacterCard({data,onOpen,animated=true}:{data:AppData;onOpen:()=>void;animated?:boolean}){
  const game=normalizeGame(data.game), progress=gameProgress(game,data.workouts,data.profile);
  const active=getAbilityDefinition(game.activeAbilityId);
  return <section className="character-summary-card"><div className="character-summary-copy"><span className="eyebrow"><Shirt size={13}/> TU ALTER EGO ARCADE</span><h2>Tu esfuerzo.<br/><em>Tu personaje.</em></h2><p>Aspectos para siempre. Equipo animado, compañeras y una habilidad para tu siguiente sesión.</p><div><span>{appearanceGear(game).length}/5 piezas equipadas</span><span>Nivel {progress.level}</span></div>{active&&<p className="character-active-ability"><Sparkles size={11}/>{active.name}</p>}<button onClick={()=>{try{sessionStorage.setItem('grind-open-wardrobe','1')}catch{}onOpen()}}>Personalizar personaje<ArrowUpRight size={17}/></button></div><CharacterParty game={game} level={progress.level} animated={animated}/></section>;
}
