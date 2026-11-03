'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronRight, LogOut, Settings2, UserRound, Search } from 'lucide-react';
import { isProfilePhoto } from '@/lib/personal-profile';
import './profile-menu.css';

export default function ProfileMenu({ screen, onNavigate, photo, onSignOut }: { screen: string; onNavigate: (screen: 'profile' | 'settings' | 'social') => void; photo?: string | null; onSignOut?: () => Promise<boolean> }) {
  const details = useRef<HTMLDetailsElement>(null);
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');
  async function leave() {
    if (!onSignOut || signingOut) return;
    setSigningOut(true); setError('');
    try { if (await onSignOut() && details.current) details.current.open = false; }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se ha podido cerrar la sesión.'); }
    finally { setSigningOut(false); }
  }
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
  const select = (next: 'profile' | 'settings' | 'social') => { if (details.current) details.current.open = false; onNavigate(next); };
  return <details ref={details} className="profile-nav" data-active={screen === 'profile' || screen === 'settings' || screen === 'social'} onBlur={event => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}>
    <summary className="icon-button profile-button" aria-label="Menú de perfil" title="Menú de perfil">{photo && photo !== failedPhoto && isProfilePhoto(photo) ? <img className="profile-button-photo" src={photo} alt="" width={32} height={32} onError={() => setFailedPhoto(photo)}/> : <UserRound size={19} aria-hidden="true"/>}</summary>
    <div className="profile-nav-options" role="group" aria-label="Opciones de perfil">
      <button type="button" aria-current={screen === 'profile' ? 'page' : undefined} onClick={() => select('profile')}><UserRound size={18}/><span>Mi perfil</span><ChevronRight size={15}/></button>
      <button type="button" aria-current={screen === 'social' ? 'page' : undefined} onClick={() => select('social')}><Search size={18}/><span>Buscar personas</span><ChevronRight size={15}/></button>
      <button type="button" aria-current={screen === 'settings' ? 'page' : undefined} onClick={() => select('settings')}><Settings2 size={18}/><span>Ajustes</span><ChevronRight size={15}/></button>
      {onSignOut && <button type="button" disabled={signingOut} onClick={() => void leave()}><LogOut size={18}/><span>{signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}</span></button>}
      {error && <p className="profile-nav-error" role="alert">{error}</p>}
    </div>
  </details>;
}
