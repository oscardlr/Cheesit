'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, Award, Box, Check, ChevronRight, Clock3, Crown, Dumbbell, Footprints, Gift, Heart, LockKeyhole, Shirt, Sparkles, Target, Trophy, TrendingUp, Zap } from 'lucide-react';
import type { AppData } from '@/lib/model';
import { CRATES, MASTER_CRATE_ID, RARITIES, gameProgress, equipCosmetic, equipCompanion, gameBalance, gameCreditStatus, getAchievements, getLevelCrates, getMissions, normalizeGame, progressionSeasons, openCrate, openLevelCrate, type GameState, type InventoryItem, type Rarity } from '@/lib/game';
import { nextWeeklyResetMadrid } from '@/lib/dates';
import { characterLevelThreshold } from '@/lib/seasons';
import { levelRank } from '@/lib/rewards';
import { playSound } from '@/lib/sound';
import PixelAthlete from './PixelAthlete';
import { ArrowLeft } from 'lucide-react';
import WardrobeV3 from './WardrobeV3';
import CrateOpening from './CrateOpening';
import CreditCoin from './CreditCoin';
import CrateArtwork from './CrateArtwork';
import InfoPopup from './InfoPopup';
import './game-hub.css';
import PageTitle from './PageTitle';
import SectionCards from './SectionCards';
import filterStyles from './ExerciseLibrary.module.css';
import { formatCreditBalance, TEST_CREDITS } from '@/lib/test-credits';
import { acknowledgeQuoteConversions, quoteConversionNotice } from '@/lib/quote-conversion';
import type { Mission } from '@/lib/objectives';

type Props = { data: AppData; today: string; effectsEnabled: boolean; soundEnabled: boolean; initialTab?: Tab; onTabChange?: (tab: Tab) => void; onPersist: (next: AppData) => Promise<void>; onSettings?: () => void; onOpeningChange?: (active: boolean) => void };
export type ArcadeView = 'overview' | 'goals' | 'crates' | 'ascent' | 'looks' | 'abilities';
type Tab = ArcadeView;
const destinations = [
  { id: 'looks', label: 'Personaje', icon: Shirt, artwork: 'arcade-character-card-3d' },
  { id: 'crates', label: 'Cofres', icon: Box, artwork: 'arcade-crates-card-3d' },
  { id: 'goals', label: 'Retos y logros', icon: Target, artwork: 'arcade-goals-card-3d' },
  { id: 'ascent', label: 'Nivel y recompensas', icon: TrendingUp, artwork: 'arcade-seasons-card-3d' },
] as const;

const fmt = (value: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(value);
const cratePrice = new Intl.NumberFormat('es-ES', { useGrouping: true });
const rarityStyle = (rarity: Rarity): CSSProperties => ({ '--rarity': RARITIES[rarity].color } as CSSProperties);
const percent = (current: number, target: number) => Math.min(100, Math.max(0, current / target * 100));

function ProgressBar({ value, label }: { value: number; label: string }) {
  return <div className="arcade-progress" role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${value}%` }} /></div>;
}


export default function GameHub({ data, today, effectsEnabled, soundEnabled, initialTab = 'overview', onTabChange, onPersist, onSettings, onOpeningChange }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const headingRef=useRef<HTMLHeadingElement>(null);
  const previousTab=useRef(initialTab);
  useEffect(()=>{if(previousTab.current===tab)return;previousTab.current=tab;window.scrollTo({top:0,behavior:'instant'});if(document.activeElement?.getAttribute('role')!=='tab')headingRef.current?.focus({preventScroll:true})},[tab]);
  const activeTab = tab === 'looks' || tab === 'abilities' ? 'collection' : tab;
  const selectTab = (next: Tab) => { setTab(next); onTabChange?.(next); };
  const [missionFilter, setMissionFilter] = useState<'all' | 'pending' | 'rewarded'>('all');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState<InventoryItem | null>(null);
  const openedItem = useRef<InventoryItem | null>(null);
  const showOpening = (item: InventoryItem | null) => {
    openedItem.current = item;
    setOpening(item);
    onOpeningChange?.(!!item);
  };
  const lock = useRef(false);
  const mounted = useRef(true);
  useLayoutEffect(() => {
    const keepOpening = (event: Event) => {
      if (lock.current || openedItem.current) event.preventDefault();
    };
    window.addEventListener('cheesit:before-account-refresh', keepOpening);
    window.addEventListener('cheesit:before-update', keepOpening);
    return () => {
      window.removeEventListener('cheesit:before-account-refresh', keepOpening);
      window.removeEventListener('cheesit:before-update', keepOpening);
      onOpeningChange?.(false);
    };
  }, [onOpeningChange]);
  const dataRef = useRef(data);
  dataRef.current = data;
  const game = useMemo(() => normalizeGame(data.game), [data.game]);
  const balance = useMemo(() => gameBalance(game, data.workouts, data.profile), [game, data.workouts, data.profile]);
  const progress = useMemo(() => gameProgress(game, data.workouts, data.profile), [game, data.workouts, data.profile]);
  const missions = useMemo(() => getMissions(data.workouts, today, game), [data.workouts, today, game]);
  const achievements = useMemo(() => getAchievements(data.workouts, data.profile, game), [data.workouts, data.profile, game]);
  const years = useMemo(() => progressionSeasons(game, data.workouts, today.slice(0, 4)), [game, data.workouts, today]);
  const allLevelCrates = useMemo(() => years.flatMap(year => getLevelCrates(game, data.workouts, data.profile, year)), [years, game, data.workouts, data.profile, today]);
  const conversionNotice = quoteConversionNotice(game);
  const pendingItem = game.inventory.find(item => item.id === game.pendingOpening?.itemId);
  const inventory = game.inventory.filter(item => (!item.sold && !item.quoteId) && item.id !== game.pendingOpening?.itemId);
  useEffect(()=>setTab(initialTab),[initialTab]);
  useEffect(() => { mounted.current = true; try { if (sessionStorage.getItem('grind-open-wardrobe')) { selectTab('looks'); sessionStorage.removeItem('grind-open-wardrobe'); } } catch {} return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); }, [notice]);

  async function updateGame(transform: (current: GameState) => GameState) {
    const latest = dataRef.current;
    const nextGame = transform(normalizeGame(latest.game));
    const next = { ...latest, game: nextGame };
    dataRef.current = next;
    await onPersist(next);
  }
  async function equipPrize(item: InventoryItem) {
    if (!item.gearId && !item.companionId) return;
    await updateGame(current => item.gearId ? equipCosmetic(current,item.gearId) : equipCompanion(current,item.companionId!));
    setNotice(item.gearId ? 'Aspecto equipado. Su pasiva se aplicará al finalizar el entrenamiento.' : 'Cheesit equipado. La verás junto a tu personaje.');
    if (soundEnabled) playSound('confirm');
  }
  async function buyCrate(crateId: string, level?: number, season?: string) {
    if (lock.current || openedItem.current) return;
    lock.current = true; setBusy(true); setNotice('');
    const latest = dataRef.current;
    const result = level ? openLevelCrate(normalizeGame(latest.game), latest.workouts, level, latest.profile, season) : openCrate(normalizeGame(latest.game), latest.workouts, crateId, latest.profile);
    if (!result) { setNotice(game.pendingOpening ? 'Termina la apertura pendiente antes de abrir otro cofre.' : 'No puedes abrir este cofre todavía. Revisa tu saldo o tu nivel.'); setBusy(false); lock.current = false; if (soundEnabled) playSound('error'); return; }
    const next = { ...latest, game: result.game };
    // Reserve synchronously in the parent before waiting for disk. Navigating away
    // and remounting must see the spent balance, and cannot reopen the same credit.
    dataRef.current = next;
    onOpeningChange?.(true);
    try {
      await onPersist(next);
      if (!mounted.current) return;
      showOpening(result.item);
      if (soundEnabled) playSound('crate');
      if (!mounted.current) return;
      setBusy(false); lock.current = false;
    } catch { if (!mounted.current) return; onOpeningChange?.(false); setBusy(false); lock.current = false; setNotice('No se ha confirmado el guardado del cofre. La reserva conserva el mismo premio y débito. Usa Reintentar guardado en el aviso de la app antes de continuar.'); if (soundEnabled) playSound('error'); }
  }

  return <div className={`game-hub arcade-redesign view-${activeTab} ${effectsEnabled ? '' : 'game-hub-quiet'}`}>
    <header className="home-header arcade-page-header">
      {tab === 'overview'
        ? <span className="eyebrow">CADA REP DESBLOQUEA ALGO</span>
        : <button className="arcade-back" onClick={() => selectTab('overview')}><ArrowLeft size={15}/>Inicio de Arcade</button>}
      <PageTitle ref={headingRef} tabIndex={-1}>{tab==='overview'?'Arcade':tab==='goals'?'Retos y logros':tab==='crates'?'Cofres y créditos':tab==='ascent'?'Nivel y recompensas':'Personaje'}</PageTitle>
      <div className="arcade-header-stats">
        <span className="arcade-header-level">
          <img src="/assets/cheesit-level-badge.png" alt="Nivel" width={24} height={24}/>
          <strong>{progress.level}</strong>
        </span>
        <button className="arcade-wallet" onClick={()=>selectTab('crates')} title={`${fmt(balance)} créditos disponibles`} aria-label={`${fmt(balance)} créditos disponibles`}>
          <CreditCoin size={24}/>
          <strong>{formatCreditBalance(balance)}</strong>
        </button>
      </div>
    </header>
    {TEST_CREDITS>0&&<p className="arcade-notice test-credit-banner">MODO PRUEBAS · <CreditCoin/> {new Intl.NumberFormat('es-ES').format(TEST_CREDITS)} créditos temporales extra. Se retirarán para la versión final.</p>}
    {notice && <p className="arcade-notice" role="status">{notice}</p>}
    {gameCreditStatus(game, data.workouts, data.profile).deficit > 0 && <p className="arcade-notice">Ajuste de actividad: <CreditCoin/> {fmt(gameCreditStatus(game, data.workouts, data.profile).deficit)} créditos de compras anteriores ya no están respaldados por tu historial actual. Conservas los objetos; las nuevas ganancias cubren primero este ajuste. Tus movimientos originales siguen intactos.</p>}
    {conversionNotice.count > 0 && <div className="opening-resume-banner" role="status"><CreditCoin size={26}/><div><strong>{conversionNotice.count} {conversionNotice.count === 1 ? 'frase antigua convertida' : 'frases antiguas convertidas'} · +{fmt(conversionNotice.credits)} créditos</strong><p>Las ventas antiguas ya compensadas no añaden créditos. El historial se conserva.</p></div><button onClick={() => void updateGame(acknowledgeQuoteConversions).catch(() => setNotice('Reintenta el guardado del aviso desde la app.'))}>Entendido</button></div>}
    {pendingItem && !opening && <div className="opening-resume-banner"><Gift size={27}/><div><strong>Tu cofre sigue cerrado.</strong><p>La apertura está guardada con la misma recompensa y el mismo débito.</p></div><button onClick={() => showOpening(pendingItem)}>Continuar apertura</button></div>}
    <section key={activeTab} className="arcade-panel">
      {tab === 'overview' && <>
        <div className="arcade-overview-xp">
          <div className="arcade-overview-xp-labels">
            <strong>Nivel {progress.level}</strong>
            {progress.nextLevelXp > 0 ? <>
              <span>Faltan {fmt(progress.nextLevelXp - progress.levelXp)} XP</span>
              <strong>Nivel {progress.level + 1}</strong>
            </> : <span>Nivel máximo</span>}
          </div>
          <ProgressBar value={progress.percent} label="Experiencia del nivel actual" />
        </div>
        <SectionCards label="Apartados de Arcade" cards={destinations.map(({ id, ...card }) => ({ ...card, open: () => selectTab(id) }))}/>
      </>}

      {tab === 'goals' && <>
        <div className="arcade-section-head"><div><span className="eyebrow">OBJETIVOS</span><h2>Objetivos de actividad</h2></div><span className="arcade-tag"><Check size={13} /> {missions.filter(mission => mission.complete).length}/{missions.length} completas</span></div>
        <MissionCategory scope="weekly" missions={missions.filter(mission => mission.scope === 'weekly')}/>
        <fieldset className={filterStyles.groupFilter}><legend>Mostrar objetivos de trayectoria</legend><div className={filterStyles.groupButtons}>{([{ value: 'all', label: 'Todos' }, { value: 'pending', label: 'Pendientes' }, { value: 'rewarded', label: 'Recompensados' }] as const).map(({ value, label }) => <button type="button" key={value} aria-pressed={missionFilter === value} onClick={() => setMissionFilter(value)}>{label}</button>)}</div></fieldset>
        <MissionCategory scope="career" missions={missions.filter(mission => mission.scope === 'career' && (missionFilter === 'all' || (missionFilter === 'rewarded' ? mission.rewarded : !mission.rewarded)))}/>
        <div className="arcade-section-head"><div><span className="eyebrow">LOGROS</span><h2>Logros de actividad</h2></div><Award size={23} /></div>
        <div className="arcade-achievements">{achievements.map(achievement => <article key={achievement.id} className={achievement.complete ? 'unlocked' : ''}><span>{achievement.complete ? <Trophy size={24} /> : <LockKeyhole size={22} />}</span><div><h3>{achievement.title}</h3><p>{achievement.description}</p><small>{fmt(achievement.current)} / {fmt(achievement.target)} {achievement.unit}</small><ProgressBar value={percent(achievement.current, achievement.target)} label={achievement.title} /></div>{achievement.complete && <Check size={16} />}</article>)}</div>
        {onSettings && <button className="arcade-primary" onClick={onSettings}>Editar mi perfil en Ajustes<ArrowRight size={16}/></button>}
      </>}

      {tab === 'crates' && <>
        <div className="arcade-crates">{CRATES.map((crate, index) => <article key={crate.id} className={`arcade-crate crate-${crate.id === MASTER_CRATE_ID ? 'master' : index}`}>
          <div className="crate-art" aria-hidden="true"><div className="crate-halo"/><CrateArtwork crateId={crate.id}/></div>
          <div className="crate-heading"><h3>{crate.name}</h3><CrateOdds name={crate.name} odds={crate.odds}/></div>
          <button className="arcade-primary" disabled={busy || Boolean(opening || game.pendingOpening) || balance < crate.cost} onClick={() => void buyCrate(crate.id)}>
            <span>{busy ? 'Guardando…' : balance < crate.cost ? 'Faltan créditos' : 'Abrir cofre'}</span><strong>{cratePrice.format(crate.cost)} <CreditCoin alt="créditos"/></strong>
          </button>
        </article>)}</div>
        {allLevelCrates.some(crate => !crate.claimed) && <LevelRewards compact crates={allLevelCrates} busy={busy || Boolean(opening || game.pendingOpening)} onOpen={(level, season) => void buyCrate('level:' + level, level, season)} />}
        <p className="arcade-economy-note"><CreditCoin/>Créditos virtuales. Cada cofre sortea primero la rareza y después equipo o cheesit de esa rareza. Los objetos no se pueden vender.</p>
      </>}

      {activeTab === 'collection' && <>
        <div className="arcade-section-head"><div><span className="eyebrow">COLECCIÓN</span><h2>{tab==='abilities'?'Pasivas':'Tu personaje'}</h2></div><span className="arcade-tag"><Sparkles size={14}/>{inventory.length} copias</span></div>
        <WardrobeV3 initialPanel={tab==='abilities'?'abilities':'looks'} onPanelChange={selectTab} game={game} level={progress.level} effectsEnabled={effectsEnabled} soundEnabled={soundEnabled} onChange={updateGame} onNotice={setNotice} onOpenCrates={()=>selectTab('crates')}/>
      </>}
      {tab === 'ascent' && <>
        <div className="arcade-ascent-hero"><div><span className="eyebrow">PROGRESO DE NIVEL</span><h2>Ascenso</h2><p>{fmt(progress.xp)} XP acumulada.</p><div className="ascent-rank"><Crown size={22} /><span>NIVEL {progress.level}<strong>{levelRank(progress.level)}</strong></span></div><div className="ascent-xp"><span>{progress.level===99?'Nivel máximo':`${fmt(progress.levelXp)} / ${fmt(progress.nextLevelXp)} XP`}</span><strong>{Math.round(progress.percent)}%</strong></div><ProgressBar value={progress.percent} label="Progreso del nivel actual" /></div><div className="ascent-art"><PixelAthlete pose="climb" animated={effectsEnabled} /></div></div>
        <LevelRewards crates={allLevelCrates} busy={busy || Boolean(opening || game.pendingOpening)} onOpen={(level,season)=>void buyCrate("level:"+level,level,season)}/><div className="ascent-path" aria-label="Camino de niveles">{Array.from({ length: 7 }, (_, index) => Math.max(1, Math.min(93, progress.level - 2)) + index).map(level => <div key={level} className={`ascent-stop ${level < progress.level ? 'passed' : level === progress.level ? 'current' : 'locked'}`}><span>{level < progress.level ? <Check size={20} /> : level === progress.level ? <Footprints size={22} /> : level % 5 === 0 ? <CrateArtwork crateId={`level:${level}`} className="ascent-path-crate" /> : <LockKeyhole size={18} />}</span><div><small>{level === progress.level ? 'ESTÁS AQUÍ' : level < progress.level ? 'CONQUISTADO' : 'PRÓXIMO ESCALÓN'}</small><strong>Nivel {level}</strong><p>{levelRank(level)}</p></div><small>{fmt(characterLevelThreshold(level))} XP</small></div>)}</div>
        <div className="arcade-xp-rules"><h3><Zap size={19} />Cómo se obtiene XP</h3><div><span>Serie confirmada<strong>30–130 XP</strong></span><span>Entreno finalizado<strong>+200 XP</strong></span><span>Récord personal comparable<strong>+75 XP</strong></span><span>3 grupos musculares en una sesión<strong>+100 XP</strong></span></div><p>Carga, repeticiones y progreso personal ajustan el XP de cada serie. Primer escalón: {fmt(characterLevelThreshold(2))} XP. El nivel 99 requiere {fmt(characterLevelThreshold(99))} XP acumulada. A partir del nivel 2, cada nuevo nivel desbloquea un cofre gratis con equipo garantizado. En el máximo sigues acumulando XP.</p></div>
      </>}
    </section>
    {opening && <CrateOpening key={opening.id} game={game} item={opening} effectsEnabled={effectsEnabled} soundEnabled={soundEnabled}
      onGameChange={transform => updateGame(current => current.pendingOpening?.itemId === opening.id ? transform(current) : current)}
      onClose={() => showOpening(null)} onEquip={item => { void equipPrize(item).catch(() => setNotice('No se ha confirmado el aspecto. Reintenta desde el aviso de guardado.')); }}/>}
  </div>;
}

function WeeklyResetCountdown() {
  const [minutes, setMinutes] = useState<number | null>(null);
  useEffect(() => {
    const refresh = () => {
      const now = new Date();
      setMinutes(Math.ceil((nextWeeklyResetMadrid(now).getTime() - now.getTime()) / 60_000));
    };
    refresh();
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  const days = Math.floor((minutes ?? 0) / 1440);
  const hours = Math.floor((minutes ?? 0) % 1440 / 60);
  const mins = (minutes ?? 0) % 60;
  return <div className="weekly-reset-countdown" role="timer" aria-live="off" aria-label={minutes === null ? 'Calculando el próximo reinicio semanal' : `Los objetivos semanales se renuevan en ${days} días, ${hours} horas y ${mins} minutos. Cada lunes a las 00:00, hora de Madrid.`} title="Cada lunes a las 00:00 · hora de Madrid">
    <Clock3 size={15} aria-hidden="true"/><span>Se renuevan en</span><strong>{minutes === null ? '—' : `${days} d · ${String(hours).padStart(2, '0')} h · ${String(mins).padStart(2, '0')} min`}</strong>
  </div>;
}

function MissionCategory({ scope, missions }: { scope: 'weekly' | 'career'; missions: Mission[] }) {
  const ordered = scope === 'weekly' ? missions : [...missions].sort((a, b) => Number(a.rewarded) - Number(b.rewarded) || percent(b.current, b.target) - percent(a.current, a.target));
  const focused = ordered.slice(0, 3), remaining = ordered.slice(3);
  return <section className="mission-category" aria-label={scope === 'weekly' ? 'Objetivos semanales' : 'Objetivos de trayectoria'}>
    <div className="arcade-section-head"><h2>{scope === 'weekly' ? 'Objetivos semanales' : 'Objetivos de trayectoria'}</h2><span className="arcade-tag">{missions.filter(mission => mission.complete).length}/{missions.length}</span></div>
    {scope === 'weekly' && <WeeklyResetCountdown/>}
    <div className="arcade-missions">{focused.map(mission => <MissionCard key={mission.id} mission={mission}/>)}</div>
    {remaining.length > 0 && <details className="more-missions"><summary>Ver {remaining.length} objetivos más</summary><div className="arcade-missions">{remaining.map(mission => <MissionCard key={mission.id} mission={mission}/>)}</div></details>}
    {!missions.length && <p>No hay objetivos en este filtro.</p>}
  </section>;
}

function MissionCard({ mission }: { mission: Mission }) {
  return <article data-mission-id={mission.id} data-mission-scope={mission.scope} data-mission-xp={mission.xp} data-mission-credits={mission.credits} className={`arcade-mission ${mission.complete ? 'completed' : ''}`}>
    <div className="arcade-mission-top"><span className="arcade-mission-icon">{mission.complete ? <Check size={22}/> : <Target size={22}/>}</span><span>{mission.rewarded ? 'RECOMPENSA CONSEGUIDA' : mission.complete ? 'CONQUISTADA' : 'EN PROGRESO'}</span></div>
    <h3>{mission.title}</h3><p>{mission.description}</p><div className="mission-rewards"><span className="mission-reward-badge"><Zap size={12} aria-hidden="true"/>+{fmt(mission.xp)} XP</span><span className="mission-reward-badge"><CreditCoin size={12}/>+{fmt(mission.credits)} créditos</span></div>
    <div className="arcade-mission-count"><strong>{fmt(mission.current)}<small> / {fmt(mission.target)}</small></strong><span>{mission.unit}</span></div>
    <ProgressBar value={percent(mission.current, mission.target)} label={mission.title}/>{mission.rewardNote && <p className="mission-reward-note">{mission.rewardNote}</p>}
  </article>;
}

function CrateOdds({ name, odds }: { name: string; odds: Record<Rarity, number> }) {
  return <InfoPopup title={`Probabilidades · ${name}`}>
    <div className="crate-odds">{(Object.keys(RARITIES) as Rarity[]).map(rarity => <span key={rarity} style={rarityStyle(rarity)}><i aria-hidden="true"/>{RARITIES[rarity].label}<strong>{odds[rarity]}%</strong></span>)}</div>
  </InfoPopup>;
}

function LevelRewards({ crates, busy, onOpen, compact = false }: { crates: ReturnType<typeof getLevelCrates>; busy: boolean; onOpen: (level: number, season: string) => void; compact?: boolean }) {
  const ready = crates.filter(crate => !crate.claimed);
  const claimed = crates.filter(crate => crate.claimed);
  const cards = (items: typeof crates) => (
    <div className={compact ? 'level-rewards-grid compact-level-crates' : 'level-rewards-grid'}>
      {[...items].reverse().map(crate => (
        <article className={`level-reward-card${crate.claimed ? ' is-claimed' : ''}`} key={crate.id}>
          <CrateArtwork crateId={crate.id} className="level-reward-art" />
          <div className="crate-heading">
            <h3>{crate.name}</h3>
            <CrateOdds name={crate.name} odds={crate.odds} />
          </div>
          <button disabled={busy || crate.claimed} onClick={() => onOpen(crate.level, crate.season)}>
            {crate.claimed ? 'Reclamado' : 'Abrir gratis'}
            {!crate.claimed && <ArrowRight size={15} />}
          </button>
        </article>
      ))}
    </div>
  );

  return <section className="level-rewards-section">
    <div className="arcade-section-head"><h2>Cofres de ascenso</h2></div>
    {ready.length ? cards(ready) : <div className="level-reward-empty"><p>Sin cofres pendientes.</p></div>}
    {claimed.length > 0 && <details className="more-missions"><summary>Cofres reclamados</summary>{cards(claimed)}</details>}
  </section>;
}
