'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, Check, LockKeyhole, Shirt, Sparkles, Zap } from 'lucide-react';
import { GEAR, type Gear, type GearSlot } from '@/lib/gear';
import { COMPANIONS, type Companion } from '@/lib/companions';
import { getAbilityDefinition } from '@/lib/abilities';
import { equipCompanion, equipCosmetic, getAbilityCharges, RARITIES, setActiveAbility, unlockedCompanions, unlockedGear, type GameState, type Rarity } from '@/lib/game';
import { playSound } from '@/lib/sound';
import { appearanceGear, CharacterParty, CompanionSprite, GearSprite, SLOT_LABELS } from './CharacterAvatar';
import CheesitPassive from './CheesitPassive';
import EmptySlotIcon from './EmptySlotIcon';
import InfoPopup from './InfoPopup';
import AbilityDetails from './AbilityDetails';
import './wardrobe-v3.css';
import './wardrobe-motion.css';

type Props={initialPanel?:Panel;onPanelChange?:(panel:Panel)=>void;game:GameState;level:number;effectsEnabled:boolean;soundEnabled:boolean;onChange:(transform:(current:GameState)=>GameState)=>Promise<void>;onNotice:(message:string)=>void;onOpenCrates:()=>void};
type Panel='looks'|'abilities';
type LookSlot=GearSlot|'companion';
type Look={kind:'gear';slot:GearSlot;definition:Gear}|{kind:'companion';slot:'companion';definition:Companion};
const panels:{id:Panel;label:string;Icon:typeof Shirt}[]=[{id:'looks',label:'Aspectos',Icon:Shirt},{id:'abilities',label:'Habilidades',Icon:Zap}];
const lookSlots:{id:LookSlot|'all';label:string}[]=[{id:'all',label:'Todos'},{id:'head',label:'Cabeza'},{id:'top',label:'Torso'},{id:'bottom',label:'Piernas'},{id:'hand',label:'Manos'},{id:'back',label:'Espalda'},{id:'companion',label:'Cheesit'}];
const lookCatalog:Look[]=[...GEAR.map(definition=>({kind:'gear' as const,slot:definition.slot,definition})),...COMPANIONS.map(definition=>({kind:'companion' as const,slot:'companion' as const,definition}))];
const styleFor=(rarity:Rarity)=>({'--rarity':RARITIES[rarity].color} as CSSProperties);
const rarestFirst=(a:{rarity:Rarity},b:{rarity:Rarity})=>RARITIES[b.rarity].order-RARITIES[a.rarity].order;
const lookKindOrder={companion:0,gear:1};
const chargeLabel=(quantity:number)=>`${quantity} ${quantity===1?'carga':'cargas'}`;
const gearCollections=Array.from(new Set(GEAR.flatMap(gear=>gear.collection?[gear.collection]:[])));

export default function WardrobeV3({initialPanel='looks',onPanelChange,game,level,effectsEnabled,soundEnabled,onChange,onNotice,onOpenCrates}:Props){
  const [panel,setPanelState]=useState<Panel>(initialPanel);
  const setPanel=(next:Panel)=>{setPanelState(next);onPanelChange?.(next)};
  useEffect(()=>setPanelState(initialPanel),[initialPanel]);
  const saveLock=useRef(false);
  const [saving,setSaving]=useState(false);
  const [lookFilter,setLookFilter]=useState<LookSlot|'all'>('all');
  const [collectionFilter,setCollectionFilter]=useState('all');
  const [lookFocusRequest,setLookFocusRequest]=useState(0);
  const looksRef=useRef<HTMLElement>(null);
  const available=unlockedGear(game).sort(rarestFirst), companions=unlockedCompanions(game).sort(rarestFirst), equipped=appearanceGear(game);
  const companion=companions.find(item=>item.id===game.equippedCompanionId);
  const ownedLooks=new Set([...available.map(item=>`gear:${item.id}`),...companions.map(item=>`companion:${item.id}`)]);
  const matchesLookSlot=(look:Look)=>(lookFilter==='all'||look.slot===lookFilter)&&(collectionFilter==='all'||(look.kind==='gear'&&look.definition.collection===collectionFilter));
  const looks=lookCatalog.filter(look=>ownedLooks.has(`${look.kind}:${look.definition.id}`)&&matchesLookSlot(look)).sort((a,b)=>rarestFirst(a.definition,b.definition)||lookKindOrder[a.kind]-lookKindOrder[b.kind]);
  const lockedLooks=lookCatalog.filter(look=>!ownedLooks.has(`${look.kind}:${look.definition.id}`)&&matchesLookSlot(look)).sort((a,b)=>rarestFirst(a.definition,b.definition)||lookKindOrder[a.kind]-lookKindOrder[b.kind]);
  const openLooks=(slot:LookSlot)=>{setLookFilter(slot);setCollectionFilter('all');setPanel('looks');setLookFocusRequest(value=>value+1)};
  useEffect(()=>{
    if(!lookFocusRequest)return;
    looksRef.current?.focus({preventScroll:true});
    looksRef.current?.scrollIntoView({block:'start',behavior:'instant'});
  },[lookFocusRequest]);
  const copies=new Map<string,number>();
  for(const item of game.inventory){
    if(item.sold||item.id===game.pendingOpening?.itemId)continue;
    const key=item.gearId?`gear:${item.gearId}`:item.companionId?`companion:${item.companionId}`:null;
    if(key)copies.set(key,(copies.get(key)??0)+1);
  }
  const active=getAbilityDefinition(game.activeAbilityId);
  const change=async(transform:(current:GameState)=>GameState,message:string,sound='confirm')=>{if(saveLock.current)return;saveLock.current=true;setSaving(true);try{await onChange(transform);onNotice(message);if(soundEnabled)playSound(sound)}catch{onNotice('No se ha confirmado el guardado. Reintenta desde el aviso de la app.');if(soundEnabled)playSound('error')}finally{saveLock.current=false;setSaving(false)}};
  return <div className={`wardrobe-v3 ${effectsEnabled?'':'is-quiet'}`} aria-busy={saving}>
    <nav className="collection-subtabs" aria-label="Organizar colección">{panels.map(({id,label,Icon})=><button key={id} aria-pressed={panel===id} onClick={()=>setPanel(id)}><Icon size={15}/>{label}</button>)}</nav>
    {panel==='looks'&&<>    <div className="wardrobe-stage"><div className="wardrobe-character-preview"><CharacterParty game={game} level={level}/></div><div className="wardrobe-slots">{(Object.keys(SLOT_LABELS) as (keyof typeof SLOT_LABELS)[]).map(slot=>{
      const current=equipped.find(item=>item.slot===slot)?.definition;
      return <div className="wardrobe-slot" data-slot={slot} data-rarity={current?.rarity} style={current?styleFor(current.rarity):undefined} key={slot}><button className="wardrobe-slot-shortcut" aria-label={`Ver aspectos de ${SLOT_LABELS[slot]}`} onClick={()=>openLooks(slot)}>{current?<GearSprite gearId={current.id}/>:<EmptySlotIcon slot={slot}/>}<span className="wardrobe-slot-copy"><small>{SLOT_LABELS[slot]}</small><strong>{current?.name??(slot==='top'?'Tirantes básicos':slot==='bottom'?'Bóxer inicial':'Sin equipar')}</strong></span><ArrowRight size={13}/></button></div>;
    })}<div className="wardrobe-slot" data-slot="companion" data-rarity={companion?.rarity} style={companion?styleFor(companion.rarity):undefined}>
      <button className="wardrobe-slot-shortcut" aria-label="Ver aspectos de Cheesit" onClick={()=>openLooks('companion')}>{companion?<CompanionSprite companionId={companion.id} animated={effectsEnabled}/>:<EmptySlotIcon slot="companion"/>}<span className="wardrobe-slot-copy"><small>Cheesit</small><strong>{companion?.name??'Sin equipar'}</strong></span><ArrowRight size={13}/></button>
    </div></div></div>
    </>}
    {panel==='looks'&&<section className="wardrobe-looks" aria-label="Aspectos del armario" ref={looksRef} tabIndex={-1}>
      <div className="arcade-section-head"><div><span className="eyebrow">ASPECTOS DESBLOQUEADOS</span><h2>{looks.length} aspectos disponibles</h2></div><Shirt size={23}/></div>
      <nav className="cosmetic-slot-filters" aria-label="Filtrar aspectos por ranura">{lookSlots.map(({id,label})=><button key={id} aria-pressed={lookFilter===id} onClick={()=>setLookFilter(id)}>{label}</button>)}</nav>
      <nav className="cosmetic-collection-filters" aria-label="Filtrar aspectos por colección"><span>COLECCIONES</span><button type="button" aria-pressed={collectionFilter==='all'} onClick={()=>setCollectionFilter('all')}>Todas</button>{gearCollections.map(collection=><button type="button" key={collection} aria-pressed={collectionFilter===collection} onClick={()=>setCollectionFilter(collection)}><Sparkles size={12}/>{collection}</button>)}</nav>
      {looks.length?<div className="cosmetic-grid">{looks.map(look=>{
        const definition=look.definition;
        const quantity=copies.get(`${look.kind}:${definition.id}`)??0;
        const selected=look.kind==='companion'?game.equippedCompanionId===definition.id:equipped.some(item=>item.definition.id===definition.id);
        return <article className={`cosmetic-card ${selected?'is-equipped':''}`} key={`${look.kind}:${definition.id}`} data-rarity={definition.rarity} data-slot={look.slot} data-item-kind={look.kind} data-gear-id={look.kind==='gear'?definition.id:undefined} data-companion-id={look.kind==='companion'?definition.id:undefined} style={styleFor(definition.rarity)}>
          {quantity>1&&<span className="inventory-quantity" aria-label={`${quantity} copias`}>{quantity}x</span>}
          <small>{RARITIES[definition.rarity].label} · {look.slot==='companion'?'Cheesit':SLOT_LABELS[look.slot]}</small>
          {look.kind==='companion'?<div className="companion-preview cosmetic-companion-preview"><CompanionSprite companionId={definition.id} animated={effectsEnabled}/></div>:<div className="gear-card-preview"><GearSprite gearId={definition.id}/></div>}
          <div className="collection-item-heading"><h3>{definition.name}</h3><InfoPopup title={definition.name}><p>{definition.description}</p></InfoPopup></div>{look.kind==='companion'&&<CheesitPassive companionId={definition.id} status={selected?'equipped':'available'}/>} {look.kind==='gear'&&<GearAbility gearId={definition.id} charges={getAbilityCharges(game,definition.id)}/>}
          <button className="wardrobe-action" aria-pressed={selected} onClick={()=>{
            if(look.kind==='companion')change(value=>equipCompanion(value,selected?null:definition.id),selected?'Cheesit guardado. Su aspecto sigue desbloqueado.':'Cheesit equipado. Su pasiva se fija al empezar una nueva sesión.');
            else change(value=>equipCosmetic(value,selected?null:definition.id,look.slot),selected?'Aspecto guardado. Puedes volver a equiparlo cuando quieras.':'Aspecto equipado. La habilidad se elige por separado.');
          }}>{look.kind==='companion'?(selected?'Quitar cheesit':'Equipar cheesit'):(selected?'Quitar aspecto':'Usar aspecto')}<Check size={15}/></button>
          {look.kind==='gear'&&<button className="wardrobe-action" aria-pressed={game.activeAbilityId===definition.id} disabled={!getAbilityCharges(game,definition.id)} onClick={()=>change(value=>setActiveAbility(value,definition.id),'Habilidad preparada para el próximo entrenamiento nuevo.')}>{game.activeAbilityId===definition.id?'Habilidad preparada':'Preparar habilidad'}<Zap size={15}/></button>}
        </article>;
      })}</div>:<EmptyPanel onOpen={onOpenCrates} text={collectionFilter!=='all'?`Descubre las piezas de ${collectionFilter} en los cofres. Cada una incluye su propio aspecto y habilidad.`:lookFilter==='all'?'Cada pieza o cheesit revelada añade un aspecto permanente a tu armario.':`Abre un cofre para desbloquear tu primer aspecto de ${lookSlots.find(slot=>slot.id===lookFilter)?.label.toLocaleLowerCase('es-ES')}.`}/>}
      {lockedLooks.length>0&&<section className="cosmetic-locked-section" aria-label="Aspectos sin desbloquear"><div className="cosmetic-locked-heading"><LockKeyhole size={20}/><div><h3>{lockedLooks.length} aspectos sin desbloquear.</h3><p>Estos aspectos se desbloquean al obtenerlos en un cofre.</p></div></div><div className="cosmetic-grid">{lockedLooks.map(look=><article className="cosmetic-locked-card" key={`${look.kind}:${look.definition.id}`} data-slot={look.slot} data-rarity={look.definition.rarity} data-item-kind={look.kind} data-gear-id={look.kind==='gear'?look.definition.id:undefined} data-companion-id={look.kind==='companion'?look.definition.id:undefined}>
        <span className="cosmetic-locked-badge"><LockKeyhole size={12}/>{look.kind==='companion'?'Pendiente de conseguir':'Sin desbloquear'}</span><small>{RARITIES[look.definition.rarity].label} · {look.slot==='companion'?'Cheesit':SLOT_LABELS[look.slot]}</small>
        <div className={`cosmetic-locked-art ${look.kind==='companion'?'is-companion':''}`}>{look.kind==='companion'?<CompanionSprite companionId={look.definition.id} animated={false}/>:<GearSprite gearId={look.definition.id}/>}</div>
        <div className="collection-item-heading"><h4>{look.definition.name}</h4><InfoPopup title={look.definition.name}><p>{look.definition.description}</p></InfoPopup></div>{look.kind==='gear'&&<GearAbility gearId={look.definition.id}/>}
      </article>)}</div></section>}
    </section>}
    {panel==='abilities'&&<>
      <section className="ability-explanation"><AbilityDetails title="Habilidad para la próxima sesión" icon={<Zap size={18} aria-hidden="true"/>}><p>Elige una antes de empezar un entrenamiento nuevo. Se queda asignada a esa sesión aunque cambies después de aspecto. Solo gasta una carga al finalizar si ha dado un bonus; editar o recargar no consume otra. Los duplicados suman cargas.</p></AbilityDetails></section>
      <div className="ability-current"><div>{active?<AbilityDetails key={active.id} title={`Próxima habilidad: ${active.name}`} icon={<Zap size={18} aria-hidden="true"/>}><p>{active.description}</p><p>{chargeLabel(getAbilityCharges(game,active.id))} para próximas sesiones.</p></AbilityDetails>:<AbilityDetails title="Sin habilidad para la próxima sesión" icon={<Zap size={18} aria-hidden="true"/>}><p>Tu personaje puede llevar cualquier aspecto sin activar una habilidad.</p></AbilityDetails>}</div>{active&&<button onClick={()=>change(value=>setActiveAbility(value,null),'Habilidad desactivada para próximas sesiones.')}>Desactivar habilidad</button>}</div>
      {available.length?<div className="ability-grid">{available.map(gear=>{const ability=getAbilityDefinition(gear.id);if(!ability)return null;const charges=getAbilityCharges(game,gear.id),selected=game.activeAbilityId===gear.id;return <article key={gear.id} data-ability-id={gear.id} data-rarity={gear.rarity} className={`ability-card ${selected?'is-active':''} ${charges?'':'is-empty'}`} style={styleFor(gear.rarity)}><small>{RARITIES[gear.rarity].label} · {selected?'PREPARADA':'HABILIDAD'}</small><GearSprite gearId={gear.id}/><GearAbility gearId={gear.id} charges={charges}/><button className="wardrobe-action" aria-pressed={selected} disabled={!selected&&!charges} onClick={()=>change(value=>setActiveAbility(value,selected?null:gear.id),selected?'Habilidad desactivada.':'Habilidad preparada para el próximo entrenamiento nuevo.')}>{selected?'Desactivar':charges?'Preparar habilidad':'Sin cargas'}<Zap size={15}/></button></article>})}</div>:<EmptyPanel onOpen={onOpenCrates} text="Consigue una pieza para desbloquear su aspecto y su primera carga."/>}
    </>}
  </div>;
}

function EmptyPanel({text,onOpen}:{text:string;onOpen:()=>void}){return <div className="arcade-empty"><Sparkles size={39}/><h3>Sin elementos disponibles</h3><p>{text}</p><button className="arcade-primary" onClick={onOpen}>Explorar cofres<ArrowRight size={16}/></button></div>}

function GearAbility({gearId,charges}:{gearId:string;charges?:number}){
  const ability=getAbilityDefinition(gearId);
  if(!ability)return null;
  return <AbilityDetails className="cosmetic-ability" title={ability.name} icon={<Zap size={13} aria-hidden="true"/>}>
    <p>{ability.description}</p>
    {charges!==undefined&&<div className="ability-charge-row"><strong>{charges}</strong><span>{charges===1?'CARGA DISPONIBLE':'CARGAS DISPONIBLES'}</span></div>}
    <p>Cada copia revelada añade {chargeLabel(ability.chargesPerDrop)}. Solo se consume una al finalizar una sesión con bonus. Cambiar de aspecto no gasta cargas; el aspecto permanece al agotarlas.</p>
  </AbilityDetails>;
}
