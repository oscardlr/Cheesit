'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react';
import { ArrowRight, Award, Box, Check, ChevronRight, Coins, Crown, Dumbbell, Footprints, Gift, Heart, LockKeyhole, PackageOpen, Shirt, Sparkles, Target, Trophy, TrendingUp, Zap } from 'lucide-react';
import type { AppData } from '@/lib/model';
import { CRATES, RARITIES, REWARD_CATEGORY_LABEL, awardMissionRewards, gameProgress, equipCosmetic, equipCompanion, gameBalance, gameCreditStatus, getAchievements, getLevelCrates, getMissions, normalizeGame, progressionSeasons, openCrate, openLevelCrate, type GameState, type InventoryItem, type Rarity } from '@/lib/game';
import { normalizeProfile, type AthleteProfile } from '@/lib/strength';
import { muscleActivity, type MuscleActivity } from '@/lib/muscles';
import { todayMadrid } from '@/lib/dates';
import { characterLevelThreshold, seasonBounds, seasonLabel } from '@/lib/seasons';
import { levelRank } from '@/lib/rewards';
import { playSound } from '@/lib/sound';
import PixelAthlete from './PixelAthlete';
import CharacterAvatar from './CharacterAvatar';
import WardrobeV3 from './WardrobeV3';
import CrateOpening from './CrateOpening';
import CrateArtwork from './CrateArtwork';
import './game-hub.css';
import { formatCreditBalance, TEST_CREDITS } from '@/lib/test-credits';
import { acknowledgeQuoteConversions, quoteConversionNotice } from '@/lib/quote-conversion';
import type { Mission } from '@/lib/objectives';

type Props = { data: AppData; onChange: Dispatch<SetStateAction<AppData>>; today: string; effectsEnabled: boolean; soundEnabled: boolean; initialTab?: Tab; onPersist: (next: AppData) => Promise<void>; onSettings?: () => void };
type Tab = 'goals' | 'body' | 'crates' | 'collection' | 'ascent';
const tabs: { id: Tab; label: string; Icon: typeof Target }[] = [
  { id: 'goals', label: 'Objetivos', Icon: Target }, { id: 'body', label: 'Cuerpo', Icon: Heart },
  { id: 'crates', label: 'Cofres', Icon: Box }, { id: 'collection', label: 'Colección', Icon: Sparkles }, { id: 'ascent', label: 'Ascenso', Icon: TrendingUp },
];
const fmt = (value: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(value);
const rarityStyle = (rarity: Rarity): CSSProperties => ({ '--rarity': RARITIES[rarity].color } as CSSProperties);
const percent = (current: number, target: number) => Math.min(100, Math.max(0, current / target * 100));

export function GamePreview({ data, today, onOpen }: { data: AppData; today: string; onOpen: () => void }) {
  const game = normalizeGame(data.game);
  const missions = getMissions(data.workouts, today, game);
  return <section className="arcade-preview"><div><span className="eyebrow">ZONA ARCADE</span><h2>Objetivos y recompensas</h2><p>{missions.filter(mission => mission.complete).length} de {missions.length} objetivos completados · {fmt(gameBalance(game, data.workouts, data.profile))} créditos</p></div><button onClick={onOpen}><span>Entrar en la zona arcade</span><ArrowRight size={18} /></button></section>;
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

export default function GameHub({ data, onChange, today, effectsEnabled, soundEnabled, initialTab = 'goals', onPersist, onSettings }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [monthChoice, setMonthChoice] = useState('');
  const [yearChoice, setYearChoice] = useState('');
  const selectedMonth = monthChoice || today.slice(0, 7);
  const selectedYear = yearChoice || today.slice(0, 4);
  const [selectedMuscle, setSelectedMuscle] = useState('chest');
  const [avoidCompanionDuplicates, setAvoidCompanionDuplicates] = useState(false);
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
  const levelCrates = useMemo(() => getLevelCrates(game, data.workouts, data.profile, selectedYear), [game, data.workouts, data.profile, selectedYear, today]);
  const years = useMemo(() => progressionSeasons(game, data.workouts, today.slice(0, 4)), [game, data.workouts, today]);
  const months = [...new Set([today.slice(0, 7), ...data.workouts.filter(workout => workout.status !== 'deleted').map(workout => workout.date.slice(0, 7)), ...(game.missionRewards ?? []).map(reward => todayMadrid(new Date(reward.awardedAt)).slice(0,7)), ...game.transactions.map(transaction => todayMadrid(new Date(transaction.createdAt)).slice(0,7))])].sort().reverse();
  const allLevelCrates = useMemo(() => years.flatMap(year => getLevelCrates(game, data.workouts, data.profile, year)), [years, game, data.workouts, data.profile, today]);
  const conversionNotice = quoteConversionNotice(game);
  const selected = muscles.find(muscle => muscle.id === selectedMuscle) ?? muscles[0];
  const inventory = game.inventory.filter(item => (!item.sold && !item.quoteId) && item.id !== game.pendingOpening?.itemId);
  const [workoutGoal, setWorkoutGoal] = useState(game.weeklyWorkoutGoal);
  useEffect(()=>setTab(initialTab),[initialTab]);
  useEffect(() => { setWorkoutGoal(game.weeklyWorkoutGoal); }, [game.weeklyWorkoutGoal]);
  useEffect(() => { mounted.current = true; try { if (sessionStorage.getItem('grind-open-wardrobe')) { setTab('collection'); sessionStorage.removeItem('grind-open-wardrobe'); } } catch {} return () => { mounted.current = false; }; }, []);
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
    const result = level ? openLevelCrate(normalizeGame(latest.game), latest.workouts, level, latest.profile, {}, season) : openCrate(normalizeGame(latest.game), latest.workouts, crateId, latest.profile, { avoidCompanionDuplicates });
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

  return <div className={`game-hub ${effectsEnabled ? '' : 'game-hub-quiet'}`}>
    <header className="arcade-header"><div><span className="eyebrow"><Zap size={12} /> UNIVERSO RPG</span><h1>Zona arcade<span>✦</span></h1><p>Consulta objetivos, actividad y recompensas.</p></div><div className="arcade-wallet" title={`${fmt(balance)} créditos disponibles`} aria-label={`${fmt(balance)} créditos disponibles`}><Coins size={21} /><div><strong>{formatCreditBalance(balance)}</strong><small>CRÉDITOS</small></div></div></header>
    {TEST_CREDITS>0&&<p className="arcade-notice test-credit-banner">MODO PRUEBAS · {new Intl.NumberFormat('es-ES').format(TEST_CREDITS)} créditos temporales extra. Se retirarán para la versión final.</p>}
    <nav className="arcade-tabs" role="tablist" aria-label="Apartados de la zona arcade" onKeyDown={event => {
      if (busy || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = tabs.findIndex(item => item.id === tab);
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      setTab(tabs[target].id); document.getElementById(`arcade-tab-${tabs[target].id}`)?.focus();
    }}>{tabs.map(({ id, label, Icon }) => <button key={id} id={`arcade-tab-${id}`} role="tab" tabIndex={tab === id ? 0 : -1} aria-selected={tab === id} aria-controls={`arcade-panel-${id}`} disabled={busy} onClick={() => { setTab(id); setNotice(''); }}><Icon size={17} /><span>{label}</span></button>)}</nav>
    {notice && <p className="arcade-notice" role="status">{notice}</p>}
    {gameCreditStatus(game, data.workouts, data.profile).deficit > 0 && <p className="arcade-notice">Ajuste de actividad: {fmt(gameCreditStatus(game, data.workouts, data.profile).deficit)} créditos de compras anteriores ya no están respaldados por tu historial actual. Conservas los objetos; las nuevas ganancias cubren primero este ajuste. Tus movimientos originales siguen intactos.</p>}
    {conversionNotice.count > 0 && <div className="opening-resume-banner" role="status"><Coins size={26}/><div><strong>{conversionNotice.count} {conversionNotice.count === 1 ? 'frase antigua convertida' : 'frases antiguas convertidas'} · +{fmt(conversionNotice.credits)} créditos</strong><p>Las ventas antiguas ya compensadas no añaden créditos. El historial se conserva.</p></div><button onClick={() => void updateGame(acknowledgeQuoteConversions).catch(() => setNotice('Reintenta el guardado del aviso desde la app.'))}>Entendido</button></div>}
    {game.pendingOpening && !openingVisible && <div className="opening-resume-banner"><Gift size={27}/><div><strong>Tu cofre sigue cerrado.</strong><p>La apertura está guardada con la misma recompensa y el mismo débito.</p></div><button onClick={() => setOpeningVisible(true)}>Continuar apertura</button></div>}
    <section key={tab} id={`arcade-panel-${tab}`} role="tabpanel" aria-labelledby={`arcade-tab-${tab}`} className="arcade-panel">
      {tab === 'goals' && <>
        <div className="arcade-section-head"><div><span className="eyebrow">OBJETIVOS</span><h2>Objetivos de actividad</h2></div><span className="arcade-tag"><Check size={13} /> {missions.filter(mission => mission.complete).length}/{missions.length} completas</span></div>
        <div className="mission-xp-summary"><Zap size={18}/><p><strong>{fmt(currentProgress.objectiveXp)} XP ganados con objetivos en {today.slice(0,4)}.</strong> Cada recompensa se suma automáticamente una sola vez. Los objetivos semanales se renuevan cada lunes.</p></div>
        <form className="arcade-goal-editor" onSubmit={async event => { event.preventDefault(); try { await updateGame(current => awardMissionRewards({ ...current, weeklyWorkoutGoal: Math.max(1, Math.min(7, Math.round(workoutGoal || 1))) }, dataRef.current.workouts, today)); setNotice('Objetivo de días guardado. Una recompensa ya obtenida conserva su meta hasta el próximo lunes.'); if (soundEnabled) playSound('confirm'); } catch { setNotice('No se ha confirmado el guardado. Reintenta desde el aviso de la app.'); } }}><div><Target size={22} /><h3>Objetivo semanal</h3><p>Elige cuántos días quieres entrenar por semana.</p></div><label>Días de entreno por semana<input type="number" min={1} max={7} required value={workoutGoal} onChange={event => setWorkoutGoal(Number(event.target.value))} /></label><button className="arcade-primary" type="submit">Guardar objetivos<Check size={16} /></button></form>
        <label className="mission-filter">Mostrar objetivos<select value={missionFilter} onChange={event => setMissionFilter(event.target.value as typeof missionFilter)}><option value="all">Todos</option><option value="pending">Pendientes</option><option value="rewarded">Recompensados</option></select></label>
        {(['weekly','career'] as const).map(scope => <MissionCategory key={scope} scope={scope} missions={missions.filter(mission => mission.scope === scope && (missionFilter === 'all' || (missionFilter === 'rewarded' ? mission.rewarded : !mission.rewarded)))}/>)}
        <div className="arcade-section-head"><div><span className="eyebrow">LOGROS</span><h2>Logros de actividad</h2></div><Award size={23} /></div>
        <div className="arcade-achievements">{achievements.map(achievement => <article key={achievement.id} className={achievement.complete ? 'unlocked' : ''}><span>{achievement.complete ? <Trophy size={24} /> : <LockKeyhole size={22} />}</span><div><h3>{achievement.title}</h3><p>{achievement.description}</p><small>{fmt(achievement.current)} / {fmt(achievement.target)} {achievement.unit}</small><ProgressBar value={percent(achievement.current, achievement.target)} label={achievement.title} /></div>{achievement.complete && <Check size={16} />}</article>)}</div>
        {onSettings && <button className="arcade-primary" onClick={onSettings}>Editar mi perfil en Ajustes<ArrowRight size={16}/></button>}
      </>}

      {tab === 'body' && <>
        <div className="arcade-section-head"><div><span className="eyebrow">MAPA MUSCULAR</span><h2>Actividad por músculo</h2></div><label className="mission-filter">Mes muscular<select aria-label="Mes muscular" value={monthChoice} onChange={event => setMonthChoice(event.target.value)}><option value="">{seasonLabel(today.slice(0,7))} · actual</option>{months.filter(month => month !== today.slice(0,7)).map(month => <option key={month} value={month}>{seasonLabel(month)} · histórico</option>)}</select></label></div>
        <div className="arcade-body-grid"><article className="body-map-card"><div className="body-map-top"><span><ActivityDot /> ACTIVIDAD REGISTRADA</span><small>TOCA UN MÚSCULO</small></div><div className="body-figures"><BodyFigure back={false} muscles={muscles} selected={selectedMuscle} onSelect={setSelectedMuscle} /><BodyFigure back muscles={muscles} selected={selectedMuscle} onSelect={setSelectedMuscle} /></div><div className="body-legend">{[['#40344f', '0'], ['#7160a0', '0,5–3,5'], ['#b8a0ff', '4–8,5'], ['#d8ff3e', '9+']].map(([color, label]) => <span key={label}><i style={{ background: color }} />{label}</span>)}<small>series equivalentes</small></div></article>
          <aside className="body-detail"><span className="eyebrow">TU FOCO</span><h3>{selected?.label}</h3><div className="muscle-level-panel"><div><span className="eyebrow">{selectedMonth === today.slice(0,7) ? 'TEMPORADA ACTUAL' : 'TEMPORADA HISTÓRICA'}</span><strong>NIVEL {selected?.level ?? 1}</strong><small>{selected?.rank}</small></div><div className="muscle-level-xp"><span>{fmt(selected?.levelXp ?? 0)} / {fmt(selected?.nextLevelXp ?? 500)} XP</span><ProgressBar value={selected?.percent ?? 0} label={'Nivel muscular de ' + selected?.label}/></div><p>{fmt(selected?.xp ?? 0)} XP en {seasonLabel(selectedMonth)}. Reinicio: {seasonBounds(selectedMonth).next}. {fmt(selected?.lifetimeSets ?? 0)} series equivalentes históricas. Nivel de juego basado en lo registrado; no mide condición física.</p></div><div className="body-detail-total" style={{ color: selected?.weightedSets ? activityColor(selected.weightedSets) : '#b59cc8' }}><strong>{fmt(selected?.weightedSets ?? 0)}</strong><span>SERIES EQUIVALENTES<br />{seasonLabel(selectedMonth).toLocaleUpperCase('es-ES')}</span></div><dl><div><dt>Series directas</dt><dd>{selected?.sets ?? 0}</dd></div><div><dt>Participación secundaria</dt><dd>{selected?.secondarySets ?? 0}</dd></div><div><dt>Repeticiones con participación</dt><dd>{fmt(selected?.reps ?? 0)}</dd></div><div><dt>Última actividad</dt><dd>{selected?.lastDate ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${selected.lastDate}T12:00:00Z`)) : 'Sin registrar'}</dd></div></dl><p>1 serie directa = 1 equivalente. Una participación secundaria suma 0,5.</p>{selected?.approximate && <p className="body-approximate">Incluye ejercicios personalizados: la asignación por grupo es aproximada.</p>}<div className="body-detail-hint"><Heart size={17} /><span>El color refleja actividad, no crecimiento ni recuperación muscular.</span></div></aside></div>
        <div className="muscle-list">{muscles.map(muscle => <button key={muscle.id} aria-pressed={selectedMuscle === muscle.id} onClick={() => setSelectedMuscle(muscle.id)}><span className="muscle-list-dot" style={{ background: activityColor(muscle.weightedSets) }} /><span>{muscle.label}<small className="muscle-list-level">NIVEL {muscle.level}</small></span><strong>{fmt(muscle.weightedSets)} <small>series</small></strong><ChevronRight size={15} /></button>)}</div>
      </>}


      {tab === 'crates' && <>
        <div className="arcade-crate-intro"><div><span className="eyebrow">RECOMPENSAS</span><h2>Cofres disponibles</h2><p>Equipo con cargas de habilidad y cheesits. Primero gira la rareza; el contenido se descubre después.</p><div><span><Zap size={14} />5 XP = 1 crédito</span><span><Shirt size={14} />{REWARD_CATEGORY_LABEL}</span></div></div><CharacterAvatar game={game} level={currentProgress.level} animated={effectsEnabled} compact /></div>
        {allLevelCrates.some(crate => !crate.claimed) && <LevelRewards crates={allLevelCrates} busy={busy || Boolean(game.pendingOpening)} onOpen={(level, season) => void buyCrate('level:' + level, level, season)} />}
        <label className="crate-reward-choice"><input type="checkbox" checked={avoidCompanionDuplicates} disabled={busy||Boolean(game.pendingOpening)} onChange={event=>setAvoidCompanionDuplicates(event.target.checked)}/><span>Evitar cheesits repetidos<small>Se priorizan los cheesits pendientes de la rareza sorteada. Si ya tienes todos, recibirás equipo de esa rareza. Solo aplica a las próximas compras con esta opción marcada.</small></span></label>
        <div className="arcade-crates">{CRATES.map((crate, index) => <article key={crate.id} className={'arcade-crate crate-' + index}><div className="crate-art" aria-hidden="true"><div className="crate-halo" /><CrateArtwork crateId={crate.id}/></div><span className="eyebrow">{index === 0 ? 'COFRE BÁSICO' : index === 1 ? 'COFRE INTERMEDIO' : 'COFRE AVANZADO'}</span><h3>{crate.name}</h3><p>{crate.description}</p><div className="crate-odds">{(Object.keys(RARITIES) as Rarity[]).map(rarity => <span key={rarity} style={rarityStyle(rarity)}><i />{RARITIES[rarity].label}<strong>{crate.odds[rarity]}%</strong></span>)}</div><button className="arcade-primary" disabled={busy || Boolean(game.pendingOpening) || balance < crate.cost} onClick={() => void buyCrate(crate.id)}><PackageOpen size={17} /><span>{busy ? 'Guardando recompensa…' : balance < crate.cost ? 'Necesitas más créditos' : 'Abrir cofre'}</span><strong>{fmt(crate.cost)} <Coins size={14} /></strong></button></article>)}</div>
        <p className="arcade-economy-note"><Coins size={15} />Créditos virtuales. Cada cofre sortea primero la rareza y después equipo o cheesit de esa rareza. Los objetos no se pueden vender. El equipo duplicado añade cargas de habilidad.</p>
      </>}

      {tab === 'collection' && <>
        <div className="arcade-section-head"><div><span className="eyebrow">COLECCIÓN</span><h2>Inventario y aspectos</h2></div><span className="arcade-tag"><Sparkles size={14}/>{inventory.length} copias</span></div>
        <WardrobeV3 game={game} level={currentProgress.level} effectsEnabled={effectsEnabled} soundEnabled={soundEnabled} onChange={updateGame} onNotice={setNotice} onOpenCrates={()=>setTab('crates')} onResumeOpening={()=>setOpeningVisible(true)}/>
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

function MissionCategory({ scope, missions }: { scope: 'weekly' | 'career'; missions: Mission[] }) {
  const ordered = [...missions].sort((a, b) => Number(a.rewarded) - Number(b.rewarded) || percent(b.current, b.target) - percent(a.current, a.target));
  const focused = ordered.slice(0, 3), remaining = ordered.slice(3);
  return <section className="mission-category" aria-label={scope === 'weekly' ? 'Objetivos semanales' : 'Objetivos de trayectoria'}>
    <div className="arcade-section-head"><h2>{scope === 'weekly' ? 'Objetivos semanales' : 'Objetivos de trayectoria'}</h2><span className="arcade-tag">{missions.filter(mission => mission.complete).length}/{missions.length}</span></div>
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

export function ProfileEditor({profile,onSave,data}:{profile?:AthleteProfile;onSave:(profile:AthleteProfile)=>void | Promise<void>;data?:AppData}) {
  const normalized=normalizeProfile(profile);
  const [editing,setEditing]=useState(normalized);
  const [profileNotice,setProfileNotice]=useState('');
  const previousXp=data ? gameProgress(normalizeGame(data.game),data.workouts,profile).xp : 0;
  const nextXp=data ? gameProgress(normalizeGame(data.game),data.workouts,editing).xp : 0;
  const previousBalance=data ? gameBalance(normalizeGame(data.game),data.workouts,profile) : 0;
  const nextBalance=data ? gameBalance(normalizeGame(data.game),data.workouts,editing) : 0;
  useEffect(()=>setEditing(normalizeProfile(profile)),[profile]);
  return <form className="athlete-profile-editor" onSubmit={async event=>{event.preventDefault();try{await onSave(normalizeProfile(editing));setProfileNotice('Perfil guardado.')}catch{setProfileNotice('No se ha confirmado el guardado. Reintenta desde el aviso de la app.')}}}><div className="arcade-section-head"><div><span className="eyebrow">TU PUNTO DE PARTIDA</span><h2>El XP también se adapta a ti.</h2></div><Dumbbell size={24}/></div><p>La carga, las repeticiones y tus propias marcas construyen la recompensa de cada serie.</p><div className="athlete-profile-fields"><label>Peso corporal (kg)<input type="number" min={30} max={300} step={.1} required value={editing.weightKg} onChange={event=>setEditing(current=>({...current,weightKg:Number(event.target.value)}))}/></label><label>Altura (cm)<input type="number" min={120} max={230} step={1} required value={editing.heightCm} onChange={event=>setEditing(current=>({...current,heightCm:Number(event.target.value)}))}/></label><label>Edad<input type="number" min={16} max={100} step={1} required value={editing.age} onChange={event=>setEditing(current=>({...current,age:Number(event.target.value)}))}/></label><label>Sexo de referencia<select value={editing.sex} onChange={event=>setEditing(current=>({...current,sex:event.target.value as AthleteProfile['sex']}))}><option value="male">Hombre</option><option value="female">Mujer</option></select></label></div><p className="profile-economy-impact" role="status">{data && nextXp!==previousXp ? `Con las reglas actuales, este cambio recalcula tu historial: ${fmt(nextXp-previousXp)} XP y ${fmt(nextBalance-previousBalance)} créditos disponibles. Guardar confirma ese ajuste.` : 'El peso corporal participa en las reglas actuales de XP; cambiarlo puede recalcular el historial. La propuesta para congelar recompensas históricas aún no está activada.'}</p>{profileNotice&&<p role="status">{profileNotice}</p>}<div className="athlete-profile-foot"><p>Referencias orientativas del juego según tu peso; no son percentiles de población. Tu progreso se compara con tus propias sesiones. Edad, altura y sexo se guardan como perfil, sin multiplicadores inventados.</p><button className="arcade-primary" type="submit">Guardar perfil<Check size={16}/></button></div><small>En mancuernas, introduce el peso de una sola mancuerna. En barra, introduce barra y discos juntos.</small></form>;
}
