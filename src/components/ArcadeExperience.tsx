'use client';

import { useEffect, useState } from 'react';
import { Dumbbell, X } from 'lucide-react';
import { playSound, setSoundEnabled, unlockSound } from '@/lib/sound';
import PixelAthlete from './PixelAthlete';
import './arcade-experience.css';

export default function ArcadeExperience({ loaded, effectsEnabled, soundEnabled }: {
  loaded: boolean; effectsEnabled: boolean; soundEnabled: boolean;
}) {
  const [intro, setIntro] = useState(false);
  useEffect(() => { setSoundEnabled(soundEnabled); return () => setSoundEnabled(false); }, [soundEnabled]);
  useEffect(() => {
    document.documentElement.dataset.arcadeEffects = String(effectsEnabled);
    return () => { delete document.documentElement.dataset.arcadeEffects; };
  }, [effectsEnabled]);
  useEffect(() => {
    if (!loaded) return;
    try {
      if (sessionStorage.getItem('grind-intro-v1')) return;
    } catch {}
    const show = window.setTimeout(() => {
      try { sessionStorage.setItem('grind-intro-v1', '1'); } catch {}
      setIntro(true);
    }, 120);
    const hide = window.setTimeout(() => setIntro(false), 2400);
    return () => { window.clearTimeout(show); window.clearTimeout(hide); };
  }, [loaded]);
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('button, a, summary, [role="button"], [role="switch"]') : null;
      if (!target || target.hasAttribute('disabled') || target.getAttribute('aria-disabled') === 'true') return;
      unlockSound();
      if (target.dataset.sound !== 'none') playSound(target.dataset.sound || 'click');
      if (!effectsEnabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const bounds = target.getBoundingClientRect();
      const burst = document.createElement('span');
      burst.className = 'arcade-tap';
      burst.setAttribute('aria-hidden', 'true');
      burst.style.left = `${event.detail ? event.clientX : bounds.left + bounds.width / 2}px`;
      burst.style.top = `${event.detail ? event.clientY : bounds.top + bounds.height / 2}px`;
      document.body.appendChild(burst);
      burst.addEventListener('animationend', () => burst.remove(), { once: true });
      window.setTimeout(() => burst.remove(), 650);
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [effectsEnabled]);

  return intro ? <aside className={`arcade-intro ${effectsEnabled ? '' : 'arcade-intro-quiet'}`} aria-label="Bienvenido a Cheesit">
    <PixelAthlete pose="bench" animated={effectsEnabled} />
    <div><span><Dumbbell size={12} /> CHEESIT · TU SESIÓN</span><strong>REGISTRA<br/><em>TU SESIÓN.</em></strong><small>Elige rutina, registra y confirma tus series.</small></div>
    <button aria-label="Cerrar bienvenida" onClick={() => setIntro(false)}><X size={15}/></button>
  </aside> : null;
}
