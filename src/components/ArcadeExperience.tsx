'use client';

import { useEffect } from 'react';
import { playSound, setSoundEnabled, unlockSound } from '@/lib/sound';
import './arcade-experience.css';

export default function ArcadeExperience({ effectsEnabled, soundEnabled }: {
  loaded: boolean; effectsEnabled: boolean; soundEnabled: boolean;
}) {
  useEffect(() => { setSoundEnabled(soundEnabled); return () => setSoundEnabled(false); }, [soundEnabled]);
  useEffect(() => {
    document.documentElement.dataset.arcadeEffects = String(effectsEnabled);
    return () => { delete document.documentElement.dataset.arcadeEffects; };
  }, [effectsEnabled]);
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

  return null;
}
