'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import { Activity, Archive, BookOpen, ClipboardList, Copy, Play, ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronLeft, ChevronRight, CircleCheck, Dumbbell, Flame, Layers, LayoutDashboard, LockKeyhole, Plus, RotateCcw, Rss, Settings2, Sparkles, Target, Trophy, Zap } from 'lucide-react';
import Celebration, { type CelebrationEvent } from './Celebration';
import ArcadeExperience from './ArcadeExperience';
import GameHub, { type ArcadeView } from './GameHub';
import { CharacterParty, SLOT_LABELS, appearanceGear } from './CharacterAvatar';
import { scrollViewToTop } from '@/lib/scroll-view';
import BodyWeightProgress from './BodyWeightProgress';
import MuscleProgress from './MuscleProgress';
import PublicationEditor from './PublicationEditor';
import SectionCards from './SectionCards';
import CyclePanel from './CyclePanel';
import WeeklySummary from './WeeklySummary';
import ProgressWords from './ProgressWords';
import { advanceCycle, captureMoments, completesRound, hasWorkSets, nextCycleRoutine, observeWeeklyGoal, recoverMoments, type RoutineCycle } from '@/lib/training-features';
import './training-features.css';
import SessionEditor from './SessionEditor';
import RoutineEditor from './RoutineEditor';
import RoutineIcon from './RoutineIcon';
import PersonalProfile from './PersonalProfile';
import ObjectivesPanel from './ObjectivesPanel';
import { same } from '@/lib/remote/document';
import ProfileMenu from './ProfileMenu';
import SocialPanel from './SocialPanel';
import WorkoutFeed from './WorkoutFeed';
import { ActivityPrivacy } from './SocialActivity';
import GymSettings from './GymSettings';
import { EMPTY_PERSONAL_PROFILE } from '@/lib/personal-profile';
import Notifications, { NotificationButton, useNotifications } from './Notifications';
import WorkoutDetailContent from './WorkoutDetailContent';
import type { SocialRoute } from '@/lib/remote/social';
import ExerciseThumbnail from './ExerciseThumbnail';
import CheesitPassive, { WorkoutCheesitReward } from './CheesitPassive';
import { COMPANIONS } from '@/lib/companions';
import { applyWorkoutPassive, snapshotWorkoutPassive } from '@/lib/cheesit-passives';
import './block-one.css';
import ProgressPanel from './ProgressPanel';
import ExerciseLibrary from './ExerciseLibrary';
import './training-improvements.css';
import OfflineShell from './OfflineShell';
import Starburst from './Starburst';
import './ux-redesign.css';
import './product-redesign.css';
import './training-navigation.css';
import './workout-feed.css';
import './workout-publication.css';
import './gym-settings.css';
import { effectiveLoad, exerciseLoadConvention, normalizeProfile } from '@/lib/strength';
import { applyWorkoutAbility, awardMissionRewards, gameProgress, gameBalance, activityEconomyAdjustment, getAchievements, getMissions, normalizeGame, reconcileSeasonProgression } from '@/lib/game';
import { missionRewardXp } from '@/lib/objectives';
import { playSound } from '@/lib/sound';
import './gamification-integration.css';
import './summary-character.css';
import './character-static.css';
import './account-reset.css';
import { isPersonalRecord, levelRank, workoutReward, setReward, WORKOUT_XP } from '@/lib/rewards';
import { CATALOG } from '@/lib/catalog';
import { calendarMonth, isCivilDate, todayMadrid } from '@/lib/dates';
import { assertBackupPhotoReferences, createBackup, previewBackup, type BackupPreview } from '@/lib/backup';
import { comparableSets, totals } from '@/lib/metrics';
import { COLORS, DEFAULT_ROUTINE_ICON, WORKOUT_COLOR, copiedName, exerciseSnapshot, validPlannedSets, validRoutinePrescription, newId, newSet, newWorkout, parseWeight, isWorkSet, validSet, type AppData, type Exercise, type Routine, type Workout, type WorkoutExercise, type WorkoutPublication, type WorkoutSet } from '@/lib/model';
import { watchSeasonClock, seasonBounds } from '@/lib/seasons';
import { StorageConflictError } from '@/lib/storage';
import { syncStatusLabel } from '@/lib/remote/account-store';


import type { AppStore } from '@/lib/guest-store';

const GROUPS = ['Pecho', 'Espalda', 'Pierna y glúteo', 'Hombro', 'Bíceps', 'Tríceps', 'Abdominales'];
const EMPTY: AppData = { routines: [], workouts: [], customExercises: [] };
type Screen = 'summary' | 'feed' | 'train' | 'plans' | 'publish' | 'routines' | 'start' | 'editor' | 'routine' | 'settings' | 'detail' | 'progress' | 'game' | 'catalog' | 'profile' | 'objectives' | 'social' | 'notifications';
type GameTab=ArcadeView;
type ProgressView = 'history' | 'records' | 'body';
const progressViews = [{ id: 'history', label: 'Historial' }, { id: 'records', label: 'Marcas' }, { id: 'body', label: 'Cuerpo' }] as const;
const sectionFor = (screen: Screen) => {
  if (['start', 'editor', 'routine', 'routines', 'catalog', 'plans'].includes(screen)) return 'train';
  if (screen === 'detail' || screen === 'publish') return 'progress';
  if (screen === 'social' || screen === 'notifications') return 'feed';
  return screen;
};
const pageTitles: Record<Screen, string> = {
  summary: 'Inicio', feed: 'Comunidad', train: 'Entrenar', plans: 'Planes de entrenamiento',
  publish: 'Publicación', routines: 'Mis rutinas', start: 'Empezar entreno', editor: 'En sesión',
  routine: 'Tu rutina', detail: 'Entrenamiento', progress: 'Progreso', game: 'Arcade',
  catalog: 'Catálogo de ejercicios', settings: 'Ajustes', profile: 'Mi perfil', objectives: 'Objetivos', social: 'Personas', notifications: 'Notificaciones',
};

const dateLabel = (s: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }) => isCivilDate(s)?new Intl.DateTimeFormat('es-ES', { ...options, timeZone: 'UTC' }).format(new Date(`${s}T12:00:00Z`)):'Fecha pendiente';
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const shift = (date: string, days: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return dayKey(d); };
const monthShift = (date: string, amount: number) => { const d = new Date(`${date.slice(0, 7)}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + amount); return dayKey(d); };
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const number = (n: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(n);
const icon = (name: string) => ({ summary: <LayoutDashboard size={20}/>, calendar: <CalendarDays size={20}/>, routines: <Dumbbell size={20}/>, settings: <Settings2 size={20}/>, back: <ChevronLeft size={20}/>, next: <ChevronRight size={20}/>, check: <Check size={20}/> }[name] || name);

const STARTERS = [
 { name: 'Tren superior', label: 'TREN SUPERIOR', description: 'Pecho, espalda y hombro', color: COLORS[3], exercises: ['press-banca-barra', 'jalon-pecho', 'press-hombros-mancuernas', 'curl-barra'] },
 { name: 'Tren inferior', label: 'TREN INFERIOR', description: 'Pierna y glúteo, a tu ritmo', color: COLORS[1], exercises: ['sentadilla-barra', 'peso-muerto-rumano', 'hip-thrust', 'elevacion-gemelos'] },
];

function Back({onClick, title, right}: {onClick:()=>void; title:string; right?:React.ReactNode}) { return <header className="page-header"><button className="icon-button back" aria-label="Volver" onClick={onClick}>‹</button><h1>{title}</h1>{right || <span className="header-spacer"/>}</header>; }
function Modal({title, onClose, children}: {title:string; onClose:()=>void; children:React.ReactNode}) {
 const modalRef=useRef<HTMLElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';(modalRef.current?.querySelector<HTMLElement>('input')||modalRef.current?.querySelector<HTMLElement>('button'))?.focus();return()=>{document.body.style.overflow=overflow;previous?.focus()}},[]);
 return <div className="modal-shade" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}} onKeyDown={e=>{if(e.key==='Escape')onClose();if(e.key==='Tab'){const items=Array.from(modalRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not([hidden]),select,textarea,a[href],summary')||[]).filter(el=>el.getClientRects().length>0);if(!items.length)return;const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}}}><section ref={modalRef} className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><div><h2>{title}</h2></div><button className="icon-button" aria-label="Cerrar" onClick={onClose}>×</button></div>{children}</section></div>;
}
function periodBounds(kind:'week'|'month', anchor:string, today:string) {
 const d = new Date(`${anchor}T12:00:00Z`);
 if(kind === 'month') { const start = `${anchor.slice(0,7)}-01`; const end = dayKey(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0,12))); return {start,end:anchor.slice(0,7)===today.slice(0,7)?today:end}; }
 const dow=(d.getUTCDay()+6)%7; const start=shift(anchor,-dow); const end=shift(start,6); return {start,end:today>=start&&today<=end?today:end};
}

export default function EntrenosApp({ store, accountSettings, guest = false, username, accountOwner, onSignOut }: { onSignOut?: () => Promise<boolean>; store: AppStore; accountSettings: React.ReactNode; guest?: boolean; username?: string; accountOwner?: string }) {
 const { loadData, saveData, stageData, flushData, hasPendingData, subscribeStorageChanges } = store;
 const [data,setDataState] = useState<AppData>(EMPTY); const [loaded,setLoaded] = useState(false); const [saveState,setSaveState] = useState('Cargando datos…');
 const currentData=useRef(data);
 const setData=(update:SetStateAction<AppData>)=>{const proposed=typeof update==='function'?update(currentData.current):update;if(proposed===currentData.current)return;const next=observeWeeklyGoal({...proposed,game:reconcileSeasonProgression(normalizeGame(proposed.game),proposed.workouts,proposed.profile)});currentData.current=next;stageData(next);setDataState(next)};
 const [busy,setBusy]=useState(false);const busyRef=useRef(false);const failedFinish=useRef<Workout|null>(null);const [finishPending,setFinishPending]=useState(false);const [saveError,setSaveError]=useState('');const [storageConflict,setStorageConflict]=useState(false);
 const [pendingNavigation,setPendingNavigation]=useState<(()=>void)|null>(null);const routineOriginal=useRef('');
 const [importPreview,setImportPreview]=useState<BackupPreview|null>(null);const [importRaw,setImportRaw]=useState<unknown>(null);const [importResolutions,setImportResolutions]=useState<Record<string,'local'|'incoming'|'duplicate'>>({});
 const [navigationReady,setNavigationReady]=useState(false);const lastHash=useRef('');const restoreSource=useRef<string|null>(null);const [routeRevision,refreshRoute]=useState(0);const restoreRouteRef=useRef<(hash:string)=>void>(()=>undefined);
 const notificationFeed = useNotifications(guest ? undefined : accountOwner);
 const [socialRoute,setSocialRoute] = useState<SocialRoute>({owner:null,list:null,query:''});
 const [peopleQuery,setPeopleQuery] = useState<string|null>(null);
 const [detailReturn,setDetailReturn]=useState<'profile'|'progress'|'summary'>('progress');
 const [substituteId,setSubstituteId]=useState<string|null>(null);const [progressReturn,setProgressReturn]=useState<Screen>('summary');
 const reportSaveError=(error:unknown)=>{const text=error instanceof Error?error.message:'No se ha podido guardar en este dispositivo.';setSaveError(text);setSaveState('Error: cambios pendientes de guardar');if(error instanceof StorageConflictError)setStorageConflict(true)};
 const persistData=async(next:AppData)=>{setData(next);const version=++saveVersion.current;setSaveState('Guardando…');try{await saveData(currentData.current);completeRecoveredFinish(currentData.current);if(version===saveVersion.current){setSaveState('Guardado local · consulta la sincronización en Ajustes');setSaveError('')}}catch(error){reportSaveError(error);throw error}};
 const persistConfirmedData=async(next:AppData)=>{await persistData(next);await store.flushData();await store.synchronize();if(store.hasUnsynced())throw new Error('El guardado sigue pendiente. Comprueba la conexión o resuelve los conflictos en Ajustes y reintenta.');};
 const syncLabel=guest?'Guardado en este navegador':syncStatusLabel[store.status];
 const [gameTab,setGameTab]=useState<GameTab>('overview');
 const [screen,setScreen] = useState<Screen>('summary'); const [today,setToday] = useState(todayMadrid()); const [anchor,setAnchor] = useState(todayMadrid()); const [period,setPeriod] = useState<'week'|'month'>('week');
 const [month,setMonth] = useState(`${todayMadrid().slice(0,7)}-01`); const [selectedDate,setSelectedDate] = useState(todayMadrid());
 const [editing,setEditing] = useState<Workout|null>(null); const [editingOriginal,setEditingOriginal] = useState<Workout|null>(null); const [routineEdit,setRoutineEditState] = useState<Routine|null>(null); const [detailId,setDetailId] = useState<string|null>(null); const [progressId,setProgressId] = useState<string|null>(null);
 const [progressView,setProgressView] = useState<ProgressView>('history');
 const [savedWorkout,setSavedWorkout] = useState<string|null>(null);
 const [publicationNotice,setPublicationNotice] = useState<{id:string;text:string}|null>(null);
 const starting=useRef(false);
 useEffect(()=>{starting.current=false},[screen]);
 useLayoutEffect(()=>{
  if(screen!=='editor'&&screen!=='publish')return;
  const keepOpen=(event:Event)=>event.preventDefault();
  window.addEventListener('cheesit:before-account-refresh',keepOpen);
  return()=>window.removeEventListener('cheesit:before-account-refresh',keepOpen);
 },[screen]);
 const completeRecoveredFinish=(committed:AppData)=>{const pending=failedFinish.current;if(!pending)return;const found=committed.workouts.find(w=>w.id===pending.id);if(found&&JSON.stringify(found)===JSON.stringify(pending)){failedFinish.current=null;setFinishPending(false);setEditing(null);setEditingOriginal(null);setMessage('');setProgressView('history');setSavedWorkout(pending.id);setDetailId(pending.id);setDetailReturn('progress');setScreen('detail')}};
 const currentRoutine=useRef<Routine|null>(null);
 const setRoutineEdit=(update:SetStateAction<Routine|null>)=>{const previous=currentRoutine.current;const next=typeof update==='function'?update(previous):update;currentRoutine.current=next;setRoutineEditState(next);setData(prev=>{if(!next){if(!previous||!prev.routineDraft)return prev;const {routineDraft:_recovery,...rest}=prev;return rest}return {...prev,routineDraft:{...next,exercises:next.exercises.map(item=>({...item,sets:Number.isFinite(item.sets)?item.sets:null}))}}})};
 const [picker,setPicker] = useState<'workout'|'routine'|null>(null);
 const [startDate,setStartDate] = useState(todayMadrid()); const [startName,setStartName] = useState('Entrenamiento'); const [startRoutine,setStartRoutine] = useState<string>('');
 const [message,setMessage] = useState(''); const importRef = useRef<HTMLInputElement>(null); const firstSave = useRef(true); const saveVersion=useRef(0); const [readError,setReadError]=useState(false);
 const [resetNotice,setResetNotice]=useState('');
 const [celebration,setCelebration]=useState<CelebrationEvent|null>(null); const celebrationId=useRef(0); const rewardedSets=useRef(new Set<string>());
 const [effectsEnabled,setEffectsEnabled]=useState(true); const [soundEnabled,setSoundEnabled]=useState(true); const [preferencesLoaded,setPreferencesLoaded]=useState(false);const preferencesDirty=useRef(false);
 const localPreferences=useRef<{effects:boolean;sound:boolean}|null>(null);
 const profile=useMemo(()=>normalizeProfile(data.profile),[data.profile]);
 const exercises = useMemo(()=>[...CATALOG,...data.customExercises], [data.customExercises]);
 const finished = useMemo(()=>data.workouts.filter(w=>w.status==='finished'),[data.workouts]);
 const recentWorkouts=useMemo(()=>[...finished].sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id)).slice(0,5),[finished]);
 const workFinished=useMemo(()=>finished.filter(hasWorkSets),[finished]);
 const drafts = data.workouts.filter(w=>w.status==='draft').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||b.id.localeCompare(a.id));const draft=drafts[0]; const detail = data.workouts.find(w=>w.id===detailId && w.status==='finished');
 useEffect(()=>{let active=true;void loadData().then(async value=>{if(!active)return;const hydrated=observeWeeklyGoal(recoverMoments(value));currentData.current=hydrated;setDataState(hydrated);const preferences=value.preferences??localPreferences.current;if(preferences){setEffectsEnabled(preferences.effects);setSoundEnabled(preferences.sound)}rewardedSets.current=new Set(value.workouts.flatMap(w=>w.exercises.flatMap(e=>e.sets.filter(set=>set.confirmed).map(set=>set.id))));setLoaded(true);if(JSON.stringify(hydrated)!==JSON.stringify(value)){stageData(hydrated);setSaveState('Guardando…');try{await saveData(hydrated);if(active)setSaveState('Guardado local · consulta la sincronización en Ajustes')}catch(error){if(active)reportSaveError(error)}}else setSaveState('Guardado local · consulta la sincronización en Ajustes')}).catch(()=>{if(active){setReadError(true);setSaveState('Error: no se han podido leer los datos locales')}});return()=>{active=false}},[]);
 useEffect(()=>{if(!loaded)return;if(firstSave.current){firstSave.current=false;return}setSaveState('Guardando…');const version=++saveVersion.current;const timer=setTimeout(()=>{void saveData(data).then(()=>{completeRecoveredFinish(data);if(version===saveVersion.current){setSaveState('Guardado local · consulta la sincronización en Ajustes');setSaveError('')}}).catch(error=>{if(version===saveVersion.current)reportSaveError(error)})},250);return()=>clearTimeout(timer)},[data,loaded]);
 useEffect(()=>subscribeStorageChanges(()=>{setStorageConflict(true);setSaveError('Otra pestaña ha guardado cambios. Recupera los cambios de las pestañas antes de continuar.')}),[]);
 useEffect(()=>watchSeasonClock(setToday),[]);
 useEffect(()=>{if(!loaded)return;const latest=currentData.current;const nextGame=reconcileSeasonProgression(normalizeGame(latest.game),latest.workouts,latest.profile,today);if(JSON.stringify(nextGame)!==JSON.stringify(latest.game))setData({...latest,game:nextGame})},[loaded,today]);
 useEffect(()=>{setPreferencesLoaded(true)},[]);
 useEffect(()=>{if(!loaded||!preferencesLoaded||(!currentData.current.preferences&&!preferencesDirty.current))return;setData(prev=>prev.preferences?.effects===effectsEnabled&&prev.preferences?.sound===soundEnabled?prev:{...prev,preferences:{...prev.preferences,effects:effectsEnabled,sound:soundEnabled}})},[loaded,preferencesLoaded,effectsEnabled,soundEnabled]);
 useEffect(()=>{window.scrollTo({top:0,behavior:'instant'});if(loaded){const heading=document.querySelector<HTMLElement>('main h1');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true})}}},[screen,loaded]);
 useEffect(()=>{if(editing && !editingOriginal){setData(prev=>{const current=prev.workouts.find(w=>w.id===editing.id);if(current?.status==='finished')return prev;return {...prev,workouts:current?prev.workouts.map(w=>w.id===editing.id?editing:w):[...prev.workouts,editing]}});}},[editing,editingOriginal]);
 const bounds=periodBounds(period,anchor,today); const periodWorkouts=finished.filter(w=>w.date>=bounds.start && w.date<=bounds.end); const stats=totals(periodWorkouts);
 const previousStart=period==='week'?shift(bounds.start,-7):monthShift(bounds.start,-1); const span=Math.round((Date.parse(`${bounds.end}T12:00:00Z`)-Date.parse(`${bounds.start}T12:00:00Z`))/86400000); const previousMonthEnd=shift(bounds.start,-1); const previousEnd=period==='week'?shift(previousStart,span):[shift(previousStart,span),previousMonthEnd].sort()[0]; const previousStats=totals(finished.filter(w=>w.date>=previousStart&&w.date<=previousEnd));
 const delta=(current:number, previous:number, usable=true)=>{if(!usable||stats.workouts===0||previousStats.workouts===0||previous===0)return 'Sin datos suficientes';const diff=current-previous;return `${diff>=0?'+':''}${number(diff)} · ${diff>=0?'+':''}${number(diff/previous*100)} %`};
 const openStart=(date=today,routine?:Routine)=>{
  setStartDate(date);setStartName(routine?.name??'Entrenamiento');setStartRoutine(routine?.id??'');
  setMessage('');setScreen('start');
 };
 const startWorkout=()=>{ if(starting.current||busyRef.current)return; if(!startName.trim() || startName.trim().length>80){setMessage('Introduce un nombre de hasta 80 caracteres.');return} if(!isCivilDate(startDate) || startDate>today){setMessage('Elige una fecha válida que no sea futura.');return} const routine=data.routines.find(r=>r.id===startRoutine&&!r.archived); if(routine?.exercises.some(item=>!validPlannedSets(item.sets)||!validRoutinePrescription(item))){setMessage('Revisa la rutina: series enteras de 1 a 20 y objetivos válidos.');return}starting.current=true;const w=newWorkout(routine,exercises,profile,game); w.abilityId=game.activeAbilityId??null;w.date=startDate;w.name=startName.trim();setEditingOriginal(null);setEditing(w);setScreen('editor');setMessage(''); };
 const continueDraft=(id?:string)=>{const found=id?currentData.current.workouts.find(w=>w.id===id&&w.status==='draft'):draft;if(found){setEditingOriginal(null);setEditing(structuredClone(found));setScreen('editor');setMessage('')}};
 const updateEditing=(fn:(w:Workout)=>Workout)=>setEditing(w=>w?fn(w):w);
 const updateExercise=(id:string, fn:(e:WorkoutExercise)=>WorkoutExercise)=>updateEditing(w=>({...w,updatedAt:new Date().toISOString(),exercises:w.exercises.map(e=>e.id===id?fn(e):e)}));
 const finishWorkout=async()=>{
  if(busyRef.current)return false;
  if(!editing)return;
  if(!editing.name.trim() || editing.name.trim().length>80 || !isCivilDate(editing.date) || editing.date>today){setMessage('Revisa el nombre y la fecha: no se admiten fechas futuras.');return}
  const valid=editing.exercises.flatMap(e=>e.sets.filter(s=>s.confirmed&&validSet(s,e.mode)));
  if(!valid.length){setMessage('Confirma al menos una serie válida antes de guardar.');if(soundEnabled)playSound('error');return}
  const excluded=editing.exercises.flatMap(e=>e.sets.filter(s=>!s.confirmed||!validSet(s,e.mode))).length;
  if(excluded && !window.confirm(`${excluded} ${excluded===1?'serie sin confirmar se excluirá':'series sin confirmar se excluirán'}. ¿Quieres continuar?`))return;
  const prepared:Workout={...editing,publication:editingOriginal ? editingOriginal.publication : {...editing.publication,published:false},name:editing.name.trim(),status:'finished',...(editing.startedAt?{finishedAt:editing.finishedAt??new Date().toISOString()}:{}),updatedAt:new Date().toISOString(),restTimer:undefined,exercises:editing.exercises.map(e=>({...e,sets:e.sets.filter(s=>s.confirmed&&validSet(s,e.mode))})).filter(e=>e.sets.length)};
  const latest=currentData.current;
  const beforeGame=normalizeGame(latest.game);
  const applied=editingOriginal?{game:beforeGame,workout:prepared,reward:prepared.abilityReward??null}:applyWorkoutAbility(beforeGame,prepared,latest.workouts,profile);
  const final=applyWorkoutPassive(applied.workout,latest.workouts,profile);
  const afterWorkouts=latest.workouts.some(w=>w.id===final.id)?latest.workouts.map(w=>w.id===final.id?final:w):[...latest.workouts,final];
  const awardedGame=reconcileSeasonProgression(awardMissionRewards(applied.game,afterWorkouts,today,final.date),afterWorkouts,profile,today);
  const completed=editingOriginal?{...latest,game:awardedGame,workouts:afterWorkouts}:advanceCycle({...latest,game:awardedGame,workouts:afterWorkouts},final);
  const next=editingOriginal?completed:captureMoments(latest,completed,final);
  busyRef.current=true;setBusy(true);
  try{await persistData(next)}catch{failedFinish.current=final;setFinishPending(true);busyRef.current=false;setBusy(false);setMessage('La finalización sigue pendiente. Reintenta el guardado o exporta antes de continuar.');return false}
  busyRef.current=false;setBusy(false);
  if(!editingOriginal){
   const beforeHistory=[...latest.workouts.filter(w=>w.id!==editing.id),editing];
   const afterHistory=[...latest.workouts.filter(w=>w.id!==editing.id),final];
   const payout=workoutReward(final,afterHistory,profile);
   const beforeProgress=gameProgress(beforeGame,beforeHistory,profile),afterProgress=gameProgress(awardedGame,afterHistory,profile);
   const objectiveBonus=missionRewardXp(awardedGame)-missionRewardXp(beforeGame);
   const completedBefore=new Set([...getAchievements(beforeHistory,profile,beforeGame),...getMissions(beforeHistory,today,beforeGame)].filter(m=>m.complete).map(m=>m.id));
   const milestones=[...getAchievements(afterHistory,profile,awardedGame),...getMissions(afterHistory,today,awardedGame)].filter(m=>m.complete&&!completedBefore.has(m.id)).map(m=>m.title);
   setCelebration({id:++celebrationId.current,kind:'workout',xp:payout.bonusXp+objectiveBonus,totalXp:payout.totalXp+objectiveBonus,coins:gameBalance(awardedGame,afterHistory,profile)-gameBalance(beforeGame,beforeHistory,profile),reps:valid.reduce((sum,s)=>sum+(s.reps||0),0),weight:0,combo:valid.length,title:final.name,levelBefore:beforeProgress.level,levelAfter:afterProgress.level,historicalAdjustment:afterProgress.xp-beforeProgress.xp-payout.bonusXp-objectiveBonus,milestones,cheesitReward:final.companionReward,abilityCredits:payout.abilityCredits,abilityUsed:Boolean(applied.reward),breakdown:[{label:'Series confirmadas',xp:payout.setXp},{label:'Sesión completada',xp:payout.finishXp},...(payout.varietyXp?[{label:'Variedad muscular',xp:payout.varietyXp}]:[]),...(payout.recordXp?[{label:`Récords personales (${payout.records})`,xp:payout.recordXp}]:[]),...(payout.abilityXp?[{label:'Habilidad activa',xp:payout.abilityXp}]:[]),...(objectiveBonus?[{label:'Objetivos completados',xp:objectiveBonus}]:[])]});
  }
  if(!editingOriginal){setProgressView('history');setDetailReturn('progress');setSavedWorkout(final.id)}
  setDetailId(final.id);setEditing(null);setEditingOriginal(null);setMessage('');setScreen('detail');return true;
 };
 const confirmSet=async(exercise:WorkoutExercise,set:WorkoutSet)=>{
  if(busyRef.current)return;
  if(set.confirmed||!editing)return;
  const weight=exercise.mode==='bodyweight_reps'?0:set.weight;
  const candidate={...set,weight};
  if(!validSet(candidate,exercise.mode)){setMessage('Introduce una carga entre 0 y 1.000 kg (máximo dos decimales) y repeticiones entre 1 y 1.000.');if(soundEnabled)playSound('error');return}
  const seconds=exercise.restSeconds??editing.defaultRestSeconds??90;
  const after:Workout={...editing,updatedAt:new Date().toISOString(),exercises:editing.exercises.map(ex=>ex.id===exercise.id?{...ex,sets:ex.sets.map(s=>s.id===set.id?{...s,weight,weightText:weight===null?'':String(weight),repsText:String(s.reps),confirmed:true}:s)}:ex),...(editing.autoRest&&completesRound(editing,exercise,set)?{restTimer:{durationSeconds:seconds,remainingSeconds:seconds,endsAt:new Date(Date.now()+seconds*1000).toISOString()}}:{})};
  busyRef.current=true;setBusy(true);setEditing(after);setMessage('');
  if(!editingOriginal){try{await persistData(captureMoments(currentData.current,{...currentData.current,workouts:currentData.current.workouts.some(w=>w.id===after.id)?currentData.current.workouts.map(w=>w.id===after.id?after:w):[...currentData.current.workouts,after]},after))}catch{busyRef.current=false;setBusy(false);setMessage('La serie está pendiente de guardar. Puedes reintentar o exportar.');return}}
  busyRef.current=false;setBusy(false);
  if(set.kind!=='warmup'&&!editingOriginal&&!rewardedSets.current.has(set.id)){
   rewardedSets.current.add(set.id);
   const combo=editing.exercises.flatMap(e=>e.sets).filter(s=>s.confirmed).length+1;
   const beforeHistory=[...data.workouts.filter(w=>w.id!==editing.id),editing];
   const afterHistory=[...data.workouts.filter(w=>w.id!==editing.id),after];
   const payout=setReward(exercise,candidate,beforeHistory,editing.id,editing.date,profile);
   const beforeProgress=gameProgress(game,beforeHistory,profile),afterProgress=gameProgress(game,afterHistory,profile);
   setCelebration({id:++celebrationId.current,kind:'set',reps:set.reps!,weight:weight!,xp:payout.xp,coins:gameBalance(game,afterHistory,profile)-gameBalance(game,beforeHistory,profile),combo,record:isPersonalRecord(exercise,candidate,finished,editing.id,editing.date),levelBefore:beforeProgress.level,levelAfter:afterProgress.level,breakdown:[{label:'Base',xp:payout.baseXp},{label:'Repeticiones',xp:payout.repsXp},{label:'Carga',xp:payout.loadXp},...(payout.progressXp?[{label:'Mejora personal',xp:payout.progressXp}]:[])]});
  }
 };
 const addExercise=(ex:Exercise)=>{if((picker==='workout'&&!substituteId&&(editing?.exercises.length||0)>=50)||(picker==='routine'&&(routineEdit?.exercises.length||0)>=50)){setMessage('El límite es de 50 ejercicios.');setPicker(null);return}if(picker==='workout'){updateEditing(w=>({...w,exercises:substituteId?w.exercises.map(item=>item.id===substituteId?{id:item.id,...exerciseSnapshot(ex,profile),sets:[newSet()]}:item):[...w.exercises,{id:newId(),...exerciseSnapshot(ex,profile),sets:[newSet()]}]}))}else if(picker==='routine')setRoutineEdit(r=>r?{...r,exercises:[...r.exercises,{id:newId(),exerciseId:ex.id,sets:3}]}:r);setSubstituteId(null);setPicker(null)};
 const beginRoutine=(routine:Routine,recovery=false)=>{const pending=currentData.current.routineDraft;if(pending&&(!currentRoutine.current||pending.id!==routine.id)&&!recovery){const restored={...pending,exercises:pending.exercises.map(item=>({...item,sets:item.sets??NaN}))};beginRoutine(restored,true);setMessage('Hay una rutina pendiente de revisar. Guárdala o descártala antes de abrir otra.');return}routineOriginal.current=recovery?JSON.stringify(currentData.current.routines.find(item=>item.id===routine.id)??null):JSON.stringify(routine);setRoutineEdit(routine);setMessage('');setScreen('routine')};
 const newRoutine=()=>beginRoutine({id:newId(),name:'',color:COLORS[0],icon:DEFAULT_ROUTINE_ICON,archived:false,exercises:[]});
 const saveRoutine=async(stay=false)=>{if(!routineEdit||busyRef.current)return false;if(!routineEdit.name.trim()||routineEdit.name.trim().length>80){setMessage('Introduce un nombre de hasta 80 caracteres.');return false}if(routineEdit.exercises.some(item=>!validPlannedSets(item.sets)||!validRoutinePrescription(item))){setMessage('Revisa las series (entero entre 1 y 20), el rango de reps, la carga y el descanso.');return false}const r={...routineEdit,name:routineEdit.name.trim()};busyRef.current=true;setBusy(true);try{const {routineDraft:_recovery,...base}=currentData.current;await persistData({...base,routines:base.routines.some(x=>x.id===r.id)?base.routines.map(x=>x.id===r.id?r:x):[...base.routines,r]});routineOriginal.current=JSON.stringify(r);currentRoutine.current=r;setRoutineEditState(r);setMessage('');if(!stay)setScreen('routines');return true}catch{setMessage('La rutina sigue pendiente de guardar. Reintenta o exporta lo pendiente.');return false}finally{busyRef.current=false;setBusy(false)}};
 const backupSnapshot=()=>{const latest=currentData.current;return {...latest,workouts:editing&&!editingOriginal&&latest.workouts.find(w=>w.id===editing.id)?.status!=='finished'?(latest.workouts.some(w=>w.id===editing.id)?latest.workouts.map(w=>w.id===editing.id?editing:w):[...latest.workouts,editing]):latest.workouts,preferences:{...latest.preferences,effects:effectsEnabled,sound:soundEnabled}}};
 const exportData=()=>{const blob=new Blob([JSON.stringify(createBackup(backupSnapshot()),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`cheesit-${today}.json`;a.click();URL.revokeObjectURL(url);try{localStorage.setItem('cheesit-last-backup',new Date().toISOString())}catch{}};
 const resetAccount=async()=>{
  if(busyRef.current)return;
  if(!window.confirm('¿Estás seguro de que quieres resetear tu cuenta?\n\nSe borrarán todos tus entrenos, borradores, rutinas y ejercicios propios, además de tus XP, niveles, equipo, cheesits y recompensas. Volverás a empezar con 100 créditos.\n\nConservarás tu acceso, tu perfil y tus preferencias. Esta acción no se puede deshacer.'))return;
  busyRef.current=true;setBusy(true);setResetNotice('Reseteando cuenta…');
  let resetSaved=false;
  try{
   const next=await store.resetData();resetSaved=true;
   setEditing(null);setEditingOriginal(null);currentRoutine.current=null;setRoutineEditState(null);routineOriginal.current='';
   failedFinish.current=null;setFinishPending(false);rewardedSets.current.clear();setCelebration(null);setDetailId(null);setProgressId(null);setPicker(null);setStartRoutine('');setMessage('');
   await persistData(next);
   await store.synchronize();
   // An older request may have been in flight when the reset was committed.
   if(store.hasUnsynced())await store.synchronize();
   setResetNotice(store.hasUnsynced()?'Cuenta reseteada en este dispositivo, con 100 créditos. El borrado de la nube sigue pendiente de sincronización.':'Cuenta reseteada. Empiezas de nuevo con 100 créditos.');
  }catch(error){
   setResetNotice(resetSaved?'Cuenta reseteada en este dispositivo, con 100 créditos. El borrado de la nube sigue pendiente: reintenta la sincronización cuando tengas conexión.':`No se ha podido resetear la cuenta. ${error instanceof Error?error.message:'Vuelve a intentarlo.'}`);
  }finally{busyRef.current=false;setBusy(false)}
 };
 const importData=async(file:File)=>{try{const raw:unknown=JSON.parse(await file.text());assertBackupPhotoReferences(raw,guest?undefined:accountOwner);const preview=previewBackup(raw,currentData.current);setImportRaw(raw);setImportResolutions({});setImportPreview(preview);setMessage('')}catch(error){setMessage(`No se ha importado el archivo: ${error instanceof Error?error.message:'archivo no válido'}`)}finally{if(importRef.current)importRef.current.value=''}};
 const resolveImport=(key:string,choice:'local'|'incoming'|'duplicate')=>{const resolutions={...importResolutions,[key]:choice};try{const next=previewBackup(importRaw,currentData.current,resolutions);setImportPreview(next);setImportResolutions(resolutions);setMessage('')}catch(error){setMessage(error instanceof Error?error.message:'Conflicto no válido')}};
 const confirmImport=async()=>{if(!importPreview||importPreview.conflicts.length||busyRef.current)return;busyRef.current=true;setBusy(true);try{assertBackupPhotoReferences(importRaw,guest?undefined:accountOwner);const checked=previewBackup(importRaw,currentData.current,importResolutions);if(checked.conflicts.length){setImportPreview(checked);throw new Error('Revisa los conflictos de la copia antes de importar.')}const next={...checked.merged,game:checked.merged.game};await persistData(next);if(next.preferences){setEffectsEnabled(next.preferences.effects);setSoundEnabled(next.preferences.sound)}setImportPreview(null);setImportRaw(null);setMessage('Importación guardada; consulta la sincronización en Ajustes.')}catch(error){setMessage(error instanceof Error?error.message:'El guardado de la importación sigue pendiente. Reintenta o exporta tus datos.')}finally{busyRef.current=false;setBusy(false)}};
 const game=useMemo(()=>normalizeGame(data.game),[data.game]);
 const detailNormalXp=useMemo(()=>{if(screen!=='detail'||!detail)return 0;const payout=workoutReward(detail,data.workouts,profile);return payout.totalXp-payout.companionXp},[screen,detail,data.workouts,profile]);
 const equippedCheesit=COMPANIONS.find(item=>item.id===game.equippedCompanionId);
 const equippedAppearance=useMemo(()=>appearanceGear(game),[game]);
 const rewards=useMemo(()=>gameProgress(game,data.workouts,profile,today.slice(0,4)),[game,data.workouts,profile,today]);
 const weekStart=periodBounds('week',today,today).start; const weekDays=Array.from({length:7},(_,i)=>shift(weekStart,i));
 const weekCount=new Set(workFinished.filter(w=>w.date>=weekStart&&w.date<=today).map(w=>w.date)).size;
 const startCycle=(cycle:RoutineCycle)=>{
  if(starting.current||busyRef.current)return;
  const next=nextCycleRoutine(currentData.current,cycle);
  if(!next)return;
  const existing=drafts.find(w=>w.cycleLink?.cycleId===cycle.id&&w.cycleLink.position===next.position&&w.cycleLink.routineId===next.routine.id);
  if(existing){continueDraft(existing.id);return}
  starting.current=true;
  const w=newWorkout(next.routine,exercises,profile,game);
  w.cycleLink={cycleId:cycle.id,position:next.position,routineId:next.routine.id};
  w.abilityId=game.activeAbilityId??null;
  setEditingOriginal(null);setEditing(w);setScreen('editor');setMessage('');
 };
 const repeatWorkout=(source:Workout)=>{const now=new Date().toISOString();const copy:Workout=snapshotWorkoutPassive({...source,cycleLink:undefined,publication:undefined,id:newId(),date:today,status:'draft',createdAt:now,updatedAt:now,startedAt:now,finishedAt:undefined,restTimer:undefined,abilityReward:undefined,abilityId:game.activeAbilityId??null,exercises:source.exercises.map(ex=>({...ex,id:newId(),sets:ex.sets.map(set=>({...set,id:newId(),confirmed:false}))}))},game);setEditingOriginal(null);setEditing(copy);setScreen('editor')};
 const routineFromWorkout=(source:Workout)=>{const missing=source.exercises.filter(ex=>!exercises.some(item=>item.id===ex.exerciseId));if(missing.length){setMessage('Hay ejercicios históricos sin ficha. Crea o vincula sus ejercicios antes de convertir la sesión en rutina.');return}beginRoutine({id:newId(),name:source.name.slice(0,80),color:COLORS[1],icon:DEFAULT_ROUTINE_ICON,archived:false,notes:source.notes,exercises:source.exercises.map(ex=>({id:newId(),exerciseId:ex.exerciseId,supersetId:ex.supersetId,setKinds:ex.sets.slice(0,20).map(set=>set.kind??'work'),sets:Math.max(1,Math.min(20,ex.sets.length)),repsMin:ex.repsMin??ex.sets[0]?.reps??undefined,repsMax:ex.repsMax??ex.sets[0]?.reps??undefined,targetWeight:ex.mode==='bodyweight_reps'?0:ex.targetWeight==null&&ex.sets[0]?.weight==null?undefined:Math.round(effectiveLoad(ex,ex.targetWeight??ex.sets[0]?.weight??0,profile)/Math.max(1,exerciseLoadConvention(exerciseSnapshot(exercises.find(item=>item.id===ex.exerciseId)!,profile),profile).effectiveMultiplier)*100)/100,restSeconds:ex.restSeconds,notes:ex.notes}))})};
 const deleteWorkout=async(workout:Workout)=>{const latest=currentData.current;const after=latest.workouts.map(w=>w.id===workout.id?{...w,status:'deleted' as const,updatedAt:new Date().toISOString()}:w);const adjustment=activityEconomyAdjustment(normalizeGame(latest.game),latest.workouts,after,profile);const explanation=`Al eliminar se ajustarán ${number(adjustment.xpDelta)} XP y ${number(adjustment.balanceDelta)} créditos.${adjustment.deficitAfter?` Quedará un ajuste pendiente de ${number(adjustment.deficitAfter)} créditos por actividad eliminada; las próximas ganancias lo compensarán.`:''} Las cargas usadas no se devuelven.`;if(!window.confirm(`¿Eliminar «${workout.name}» del ${dateLabel(workout.date)}? ${explanation}`))return;try{await persistData({...latest,workouts:after});setProgressId(null);setProgressView('history');setScreen('progress')}catch{setMessage('El borrado sigue pendiente de guardar. Reintenta o exporta tus datos.')}};
 const routineDirty=screen==='routine'&&routineEdit!==null&&JSON.stringify(routineEdit)!==routineOriginal.current;
 const guardNavigation=(action:()=>void)=>{if(busyRef.current)return;if(!window.dispatchEvent(new Event('cheesit:before-profile-navigation',{cancelable:true})))return;if(failedFinish.current){setMessage('Reintenta el guardado de la finalización o exporta lo pendiente antes de continuar.');return}if(routineDirty||editingOriginal){setPendingNavigation(()=>action);return}action()};
 const contentRef=useRef<HTMLElement>(null);
 const activateNav=(next:Screen,action:()=>void)=>{
  if(next===screen&&(next!=='game'||gameTab==='overview')&&(next!=='progress'||progressView==='history')&&window.matchMedia('(max-width: 760px)').matches){scrollViewToTop(contentRef.current);return}
  action();
 };
 const navigate=(next:Screen,prepare?:()=>void)=>guardNavigation(()=>{
  setEditing(null);setEditingOriginal(null);setRoutineEdit(null);setMessage('');prepare?.();setScreen(next);
 });
 const openGame=(tab:GameTab)=>navigate('game',()=>setGameTab(tab));
 const openHistory=(date=today)=>navigate('progress',()=>{setProgressView('history');setProgressId(null);setSelectedDate(date);setMonth(`${date.slice(0,7)}-01`)});
 const openDetail=(id:string)=>{setPublicationNotice(null);setDetailReturn('progress');setDetailId(id);setScreen('detail')};
 async function savePublication(id:string,publication:WorkoutPublication){
  if(busyRef.current)return;
  const latest=currentData.current;
  const workout=latest.workouts.find(item=>item.id===id&&item.status==='finished');
  if(!accountOwner||guest||!workout)throw new Error('No se pudo abrir la sesión guardada.');
  busyRef.current=true;
  setBusy(true);
  try {
   const unchanged=same(workout.publication,publication);
   if(!unchanged)await persistData({...latest,workouts:latest.workouts.map(item=>item.id===id?{...item,publication,updatedAt:new Date().toISOString()}:item)});
   await store.flushData();
   await store.synchronize();
   if(store.hasUnsynced())throw new Error('Reintenta cuando recuperes la conexión.');
   setPublicationNotice({id,text:publication.published?'Publicación guardada.':'El entrenamiento está guardado como privado.'});
   setScreen('detail');
  } finally {busyRef.current=false;setBusy(false)}
 }
 const useStarter=(starter:typeof STARTERS[number])=>beginRoutine({id:newId(),name:starter.name,color:starter.color,icon:DEFAULT_ROUTINE_ICON,archived:false,exercises:starter.exercises.map(exerciseId=>({id:newId(),exerciseId,sets:3}))});
 const openProgress=(id:string|null=null,from:Screen=screen)=>guardNavigation(()=>{setProgressReturn(from);setProgressView('records');setProgressId(id);setScreen('progress')});
 useEffect(()=>{const flush=()=>{if(hasPendingData())void flushData().then(()=>{completeRecoveredFinish(currentData.current);setSaveState('Guardado local · consulta la sincronización en Ajustes');setSaveError('')}).catch(reportSaveError)};const visibility=()=>{if(document.visibilityState==='hidden')flush()};const unload=(event:BeforeUnloadEvent)=>{if(routineDirty||editingOriginal||hasPendingData()){flush();event.preventDefault();event.returnValue=''}};const updating=(event:Event)=>{if(routineDirty||editingOriginal){event.preventDefault();setMessage('Guarda o descarta los cambios antes de actualizar.')}};window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',visibility);window.addEventListener('beforeunload',unload);window.addEventListener('cheesit:before-update',updating);return()=>{window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('beforeunload',unload);window.removeEventListener('cheesit:before-update',updating)}},[routineDirty,editingOriginal]);

 const restoreRoute=(hash:string)=>{
  const params=new URLSearchParams(hash.replace(/^#/, ''));
  const route=params.get('view');
  const aliases:Record<string,Screen>={home:'summary',inicio:'summary',community:'feed',comunidad:'feed',calendar:'progress',arcade:'game',training:'train'};
  const view=route&&(aliases[route]??route) as Screen|null;
  if(!view||!Object.hasOwn(pageTitles,view)){setScreen('summary');return}
  const id=params.get('id');
  if(view==='editor'){
   const found=currentData.current.workouts.find(w=>w.id===id&&w.status==='draft');
   if(found)continueDraft(found.id);
   else if(id&&currentData.current.workouts.some(w=>w.id===id&&w.status==='finished'))openDetail(id);
   else setScreen('train');
   return;
  }
  if(view==='routine'){
   const recovery=currentData.current.routineDraft;
   if(recovery?.id===id)beginRoutine({...recovery,exercises:recovery.exercises.map(item=>({...item,sets:item.sets??NaN}))},true);
   else {const found=currentData.current.routines.find(r=>r.id===id);if(found)beginRoutine(structuredClone(found));else setScreen('routines')}
   return;
  }
  if(view==='detail'||view==='publish'){
   const from=params.get('from');
   setDetailReturn(from==='profile'?'profile':from==='summary'?'summary':'progress');
   if(id&&currentData.current.workouts.some(w=>w.id===id&&w.status==='finished')){
    setDetailId(id);setScreen(view==='publish'&&(!accountOwner||guest)?'detail':view);
   }else{setProgressId(null);setProgressView('history');setScreen('progress')}
   return;
  }
  if(view==='social'){
   const list=params.get('list'),owner=params.get('person');
   const from=params.get('from');
   setSocialRoute({owner:owner&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(owner)?owner:null,list:list==='followers'||list==='following'?list:null,query:params.get('q')??'',workout:params.get('workout'),source:from==='notifications'||from==='people'?from:undefined});
  }
  if(view==='start'){
   const date=params.get('date');
   const routine=currentData.current.routines.find(r=>!r.archived&&r.id===params.get('routine'));
   openStart(date&&isCivilDate(date)&&date<=today?date:today,routine);
   return;
  }
  if(view==='progress'){
   const tab=params.get('tab'),date=params.get('date');
   setProgressView(tab==='body'?'body':tab==='records'||id?'records':'history');
   setProgressId(id);
   if(date&&isCivilDate(date)){setSelectedDate(date);setMonth(`${date.slice(0,7)}-01`)}
  }
  if(view==='game'){
   const tab=params.get('tab')||'overview';
   if(tab==='body'){setProgressView('body');setProgressId(null);setScreen('progress');return}
   setGameTab(tab==='collection'?'looks':['overview','goals','crates','ascent','looks','abilities'].includes(tab)?tab as GameTab:'overview');
  }
  setScreen(view);
 };
 const restoreLocation=(hash:string)=>{
  restoreSource.current=window.location.hash;
  restoreRoute(hash);
  refreshRoute(revision=>revision+1);
 };
 restoreRouteRef.current=hash=>{if(busyRef.current||hash===lastHash.current)return;if(!window.dispatchEvent(new Event('cheesit:before-profile-navigation',{cancelable:true}))){window.history.replaceState(null,'',lastHash.current||window.location.pathname);return}const action=()=>restoreLocation(hash);if(routineDirty||editingOriginal){window.history.replaceState(null,'',lastHash.current||window.location.pathname);setPendingNavigation(()=>action)}else action()};
 useEffect(()=>{if(!loaded)return;restoreLocation(window.location.hash);setNavigationReady(true);const pop=()=>restoreRouteRef.current(window.location.hash);window.addEventListener('popstate',pop);window.addEventListener('hashchange',pop);return()=>{window.removeEventListener('popstate',pop);window.removeEventListener('hashchange',pop)}},[loaded]);
 useEffect(()=>{if(!navigationReady)return;
  // A pop during cached-account hydration must win over the route first read.
  if(restoreSource.current!==null&&restoreSource.current!==window.location.hash){restoreLocation(window.location.hash);return}
  const params=new URLSearchParams({view:screen});if(screen==='editor'&&editing&&!editingOriginal)params.set('id',editing.id);if(screen==='routine'&&routineEdit)params.set('id',routineEdit.id);if((screen==='detail'||screen==='publish')&&detailId){params.set('id',detailId);if(detailReturn!=='progress')params.set('from',detailReturn)}if(screen==='start'){params.set('date',startDate);if(startRoutine)params.set('routine',startRoutine)}if(screen==='progress'){params.set('tab',progressView);if(progressView==='records'&&progressId)params.set('id',progressId);if(progressView==='history')params.set('date',selectedDate);}if(screen==='game')params.set('tab',gameTab);if(screen==='social'){if(socialRoute.owner)params.set('person',socialRoute.owner);if(socialRoute.list)params.set('list',socialRoute.list);if(socialRoute.query)params.set('q',socialRoute.query);if(socialRoute.workout)params.set('workout',socialRoute.workout);if(socialRoute.source)params.set('from',socialRoute.source)}const hash=`#${params}`;if(window.location.hash!==hash||restoreSource.current!==null){const previous=new URLSearchParams(lastHash.current.replace(/^#/,''));if(restoreSource.current!==null||(screen==='start'&&previous.get('view')==='start')||(screen==='social'&&!socialRoute.owner&&previous.get('view')==='social'&&!previous.get('person')))window.history.replaceState(null,'',hash);else window.history.pushState(null,'',hash)}restoreSource.current=null;lastHash.current=hash},[navigationReady,routeRevision,screen,editing?.id,editingOriginal?.id,routineEdit?.id,detailId,detailReturn,progressId,progressView,selectedDate,startDate,startRoutine,gameTab,socialRoute.owner,socialRoute.list,socialRoute.query,socialRoute.workout,socialRoute.source]);

 if(readError)return <div className="app-shell"><main className="app-content"><h1>No se han podido leer tus datos</h1><p className="notice">El almacenamiento del navegador no está disponible. No se han sobrescrito tus datos. Comprueba los permisos o vuelve a intentarlo.</p><button className="primary wide" onClick={()=>window.location.reload()}>Reintentar</button></main></div>;
 if(!loaded||!navigationReady)return <div className="app-shell ux-shell"><main className="app-loading" aria-busy="true"><img src="/cheesit-logo.png" alt="Cheesit" width={72} height={48}/><p role="status">Cargando tus entrenamientos…</p><div className="loading-track" aria-hidden="true"/></main></div>;
 if(storageConflict)return <main className="storage-conflict"><h1>Otra pestaña ha guardado cambios</h1><p>Puedes combinar los cambios guardados en las pestañas. Las ediciones incompatibles se conservarán para su revisión.</p><button className="primary" autoFocus onClick={()=>void store.recoverTab().then(()=>window.location.reload()).catch(error=>setSaveError(error.message))}>Recuperar cambios de las pestañas</button><p role="alert">{saveError}</p><button className="secondary" onClick={exportData}>Copia opcional</button><button className="secondary" onClick={()=>window.location.reload()}>Recargar datos actuales</button></main>;
 return <div className={`app-shell ux-shell product-redesign screen-${screen} ${effectsEnabled?'':'effects-disabled'}`}>
 <a className="skip-link" href="#main-content" onClick={event=>{event.preventDefault();document.getElementById('main-content')?.focus()}}>Saltar al contenido</a>
 <aside className="brand-rail"><button className="brand" aria-label="Cheesit, ir a Inicio" onClick={()=>navigate('summary')}><span className="brand-symbol"><img src="/cheesit-logo.png" width={384} height={256} alt="" aria-hidden="true"/></span><span>cheesit<span className="brand-period">.</span></span></button><span className="rail-caption">CADA REP CUENTA.</span><div className="rail-bottom"><span className="rail-account"><Dumbbell size={18}/>{guest?'Modo invitado':username?`@${username}`:'Tu cuenta'}</span><p>{guest?'Guardado en este navegador':'Tu entrenamiento, contigo.'}</p></div></aside>
 <div className="workspace">
 <header className="topbar">
  <div className="topbar-location"><span className="live-dot"/> CHEESIT<span className="topbar-divider">/</span><span className="topbar-page">{pageTitles[screen]}</span></div>
  <div className="topbar-actions">
   <NotificationButton unread={notificationFeed.unread} onOpen={()=>guardNavigation(()=>{setScreen('notifications');void notificationFeed.refresh()})}/>
   <ProfileMenu screen={screen} onNavigate={navigate} photo={data.personalProfile?.photo} onSignOut={onSignOut}/>
  </div>
 </header>
 <OfflineShell flush={flushData}/>
 <main className="app-content" id="main-content" tabIndex={-1} key={screen} ref={contentRef}>
 {(saveError||finishPending)&&<section className="save-error-banner" role="alert"><strong>Cambios pendientes de guardar</strong><p>{saveError||'La finalización está pendiente de confirmar en el dispositivo.'}</p><button className="secondary" onClick={()=>void persistData(currentData.current).catch(()=>undefined)} disabled={storageConflict||busy}>Reintentar guardado</button><button className="text-action" onClick={exportData}>Exportar lo pendiente</button></section>}


 {screen==='settings' && <Back title="Ajustes" onClick={()=>{setMessage('');setScreen('summary')}}/>}
 <div hidden={screen!=='settings'}>{accountSettings}</div>
 {screen==='summary' && <>
 <header className="home-header"><div><span className="eyebrow">{dateLabel(today,{weekday:'long',day:'numeric',month:'long'})}</span><h1>Inicio<span className="home-title-dot" aria-hidden="true">.</span></h1><p>{data.personalProfile?.displayName?`${data.personalProfile.displayName}, cada rep cuenta.`:'Cada rep cuenta.'}</p></div><button className="text-action desktop-history" onClick={()=>openHistory()}>Ver historial <ArrowRight size={16}/></button></header>
 <div className="home-command-grid">
 <section className="next-session" aria-labelledby="next-session-title"><div className="next-session-copy"><span className="eyebrow">{draft?'SESIÓN EN CURSO':'TU PRÓXIMA SESIÓN'}</span><h2 id="next-session-title">{draft?'Sigue donde lo dejaste.':'¿Entrenamos?'}</h2><p>{draft?`${draft.name || 'Entrenamiento'} · ${dateLabel(draft.date,{day:'numeric',month:'short'})}`:'Elige una rutina o empieza con tus propios ejercicios.'}</p><div className="next-session-actions"><button className="primary summary-start" onClick={()=>draft?continueDraft(draft.id):openStart()}><Dumbbell size={19}/>{draft?'Continuar entreno':'Empezar entreno'}<ArrowRight size={18}/></button>{draft&&<button className="text-action" onClick={()=>openStart()}>Nueva sesión <Plus size={16}/></button>}</div></div><img className="next-session-art" src="/assets/grind-dumbbell.webp" alt="" aria-hidden="true" width={200} height={200}/></section>
 <section className="week-card"><div className="section-heading"><h2>Esta semana</h2><span className="week-count"><Flame size={14}/>{weekCount}<span>/ {game.weeklyWorkoutGoal}</span></span></div><div className="week-strip">{weekDays.map((day,i)=>{const complete=workFinished.some(w=>w.date===day);return <button key={day} aria-label={`${dateLabel(day)}, ${complete?'entrenamiento completado':'ver día'}`} className={`${day===today?'current':''} ${complete?'complete':''}`} onClick={()=>openHistory(day)}><span>{['L','M','X','J','V','S','D'][i]}</span><strong>{complete?<Check size={15}/>:Number(day.slice(-2))}</strong><i/></button>})}</div><p><span className="live-dot"/>{weekCount>=game.weeklyWorkoutGoal?'Meta semanal conseguida.':`${Math.max(0,game.weeklyWorkoutGoal-weekCount)} ${game.weeklyWorkoutGoal-weekCount===1?'día':'días'} para tu objetivo semanal.`}</p><button className="text-action" onClick={()=>openGame('goals')}>Ver objetivo semanal <ArrowRight size={16}/></button></section>
 </div>
 {drafts.slice(1).map(w=><button className="draft-card" key={w.id} onClick={()=>continueDraft(w.id)}><Activity size={19}/><span><strong>Continuar · {w.name||'Sin nombre'}</strong><small>{dateLabel(w.date,{day:'numeric',month:'short'})}</small></span><ArrowRight size={18}/></button>)}
 {data.routineDraft&&<button className="draft-card" onClick={()=>{const recovery=data.routineDraft!;beginRoutine({...recovery,exercises:recovery.exercises.map(item=>({...item,sets:item.sets??NaN}))},true)}}><span><strong>Revisar rutina pendiente</strong><small>{data.routineDraft.name||'Rutina sin nombre'} · cambios recuperados</small></span><ArrowRight size={20}/></button>}
 <div className="home-secondary-links">
  <button className="secondary" onClick={()=>openHistory()}>Historial y resumen semanal <ArrowRight size={16}/></button>
  <button className="secondary" onClick={()=>openProgress()}>Ver marcas <ArrowRight size={16}/></button>
 </div>
 <section className="summary-character character-summary-card" aria-labelledby="summary-character-title">
 <div className="summary-character-copy"><h2 id="summary-character-title">Tu personaje</h2><p className="summary-character-rank"><Zap size={15} aria-hidden="true"/><strong>Nivel {rewards.level}</strong><span>{levelRank(rewards.level)}</span></p></div>
 <div className="summary-character-stage"><CharacterParty game={game} level={rewards.level} animated={effectsEnabled}/></div>
 <div className="character-progress"><div className="xp-label"><strong>{rewards.level===99?'Nivel máximo':<>{number(rewards.levelXp)} <span>/ {number(rewards.nextLevelXp)} XP</span></>}</strong><button className="text-action" onClick={()=>openGame('ascent')}>Ver ascenso <ArrowRight size={14}/></button></div><div className="progress-track" role="progressbar" aria-label="Progreso de nivel" aria-valuenow={Math.round(rewards.percent)} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${rewards.percent}%`}}/></div><p className="character-season">{number(rewards.xp)} XP · Temporada {today.slice(0,4)}</p>
 <details className="summary-character-equipment"><summary>{equippedAppearance.length}/5 piezas equipadas{equippedAppearance.length===0?' · aspecto inicial':''}</summary>{equippedAppearance.length>0?<ul>{equippedAppearance.map(({definition})=><li key={definition.id}><span>{SLOT_LABELS[definition.slot]}</span>{definition.name}</li>)}</ul>:<p>Desbloquea aspectos en Cofres y equípalos en Colección.</p>}<p>Reinicio: {seasonBounds(today.slice(0,4)).next} · +{WORKOUT_XP} XP al finalizar una sesión.</p></details>{equippedCheesit?<CheesitPassive companionId={equippedCheesit.id} status="equipped" compact/>:<p className="cheesit-empty-passive">Sin cheesit equipado.</p>}</div>
 <div className="summary-character-actions"><button className="secondary" onClick={()=>openGame('looks')}>Personalizar personaje <ArrowRight size={16}/></button></div>
 </section>
 <footer className="dashboard-footer"><p className="storage-status" role="status"><span>●</span> {saveError ? saveState : syncLabel}</p></footer>
 </>}
 {screen==='profile' && <PersonalProfile onPublication={(owner,workout)=>guardNavigation(()=>{setSocialRoute({owner,workout,list:null,query:''});setScreen('social')})} accountOwner={accountOwner} onSocial={list=>guardNavigation(()=>{setSocialRoute({owner:accountOwner??null,list,query:''});setScreen('social')})} username={username} guest={guest} data={data} level={rewards.level} xp={rewards.xp} onSave={personalProfile=>persistConfirmedData({...currentData.current,personalProfile})} onWorkout={id=>{setDetailReturn('profile');setDetailId(id);setScreen('detail')}} onStart={()=>openStart()} onBack={()=>navigate('summary')}/>}
 {screen==='objectives' && <><Back title="Objetivos" onClick={()=>navigate('summary')}/><ObjectivesPanel data={data} exercises={exercises} today={today} onSave={update=>persistData(update(currentData.current))}/></>}
 {screen==='game' && <GameHub initialTab={gameTab} onTabChange={setGameTab} data={data} onPersist={persistData} onSettings={()=>navigate('settings')} today={today} effectsEnabled={effectsEnabled} soundEnabled={soundEnabled}/>}
 {screen==='notifications' && <Notifications feed={notificationFeed} guest={guest||!accountOwner} onBack={()=>navigate('feed')} onAccount={()=>navigate('settings')} onNavigate={route=>guardNavigation(()=>{setSocialRoute(route);setScreen('social')})}/>}
 {screen==='social' && <SocialPanel key={`${accountOwner??'guest'}:${socialRoute.owner??''}:${socialRoute.list??''}`} owner={accountOwner} guest={guest} route={socialRoute} onNavigate={route=>guardNavigation(()=>setSocialRoute(route))} onBack={()=>{if(socialRoute.source==='notifications')navigate('notifications');else if(socialRoute.list)setSocialRoute({...socialRoute,list:null});else if(socialRoute.source==='people')navigate('feed',()=>setPeopleQuery(socialRoute.query));else if(socialRoute.owner)setSocialRoute({owner:null,list:null,query:socialRoute.query});else navigate('feed')}} onAccount={()=>navigate('settings')}/>}

 {screen==='feed' && <WorkoutFeed viewer={accountOwner} guest={guest} onAccount={()=>navigate('settings')}
   onTogglePeopleSearch={()=>setPeopleQuery(query=>query===null?'':null)}
   peopleSearch={peopleQuery!==null?<SocialPanel embedded owner={accountOwner} guest={guest} route={{owner:null,list:null,query:peopleQuery}}
     onNavigate={route=>route.owner?guardNavigation(()=>{setSocialRoute({...route,source:'people'});setScreen('social')}):setPeopleQuery(route.query)}
     onBack={()=>setPeopleQuery(null)} onAccount={()=>navigate('settings')}/>:undefined}
   onProfile={owner=>guardNavigation(()=>{setSocialRoute({owner,list:null,query:''});setScreen('social')})}
   onWorkout={(owner,workout)=>guardNavigation(()=>{setSocialRoute({owner,workout,list:null,query:''});setScreen('social')})}/>}
 {screen==='progress' && <>
  <header className="home-header compact"><h1>Progreso</h1></header>
  <nav className="progress-views" aria-label="Vistas de progreso">
   {progressViews.map(({id,label})=><button type="button" key={id} aria-current={progressView===id?'page':undefined} onClick={()=>guardNavigation(()=>{setProgressView(id);setProgressId(null);scrollViewToTop(contentRef.current)})}>{label}</button>)}
  </nav>
 </>}
 {screen==='progress' && progressView==='history' && <section className="progress-calendar" aria-label="Calendario de entrenamientos"><section className="section"><h2>Sesiones recientes</h2>{recentWorkouts.length?<div className="list-card">{recentWorkouts.map(w=><button className="list-row" key={w.id} onClick={()=>openDetail(w.id)}><span className="list-copy"><strong>{w.name}</strong><small>{dateLabel(w.date)}</small></span><ArrowUpRight size={18}/></button>)}</div>:<p className="notice">Tus entrenamientos guardados aparecerán aquí.</p>}</section><h2>Calendario</h2><div className="calendar-card"><div className="calendar-title"><button className="icon-button" aria-label="Mes anterior" onClick={()=>setMonth(monthShift(month,-1))}>‹</button><h2>{dateLabel(month,{month:'long',year:'numeric'})}</h2><button className="icon-button" aria-label="Mes siguiente" onClick={()=>setMonth(monthShift(month,1))}>›</button></div><div className="weekdays">{['L','M','X','J','V','S','D'].map((d,i)=><span key={i}>{d}</span>)}</div><div className="calendar-grid">{calendarMonth(month).map((date,index)=>{if(!date)return <span key={`blank-${index}`} className="calendar-blank" aria-hidden="true"/>;const sessions=finished.filter(w=>w.date===date).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));return <button key={date} aria-pressed={date===selectedDate} aria-label={`${dateLabel(date)}${date===today?', hoy':''}${date===selectedDate?', seleccionado':''}${sessions.length?`, ${sessions.length} entrenamiento${sessions.length>1?'s':''}`:''}`} className={`day ${date===today?'today':''} ${date===selectedDate?'chosen':''}`} onClick={()=>setSelectedDate(date)}><span className="day-number" style={sessions.length?{backgroundColor:sessions[0].color,color:sessions[0].color===WORKOUT_COLOR?'#211729':'#fff'}:undefined}>{Number(date.slice(-2))}</span>{sessions.length>1&&<small>+{sessions.length-1}</small>}</button>})}</div><div className="calendar-legend"><span><i/> Hoy</span><span><i className="legend-selected"/> Día seleccionado</span></div></div><section className="section"><div className="section-heading"><div><span className="eyebrow">DÍA SELECCIONADO</span><h2>{dateLabel(selectedDate,{day:'numeric',month:'long'})}</h2></div></div>{finished.filter(w=>w.date===selectedDate).length?<div className="list-card">{finished.filter(w=>w.date===selectedDate).map(w=><button className="list-row" key={w.id} onClick={()=>{setDetailReturn('progress');setDetailId(w.id);setScreen('detail')}}><span className="routine-dot" style={{backgroundColor:w.color}}/><span className="list-copy"><strong>{w.name}</strong><small>{w.exercises.length} ejercicios · {w.exercises.flatMap(e=>e.sets).length} series</small></span><span className="arrow">›</span></button>)}</div>:<div className="empty-card compact-empty"><p>No hay entrenamientos este día.</p>{selectedDate<=today&&<button className="text-action" onClick={()=>openStart(selectedDate)}>Crear entrenamiento →</button>}</div>}{drafts.filter(w=>w.date===selectedDate).map(w=><button key={w.id} className="draft-inline" onClick={()=>continueDraft(w.id)}>Borrador · {w.name||'Sin nombre'} · Continuar entrenamiento →</button>)}{selectedDate<=today&&<button className="secondary wide" onClick={()=>openStart(selectedDate)}>Nueva sesión en este día</button>}</section> <section className="activity-section"><div className="section-top"><div><h2>Tu actividad</h2></div><div className="segmented"><button aria-pressed={period==='week'} className={period==='week'?'active':''} onClick={()=>{setPeriod('week');setAnchor(today)}}>Semana</button><button aria-pressed={period==='month'} className={period==='month'?'active':''} onClick={()=>{setPeriod('month');setAnchor(today)}}>Mes</button></div></div>
 <div className="period-row"><button className="icon-button" aria-label="Periodo anterior" onClick={()=>setAnchor(period==='week'?shift(anchor,-7):monthShift(anchor,-1))}><ChevronLeft size={15}/></button><strong>{dateLabel(bounds.start,{day:'numeric',month:'short'})} — {dateLabel(bounds.end,{day:'numeric',month:'short'})}</strong><button className="icon-button" aria-label="Periodo siguiente" disabled={anchor>=today || (period==='month'&&anchor.slice(0,7)>=today.slice(0,7))} onClick={()=>setAnchor(period==='week'?shift(anchor,7):monthShift(anchor,1))}><ChevronRight size={15}/></button><small>{anchor===today?(period==='week'?'ESTA SEMANA':'ESTE MES'):'PERIODO SELECCIONADO'}</small></div>
 <div className="stats-grid"><div className="stat-card featured"><div className="stat-label"><span>Entrenamientos</span><Dumbbell size={17}/></div><strong>{String(stats.workouts).padStart(2,'0')}</strong><small><ArrowUpRight size={12}/>{stats.workouts?delta(stats.workouts,previousStats.workouts):'Sin sesiones'}</small></div><div className="stat-card"><div className="stat-label"><span>Series</span><Layers size={17}/></div><strong>{stats.sets}</strong><small>{stats.sets?delta(stats.sets,previousStats.sets):'Sin series'}</small></div><div className="stat-card"><div className="stat-label"><span>Repeticiones</span><Zap size={17}/></div><strong>{number(stats.reps)}</strong><small>{stats.reps?delta(stats.reps,previousStats.reps):'Sin repeticiones'}</small></div><div className="stat-card"><div className="stat-label"><span>Volumen · kg × reps</span><Activity size={17}/></div><strong>{number(stats.volume)}</strong><small>{stats.volume?delta(stats.volume,previousStats.volume,stats.sets>stats.excludedSets&&previousStats.sets>previousStats.excludedSets):'Sin volumen'}</small></div></div><p className="comparison-caption">{stats.workouts&&previousStats.workouts?'Comparado con':'Comparación disponible cuando registres actividad en ambos periodos ·'} {dateLabel(previousStart,{day:'numeric',month:'short'})} — {dateLabel(previousEnd,{day:'numeric',month:'short'})}{stats.excludedSets>0?` · ${stats.excludedSets} series de peso corporal excluidas del volumen`:''}</p></section>
 <WeeklySummary data={data} today={today} effects={effectsEnabled} onWorkout={openDetail}/>
 </section>}
 {screen==='train' && <>
  <header className="home-header compact"><h1>Entrenar</h1></header>
  <SectionCards label="Apartados de Entrenar" cards={[
   {label:'Empezar entreno',icon:Play,artwork:'training-start-card-3d',open:()=>openStart()},
   {label:'Mis rutinas',icon:ClipboardList,artwork:'training-routines-card-3d',open:()=>navigate('routines')},
   {label:'Planes de entrenamiento',icon:Layers,artwork:'training-plans-card-3d',open:()=>navigate('plans')},
   {label:'Catálogo de ejercicios',icon:BookOpen,artwork:'training-catalog-card-3d',open:()=>navigate('catalog')},
  ]}/>
 </>}
 {screen==='plans' && <><Back title="Planes de entrenamiento" onClick={()=>navigate('train')}/><CyclePanel data={data} onChange={setData} onStart={startCycle}/></>}
 {screen==='routines' && <><Back title="Mis rutinas" onClick={()=>navigate('train')}/>
 {data.routineDraft&&<button className="draft-inline" onClick={()=>{const recovery=data.routineDraft!;beginRoutine({...recovery,exercises:recovery.exercises.map(item=>({...item,sets:item.sets??NaN}))},true)}}>Revisar rutina pendiente</button>}
 {data.routines.every(r=>r.archived)&&<SectionCards label="Rutinas sugeridas" cards={STARTERS.map(starter=>({label:starter.name,icon:Dumbbell,open:()=>useStarter(starter)}))}/>}
 <section className="section"><div className="section-heading"><h2>Rutinas activas</h2><span className="count">{data.routines.filter(r=>!r.archived).length}</span></div>{data.routines.some(r=>!r.archived)?<div className="routine-list">{data.routines.filter(r=>!r.archived).map(r=><div className="routine-card" key={r.id}><span className="routine-stripe" style={{background:r.color}}/><button className="routine-main" onClick={()=>beginRoutine(structuredClone(r))}><span className="routine-icon" style={{borderColor:r.color}}><RoutineIcon icon={r.icon} size={23}/></span><span className="list-copy"><strong>{r.name}</strong><small>{r.exercises.length} {r.exercises.length===1?'ejercicio':'ejercicios'}</small></span></button><button className="routine-start secondary" aria-label={`Entrenar ${r.name}`} onClick={()=>openStart(today,r)}><Play size={16}/><span>Empezar</span></button><button className="icon-button" aria-label={`Duplicar ${r.name}`} title="Duplicar" onClick={()=>beginRoutine({...structuredClone(r),id:newId(),name:copiedName(r.name,data.routines.map(item=>item.name)),exercises:r.exercises.map(e=>({...e,id:newId()}))})}><Copy size={18}/></button><button className="icon-button" aria-label={`Archivar ${r.name}`} title="Archivar" onClick={()=>{if(window.confirm(`¿Archivar «${r.name}»?`))setData(p=>({...p,routines:p.routines.map(x=>x.id===r.id?{...x,archived:true}:x)}))}}><Archive size={18}/></button></div>)}</div>:<div className="empty-card"><div className="empty-symbol">▤</div><h3>Una rutina, muchas sesiones</h3><p>Guarda tus ejercicios favoritos para empezar más rápido.</p><button className="text-action" onClick={newRoutine}>Crear mi primera rutina →</button></div>}<button className="primary wide training-create-routine" aria-label="Crear rutina" onClick={newRoutine}>＋ Crear rutina</button></section>{data.routines.some(r=>r.archived)&&<section className="section"><h2>Archivadas</h2><div className="list-card">{data.routines.filter(r=>r.archived).map(r=><div className="list-row" key={r.id}><span className="routine-icon" style={{borderColor:r.color}}><RoutineIcon icon={r.icon} size={22}/></span><span className="list-copy"><strong>{r.name}</strong><small>Archivada</small></span><button className="text-action" onClick={()=>setData(p=>({...p,routines:p.routines.map(x=>x.id===r.id?{...x,archived:false}:x)}))}>Restaurar</button></div>)}</div></section>}</>}
 {screen==='start' && <><Back title="Empezar entreno" onClick={()=>navigate('train')}/><p className="intro">Usa una rutina guardada o añade ejercicios durante la sesión.</p>{drafts.map(w=><button className="draft-card" key={w.id} onClick={()=>continueDraft(w.id)}><span className="draft-icon"><ArrowUpRight size={20}/></span><span><strong>Continuar borrador · {w.name||'Sin nombre'}</strong><small>{dateLabel(w.date)}</small></span><span className="arrow">›</span></button>)}<form className="form-card start-form" onSubmit={event=>{event.preventDefault();startWorkout()}}><label>Rutina<select aria-label="Rutina" value={startRoutine} onChange={e=>{const r=data.routines.find(x=>x.id===e.target.value);setStartRoutine(e.target.value);setStartName(r?.name||'Entrenamiento')}}><option value="">Sin rutina · elegiré los ejercicios</option>{data.routines.filter(r=>!r.archived).map(r=><option value={r.id} key={r.id}>{r.name}</option>)}</select></label><label>Nombre<input required maxLength={80} value={startName} onChange={e=>setStartName(e.target.value)}/></label><label>Fecha<input required type="date" max={today} value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>{message&&<p className="error" role="alert">{message}</p>}<button type="submit" className="primary wide">{startRoutine?'Empezar con esta rutina':'Empezar sin rutina'} <ArrowRight size={18}/></button></form></>}
 {screen==='editor' && editing && <SessionEditor finishPending={finishPending} key={editing.id} workout={editing} history={finished} profile={profile} game={game} historical={Boolean(editingOriginal)} saveState={saveError ? saveState : syncLabel} message={message} busy={busy||finishPending} today={today} onChange={next=>{if(!busyRef.current&&!failedFinish.current)setEditing(next)}} onConfirm={(ex,set)=>void confirmSet(ex,set)} onFinish={()=>void finishWorkout()} onAdd={()=>{setSubstituteId(null);setPicker('workout')}} onBack={()=>navigate(editingOriginal?'detail':'start')} onAbandon={()=>{if(window.confirm('¿Abandonar y eliminar este borrador?')){void persistData({...currentData.current,workouts:currentData.current.workouts.filter(w=>w.id!==editing.id)}).then(()=>{setEditing(null);setScreen('summary')}).catch(()=>setMessage('No se ha confirmado el borrado. Reintenta el guardado.'))}}} onProgress={id=>openProgress(id,'editor')} onSubstitute={id=>{const ex=editing.exercises.find(item=>item.id===id);if(ex?.sets.some(set=>set.confirmed)&&!window.confirm('Sustituir elimina las series de este bloque. ¿Continuar?'))return;setSubstituteId(id);setPicker('workout')}} />}
 {screen==='routine' && routineEdit && <RoutineEditor routine={routineEdit} exercises={exercises} message={message} busy={busy} onChange={setRoutineEdit} onSave={()=>void saveRoutine()} onBack={()=>navigate('routines')} onAdd={()=>setPicker('routine')} />}
 {screen==='detail' && detail && <><Back title="Entrenamiento" onClick={()=>setScreen(detailReturn)}/>
 {savedWorkout===detail.id&&<p className="notice" role="status">Entrenamiento guardado.</p>}
 {publicationNotice?.id===detail.id&&<p className="notice" role="status">{publicationNotice.text}</p>}
 {accountOwner&&!guest&&<button className="secondary wide" onClick={()=>{setPublicationNotice(null);setScreen('publish')}}>{detail.publication?.published?'Gestionar publicación':'Publicar en Comunidad'}</button>}
 <WorkoutDetailContent workout={detail} profile={profile} onProgress={id=>openProgress(id,'detail')}><section className="workout-rewards-summary" aria-label="Recompensas del entrenamiento"><h2>Recompensas de la sesión</h2><div className="workout-reward-normal"><span>Recompensas normales y habilidad activa</span><strong>{number(detailNormalXp)} XP</strong></div><WorkoutCheesitReward workout={detail}/></section></WorkoutDetailContent><ProgressWords data={data} history={finished} workoutId={detail.id} onWorkout={id=>{setDetailId(id)}}/><button className="secondary wide" onClick={()=>{setEditingOriginal(structuredClone(detail));setEditing(structuredClone(detail));setScreen('editor')}}>Editar entrenamiento</button><button className="secondary wide" onClick={()=>repeatWorkout(detail)}>Repetir sesión</button><button className="secondary wide" onClick={()=>routineFromWorkout(detail)}>Guardar como rutina</button><button className="danger-link" onClick={()=>void deleteWorkout(detail)}>Eliminar entrenamiento</button>{message&&<p className="notice">{message}</p>}</>}
 {screen==='publish' && detail && accountOwner && !guest && <>
  <Back title="Publicación" onClick={()=>navigate('detail')}/>
  <PublicationEditor owner={accountOwner} workout={detail} onSave={publication=>savePublication(detail.id,publication)}/>
 </>}
 {screen==='progress' && progressView==='body' && <>
  <BodyWeightProgress profile={data.profile} onChange={transform=>persistConfirmedData(captureMoments(currentData.current,{...currentData.current,profile:transform(currentData.current.profile)}))}/>
  <MuscleProgress data={data} today={today}/>
 </>}
 {screen==='progress' && progressView==='records' && <section className={progressId?'progress-details':'progress-details progress-overview'} aria-label="Estadísticas de progreso"><ProgressPanel data={data} history={finished} exercises={exercises} selectedId={progressId} onSelect={setProgressId} onWorkout={id=>{setDetailReturn('progress');setDetailId(id);setScreen('detail')}} onBack={()=>{if(progressReturn==='editor'&&editing)setScreen('editor');else if(progressReturn==='detail'&&detail)setScreen('detail');else setProgressId(null)}} /></section>}
 {screen==='catalog' && <><Back title="Catálogo de ejercicios" onClick={()=>navigate('train')} /><ExerciseLibrary exercises={exercises} onSave={ex=>persistData({...currentData.current,customExercises:currentData.current.customExercises.some(item=>item.id===ex.id)?currentData.current.customExercises.map(item=>item.id===ex.id?ex:item):[...currentData.current.customExercises,ex]})} /></>}
 {screen==='settings' && <>{accountOwner&&!guest&&<ActivityPrivacy owner={accountOwner}/>}<GymSettings gym={data.personalProfile?.gym} onSave={gym=>persistConfirmedData({...currentData.current,personalProfile:{...(currentData.current.personalProfile??EMPTY_PERSONAL_PROFILE),gym}})}/><section className="settings-section experience-settings"><h2>Sonido y efectos</h2><div className="settings-card preference-row"><div><strong>Efectos y confeti</strong><p>Celebraciones al confirmar series y terminar sesiones.</p></div><button className={`toggle ${effectsEnabled?'on':''}`} role="switch" aria-label="Efectos y confeti" aria-checked={effectsEnabled} onClick={()=>{preferencesDirty.current=true;setEffectsEnabled(v=>!v)}}><span/></button></div><div className="settings-card preference-row"><div><strong>Sonido de victoria</strong><p>Sonidos en botones, series y recompensas.</p></div><button className={`toggle ${soundEnabled?'on':''}`} role="switch" aria-label="Sonido de victoria" aria-checked={soundEnabled} onClick={()=>{preferencesDirty.current=true;setSoundEnabled(v=>!v)}}><span/></button></div><p className="settings-fineprint">El modo de movimiento reducido de tu dispositivo se respeta automáticamente.</p></section><section className="settings-section"><span className="eyebrow">TUS DATOS</span><h2>Almacenamiento</h2><div className="settings-card"><strong>{guest?'En este navegador':'En tu cuenta'}</strong><p>{guest?'Modo invitado: tu actividad permanece en este navegador, sin cuenta ni sincronización.':'Guardado automático en la nube, con copia local para entrenar sin cobertura. Consulta el estado de sincronización y gestiona tu sesión en los ajustes de cuenta. Las copias JSON son opcionales.'}</p><p className="storage-status"><span>●</span> {saveError ? saveState : syncLabel}</p></div><button className="settings-action" onClick={exportData}><span><strong>Exportar datos</strong><small>Descargar una copia JSON</small></span><span className="arrow">↓</span></button><button className="settings-action" onClick={()=>importRef.current?.click()}><span><strong>Importar datos</strong><small>Restaurar una copia de Cheesit</small></span><span className="arrow">↑</span></button><input ref={importRef} type="file" accept="application/json,.json" hidden onChange={e=>{const f=e.target.files?.[0];if(f)void importData(f)}}/>{message&&<p role="status" className="notice">{message}</p>}</section><section className="settings-section"><span className="eyebrow">ACERCA DE</span><h2>Cheesit</h2><p>Registra tus entrenamientos y consulta tu progreso.</p></section><section className="settings-section account-reset-section" aria-label="Resetear cuenta"><span className="eyebrow">EMPEZAR DE NUEVO</span><h2>Resetear cuenta</h2><p>Borra tus entrenos, rutinas, ejercicios propios y todo el progreso del juego. Volverás a empezar con 100 créditos. Tu acceso, perfil y preferencias se conservan.</p><button type="button" className="account-reset-button" disabled={busy} onClick={()=>void resetAccount()}><RotateCcw size={18}/>{busy?'Reseteando cuenta…':'Resetear cuenta'}</button><p className="account-reset-warning">Esta acción no se puede deshacer. Te pediremos confirmación antes de borrar.</p>{resetNotice&&<p className="notice" role="status">{resetNotice}</p>}</section></>}
 </main></div>
 <nav className="bottom-nav training-navigation" aria-label="Navegación principal">
  {([
   {id:'summary',label:'Inicio',Icon:LayoutDashboard},
   {id:'feed',label:'Comunidad',Icon:Rss},
   {id:'train',label:'Entrenar',Icon:Dumbbell},
   {id:'progress',label:'Progreso',Icon:Activity},
   {id:'game',label:'Arcade',Icon:Sparkles},
  ] as const).map(({id,label,Icon})=>{
   const active=sectionFor(screen)===id;
   return <button key={id} className={`${active?'active ':''}${id==='train'?'nav-training':''}`} aria-current={active?'page':undefined}
    onClick={()=>activateNav(id,()=>id==='game'?openGame('overview'):id==='progress'?openHistory():navigate(id))}>
    <Icon size={21} aria-hidden="true"/><span>{label}</span>
   </button>;
  })}
 </nav>
 {picker&&<Modal title={substituteId?'Sustituir ejercicio':'Añadir ejercicio'} onClose={()=>{setPicker(null);setSubstituteId(null)}}><ExerciseLibrary exercises={exercises} onSelect={addExercise} onSave={ex=>persistData({...currentData.current,customExercises:currentData.current.customExercises.some(item=>item.id===ex.id)?currentData.current.customExercises.map(item=>item.id===ex.id?ex:item):[...currentData.current.customExercises,ex]})} /></Modal>}
 {pendingNavigation&&<Modal title="Cambios pendientes" onClose={()=>setPendingNavigation(null)}><p>{routineDirty?'Tu rutina tiene cambios sin guardar.':'Este entrenamiento tiene cambios sin guardar.'}</p><button className="primary wide" disabled={busy} onClick={()=>{const action=pendingNavigation;void (routineDirty?saveRoutine(true):finishWorkout()).then(saved=>{if(saved){setPendingNavigation(null);action()}})}}>Guardar y salir</button><button className="secondary wide" onClick={()=>{const action=pendingNavigation;setPendingNavigation(null);setRoutineEdit(null);setEditingOriginal(null);setEditing(null);action()}}>Descartar cambios</button><button className="text-action" onClick={()=>setPendingNavigation(null)}>Seguir editando</button></Modal>}
 {importPreview&&<Modal title="Revisar importación" onClose={()=>{if(!busy)setImportPreview(null)}}><p>Nuevos: {importPreview.newCounts.workouts} entrenamientos, {importPreview.newCounts.routines} rutinas y {importPreview.newCounts.customExercises} ejercicios.</p><p>Las preferencias y el perfil locales se conservan. Una instalación vacía recupera los de la copia.</p>{importPreview.conflictDetails.map(conflict=><section className="import-conflict" key={conflict.key}><h3>{conflict.name}</h3><p>{conflict.kind} · dos versiones del mismo registro</p><details><summary>Ver diferencias</summary><pre>{JSON.stringify({local:conflict.local,copia:conflict.incoming},null,2)}</pre></details><label>Versión que conservar<select value={importResolutions[conflict.key]??''} onChange={event=>resolveImport(conflict.key,event.target.value as 'local'|'incoming'|'duplicate')}><option value="" disabled>Elige una resolución</option>{conflict.choices.map(choice=><option key={choice} value={choice}>{choice==='local'?'Conservar local':choice==='incoming'?'Usar copia':'Conservar ambas'}</option>)}</select></label></section>)}{importPreview.conflicts.length>0&&<p className="notice">Resuelve los conflictos antes de importar: {importPreview.conflicts.join('; ')}</p>}{message&&<p className="error" role="alert">{message}</p>}<button className="primary wide" disabled={busy||importPreview.conflicts.length>0} onClick={()=>void confirmImport()}>{busy?'Guardando…':'Confirmar importación'}</button></Modal>}
 <ArcadeExperience loaded={loaded&&preferencesLoaded} effectsEnabled={effectsEnabled} soundEnabled={soundEnabled}/><Celebration event={celebration} onDismiss={()=>setCelebration(null)} effectsEnabled={effectsEnabled} soundEnabled={soundEnabled}/>
 </div>;
}
