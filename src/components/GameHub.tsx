'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react';
import { ArrowRight, Award, Box, Check, ChevronRight, Coins, Crown, Dumbbell, Flame, Footprints, Gift, Heart, LockKeyhole, PackageOpen, Quote as QuoteIcon, Shirt, Sparkles, Star, Target, Trophy, TrendingUp, Zap } from 'lucide-react';
import type { AppData } from '@/lib/model';
import { CRATES, QUOTES, RARITIES, awardMissionRewards, gameProgress, equipItem, equipGearItem, unequipGear, equipCosmetic, equipCompanion, gameBalance, getAchievements, getDailyQuote, getItemDefinition, getLevelCrates, getMissions, normalizeGame, openCrate, openLevelCrate, type GameState, type InventoryItem, type Rarity } from '@/lib/game';
import { GEAR, type GearSlot } from '@/lib/gear';
import { normalizeProfile, type AthleteProfile } from '@/lib/strength';
import { muscleActivity, type MuscleActivity } from '@/lib/muscles';
import { levelRank } from '@/lib/rewards';
import { saveData } from '@/lib/storage';
import { playSound } from '@/lib/sound';
import PixelAthlete from './PixelAthlete';
import CharacterAvatar, { GearSprite, SLOT_LABELS } from './CharacterAvatar';
import WardrobeV3 from './WardrobeV3';
import CrateOpening from './CrateOpening';
import CrateArtwork from './CrateArtwork';
import './game-hub.css';
import { formatCreditBalance, TEST_CREDITS } from '@/lib/test-credits';

type Props = { data: AppData; onChange: Dispatch<SetStateAction<AppData>>; today: string; effectsEnabled: boolean; soundEnabled: boolean; initialTab?: Tab };
type Tab = 'goals' | 'body' | 'crates' | 'collection' | 'ascent';
const tabs: { id: Tab; label: string; Icon: typeof Target }[] = [
  { id: 'goals', label: 'Objetivos', Icon: Target }, { id: 'body', label: 'Cuerpo', Icon: Heart },
  { id: 'crates', label: 'Cofres', Icon: Box }, { id: 'collection', label: 'Colección', Icon: Sparkles }, { id: 'ascent', label: 'Ascenso', Icon: TrendingUp },
];
const fmt = (value: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(value);
const rarityStyle = (rarity: Rarity): CSSProperties => ({ '--rarity': RARITIES[rarity].color } as CSSProperties);
const percent = (current: number, target: number) => Math.min(100, Math.max(0, current / target * 100));

export function DailyMotivation({ data, today }: { data: AppData; today: string }) {
  const game = normalizeGame(data.game);
  const equipped = QUOTES.find(quote => quote.id === game.equippedQuoteId);
  return <aside className="arcade-daily"><div><QuoteIcon size={16} /><span>{equipped ? 'TU LEMA EQUIPADO' : 'TU DOSIS DE HOY'}</span><Sparkles size={15} /></div><blockquote>“{equipped?.text ?? getDailyQuote(today)}”</blockquote><small>{equipped ? `${RARITIES[equipped.rarity].label} · De tu colección` : 'Una nueva frase cada día. Una oportunidad en cada serie.'}</small></aside>;
}

export function GamePreview({ data, today, onOpen }: { data: AppData; today: string; onOpen: () => void }) {
  const game = normalizeGame(data.game);
  const missions = getMissions(data.workouts, today, game);
  return <section className="arcade-preview"><div><span className="eyebrow">EL ESFUERZO TIENE RECOMPENSA</span><h2>Tu siguiente misión.</h2><p>{missions.filter(mission => mission.complete).length} de {missions.length} objetivos conquistados · {fmt(gameBalance(game, data.workouts, data.profile))} créditos</p></div><button onClick={onOpen}><span>Entrar en la zona arcade</span><ArrowRight size={18} /></button></section>;
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  return <div className="arcade-progress" role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${value}%` }} /></div>;
}

type MuscleShape = { id: string; paths: string[] };
const frontMuscles: MuscleShape[] = [
  { id: 'chest', paths: ['M98 80 Q76 68 64 86 L67 106 Q84 117 98 106Z', 'M102 80 Q124 68 136 86 L133 106 Q116 117 102 106Z'] },
  { id: 'shoulders', paths: ['M61 77 Q43 77 39 102 L54 111 65 90Z', 'M139 77 Q157 77 161 102 L146 111 135 90Z'] },
  { id: 'biceps', paths: ['M40 107 Q31 125 34 145 L48 145 54 116Z', 'M160 107 Q169 125 166 145 L152 145 146 116Z'] },
  { id: 'abs', paths: ['M79 115 L98 113 98 133 79 132Z', 'M102 113 L121 115 121 132 102 133Z', 'M79 137 L98 137 98 155 81 155Z', 'M102 137 L121 137 119 155 102 155Z', 'M82 160 L98 159 98 179 88 181Z', 'M102 159 L118 160 112 181 102 179Z'] },
  { id: 'quads', paths: ['M66 206 Q78 196 96 203 L91 271 78 284 63 270Z', 'M134 206 Q122 196 104 203 L109 271 122 284 137 270Z'] },
  { id: 'calves', paths: ['M66 297 Q74 288 85 296 L82 344 70 355 64 338Z', 'M134 297 Q126 288 115 296 L118 344 130 355 136 338Z'] },
];
const backMuscles: MuscleShape[] = [
  { id: 'back', paths: ['M81 67 L98 76 98 109 68 100 65 87Z', 'M119 67 L102 76 102 109 132 100 135 87Z', 'M65 105 L98 114 98 169 82 178 74 147Z', 'M135 105 L102 114 102 169 118 178 126 147Z'] },
  { id: 'shoulders', paths: ['M61 77 Q43 77 39 102 L54 111 65 90Z', 'M139 77 Q157 77 161 102 L146 111 135 90Z'] },
  { id: 'triceps', paths: ['M40 107 Q31 125 34 145 L48 145 54 116Z', 'M160 107 Q169 125 166 145 L152 145 146 116Z'] },
  { id: 'glutes', paths: ['M73 184 Q87 174 98 185 L97 215 Q79 225 65 209Z', 'M127 184 Q113 174 102 185 L103 215 Q121 225 135 209Z'] },
  { id: 'hamstrings', paths: ['M66 218 Q81 232 96 221 L91 272 78 284 63 270Z', 'M134 218 Q119 232 104 221 L109 272 122 284 137 270Z'] },
  { id: 'calves', paths: ['M66 297 Q74 288 85 296 L82 344 70 355 64 338Z', 'M134 297 Q126 288 115 296 L118 344 130 355 136 338Z'] },
];
function activityColor(value: number) { return value === 0 ? '#40344f' : value < 4 ? '#7160a0' : value < 9 ? '#b8a0ff' : '#d8ff3e'; }

function BodyFigure({ back, muscles, selected, onSelect }: { back: boolean; muscles: MuscleActivity[]; selected: string; onSelect: (id: string) => void }) {
  return <div className="body-figure"><span>{back ? 'POSTERIOR' : 'ANTERIOR'}</span><svg viewBox="0 0 200 400" aria-label={back ? 'Mapa muscular posterior' : 'Mapa muscular anterior'}>
    <g className="body-outline"><ellipse cx="100" cy="32" rx="20" ry="25" /><path d="M88 54 L88 64 64 76 Q45 73 35 101 L29 146 24 173 20 197 Q20 209 29 207 L40 184 52 149 60 121 69 161 63 198 58 251 61 284 58 334 62 367 79 368 88 326 91 291 100 246 109 291 112 326 121 368 138 367 142 334 139 284 142 251 137 198 131 161 140 121 148 149 160 184 171 207 Q180 209 180 197 L176 173 171 146 165 101 Q155 73 136 76 L112 64 112 54" /><path d="M62 367 L59 382 Q68 389 83 382 L79 368 M121 368 L117 382 Q132 389 141 382 L138 367" /></g>
    {(back ? backMuscles : frontMuscles).map(shape => { const activity = muscles.find(muscle => muscle.id === shape.id); return <g key={shape.id} className={`muscle-region ${selected === shape.id ? 'selected' : ''}`} role="button" tabIndex={0} aria-label={`${activity?.label ?? shape.id}: ${activity?.sets ?? 0} series directas, ${activity?.secondarySets ?? 0} secundarias`} aria-pressed={selected === shape.id} onClick={() => onSelect(shape.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(shape.id); } }} style={{ fill: activityColor(activity?.weightedSets ?? 0) }}>{shape.paths.map((path, index) => <path key={index} d={path} />)}</g>; })}
    <path d="M100 187 L100 229" fill="none" stroke="#1e1726" strokeWidth="3" />
  </svg></div>;
}

export default function GameHub({ data, onChange, today, effectsEnabled, soundEnabled, initialTab = 'goals' }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [days, setDays] = useState(7);
  const [selectedMuscle, setSelectedMuscle] = useState('chest');
  const [rarityFilter, setRarityFilter] = useState<Rarity | 'all'>('all');
  const [kindFilter, setKindFilter] = useState<'all' | 'gear' | 'quote'>('all');
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
  const progress = useMemo(() => gameProgress(game, data.workouts, data.profile), [game, data.workouts, data.profile]);
  const missions = useMemo(() => getMissions(data.workouts, today, game), [data.workouts, today, game]);
  const achievements = useMemo(() => getAchievements(data.workouts, data.profile, game), [data.workouts, data.profile, game]);
  const muscles = useMemo(() => muscleActivity(data.workouts, today, days, data.profile), [data.workouts, today, days, data.profile]);
  const levelCrates = useMemo(() => getLevelCrates(game, data.workouts, data.profile), [game, data.workouts, data.profile]);
  const selected = muscles.find(muscle => muscle.id === selectedMuscle) ?? muscles[0];
  const inventory = game.inventory.filter(item => !item.sold && item.id !== game.pendingOpening?.itemId);
  const filteredInventory = inventory.filter(item => (rarityFilter === 'all' || item.rarity === rarityFilter) && (kindFilter === 'all' || (item.gearId ? 'gear' : 'quote') === kindFilter));
  const [workoutGoal, setWorkoutGoal] = useState(game.weeklyWorkoutGoal);
  useEffect(()=>setTab(initialTab),[initialTab]);
  useEffect(() => { setWorkoutGoal(game.weeklyWorkoutGoal); }, [game.weeklyWorkoutGoal]);
  useEffect(() => { mounted.current = true; try { if (sessionStorage.getItem('grind-open-wardrobe')) { setTab('collection'); sessionStorage.removeItem('grind-open-wardrobe'); } } catch {} return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); }, [notice]);

  function updateGame(transform: (current: GameState) => GameState) {
    const latest = dataRef.current;
    const nextGame = transform(normalizeGame(latest.game));
    const next = { ...latest, game: nextGame };
    dataRef.current = next;
    onChange(current => ({ ...current, game: nextGame }));
  }
  function equipPrize(item: InventoryItem) {
    updateGame(current => item.gearId ? equipCosmetic(current,item.gearId) : item.companionId ? equipCompanion(current,item.companionId) : equipItem(current,item.id));
    setNotice(item.gearId ? 'Aspecto equipado para siempre. Activa sus cargas en Habilidades.' : item.companionId ? 'Compañera equipada. La verás junto a tu personaje.' : 'Nuevo lema equipado. Lo verás en tu resumen.');
    if (soundEnabled) playSound('confirm');
  }
  async function buyCrate(crateId: string, level?: number) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setNotice('');
    const latest = dataRef.current;
    const result = level ? openLevelCrate(normalizeGame(latest.game), latest.workouts, level, latest.profile) : openCrate(normalizeGame(latest.game), latest.workouts, crateId, latest.profile);
    if (!result) { setNotice(game.pendingOpening ? 'Termina la apertura pendiente antes de abrir otro cofre.' : 'No puedes abrir este cofre todavía. Revisa tu saldo o tu nivel.'); setBusy(false); lock.current = false; if (soundEnabled) playSound('error'); return; }
    const next = { ...latest, game: result.game };
    // Reserve synchronously in the parent before waiting for disk. Navigating away
    // and remounting must see the spent balance, and cannot reopen the same credit.
    dataRef.current = next;
    onChange(current => ({ ...current, game: result.game }));
    setLastPrize(null); setOpeningVisible(true);
    if (soundEnabled) playSound('crate');
    try {
      await saveData(next);
      if (!mounted.current) return;
      setBusy(false); lock.current = false;
    } catch { if (!mounted.current) return; setBusy(false); lock.current = false; setNotice('Tu recompensa está reservada, pero aún no se ha confirmado el guardado. Mantén abierta la app.'); if (soundEnabled) playSound('error'); }
  }

  return <div className={`game-hub ${effectsEnabled ? '' : 'game-hub-quiet'}`}>
    <header className="arcade-header"><div><span className="eyebrow"><Zap size={12} /> TU ESFUERZO, EN OTRO NIVEL</span><h1>Zona arcade<span>✦</span></h1><p>Entrena. Desbloquea. Haz historia.</p></div><div className="arcade-wallet" title={`${fmt(balance)} créditos disponibles`} aria-label={`${fmt(balance)} créditos disponibles`}><Coins size={21} /><div><strong>{formatCreditBalance(balance)}</strong><small>CRÉDITOS</small></div></div></header>
    {TEST_CREDITS>0&&<p className="arcade-notice test-credit-banner">MODO PRUEBAS · {new Intl.NumberFormat('es-ES').format(TEST_CREDITS)} créditos temporales extra. Se retirarán para la versión final.</p>}
    <nav className="arcade-tabs" role="tablist" aria-label="Apartados de la zona arcade" onKeyDown={event => {
      if (busy || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = tabs.findIndex(item => item.id === tab);
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      setTab(tabs[target].id); document.getElementById(`arcade-tab-${tabs[target].id}`)?.focus();
    }}>{tabs.map(({ id, label, Icon }) => <button key={id} id={`arcade-tab-${id}`} role="tab" tabIndex={tab === id ? 0 : -1} aria-selected={tab === id} aria-controls={`arcade-panel-${id}`} disabled={busy} onClick={() => { setTab(id); setNotice(''); }}><Icon size={17} /><span>{label}</span></button>)}</nav>
    {notice && <p className="arcade-notice" role="status">{notice}</p>}
    {game.pendingOpening && !openingVisible && <div className="opening-resume-banner"><Gift size={27}/><div><strong>Tu cofre sigue cerrado.</strong><p>La recompensa está a salvo. La rareza y el contenido aún te esperan.</p></div><button onClick={() => setOpeningVisible(true)}>Continuar apertura</button></div>}
    <section key={tab} id={`arcade-panel-${tab}`} role="tabpanel" aria-labelledby={`arcade-tab-${tab}`} className="arcade-panel">
      {tab === 'goals' && <>
        <div className="arcade-section-head"><div><span className="eyebrow">PEQUEÑAS VICTORIAS. PROGRESO REAL.</span><h2>La misión eres tú.</h2></div><span className="arcade-tag"><Check size={13} /> {missions.filter(mission => mission.complete).length}/{missions.length} completas</span></div>
        <div className="mission-xp-summary"><Zap size={18}/><p><strong>{fmt(progress.objectiveXp)} XP ganados con objetivos.</strong> Cada recompensa se suma automáticamente una sola vez. Los objetivos semanales se renuevan cada lunes.</p></div>
        <form className="arcade-goal-editor" onSubmit={event => { event.preventDefault(); updateGame(current => awardMissionRewards({ ...current, weeklyWorkoutGoal: Math.max(1, Math.min(7, Math.round(workoutGoal || 1))) }, dataRef.current.workouts, today)); setNotice('Objetivo de días guardado. Construye una semana que puedas repetir.'); if (soundEnabled) playSound('confirm'); }}><div><Target size={22} /><h3>A tu ritmo.</h3><p>Elige cuántos días quieres entrenar por semana. Descansar también es parte del plan.</p></div><label>Días de entreno por semana<input type="number" min={1} max={7} required value={workoutGoal} onChange={event => setWorkoutGoal(Number(event.target.value))} /></label><button className="arcade-primary" type="submit">Guardar objetivos<Check size={16} /></button></form>
        {(['weekly','career'] as const).map(scope=><section className="mission-category" key={scope} aria-label={scope==='weekly'?'Objetivos semanales':'Objetivos de trayectoria'}><div className="arcade-section-head"><div><span className="eyebrow">{scope==='weekly'?'NUEVA SEMANA. NUEVOS RETOS.':'CADA SESIÓN DEJA HUELLA'}</span><h2>{scope==='weekly'?'Esta semana cuenta.':'Tu camino en el hierro.'}</h2></div><span className="arcade-tag">{missions.filter(mission=>mission.scope===scope&&mission.complete).length}/{missions.filter(mission=>mission.scope===scope).length}</span></div><div className="arcade-missions">{missions.filter(mission=>mission.scope===scope).map((mission, index) => <article key={mission.id} data-mission-id={mission.id} data-mission-scope={mission.scope} data-mission-xp={mission.xp} className={`arcade-mission ${mission.complete ? 'completed' : ''}`} style={{ '--index': Math.min(index,8) } as CSSProperties}><div className="arcade-mission-top"><span className="arcade-mission-icon">{mission.complete ? <Check size={22} /> : index === 0 ? <Dumbbell size={22} /> : index === 1 ? <Flame size={22} /> : <Target size={22} />}</span><span>{mission.rewarded?'XP CONSEGUIDO':mission.complete?'CONQUISTADA':'EN PROGRESO'}</span>{mission.complete && <Sparkles size={16} />}</div><h3>{mission.title}</h3><p>{mission.description}</p><span className="mission-reward-badge"><Zap size={12}/>+{fmt(mission.xp)} XP{mission.rewarded&&<Check size={12}/>}</span><div className="arcade-mission-count"><strong>{fmt(mission.current)}<small> / {fmt(mission.target)}</small></strong><span>{mission.unit}</span></div><ProgressBar value={percent(mission.current, mission.target)} label={mission.title} /></article>)}</div></section>)}
        <div className="arcade-section-head"><div><span className="eyebrow">TU VITRINA</span><h2>Hechos, no excusas.</h2></div><Award size={23} /></div>
        <div className="arcade-achievements">{achievements.map(achievement => <article key={achievement.id} className={achievement.complete ? 'unlocked' : ''}><span>{achievement.complete ? <Trophy size={24} /> : <LockKeyhole size={22} />}</span><div><h3>{achievement.title}</h3><p>{achievement.description}</p><small>{fmt(achievement.current)} / {fmt(achievement.target)} {achievement.unit}</small><ProgressBar value={percent(achievement.current, achievement.target)} label={achievement.title} /></div>{achievement.complete && <Check size={16} />}</article>)}</div>
        <DailyMotivation data={data} today={today} />
        <ProfileEditor profile={data.profile} onSave={profile => { const next={...dataRef.current,profile}; dataRef.current=next; onChange(current=>({...current,profile})); setNotice('Perfil guardado. El XP se adapta a tus marcas y tu peso.'); if(soundEnabled) playSound('confirm'); }}/>
      </>}

      {tab === 'body' && <>
        <div className="arcade-section-head"><div><span className="eyebrow">EL MAPA DE TU ESFUERZO</span><h2>Cada músculo cuenta.</h2></div><div className="arcade-segmented" aria-label="Período de actividad muscular">{[7, 14, 30].map(value => <button key={value} aria-pressed={days === value} onClick={() => setDays(value)}>{value} días</button>)}</div></div>
        <div className="arcade-body-grid"><article className="body-map-card"><div className="body-map-top"><span><ActivityDot /> ACTIVIDAD REGISTRADA</span><small>TOCA UN MÚSCULO</small></div><div className="body-figures"><BodyFigure back={false} muscles={muscles} selected={selectedMuscle} onSelect={setSelectedMuscle} /><BodyFigure back muscles={muscles} selected={selectedMuscle} onSelect={setSelectedMuscle} /></div><div className="body-legend">{[['#40344f', '0'], ['#7160a0', '0,5–3,5'], ['#b8a0ff', '4–8,5'], ['#d8ff3e', '9+']].map(([color, label]) => <span key={label}><i style={{ background: color }} />{label}</span>)}<small>series equivalentes</small></div></article>
          <aside className="body-detail"><span className="eyebrow">TU FOCO</span><h3>{selected?.label}</h3><div className="muscle-level-panel"><div><span className="eyebrow">PROGRESIÓN DE POR VIDA</span><strong>NIVEL {selected?.level ?? 1}</strong><small>{selected?.rank}</small></div><div className="muscle-level-xp"><span>{fmt(selected?.levelXp ?? 0)} / {fmt(selected?.nextLevelXp ?? 500)} XP</span><ProgressBar value={selected?.percent ?? 0} label={'Nivel muscular de ' + selected?.label}/></div><p>{fmt(selected?.lifetimeSets ?? 0)} series equivalentes acumuladas. Más carga y repeticiones también construyen este nivel.</p></div><div className="body-detail-total" style={{ color: selected?.weightedSets ? activityColor(selected.weightedSets) : '#b59cc8' }}><strong>{fmt(selected?.weightedSets ?? 0)}</strong><span>SERIES EQUIVALENTES<br />EN {days} DÍAS</span></div><dl><div><dt>Series directas</dt><dd>{selected?.sets ?? 0}</dd></div><div><dt>Participación secundaria</dt><dd>{selected?.secondarySets ?? 0}</dd></div><div><dt>Repeticiones con participación</dt><dd>{fmt(selected?.reps ?? 0)}</dd></div><div><dt>Última actividad</dt><dd>{selected?.lastDate ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${selected.lastDate}T12:00:00Z`)) : 'Sin registrar'}</dd></div></dl><p>1 serie directa = 1 equivalente. Una participación secundaria suma 0,5.</p>{selected?.approximate && <p className="body-approximate">Incluye ejercicios personalizados: la asignación por grupo es aproximada.</p>}<div className="body-detail-hint"><Heart size={17} /><span>El color refleja actividad, no crecimiento ni recuperación muscular.</span></div></aside></div>
        <div className="muscle-list">{muscles.map(muscle => <button key={muscle.id} aria-pressed={selectedMuscle === muscle.id} onClick={() => setSelectedMuscle(muscle.id)}><span className="muscle-list-dot" style={{ background: activityColor(muscle.weightedSets) }} /><span>{muscle.label}<small className="muscle-list-level">NIVEL {muscle.level}</small></span><strong>{fmt(muscle.weightedSets)} <small>series</small></strong><ChevronRight size={15} /></button>)}</div>
      </>}


      {tab === 'crates' && <>
        <div className="arcade-crate-intro"><div><span className="eyebrow">DE LA SERIE AL SIGUIENTE DROP</span><h2>Un cofre. Mil versiones de ti.</h2><p>Ropa, compañeras, habilidades y frases. Primero gira la rareza; el contenido se descubre después.</p><div><span><Zap size={14} />5 XP = 1 crédito</span><span><Shirt size={14} />55% equipo · 25% frases · 20% compañeras</span></div></div><CharacterAvatar game={game} level={progress.level} animated={effectsEnabled} compact /></div>
        {levelCrates.some(crate => !crate.claimed) && <LevelRewards crates={levelCrates} busy={busy || Boolean(game.pendingOpening)} onOpen={level => void buyCrate('level:' + level, level)} />}
        <div className="arcade-crates">{CRATES.map((crate, index) => <article key={crate.id} className={'arcade-crate crate-' + index}><div className="crate-art" aria-hidden="true"><div className="crate-halo" /><CrateArtwork crateId={crate.id}/></div><span className="eyebrow">{index === 0 ? 'UN NUEVO COMIENZO' : index === 1 ? 'RECARGA TU SIGUIENTE NIVEL' : 'EL DROP MÁS LEGENDARIO'}</span><h3>{crate.name}</h3><p>{crate.description}</p><div className="crate-odds">{(Object.keys(RARITIES) as Rarity[]).map(rarity => <span key={rarity} style={rarityStyle(rarity)}><i />{RARITIES[rarity].label}<strong>{crate.odds[rarity]}%</strong></span>)}</div><button className="arcade-primary" disabled={busy || Boolean(game.pendingOpening) || balance < crate.cost} onClick={() => void buyCrate(crate.id)}><PackageOpen size={17} /><span>{busy ? 'Guardando recompensa…' : balance < crate.cost ? 'Necesitas más créditos' : 'Abrir cofre'}</span><strong>{fmt(crate.cost)} <Coins size={14} /></strong></button></article>)}</div>
        <p className="arcade-economy-note"><Coins size={15} />Créditos virtuales. Cada frase solo puede tocarte una vez. Si ya tienes todas las frases de una rareza, su probabilidad pasa a equipo de esa rareza. Los objetos no se pueden vender. El equipo duplicado añade cargas de habilidad.</p>
      </>}

      {tab === 'collection' && <>
        <div className="arcade-section-head"><div><span className="eyebrow">TU PERSONAJE. TUS REGLAS.</span><h2>El armario del hierro.</h2></div><span className="arcade-tag"><Sparkles size={14}/>{inventory.length} copias</span></div>
        <WardrobeV3 game={game} level={progress.level} effectsEnabled={effectsEnabled} soundEnabled={soundEnabled} onChange={updateGame} onNotice={setNotice} onOpenCrates={()=>setTab('crates')} onResumeOpening={()=>setOpeningVisible(true)}/>
        <DailyMotivation data={data} today={today}/>
      </>}
      {tab === 'ascent' && <>
        <div className="arcade-ascent-hero"><div><span className="eyebrow">NADIE SUBE POR TI</span><h2>Un escalón más.</h2><p>De la primera serie a tu siguiente versión.</p><div className="ascent-rank"><Crown size={22} /><span>NIVEL {progress.level}<strong>{levelRank(progress.level)}</strong></span></div><div className="ascent-xp"><span>{fmt(progress.levelXp)} / {fmt(progress.nextLevelXp)} XP</span><strong>{Math.round(progress.percent)}%</strong></div><ProgressBar value={progress.percent} label="Progreso del nivel actual" /></div><div className="ascent-art"><div className="ascent-staircase" aria-hidden="true">{[0, 1, 2, 3, 4].map(step => <i key={step} style={{ '--step': step } as CSSProperties} />)}</div><PixelAthlete pose="climb" animated={effectsEnabled} /><Gift size={42} className="ascent-chest" /></div></div>
        <LevelRewards crates={levelCrates} busy={busy || Boolean(game.pendingOpening)} onOpen={level=>void buyCrate("level:"+level,level)}/><div className="ascent-path" aria-label="Camino de niveles">{Array.from({ length: 7 }, (_, index) => Math.max(1, progress.level - 2) + index).map(level => <div key={level} className={`ascent-stop ${level < progress.level ? 'passed' : level === progress.level ? 'current' : 'locked'}`}><span>{level < progress.level ? <Check size={20} /> : level === progress.level ? <Footprints size={22} /> : level % 5 === 0 ? <Gift size={22} /> : <LockKeyhole size={18} />}</span><div><small>{level === progress.level ? 'ESTÁS AQUÍ' : level < progress.level ? 'CONQUISTADO' : 'PRÓXIMO ESCALÓN'}</small><strong>Nivel {level}</strong><p>{levelRank(level)}</p></div><small>{fmt(1000 * (level - 1) + 125 * (level - 1) * (level - 2))} XP</small></div>)}</div>
        <div className="arcade-xp-rules"><h3><Zap size={19} />Así se gana cada escalón.</h3><div><span>Serie confirmada<strong>30–130 XP</strong></span><span>Entreno finalizado<strong>+200 XP</strong></span><span>Récord personal comparable<strong>+75 XP</strong></span><span>3 grupos musculares en una sesión<strong>+100 XP</strong></span></div><p>Carga, repeticiones y progreso personal ajustan el XP de cada serie. Primer escalón: 1.000 XP; cada siguiente pide 250 más. Cada nivel desde el 2 desbloquea un cofre propio, gratis y con equipo garantizado.</p></div>
      </>}
    </section>
    {openingVisible && (game.pendingOpening || lastPrize) && <CrateOpening game={game} result={lastPrize} effectsEnabled={effectsEnabled} soundEnabled={soundEnabled} onGameChange={updateGame} onFinished={setLastPrize} onClose={()=>{setOpeningVisible(false);setLastPrize(null)}} onEquip={equipPrize}/>}
  </div>;
}

function ActivityDot() { return <i className="activity-dot" aria-hidden="true" />; }

function LevelRewards({ crates, busy, onOpen }: { crates: ReturnType<typeof getLevelCrates>; busy: boolean; onOpen: (level: number) => void }) {
  return <section className="level-rewards-section"><div className="arcade-section-head"><div><span className="eyebrow">ESTO TE LO HAS GANADO</span><h2>Un nivel. Un cofre propio.</h2></div><Gift size={23}/></div>{crates.length ? <div className="level-rewards-grid">{[...crates].reverse().map(crate=><article className={'level-reward-card '+(crate.claimed?'is-claimed':'')} key={crate.id}><span className="level-reward-icon">{crate.claimed?<Check size={30}/>:<Gift size={33}/>}</span><div><span className="eyebrow">NIVEL {crate.level}</span><h3>{crate.name}</h3><p>Equipo garantizado · Una recompensa por nivel</p><div className="level-reward-odds">{(Object.keys(RARITIES) as Rarity[]).filter(rarity=>crate.odds[rarity]>0).map(rarity=><span key={rarity} style={{color:RARITIES[rarity].color}}>{RARITIES[rarity].label} {crate.odds[rarity]}%</span>)}</div></div><button disabled={busy||crate.claimed} onClick={()=>onOpen(crate.level)}>{crate.claimed?'Reclamado':'Abrir gratis'}{!crate.claimed&&<ArrowRight size={15}/>}</button></article>)}</div>:<div className="level-reward-empty"><LockKeyhole size={22}/><p>Tu primer cofre de ascenso espera en el nivel 2. Después habrá uno nuevo en cada nivel.</p></div>}</section>;
}

function ProfileEditor({profile,onSave}:{profile?:AthleteProfile;onSave:(profile:AthleteProfile)=>void}) {
  const normalized=normalizeProfile(profile);
  const [editing,setEditing]=useState(normalized);
  useEffect(()=>setEditing(normalizeProfile(profile)),[profile]);
  return <form className="athlete-profile-editor" onSubmit={event=>{event.preventDefault();onSave(normalizeProfile(editing))}}><div className="arcade-section-head"><div><span className="eyebrow">TU PUNTO DE PARTIDA</span><h2>El XP también se adapta a ti.</h2></div><Dumbbell size={24}/></div><p>La carga, las repeticiones y tus propias marcas construyen la recompensa de cada serie.</p><div className="athlete-profile-fields"><label>Peso corporal (kg)<input type="number" min={30} max={300} step={.1} required value={editing.weightKg} onChange={event=>setEditing(current=>({...current,weightKg:Number(event.target.value)}))}/></label><label>Altura (cm)<input type="number" min={120} max={230} step={1} required value={editing.heightCm} onChange={event=>setEditing(current=>({...current,heightCm:Number(event.target.value)}))}/></label><label>Edad<input type="number" min={16} max={100} step={1} required value={editing.age} onChange={event=>setEditing(current=>({...current,age:Number(event.target.value)}))}/></label><label>Sexo de referencia<select value={editing.sex} onChange={event=>setEditing(current=>({...current,sex:event.target.value as AthleteProfile['sex']}))}><option value="male">Hombre</option><option value="female">Mujer</option></select></label></div><div className="athlete-profile-foot"><p>Referencias orientativas del juego según tu peso; no son percentiles de población. Tu progreso se compara con tus propias sesiones. Edad, altura y sexo se guardan como perfil, sin multiplicadores inventados.</p><button className="arcade-primary" type="submit">Guardar perfil<Check size={16}/></button></div><small>En mancuernas, introduce el peso de una sola mancuerna. En barra, introduce barra y discos juntos.</small></form>;
}
