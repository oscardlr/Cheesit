/** Produces fictitious, locally importable review data. Never contacts a service. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { COLORS, newWorkout, type AppData, type Routine } from '../src/lib/model';
import { CATALOG } from '../src/lib/catalog';
import { addDays, todayMadrid } from '../src/lib/dates';
import { normalizeGame } from '../src/lib/game';
import { createBackup, previewBackup } from '../src/lib/backup';
const routines: Routine[] = [
  {id:crypto.randomUUID(),name:'Demo · Tren superior',color:COLORS[3],icon:'dumbbell',archived:false,exercises:['press-banca-barra','jalon-pecho','press-hombros-mancuernas'].map(exerciseId=>({id:crypto.randomUUID(),exerciseId,sets:3,repsMin:8,repsMax:12,restSeconds:90}))},
  {id:crypto.randomUUID(),name:'Demo · Tren inferior',color:COLORS[0],icon:'flame',archived:false,exercises:['sentadilla-barra','peso-muerto-rumano','hip-thrust'].map(exerciseId=>({id:crypto.randomUUID(),exerciseId,sets:3,repsMin:8,repsMax:12,restSeconds:90}))},
];
const data: AppData={routines,customExercises:[],game:normalizeGame(),personalProfile:{displayName:'Demo Cheesit',bio:'Datos ficticios para probar el rediseño.',photo:null},preferences:{effects:true,sound:false},workouts:[1,3,5,8,10,12].map((days,i)=>{
  const workout=newWorkout(routines[i%2],CATALOG);
  const stamp=`${addDays(todayMadrid(),-days)}T17:00:00.000Z`;
  return {...workout,name:routines[i%2].name,date:addDays(todayMadrid(),-days),createdAt:stamp,updatedAt:stamp,startedAt:stamp,finishedAt:stamp.replace('17:','18:'),status:'finished',exercises:workout.exercises.map((ex,j)=>({...ex,sets:ex.sets.map(set=>({...set,weight:Math.max(5,50-i*2-j*10),reps:10,confirmed:true}))}))};
})};
const backup=createBackup(data);
previewBackup(backup,{routines:[],workouts:[],customExercises:[]});
mkdirSync('docs/ux-redesign',{recursive:true});
writeFileSync('docs/ux-redesign/cheesit-demo.json',JSON.stringify(backup,null,2)+'\n');
console.log('Datos ficticios verificados: docs/ux-redesign/cheesit-demo.json');
