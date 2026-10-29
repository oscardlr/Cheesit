'use client';

import { useState } from 'react';
import CharacterAvatar, { CharacterParty, GearSprite, SLOT_LABELS } from './CharacterAvatar';
import { COMPANIONS } from '@/lib/companions';
import { GEAR, type GearSlot } from '@/lib/gear';
import { CHARACTER_MOTIONS, type CharacterMotion } from '@/lib/character-motion';
import { CHARACTER_COMBINATION_COUNT, PARTY_COMBINATION_COUNT, COLLECTION_INSPECTION_PRESETS, INSPECTION_SLOT_ITEMS, INSPECTION_SLOTS, OVERLAP_INSPECTION_PRESETS, inspectionCombination, inspectionGame, type InspectionPreset } from '@/lib/character-inspection';
import './character-inspection.css';

function PresetFigure({ preset }: { preset: InspectionPreset }) {
  return <figure className="inspection-figure" data-risk-id={preset.id}>
    <CharacterAvatar game={inspectionGame(preset.gearIds)} level={1} animated={false}/>
    <figcaption>{preset.label}</figcaption>
  </figure>;
}

export default function CharacterInspection() {
  const [equipped, setEquipped] = useState<Partial<Record<GearSlot, string>>>({});
  const [companion, setCompanion] = useState('');
  const [motion, setMotion] = useState<CharacterMotion>('idle');
  const [paused, setPaused] = useState(false);
  const [effects, setEffects] = useState(true);
  const [index, setIndex] = useState(0);
  const [showOverlaps, setShowOverlaps] = useState(false);
  const game = inspectionGame(Object.values(equipped), companion || null);
  const loadCombination = (nextIndex: number) => {
    const bounded = Math.max(0, Math.min(CHARACTER_COMBINATION_COUNT - 1, nextIndex));
    setIndex(bounded);
    setEquipped(Object.fromEntries(inspectionCombination(bounded).map(id => [GEAR.find(item => item.id === id)!.slot, id])));
  };

  return <main className="character-inspection">
    <header><a href="/#view=summary">← Volver a Resumen</a><span className="eyebrow">CHEESIT · HERRAMIENTA LOCAL</span><h1>Inspección del personaje</h1><p>Catálogo actual: {GEAR.length} cosméticos, {CHARACTER_COMBINATION_COUNT.toLocaleString('es-ES')} combinaciones de equipo y {PARTY_COMBINATION_COUNT.toLocaleString('es-ES')} con compañera o sin ella.</p><p>Inventario de prueba en memoria. Esta vista no modifica tus datos guardados.</p></header>
    <section className="inspection-workbench" aria-labelledby="inspection-controls-title">
      <div className="inspection-live" data-combination-index={index}><CharacterParty game={game} level={1} motion={motion} animated={effects && !paused}/></div>
      <div className="inspection-controls"><h2 id="inspection-controls-title">Combinar y animar</h2>
        <div className="inspection-selects">{INSPECTION_SLOTS.map(slot => <label key={slot}>{SLOT_LABELS[slot]}<select value={equipped[slot] || ''} onChange={event => setEquipped(previous => ({ ...previous, [slot]: event.target.value }))}><option value="">Sin equipar</option>{INSPECTION_SLOT_ITEMS[slot].map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>)}<label>Compañera<select value={companion} onChange={event => setCompanion(event.target.value)}><option value="">Sin compañera</option>{COMPANIONS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
        <nav className="inspection-motions" aria-label="Animaciones de inspección">{CHARACTER_MOTIONS.map(item => <button key={item.id} aria-pressed={motion === item.id} onClick={() => setMotion(item.id)}>{item.label}</button>)}</nav>
        <div className="inspection-actions"><button disabled={!effects} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? 'Reanudar animación' : 'Pausar animación'}</button><label><input type="checkbox" checked={effects} onChange={event => setEffects(event.target.checked)}/>Efectos activados</label><button onClick={() => { setEquipped({}); setCompanion(''); setIndex(0); }}>Quitar todo</button></div>
        <p className="inspection-motion-note" role="status"><span className="motion-feedback-active">{!effects ? 'Pose estática: los efectos están desactivados.' : paused ? 'Animación en pausa.' : CHARACTER_MOTIONS.find(item => item.id === motion)?.description}</span><span className="motion-feedback-reduced">Pose estática: tu dispositivo tiene activado el movimiento reducido.</span></p>
        <form className="inspection-enumeration" onSubmit={event => { event.preventDefault(); loadCombination(index); }}><label>Índice de combinación (0–{CHARACTER_COMBINATION_COUNT - 1})<input type="number" min={0} max={CHARACTER_COMBINATION_COUNT - 1} step={1} value={index} onChange={event => setIndex(Number(event.target.value))}/></label><button type="submit">Cargar combinación</button><button type="button" disabled={index <= 0} onClick={() => loadCombination(index - 1)}>Anterior</button><button type="button" disabled={index >= CHARACTER_COMBINATION_COUNT - 1} onClick={() => loadCombination(index + 1)}>Siguiente</button></form>
      </div>
    </section>
    <section aria-labelledby="inspection-catalog-title"><h2 id="inspection-catalog-title">Las {GEAR.length} prendas, una a una</h2><p>La miniatura y la capa equipada usan la misma definición de recurso.</p><div className="inspection-catalog">{GEAR.map(item => <figure className="inspection-item" key={item.id} data-inspection-gear={item.id}><div className="inspection-item-art"><CharacterAvatar game={inspectionGame([item.id])} level={1} animated={false}/><GearSprite gearId={item.id}/></div><figcaption><h3>{item.name}</h3><span>{SLOT_LABELS[item.slot]} · {item.id}</span></figcaption></figure>)}</div></section>
    <section aria-labelledby="inspection-collections-title"><h2 id="inspection-collections-title">Colecciones completas</h2><div className="inspection-risk-grid">{COLLECTION_INSPECTION_PRESETS.map(preset => <PresetFigure key={preset.id} preset={preset}/>)}</div></section>
    <section aria-labelledby="inspection-overlap-title"><h2 id="inspection-overlap-title">Cruces con riesgo de solapamiento</h2><p>Cada armadura con las capas y alas clásicas, y cada objeto de mano: {OVERLAP_INSPECTION_PRESETS.length} cruces.</p><button aria-expanded={showOverlaps} aria-controls="inspection-overlaps" onClick={() => setShowOverlaps(value => !value)}>{showOverlaps ? 'Ocultar cruces' : 'Mostrar todos los cruces'}</button>{showOverlaps && <div id="inspection-overlaps" className="inspection-risk-grid">{OVERLAP_INSPECTION_PRESETS.map(preset => <PresetFigure key={preset.id} preset={preset}/>)}</div>}</section>
  </main>;
}
