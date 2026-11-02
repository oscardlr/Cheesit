import { test, expect } from '@playwright/test';
test.skip(process.env.CHEESIT_NO_CONFIG_TEST !== '1', 'Run on a build without account configuration');
test('without configured account service the app protects existing local data and blocks activity', async({page})=>{
  await page.goto('/');
  const legacy={routines:[],workouts:[],customExercises:[],preferences:{effects:false,sound:true}};
  await page.evaluate(data=>new Promise<void>((resolve,reject)=>{const r=indexedDB.open('entrenos-local',1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>{const db=r.result,tx=db.transaction('state','readwrite');tx.objectStore('state').put(data,'local');tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)};}),legacy);
  await page.reload(); await expect(page.getByRole('heading',{name:/Tu entrenamiento/})).toBeVisible();
  await expect(page.getByText('La cuenta y la sincronización aún no están configuradas.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Empezar entrenamiento'})).toHaveCount(0);
  const original=await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('entrenos-local',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('state'),q=tx.objectStore('state').get('local');tx.oncomplete=()=>{resolve(q.result);db.close()}}}));expect(original).toEqual(legacy);
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
});
