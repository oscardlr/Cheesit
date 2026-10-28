'use client';

import { ArrowUpRight, Shirt, Sparkles } from 'lucide-react';
import { useId, type CSSProperties, type ReactNode } from 'react';
import type { AppData } from '@/lib/model';
import { GEAR, type GearSlot } from '@/lib/gear';
import { COMPANIONS } from '@/lib/companions';
import { gameProgress, normalizeGame, unlockedGear, unlockedCompanions, type GameState } from '@/lib/game';
import { getAbilityDefinition } from '@/lib/abilities';
import { AVATAR_FITS, AVATAR_SLOT_ORDER, AVATAR_VIEWBOX, RIGHT_HAND_SILHOUETTE, SHORTS_SILHOUETTE, TORSO_SILHOUETTE } from '@/lib/avatar-fit';
import type { CharacterMotion } from '@/lib/character-motion';
import { GEAR_ART } from '@/lib/gear-art';
import { GearArtwork } from './GearArtwork';
import './wardrobe-v3.css';
import './character-avatar.css';

export const SLOT_LABELS: Record<GearSlot, string> = { head: 'Cabeza', top: 'Torso', bottom: 'Piernas', hand: 'Mano', back: 'Espalda' };
const auraColors={common:'#aeb8cc',rare:'#58aaff',epic:'#b68aff',legendary:'#ffcf63'};
export function GearSprite({ gearId, className = '' }: { gearId: string; className?: string }) {
  const definition=GEAR.find(item=>item.id===gearId);
  if(!definition)return null;
  if(definition.artwork==='forge')return <GearArtwork gearId={gearId} className={className}/>;
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

type JointName = 'torso' | 'head' | 'left-upper-arm' | 'right-upper-arm' | 'left-forearm' | 'right-forearm' | 'left-thigh' | 'right-thigh' | 'left-shin' | 'right-shin';

function Joint({ name, children, gear }: { name: JointName; children: ReactNode; gear?: GearSlot }) {
  return <g className={`character-joint joint-${name}`} data-joint={name} data-gear-joint={gear}>{children}</g>;
}

// Overlap joints in the original pixel coordinates: rotating a limb never exposes
// a rectangular image edge, and every attached cosmetic uses the same pivots.
const BODY_REGIONS: Record<JointName, string> = {
  head: 'M440 0H708V256L662 284H478L440 255Z',
  torso: 'M497 247H646L665 273L698 280L726 303L720 368L704 411L734 482L715 514L687 552L702 608L716 666H425L432 629L449 552L424 509L407 482L437 410L451 368L455 302L477 275Z',
  'left-upper-arm': 'M460 280L466 347L432 438L407 504L377 548L319 548L285 493L290 425L310 370L338 326L384 299Z',
  'right-upper-arm': 'M684 280L681 347L714 438L740 504L770 548L827 548L862 493L857 425L836 370L808 326L762 299Z',
  'left-forearm': 'M302 470L387 494L376 552L355 610L327 674L327 695L350 724L358 793L332 838H251L231 790L233 713L245 674L238 558Z',
  'right-forearm': 'M842 470L758 494L769 552L790 610L818 674L818 695L795 724L787 793L813 838H894L914 790L912 713L900 674L907 558Z',
  'left-thigh': 'M377 638H574V961H363Z',
  'right-thigh': 'M571 638H767L782 961H571Z',
  'left-shin': 'M378 877H517L486 1026L478 1147V1344H271V1206L343 1103L357 961Z',
  'right-shin': 'M629 877H768L789 961L802 1103L874 1206V1344H667V1147L659 1026Z',
};

function CharacterBody({ foreground = false }: { foreground?: boolean }) {
  const id = useId();
  const part = (name: JointName) => <image href="/assets/grind-avatar-base.png" width="1145" height="1374" clipPath={`url(#${id}-${name})`}/>;
  return <svg className={foreground ? 'character-limb-foreground' : 'character-body'} viewBox={AVATAR_VIEWBOX} aria-hidden="true">
    <defs>{Object.entries(BODY_REGIONS).map(([name, path]) => <clipPath key={name} id={`${id}-${name}`}><path d={path}/></clipPath>)}</defs>
    {!foreground && <><Joint name="left-thigh">{part('left-thigh')}<Joint name="left-shin">{part('left-shin')}</Joint></Joint>
      <Joint name="right-thigh">{part('right-thigh')}<Joint name="right-shin">{part('right-shin')}</Joint></Joint></>}
    <Joint name="torso">
      {!foreground && part('torso')}
      <Joint name="left-upper-arm">{part('left-upper-arm')}<Joint name="left-forearm">{part('left-forearm')}</Joint></Joint>
      <Joint name="right-upper-arm">{part('right-upper-arm')}<Joint name="right-forearm">{part('right-forearm')}</Joint></Joint>
      {!foreground && <Joint name="head">{part('head')}<g className="character-blink"><path d="M518 172H549M582 172H613" fill="none" stroke="#ed9558" strokeWidth="15" strokeLinecap="square"/><path d="M519 177H548M583 177H612" fill="none" stroke="#452131" strokeWidth="4"/></g></Joint>}
    </Joint>
  </svg>;
}

/** Atlas inventory icons and body-fitted art share the character's joint rig. */
function GearImage({ gearId }: { gearId: string }) {
  const id = useId();
  const definition = GEAR.find(item => item.id === gearId);
  if (definition?.artwork === 'forge') return <GearArtwork gearId={gearId} worn contentOnly/>;
  const fit = AVATAR_FITS[gearId];
  if (!definition || !fit) return null;
  const [sx, sy, sw, sh] = fit.source;
  const [x, y, width, height] = fit.target;
  const mythic = definition.atlas === 'mythic';
  const silhouette = fit.silhouette === 'torso' ? TORSO_SILHOUETTE : fit.silhouette === 'shorts' ? SHORTS_SILHOUETTE : undefined;
  return <g>
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
  </g>;
}

function WornGear({ gearId }: { gearId: string }) {
  const id = useId();
  const definition = GEAR.find(item => item.id === gearId);
  if (!definition || (!AVATAR_FITS[gearId] && !GEAR_ART[gearId])) return null;
  const art = <GearImage gearId={gearId}/>;
  let attachment: ReactNode;
  if (definition.slot === 'bottom') {
    attachment = <>
      <defs>
        <clipPath id={`${id}-left-leg`}><path d="M0 0H573V930H0Z"/></clipPath><clipPath id={`${id}-right-leg`}><path d="M573 0H1145V930H573Z"/></clipPath>
        <clipPath id={`${id}-left-shin`}><path d="M0 898H573V1374H0Z"/></clipPath><clipPath id={`${id}-right-shin`}><path d="M573 898H1145V1374H573Z"/></clipPath>
      </defs>
      <Joint name="left-thigh" gear="bottom"><g clipPath={`url(#${id}-left-leg)`}><GearImage gearId={gearId}/></g><Joint name="left-shin"><g clipPath={`url(#${id}-left-shin)`}><GearImage gearId={gearId}/></g></Joint></Joint>
      <Joint name="right-thigh" gear="bottom"><g clipPath={`url(#${id}-right-leg)`}><GearImage gearId={gearId}/></g><Joint name="right-shin"><g clipPath={`url(#${id}-right-shin)`}><GearImage gearId={gearId}/></g></Joint></Joint>
    </>;
  } else if (definition.slot === 'head') {
    attachment = <Joint name="torso"><Joint name="head" gear="head">{art}</Joint></Joint>;
  } else if (definition.slot === 'hand') {
    attachment = <Joint name="torso"><Joint name="right-upper-arm"><Joint name="right-forearm" gear="hand">{art}</Joint></Joint></Joint>;
  } else {
    attachment = <Joint name="torso" gear={definition.slot}>{art}</Joint>;
  }
  return <svg className={`character-equipped character-slot-${definition.slot} character-gear-${definition.id} rarity-${definition.rarity}`} viewBox={AVATAR_VIEWBOX} style={{ '--gear-aura': auraColors[definition.rarity], zIndex: definition.slot === 'back' ? 0 : AVATAR_SLOT_ORDER[definition.slot] + 2 } as CSSProperties} role="img" aria-label={definition.name} data-gear-id={definition.id} data-rarity={definition.rarity} data-avatar-fit="anatomical">{attachment}</svg>;
}

export default function CharacterAvatar({game,level,animated=true,compact=false,motion='idle'}:{game:GameState;level:number;animated?:boolean;compact?:boolean;motion?:CharacterMotion}){
  const id=useId();
  const equipped=appearanceGear(game);
  const gripping=equipped.some(({definition})=>definition.slot==='hand'&&(AVATAR_FITS[definition.id]?.grip||GEAR_ART[definition.id]?.grip));
  return <div className={`character-avatar ${animated?'is-animated':''} ${compact?'is-compact':''}`} data-motion={motion} aria-label={`Tu personaje, nivel ${level}${equipped.length?`, equipado con ${equipped.map(item=>item.definition.name).join(', ')}`:', equipamiento inicial'}`}>
    <div className="character-glow" aria-hidden="true"/><div className="character-orbit" aria-hidden="true"/>
    <div className="character-layers" data-avatar-viewbox={AVATAR_VIEWBOX}><span className="character-base" aria-hidden="true"/><CharacterBody/>{equipped.map(({slot,definition})=><WornGear key={slot} gearId={definition.id}/>)}<CharacterBody foreground/>{gripping&&<svg className="character-foreground" viewBox={AVATAR_VIEWBOX} aria-hidden="true"><defs><clipPath id={`${id}-grip`}><path d={RIGHT_HAND_SILHOUETTE}/></clipPath></defs><Joint name="torso"><Joint name="right-upper-arm"><Joint name="right-forearm"><image href="/assets/grind-avatar-base.png" width="1145" height="1374" clipPath={`url(#${id}-grip)`}/></Joint></Joint></Joint></svg>}</div>
    <div className="character-power-field" aria-hidden="true"><i/><i/><i/><i/></div>
    <div className="character-platform" aria-hidden="true"/><span className="character-level"><Sparkles size={11}/> NIVEL {level}</span>
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
