'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react';
import { ArrowRight, Award, Box, Check, ChevronRight, Clock3, Coins, Crown, Dumbbell, Footprints, Gift, Heart, LockKeyhole, PackageOpen, Shirt, Sparkles, Target, Trophy, TrendingUp, Zap } from 'lucide-react';
import type { AppData } from '@/lib/model';
import { CRATES, RARITIES, REWARD_CATEGORY_LABEL, gameProgress, equipCosmetic, equipCompanion, gameBalance, gameCreditStatus, getAchievements, getLevelCrates, getMissions, normalizeGame, progressionSeasons, openCrate, openLevelCrate, type GameState, type InventoryItem, type Rarity } from '@/lib/game';
import { muscleActivity, type MuscleActivity } from '@/lib/muscles';
import { nextWeeklyResetMadrid, todayMadrid } from '@/lib/dates';
import { characterLevelThreshold, seasonBounds, seasonLabel } from '@/lib/seasons';
import { levelRank } from '@/lib/rewards';
import { playSound } from '@/lib/sound';
import PixelAthlete from './PixelAthlete';
import CharacterAvatar, { CharacterParty } from './CharacterAvatar';
import BodyFigure, { activityColor } from './MuscleMap';
import ArcadeOverview from './ArcadeOverview';
import { ArrowLeft } from 'lucide-react';
import WardrobeV3 from './WardrobeV3';
import CrateOpening from './CrateOpening';
import CrateArtwork from './CrateArtwork';
import './game-hub.css';
import filterStyles from './ExerciseLibrary.module.css';
import { formatCreditBalance, TEST_CREDITS } from '@/lib/test-credits';
import { acknowledgeQuoteConversions, quoteConversionNotice } from '@/lib/quote-conversion';
import type { Mission } from '@/lib/objectives';

type Props = { data: AppData; onChange: Dispatch<SetStateAction<AppData>>; today: string; effectsEnabled: boolean; soundEnabled: boolean; initialTab?: Tab; onTabChange?: (tab: Tab) => void; onPersist: (next: AppData) => Promise<void>; onSettings?: () => void };
export type ArcadeView = 'overview' | 'goals' | 'body' | 'crates' | 'collection' | 'ascent' | 'looks' | 'abilities';
type Tab = ArcadeView;
const tabs: { id: Tab; label: string; Icon: typeof Target }[] = [
  { id: 'goals', label: 'Objetivos', Icon: Target }, { id: 'body', label: 'Cuerpo', Icon: Heart },
  { id: 'crates', label: 'Cofres', Icon: Box }, { id: 'collection', label: 'Colección', Icon: Sparkles }, { id: 'ascent', label: 'Ascenso', Icon: TrendingUp },
];
const fmt = (value: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(value);
const rarityStyle = (rarity: Rarity): CSSProperties => ({ '--rarity': RARITIES[rarity].color } as CSSProperties);
const percent = (current: number, target: number) => Math.min(100, Math.max(0, current / target * 100));

function ProgressBar({ value, label }: { value: number; label: string }) {
  return <div className="arcade-progress" role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${value}%` }} /></div>;
}


export default function GameHub({ data, onChange, today, effectsEnabled, soundEnabled, initialTab = 'overview', onTabChange, onPersist, onSettings }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const headingRef=useRef<HTMLHeadingElement>(null);
  const previousTab=useRef(initialTab);
  useEffect(()=>{if(previousTab.current===tab)return;previousTab.current=tab;window.scrollTo({top:0,behavior:'instant'});if(document.activeElement?.getAttribute('role')!=='tab')headingRef.current?.focus({preventScroll:true})},[tab]);
  const activeTab = tab === 'looks' || tab === 'abilities' ? 'collection' : tab;
  const [bodySide, setBodySide] = useState<'front'|'back'>('front');
  const selectTab = (next: Tab) => { setTab(next); onTabChange?.(next); };
  const selectMuscle = (id: string) => { setSelectedMuscle(id); if (['back','triceps','glutes','hamstrings'].includes(id)) setBodySide('back'); else if (['chest','biceps','abs','quads'].includes(id)) setBodySide('front'); };
  const [monthChoice, setMonthChoice] = useState('');
  const [yearChoice, setYearChoice] = useState('');
  const selectedMonth = monthChoice || today.slice(0, 7);
  const selectedYear = yearChoice || today.slice(0, 4);
  const [selectedMuscle, setSelectedMuscle] = useState('chest');
  const [missionFilter, setMissionFilter] = useState<'all' | 'pending' | 'rewarded'>('all');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [openingVisible, setOpeningVisible] = useState(Boolean(data.game?.pendingOpening));
  const [lastPrize, setLastPrize] = useState<InventoryItem | null>(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  const dataRef = useRef(data);
  dataRef.current = data;
  const game = useMemo(() => normalizeGame(data.game), [data.game]);
  const balance = useMemo(() => gameBalance(game, data.workouts, data.profile), [game, data.workouts, data.profile]);
  const progress = useMemo(() => gameProgress(game, data.workouts, data.profile, selectedYear), [game, data.workouts, data.profile, selectedYear, today]);
  const currentProgress = useMemo(() => gameProgress(game, data.workouts, data.profile, today.slice(0,4)), [game, data.workouts, data.profile, today]);
  const missions = useMemo(() => getMissions(data.workouts, today, game), [data.workouts, today, game]);
  const achievements = useMemo(() => getAchievements(data.workouts, data.profile, game), [data.workouts, data.profile, game]);
  const muscles = useMemo(() => muscleActivity(data.workouts, today, selectedMonth, data.profile), [data.workouts, today, selectedMonth, data.profile]);
  const overviewMuscles=useMemo(()=>selectedMonth===today.slice(0,7)?muscles:muscleActivity(data.workouts,today,today.slice(0,7),data.profile),[muscles,selectedMonth,today,data.workouts,data.profile]);
  const levelCrates = useMemo(() => getLevelCrates(game, data.workouts, data.profile, selectedYear), [game, data.workouts, data.profile, selectedYear, today]);
  const years = useMemo(() => progressionSeasons(game, data.workouts, today.slice(0, 4)), [game, data.workouts, today]);
  const months = [...new Set([today.slice(0, 7), ...data.workouts.filter(workout => workout.status !== 'deleted').map(workout => workout.date.slice(0, 7)), ...(game.missionRewards ?? []).map(reward => todayMadrid(new Date(reward.awardedAt)).slice(0,7)), ...game.transactions.map(transaction => todayMadrid(new Date(transaction.createdAt)).slice(0,7))])].sort().reverse();
  const allLevelCrates = useMemo(() => years.flatMap(year => getLevelCrates(game, data.workouts, data.profile, year)), [years, game, data.workouts, data.profile, today]);
  const conversionNotice = quoteConversionNotice(game);
  const selected = muscles.find(muscle => muscle.id === selectedMuscle) ?? muscles[0];
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
    setNotice(item.gearId ? 'Aspecto equipado para siempre. Activa sus cargas en Habilidades.' : 'Cheesit equipado. La verás junto a tu personaje.');
    if (soundEnabled) playSound('confirm');
  }
  async function buyCrate(crateId: string, level?: number, season?: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setNotice('');
    const latest = dataRef.current;
    const result = level ? openLevelCrate(normalizeGame(latest.game), latest.workouts, level, latest.profile, season) : openCrate(normalizeGame(latest.game), latest.workouts, crateId, latest.profile);
    if (!result) { setNotice(game.pendingOpening ? 'Termina la apertura pendiente antes de abrir otro cofre.' : 'No puedes abrir este cofre todavía. Revisa tu saldo o tu nivel.'); setBusy(false); lock.current = false; if (soundEnabled) playSound('error'); return; }
    const next = { ...latest, game: result.game };
    // Reserve synchronously in the parent before waiting for disk. Navigating away
    // and remounting must see the spent balance, and cannot reopen the same credit.
    dataRef.current = next;
    try {
      await onPersist(next);
      setLastPrize(null); setOpeningVisible(true);
      if (soundEnabled) playSound('crate');
      if (!mounted.current) return;
      setBusy(false); lock.current = false;
    } catch { if (!mounted.current) return; setBusy(false); lock.current = false; setNotice('No se ha confirmado el guardado del cofre. La reserva conserva el mismo premio y débito. Usa Reintentar guardado en el aviso de la app antes de continuar.'); if (soundEnabled) playSound('error'); }
  }

  return <div className={`game-hub arcade-redesign view-${activeTab} ${effectsEnabled ? '' : 'game-hub-quiet'}`}>
    <header className="arcade-header">
      <div>{tab==='overview'?<span className="arcade-kicker"><span/>CADA REP DESBLOQUEA ALGO</span>:<button className="arcade-back" onClick={()=>selectTab('overview')}><ArrowLeft size={15}/>Inicio de Arcade</button>}<h1 ref={headingRef} tabIndex={-1} aria-label="Zona arcade">Arcade<span className="arcade-title-dot">.</span></h1></div>
      <button className="arcade-wallet" onClick={()=>selectTab('crates')} title={`${fmt(balance)} créditos disponibles`} aria-label={`${fmt(balance)} créditos disponibles`}><Coins size={20}/><span><strong>{formatCreditBalance(balance)}</strong><small>créditos</small></span><ArrowRight size={16}/></button>
    </header>
    {TEST_CREDITS>0&&<p className="arcade-notice test-credit-banner">MODO PRUEBAS · {new Intl.NumberFormat('es-ES').format(TEST_CREDITS)} créditos temporales extra. Se retirarán para la versión final.</p>}
    <nav hidden={tab==='overview'} className="arcade-tabs" role="tablist" aria-label="Apartados de la zona arcade" onKeyDown={event => {
      if (busy || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = tabs.findIndex(item => item.id === activeTab);
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      selectTab(tabs[target].id); document.getElementById(`arcade-tab-${tabs[target].id}`)?.focus();
    }}>{tabs.map(({ id, label, Icon }) => <button key={id} id={`arcade-tab-${id}`} role="tab" tabIndex={activeTab === id ? 0 : -1} aria-selected={activeTab === id} aria-controls={`arcade-panel-${id}`} disabled={busy} onClick={() => { selectTab(id); setNotice(''); }}><Icon size={17} /><span>{label}</span></button>)}</nav>
    {notice && <p className="arcade-notice" role="status">{notice}</p>}
    {gameCreditStatus(game, data.workouts, data.profile).deficit > 0 && <p className="arcade-notice">Ajuste de actividad: {fmt(gameCreditStatus(game, data.workouts, data.profile).deficit)} créditos de compras anteriores ya no están respaldados por tu historial actual. Conservas los objetos; las nuevas ganancias cubren primero este ajuste. Tus movimientos originales siguen intactos.</p>}
    {conversionNotice.count > 0 && <div className="opening-resume-banner" role="status"><Coins size={26}/><div><strong>{conversionNotice.count} {conversionNotice.count === 1 ? 'frase antigua convertida' : 'frases antiguas convertidas'} · +{fmt(conversionNotice.credits)} créditos</strong><p>Las ventas antiguas ya compensadas no añaden créditos. El historial se conserva.</p></div><button onClick={() => void updateGame(acknowledgeQuoteConversions).catch(() => setNotice('Reintenta el guardado del aviso desde la app.'))}>Entendido</button></div>}
    {game.pendingOpening && !openingVisible && <div className="opening-resume-banner"><Gift size={27}/><div><strong>Tu cofre sigue cerrado.</strong><p>La apertura está guardada con la misma recompensa y el mismo débito.</p></div><button onClick={() => setOpeningVisible(true)}>Continuar apertura</button></div>}
    <section key={activeTab} id={`arcade-panel-${activeTab}`} role={tab==='overview'?'region':'tabpanel'} aria-label={tab==='overview'?'Inicio de Arcade':undefined} aria-labelledby={tab==='overview'?undefined:`arcade-tab-${activeTab}`} className="arcade-panel">
      {tab==='overview'&&<ArcadeOverview game={game} progress={currentProgress} missions={missions} muscles={overviewMuscles} levelCrates={allLevelCrates} today={today} effectsEnabled={effectsEnabled} busy={busy||Boolean(game.pendingOpening)} onNavigate={selectTab} onOpenReward={(level,season)=>void buyCrate('level:'+level,level,season)} onResumeOpening={()=>setOpeningVisible(true)}/>}

      {tab === 'goals' && <>
        <div className="arcade-section-head"><div><span className="eyebrow">OBJETIVOS</span><h2>Objetivos de actividad</h2></div><span className="arcade-tag"><Check size={13} /> {missions.filter(mission => mission.complete).length}/{missions.length} completas</span></div>
        <fieldset className={filterStyles.groupFilter}><legend>Mostrar objetivos</legend><div className={filterStyles.groupButtons}>{([{ value: 'all', label: 'Todos' }, { value: 'pending', label: 'Pendientes' }, { value: 'rewarded', label: 'Recompensados' }] as const).map(({ value, label }) => <button type="button" key={value} aria-pressed={missionFilter === value} onClick={() => setMissionFilter(value)}>{label}</button>)}</div></fieldset>
        {(['weekly','career'] as const).map(scope => <MissionCategory key={scope} scope={scope} missions={missions.filter(mission => mission.scope === scope && (missionFilter === 'all' || (missionFilter === 'rewarded' ? mission.rewarded : !mission.rewarded)))}/>)}
        <div className="arcade-section-head"><div><span className="eyebrow">LOGROS</span><h2>Logros de actividad</h2></div><Award size={23} /></div>
        <div className="arcade-achievements">{achievements.map(achievement => <article key={achievement.id} className={achievement.complete ? 'unlocked' : ''}><span>{achievement.complete ? <Trophy size={24} /> : <LockKeyhole size={22} />}</span><div><h3>{achievement.title}</h3><p>{achievement.description}</p><small>{fmt(achievement.current)} / {fmt(achievement.target)} {achievement.unit}</small><ProgressBar value={percent(achievement.current, achievement.target)} label={achievement.title} /></div>{achievement.complete && <Check size={16} />}</article>)}</div>
        {onSettings && <button className="arcade-primary" onClick={onSettings}>Editar mi perfil en Ajustes<ArrowRight size={16}/></button>}
      </>}

      {tab === 'body' && <>
        <div className="arcade-section-head"><div><span className="eyebrow">MAPA MUSCULAR</span><h2>Actividad por músculo</h2></div><label className="mission-filter">Mes muscular<select aria-label="Mes muscular" value={monthChoice} onChange={event => setMonthChoice(event.target.value)}><option value="">{seasonLabel(today.slice(0,7))} · actual</option>{months.filter(month => month !== today.slice(0,7)).map(month => <option key={month} value={month}>{seasonLabel(month)} · histórico</option>)}</select></label></div>
        <div className="arcade-body-grid"><article className="body-map-card" data-side={bodySide}><div className="body-map-top"><span><ActivityDot /> ACTIVIDAD REGISTRADA</span><small>TOCA UN MÚSCULO</small></div><div className="body-view-controls" aria-label="Vista del mapa muscular"><button aria-pressed={bodySide==='front'} onClick={()=>setBodySide('front')}>Frente</button><button aria-pressed={bodySide==='back'} onClick={()=>setBodySide('back')}>Espalda</button></div><div className="body-figures"><BodyFigure back={false} muscles={muscles} selected={selectedMuscle} onSelect={selectMuscle} /><BodyFigure back muscles={muscles} selected={selectedMuscle} onSelect={selectMuscle} /></div><div className="body-legend">{[['#40344f', '0'], ['#7160a0', '0,5–3,5'], ['#b8a0ff', '4–8,5'], ['#d8ff3e', '9+']].map(([color, label]) => <span key={label}><i style={{ background: color }} />{label}</span>)}<small>series equivalentes</small></div></article>
          <aside className="body-detail"><span className="eyebrow">TU FOCO</span><h3>{selected?.label}</h3><div className="muscle-level-panel"><div><span className="eyebrow">{selectedMonth === today.slice(0,7) ? 'TEMPORADA ACTUAL' : 'TEMPORADA HISTÓRICA'}</span><strong>NIVEL {selected?.level ?? 1}</strong><small>{selected?.rank}</small></div><div className="muscle-level-xp"><span>{fmt(selected?.levelXp ?? 0)} / {fmt(selected?.nextLevelXp ?? 500)} XP</span><ProgressBar value={selected?.percent ?? 0} label={'Nivel muscular de ' + selected?.label}/></div><p>{fmt(selected?.xp ?? 0)} XP en {seasonLabel(selectedMonth)}. Reinicio: {seasonBounds(selectedMonth).next}. {fmt(selected?.lifetimeSets ?? 0)} series equivalentes históricas. Nivel de juego basado en lo registrado; no mide condición física.</p></div><div className="body-detail-total" style={{ color: selected?.weightedSets ? activityColor(selected.weightedSets) : '#b59cc8' }}><strong>{fmt(selected?.weightedSets ?? 0)}</strong><span>SERIES EQUIVALENTES<br />{seasonLabel(selectedMonth).toLocaleUpperCase('es-ES')}</span></div><dl><div><dt>Series directas</dt><dd>{selected?.sets ?? 0}</dd></div><div><dt>Participación secundaria</dt><dd>{selected?.secondarySets ?? 0}</dd></div><div><dt>Repeticiones con participación</dt><dd>{fmt(selected?.reps ?? 0)}</dd></div><div><dt>Última actividad</dt><dd>{selected?.lastDate ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${selected.lastDate}T12:00:00Z`)) : 'Sin registrar'}</dd></div></dl><p>1 serie directa = 1 equivalente. Una participación secundaria suma 0,5.</p>{selected?.approximate && <p className="body-approximate">Incluye ejercicios personalizados: la asignación por grupo es aproximada.</p>}<div className="body-detail-hint"><Heart size={17} /><span>El color refleja actividad, no crecimiento ni recuperación muscular.</span></div></aside></div>
        <div className="muscle-list">{muscles.map(muscle => <button key={muscle.id} aria-pressed={selectedMuscle === muscle.id} onClick={() => selectMuscle(muscle.id)}><span className="muscle-list-dot" style={{ background: activityColor(muscle.weightedSets) }} /><span>{muscle.label}<small className="muscle-list-level">NIVEL {muscle.level}</small></span><strong>{fmt(muscle.weightedSets)} <small>series</small></strong><ChevronRight size={15} /></button>)}</div>
      </>}


      {tab === 'crates' && <>
        <div className="arcade-crate-intro"><div><span className="eyebrow">RECOMPENSAS</span><h2>Cofres disponibles</h2><p>Consigue equipo, habilidades y cheesits con tus créditos.</p><div><span><Zap size={14} />5 XP = 1 crédito</span><span><Shirt size={14} />{REWARD_CATEGORY_LABEL}</span></div></div>{game.equippedCompanionId?<CharacterParty game={game} level={currentProgress.level} animated={effectsEnabled} compact/>:<CharacterAvatar game={game} level={currentProgress.level} animated={effectsEnabled} compact/>}</div>
        {allLevelCrates.some(crate => !crate.claimed) && <LevelRewards crates={allLevelCrates} busy={busy || Boolean(game.pendingOpening)} onOpen={(level, season) => void buyCrate('level:' + level, level, season)} />}
        <div className="arcade-crates">{CRATES.map((crate, index) => <article key={crate.id} className={'arcade-crate crate-' + index}><div className="crate-art" aria-hidden="true"><div className="crate-halo" /><CrateArtwork crateId={crate.id}/></div><span className="eyebrow">{index === 0 ? 'COFRE BÁSICO' : index === 1 ? 'COFRE INTERMEDIO' : 'COFRE AVANZADO'}</span><h3>{crate.name}</h3><p>{crate.description}</p><div className="crate-odds">{(Object.keys(RARITIES) as Rarity[]).map(rarity => <span key={rarity} style={rarityStyle(rarity)}><i />{RARITIES[rarity].label}<strong>{crate.odds[rarity]}%</strong></span>)}</div><button className="arcade-primary" disabled={busy || Boolean(game.pendingOpening) || balance < crate.cost} onClick={() => void buyCrate(crate.id)}><PackageOpen size={17} /><span>{busy ? 'Guardando recompensa…' : balance < crate.cost ? 'Necesitas más créditos' : 'Abrir cofre'}</span><strong>{fmt(crate.cost)} <Coins size={14} /></strong></button></article>)}</div>
        <p className="arcade-economy-note"><Coins size={15} />Créditos virtuales. Cada cofre sortea primero la rareza y después equipo o cheesit de esa rareza. Los objetos no se pueden vender. El equipo duplicado añade cargas de habilidad.</p>
      </>}

      {activeTab === 'collection' && <>
        <div className="arcade-section-head"><div><span className="eyebrow">COLECCIÓN</span><h2>{tab==='looks'?'Tu personaje':tab==='abilities'?'Habilidades':'Tu colección'}</h2></div><span className="arcade-tag"><Sparkles size={14}/>{inventory.length} copias</span></div>
        <WardrobeV3 initialPanel={tab==='looks'?'looks':tab==='abilities'?'abilities':'inventory'} onPanelChange={panel=>selectTab(panel==='inventory'?'collection':panel)} game={game} level={currentProgress.level} effectsEnabled={effectsEnabled} soundEnabled={soundEnabled} onChange={updateGame} onNotice={setNotice} onOpenCrates={()=>selectTab('crates')} onResumeOpening={()=>setOpeningVisible(true)}/>
      </>}
      {tab === 'ascent' && <>
        <div className="arcade-ascent-hero"><div><span className="eyebrow">PROGRESO DE NIVEL</span><h2>Ascenso</h2><p>Temporada {selectedYear} · {selectedYear === today.slice(0,4) ? 'actual' : 'histórica'}. {fmt(progress.xp)} XP. Reinicio: {seasonBounds(selectedYear).next}.</p><label className="mission-filter">Año del personaje<select aria-label="Año del personaje" value={yearChoice} onChange={event=>setYearChoice(event.target.value)}><option value="">{today.slice(0,4)} · actual</option>{years.filter(year=>year!==today.slice(0,4)).map(year=><option key={year} value={year}>{year} · histórico</option>)}</select></label><div className="ascent-rank"><Crown size={22} /><span>NIVEL {progress.level}<strong>{levelRank(progress.level)}</strong></span></div><div className="ascent-xp"><span>{progress.level===99?'Nivel máximo':`${fmt(progress.levelXp)} / ${fmt(progress.nextLevelXp)} XP`}</span><strong>{Math.round(progress.percent)}%</strong></div><ProgressBar value={progress.percent} label="Progreso del nivel actual" /></div><div className="ascent-art"><PixelAthlete pose="climb" animated={effectsEnabled} /></div></div>
        <LevelRewards crates={levelCrates} busy={busy || Boolean(game.pendingOpening)} onOpen={(level,season)=>void buyCrate("level:"+level,level,season)}/><div className="ascent-path" aria-label="Camino de niveles">{Array.from({ length: 7 }, (_, index) => Math.max(1, Math.min(93, progress.level - 2)) + index).map(level => <div key={level} className={`ascent-stop ${level < progress.level ? 'passed' : level === progress.level ? 'current' : 'locked'}`}><span>{level < progress.level ? <Check size={20} /> : level === progress.level ? <Footprints size={22} /> : level % 5 === 0 ? <Gift size={22} /> : <LockKeyhole size={18} />}</span><div><small>{level === progress.level ? 'ESTÁS AQUÍ' : level < progress.level ? 'CONQUISTADO' : 'PRÓXIMO ESCALÓN'}</small><strong>Nivel {level}</strong><p>{levelRank(level)}</p></div><small>{fmt(characterLevelThreshold(level))} XP</small></div>)}</div>
        <div className="arcade-xp-rules"><h3><Zap size={19} />Cómo se obtiene XP</h3><div><span>Serie confirmada<strong>30–130 XP</strong></span><span>Entreno finalizado<strong>+200 XP</strong></span><span>Récord personal comparable<strong>+75 XP</strong></span><span>3 grupos musculares en una sesión<strong>+100 XP</strong></span></div><p>Carga, repeticiones y progreso personal ajustan el XP de cada serie. Primer escalón: {fmt(characterLevelThreshold(2))} XP. El nivel 99 requiere {fmt(characterLevelThreshold(99))} XP en el año. Cada nivel del 2 al 99 desbloquea un cofre por temporada, gratis y con equipo garantizado. En el máximo sigues acumulando XP estadístico.</p></div>
      </>}
    </section>
    {openingVisible && (game.pendingOpening || lastPrize) && <CrateOpening game={game} result={lastPrize} effectsEnabled={effectsEnabled} soundEnabled={soundEnabled} onGameChange={updateGame} onFinished={setLastPrize} onClose={()=>{setOpeningVisible(false);setLastPrize(null)}} onEquip={item => { void equipPrize(item).catch(() => setNotice('No se ha confirmado el aspecto. Reintenta desde el aviso de guardado.')); }}/>}
  </div>;
}

function ActivityDot() { return <i className="activity-dot" aria-hidden="true" />; }

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
  const ordered = [...missions].sort((a, b) => Number(a.rewarded) - Number(b.rewarded) || percent(b.current, b.target) - percent(a.current, a.target));
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
  return <article data-mission-id={mission.id} data-mission-scope={mission.scope} data-mission-xp={mission.xp} className={`arcade-mission ${mission.complete ? 'completed' : ''}`}>
    <div className="arcade-mission-top"><span className="arcade-mission-icon">{mission.complete ? <Check size={22}/> : <Target size={22}/>}</span><span>{mission.rewarded ? 'XP CONSEGUIDO' : mission.complete ? 'CONQUISTADA' : 'EN PROGRESO'}</span></div>
    <h3>{mission.title}</h3><p>{mission.description}</p><span className="mission-reward-badge"><Zap size={12}/>+{fmt(mission.xp)} XP{mission.rewarded && <Check size={12}/>}</span>
    <div className="arcade-mission-count"><strong>{fmt(mission.current)}<small> / {fmt(mission.target)}</small></strong><span>{mission.unit}</span></div>
    <ProgressBar value={percent(mission.current, mission.target)} label={mission.title}/>{mission.rewardNote && <p className="mission-reward-note">{mission.rewardNote}</p>}
  </article>;
}

function LevelRewards({ crates, busy, onOpen }: { crates: ReturnType<typeof getLevelCrates>; busy: boolean; onOpen: (level: number, season: string) => void }) {
  const ready=crates.filter(crate=>!crate.claimed), claimed=crates.filter(crate=>crate.claimed);
  const cards=(items:typeof crates)=><div className="level-rewards-grid">{[...items].reverse().map(crate=><article className={'level-reward-card '+(crate.claimed?'is-claimed':'')} key={crate.id}><span className="level-reward-icon">{crate.claimed?<Check size={30}/>:<Gift size={33}/>}</span><div><span className="eyebrow">NIVEL {crate.level}</span><h3>{crate.name}</h3><p>Equipo garantizado · Una recompensa por año y nivel</p><div className="level-reward-odds">{(Object.keys(RARITIES) as Rarity[]).filter(rarity=>crate.odds[rarity]>0).map(rarity=><span key={rarity} style={{color:RARITIES[rarity].color}}>{RARITIES[rarity].label} {crate.odds[rarity]}%</span>)}</div></div><button disabled={busy||crate.claimed} onClick={()=>onOpen(crate.level, crate.season)}>{crate.claimed?'Reclamado':'Abrir gratis'}{!crate.claimed&&<ArrowRight size={15}/>}</button></article>)}</div>;
  return <section className="level-rewards-section"><div className="arcade-section-head"><div><span className="eyebrow">COFRES DE ASCENSO</span><h2>Recompensas por nivel</h2></div><Gift size={23}/></div><p>100% equipo de la rareza sorteada, entre todas las ranuras. Cada copia añade sus cargas de habilidad.</p>{ready.length ? cards(ready) : <div className="level-reward-empty"><LockKeyhole size={22}/><p>{crates.length?'Has reclamado todos tus cofres de ascenso disponibles.':'Los cofres de ascenso se desbloquean a partir del nivel 2, uno por nivel.'}</p></div>}{claimed.length>0&&<details className="more-missions"><summary>Ver {claimed.length} cofres reclamados</summary>{cards(claimed)}</details>}</section>;
}
