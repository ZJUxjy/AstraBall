import * as populationDevelopment from './population-development.js';
import {populationPlayers,populationPlayer} from './population.js';
import {YEAR} from '../world.js';
import {registeredPlayers,registeredPlayer,ensurePlayerRegistry,playerAgeOnDate,migrateYouthBodies} from './registry.js';
import {ensureYouthIntake,advanceYouthPathways,youthWeekContext} from './youth.js';
import {ATTRIBUTE_GROUPS,developWeek,preciseRating,preciseSkill,focusWeights,trainingEfficiency} from '../football/players.js';
import {bodyAtAge} from '../football/body.js';
import {dailyWorkload,matchFatigue,fatiguePenalty,workloadAdvice} from '../football/workload.js';
import {prepareAcademyContext,academyTrainingQuality} from './academy.js';
import {clamp} from '../football/random.js';
import {dateOf,addDays,daysBetween} from './calendar.js';
import {resolveParticipant} from './participants.js';

const groups=Object.keys(ATTRIBUTE_GROUPS);
const zeroDose=()=>Object.fromEntries(groups.map(group=>[group,0]));
export const defaultTraining={focus:'balanced',load:.6};
export function createDevelopment(date){return {version:1,since:date,through:date,nextWeek:addDays(date,7),records:{},plans:{}};}
export function ensureDevelopment(s){return s.development??=createDevelopment(s.date);}
export const ageOnDate=(p,date)=>p.birthYear!=null?populationDevelopment.ageOnDate(p,date):playerAgeOnDate(p,date);
const bodyRecord=(p,date)=>p.bodyProfile?bodyAtAge(p,ageOnDate(p,date)):{};
function recordFor(d,p){
 return d.records[p.id]??={attributes:{...p.attributes},sharpness:p.sharpness,startRating:preciseRating(p),seasonYear:Number(d.through.slice(0,4)),seasonRating:preciseRating(p),seasonAttributes:{...p.attributes},minutes:0,appearances:0,seasonMinutes:0,seasonAppearances:0,weekMinutes:0,weekChallenge:0,dose:zeroDose(),healthyDays:0,weekDays:0,history:[{...bodyRecord(p,d.through),date:d.through,age:Math.floor(ageOnDate(p,d.through)),ability:preciseRating(p),minutes:0}],annual:[]};
}
export function developedPlayer(s,p,date=s.date){if(s.population)return populationDevelopment.developedPlayer(s,p,date);
 const current=registeredPlayer(s,p.id)||p,r=s.development?.records[p.id];
 return {...p,...current,...bodyAtAge(current,ageOnDate(current,date)),age:Math.floor(ageOnDate(current,date)+1e-9),attributes:r?.attributes||current.attributes,sharpness:r?.sharpness??current.sharpness};
}
function enterYear(r,p,date){
 const year=Number(date.slice(0,4));if(r.seasonYear===year)return;
 r.annual.push({...bodyRecord(p,date),year:r.seasonYear,ability:preciseRating({...p,attributes:r.attributes}),gain:preciseRating({...p,attributes:r.attributes})-r.seasonRating,minutes:r.seasonMinutes,appearances:r.seasonAppearances,youthMinutes:r.seasonYouthMinutes||0,youthAppearances:r.seasonYouthAppearances||0});
 r.seasonYear=year;r.seasonRating=preciseRating({...p,attributes:r.attributes});r.seasonAttributes={...r.attributes};r.seasonMinutes=0;r.seasonAppearances=0;r.seasonYouthMinutes=0;r.seasonYouthAppearances=0;
}
function exposure(r,date,minutes,kind){
 r.recentExposure=(r.recentExposure||[]).filter(row=>daysBetween(row.date,date)<7);
 const repeat=kind==='senior'&&minutes>=90&&r.recentExposure.some(row=>row.kind==='senior'&&row.minutes>=90);
 r.recentExposure.push({date,minutes,kind});
 if(repeat)r.sharpness=clamp((r.sharpness??80)-8,0,100);
}
function nextMatches(s){
 const dates=new Map(),context={fixturesById:new Map((s.fixtures||[]).map(fixture=>[fixture.id,fixture]))};
 for(const fixture of s.fixtures||[]){
  if(fixture.score!==null||fixture.bye)continue;
  for(const participant of [fixture.home,fixture.away]){const id=resolveParticipant(s,participant,context);if(!id)continue;if(!dates.has(id))dates.set(id,[]);dates.get(id).push(fixture.date);}
 }
 for(const list of dates.values())list.sort();return dates;
}
function upcoming(s,p,date,schedule){
 const reg=s.playerRegistry?.registrations[p.id];
 if(reg?.status==='youth'||reg?.status==='free'){
  for(let n=0;n<=7;n++){const day=addDays(date,n),month=Number(day.slice(5,7));if(month>=2&&month<=11&&new Date(`${day}T12:00:00Z`).getUTCDay()===6)return n;}
  return null;
 }
 const next=schedule.get(p.club)?.find(day=>day>=date&&daysBetween(date,day)<=7);
 return next?daysBetween(date,next):null;
}
export function playerWorkload(s,p,date=s.date){
 const original=registeredPlayer(s,p.id)||p;
 if(!original.growthProfile)return undefined;
 const r=s.development?.records[p.id],health=s.playerState?.[p.id],elapsed=health?Math.max(0,daysBetween(health.date,date)):0;
 const fatigue=r?.fatigue||0,condition=health?Math.min(100,health.condition+elapsed*7):original.condition??100;
 const recentMinutes=(r?.recentExposure||[]).filter(row=>row.date<=date&&daysBetween(row.date,date)<7).reduce((sum,row)=>sum+row.minutes,0);
 const nextMatchDays=upcoming(s,p,date,nextMatches(s)),effectiveCondition=clamp(condition-fatiguePenalty(fatigue),0,100);
 return {fatigue,recentMinutes,nextMatchDays,effectiveCondition,...workloadAdvice({fatigue,recentMinutes,nextMatchDays,condition:effectiveCondition,injured:(health?.injuryDays??p.injuryDays??0)-elapsed>0})};
}
export function advanceDevelopment(s,date){if(s.population)return populationDevelopment.advanceDevelopment(s,date);
 const d=ensureDevelopment(s);
 if(date<d.through)throw Error('成长日期不能倒退');
 ensurePlayerRegistry(s);ensureYouthIntake(s,d.through);migrateYouthBodies(s,d.through);
 const schedule=nextMatches(s);
 while(d.through<date){
  const newYear=dateOf(Number(d.through.slice(0,4))+1,1,1);
  const eventYear=Number(d.through.slice(0,4)),boundaries=[dateOf(eventYear,1,20),dateOf(eventYear,6,30),dateOf(eventYear,12,31)].filter(day=>day>d.through);
  const end=[date,d.nextWeek,newYear,...boundaries].sort()[0],days=daysBetween(d.through,end);
  const calendar=Array.from({length:days},(_,day)=>({start:addDays(d.through,day),end:addDays(d.through,day+1)}));
  prepareAcademyContext(s,d.through,end);
  for(const p of registeredPlayers(s)){
   if(p.ageReferenceDate&&p.ageReferenceDate>=end)continue;
   const r=recordFor(d,p);r.weekDays??=7-daysBetween(d.through,d.nextWeek);r.weekDays+=days;const plan=d.plans[p.id]||defaultTraining,weights=focusWeights(plan.focus),health=s.playerState[p.id];
   const elapsed=health?Math.max(0,daysBetween(health.date,d.through)):0;
   const youth=youthWeekContext(s,{...p,attributes:r.attributes},d.through,end);
   const youthFixtures=new Map((youth.fixtures||[]).map(fixture=>[fixture.date,fixture]));
   // Close one training day at a time; a youth match then affects the next day.
   // This ordering is identical for whole, split and restored advances.
   for(let day=0;day<days;day++){
    const tick=calendar[day],injured=Math.max(0,(health?.injuryDays??p.injuryDays)-elapsed-day);
    const healthy=1-Math.min(1,injured),condition=health?Math.min(100,health.condition+(elapsed+day)*7):100;
    let dose=trainingEfficiency(plan.load)*(.65+.35*clamp(condition/80))*healthy;
    if(p.growthProfile){
     const work=dailyWorkload({fatigue:r.fatigue||0,load:plan.load,condition,injured:injured>0,fitness:r.attributes.naturalFitness,nextMatchDays:upcoming(s,p,tick.start,schedule)});
     r.fatigue=work.fatigue;dose=work.dose*academyTrainingQuality(s,p,tick.end);
    }
    for(const group of groups)r.dose[group]+=weights[group]*dose;
    r.healthyDays+=healthy;
    const fixture=youthFixtures.get(tick.end);
    const remainingInjury=health?Math.max(0,health.injuryDays-daysBetween(health.date,tick.end)):p.injuryDays||0;
    if(fixture&&remainingInjury<=0){
     const minutes=fixture.minutes;
     r.lastYouthMatchDate=fixture.date;
     r.youthMinutes=(r.youthMinutes||0)+minutes;r.seasonYouthMinutes=(r.seasonYouthMinutes||0)+minutes;
     r.youthAppearances=(r.youthAppearances||0)+1;r.seasonYouthAppearances=(r.seasonYouthAppearances||0)+1;
     r.weekMinutes+=minutes;r.weekChallenge+=minutes*fixture.challenge;
     exposure(r,fixture.date,minutes,'youth');
     if(p.growthProfile)r.fatigue=matchFatigue(r.fatigue,minutes);
    }
   }
   if(r.recentExposure)r.recentExposure=r.recentExposure.filter(row=>daysBetween(row.date,end)<7);
   if(end===d.nextWeek){
    const current={...p,attributes:r.attributes,sharpness:r.sharpness,developmentAge:ageOnDate(p,addDays(end,-r.weekDays))};
    const next=developWeek(current,{days:r.weekDays,minutes:r.weekMinutes,challenge:r.weekMinutes?r.weekChallenge/r.weekMinutes:1,trainingAvailability:r.healthyDays/r.weekDays,trainingDose:Object.fromEntries(groups.map(g=>[g,r.dose[g]/r.weekDays])),load:plan.load});
    r.attributes=next.attributes;r.sharpness=next.sharpness;
    const point={...bodyRecord(p,end),date:end,age:Math.floor(ageOnDate(p,end)),ability:preciseRating(next),minutes:r.seasonMinutes};
    if(r.history.at(-1)?.date.slice(0,7)===end.slice(0,7))r.history[r.history.length-1]=point;else r.history.push(point);
    r.history=r.history.slice(-13);r.weekMinutes=0;r.weekChallenge=0;r.dose=zeroDose();r.healthyDays=0;r.weekDays=0;
   }
   if(end===newYear)enterYear(r,p,end);
  }
  d.through=end;if(end===d.nextWeek)d.nextWeek=addDays(end,7);
  advanceYouthPathways(s,end);ensureYouthIntake(s,end);
 }
}
export function recordDevelopmentMatch(s,input,result,date){if(s.population)return populationDevelopment.recordDevelopmentMatch(s,input,result,date);
 const d=ensureDevelopment(s);
 for(let side=0;side<2;side++){
  const opponent=side?input.home:input.away;
  const outfield=opponent.roster.filter(p=>p.position!=='GK');
  const opposition=outfield.reduce((n,p)=>n+preciseSkill(p),0)/outfield.length;
  for(const line of result.teams[side].players||[]){
   if(!(line.minutes>0))continue;
   const p=registeredPlayer(s,line.id);if(!p)continue;
   const r=recordFor(d,p);enterYear(r,p,date);
   const ability=preciseSkill({...p,attributes:r.attributes});
   const challenge=clamp(1-Math.max(0,ability-opposition-5)/45-Math.max(0,opposition-ability-15)/80,.25,1);
   const minutes=Math.min(line.minutes,result.seconds/60);
   r.minutes+=minutes;r.appearances++;r.seasonMinutes+=minutes;r.seasonAppearances++;
   r.lastMatchDate=date;
   exposure(r,date,minutes,'senior');
   if(p.growthProfile)r.fatigue=matchFatigue(r.fatigue,minutes);
   r.weekMinutes+=minutes;r.weekChallenge+=minutes*challenge;
  }
 }
}
export function setPlayerTraining(s,id,{focus,load}){if(s.population)return populationDevelopment.setPlayerTraining(s,id,{focus,load});
 const p=registeredPlayer(s,id);if(p?.retired)throw Error('退役球员不能训练');if(!s.manager||p?.club!==s.manager.clubId)throw Error('只能安排本队球员训练');
 const registration=s.playerRegistry?.registrations?.[id];
 if(registration?.pathway==='royal'&&!registration.signedAt)throw Error('学院负责未签约球员的训练');
 if(s.activeMatch)throw Error('请在比赛结束后安排训练');
 focusWeights(focus);if(![.3,.6,.9].includes(load))throw Error('训练负荷无效');
 if(focus==='goalkeeper'&&p.position!=='GK')throw Error('该球员不是门将');
 const d=ensureDevelopment(s);d.plans[id]={focus,load};s.revision++;
}
export function developmentReport(s,p){if(s.population)return populationDevelopment.developmentReport(s,p);
 const original=registeredPlayer(s,p.id);if(!original)return null;
 const r=s.development?.records[p.id],ability=preciseRating(p);
 const currentBody=bodyRecord(original,s.date),startDate=[dateOf(Number(s.date.slice(0,4)),1,1),original.ageReferenceDate||s.date].sort().at(-1),startBody=bodyRecord(original,startDate);
 const body=original.bodyProfile?{...currentBody,heightChange:currentBody.height-startBody.height,weightChange:currentBody.weight-startBody.weight}:undefined;
 return {body,workload:playerWorkload(s,p),since:s.development?.since||s.date,plan:s.development?.plans[p.id]||defaultTraining,ability,gain:ability-(r?.seasonRating??ability),totalGain:ability-(r?.startRating??ability),minutes:r?.seasonMinutes||0,appearances:r?.seasonAppearances||0,
  changes:Object.entries(p.attributes).map(([key,value])=>({key,change:value-(r?.seasonAttributes?.[key]??value)})).filter(x=>Math.abs(x.change)>=.05).sort((a,b)=>Math.abs(b.change)-Math.abs(a.change)).slice(0,6),
  youthMinutes:r?.seasonYouthMinutes||0,youthAppearances:r?.seasonYouthAppearances||0,history:r?.history||[],annual:r?.annual||[]};
}
export function validateDevelopment(d,s={}){if(s.population)return populationDevelopment.validateDevelopment(d,s.population);
 if(!d)return;
 const byId=new Map(registeredPlayers(s,{includeRetired:true}).map(p=>[p.id,p]));
 const validDate=date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;
 if(d.version!==1||!d.records||!d.plans||![d.since,d.through,d.nextWeek].every(validDate)||d.since>d.through||daysBetween(d.through,d.nextWeek)<1||daysBetween(d.through,d.nextWeek)>7)throw Error('成长存档无效');
 for(const [id,plan] of Object.entries(d.plans)){
  if(!byId.has(id)||!plan||![.3,.6,.9].includes(plan.load)||plan.focus==='goalkeeper'&&byId.get(id).position!=='GK')throw Error('训练存档无效');
  focusWeights(plan.focus);
 }
 const finiteBetween=(value,low,high)=>Number.isFinite(value)&&value>=low&&value<=high;
 for(const [id,r] of Object.entries(d.records)){
  if(!byId.has(id)||!r||!groups.every(g=>Number.isFinite(r.dose?.[g])&&r.dose[g]>=0)||!['minutes','appearances','seasonMinutes','seasonAppearances','weekMinutes','weekChallenge','healthyDays'].every(k=>Number.isFinite(r[k])&&r[k]>=0)||!Array.isArray(r.history)||!Array.isArray(r.annual)||!Object.values(ATTRIBUTE_GROUPS).every(g=>Object.keys(g.fields).every(k=>finiteBetween(r.attributes?.[k],1,99)&&finiteBetween(r.seasonAttributes?.[k],1,99))))throw Error('球员成长属性无效');
  if(!finiteBetween(r.sharpness,0,100)||!finiteBetween(r.startRating,1,200)||!finiteBetween(r.seasonRating,1,200)||!Number.isInteger(r.seasonYear)||r.seasonYear<YEAR||r.healthyDays>7)throw Error('球员成长记录无效');
  for(const field of ['youthMinutes','youthAppearances','seasonYouthMinutes','seasonYouthAppearances'])if(r[field]!==undefined&&(!Number.isFinite(r[field])||r[field]<0))throw Error('青年比赛记录无效');
  if(r.fatigue!==undefined&&!finiteBetween(r.fatigue,0,100))throw Error('训练疲劳记录无效');
  if(r.recentExposure!==undefined&&(!Array.isArray(r.recentExposure)||r.recentExposure.some(row=>!validDate(row.date)||row.date>d.through||!finiteBetween(row.minutes,0,150)||!['senior','youth'].includes(row.kind))))throw Error('近期出场记录无效');
  for(const field of ['lastMatchDate','lastYouthMatchDate'])if(r[field]!==undefined&&!validDate(r[field]))throw Error('出场日期无效');
  for(const point of [...r.history,...r.annual])if((point.height!==undefined||point.weight!==undefined)&&(!finiteBetween(point.height,100,230)||!finiteBetween(point.weight,25,180)))throw Error('身体发育历史无效');
  if(r.history.some(point=>!validDate(point.date)||point.date>d.through||!finiteBetween(point.ability,1,200)||!Number.isFinite(point.age)||!Number.isFinite(point.minutes)||point.minutes<0))throw Error('成长历史无效');
  if(r.annual.some(point=>!Number.isInteger(point.year)||!finiteBetween(point.ability,1,200)||!Number.isFinite(point.gain)||!Number.isFinite(point.minutes)||point.minutes<0||!Number.isFinite(point.appearances)||point.appearances<0))throw Error('年度成长记录无效');
 }
}
