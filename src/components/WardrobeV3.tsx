'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, Check, Heart, LockKeyhole, PackageOpen, Shirt, Sparkles, Star, Zap } from 'lucide-react';
import { GEAR, type Gear, type GearSlot } from '@/lib/gear';
import { COMPANIONS, type Companion } from '@/lib/companions';
import { getAbilityDefinition } from '@/lib/abilities';
import { equipCompanion, equipCosmetic, equipItem, getAbilityCharges, getItemDefinition, RARITIES, setActiveAbility, unlockedCompanions, unlockedGear, type GameState, type InventoryItem, type ItemDefinition, type Rarity } from '@/lib/game';
import { playSound } from '@/lib/sound';
import { appearanceGear, CharacterParty, CompanionSprite, GearSprite, SLOT_LABELS } from './CharacterAvatar';
import './wardrobe-v3.css';

type Props={game:GameState;level:number;effectsEnabled:boolean;soundEnabled:boolean;onChange:(transform:(current:GameState)=>GameState)=>void;onNotice:(message:string)=>void;onOpenCrates:()=>void;onResumeOpening:()=>void};
type Panel='inventory'|'looks'|'abilities';
type LookSlot=GearSlot|'companion';
type Look={kind:'gear';slot:GearSlot;definition:Gear}|{kind:'companion';slot:'companion';definition:Companion};
const panels:{id:Panel;label:string;Icon:typeof Shirt}[]=[{id:'inventory',label:'Inventario',Icon:PackageOpen},{id:'looks',label:'Aspectos',Icon:Shirt},{id:'abilities',label:'Habilidades',Icon:Zap}];
const lookSlots:{id:LookSlot|'all';label:string}[]=[{id:'all',label:'Todos'},{id:'head',label:'Cabeza'},{id:'top',label:'Torso'},{id:'bottom',label:'Piernas'},{id:'hand',label:'Manos'},{id:'back',label:'Espalda'},{id:'companion',label:'Compañera'}];
const lookCatalog:Look[]=[...GEAR.map(definition=>({kind:'gear' as const,slot:definition.slot,definition})),...COMPANIONS.map(definition=>({kind:'companion' as const,slot:'companion' as const,definition}))];
const styleFor=(rarity:Rarity)=>({'--rarity':RARITIES[rarity].color} as CSSProperties);
const rarestFirst=(a:{rarity:Rarity},b:{rarity:Rarity})=>RARITIES[b.rarity].order-RARITIES[a.rarity].order;
const inventoryKindOrder:Record<ItemDefinition['kind'],number>={companion:0,gear:1,quote:2};
const rarityFilters=(Object.keys(RARITIES) as Rarity[]).sort((a,b)=>RARITIES[b].order-RARITIES[a].order);
const chargeLabel=(quantity:number)=>`${quantity} ${quantity===1?'carga':'cargas'}`;

export default function WardrobeV3({game,level,effectsEnabled,soundEnabled,onChange,onNotice,onOpenCrates,onResumeOpening}:Props){
  const [panel,setPanel]=useState<Panel>('inventory');
  const [filter,setFilter]=useState<Rarity|'all'>('all');
  const [kind,setKind]=useState<'all'|'gear'|'quote'|'companion'>('all');
  const [lookFilter,setLookFilter]=useState<LookSlot|'all'>('all');
  const [lookFocusRequest,setLookFocusRequest]=useState(0);
  const looksRef=useRef<HTMLElement>(null);
  const available=unlockedGear(game).sort(rarestFirst), companions=unlockedCompanions(game).sort(rarestFirst), equipped=appearanceGear(game);
  const companion=companions.find(item=>item.id===game.equippedCompanionId);
  const ownedLooks=new Set([...available.map(item=>`gear:${item.id}`),...companions.map(item=>`companion:${item.id}`)]);
  const matchesLookSlot=(look:Look)=>lookFilter==='all'||look.slot===lookFilter;
  const looks=lookCatalog.filter(look=>ownedLooks.has(`${look.kind}:${look.definition.id}`)&&matchesLookSlot(look)).sort((a,b)=>rarestFirst(a.definition,b.definition)||inventoryKindOrder[a.kind]-inventoryKindOrder[b.kind]);
  const lockedLooks=lookCatalog.filter(look=>!ownedLooks.has(`${look.kind}:${look.definition.id}`)&&matchesLookSlot(look)).sort((a,b)=>rarestFirst(a.definition,b.definition)||inventoryKindOrder[a.kind]-inventoryKindOrder[b.kind]);
  const openLooks=(slot:LookSlot)=>{setLookFilter(slot);setPanel('looks');setLookFocusRequest(value=>value+1)};
  useEffect(()=>{
    if(!lookFocusRequest)return;
    looksRef.current?.focus({preventScroll:true});
    looksRef.current?.scrollIntoView({block:'start',behavior:'instant'});
  },[lookFocusRequest]);
  const inventory=game.inventory.filter(item=>!item.sold&&item.id!==game.pendingOpening?.itemId);
  const stacks=new Map<string,{item:InventoryItem;definition:ItemDefinition;quantity:number}>();
  for(const item of inventory){
    const definition=getItemDefinition(item);if(!definition)continue;
    const key=`${definition.kind}:${definition.id}`,existing=stacks.get(key);
    if(existing)existing.quantity++;
    else stacks.set(key,{item,definition,quantity:1});
  }
  const filtered=Array.from(stacks.values()).filter(({item,definition})=>(filter==='all'||item.rarity===filter)&&(kind==='all'||definition.kind===kind)).sort((a,b)=>rarestFirst(a.item,b.item)||inventoryKindOrder[a.definition.kind]-inventoryKindOrder[b.definition.kind]);
  const active=getAbilityDefinition(game.activeAbilityId);
  const change=(transform:(current:GameState)=>GameState,message:string,sound='confirm')=>{onChange(transform);onNotice(message);if(soundEnabled)playSound(sound)};
  return <div className={`wardrobe-v3 ${effectsEnabled?'':'is-quiet'}`}>
    <div className="wardrobe-stage"><CharacterParty game={game} level={level} animated={effectsEnabled}/><div className="wardrobe-slots">{(Object.keys(SLOT_LABELS) as (keyof typeof SLOT_LABELS)[]).map(slot=>{
      const current=equipped.find(item=>item.slot===slot)?.definition;
      return <div className="wardrobe-slot" data-slot={slot} key={slot}><button className="wardrobe-slot-shortcut" aria-label={`Ver aspectos de ${SLOT_LABELS[slot]}`} onClick={()=>openLooks(slot)}>{current?<GearSprite gearId={current.id}/>:<Shirt size={27}/>}<span className="wardrobe-slot-copy"><small>{SLOT_LABELS[slot]}</small><strong>{current?.name??(slot==='top'?'Tirantes básicos':slot==='bottom'?'Bóxer inicial':'Sin equipar')}</strong></span><ArrowRight size={13}/></button>{current&&<button className="wardrobe-slot-remove" aria-label={`Quitar equipo de ${SLOT_LABELS[slot]}`} onClick={()=>change(value=>equipCosmetic(value,null,slot),'Aspecto guardado. Sigue desbloqueado para siempre.')}>Quitar pieza</button>}</div>;
    })}<div className="wardrobe-slot wardrobe-slot-companion" data-slot="companion">
      <button className="wardrobe-slot-shortcut" aria-label="Ver aspectos de Compañera" onClick={()=>openLooks('companion')}>{companion?<CompanionSprite companionId={companion.id} animated={effectsEnabled}/>:<Heart size={27}/>}<span className="wardrobe-slot-copy"><small>Compañera</small><strong>{companion?.name??'Sin equipar'}</strong></span><ArrowRight size={13}/></button>
      {companion&&<button className="wardrobe-slot-remove" aria-label="Quitar compañera del armario" onClick={()=>change(value=>equipCompanion(value,null),'Compañera guardada. Sigue disponible en tu inventario.')}>Quitar compañera</button>}
    </div></div></div>
    <div className="wardrobe-permanence"><Star size={18}/><p><strong>Tu colección se queda contigo.</strong> Los objetos no se pueden vender. Cada frase se consigue una sola vez. El equipo y las compañeras repetidas muestran su cantidad; el equipo suma cargas de habilidad. Agotarlas conserva el aspecto.</p></div>
    <nav className="collection-subtabs" aria-label="Organizar colección">{panels.map(({id,label,Icon})=><button key={id} aria-pressed={panel===id} onClick={()=>{setPanel(id);setFilter('all')}}><Icon size={15}/>{label}</button>)}</nav>
    {panel==='inventory'&&<>
      <div className="collection-counts"><span>{inventory.length} copias disponibles</span><span>{available.length+companions.length} aspectos desbloqueados</span><span>{companions.length} compañeras</span></div>
      <div className="collection-type-filters" aria-label="Tipo de recompensa">{[{id:'all',label:'Todo'},{id:'gear',label:'Equipo'},{id:'quote',label:'Frases'},{id:'companion',label:'Compañeras'}].map(value=><button key={value.id} aria-pressed={kind===value.id} onClick={()=>setKind(value.id as typeof kind)}>{value.label}</button>)}</div>
      <div className="collection-filters" aria-label="Filtrar objetos por rareza"><button aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>Todas las rarezas</button>{rarityFilters.map(rarity=><button key={rarity} style={styleFor(rarity)} aria-pressed={filter===rarity} onClick={()=>setFilter(rarity)}><i/>{RARITIES[rarity].label}</button>)}</div>
      {filtered.length?<div className="quote-collection">{filtered.map(({item,definition,quantity})=>{
        const selected=definition.kind==='gear'?equipped.some(value=>value.definition.id===item.gearId):definition.kind==='companion'?game.equippedCompanionId===item.companionId:game.equippedQuoteId===item.quoteId;
        const ability=item.gearId?getAbilityDefinition(item.gearId):undefined;
        return <article className={`quote-card loot-item-card ${selected?'equipped':''}`} data-item-id={item.id} data-item-kind={definition.kind} data-definition-id={definition.id} data-rarity={item.rarity} key={`${definition.kind}:${definition.id}`} style={styleFor(item.rarity)}>
          {definition.kind!=='quote'&&quantity>1&&<span className="inventory-quantity" aria-label={`${quantity} copias`}>{quantity}x</span>}
          <div className="quote-card-top"><span><i/>{RARITIES[item.rarity].label}</span>{selected?<span><Check size={12}/> EQUIPADO</span>:<Sparkles size={18}/>}</div>
          {item.gearId?<><div className="gear-card-preview"><GearSprite gearId={item.gearId}/></div><span className="gear-slot-tag">{definition.slot?SLOT_LABELS[definition.slot]:'EQUIPO'}</span><h3 className="gear-item-name">{definition.name}</h3><p className="gear-item-description">{definition.description}</p>{ability&&<p className="gear-item-description">{ability.description} +{chargeLabel(ability.chargesPerDrop)} por copia revelada.</p>}</>:item.companionId?<><div className="inventory-companion-art"><CompanionSprite companionId={item.companionId} animated={effectsEnabled}/></div><h3 className="gear-item-name">{definition.name}</h3><p className="gear-item-description">{definition.description}</p></>:<blockquote>“{definition.description}”</blockquote>}
          <small>CONSEGUIDO EL {new Intl.DateTimeFormat('es-ES',{day:'numeric',month:'short',timeZone:'Europe/Madrid'}).format(new Date(item.acquiredAt))}</small>
          <div className="quote-card-actions"><button className="quote-equip" aria-pressed={selected} onClick={()=>{
            if(item.gearId)change(value=>equipCosmetic(value,selected?null:item.gearId!,definition.slot),selected?'Pieza guardada en tus aspectos.':'Aspecto equipado. Sus cargas se activan en Habilidades.');
            else if(item.companionId)change(value=>equipCompanion(value,selected?null:item.companionId!),'Compañera actualizada. La verás junto a tu personaje.');
            else change(value=>equipItem(value,selected?null:item.id),selected?'Vuelves a la frase del día.':'Lema equipado.');
          }}>{item.gearId?selected?'Quitar pieza':'Equipar pieza':item.companionId?selected?'Quitar compañera':'Equipar compañera':selected?'Quitar lema':'Equipar lema'}<Star size={14}/></button></div>
        </article>;
      })}</div>:<div className="arcade-empty"><PackageOpen size={42}/><h3>{game.pendingOpening?'Tienes una sorpresa sin revelar.':inventory.length?'Ese tipo de drop todavía te espera.':'Aquí estarán tus próximas copias.'}</h3><p>{available.length||companions.length?'Tus aspectos siguen desbloqueados y puedes elegir tu compañera en el armario.':'Abre un cofre para empezar tu colección.'}</p><button className="arcade-primary" onClick={game.pendingOpening?onResumeOpening:onOpenCrates}>{game.pendingOpening?'Continuar apertura':'Explorar cofres'}<ArrowRight size={16}/></button></div>}
    </>}
    {panel==='looks'&&<section className="wardrobe-looks" aria-label="Aspectos del armario" ref={looksRef} tabIndex={-1}>
      <div className="arcade-section-head"><div><span className="eyebrow">TU ESTILO NO CADUCA</span><h2>{looks.length} aspectos para siempre.</h2></div><Shirt size={23}/></div>
      <nav className="cosmetic-slot-filters" aria-label="Filtrar aspectos por ranura">{lookSlots.map(({id,label})=><button key={id} aria-pressed={lookFilter===id} onClick={()=>setLookFilter(id)}>{label}</button>)}</nav>
      {looks.length?<div className="cosmetic-grid">{looks.map(look=>{
        const definition=look.definition;
        const selected=look.kind==='companion'?game.equippedCompanionId===definition.id:equipped.some(item=>item.definition.id===definition.id);
        return <article className={`cosmetic-card ${selected?'is-equipped':''}`} key={`${look.kind}:${definition.id}`} data-rarity={definition.rarity} data-slot={look.slot} data-item-kind={look.kind} data-gear-id={look.kind==='gear'?definition.id:undefined} data-companion-id={look.kind==='companion'?definition.id:undefined} style={styleFor(definition.rarity)}>
          <small>{RARITIES[definition.rarity].label} · {look.slot==='companion'?'Compañera':SLOT_LABELS[look.slot]}</small>
          {look.kind==='companion'?<div className="companion-preview cosmetic-companion-preview"><CompanionSprite companionId={definition.id} animated={effectsEnabled}/></div>:<div className="gear-card-preview"><GearSprite gearId={definition.id}/></div>}
          <h3>{definition.name}</h3><p>{definition.description}</p>
          <button className="wardrobe-action" aria-pressed={selected} onClick={()=>{
            if(look.kind==='companion')change(value=>equipCompanion(value,selected?null:definition.id),selected?'Compañera guardada. Su aspecto sigue desbloqueado.':'Compañera equipada. La verás junto a tu personaje.');
            else change(value=>equipCosmetic(value,selected?null:definition.id,look.slot),selected?'Aspecto guardado. Puedes volver a equiparlo cuando quieras.':'Aspecto equipado. La habilidad se elige por separado.');
          }}>{look.kind==='companion'?(selected?'Quitar compañera':'Equipar compañera'):(selected?'Quitar aspecto':'Usar aspecto')}<Check size={15}/></button>
          <p className="wardrobe-lock-note">Desbloqueo permanente · {look.kind==='companion'?'A tu lado en Resumen':`${chargeLabel(getAbilityCharges(game,definition.id))} de habilidad`}</p>
        </article>;
      })}</div>:<EmptyPanel onOpen={onOpenCrates} text={lookFilter==='all'?'Cada pieza o compañera revelada añade un aspecto permanente a tu armario.':`Abre un cofre para desbloquear tu primer aspecto de ${lookSlots.find(slot=>slot.id===lookFilter)?.label.toLocaleLowerCase('es-ES')}.`}/>}
      {lockedLooks.length>0&&<section className="cosmetic-locked-section" aria-label="Aspectos sin desbloquear"><div className="cosmetic-locked-heading"><LockKeyhole size={20}/><div><h3>{lockedLooks.length} aspectos sin desbloquear.</h3><p>Tu próxima versión puede estar en el siguiente cofre.</p></div></div><div className="cosmetic-grid">{lockedLooks.map(look=><article className="cosmetic-locked-card" key={`${look.kind}:${look.definition.id}`} data-slot={look.slot} data-rarity={look.definition.rarity} data-item-kind={look.kind} data-gear-id={look.kind==='gear'?look.definition.id:undefined} data-companion-id={look.kind==='companion'?look.definition.id:undefined}>
        <span className="cosmetic-locked-badge"><LockKeyhole size={12}/>Sin desbloquear</span><small>{RARITIES[look.definition.rarity].label} · {look.slot==='companion'?'Compañera':SLOT_LABELS[look.slot]}</small>
        <div className={`cosmetic-locked-art ${look.kind==='companion'?'is-companion':''}`}>{look.kind==='companion'?<CompanionSprite companionId={look.definition.id} animated={false}/>:<GearSprite gearId={look.definition.id}/>}</div>
        <h4>{look.definition.name}</h4><p>{look.definition.description}</p>
      </article>)}</div></section>}
    </section>}
    {panel==='abilities'&&<>
      <section className="ability-explanation"><h3><Zap size={21}/> Una habilidad. Tu siguiente sesión.</h3><p>Elige una antes de empezar un entrenamiento nuevo. Se queda asignada a esa sesión aunque cambies después de aspecto. Solo gasta una carga al finalizar si ha dado un bonus; editar o recargar no consume otra. Los duplicados suman cargas.</p></section>
      <div className="ability-current"><Zap size={22}/><div><strong>{active?`Próxima habilidad: ${active.name}`:'Sin habilidad para la próxima sesión'}</strong><p>{active?`${active.description} · ${chargeLabel(getAbilityCharges(game,active.id))} para próximas sesiones.`:'Tu personaje puede llevar cualquier aspecto sin activar una habilidad.'}</p></div>{active&&<button onClick={()=>change(value=>setActiveAbility(value,null),'Habilidad desactivada para próximas sesiones.')}>Desactivar habilidad</button>}</div>
      {available.length?<div className="ability-grid">{available.map(gear=>{const ability=getAbilityDefinition(gear.id);if(!ability)return null;const charges=getAbilityCharges(game,gear.id),selected=game.activeAbilityId===gear.id;return <article key={gear.id} data-ability-id={gear.id} data-rarity={gear.rarity} className={`ability-card ${selected?'is-active':''} ${charges?'':'is-empty'}`} style={styleFor(gear.rarity)}><small>{RARITIES[gear.rarity].label} · {selected?'PREPARADA':'HABILIDAD'}</small><GearSprite gearId={gear.id}/><h3>{gear.name}</h3><p>{ability.description}</p><div className="ability-charge-row"><strong>{charges}</strong><span>{charges===1?'CARGA DISPONIBLE':'CARGAS DISPONIBLES'}</span></div><button className="wardrobe-action" aria-pressed={selected} disabled={!selected&&!charges} onClick={()=>change(value=>setActiveAbility(value,selected?null:gear.id),selected?'Habilidad desactivada.':'Habilidad preparada para el próximo entrenamiento nuevo.')}>{selected?'Desactivar':charges?'Activar habilidad':'Sin cargas'}<Zap size={15}/></button><p className="ability-drop-note">Cada duplicado revelado añade {chargeLabel(ability.chargesPerDrop)}. El aspecto permanece al agotarlas.</p></article>})}</div>:<EmptyPanel onOpen={onOpenCrates} text="Consigue una pieza para desbloquear su aspecto y su primera carga."/>}
    </>}
  </div>;
}

function EmptyPanel({text,onOpen}:{text:string;onOpen:()=>void}){return <div className="arcade-empty"><Sparkles size={39}/><h3>Tu siguiente drop te espera.</h3><p>{text}</p><button className="arcade-primary" onClick={onOpen}>Explorar cofres<ArrowRight size={16}/></button></div>}
