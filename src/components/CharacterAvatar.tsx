'use client';

import { ArrowUpRight, Shirt, Sparkles } from 'lucide-react';
import { useId, type CSSProperties } from 'react';
import type { AppData } from '@/lib/model';
import { GEAR, type GearSlot } from '@/lib/gear';
import { COMPANIONS } from '@/lib/companions';
import { gameProgress, normalizeGame, unlockedGear, unlockedCompanions, type GameState } from '@/lib/game';
import { getAbilityDefinition } from '@/lib/abilities';
import type { CharacterMotion } from '@/lib/character-motion';
import { CHARACTER_ART, CHARACTER_MASTER, CHARACTER_VIEWBOX, CHARACTER_SLOT_ORDER, CHARACTER_MASKS, COMPANION_ART } from '@/lib/character-art';
import { AtlasImage, CharacterGearArtwork } from './CharacterArtwork';
import { useImageFailure } from '@/lib/use-image-failure';
import './wardrobe-v3.css';
import './character-avatar.css';

export const SLOT_LABELS: Record<GearSlot, string> = { head: 'Cabeza', top: 'Torso', bottom: 'Piernas', hand: 'Mano', back: 'Espalda' };
const auraColors = { common: '#aeb8cc', rare: '#58aaff', epic: '#b68aff', legendary: '#ffcf63' };
export function GearSprite({ gearId, className = '' }: { gearId: string; className?: string }) {
  return <CharacterGearArtwork gearId={gearId} className={className}/>;
}
export function CompanionSprite({ companionId, className = '', animated = true }: { companionId: string; className?: string; animated?: boolean }) {
  const definition = COMPANIONS.find(item => item.id === companionId), art = COMPANION_ART[companionId];
  if (!definition || !art) return null;
  return <svg className={`companion-sprite companion-${definition.id} rarity-${definition.rarity} ${animated ? 'is-animated' : ''} ${className}`} viewBox={art.source.join(' ')} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${definition.name}, compañera adulta`} style={{ backgroundImage: 'none', '--companion-aura': auraColors[definition.rarity] } as CSSProperties} data-companion-id={definition.id}><AtlasImage source={art.source} id={companionId}/></svg>;
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

function MasterImage({ hand = false }: { hand?: boolean }) {
  const id = useId(), [failed, fail] = useImageFailure(CHARACTER_MASTER.src);
  return <svg className={hand ? 'character-foreground' : 'character-body'} viewBox={CHARACTER_VIEWBOX} aria-hidden="true">
    {hand && <defs><clipPath id={id}><path d={CHARACTER_MASKS.rightHand}/></clipPath></defs>}
    {failed ? !hand && <g data-art-fallback="master" fill="#55416c" stroke="#23182f" strokeWidth="8"><path d="M485 265Q440 272 390 310L305 410L250 570L245 785Q255 830 300 825L340 790L325 695L380 550L425 485L448 550L425 645L390 790L410 925L360 1125L285 1270L300 1310H465L485 1165L535 950L570 790L610 950L660 1165L680 1310H850L865 1270L785 1125L740 925L750 790L710 645L690 550L720 485L765 550L820 695L805 790L845 825Q890 830 900 785L895 570L840 410L755 310L660 265Z"/><ellipse cx="572" cy="165" rx="90" ry="114"/><path d="M525 170h25m45 0h25" stroke="#d8ff3e"/></g> : <image href={CHARACTER_MASTER.src} width={CHARACTER_MASTER.width} height={CHARACTER_MASTER.height} clipPath={hand ? `url(#${id})` : undefined} onError={fail}/>}
  </svg>;
}

function WornGear({ gearId, foreground = false }: { gearId: string; foreground?: boolean }) {
  const id = useId(), definition = GEAR.find(item => item.id === gearId), art = CHARACTER_ART[gearId];
  if (!definition || !art || (foreground && !art.foregroundMask)) return null;
  return <svg className={`${foreground ? 'character-clasp' : 'character-equipped'} character-slot-${definition.slot} character-gear-${definition.id}`} viewBox={CHARACTER_VIEWBOX} style={{ zIndex: foreground ? 4 : CHARACTER_SLOT_ORDER[definition.slot] } as CSSProperties} role={foreground ? undefined : 'img'} aria-label={foreground ? undefined : definition.name} aria-hidden={foreground || undefined} data-gear-id={definition.id} data-avatar-fit="registered">
    {foreground && <defs><clipPath id={id}><path d={art.foregroundMask}/></clipPath></defs>}
    <g clipPath={foreground ? `url(#${id})` : undefined}><CharacterGearArtwork gearId={gearId} worn contentOnly/></g>
  </svg>;
}

/** The whole registered pose moves as one rigid assembly: no cut joints or distorted clothing. */
export default function CharacterAvatar({ game, level, animated = true, compact = false, motion = 'idle' }: { game: GameState; level: number; animated?: boolean; compact?: boolean; motion?: CharacterMotion }) {
  const equipped = appearanceGear(game), gripping = equipped.some(({ definition }) => CHARACTER_ART[definition.id]?.grip);
  return <div className={`character-avatar ${animated ? 'is-animated' : ''} ${compact ? 'is-compact' : ''}`} data-motion={motion} data-physical-stage={CHARACTER_MASTER.stage} aria-label={`Tu personaje, nivel ${level}${equipped.length ? `, equipado con ${equipped.map(item => item.definition.name).join(', ')}` : ', equipamiento inicial'}`}>
    <div className="character-glow" aria-hidden="true"/><div className="character-orbit" aria-hidden="true"/>
    <div className="character-layers" data-avatar-viewbox={CHARACTER_VIEWBOX}><span className="character-base" aria-hidden="true"/><MasterImage/>{equipped.map(({ slot, definition }) => <WornGear key={slot} gearId={definition.id}/>)}{equipped.filter(({ definition }) => CHARACTER_ART[definition.id]?.foregroundMask).map(({ definition }) => <WornGear key={definition.id} gearId={definition.id} foreground/>)}{gripping && <MasterImage hand/>}</div>
    <div className="character-power-field" aria-hidden="true"><i/><i/><i/><i/></div><div className="character-platform" aria-hidden="true"/><span className="character-level"><Sparkles size={11}/> NIVEL {level}</span>
  </div>;
}
export function CharacterParty({game,level,animated=true,compact=false,motion='idle'}:{game:GameState;level:number;animated?:boolean;compact?:boolean;motion?:CharacterMotion}){
  const companion=unlockedCompanions(game).find(item=>item.id===game.equippedCompanionId);
  return <div className={`character-party ${companion?'has-companion':''} ${compact?'is-compact':''} ${animated?'is-animated':''}`}><CharacterAvatar game={game} level={level} animated={animated} compact={compact} motion={motion}/>{companion&&<div className="character-companion"><CompanionSprite companionId={companion.id} animated={animated}/><span>{companion.name}</span></div>}</div>;
}
export function CharacterCard({data,onOpen,animated=true}:{data:AppData;onOpen:()=>void;animated?:boolean}){
  const game=normalizeGame(data.game), progress=gameProgress(game,data.workouts,data.profile);
  const active=getAbilityDefinition(game.activeAbilityId);
  return <section className="character-summary-card"><div className="character-summary-copy"><span className="eyebrow"><Shirt size={13}/> TU ALTER EGO ARCADE</span><h2>Tu esfuerzo.<br/><em>Tu personaje.</em></h2><p>Aspectos para siempre. Equipo animado, compañeras y una habilidad para tu siguiente sesión.</p><div><span>{appearanceGear(game).length}/5 piezas equipadas</span><span>Nivel {progress.level}</span></div>{active&&<p className="character-active-ability"><Sparkles size={11}/>{active.name}</p>}<button onClick={()=>{try{sessionStorage.setItem('grind-open-wardrobe','1')}catch{}onOpen()}}>Personalizar personaje<ArrowUpRight size={17}/></button></div><CharacterParty game={game} level={progress.level} animated={animated}/></section>;
}
