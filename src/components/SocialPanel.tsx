'use client';

import PageTitle from './PageTitle';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, MapPin, Search, Users, WifiOff } from 'lucide-react';
import { readDirectory, readSocial, setFollow, SOCIAL_PAGE_SIZE, type DirectoryProfile, type SocialList, type SocialProfile, type SocialRoute } from '@/lib/remote/social';
import WorkoutFeed from './WorkoutFeed';
import type { SaveRoutineFromWorkout } from './SaveWorkoutRoutine';
import { PersonalAvatar } from './PersonalAvatar';
import './social.css';
import './gym-settings.css';

const listLabel = (list: SocialList) => list === 'followers' ? 'Seguidores' : 'Seguidos';

export function SocialCounts({ profile, onOpen }: { profile: SocialProfile; onOpen: (list: SocialList) => void }) {
  return <div className="social-counts" aria-label="Conexiones">
    <button onClick={() => onOpen('followers')}><strong>{profile.followers.toLocaleString('es-ES')}</strong><span>Seguidores</span></button>
    <button onClick={() => onOpen('following')}><strong>{profile.following.toLocaleString('es-ES')}</strong><span>Seguidos</span></button>
  </div>;
}

export function OwnSocialSummary({ owner, onOpen }: { owner: string; onOpen: (list: SocialList | null) => void }) {
  const [profile, setProfile] = useState<SocialProfile>();
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setProfile(undefined); setError('');
    void readSocial({ owner, list: null, query: '' }, 0, controller.signal).then(([next]) => {
      if (!controller.signal.aborted) { setProfile(next); if (!next) setError('Tu perfil social no está disponible.'); }
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    const refresh = () => setRevision(n => n + 1);
    window.addEventListener('online', refresh); window.addEventListener('focus', refresh);
    return () => { controller.abort(); window.removeEventListener('online', refresh); window.removeEventListener('focus', refresh); };
  }, [owner, revision]);
  return <section className="own-social-summary" aria-label="Tu perfil social">
    {profile ? <SocialCounts profile={profile} onOpen={onOpen}/> : error ? <div role="alert"><p>{error}</p><button className="text-action" onClick={() => setRevision(n => n + 1)}>Reintentar</button></div> : <p role="status">Cargando seguidores…</p>}
  </section>;
}

function SocialRow({ profile, onOpen, onFollow, disabled }: { profile: DirectoryProfile; onOpen: () => void; onFollow?: () => void; disabled?: boolean }) {
  return <li className={onFollow ? 'social-person-with-follow' : undefined}><button className="social-person" onClick={onOpen}>
    <PersonalAvatar photo={profile.photo} name={profile.display_name || profile.username}/>
    <span className="social-person-copy"><strong>{profile.display_name || profile.username}</strong><span>@{profile.username}</span>{profile.follows_you && <small>Te sigue</small>}</span>{!onFollow && <ArrowUpRight size={20}/>}
  </button>{onFollow && <button type="button" className={`social-row-follow ${profile.is_following ? 'secondary' : 'primary'}`} aria-pressed={profile.is_following} disabled={disabled} onClick={onFollow}>{profile.is_following ? 'Siguiendo' : 'Seguir'}<span className="sr-only"> a @{profile.username}</span></button>}</li>;
}

export default function SocialPanel({ owner, guest, route, onNavigate, onBack, onAccount, onSaveRoutine, embedded = false }: {
  owner?: string; guest: boolean; embedded?: boolean; onSaveRoutine?: SaveRoutineFromWorkout; route: SocialRoute; onNavigate: (route: SocialRoute) => void; onBack: () => void; onAccount: () => void;
}) {
  const key = `${route.owner ?? ''}:${route.list ?? ''}:${route.query}`;
  const [paging, setPaging] = useState({ key, offset: 0 });
  const offset = paging.key === key ? paging.offset : 0;
  const [result, setResult] = useState<{ key: string; profiles: DirectoryProfile[]; more: boolean }>({ key: '', profiles: [], more: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [mutationError, setMutationError] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(new Set<string>());
  const heading = useRef<HTMLHeadingElement>(null);
  const searching = !route.owner;
  const profiles = result.key === key ? result.profiles : [];
  const profile = route.owner && !route.list && profiles[0] && 'followers' in profiles[0] ? profiles[0] as SocialProfile : undefined;
  useEffect(() => {
    const update = () => { setOnline(navigator.onLine); if (navigator.onLine) { setPaging({ key, offset: 0 }); setRevision(n => n + 1); } };
    setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update); window.addEventListener('focus', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); window.removeEventListener('focus', update); };
  }, [key]);
  useEffect(() => { heading.current?.focus(); }, [route.owner, route.list]);
  useEffect(() => {
    if (guest || !owner) { setLoading(false); setError(''); return; }
    const controller = new AbortController();
    setLoading(true); setError('');
    const timer = setTimeout(() => {
      void (searching ? readDirectory(owner, route.query, offset, controller.signal) : readSocial(route, offset, controller.signal)).then(rows => {
        if (controller.signal.aborted) return;
        setResult(previous => ({ key, profiles: [...(offset && previous.key === key ? previous.profiles : []), ...rows.slice(0, SOCIAL_PAGE_SIZE)], more: rows.length > SOCIAL_PAGE_SIZE }));
      }).catch(e => { if (!controller.signal.aborted) setError(e.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, searching && route.query.trim() ? 280 : 0);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [key, route.owner, route.list, route.query, owner, guest, offset, revision, searching]);
  async function follow(person: DirectoryProfile) {
    const id = person.owner_id;
    if (!owner || owner === id || lock.current.has(id) || !online) return;
    lock.current.add(id); setPending(new Set(lock.current)); setMutationError(''); setNotice('');
    try {
      const confirmed = await setFollow(owner, id, !person.is_following);
      setResult(previous => ({ ...previous, profiles: previous.profiles.map(p => p.owner_id === confirmed.owner_id ? confirmed : p) }));
      setNotice(confirmed.is_following ? 'Ahora sigues a esta persona.' : 'Has dejado de seguir a esta persona.');
    } catch (e) { setMutationError(e instanceof Error ? e.message : 'No se pudo confirmar el cambio.'); }
    finally { lock.current.delete(id); setPending(new Set(lock.current)); }
  }
  const title = route.workout ? 'Entrenamiento' : guest || searching ? 'Buscar personas' : route.list ? listLabel(route.list) : 'Perfil social';
  return <div className="social-page">
    {!embedded && <header className="profile-page-heading"><button className="icon-button" aria-label="Volver" onClick={() => route.workout && !route.source ? onNavigate({ ...route, workout: null }) : onBack()}><ArrowLeft size={21}/></button><PageTitle ref={heading} tabIndex={-1}>{title}</PageTitle><Users size={22} aria-hidden="true"/></header>}
    {guest || !owner ? <section className="social-empty"><Users size={36}/><h2>Conecta con tu gente.</h2><p>Necesitas una cuenta para buscar personas, ver perfiles y seguirlas. Puedes continuar entrenando como invitado.</p><button className="primary" onClick={onAccount}>Ir a mi cuenta<ArrowUpRight size={17}/></button></section> : <>
      {!online && <p className="social-offline" role="status"><WifiOff size={18}/>Sin conexión. Conéctate para consultar perfiles y confirmar seguimientos.</p>}
      {searching && <section className={embedded ? "social-search social-search-inline" : "social-search"}>{!embedded && <><span className="eyebrow">CADA REP, EN BUENA COMPAÑÍA</span><h2>Encuentra a tu gente<span>.</span></h2></>}<label htmlFor="social-search">Nombre o nombre de usuario</label><div><Search size={20}/><input id="social-search" type="search" autoFocus={embedded} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={80} placeholder="Nombre o @usuario" value={route.query} onChange={e => onNavigate({ owner: null, list: null, query: e.target.value })}/></div></section>}
      {route.owner && route.list && <button className="text-action social-list-owner" onClick={() => onNavigate({ ...route, list: null })}>Ver perfil de esta persona<ArrowUpRight size={16}/></button>}
      {loading && <p role="status" className="social-status">{offset ? 'Cargando más personas…' : 'Consultando perfiles…'}</p>}
      {error && <div className="social-error" role="alert"><p>{error}</p><button className="secondary" onClick={() => setRevision(n => n + 1)}>Reintentar</button></div>}
      {searching && <>{mutationError && <p className="social-error" role="alert">{mutationError}</p>}{notice && <p className="sr-only" role="status">{notice}</p>}</>}
      {!error && profile && !route.workout && <section className="personal-profile-card social-profile" aria-label="Perfil social">
        <div className="profile-cover" aria-hidden="true"><span>EVERY REP CONNECTS.</span><ArrowUpRight/></div>
        <div className="profile-identity"><PersonalAvatar photo={profile.photo} name={profile.display_name || profile.username}/><div className="profile-name"><span className="eyebrow">COMUNIDAD CHEESIT</span><h2>{profile.display_name || profile.username}</h2><p className="profile-username">@{profile.username}</p>{profile.follows_you && <span className="social-follows-you">Te sigue</span>}<SocialCounts profile={profile} onOpen={list => onNavigate({ ...route, list })}/></div></div>
        {profile.gym?.trim() && <p className="profile-gym"><MapPin size={16} aria-hidden="true"/><span>{profile.gym}</span></p>}
        <p className="profile-bio">{profile.bio || 'Todavía no ha añadido una biografía.'}</p>
        {profile.owner_id !== owner && <div className="social-follow"><button className={profile.is_following ? 'secondary' : 'primary'} disabled={pending.has(profile.owner_id) || loading || !online} aria-pressed={profile.is_following} onClick={() => void follow(profile)}>{pending.has(profile.owner_id) ? 'Confirmando…' : profile.is_following ? 'Dejar de seguir' : 'Seguir'}</button></div>}
        {mutationError && <p className="social-error" role="alert">{mutationError}</p>}{notice && <p className="social-confirmed" role="status">{notice}</p>}
      </section>}
      {!error && profile && <>{!route.workout && <h2 className="social-publications-heading">Publicaciones</h2>}<WorkoutFeed onSaveRoutine={onSaveRoutine} viewer={owner} owner={profile.owner_id} workout={route.workout ?? undefined} onProfile={person => onNavigate({ owner: person, list: null, query: '' })} onWorkout={(person, workout) => onNavigate({ owner: person, list: null, query: '', workout })}/></>}
      {!error && (!route.owner || route.list) && profiles.length > 0 && <ul className="social-people" aria-label={searching ? 'Resultados de personas' : title}>{profiles.map(p => <SocialRow key={p.owner_id} profile={p} onOpen={() => onNavigate({ owner: p.owner_id, list: null, query: route.query })} onFollow={searching ? () => void follow(p) : undefined} disabled={pending.has(p.owner_id) || !online}/>)}</ul>}
      {!loading && !error && result.key === key && profiles.length === 0 && <section className="social-empty"><Users size={32}/><h2>{searching ? 'No encontramos a nadie.' : route.list === 'followers' ? 'Todavía no hay seguidores.' : route.list === 'following' ? 'Todavía no sigue a nadie.' : route.workout ? 'Entrenamiento no disponible.' : 'Perfil no disponible.'}</h2><p>{searching ? 'Prueba con otro nombre o @usuario. Solo aparecen perfiles completados.' : route.list ? 'Las conexiones aparecerán aquí cuando se confirmen.' : 'Puede que esta cuenta ya no exista o no haya completado su perfil.'}</p></section>}
      {result.key === key && result.more && !error && <button className="secondary social-more" disabled={loading} onClick={() => setPaging({ key, offset: profiles.length })}>Cargar más personas</button>}
      {!embedded && <p className="social-privacy">Solo las personas con sesión iniciada pueden ver tu nombre, @usuario, foto, biografía y conexiones. El correo y tus datos físicos son privados. Cada persona decide si comparte sus entrenamientos.</p>}
    </>}
  </div>;
}
