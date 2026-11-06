'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowUpRight, Check, Flame, Sparkles, Trophy, X, Zap } from 'lucide-react';
import { levelCrate } from '@/lib/game';
import { playSound } from '@/lib/sound';
import { COMPANIONS } from '@/lib/companions';
import { getCompanionPassive, type CompanionPassiveAward } from '@/lib/cheesit-passives';
import { CompanionSprite } from './CharacterAvatar';
import PixelAthlete from './PixelAthlete';
import CreditCoin from './CreditCoin';
import CrateArtwork from './CrateArtwork';
import './celebration.css';

export type CelebrationEvent = {
  id: number;
  kind: 'set' | 'workout';
  reps: number;
  weight: number;
  xp: number;
  combo: number;
  record?: boolean;
  title?: string;
  levelBefore?: number;
  levelAfter?: number;
  totalXp?: number;
  coins?: number;
  breakdown?: { label: string; xp: number }[];
  historicalAdjustment?: number;
  milestones?: string[];
  abilityCredits?:number;
  abilityUsed?:boolean;
  cheesitReward?: CompanionPassiveAward;
};

type Props = {
  event: CelebrationEvent | null;
  onDismiss: () => void;
  effectsEnabled: boolean;
  soundEnabled: boolean;
};

function CountUp({ value, animated, eventId }: { value: number; animated: boolean; eventId: number }) {
  const [count, setCount] = useState(animated ? 0 : value);
  useEffect(() => {
    if (!animated || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setCount(value); return; }
    setCount(0);
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 1100);
      setCount(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, animated, eventId]);
  return <>{new Intl.NumberFormat('es-ES').format(count)}</>;
}

export default function Celebration({ event, onDismiss, effectsEnabled, soundEnabled }: Props) {
  const dismissRef = useRef(onDismiss);
  const soundRef = useRef(soundEnabled);
  const closeRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  dismissRef.current = onDismiss;
  soundRef.current = soundEnabled;
  const eventId = event?.id;
  const kind = event?.kind;
  const unlockedCrate = event?.levelAfter && event.levelBefore && event.levelAfter > event.levelBefore
    ? levelCrate(event.levelAfter)
    : null;
  const levelUp = Boolean(unlockedCrate);

  useEffect(() => {
    if (eventId === undefined || !kind) return;
    if (soundRef.current) playSound(levelUp ? 'level' : kind === 'workout' ? 'workout' : 'xp');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = kind === 'set' ? window.setTimeout(() => dismissRef.current(), levelUp ? 4800 : 3000) : undefined;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    if (kind === 'workout') {
      document.body.style.overflow = 'hidden';
      closeRef.current?.focus({ preventScroll: true });
    }
    const onKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === 'Escape') dismissRef.current();
      if (kind !== 'workout' || keyboardEvent.key !== 'Tab') return;
      const buttons = cardRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      const first = buttons?.[0];
      const last = buttons?.[buttons.length - 1];
      if (!first || !last) return;
      if (keyboardEvent.shiftKey && document.activeElement === first) { keyboardEvent.preventDefault(); last.focus(); }
      else if (!keyboardEvent.shiftKey && document.activeElement === last) { keyboardEvent.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    const soundTimer = soundRef.current && kind === 'workout' && !reduced
      ? window.setTimeout(() => { if (soundRef.current) playSound('rare'); }, 1150) : undefined;
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      if (soundTimer !== undefined) window.clearTimeout(soundTimer);
      document.removeEventListener('keydown', onKeyDown);
      if (kind === 'workout') {
        document.body.style.overflow = previousOverflow;
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      }
    };
  }, [eventId, kind, levelUp]);

  if (!event) return null;
  const isWorkout = event.kind === 'workout';
  const isRecord = Boolean(event.record);
  const title = isWorkout ? (levelUp ? 'OTRO NIVEL.' : 'SESIÓN COMPLETADA.') : isRecord ? 'NUEVO RÉCORD.' : 'SERIE CONQUISTADA.';
  const Icon = isWorkout || isRecord ? Trophy : Zap;
  const cheesit = event.cheesitReward && COMPANIONS.find(item => item.id === event.cheesitReward?.companionId);
  const passive = cheesit && getCompanionPassive(cheesit.id);

  return (
    <div key={event.id} className={`celebration-stage ${isWorkout ? 'celebration-victory' : 'celebration-hit'} ${effectsEnabled ? '' : 'celebration-quiet'} ${isRecord ? 'celebration-record' : ''} ${levelUp ? 'celebration-levelup' : ''}`}>
      {isWorkout && <div className="celebration-backdrop" aria-hidden="true" onClick={onDismiss} />}
      {effectsEnabled && <>
        {isWorkout && <div className="celebration-rays" aria-hidden="true"/>}
        <div className="celebration-particles" aria-hidden="true">
          {Array.from({ length: isWorkout ? 96 : 32 }, (_, index) => {
            const angle = index * 137.508 + event.id % 31;
            const distance = (isWorkout ? 230 : 100) + (index * 47) % 410;
            const radians = angle * Math.PI / 180;
            return <i key={index} style={{
              '--particle-x': `${Math.cos(radians) * distance}px`,
              '--particle-y': `${Math.sin(radians) * distance - 150}px`,
              '--particle-rotate': `${angle * 2}deg`,
              '--particle-delay': `${(index % 11) * 55}ms`,
              '--particle-color': ['#d7ff5f', '#a985ff', '#ff8bd0', '#ffffff', '#ffd569'][index % 5],
              '--particle-width': `${4 + index % 5}px`,
            } as CSSProperties} />;
          })}
        </div>
      </>}
      <section ref={cardRef}
        className={isWorkout ? 'celebration-card celebration-workout' : 'celebration-card celebration-set'}
        role={isWorkout ? 'dialog' : undefined}
        aria-modal={isWorkout ? true : undefined}
        aria-labelledby={`celebration-title-${event.id}`}
      >
        <button ref={closeRef} className="celebration-close" aria-label="Cerrar celebración" onClick={onDismiss}><X size={18} /></button>
        {isWorkout ? <div className="celebration-athlete-stage" aria-hidden="true"><span className="celebration-orbit"/><PixelAthlete pose={levelUp ? 'climb' : 'victory'} animated={effectsEnabled}/>{cheesit&&<div className="celebration-cheesit"><CompanionSprite companionId={cheesit.id} animated={effectsEnabled} motion="celebrate"/></div>}<span className="celebration-player-label">{levelUp ? 'LEVEL UP' : 'WORKOUT CLEAR'}</span></div>
          : <div className="celebration-emblem" aria-hidden="true"><span /><Icon strokeWidth={1.7} /></div>}
        <div className="celebration-content">
          <div className="celebration-kicker"><Sparkles size={12} />{isWorkout ? 'ENTRENAMIENTO GUARDADO' : isRecord ? 'TU MEJOR MARCA' : 'SERIE CONFIRMADA'}</div>
          <h2 id={`celebration-title-${event.id}`}>{title}</h2>
          <p className="celebration-detail">{isWorkout ? event.title || 'Entrenamiento completado.' : <>{event.weight > 0 ? `${new Intl.NumberFormat('es-ES').format(event.weight)} kg × ` : ''}{event.reps} repeticiones.</>}</p>
        </div>
        <span className="celebration-sr" aria-live="polite" aria-atomic="true">{title} Has ganado {event.xp} XP.{levelUp ? ` Has alcanzado el nivel ${event.levelAfter}.` : ''}</span>
        <div className="celebration-reward" aria-label={`${event.xp} XP ganados`}><span aria-hidden="true">+<CountUp value={event.xp} animated={effectsEnabled} eventId={event.id}/></span><small>{isWorkout ? 'XP NUEVOS · BONUS DE SESIÓN' : 'XP GANADOS'}</small></div>
        {event.coins !== undefined && <div className="celebration-coins"><CreditCoin size={18}/><strong>{event.coins>=0?'+':''}<CountUp value={event.coins} animated={effectsEnabled} eventId={event.id}/></strong><span>CRÉDITOS</span></div>}
        {!isWorkout&&event.breakdown&&<div className="celebration-set-breakdown">{event.breakdown.map(row=><span key={row.label}>{row.label} <strong>+{row.xp}</strong></span>)}</div>}
        {event.combo > 1 && <div className="celebration-combo"><Flame size={15} /><strong>×{event.combo}</strong><span>SERIES EN CADENA</span></div>}
        {unlockedCrate && <div className="celebration-level-scene">
          <CrateArtwork crateId={unlockedCrate.id} className="celebration-level-crate" />
          <strong>{unlockedCrate.name}</strong>
        </div>}
        {isWorkout && <>
          {event.abilityUsed&&<div className="celebration-milestones"><strong><Sparkles size={12}/>Bonificación de atuendo{event.abilityCredits ? <> · <CreditCoin/> +{event.abilityCredits} créditos extra</> : null}</strong></div>}
          {cheesit&&passive&&event.cheesitReward&&<div className="celebration-cheesit-reward" aria-label="Bonificación del cheesit"><span>BONIFICACIÓN DEL CHEESIT</span><strong>{cheesit.name} · {passive.name}</strong><p><span>+{event.cheesitReward.bonusXp} XP</span><span><CreditCoin/> +{event.cheesitReward.bonusCredits} créditos directos</span></p><small>{event.cheesitReward.eligible?'Pasiva fijada al empezar. Bonificación concedida una vez.':event.cheesitReward.reason==='historical-date'?'La fecha registrada no coincidía con el día de inicio; esta sesión no recibe bonus de cheesit.':'No se cumplió la condición al finalizar. La decisión queda guardada.'}</small></div>}
          {!!event.milestones?.length && <div className="celebration-milestones"><span>NUEVAS VICTORIAS</span>{event.milestones.map(milestone=><strong key={milestone}><Trophy size={12}/>{milestone}</strong>)}</div>}
          {event.breakdown && event.breakdown.length > 0 && <div className="celebration-breakdown">{event.breakdown.map((row, index) => <div key={`${row.label}-${index}`}><span>{row.label}</span><strong>+{new Intl.NumberFormat('es-ES').format(row.xp)} XP</strong></div>)}</div>}
          {event.totalXp !== undefined && <div className="celebration-session-total"><span>TOTAL DE ESTA SESIÓN</span><strong>{new Intl.NumberFormat('es-ES').format(event.totalXp)} XP</strong><small>Incluye las series que ya has cobrado.</small></div>}
          {!!event.historicalAdjustment && <p className="celebration-history-note">Al añadir esta sesión anterior se han recalculado el progreso y los récords del historial: {event.historicalAdjustment>0?'+':''}{new Intl.NumberFormat('es-ES').format(event.historicalAdjustment)} XP de ajuste.</p>}
          <div className="celebration-workout-stats"><span><Check size={16} /> Guardado en tu historial</span><strong>{event.reps} <small>repeticiones</small></strong></div>
          <button className="celebration-continue" onClick={onDismiss}>Continuar <ArrowUpRight size={20} /></button>
        </>}
      </section>
    </div>
  );
}
