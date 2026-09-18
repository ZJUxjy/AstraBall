import {populationPlayers,populationPlayer} from './population.js';
import {YEAR} from '../world.js';
import {footballTeams} from '../football/data.js';
import {ATTRIBUTE_GROUPS,developWeek,preciseRating,preciseSkill,focusWeights,trainingEfficiency} from '../football/players.js';
import {clamp} from '../football/random.js';
import {dateOf,addDays,daysBetween} from './calendar.js';

const originals=footballTeams.flatMap(t=>t.roster);
const groups=Object.keys(ATTRIBUTE_GROUPS);
const zeroDose=()=>Object.fromEntries(groups.map(group=>[group,0]));
export const defaultTraining={focus:'balanced',load:.6};
export function createDevelopment(date){return {version:1,since:date,through:date,nextWeek:addDays(date,7),records:{},plans:{}};}
export function ensureDevelopment(s){return s.development??=createDevelopment(s.date);}
export function ageOnDate(p,date){const year=Number(date.slice(0,4));return year-(p.birthYear??YEAR-p.age)+daysBetween(dateOf(year,1,1),date)/daysBetween(dateOf(year,1,1),dateOf(year+1,1,1));}
function recordFor(d,p){
 return d.records[p.id]??={attributes:{...p.attributes},sharpness:p.sharpness,startRating:preciseRating(p),seasonYear:Number(d.through.slice(0,4)),seasonRating:preciseRating(p),seasonAttributes:{...p.attributes},minutes:0,appearances:0,seasonMinutes:0,seasonAppearances:0,weekMinutes:0,weekChallenge:0,dose:zeroDose(),healthyDays:0,weekDays:0,history:[{date:d.through,age:Math.floor(ageOnDate(p,d.through)),ability:preciseRating(p),minutes:0}],annual:[]};
}
export function developedPlayer(s,p,date=s.date){
 const r=s.development?.records[p.id];if(p.retiredDate&&date>p.retiredDate)date=p.retiredDate;
 return {...p,age:Math.floor(ageOnDate(p,date)+1e-9),attributes:r?.attributes||p.attributes,sharpness:r?.sharpness??p.sharpness};
}
function enterYear(r,p,date){
 const year=Number(date.slice(0,4));if(r.seasonYear===year)return;
 r.annual.push({year:r.seasonYear,ability:preciseRating({...p,attributes:r.attributes}),gain:preciseRating({...p,attributes:r.attributes})-r.seasonRating,minutes:r.seasonMinutes,appearances:r.seasonAppearances});
 r.seasonYear=year;r.seasonRating=preciseRating({...p,attributes:r.attributes});r.seasonAttributes={...r.attributes};r.seasonMinutes=0;r.seasonAppearances=0;
}
export function advanceDevelopment(s,date){
 const d=ensureDevelopment(s);
 if(date<d.through)throw Error('成长日期不能倒退');
 while(d.through<date){
  const newYear=dateOf(Number(d.through.slice(0,4))+1,1,1);
  const end=[date,d.nextWeek,newYear].sort()[0],days=daysBetween(d.through,end);
  for(const p of populationPlayers(s)){
   const r=recordFor(d,p);r.weekDays??=7-daysBetween(d.through,d.nextWeek);r.weekDays+=days;const plan=d.plans[p.id]||defaultTraining,weights=focusWeights(plan.focus),health=s.playerState[p.id];
   const elapsed=health?Math.max(0,daysBetween(health.date,d.through)):0;
   // Accumulate the same daily doses regardless of how the calendar is advanced.
   // Recovery happens each day, including inside a multi-day advance.
   for(let day=0;day<days;day++){
    const injured=Math.max(0,(health?.injuryDays??p.injuryDays)-elapsed-day);
    const healthy=1-Math.min(1,injured);
    const condition=health?Math.min(100,health.condition+(elapsed+day)*7):100;
    const dose=trainingEfficiency(plan.load)*(.65+.35*clamp(condition/80))*healthy;
    for(const group of groups)r.dose[group]+=weights[group]*dose;
    r.healthyDays+=healthy;
   }
   if(end===d.nextWeek){
    const current={...p,attributes:r.attributes,sharpness:r.sharpness,developmentAge:ageOnDate(p,addDays(end,-r.weekDays))};
    const next=developWeek(current,{days:r.weekDays,minutes:r.weekMinutes,challenge:r.weekMinutes?r.weekChallenge/r.weekMinutes:1,trainingAvailability:r.healthyDays/r.weekDays,trainingDose:Object.fromEntries(groups.map(g=>[g,r.dose[g]/r.weekDays])),load:plan.load});
    r.attributes=next.attributes;r.sharpness=next.sharpness;
    const point={date:end,age:Math.floor(ageOnDate(p,end)),ability:preciseRating(next),minutes:r.seasonMinutes};
    if(r.history.at(-1)?.date.slice(0,7)===end.slice(0,7))r.history[r.history.length-1]=point;else r.history.push(point);
    r.history=r.history.slice(-13);r.weekMinutes=0;r.weekChallenge=0;r.dose=zeroDose();r.healthyDays=0;r.weekDays=0;
   }
   if(end===newYear)enterYear(r,p,end);
  }
  d.through=end;if(end===d.nextWeek)d.nextWeek=addDays(end,7);
 }
}
export function recordDevelopmentMatch(s,input,result,date){
 const d=ensureDevelopment(s);
 for(let side=0;side<2;side++){
  const opponent=side?input.home:input.away;
  const outfield=opponent.roster.filter(p=>p.position!=='GK');
  const opposition=outfield.reduce((n,p)=>n+preciseSkill(p),0)/outfield.length;
  for(const line of result.teams[side].players||[]){
   if(!(line.minutes>0))continue;
   const p=populationPlayer(s,line.id);if(!p)continue;
   const r=recordFor(d,p);enterYear(r,p,date);
   const ability=preciseSkill({...p,attributes:r.attributes});
   const challenge=clamp(1-Math.max(0,ability-opposition-5)/45-Math.max(0,opposition-ability-15)/80,.25,1);
   const minutes=Math.min(line.minutes,result.seconds/60);
   r.minutes+=minutes;r.appearances++;r.seasonMinutes+=minutes;r.seasonAppearances++;
   r.weekMinutes+=minutes;r.weekChallenge+=minutes*challenge;
  }
 }
}
export function setPlayerTraining(s,id,{focus,load}){
 const p=populationPlayer(s,id);if(p?.retired)throw Error('退役球员不能训练');if(!s.manager||p?.club!==s.manager.clubId)throw Error('只能安排本队球员训练');
 if(s.activeMatch)throw Error('请在比赛结束后安排训练');
 focusWeights(focus);if(![.3,.6,.9].includes(load))throw Error('训练负荷无效');
 if(focus==='goalkeeper'&&p.position!=='GK')throw Error('该球员不是门将');
 const d=ensureDevelopment(s);d.plans[id]={focus,load};s.revision++;
}
export function developmentReport(s,p){
 const original=populationPlayer(s,p.id);if(!original)return null;
 const r=s.development?.records[p.id],ability=preciseRating(p);
 return {since:s.development?.since||s.date,plan:s.development?.plans[p.id]||defaultTraining,ability,gain:ability-(r?.seasonRating??ability),totalGain:ability-(r?.startRating??ability),minutes:r?.seasonMinutes||0,appearances:r?.seasonAppearances||0,
  changes:Object.entries(p.attributes).map(([key,value])=>({key,change:value-(r?.seasonAttributes?.[key]??value)})).filter(x=>Math.abs(x.change)>=.05).sort((a,b)=>Math.abs(b.change)-Math.abs(a.change)).slice(0,6),
  history:r?.history||[],annual:r?.annual||[]};
}
export function validateDevelopment(d,population){
 const byId=population?new Map(Object.entries(population.players)):new Map(originals.map(p=>[p.id,p]));
 if(!d)return;
 const validDate=date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;
 if(d.version!==1||!d.records||!d.plans||![d.since,d.through,d.nextWeek].every(validDate)||d.since>d.through||daysBetween(d.through,d.nextWeek)<1||daysBetween(d.through,d.nextWeek)>7)throw Error('成长存档无效');
 for(const [id,plan] of Object.entries(d.plans)){
  if(!byId.has(id)||!plan||![.3,.6,.9].includes(plan.load)||plan.focus==='goalkeeper'&&byId.get(id).position!=='GK')throw Error('训练存档无效');
  focusWeights(plan.focus);
 }
 for(const [id,r] of Object.entries(d.records))if(!byId.has(id)||!r||r.weekDays!=null&&(!Number.isFinite(r.weekDays)||r.weekDays<0||r.weekDays>7)||!groups.every(g=>Number.isFinite(r.dose?.[g])&&r.dose[g]>=0)||!['minutes','appearances','seasonMinutes','seasonAppearances','weekMinutes','weekChallenge','healthyDays'].every(k=>Number.isFinite(r[k])&&r[k]>=0)||!Array.isArray(r.history)||!Array.isArray(r.annual)||!Object.values(ATTRIBUTE_GROUPS).every(g=>Object.keys(g.fields).every(k=>Number.isFinite(r.attributes?.[k])&&r.attributes[k]>=1&&r.attributes[k]<=99&&Number.isFinite(r.seasonAttributes?.[k]))))throw Error('球员成长属性无效');
}
