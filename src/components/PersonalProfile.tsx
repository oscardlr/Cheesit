'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowUpRight, Camera, Check, ChevronRight, Dumbbell, Layers, LockKeyhole, Pencil, Trash2, X, Zap } from 'lucide-react';
import type { AppData } from '@/lib/model';
import { totals } from '@/lib/metrics';
import { levelRank } from '@/lib/rewards';
import { EMPTY_PERSONAL_PROFILE, isPersonalProfile, prepareProfilePhoto, recentProfileWorkouts, type PersonalProfile as Profile } from '@/lib/personal-profile';
import ExerciseThumbnail from './ExerciseThumbnail';
import { OwnSocialSummary } from './SocialPanel';
import { PersonalAvatar } from './PersonalAvatar';
export { PersonalAvatar } from './PersonalAvatar';
import type { SocialList } from '@/lib/remote/social';
import './personal-profile.css';

const number = (n: number) => new Intl.NumberFormat('es-ES').format(n);
const dateLabel = (date: string) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));


function EditProfile({ profile, onSave, onClose }: { profile: Profile; onSave: (profile: Profile) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState<Profile>(() => ({ ...profile }));
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile);
  const busy = saving || processing;
  const close = () => { if (!busy && (!dirty || window.confirm('¿Descartar los cambios del perfil?'))) onClose(); };
  useEffect(() => {
    alive.current = true;
    dialog.current?.showModal();
    dialog.current?.querySelector<HTMLInputElement>('#profile-name')?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { alive.current = false; document.body.style.overflow = overflow; };
  }, []);
  useEffect(() => {
    const beforeUpdate = (event: Event) => { if (dirty || busy) event.preventDefault(); };
    const beforeNavigation = (event: Event) => { if (busy || (dirty && !window.confirm('¿Descartar los cambios del perfil?'))) event.preventDefault(); else onClose(); };
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('cheesit:before-update', beforeUpdate);
    window.addEventListener('cheesit:before-profile-navigation', beforeNavigation);
    window.addEventListener('beforeunload', beforeUnload);
    return () => { window.removeEventListener('cheesit:before-update', beforeUpdate); window.removeEventListener('cheesit:before-profile-navigation', beforeNavigation); window.removeEventListener('beforeunload', beforeUnload); };
  }, [dirty, busy, onClose]);
  async function photo(file: File) {
    setProcessing(true); setError('');
    try { const result = await prepareProfilePhoto(file); if (alive.current) setDraft(p => ({ ...p, photo: result })); }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'No se ha podido preparar la foto.'); }
    finally { if (alive.current) setProcessing(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    const next = { ...draft, displayName: draft.displayName.trim(), bio: draft.bio.trim() };
    if (!isPersonalProfile(next)) { setError('Revisa el nombre, la biografía y la foto.'); return; }
    setSaving(true); setError('');
    try { await onSave(next); if (alive.current) onClose(); }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'No se ha podido guardar. Tus cambios siguen aquí.'); }
    finally { if (alive.current) setSaving(false); }
  }
  return <dialog ref={dialog} className="profile-edit-dialog" aria-labelledby="profile-edit-title" onCancel={e => { e.preventDefault(); close(); }}>
    <form onSubmit={submit}>
      <header><div><span className="eyebrow">A TU MANERA</span><h2 id="profile-edit-title">Editar perfil</h2></div><button type="button" className="icon-button" aria-label="Cerrar edición de perfil" disabled={busy} onClick={close}><X size={21}/></button></header>
      <fieldset disabled={busy}>
        <div className="profile-photo-edit"><PersonalAvatar photo={draft.photo} name={draft.displayName || 'tu cuenta'}/><div><button type="button" className="secondary" onClick={() => input.current?.click()}><Camera size={16}/>{draft.photo ? 'Cambiar foto' : 'Subir foto'}</button>{draft.photo && <button type="button" className="profile-remove-photo" onClick={() => { setDraft(p => ({ ...p, photo: null })); setError(''); }}><Trash2 size={15}/>Eliminar foto</button>}</div></div>
        <input ref={input} aria-label="Foto de perfil" type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void photo(file); }}/>
        <p className="profile-photo-hint">JPG, PNG o WebP · hasta 8 MB. Se recorta el centro en formato cuadrado.</p>
        <label htmlFor="profile-name">Nombre</label><input autoFocus id="profile-name" autoComplete="name" maxLength={80} value={draft.displayName} placeholder="Cómo quieres llamarte" onChange={e => setDraft(p => ({ ...p, displayName: e.target.value }))}/>
        <label htmlFor="profile-bio">Biografía <span>{draft.bio.length}/300</span></label><textarea id="profile-bio" maxLength={300} rows={4} placeholder="Tu motivación, tus objetivos, tu manera de entrenar…" value={draft.bio} onChange={e => setDraft(p => ({ ...p, bio: e.target.value }))}/>
      </fieldset>
      {processing && <p role="status" className="notice">Preparando tu foto…</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <footer><button type="button" className="secondary" disabled={busy} onClick={close}>Cancelar</button><button type="submit" className="primary" disabled={busy}>{saving ? 'Guardando…' : 'Guardar cambios'}{!saving && <Check size={17}/>}</button></footer>
      <p className="profile-edit-note">El guardado se confirma al completarse. Si falla la conexión, conserva los cambios y vuelve a intentarlo.</p>
    </form>
  </dialog>;
}

export default function PersonalProfile({ data, level, onSave, onWorkout, onStart, onBack, username, guest, accountOwner, onSocial }: { accountOwner?: string; onSocial?: (list: SocialList | null) => void; username?: string; guest?: boolean; data: AppData; level: number; onSave: (profile: Profile) => Promise<void>; onWorkout: (id: string) => void; onStart: () => void; onBack: () => void }) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const profile = data.personalProfile ?? EMPTY_PERSONAL_PROFILE;
  const stats = totals(data.workouts, data.profile);
  const recent = recentProfileWorkouts(data.workouts);
  const name = profile.displayName || 'Tu perfil';
  return <div className="personal-profile-page">
    <header className="profile-page-heading"><button className="icon-button" aria-label="Volver al resumen" onClick={onBack}><ArrowLeft size={21}/></button><h1>Mi perfil</h1><span><LockKeyhole size={13}/>Actividad privada</span></header>
    <section className="personal-profile-card" aria-label="Tu perfil personal">
      <div className="profile-cover" aria-hidden="true"><span>BUILT BY YOU.</span><ArrowUpRight/></div>
      <div className="profile-identity"><PersonalAvatar photo={profile.photo} name={name}/><div className="profile-name"><span className="eyebrow">CADA REP CUENTA</span><h2>{name}</h2>{username && <p className="profile-username">@{username}</p>}<span className="profile-rank"><Zap size={13}/>Nivel {number(level)} · {levelRank(level)}</span></div><button className="secondary profile-edit-button" onClick={() => { setSaved(false); setEditing(true); }}><Pencil size={15}/>Editar perfil</button></div>
      <p className={`profile-bio ${profile.bio ? '' : 'profile-bio-empty'}`}>{profile.bio || 'Este es tu espacio. Añade tu nombre, una foto y eso que te mueve a entrenar.'}</p>
      {saved && <p role="status" className="profile-saved"><Check size={15}/>{guest ? 'Perfil guardado en este navegador.' : 'Perfil guardado en tu cuenta.'}</p>}
      {accountOwner && onSocial && <OwnSocialSummary owner={accountOwner} onOpen={onSocial}/>}
      <dl className="profile-stats" aria-label="Resumen de actividad"><div><dt><Dumbbell size={16}/>Entrenamientos</dt><dd>{number(stats.workouts)}</dd><span>completados</span></div><div><dt><Layers size={16}/>Series</dt><dd>{number(stats.sets)}</dd><span>realizadas</span></div><div><dt><Zap size={16}/>Nivel actual</dt><dd>{number(level)}</dd><span>{levelRank(level)}</span></div></dl>
    </section>
    <p className="profile-social-privacy">{guest ? 'Tu perfil de invitado se guarda en este navegador. Necesitas una cuenta para buscar personas y seguirlas.' : 'Las personas con sesión iniciada pueden ver tu nombre, @usuario, foto, biografía y conexiones. Tu correo, datos físicos y entrenamientos siguen siendo privados.'}</p>
    <div className="profile-activity-layout"><section className="profile-recent" aria-labelledby="profile-recent-title"><div className="profile-section-title"><div><span className="eyebrow">TU ESFUERZO, EN EL TIEMPO</span><h2 id="profile-recent-title">Últimos entrenamientos<span> ({stats.workouts})</span></h2></div></div>
      {recent.length ? <div className="profile-workout-list">{recent.map(workout => { const summary = totals([workout], data.profile); return <button className="profile-workout" key={workout.id} onClick={() => onWorkout(workout.id)}><ExerciseThumbnail exerciseId={workout.exercises[0]?.exerciseId || ''}/><span className="profile-workout-copy"><time dateTime={workout.date}>{dateLabel(workout.date)}</time><strong>{workout.name}</strong><span>{workout.exercises.length} {workout.exercises.length === 1 ? 'ejercicio' : 'ejercicios'} · {summary.sets} {summary.sets === 1 ? 'serie' : 'series'} · {number(summary.reps)} reps</span></span><ChevronRight size={18}/></button>; })}</div>
        : <div className="profile-empty"><span className="profile-empty-icon"><Dumbbell size={28}/></span><h3>Tu primera sesión empieza contigo.</h3><p>Aquí aparecerán tus entrenamientos completados, con cada serie que hayas realizado.</p><button className="primary" onClick={onStart}>Empezar entrenamiento<ArrowUpRight size={18}/></button></div>}
    </section><aside className="profile-manifesto"><span className="eyebrow">TU ÚNICA COMPETENCIA</span><p>ERES<br/><em>TÚ.</em></p><span>Cada sesión forma parte de tu historia. Sigue construyéndola, a tu ritmo.</span>{recent.length > 0 && <button className="text-action" onClick={onStart}>Nueva sesión<ArrowUpRight size={17}/></button>}<div><LockKeyhole size={14}/>Tu actividad y tus datos físicos son privados.</div></aside></div>
    {editing && <EditProfile profile={profile} onSave={async next => { await onSave(next); setSaved(true); }} onClose={() => { setEditing(false); document.querySelector<HTMLButtonElement>('.profile-edit-button')?.focus(); }}/>}
  </div>;
}
