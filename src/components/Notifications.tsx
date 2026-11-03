'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Heart } from 'lucide-react';
import { markNotifications, notificationTime, readNotifications, type SocialNotification } from '@/lib/remote/notifications';
import type { SocialRoute } from '@/lib/remote/social';
import { PersonalAvatar } from './PersonalAvatar';
import './social.css';

export function useNotifications(owner?: string) {
  const [items, setItems] = useState<SocialNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [marking, setMarking] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const mutation = useRef(false);
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const refresh = useCallback(async (before?: SocialNotification) => {
    if (!owner) return;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setLoading(true); setError('');
    try {
      const page = await readNotifications(request.signal, before);
      if (request.signal.aborted || ownerRef.current !== owner) return;
      setItems(previous => [...(before ? previous : []), ...page.items.slice(0, 20)].filter((item, i, all) => all.findIndex(n => n.id === item.id) === i));
      setUnread(page.unread); setMore(page.items.length > 20);
    } catch (e) { if (!request.signal.aborted && ownerRef.current === owner) setError(e instanceof Error ? e.message : 'No se pudieron cargar las notificaciones.'); }
    finally { if (!request.signal.aborted && ownerRef.current === owner) setLoading(false); }
  }, [owner]);
  useEffect(() => {
    setItems([]); setUnread(0); setError(''); setMore(false);
    const update = () => { if (document.visibilityState === 'visible' && navigator.onLine) void refresh(); };
    void refresh();
    const timer = owner ? setInterval(update, 30000) : undefined;
    window.addEventListener('focus', update); window.addEventListener('online', update); document.addEventListener('visibilitychange', update);
    return () => { controller.current?.abort(); clearInterval(timer); window.removeEventListener('focus', update); window.removeEventListener('online', update); document.removeEventListener('visibilitychange', update); };
  }, [owner, refresh]);
  const mark = async (id: string | null) => {
    if (!owner || mutation.current) return false;
    mutation.current = true; setMarking(true); setError('');
    controller.current?.abort(); setLoading(false);
    try {
      await markNotifications(owner, id);
      if (ownerRef.current !== owner) return false;
      const readAt = new Date().toISOString();
      setItems(previous => previous.map(n => !id || n.id === id ? { ...n, read_at: n.read_at || readAt } : n));
      await refresh();
      return true;
    } catch (e) { if (ownerRef.current === owner) setError(e instanceof Error ? e.message : 'No se pudo marcar como leída.'); return false; }
    finally { mutation.current = false; if (ownerRef.current === owner) setMarking(false); }
  };
  return { items, unread, loading, more, error, marking, refresh, mark };
}

export function NotificationButton({ unread, onOpen }: { unread: number; onOpen: () => void }) {
  return <button className="icon-button notification-button" aria-label={unread ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'} onClick={onOpen}><Heart size={20}/>{unread > 0 && <span className="notification-dot" aria-hidden="true"/>}</button>;
}

export default function Notifications({ feed, guest, onBack, onAccount, onNavigate }: { feed: ReturnType<typeof useNotifications>; guest: boolean; onBack: () => void; onAccount: () => void; onNavigate: (route: SocialRoute) => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  async function open(n: SocialNotification) {
    if (!n.read_at && !await feed.mark(n.id)) return;
    onNavigate({ owner: n.actor_id, list: null, query: '', workout: n.kind === 'workout' ? n.workout_id : null, source: 'notifications' });
  }
  return <div className="notifications-page"><header className="profile-page-heading"><button className="icon-button" aria-label="Volver" onClick={onBack}><ArrowLeft size={21}/></button><h1 ref={heading} tabIndex={-1}>Notificaciones</h1><Heart size={22}/></header>
    {guest ? <section className="social-empty"><Heart size={32}/><h2>Tu comunidad, más cerca.</h2><p>Inicia sesión para recibir avisos de seguidores y entrenamientos.</p><button className="primary" onClick={onAccount}>Ir a mi cuenta<ArrowUpRight size={17}/></button></section> : <>
      <div className="notifications-toolbar"><p>{feed.unread ? `${feed.unread} sin leer` : 'Estás al día'}</p><button className="text-action" disabled={feed.marking || !feed.unread} onClick={() => void feed.mark(null)}>{feed.marking ? 'Guardando lectura…' : 'Marcar todas como leídas'}</button></div>
      {feed.loading && <p role="status">Cargando notificaciones…</p>}
      {feed.error && <div className="social-error" role="alert"><p>{feed.error}</p><button className="secondary" onClick={() => void feed.refresh()}>Reintentar notificaciones</button></div>}
      {feed.items.length > 0 && <ul className="notifications-list" aria-label="Tus notificaciones">{feed.items.map(n => <li key={n.id} className={n.read_at ? 'notification-read' : 'notification-unread'}><button className="notification-item" disabled={feed.marking} onClick={() => void open(n)}><PersonalAvatar photo={n.photo} name={n.display_name || n.username}/><span className="notification-copy"><span><strong>{n.display_name || n.username}</strong>{n.kind === 'follow' ? ' ha empezado a seguirte.' : n.workout_label ? ` ha publicado un entrenamiento de ${n.workout_label.toLocaleLowerCase('es-ES')}.` : ' ha publicado un entrenamiento que ya no está disponible.'}</span><time dateTime={n.created_at} title={new Date(n.created_at).toLocaleString('es-ES')}>{notificationTime(n.created_at)}</time>{!n.read_at && <small>Sin leer</small>}</span><ArrowUpRight size={17}/></button></li>)}</ul>}
      {!feed.loading && !feed.error && !feed.items.length && <section className="social-empty"><Heart size={32}/><h2>Todavía no hay notificaciones.</h2><p>Aquí verás a tus nuevos seguidores y los entrenamientos que compartan las personas a las que sigues.</p></section>}
      {feed.more && <button className="secondary social-more" disabled={feed.loading || feed.marking} onClick={() => void feed.refresh(feed.items.at(-1))}>Cargar más notificaciones</button>}
    </>}
  </div>;
}
