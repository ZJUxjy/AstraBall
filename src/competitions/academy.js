import {seniorTeams,allKnownTeams,knownTeam} from './team-directory.js';
import {isMetroLeague,METRO_SYSTEMS} from './catalog.js';
import {footballTeams} from '../football/data.js';
import {preciseRating,preciseSkill,available} from '../football/players.js';
import {fatiguePenalty} from '../football/workload.js';
import {clamp,rng} from '../football/random.js';
import {getDivision} from './catalog.js';
import {addDays,daysBetween} from './calendar.js';
import {ensurePlayerRegistry,registryDate,playerAgeOnDate,registeredRoster} from './registry.js';
import {fixtureSides} from './participants.js';

const teams={get:knownTeam,has:id=>Boolean(knownTeam(id))};
const selections=new Set(['balanced','development','competitive']);
const focusCapacity=2,contexts=new WeakMap(),memberLevels=new WeakMap();
const qualityJitter=new Map(allKnownTeams.map(t=>[t.id,(rng(`academy-quality:${t.id}`).next()-.5)*.03]));
const slots=['GK','CB','CB','LB','RB','DM','CM','AM','LW','RW','ST'];
const families={GK:'keeper',CB:'centreback',LB:'fullback',RB:'fullback',DM:'midfield',CM:'midfield',AM:'midfield',LW:'forward',RW:'forward',ST:'forward'};
const stateOn=(reg,date)=>reg?.history?.findLast(h=>h.date<date);
const controlled=(reg,clubId)=>reg?.pathway==='local'&&reg.status==='youth'&&reg.clubId===clubId&&reg.ownerClubId===clubId;
function levelOf(s,clubId){
 if(s.members){let levels=memberLevels.get(s.members);if(!levels){levels=new Map();for(const [id,clubs] of Object.entries(s.members))for(const club of clubs)levels.set(club,getDivision(id)?.tier||1);memberLevels.set(s.members,levels);}return levels.get(clubId)||1;}
 return getDivision(teams.get(clubId)?.division)?.tier||1;
}
function qualityOf(s,clubId){return Math.round((1.035-(levelOf(s,clubId)-1)*.035+(qualityJitter.get(clubId)||0))*1000)/1000;}
function planOn(s,clubId,date){return s.playerRegistry?.academies?.[clubId]?.history.findLast(h=>h.date<date)||{selection:'balanced',focusPlayers:[]};}
function activeFocus(s,clubId,ids,date){return ids.filter(id=>{const reg=s.playerRegistry?.registrations[id],state=date?stateOn(reg,date):reg;return reg?.pathway==='local'&&state?.status==='youth'&&state.clubId===clubId&&state.ownerClubId===clubId;});}

export function academyReport(s,clubId=s.manager?.clubId){
 if(!teams.has(clubId))throw Error('青训俱乐部不存在');
 const r=ensurePlayerRegistry(s),plan=r.academies?.[clubId]?.history.at(-1)||{selection:'balanced',focusPlayers:[]};
 const players=Object.values(r.players).filter(p=>r.registrations[p.id]?.status==='youth'&&r.registrations[p.id].clubId===clubId).map(p=>({id:p.id,name:p.name,position:p.position,ability:Math.round(preciseRating({...p,attributes:s.development?.records?.[p.id]?.attributes||p.attributes}))}));
 return {level:levelOf(s,clubId),quality:qualityOf(s,clubId),focusCapacity,focusPlayers:activeFocus(s,clubId,plan.focusPlayers),selection:plan.selection,managed:s.manager?.clubId===clubId&&!isMetroLeague(teams.get(clubId).league),players,effectiveFrom:plan.date?addDays(plan.date,1):null};
}
export function setAcademyPlan(s,{selection,focusPlayers}={}){
 if(s.activeMatch)throw Error('请在比赛结束后调整青训安排');
 const clubId=s.manager?.clubId;if(!teams.has(clubId))throw Error('请先接手俱乐部');
 if(isMetroLeague(teams.get(clubId).league))throw Error('皇家学院由学院负责培养');
 const report=academyReport(s,clubId),next={selection:selection??report.selection,focusPlayers:focusPlayers??report.focusPlayers};
 if(!selections.has(next.selection)||!Array.isArray(next.focusPlayers)||next.focusPlayers.length>focusCapacity||new Set(next.focusPlayers).size!==next.focusPlayers.length||next.focusPlayers.some(id=>!controlled(s.playerRegistry.registrations[id],clubId)))throw Error('青训安排无效：重点名额最多两人，限本队地方青年');
 const r=ensurePlayerRegistry(s);r.academies??={};const academy=r.academies[clubId]??={history:[]};
 if(academy.history.at(-1)?.date>s.date)throw Error('青训安排日期不能倒退');
 const entry={date:s.date,selection:next.selection,focusPlayers:[...next.focusPlayers]};
 if(academy.history.at(-1)?.date===s.date)academy.history[academy.history.length-1]=entry;else academy.history.push(entry);
 contexts.delete(s);s.revision=(s.revision||0)+1;return academyReport(s,clubId);
}
export function academyTrainingQuality(s,p,date=s.date){
 const reg=s.playerRegistry?.registrations[p.id],state=stateOn(reg,date);
 if(!state||state.status!=='youth')return 1;
 const plan=planOn(s,state.clubId,date),focus=activeFocus(s,state.clubId,plan.focusPlayers,date);
 return qualityOf(s,state.clubId)*(focus.length?(focus.includes(p.id)?1.08:.98):1);
}
export function validateAcademies(s){
 const academies=s.playerRegistry?.academies;if(academies===undefined)return s;
 if(!academies||typeof academies!=='object'||Array.isArray(academies))throw Error('青训安排存档无效');
 for(const [clubId,academy] of Object.entries(academies)){
  if(!teams.has(clubId)||isMetroLeague(teams.get(clubId).league)||!academy||!Array.isArray(academy.history)||!academy.history.length)throw Error('青训安排存档无效');
  let last='';for(const plan of academy.history){
   if(!registryDate(plan.date)||plan.date<=last||plan.date>s.date||!selections.has(plan.selection)||!Array.isArray(plan.focusPlayers)||plan.focusPlayers.length>focusCapacity||new Set(plan.focusPlayers).size!==plan.focusPlayers.length||plan.focusPlayers.some(id=>{
    const reg=s.playerRegistry.registrations[id],eligible=reg?.history?.some((h,i)=>h.date<=plan.date&&(!reg.history[i+1]||reg.history[i+1].date>=plan.date)&&h.status==='youth'&&h.clubId===clubId&&h.ownerClubId===clubId);return !s.playerRegistry.players[id]||reg.pathway!=='local'||!eligible;
   }))throw Error('青训安排历史无效');last=plan.date;
  }
 }
 return s;
}

function fit(position,slot){if(position==='GK'||slot==='GK')return position===slot?0:100;if(position===slot)return 0;if(families[position]===families[slot])return 4;return 12;}
function healthOn(s,p,date){const h=s.playerState?.[p.id],elapsed=h?Math.max(0,daysBetween(h.date,date)):0;return {injury:Math.max(0,(h?.injuryDays??p.injuryDays??0)-elapsed),condition:h?clamp(h.condition+elapsed*7,0,100):100};}
function buildLineup(s,clubId,players,date,competitions=[]){
 const selection=planOn(s,clubId,date).selection,level=levelOf(s,clubId),candidates=[];
 const senior=s.economy?.financeVersion&&competitions.length?registeredRoster(s,clubId):[];
 const ready=(p,competition)=>{const h=healthOn(s,p,date),r=s.development?.records?.[p.id];return available({...p,injuryDays:h.injury,condition:h.condition-fatiguePenalty(r?.fatigue),suspended:s.discipline?.[`${competition}/${p.id}`]?.ban||0,playedToday:[r?.lastMatchDate,r?.lastYouthMatchDate].includes(date)});};
 const contracted=players.filter(p=>s.playerRegistry.registrations[p.id]?.pathway==='local'&&s.economy?.contracts[p.id]?.club===clubId&&playerAgeOnDate(p,date)>=17&&playerAgeOnDate(p,date)<21);
 const reserveForSenior=Boolean(s.economy?.financeVersion)&&competitions.some(c=>senior.filter(p=>ready(p,c)).length<18);
 const emergency=Boolean(s.economy?.financeVersion)&&competitions.some(c=>[...senior,...contracted].filter(p=>ready(p,c)).length<11);
 for(const p of players){
  const health=healthOn(s,p,date),record=s.development?.records?.[p.id];if(health.injury>0||health.condition<40||record?.lastMatchDate===date)continue;
  const age=playerAgeOnDate(p,date);
  if(reserveForSenior&&s.playerRegistry.registrations[p.id]?.pathway==='local'&&age>=(emergency?16:17)&&age<21&&s.economy.contracts[p.id]?.club===clubId)continue;
  candidates.push({id:p.id,position:p.position,age:playerAgeOnDate(p,date),ability:preciseSkill({...p,attributes:record?.attributes||p.attributes}),condition:health.condition,background:false});
 }
 // The saved three-player intake is a shortlist, not the entire academy.
 // Stable background teammates occupy the remaining first-team and bench seats.
 for(let i=0;i<slots.length*2;i++){
  const random=rng(`academy-background:${clubId}:${Math.floor(i/slots.length)}:${i%slots.length}`);
  candidates.push({id:`background:${i}`,position:slots[i%slots.length],age:16+random.next()*2,ability:51.5-(level-1)*1.8+random.normal()*3.5,condition:100,background:true});
 }
 for(const p of candidates)p.selectionScore=p.ability-(100-p.condition)*.1+(selection==='development'?(18-p.age)*1.5:0)+rng(`academy-rotation:${clubId}:${date}:${p.id}`).normal()*(selection==='competitive'?1:selection==='development'?7:3.5);
 const ranking=(p,slot)=>p.selectionScore-fit(p.position,slot);
 const chosen=new Set(),starters=[];
 for(const slot of slots){const candidate=candidates.filter(p=>!chosen.has(p.id)).sort((a,b)=>ranking(b,slot)-ranking(a,slot)||a.id.localeCompare(b.id))[0];chosen.add(candidate.id);starters.push({slot,p:candidate,minutes:90});}
 const subs=[];
 for(const starter of starters){
  if(starter.slot==='GK')continue;
  const candidate=candidates.filter(p=>!chosen.has(p.id)&&p.position!=='GK').sort((a,b)=>ranking(b,starter.slot)-ranking(a,starter.slot)||a.id.localeCompare(b.id))[0];
  if(candidate)subs.push({starter,p:candidate,score:ranking(candidate,starter.slot)});
 }
 const subMinutes=selection==='development'?30:selection==='competitive'?10:20;
 const selectedSubs=[];for(const sub of subs.sort((a,b)=>b.score-a.score||a.p.id.localeCompare(b.p.id))){if(selectedSubs.length===5)break;if(chosen.has(sub.p.id))continue;chosen.add(sub.p.id);sub.starter.minutes-=subMinutes;selectedSubs.push({p:sub.p,minutes:subMinutes,slot:sub.starter.slot});}
 const rows=[...starters,...selectedSubs],opposition=51.5-(level-1)*1.8;
 return {clubId,date,selection,totalMinutes:rows.reduce((sum,p)=>sum+p.minutes,0),players:rows.filter(row=>!row.p.background).map(({p,minutes,slot})=>({id:p.id,position:slot,date,minutes,challenge:clamp(1-Math.max(0,p.ability-opposition-5)/45-Math.max(0,opposition-p.ability-15)/80,.25,1)}))};
}
// Freeze selection before the per-player growth loop mutates any attributes.
// One world scan per segment and one small club roster sort per match date.
export function prepareAcademyContext(s,start,end){
 const context={start,end,revision:s.revision||0,lineups:new Map(),fixtures:new Map()},r=s.playerRegistry;
 const dates=[];for(let date=addDays(start,1);date<=end;date=addDays(date,1))if(Number(date.slice(5,7))>=2&&Number(date.slice(5,7))<=11&&new Date(`${date}T12:00:00Z`).getUTCDay()===6)dates.push(date);
 if(r&&dates.length){
  const all=Object.values(r.players);
  for(const date of dates){
   const firstTeam=new Map();if(s.economy?.financeVersion)for(const m of s.fixtures||[]){if(m.date!==date||m.bye)continue;for(const club of Object.values(fixtureSides(s,m))){if(!club)continue;const list=firstTeam.get(club)||[];list.push(m.competition);firstTeam.set(club,list);}}
   const clubs=new Map();for(const p of all){const state=stateOn(r.registrations[p.id],date);if(state?.status!=='youth')continue;if(!clubs.has(state.clubId))clubs.set(state.clubId,[]);clubs.get(state.clubId).push(p);}
   for(const [clubId,players] of clubs){const lineup=buildLineup(s,clubId,players,date,firstTeam.get(clubId)||[]);context.lineups.set(`${clubId}/${date}`,lineup);for(const fixture of lineup.players){const list=context.fixtures.get(fixture.id)||[];list.push(fixture);context.fixtures.set(fixture.id,list);}}
  }
 }
 contexts.set(s,context);return context;
}
export function academyFixtures(s,p,start,end){let context=contexts.get(s);if(!context||context.start!==start||context.end!==end||context.revision!==(s.revision||0))context=prepareAcademyContext(s,start,end);return context.fixtures.get(p.id)||[];}
export function academyLineup(s,clubId,date){const context=prepareAcademyContext(s,addDays(date,-1),date);return context.lineups.get(`${clubId}/${date}`)||{clubId,date,totalMinutes:0,players:[]};}
