import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {footballTeams} from '../../src/football/data.js';
import {daysBetween} from '../../src/competitions/calendar.js';

const root=fileURLToPath(new URL('../../',import.meta.url));
const {values}=parseArgs({options:{input:{type:'string',default:'artifacts/academy-world/world-final'},preview:{type:'boolean',default:false}}});
const out=path.join(root,'artifacts/academy-world'),input=path.resolve(root,values.input),report=JSON.parse(fs.readFileSync(path.join(input,'report.json')));
const preview=values.preview;
if(!preview&&(report.status!=='completed'||report.seasons.length!==20))throw Error('等待20季固定基线完成后统一诊断');
const originals=footballTeams.flatMap(t=>t.roster),originalIds=new Set(originals.map(p=>p.id));
const years=[...new Set(report.availabilityWarnings.map(w=>Number(w.date.slice(0,4))))],cases=[];
for(const year of years){
 const source=path.relative(out,path.join(input,`season-${year}.json.gz`)),s=JSON.parse(gunzipSync(fs.readFileSync(path.join(out,source)))).season;
 const keepers=[...originals,...Object.values(s.playerRegistry.players)].filter(p=>p.position==='GK');
 for(const warning of report.availabilityWarnings.filter(w=>Number(w.date.slice(0,4))===year)){
  const registered=[],away=[],departures=[];
  for(const p of keepers){
   if(p.ageReferenceDate&&p.ageReferenceDate>warning.date)continue;
   const reg=s.playerRegistry.registrations[p.id],history=reg?.history||[],past=history.filter(h=>h.date<=warning.date);
   const state=past.at(-1)||(originalIds.has(p.id)?{status:'senior',clubId:p.club,ownerClubId:p.club}:null);
   if(!state)continue;
   if(state.clubId===warning.clubId&&['senior','loan'].includes(state.status))registered.push({id:p.id,name:p.name,state});
   if(state.status==='loan'&&state.ownerClubId===warning.clubId&&state.clubId!==warning.clubId)away.push({id:p.id,name:p.name,state});
   for(let i=1;i<past.length;i++)if(past[i-1].clubId===warning.clubId&&['senior','loan'].includes(past[i-1].status)&&past[i].clubId!==warning.clubId&&daysBetween(past[i].date,warning.date)<=184)departures.push({id:p.id,name:p.name,from:past[i-1],to:past[i]});
  }
  const registeredIds=new Set(registered.map(p=>p.id));
  const activeInjuries=s.fixtures.filter(m=>m.report&&m.date<warning.date&&daysBetween(m.date,warning.date)<365).flatMap(m=>m.report.events.filter(e=>e.type==='injury'&&registeredIds.has(e.player)&&e.days>daysBetween(m.date,warning.date)).map(e=>({playerId:e.player,fixture:m.id,date:m.date,days:e.days,remaining:e.days-daysBetween(m.date,warning.date)})));
  const injuredIds=new Set(activeInjuries.map(e=>e.playerId));
  let explanation='没有完整重放历史纪律、当日出场和体能状态，原因未完全判定';
  if(registered.length===1&&injuredIds.has(registered[0].id))explanation=away.length?'单门将配置遇伤病；另有本队门将在外租':'单门将配置遇伤病';
  else if(registered.length>1&&registered.every(p=>injuredIds.has(p.id)))explanation='全部注册自然门将处于伤病期限内';
  else if(registered.length===0)explanation='没有注册自然门将';
  cases.push({...warning,source,registeredGoalkeepers:registered,loanedOutGoalkeepers:away,recentGoalkeeperDepartures:departures,activeInjuryEvents:activeInjuries,explanation});
 }
}
const result={complete:report.status==='completed',completedSeasons:report.seasons.length,sourceModelHash:report.sourceHash,scope:'Twenty-season audit, registration histories at or before each warning date; injury intervals from actual report events. No new games and no inferred disciplinary causes.',cases,counts:Object.fromEntries([...new Set(cases.map(c=>c.explanation))].map(reason=>[reason,cases.filter(c=>c.explanation===reason).length]))};
fs.writeFileSync(path.join(input.endsWith('/world-final')?out:input,preview?'availability-diagnosis-preview.json':'availability-diagnosis.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({cases:cases.length,counts:result.counts},null,2));
