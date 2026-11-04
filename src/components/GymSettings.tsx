'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Check, MapPin } from 'lucide-react';
import './gym-settings.css';

/** Saves through the existing account document, keeping the field in one source. */
export default function GymSettings({ gym = '', onSave }: { gym?: string; onSave: (gym: string) => Promise<void> }) {
  const id = useId();
  const [draft, setDraft] = useState(gym);
  const [saved, setSaved] = useState(gym);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const busy = useRef(false);
  const alive = useRef(true);
  const previousGym = useRef(gym);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    // A confirmed sync can update this field without overwriting a local edit.
    const previous = previousGym.current;
    previousGym.current = gym;
    // The account store also stages optimistic local data. Only onSave can
    // confirm our pending write; a failed sync must leave the retry enabled.
    if (busy.current) return;
    setDraft(value => value === previous ? gym : value);
    setSaved(gym);
  }, [gym]);
  useEffect(() => {
    if (!saving) return;
    const guard = (event: Event) => event.preventDefault();
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('cheesit:before-profile-navigation', guard);
    window.addEventListener('cheesit:before-update', guard);
    window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('cheesit:before-profile-navigation', guard); window.removeEventListener('cheesit:before-update', guard); window.removeEventListener('beforeunload', unload); };
  }, [saving]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    const next = draft.trim();
    if (next.length > 100) { setError('El gimnasio puede tener como máximo 100 caracteres.'); return; }
    busy.current = true; setSaving(true); setError(''); setNotice('');
    try {
      await onSave(next);
      if (!alive.current) return;
      setSaved(next); setDraft(next); setNotice(next ? 'Gimnasio guardado.' : 'Gimnasio eliminado del perfil.');
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : 'No se ha podido guardar el gimnasio. Tu texto se conserva para reintentar.');
    } finally { busy.current = false; if (alive.current) setSaving(false); }
  }
  return <section className="gym-settings settings-section" aria-labelledby={`${id}-title`}>
    <span className="eyebrow">TU LUGAR DE ENTRENAMIENTO</span><h2 id={`${id}-title`}><MapPin size={20} aria-hidden="true"/>Tu gimnasio</h2>
    <p>Añádelo a tu perfil para que otras personas sepan dónde entrenas. Puedes dejarlo vacío.</p>
    <form onSubmit={submit}>
      <label htmlFor={`${id}-gym`}>Gimnasio</label><input id={`${id}-gym`} type="text" autoComplete="off" maxLength={100} placeholder="Nombre de tu gimnasio" value={draft} disabled={saving} aria-describedby={`${id}-hint`} onChange={event => { setDraft(event.target.value); setError(''); setNotice(''); }}/>
      <p id={`${id}-hint`} className="gym-settings-hint">Aparecerá encima de tu biografía. {draft.length}/100</p>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="gym-settings-saved" role="status"><Check size={16}/>{notice}</p>}
      <button type="submit" className="secondary" disabled={saving || draft.trim() === saved}>{saving ? 'Guardando gimnasio…' : 'Guardar gimnasio'}</button>
    </form>
  </section>;
}
