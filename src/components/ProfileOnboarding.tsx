'use client';

import { useState, type FormEvent } from 'react';
import type { AppData } from '@/lib/model';
import { normalizeUsername, USERNAME_HINT } from '@/lib/account-profile';
import { isAthleteProfile, type AthleteProfile } from '@/lib/strength';
import { completeProfile, type AccountIdentity } from '@/lib/remote/profile';

export default function ProfileOnboarding({ owner, identity, data, onComplete, accountPanel }: { owner: string; identity: AccountIdentity | null; data: AppData; onComplete: (identity: AccountIdentity) => Promise<void>; accountPanel: React.ReactNode }) {
  const [displayName, setDisplayName] = useState(data.personalProfile?.displayName ?? '');
  const [username, setUsername] = useState(identity?.username ?? '');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const existingProfile = isAthleteProfile(data.profile);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      const profile: AthleteProfile | undefined = existingProfile ? undefined : { weightKg: Number(weight), heightCm: Number(height), age: Number(age), sex: sex as AthleteProfile['sex'], dumbbellLoad: 'per_hand' };
      const saved = await completeProfile(owner, displayName, username, profile);
      await onComplete(saved);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se ha confirmado el guardado. Reintenta.'); }
    finally { setBusy(false); }
  }
  return <main className="account-page"><div className="account-card"><span className="eyebrow">TU PUNTO DE PARTIDA</span><h1>{existingProfile ? 'Completa tu identidad' : 'Completa tu perfil'}</h1><p>{existingProfile ? 'Tus datos iniciales ya están guardados. Elige cómo te verán en tu perfil.' : 'Guarda estos datos una sola vez para adaptar tu experiencia. Podrás actualizar tu peso en Ajustes.'}</p>
    <form onSubmit={submit}><fieldset disabled={busy}>
      <label>Nombre visible<input autoComplete="name" required maxLength={80} value={displayName} onChange={e => setDisplayName(e.target.value)}/></label>
      <label>Nombre de usuario<input autoComplete="username" autoCapitalize="none" spellCheck={false} required readOnly={!!identity} value={username ? `@${username}` : ''} onChange={e => setUsername(normalizeUsername(e.target.value))} aria-describedby="onboarding-username-hint"/></label><small id="onboarding-username-hint">{USERNAME_HINT}</small>
      {!existingProfile && <><label>Peso (kg)<input type="number" min={30} max={300} step={0.1} required value={weight} onChange={e => setWeight(e.target.value)}/></label><label>Altura (cm)<input type="number" min={100} max={250} step={1} required value={height} onChange={e => setHeight(e.target.value)}/></label><label>Edad (años)<input type="number" min={16} max={100} step={1} required value={age} onChange={e => setAge(e.target.value)}/></label><label htmlFor="initial-sex">Sexo</label><select id="initial-sex" required value={sex} onChange={e => setSex(e.target.value)}><option value="" disabled>Selecciona una opción</option><option value="male">Hombre</option><option value="female">Mujer</option></select></>}
    </fieldset><button type="submit" disabled={busy}>{busy ? 'Guardando en tu cuenta…' : 'Guardar y entrar'}</button></form>{error && <p role="alert">{error}</p>}<details><summary>Mi cuenta</summary>{accountPanel}</details>
  </div></main>;
}
