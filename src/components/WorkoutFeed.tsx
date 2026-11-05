'use client';

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type MouseEvent, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { ArrowUpRight, Check, Dumbbell, Heart, ImageOff, LockKeyhole, MessageCircle, RefreshCw, Send, Share2, Trash2, Users, X } from 'lucide-react';
import { totals } from '@/lib/metrics';
import {
  addPostComment, deletePostComment, downloadWorkoutPhoto, readFeed, readPostComments, setPostLike,
  type FeedComment, type FeedCursor, type FeedPost,
} from '@/lib/remote/feed';
import { PersonalAvatar } from './PersonalAvatar';
import WorkoutDetailContent from './WorkoutDetailContent';
import './workout-feed.css';

type FeedProps = {
  viewer?: string;
  owner?: string;
  workout?: string;
  guest?: boolean;
  onProfile: (owner: string) => void;
  onWorkout: (owner: string, workout: string) => void;
  onAccount?: () => void;
};

const number = (value: number) => value.toLocaleString('es-ES', { maximumFractionDigits: 1 });
const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const dateLabel = (value: string) => new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
const unique = <T extends { id: string }>(items: T[]) => [...new Map(items.map(item => [item.id, item])).values()];

/** Photos are fetched through authenticated Storage policies, never a public URL. */
function WorkoutPhoto({ path, name, onOpen, onLike }: { path: string; name: string; onOpen: () => void; onLike: () => void }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [heart, setHeart] = useState<number | null>(null);
  const pointerType = useRef('');
  const tap = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const heartTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const heartId = useRef(0);
  useEffect(() => () => { clearTimeout(tap.current?.timer); tap.current = null; clearTimeout(heartTimer.current); }, [path]);
  function activate(event: MouseEvent<HTMLButtonElement>) {
    // Native clicks exclude swipes. Keyboard and mouse activation still open immediately.
    if (!event.detail || pointerType.current !== 'touch') {
      clearTimeout(tap.current?.timer); tap.current = null; onOpen(); return;
    }
    const { clientX: x, clientY: y } = event;
    const first = tap.current;
    if (first) {
      clearTimeout(first.timer); tap.current = null;
      if (Math.hypot(first.x - x, first.y - y) <= 40) {
        clearTimeout(heartTimer.current);
        setHeart(++heartId.current);
        heartTimer.current = setTimeout(() => setHeart(null), 650);
        onLike();
        return;
      }
    }
    tap.current = { x, y, timer: setTimeout(() => { tap.current = null; onOpen(); }, 300) };
  }
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    setUrl(''); setError(''); setHeart(null);
    void downloadWorkoutPhoto(path, controller.signal).then(blob => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
    }).catch(reason => { if (!controller.signal.aborted) setError(message(reason, 'No se ha podido cargar la foto.')); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [path, revision]);
  return <div className="feed-photo">
    {url ? <button type="button" onPointerDown={event => { pointerType.current = event.pointerType; }} onClick={activate} aria-label={`Ver entrenamiento de ${name}`}><img src={url} alt={`Foto del entrenamiento de ${name}`} width={960} height={960} loading="lazy" draggable={false} onError={() => { setUrl(''); setError('No se ha podido mostrar la foto.'); }}/>{heart !== null && <span key={heart} className="feed-photo-heart" aria-hidden="true"><Heart size={86} fill="currentColor"/></span>}</button>
      : error ? <div className="feed-photo-error" role="alert"><ImageOff size={26}/><p>{error}</p><button className="text-action" onClick={() => setRevision(value => value + 1)}>Reintentar foto</button></div>
        : <div className="feed-photo-loading" role="status">Cargando foto…</div>}
  </div>;
}

function PostComments({ post, viewer, onProfile, onCount, onClose, composer }: {
  post: FeedPost; viewer: string; onProfile: (owner: string) => void; onCount: (delta: number) => void; onClose: () => void; composer: RefObject<HTMLTextAreaElement | null>;
}) {
  const id = useId();
  const [items, setItems] = useState<FeedComment[]>([]);
  const [cursor, setCursor] = useState<FeedCursor | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [readError, setReadError] = useState('');
  const [writeError, setWriteError] = useState('');
  const [text, setText] = useState('');
  const [writing, setWriting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const alive = useRef(true);
  const readController = useRef<AbortController | null>(null);
  const readLock = useRef(false);
  const writeLock = useRef(false);
  const failedCursor = useRef<FeedCursor | null>(null);
  // Keep the same operation ID after an uncertain response so retry cannot duplicate a comment.
  const operation = useRef<{ body: string; id: string } | null>(null);
  const load = useCallback(async (after: FeedCursor | null = null) => {
    if (readLock.current) return;
    readLock.current = true;
    const controller = new AbortController(); readController.current = controller;
    failedCursor.current = after; setLoading(true); setReadError('');
    try {
      const page = await readPostComments(post.owner_id, post.workout_id, after ?? undefined, controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      setItems(previous => unique([...(after ? previous : []), ...page.items]));
      setCursor(page.next); setLoaded(true);
    } catch (reason) {
      if (alive.current && !controller.signal.aborted) setReadError(message(reason, 'No se han podido cargar los comentarios.'));
    } finally {
      if (readController.current === controller) { readLock.current = false; if (alive.current && !controller.signal.aborted) setLoading(false); }
    }
  }, [post.owner_id, post.workout_id]);
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; readController.current?.abort(); readLock.current = false; }; }, [load]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if (!body || body.length > 2000 || writeLock.current || !loaded) return;
    writeLock.current = true; setWriting(true); setWriteError('');
    if (operation.current?.body !== body) operation.current = { body, id: crypto.randomUUID() };
    try {
      const comment = await addPostComment(viewer, post.owner_id, post.workout_id, body, operation.current.id);
      if (!alive.current) return;
      setItems(previous => previous.some(item => item.id === comment.id) ? previous : [comment, ...previous]);
      setText(''); operation.current = null; onCount(1);
    } catch (reason) { if (alive.current) setWriteError(message(reason, 'No se ha podido publicar el comentario.')); }
    finally { writeLock.current = false; if (alive.current) setWriting(false); }
  }
  async function remove(comment: FeedComment) {
    if (writeLock.current || !window.confirm('¿Eliminar tu comentario?')) return;
    writeLock.current = true; setDeleting(comment.id); setWriteError('');
    try {
      await deletePostComment(viewer, comment.id);
      if (!alive.current) return;
      setItems(previous => previous.filter(item => item.id !== comment.id)); onCount(-1);
    } catch (reason) { if (alive.current) setWriteError(message(reason, 'No se ha podido eliminar el comentario.')); }
    finally { writeLock.current = false; if (alive.current) setDeleting(null); }
  }
  return <section className="feed-comments" aria-labelledby={id}>
    <div className="feed-comments-heading"><h3 id={id}>Comentarios</h3><button className="icon-button" aria-label="Cerrar comentarios" onClick={onClose}><X size={18}/></button></div>
    <form onSubmit={submit} className="feed-comment-form"><label htmlFor={`${id}-text`}><MessageCircle size={15} aria-hidden="true"/>Añade un comentario</label><div className="feed-comment-composer" data-has-text={!!text.trim()}><textarea ref={composer} id={`${id}-text`} rows={2} maxLength={2000} value={text} disabled={writing} placeholder="Escribe aquí un comentario" onChange={event => setText(event.target.value)}/><button className="icon-button" type="submit" disabled={writing || !!deleting || !text.trim() || !loaded} aria-label={writing ? 'Publicando comentario' : 'Publicar comentario'}><Send size={19}/></button></div><div className="feed-comment-footer"><small>{text.length}/2000</small></div></form>
    {writeError && <p className="feed-error" role="alert">{writeError} Tu texto se conserva para reintentar.</p>}
    <ul className="feed-comment-list">{items.map(comment => <li key={comment.id}>
      <button className="feed-comment-avatar" onClick={() => onProfile(comment.owner_id)} aria-label={`Ver perfil de ${comment.display_name || comment.username}`}><PersonalAvatar photo={comment.photo} name={comment.display_name || comment.username}/></button>
      <div><button className="feed-comment-author" onClick={() => onProfile(comment.owner_id)}>{comment.display_name || comment.username}</button><p>{comment.body}</p><time dateTime={comment.created_at}>{dateLabel(comment.created_at)}</time></div>
      {comment.owner_id === viewer && <button className="icon-button feed-delete-comment" aria-label="Eliminar mi comentario" disabled={!!deleting || writing} onClick={() => void remove(comment)}><Trash2 size={16}/></button>}
    </li>)}</ul>
    {loading && <p className="feed-status" role="status">Cargando comentarios…</p>}
    {readError && <div className="feed-error" role="alert"><p>{readError}</p><button className="text-action" onClick={() => void load(failedCursor.current)}>Reintentar comentarios</button></div>}
    {loaded && !loading && !readError && items.length === 0 && <p className="feed-status">Sé la primera persona en comentar.</p>}
    {cursor && !readError && <button className="text-action feed-load-comments" disabled={loading} onClick={() => void load(cursor)}>Ver más comentarios</button>}
  </section>;
}

function PostCard({ post, viewer, detail, onProfile, onWorkout, onUpdate, onUnavailable }: {
  post: FeedPost; viewer: string; detail?: boolean; onProfile: FeedProps['onProfile']; onWorkout: FeedProps['onWorkout']; onUpdate: (update: (post: FeedPost) => FeedPost) => void; onUnavailable: (id: string) => void;
}) {
  const [comments, setComments] = useState(false);
  const [pendingLike, setPendingLike] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const mutationLock = useRef(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const commentsButton = useRef<HTMLButtonElement>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const liked = pendingLike ?? post.liked;
  const likes = Math.max(0, post.likes + Number(liked) - Number(post.liked));
  const name = post.display_name || post.username;
  const stats = totals([post.workout]);
  const minutes = post.workout.startedAt && post.workout.finishedAt ? Math.max(0, Math.round((Date.parse(post.workout.finishedAt) - Date.parse(post.workout.startedAt)) / 60000)) : null;
  function closeComments() {
    setComments(false);
    commentsButton.current?.focus();
  }
  function toggleComments() {
    if (comments) { closeComments(); return; }
    // iOS only opens the keyboard when focus is assigned during the original tap.
    flushSync(() => setComments(true));
    composer.current?.focus();
  }
  async function like(next: boolean) {
    if (mutationLock.current || next === post.liked) return;
    mutationLock.current = true; setPendingLike(next); setError('');
    try {
      const confirmed = await setPostLike(viewer, post.owner_id, post.workout_id, next);
      if (!alive.current) return;
      if (confirmed) onUpdate(current => ({ ...current, liked: confirmed.liked, likes: confirmed.likes }));
      else onUnavailable(post.id);
    } catch (reason) { if (alive.current) setError(message(reason, 'No se ha podido confirmar el like.')); }
    finally { mutationLock.current = false; if (alive.current) setPendingLike(null); }
  }
  async function share() {
    setError(''); setNotice('');
    const url = new URL(window.location.href);
    url.search = ''; url.hash = new URLSearchParams({ view: 'social', person: post.owner_id, workout: post.workout_id }).toString();
    try {
      if (navigator.share) {
        await navigator.share({ title: `${post.workout.name} · Cheesit`, text: `El entrenamiento de ${name}`, url: url.href });
        return;
      }
      await navigator.clipboard.writeText(url.href); setNotice('Enlace copiado.');
    } catch (reason) {
      if (reason instanceof Error && reason.name === 'AbortError') return;
      setShareUrl(url.href); setNotice('Puedes copiar el enlace de abajo.');
    }
  }
  return <article className={`feed-post${detail ? ' feed-post-detail' : ''}`} aria-label={`Entrenamiento de ${name}`} data-post-id={post.id}>
    <header className="feed-post-header"><button className="feed-author" onClick={() => onProfile(post.owner_id)} aria-label={`Ver perfil de ${name}`}><PersonalAvatar photo={post.photo} name={name}/><span><strong>{name}</strong><span>@{post.username}</span></span></button><time dateTime={post.workout.date}>{dateLabel(post.workout.date)}</time></header>
    {post.photo_path && <WorkoutPhoto path={post.photo_path} name={name} onOpen={() => onWorkout(post.owner_id, post.workout_id)} onLike={() => void like(true)}/>}
    <div className="feed-actions"><button className={liked ? 'feed-liked' : ''} aria-label={liked ? 'Quitar me gusta' : 'Dar me gusta'} aria-pressed={liked} disabled={pendingLike !== null} onClick={() => void like(!liked)}><Heart size={23} fill={liked ? 'currentColor' : 'none'}/><span>{number(likes)}<span className="feed-action-label"> Me gusta</span></span></button><button ref={commentsButton} aria-expanded={comments} onClick={toggleComments} aria-label={`${post.comments} comentarios`}><MessageCircle size={23}/><span>{number(post.comments)}<span className="feed-action-label"> Comentarios</span></span></button><button className="feed-share" aria-label="Compartir entrenamiento" onClick={() => void share()}><Share2 size={22}/><span className="feed-action-label">Compartir</span></button></div>
    {post.caption && <p className="feed-caption"><strong>{name}</strong> {post.caption}</p>}
    {!detail && <div className={`feed-post-summary${post.photo_path ? '' : ' feed-post-without-photo'}`}><div className="feed-workout-label"><Dumbbell size={17}/><span>ENTRENAMIENTO COMPLETADO</span></div><h2 className="feed-workout-heading"><button className="feed-workout-title" onClick={() => onWorkout(post.owner_id, post.workout_id)}><span>{post.workout.name}</span><ArrowUpRight size={21}/></button></h2><div className="feed-workout-metrics"><span><strong>{post.workout.exercises.length}</strong> ejercicios</span><span><strong>{stats.sets}</strong> series</span><span><strong>{number(stats.volume)}</strong> kg × reps</span>{minutes !== null && <span><strong>{minutes}</strong> min</span>}</div><p className="feed-exercise-preview">{post.workout.exercises.slice(0, 3).map(exercise => exercise.name).join(' · ')}{post.workout.exercises.length > 3 && ` · +${post.workout.exercises.length - 3} más`}</p></div>}
    {error && <p className="feed-error" role="alert">{error}</p>}
    {notice && <p className="feed-notice" role="status">{notice}</p>}
    {shareUrl && <label className="feed-share-link">Enlace a la publicación<input type="url" readOnly value={shareUrl} onFocus={event => event.target.select()}/></label>}
    {detail && <div className="feed-workout-detail"><WorkoutDetailContent workout={post.workout}/></div>}
    {comments && <PostComments post={post} viewer={viewer} onProfile={onProfile} onClose={closeComments} composer={composer} onCount={delta => onUpdate(current => ({ ...current, comments: Math.max(0, current.comments + delta) }))}/>}
  </article>;
}

function FeedStream({ viewer, owner, workout, onProfile, onWorkout, following = false, onFollowingChange }: FeedProps & { viewer: string; following?: boolean; onFollowingChange: (following: boolean) => void }) {
  const [items, setItems] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState<FeedCursor | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const feed = useRef<HTMLElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const failedCursor = useRef<FeedCursor | null>(null);
  const load = useCallback(async (after: FeedCursor | null = null, refresh = false) => {
    if (lock.current) {
      if (!refresh) return;
      request.current?.abort();
    }
    const controller = new AbortController(); request.current = controller; lock.current = true;
    failedCursor.current = after; setLoading(true); setError('');
    if (refresh) { setItems([]); setLoaded(false); setCursor(null); }
    try {
      const page = await readFeed({ owner, workout, following, cursor: after ?? undefined }, controller.signal);
      if (controller.signal.aborted) return;
      setItems(previous => unique([...(after ? previous : []), ...page.items]));
      setCursor(page.next); setLoaded(true);
    } catch (reason) { if (!controller.signal.aborted) setError(message(reason, 'No se han podido cargar las publicaciones.')); }
    finally { if (request.current === controller) { lock.current = false; if (!controller.signal.aborted) setLoading(false); } }
  }, [owner, workout, following]);
  useEffect(() => {
    void load(null, true);
    const refresh = () => {
      // Never reset a long scroll or discard a comment while the person is writing.
      if (document.visibilityState === 'visible' && window.scrollY < 200 && !feed.current?.querySelector('.feed-comments')) void load(null, true);
    };
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh); window.addEventListener('online', refresh); window.addEventListener('cheesit:feed-changed', refresh); document.addEventListener('visibilitychange', visible);
    return () => { request.current?.abort(); window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh); window.removeEventListener('cheesit:feed-changed', refresh); document.removeEventListener('visibilitychange', visible); };
  }, [load]);
  useEffect(() => {
    if (!sentinel.current || !cursor || loading || error || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) void load(cursor); }, { rootMargin: '400px' });
    observer.observe(sentinel.current); return () => observer.disconnect();
  }, [cursor, loading, error, load]);
  return <section ref={feed} className="workout-feed" aria-label={workout ? 'Publicación del entrenamiento' : owner ? 'Publicaciones del perfil' : 'Feed de la comunidad'} aria-busy={loading}>
    {!workout && <div className="feed-toolbar">{!owner && <div className="feed-tabs" role="tablist" aria-label="Seleccionar feed" onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? false : event.key === 'End' ? true : !following;
      const tabs = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      tabs[next ? 1 : 0]?.focus(); onFollowingChange(next);
    }}><button type="button" role="tab" aria-selected={!following} tabIndex={following ? -1 : 0} onClick={() => onFollowingChange(false)}>Descubrir</button><button type="button" role="tab" aria-selected={following} tabIndex={following ? 0 : -1} onClick={() => onFollowingChange(true)}>Siguiendo</button></div>}<button className="text-action" disabled={loading} onClick={() => { setNotice(''); void load(null, true); }} aria-label="Actualizar publicaciones"><RefreshCw size={16}/>Actualizar</button></div>}
    {notice && <p className="feed-notice" role="status">{notice}</p>}
    <div className="feed-posts">{items.map(post => <PostCard key={post.id} post={post} viewer={viewer} detail={!!workout} onProfile={onProfile} onWorkout={onWorkout} onUpdate={update => setItems(previous => previous.map(item => item.id === post.id ? update(item) : item))} onUnavailable={id => { setItems(previous => previous.filter(item => item.id !== id)); setNotice('Esta publicación ya no está disponible.'); }}/>)}</div>
    {loading && <p className="feed-status" role="status">{loaded ? 'Cargando más entrenamientos…' : 'Cargando publicaciones…'}</p>}
    {error && <div className="feed-error" role="alert"><p>{error}</p><button className="secondary" onClick={() => void load(failedCursor.current)}>Reintentar publicaciones</button></div>}
    {loaded && !loading && !error && items.length === 0 && <div className="feed-empty"><LockKeyhole size={32}/><h2>{workout ? 'Entrenamiento no disponible.' : following ? 'Todavía no hay publicaciones de las personas a las que sigues.' : 'Todavía no hay publicaciones.'}</h2><p>{workout ? 'Puede haberse eliminado, ser privado o no estar disponible para tu cuenta.' : owner ? 'Aquí aparecerán los entrenamientos publicados que tengas permiso para ver. La privacidad del perfil también se aplica a sus publicaciones.' : following ? 'Puedes descubrir a más personas en «Buscar personas» y seguirlas desde su perfil.' : 'Cuando alguien publique un entrenamiento, lo encontrarás aquí. Puedes publicar el tuyo desde el historial después de guardarlo.'}</p></div>}
    <div ref={sentinel} className="feed-sentinel" aria-hidden="true"/>
    {cursor && !error && <button className="secondary feed-load-more" disabled={loading} onClick={() => void load(cursor)}>Cargar más entrenamientos</button>}
    {loaded && !loading && !error && !cursor && items.length > 0 && !workout && <p className="feed-end" role="status"><Check size={19}/>Estás al día. Has visto todos los entrenamientos disponibles.</p>}
  </section>;
}

/** One implementation serves the global feed, profile publications and direct links. */
export default function WorkoutFeed(props: FeedProps) {
  const [following, setFollowing] = useState(false);
  if (props.guest || !props.viewer) return <section className="feed-empty"><Users size={34}/><h2>Entrenar también conecta.</h2><p>Inicia sesión para ver publicaciones, dar likes y comentar. Tus entrenamientos de invitado siguen disponibles en este dispositivo.</p>{props.onAccount && <button className="primary" onClick={props.onAccount}>Ir a mi cuenta<ArrowUpRight size={17}/></button>}</section>;
  const onlyFollowing = !props.owner && !props.workout && following;
  return <FeedStream key={`${props.viewer}:${props.owner ?? ''}:${props.workout ?? ''}`} {...props} viewer={props.viewer} following={onlyFollowing} onFollowingChange={setFollowing}/>;
}
