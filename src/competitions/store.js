import {advanceDevelopment,setPlayerTraining} from './development.js';
import {appointManager,beginCoachedMatch,updateCoachedMatch,isManagedFixture,seasonGoal,savePreparation} from './career.js';
import {createSeason,validateSave,followingSeason,pendingMatches,playFixture,finishDate} from './runtime.js';
import {setYouthPath,observeYouth} from './youth.js';
import {setAcademyPlan} from './academy.js';
let current=null,dbPromise=null,loading=null,busy=false;
function database(){return dbPromise??=new Promise((resolve,reject)=>{const r=indexedDB.open('astraball-seasons',1);r.onupgradeneeded=()=>{r.result.createObjectStore('seasons',{keyPath:'year'});r.result.createObjectStore('meta');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('无法打开本地赛季存档'));});}
async function read(store,key){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(store),r=tx.objectStore(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('读取赛季存档失败'));});}
async function write(s,archive){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(['seasons','meta'],'readwrite');if(archive)tx.objectStore('seasons').put(archive);tx.objectStore('seasons').put(s);tx.objectStore('meta').put(s.year,'current');tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(Error('保存失败，赛季未推进。请检查浏览器存储空间后重试。'));});}
export function peekSeason(){return current;}
export async function loadSeason(){if(current)return current;return loading??=(async()=>{const year=await read('meta','current');if(year!=null){const saved=await read('seasons',year);current=validateSave(saved);}else current=createSeason();return current;})().catch(error=>{loading=null;throw error;});}
export async function archivedYears(){const db=await database();return new Promise((resolve,reject)=>{const r=db.transaction('seasons').objectStore('seasons').getAllKeys();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('读取赛季档案失败'));});}
export async function readSeason(year){const s=await loadSeason();return year===s.year?s:validateSave(await read('seasons',year));}
// Only one tab may advance this save. Reload inside the lock to avoid stale writes.
async function mutate(fn){if(busy)throw Error('赛季正在推进');busy=true;try{const run=async()=>{const year=await read('meta','current');if(year!=null)current=validateSave(await read('seasons',year));else await loadSeason();const work=structuredClone(current),result=await fn(work);await write(result||work,result?work:null);current=result||work;return current;};return navigator.locks?await navigator.locks.request('astraball-season-write',run):await run();}finally{busy=false;}}
export async function advanceDay(date,{onProgress=()=>{},shouldStop=()=>false}={}){return mutate(async work=>{
 if(date<work.date||date>`${String(work.year).padStart(4,'0')}-12-31`)throw Error('请选择本赛季内的未来日期');
 if(work.activeMatch)throw Error('请先回到执教比赛，完成当前比赛');
 const matches=pendingMatches(work).filter(m=>m.date<=date);
 for(let i=0;i<matches.length;i++){
  if(shouldStop())throw Error('已暂停，本次推进未写入');
  if(isManagedFixture(work,matches[i])){advanceDevelopment(work,matches[i].date);work.date=matches[i].date;work.revision++;return;}
  playFixture(work,matches[i].id);
  if(i%8===0){onProgress(i+1,matches.length);await new Promise(r=>setTimeout(r,0));}
 }
 finishDate(work,date);
});}
export async function newSeason(){return mutate(work=>{const next=followingSeason(work);if(next.manager)next.manager.goal=seasonGoal(next);return next;});}
export async function takeClub(clubId){return mutate(work=>{appointManager(work,clubId);});}
export async function startOfficial(settings){let state;const season=await mutate(work=>{state=beginCoachedMatch(work,settings);});return {season,state};}
export async function tickOfficial(update){let state;const season=await mutate(work=>{state=updateCoachedMatch(work,update);});return {season,state};}
export async function saveOfficialPreparation(settings){return mutate(work=>{savePreparation(work,settings);});}
export async function savePlayerTraining(id,plan){return mutate(work=>{setPlayerTraining(work,id,plan);});}
export async function saveYouthPath(id,path,options={}){return mutate(work=>{
 if(work.activeMatch)throw Error('请先完成正在执教的比赛');
 advanceDevelopment(work,work.date);setYouthPath(work,id,path,options);
});}
export async function saveYouthObservation(id){return mutate(work=>{
 if(work.activeMatch)throw Error('请先完成正在执教的比赛');
 advanceDevelopment(work,work.date);observeYouth(work,id);
});}

export async function saveAcademyPlan(plan){return mutate(work=>{
 if(work.activeMatch)throw Error('请先完成正在执教的比赛');
 advanceDevelopment(work,work.date);setAcademyPlan(work,plan);
});}
