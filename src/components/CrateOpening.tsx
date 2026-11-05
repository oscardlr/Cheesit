'use client';

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Box, Check, Sparkles, Star, X } from 'lucide-react';
import { completeOpening, revealReservedOpening, getItemDefinition, CRATES, MASTER_CRATE_ID, levelCrate, RARITIES, REVEAL_DURATION_MS, setOpeningStage, SPIN_DURATION_MS, type GameState, type InventoryItem, type Rarity } from '@/lib/game';
import { quoteConversionAmount } from '@/lib/quote-conversion';
import { getAbilityDefinition } from '@/lib/abilities';
import { playCrateTick, playSound } from '@/lib/sound';
import { GearSprite, CompanionSprite } from './CharacterAvatar';
import CheesitPassive from './CheesitPassive';
import CreditCoin from './CreditCoin';
import CrateArtwork from './CrateArtwork';
import './crate-opening.css';

type Props = {
  game: GameState;
  result: InventoryItem | null;
  effectsEnabled: boolean;
  soundEnabled: boolean;
  onGameChange: (transform: (current: GameState) => GameState) => Promise<void>;
  onFinished: (item: InventoryItem) => void;
  onClose: () => void;
  onEquip: (item: InventoryItem) => void;
};

const TARGET = 192;
const sequence: Rarity[] = ['common', 'rare', 'common', 'epic', 'common', 'rare', 'legendary', 'common', 'rare', 'common', 'epic', 'common'];

export default function CrateOpening({ game, result, effectsEnabled, soundEnabled, onGameChange, onFinished, onClose, onEquip }: Props) {
  const pending = game.pendingOpening;
  const reserved = pending ? game.inventory.find(candidate => candidate.id === pending.itemId) : result;
  const lastItem = useRef(reserved);
  if (reserved) lastItem.current = reserved;
  const item = reserved ?? lastItem.current;
  const [motionKnown, setMotionKnown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [reduced, setReduced] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const blur = useRef<SVGFEGaussianBlurElement>(null);
  const blurId = useId();
  const openingCrate = useRef<HTMLDivElement>(null);
  const actions = useRef({ onGameChange, onFinished, onClose });
  const sound = useRef(soundEnabled);
  const previousSoundIndex = useRef(-1);
  const transitioned = useRef('');
  actions.current = { onGameChange, onFinished, onClose };
  sound.current = soundEnabled;
  const stage = pending?.stage ?? 'result';
  const animated = effectsEnabled && motionKnown && !reduced;
  const savingRef = useRef(false);
  const startedAt = pending?.startedAt;
  const revealStartedAt = pending?.revealStartedAt;
  const itemId = item?.id;
  // UUID randomness gives each opening a stable landing point across reloads.
  const landingOffset = ((Number.parseInt(itemId?.slice(-8) ?? '80000000', 16) / 0xffffffff) * 2 - 1) * .44;
  const cards = useMemo(() => {
    const offset = itemId ? itemId.charCodeAt(0) % sequence.length : 0;
    const source = item?.crateId.startsWith('level:') ? levelCrate(Number(item.crateId.split(':').at(-1)), item.crateId.split(':').length === 3 ? item.crateId.split(':')[1] : undefined) : CRATES.find(crate => crate.id === item?.crateId);
    const allowed = sequence.filter(rarity => !source || source.odds[rarity] > 0);
    return Array.from({ length: TARGET + 8 }, (_, index) => index === TARGET && item ? item.rarity : allowed[(index + offset) % allowed.length]);
  }, [itemId, item?.rarity, item?.crateId]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { setReduced(query.matches); setMotionKnown(true); };
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); actions.current.onClose(); }
      if (event.key !== 'Tab') return;
      const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      const first = buttons?.[0], last = buttons?.[buttons.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', onKey); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  async function finishQuickly() {
    if (!item || savingRef.current) return;
    savingRef.current = true; setSaving(true); setSaveError('');
    try {
      await actions.current.onGameChange(revealReservedOpening);
      actions.current.onFinished(item);
      if (sound.current) playSound('rare');
    } catch {
      setSaveError('No se ha confirmado el guardado. Tu premio conserva el mismo identificador; reintenta sin volver a pagar.');
    } finally { savingRef.current = false; setSaving(false); }
  }
  useEffect(() => {
    if (!pending || !item || !motionKnown || savingRef.current || saveError) return;
    if (!animated) { void finishQuickly(); return; }
    const key = `${item.id}:${stage}`;
    const advance = async () => {
      if (transitioned.current === key || savingRef.current) return;
      const spinDone = (stage === 'spinning' || stage === 'rarity') && Date.now() - Date.parse(pending.startedAt) >= SPIN_DURATION_MS;
      const revealDone = stage === 'revealing' && revealStartedAt && Date.now() - Date.parse(revealStartedAt) >= REVEAL_DURATION_MS;
      if (!spinDone && !revealDone) return;
      transitioned.current = key; savingRef.current = true; setSaving(true);
      try {
        await actions.current.onGameChange(spinDone ? current => setOpeningStage(current, 'revealing') : completeOpening);
        if (revealDone) actions.current.onFinished(item);
        if (sound.current) playSound(spinDone ? 'crate-land' : 'rare');
      } catch { setSaveError('No se ha confirmado el guardado. Reintenta para conservar este mismo premio.'); }
      finally { savingRef.current = false; setSaving(false); }
    };
    void advance();
    const timer = window.setInterval(() => void advance(), 25);
    return () => window.clearInterval(timer);
  }, [stage, item, pending, revealStartedAt, motionKnown, animated, saveError, saving]);
  useEffect(() => {
    const node = track.current;
    const first = node?.firstElementChild;
    if (!animated || !node || !(first instanceof HTMLElement)) return;
    let spacing = 0;
    let cardWidth = 0;
    let frame = 0;
    const measure = () => {
      cardWidth = first.offsetWidth;
      spacing = cardWidth + (Number.parseFloat(getComputedStyle(node).columnGap) || 12);
    };
    const draw = () => {
      const progress = stage === 'spinning' && startedAt ? Math.min(1, Math.max(0, Date.now() - Date.parse(startedAt)) / SPIN_DURATION_MS) : 1;
      const eased = 1 - (1 - progress) ** 3;
      const destination = TARGET + landingOffset * cardWidth / spacing;
      const index = destination * eased;
      node.style.transform = `translate3d(${-index * spacing}px,0,0)`;
      // Filter the clipped viewport, keeping the marker sharp and the long reel cheap.
      blur.current?.setAttribute('stdDeviation', `${(12 * (1 - progress) ** 2).toFixed(2)} 0`);
      const soundIndex = Math.floor(index + cardWidth / (spacing * 2));
      if (stage === 'spinning' && soundIndex !== previousSoundIndex.current) {
        previousSoundIndex.current = soundIndex;
        if (sound.current && progress < 1) playCrateTick(.65 + (1 - progress) * .35);
      }
      if (stage === 'spinning' && progress < 1) frame = window.requestAnimationFrame(draw);
    };
    measure(); draw();
    const observer = new ResizeObserver(() => { measure(); if (stage !== 'spinning') draw(); });
    observer.observe(first);
    return () => { window.cancelAnimationFrame(frame); observer.disconnect(); };
  }, [itemId, stage, startedAt, landingOffset, animated]);
  useEffect(() => {
    const node = openingCrate.current;
    if (!animated || stage !== 'revealing' || !revealStartedAt || !node) return;
    let frame = 0;
    const draw = () => {
      const progress = Math.min(1, Math.max(0, Date.now() - Date.parse(revealStartedAt)) / REVEAL_DURATION_MS);
      const open = Math.min(1, Math.max(0, (progress - .2) / .65));
      node.style.setProperty('--crate-lift', `${-open * (reduced ? 10 : 48)}px`);
      node.style.setProperty('--crate-tilt', `${-open * (reduced ? 0 : 28)}deg`);
      node.style.setProperty('--crate-open', String(open));
      node.style.setProperty('--crate-shake', `${reduced ? 0 : Math.sin(progress * 32) * Math.max(0, 1 - progress * 2.5) * 3}px`);
      if (progress < 1) frame = window.requestAnimationFrame(draw);
    };
    draw();
    return () => window.cancelAnimationFrame(frame);
  }, [stage, revealStartedAt, reduced, animated]);

  if (!item || typeof document === 'undefined') return null;
  const master = item.crateId === MASTER_CRATE_ID;
  const rarity = RARITIES[item.rarity];
  const definition = stage === 'result' ? getItemDefinition(item) : null;
  const isNew = definition && !game.inventory.some(candidate => {
    if (candidate.id === item.id) return false;
    const previous = getItemDefinition(candidate);
    return previous?.kind === definition.kind && previous.id === definition.id;
  });
  const style = { '--opening-rarity': stage === 'spinning' ? '#d8ff3e' : rarity.color } as CSSProperties;
  return createPortal(<div className={`crate-opening-shade ${animated ? 'opening-effects' : 'opening-quiet'}`}>
    <svg className="opening-filter-definitions" width="0" height="0" aria-hidden="true" focusable="false"><defs><filter id={blurId} x="-10%" y="0%" width="120%" height="100%" colorInterpolationFilters="sRGB"><feGaussianBlur ref={blur} in="SourceGraphic" stdDeviation="0 0" /></filter></defs></svg>
    <section ref={dialog} className={`crate-opening-dialog stage-${stage}`} role="dialog" aria-modal="true" aria-labelledby="crate-opening-title" style={style}>
      <button className="crate-opening-close" aria-label={stage === 'result' ? 'Cerrar premio' : 'Guardar apertura para después'} onClick={onClose}><X size={19} /></button>
      <div className="opening-header"><span className={master ? 'eyebrow opening-master-label' : 'eyebrow'}><Sparkles size={12} /> {master ? 'COFRE MAESTRO' : 'APERTURA DE COFRE'}</span><h2 id="crate-opening-title">{stage === 'spinning' ? 'Sorteando rareza' : stage === 'result' ? 'Recompensa obtenida' : 'Revelando contenido'}</h2><p>{saving ? 'Confirmando el guardado…' : saveError ? 'El guardado necesita un reintento.' : stage === 'spinning' ? (animated ? 'Solo ves rarezas. El contenido se revela al terminar.' : 'Revelado estático según tu preferencia de movimiento.') : stage === 'result' ? (item.quoteId ? 'Conversión guardada sin volver a pagar ni sortear.' : 'Recompensa guardada en tu colección.') : 'Abriendo tu recompensa…'}</p></div>
      {master && <CrateArtwork crateId={item.crateId} className="opening-master-art" />}
      {animated && stage !== 'result' && <div className="rarity-roulette" aria-label="Ruleta de rarezas"><div className="rarity-roulette-window" style={{ filter: `url("#${blurId}")` }}><div className="rarity-roulette-track" ref={track} aria-hidden="true">{cards.map((card, index) => <div key={index} className={`rarity-roulette-card${index === TARGET && stage === 'revealing' ? ' is-winner' : ''}`} style={{ '--card-rarity': RARITIES[card].color } as CSSProperties}><Box size={45} strokeWidth={1.4} /><span>{RARITIES[card].label}</span><small>CONTENIDO OCULTO</small><i /></div>)}</div></div><span className="rarity-roulette-pointer" aria-hidden="true" /></div>}
      {!master && animated && stage === 'revealing' && <div className="opening-reveal-animation" role="status" aria-label="Abriendo recompensa"><div ref={openingCrate} className="opening-crate" aria-hidden="true"><div className="opening-crate-glow" /><div className="opening-crate-lid" /><div className="opening-crate-base"><span /></div>{effectsEnabled && !reduced && <Sparkles className="opening-crate-sparkles" size={38} />}</div><span>ROMPIENDO EL SELLO</span></div>}
      {stage === 'result' && !saving && !saveError && definition && <div className="opening-item-result" aria-live="polite"><div className="opening-result-badges">{isNew && !item.quoteId && <span className="opening-new-badge">¡Nuevo!</span>}<span className="opening-rarity-badge"><Star size={15} />{rarity.label} · {definition.kind === 'gear' ? 'EQUIPAMIENTO' : definition.kind==='companion'?'CHEESIT':'CRÉDITOS'}</span></div><div className="opening-result-art">{item.gearId ? <GearSprite gearId={item.gearId} /> : item.companionId ? <CompanionSprite companionId={item.companionId} animated={effectsEnabled&&!reduced} motion="celebrate"/> : <CreditCoin size={70}/>}</div><h3>{definition.kind === 'quote' ? <><CreditCoin/> +{quoteConversionAmount(game, item)} créditos</> : definition.name}</h3><p>{definition.kind === 'quote' ? 'Tu recompensa antigua reservada se ha convertido en créditos de su misma rareza. Conserva su identidad e historial.' : definition.description}</p>{item.gearId && <p>{getAbilityDefinition(item.gearId)?.description} · +{getAbilityDefinition(item.gearId)?.chargesPerDrop ?? 0} cargas al revelar esta copia. El aspecto queda desbloqueado.</p>}{item.companionId&&<CheesitPassive companionId={item.companionId} status={game.equippedCompanionId===item.companionId?'equipped':'available'}/>}<div className="opening-result-actions">{definition.kind !== 'quote' && <button className="opening-primary" onClick={() => { onEquip(item); onClose(); }}>{definition.kind==='companion'?'Equipar cheesit':'Usar aspecto'}<Check size={18} /></button>}<button className="opening-secondary" onClick={onClose}>{item.quoteId ? 'Aceptar créditos' : 'Guardar en colección'}<ArrowRight size={17} /></button></div></div>}
      {saving && <p className="opening-safe-note" role="status">Confirmando recompensa…</p>}
      {saveError && <div className="opening-save-error" role="alert"><p>{saveError}</p><button className="opening-primary" onClick={() => void finishQuickly()}>Reintentar guardado</button></div>}
      {stage !== 'result' && !saving && !saveError && <><button className="opening-secondary opening-quick" onClick={() => void finishQuickly()}>Revelar ahora · sin animación<ArrowRight size={17}/></button><p className="opening-safe-note">Premio reservado. El giro completo dura cinco segundos; revelar ahora conserva el mismo premio y débito.</p></>}
    </section>
  </div>,document.body);
}
