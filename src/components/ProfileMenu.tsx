'use client';

import { useEffect, useRef } from 'react';
import { ChevronRight, Settings2, UserRound } from 'lucide-react';
import './profile-menu.css';

export default function ProfileMenu({ screen, onNavigate }: { screen: string; onNavigate: (screen: 'profile' | 'settings') => void }) {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !details.current?.contains(event.target) && details.current) details.current.open = false; };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && details.current?.open) {
        details.current.open = false;
        details.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, []);
  useEffect(() => { if (details.current) details.current.open = false; }, [screen]);
  const select = (next: 'profile' | 'settings') => { if (details.current) details.current.open = false; onNavigate(next); };
  return <details ref={details} className="profile-nav" data-active={screen === 'profile' || screen === 'settings'} onBlur={event => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}>
    <summary className="icon-button profile-button" aria-label="Menú de perfil" title="Menú de perfil"><UserRound size={19} aria-hidden="true"/></summary>
    <div className="profile-nav-options" role="group" aria-label="Opciones de perfil">
      <button type="button" aria-current={screen === 'profile' ? 'page' : undefined} onClick={() => select('profile')}><UserRound size={18}/><span>Mi perfil</span><ChevronRight size={15}/></button>
      <button type="button" aria-current={screen === 'settings' ? 'page' : undefined} onClick={() => select('settings')}><Settings2 size={18}/><span>Ajustes</span><ChevronRight size={15}/></button>
    </div>
  </details>;
}
