'use client';

import { useEffect, useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { readActivity, shareActivity, type SocialActivity as Activity } from '@/lib/remote/social';
import { levelProgress } from '@/lib/rewards';
import { ProfileStats, ProfileWorkouts } from './ProfileActivity';
import WorkoutDetailContent from './WorkoutDetailContent';

export function ActivityPrivacy({ owner }: { owner: string }) {
  const [shared, setShared] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setShared(undefined); setError('');
    void readActivity(owner, null, 0, controller.signal).then(value => {
      if (!controller.signal.aborted) { if (value) setShared(value.shared); else setError('Tu perfil no está disponible.'); }
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [owner, revision]);
  async function toggle() {
    if (busy || shared === undefined) return;
    setBusy(true); setError('');
    try { setShared(await shareActivity(owner, !shared)); window.dispatchEvent(new Event('cheesit:feed-changed')); }
    catch (e) { setShared(undefined); setError(e instanceof Error ? e.message : 'No se pudo guardar la privacidad.'); }
    finally { setBusy(false); }
  }
  return <section className="activity-privacy" aria-label="Privacidad del perfil"><div><strong><LockKeyhole size={15}/>Privacidad del perfil</strong><p>Activa Perfil público para mostrar tus publicaciones y estadísticas a la comunidad. Si lo desactivas, tus entrenamientos y fotos solo serán visibles para ti, incluso mediante un enlace. Tus notas siempre son privadas.</p><p role="status">{busy ? 'Guardando privacidad…' : shared === undefined ? error ? 'Estado sin confirmar.' : 'Consultando privacidad…' : shared ? 'Perfil público. Solo se muestran los entrenamientos que publiques.' : 'Perfil privado. Solo tú puedes ver tus publicaciones.'}</p></div><button className={`toggle ${shared ? 'on' : ''}`} role="switch" aria-label="Perfil público" aria-checked={shared === true} disabled={busy || shared === undefined} onClick={() => void toggle()}><span/></button>{error && <div role="alert"><p>{error}</p><button className="text-action" onClick={() => setRevision(n => n + 1)}>Reintentar privacidad</button></div>}</section>;
}

export default function SocialActivity({ owner, workout, own = false, onWorkout }: { own?: boolean; owner: string; workout?: string | null; onWorkout: (id: string) => void }) {
  const [activity, setActivity] = useState<Activity | null>();
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => { setActivity(undefined); setOffset(0); setRevision(n => n + 1); };
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    const timer = setInterval(visible, 30000);
    window.addEventListener('focus', refresh); window.addEventListener('online', refresh); document.addEventListener('visibilitychange', visible);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', visible); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void readActivity(owner, workout || null, offset, controller.signal).then(next => {
      if (controller.signal.aborted) return;
      setMore(!workout && !!next && next.workouts.length > 20);
      setActivity(previous => next ? { ...next, workouts: [...(offset && previous && (next.shared || own) ? previous.workouts : []), ...next.workouts.slice(0, 20)].filter((w, i, all) => all.findIndex(x => x.id === w.id) === i) } : null);
    }).catch(e => { if (!controller.signal.aborted) { setActivity(undefined); setError(e.message); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [owner, workout, own, offset, revision]);
  const summary = activity?.summary;
  const progress = levelProgress(Object.values(summary?.seasons ?? {}).reduce((total, xp) => total + xp, 0));
  return <section className="social-activity" aria-label={workout ? 'Detalle del entrenamiento' : 'Actividad compartida'}>
    {loading && <p role="status">Cargando {workout ? 'entrenamiento' : 'actividad'}…</p>}
    {error && <div className="social-error" role="alert"><p>{error}</p><button className="secondary" onClick={() => setRevision(n => n + 1)}>Reintentar actividad</button></div>}
    {!loading && !error && (!activity || (workout && !activity.workouts.length)) && <div className="profile-empty"><LockKeyhole size={28}/><h2>Entrenamiento no disponible.</h2><p>Puede haberse eliminado o su autor ha dejado de compartirlo. No tienes permiso para consultarlo.</p></div>}
    {!loading && !error && activity && !workout && !activity.shared && !own && <div className="profile-empty"><LockKeyhole size={28}/><h2>Actividad privada.</h2><p>Esta persona no comparte sus estadísticas ni sus entrenamientos.</p></div>}
    {!error && activity && (activity.shared || own || !!workout) && <>
      {workout ? activity.workouts[0] && <WorkoutDetailContent workout={activity.workouts[0]}/> : <>
        {summary ? <><ProfileStats workouts={summary.workouts} sets={summary.sets} level={progress.level} xp={progress.xp}/><p className="profile-extra-stats">{summary.reps.toLocaleString('es-ES')} repeticiones · {summary.volume.toLocaleString('es-ES', { maximumFractionDigits: 2 })} kg × reps</p></> : <p className="social-status">El nivel y los puntos se actualizarán cuando esta persona sincronice su cuenta.</p>}
        <div className="profile-section-title"><h2>Últimos entrenamientos</h2></div>
        {activity.workouts.length ? <ProfileWorkouts workouts={activity.workouts} onWorkout={onWorkout}/> : !loading && <div className="profile-empty"><h3>Todavía no hay entrenamientos.</h3><p>Las sesiones completadas aparecerán aquí.</p></div>}
        {more && <button className="secondary social-more" disabled={loading} onClick={() => setOffset(activity.workouts.length)}>Cargar más entrenamientos</button>}
      </>}
    </>}
  </section>;
}
