import {toAbility,toSkill} from '../football/ability.js';
import {seniorTeams,allKnownTeams,knownTeam} from './team-directory.js';
import {isMetroLeague,METRO_SYSTEMS} from './catalog.js';
import {invalidateRosterIndex} from './registry.js';
import {YEAR} from '../world.js';
import {registryMovement} from './market.js';
import {footballTeams} from '../football/data.js';
import {generateYouthPlayer,preciseRating,preciseSkill,POSITIONS} from '../football/players.js';
import {rng,clamp} from '../football/random.js';
import {getDivision,getSystem} from './catalog.js';
import {draftOrder} from './season.js';
import {dateOf,addDays,daysBetween} from './calendar.js';
import {academyFixtures,academyTrainingQuality} from './academy.js';
import {recruitmentContext,recruitmentOrder,lacksPlayingTime,loanDestinations,transferCandidates,inRecruitmentWindow} from './recruitment.js';
import {ensurePlayerRegistry,registeredPlayers,registeredPlayer,registeredRoster as baseRegisteredRoster,registryDate,playerAgeOnDate} from './registry.js';

const teamById={get:knownTeam,has:id=>Boolean(knownTeam(id))};
const youthAge=playerAgeOnDate;
const rosterContexts=new WeakMap();
const recruitmentContexts=new WeakMap();
const registeredRoster=(s,id)=>rosterContexts.get(s)?.get(id)||baseRegisteredRoster(s,id);
function beginRosterContext(s){const map=new Map(seniorTeams(s).map(t=>[t.id,[]]));for(const p of registeredPlayers(s))if(p.club&&(!p.registrationStatus||['senior','loan'].includes(p.registrationStatus)))map.get(p.club)?.push(p);rosterContexts.set(s,map);}
const currentPlayer=(s,p,date=s.date)=>({...p,age:Math.floor(youthAge(p,date)+1e-9),attributes:s.development?.records[p.id]?.attributes||p.attributes});
const divisionOf=(s,id)=>Object.keys(s.members||{}).find(d=>s.members[d].includes(id))||teamById.get(id)?.division;
const ability=(s,p,date=s.date)=>preciseSkill(currentPlayer(s,p,date));
function clubStandard(s,id,standards){
 if(standards?.has(id))return standards.get(id);
 const roster=registeredRoster(s,id).map(p=>ability(s,p)).sort((a,b)=>b-a);
 return roster[Math.min(10,roster.length-1)]||60;
}
function emit(r,p,date,type,text,fromClubId=null){
 const reg=r.registrations[p.id];r.events.push({id:`${p.id}:${r.events.length}`,playerId:p.id,date,type,clubId:reg.clubId,fromClubId,text});
 // Lifetime movements remain in each registration's history; the feed is bounded.
 if(r.events.length>4000)r.events=r.events.slice(-4000);
}
function canLeave(s,p,clubId,{goalkeepers=1}={}){
 const roster=registeredRoster(s,clubId).filter(q=>q.id!==p.id);
 return roster.length>=11&&(p.position!=='GK'||roster.filter(q=>q.position==='GK').length>=goalkeepers);
}
function hasSeat(s,clubId,p,date=s.date){
 const roster=registeredRoster(s,clubId).filter(q=>q.id!==p.id);
 return roster.length<40&&(youthAge(p,date)<21||roster.filter(q=>youthAge(q,date)>=21).length<25);
}
function move(s,id,date,status,clubId,changes={},type=status,text){
 const r=ensurePlayerRegistry(s),p=r.players[id]||registeredPlayer(s,id),reg=r.registrations[id],from=reg.clubId;
 if(!p||date<reg.statusSince)throw Error('球员流转日期无效');
 if(!registryMovement(s,{...p,club:reg.clubId,birthYear:(p.ageReferenceDate?Number(p.ageReferenceDate.slice(0,4)):YEAR)-p.age},reg,{date,status,clubId,ownerClubId:changes.ownerClubId??reg.ownerClubId,type}))return false;
 Object.assign(reg,{status,clubId,statusSince:date,loanUntil:null},changes);invalidateRosterIndex(s);
 reg.history.push({date,status,clubId,ownerClubId:reg.ownerClubId});
 if(['senior','loan'].includes(status)){const numbers=new Set(registeredRoster(s,clubId).filter(q=>q.id!==id).map(q=>q.number));let number=reg.number||p.number||1;while(numbers.has(number))number++;reg.number=number;if(r.players[id])p.number=number;}
 const context=rosterContexts.get(s);if(context){if(from&&context.has(from))context.set(from,context.get(from).filter(q=>q.id!==id));if(clubId&&['senior','loan'].includes(status)&&context.has(clubId))context.set(clubId,[...context.get(clubId).filter(q=>q.id!==id),registeredPlayer(s,id)]);}
 recruitmentContexts.get(s)?.invalidate(from,clubId);
 emit(r,p,date,type,text||({youth:'继续青训',senior:'进入一线队',loan:'租借加盟',free:'进入自由球员池',retired:'结束球员生涯'}[status]),from);
}

export function ensureYouthIntake(s,date=s.date){
 if(!registryDate(date))throw Error('青训日期无效');
 const registry=ensurePlayerRegistry(s),year=Number(date.slice(0,4));
 const cohorts=new Set(registry.cohorts.map(cohort=>cohort.id));
 // A migrated save starts its first cohort now; it never receives retroactive training.
 for(const [index,club] of seniorTeams(s).entries()){
  const cohortId=`${year}:${club.id}`;if(cohorts.has(cohortId))continue;
  const pathway=isMetroLeague(club.league)?'royal':'local',academyId=pathway==='royal'?(index%2?'horizon':'morning'):club.id==='bridge'?'bridge-academy':club.id==='iron-fc'?'iron-academy':`${club.id}-academy`;
  const playerIds=[],random=rng(`intake:${cohortId}`),positions=Object.keys(POSITIONS),region=getSystem(club.league)?.region||'metro';
  for(let i=0;i<3;i++){
   const id=`youth:${cohortId}:${i}`,p=generateYouthPlayer({id,seed:`intake:${year}`,age:15+i,position:positions[random.int(0,positions.length-1)],region,identity:{city:club.city,club:club.id,ageReferenceDate:date,academyId,academyClubId:club.id,pathway}});
   Object.assign(p,{ageReferenceDate:date,academyId,academyClubId:club.id,pathway,number:30+i,training:[{academy:academyId,from:year,to:null,graduated:false}]});
   registry.players[id]=p;registry.registrations[id]={clubId:club.id,ownerClubId:pathway==='local'?club.id:null,academyClubId:club.id,academyId,pathway,status:'youth',statusSince:date,joinedAt:date,loanUntil:null,history:[{date,status:'youth',clubId:club.id,ownerClubId:pathway==='local'?club.id:null}]};
   playerIds.push(id);emit(registry,p,date,'intake',pathway==='royal'?'进入皇家学院':'进入俱乐部青训');
  }
  registry.cohorts.push({id:cohortId,year,date,clubId:club.id,pathway,academyId,playerIds});
 }
 return registry;
}

export function youthPlayers(s,clubId=s.manager?.clubId){
 const r=ensurePlayerRegistry(s);
 return Object.keys(r.players).map(id=>registeredPlayer(s,id)).filter(p=>{
  const reg=r.registrations[p.id];return !p.retired&&(!clubId||reg.clubId===clubId||reg.ownerClubId===clubId||reg.academyClubId===clubId||reg.rightsClubId===clubId);
 }).map(p=>({...p,registration:{...r.registrations[p.id]}}));
}
function observationEvidence(s,p){
 const record=s.development?.records[p.id],history=record?.history||[],latest=history.at(-1);
 return {through:latest?.date||p.ageReferenceDate,minutes:(record?.minutes||0)+(record?.youthMinutes||0),matches:(record?.appearances||0)+(record?.youthAppearances||0),ability:ability(s,p),history};
}
function observerClub(s,clubId){const id=clubId||s.manager?.clubId;if(!teamById.has(id))throw Error('请先接手俱乐部');return id;}
export function youthObservation(s,id,clubId){
 const r=ensurePlayerRegistry(s),observer=clubId||s.manager?.clubId;
 const report=r.observations[`${observer}/${id}`];return report?structuredClone(report):null;
}
function canObserve(s,p,clubId){
 const report=youthObservation(s,p.id,clubId);if(!report)return true;
 const evidence=observationEvidence(s,p);
 return daysBetween(report.updatedAt,s.date)>=14&&(evidence.through>report.evidenceThrough||evidence.minutes>report.evidenceMinutes);
}
export function observeYouth(s,id,{clubId}={}){
 if(s.activeMatch)throw Error('请在比赛结束后观察球员');
 const r=ensurePlayerRegistry(s),p=registeredPlayer(s,id),observer=observerClub(s,clubId);
 if(!r.players[id]||p.retired)throw Error('青训球员不存在');
 const old=youthObservation(s,id,observer);if(!canObserve(s,p,observer))return old;
 const evidence=observationEvidence(s,p),age=youthAge(p,s.date),points=evidence.history,earlier=points.find(point=>daysBetween(point.date,s.date)>=90),span=earlier?Math.max(90,daysBetween(earlier.date,s.date)):0;
 const trend=earlier?clamp((evidence.ability-toSkill(earlier.ability))*365.25/span,-3,9):null;
 const bias=rng(`scout:${observer}:${id}`).normal()*3.5,observedMatches=evidence.matches;
 const samples=(old?.samples||0)+1,width=Math.max(7,15-Math.min(5,observedMatches/5)-Math.min(3,samples-1));
 const expectedGrowth=Math.max(0,23-age)*(trend===null?2.3:clamp(trend*.62,.5,4));
 const projected=clamp(evidence.ability+expectedGrowth+bias,25,96);
 const notes=[];
 if(age<18)notes.push('青年比赛表现尚待成年赛事验证');
 if(trend!==null)notes.push(trend>3?'近阶段进步较快':trend<.5?'近阶段成长较慢':'近阶段持续进步');
 if(!(s.development?.records[id]?.minutes>0))notes.push('暂无成年正式比赛记录');
 const report={playerId:id,observerClubId:observer,updatedAt:s.date,evidenceThrough:evidence.through,evidenceMinutes:evidence.minutes,samples,observedMatches,forecastLow:Math.round(toAbility(clamp(projected-width,1,99))),forecastHigh:Math.round(toAbility(clamp(projected+width,1,99))),confidence:samples>=4&&observedMatches>=20?'中等':'较低',currentAbility:Math.round(toAbility(evidence.ability)),trend,notes};
 r.observations[`${observer}/${id}`]=report;s.revision=(s.revision||0)+1;return structuredClone(report);
}

function loanOptions(s,p,reg,standards){
 const context=recruitmentContexts.get(s)||recruitmentContext(s,s.date,id=>registeredRoster(s,id));
 return loanDestinations(context,p,reg,(id,player)=>hasSeat(s,id,player,context.date));
}
export function youthOpportunities(s,id){
 const r=ensurePlayerRegistry(s),p=registeredPlayer(s,id),reg=r.registrations[id],clubId=s.manager?.clubId;
 if(!r.players[id]||!reg||p.retired||!clubId)return {actions:[],loans:[],canObserve:false,reason:'没有可执行的培养操作'};
 const age=youthAge(p,s.date),owned=reg.ownerClubId===clubId||reg.pathway==='local'&&reg.status==='youth'&&reg.academyClubId===clubId,actions=[];
 if(owned&&reg.status==='youth'){
  if(age<20)actions.push('retain');
  if(reg.pathway==='local'&&age>=17&&hasSeat(s,clubId,p))actions.push('promote');
  actions.push('release');
 }
 if(owned&&reg.status==='senior'&&canLeave(s,p,reg.clubId))actions.push('release');
 const loans=owned&&['youth','senior'].includes(reg.status)&&age>=17&&(reg.pathway==='local'||reg.signedAt)&&(reg.status!=='senior'||canLeave(s,p,reg.clubId))?loanOptions(s,p,reg):[];
 if(loans.length)actions.push('loan');
 const rightsAvailable=!reg.rightsClubId||reg.rightsClubId===clubId||reg.rightsUntil<s.date;
 const draftComplete=reg.pathway!=='royal'||reg.draftEnteredYear||age>23;
 if(reg.status==='free'&&age>=17&&rightsAvailable&&draftComplete&&hasSeat(s,clubId,p))actions.push('sign');
 return {actions,loans,canObserve:canObserve(s,p,clubId),reason:reg.pathway==='royal'&&reg.status==='youth'?'皇家学院毕业后参加选秀':reg.status==='loan'?'租期结束后归队':reg.rightsClubId&&reg.status==='free'?'选秀签约权有效期内':''};
}
export function setYouthPath(s,id,path,options={}){
 if(s.activeMatch)throw Error('请在比赛结束后调整培养路径');
 if(!s.manager)throw Error('请先接手俱乐部');
 const opportunities=youthOpportunities(s,id);if(!opportunities.actions.includes(path))throw Error('当前球员不能选择该培养路径');
 const r=ensurePlayerRegistry(s),reg=r.registrations[id],clubId=s.manager.clubId,date=s.date,beforeMoves=reg.history.length;
 if(path==='retain'){
  if(reg.retainedAt===date)return registeredPlayer(s,id);
  reg.retainedAt=date;emit(r,r.players[id],date,'retain','继续青训');
 }else if(path==='promote'||path==='sign'){
  const target=options.clubId||options.targetClubId||clubId;if(target!==clubId)throw Error('只能为执教俱乐部签约');
  move(s,id,date,'senior',clubId,{ownerClubId:clubId,signedAt:reg.signedAt||date,rightsClubId:null,rightsUntil:null},path,path==='promote'?'提拔至一线队':'签订职业合同');
 }else if(path==='loan'){
  const target=options.clubId||options.targetClubId;
  if(!opportunities.loans.some(t=>t.id===target))throw Error('租借俱乐部不可用');
  move(s,id,date,'loan',target,{ownerClubId:clubId,signedAt:reg.signedAt||date,loanUntil:dateOf(Number(date.slice(0,4))+Number(date.slice(5)==='12-31'),12,31)},'loan',`租借至${teamById.get(target).name}`);
 }else if(path==='release')move(s,id,date,'free',null,{ownerClubId:null,rightsClubId:null,rightsUntil:null},'release','解除注册，继续寻找比赛机会');
 if(path!=='retain'&&reg.history.length===beforeMoves)throw Error('合同预算或注册窗口不允许该操作');
 s.revision=(s.revision||0)+1;return registeredPlayer(s,id);
}

function runDraft(s,date){
 const r=ensurePlayerRegistry(s),year=Number(date.slice(0,4));if(r.drafts.some(d=>d.year===year))return;
 const candidates=Object.values(r.players).filter(p=>{const reg=r.registrations[p.id],age=youthAge(p,date);return reg.pathway==='royal'&&['youth','free'].includes(reg.status)&&age>=18-1e-6&&age<24&&!reg.draftEnteredYear&&!reg.signedAt;});
 const order=draftOrder([...(s.draftRanking||METRO_SYSTEMS.flatMap(id=>s.members[id]))].reverse(),{seed:`draft:${year}`}),pool=[...candidates],picks=[],standards=new Map(seniorTeams(s).map(t=>[t.id,clubStandard(s,t.id)]));
 for(const pick of order){
  if(!pool.length)break;
  const roster=registeredRoster(s,pick.club);
  // Clubs see demonstrated ability and positional need; hidden ceilings never enter selection.
  const score=p=>ability(s,p,date)+Math.max(0,3-roster.filter(q=>q.position===p.position).length)*1.5+rng(`draft-view:${year}:${pick.club}:${p.id}`).normal()*2;
  pool.sort((a,b)=>score(b)-score(a)||a.id.localeCompare(b.id));const p=pool.shift(),reg=r.registrations[p.id];
  reg.draftEnteredYear=year;reg.draftedYear=year;reg.draftOverall=pick.overall;
  p.training=p.training.map(t=>({...t,to:year,graduated:true}));
  move(s,p.id,date,'free',null,{ownerClubId:null,rightsClubId:pick.club,rightsUntil:dateOf(year+1,1,20)},'draft',`第 ${pick.overall} 顺位被${teamById.get(pick.club).name}选中`);
  picks.push({...pick,playerId:p.id});
  if(pick.club!==s.manager?.clubId&&hasSeat(s,pick.club,p,date)&&ability(s,p,date)>=clubStandard(s,pick.club,standards)-24)move(s,p.id,date,'senior',pick.club,{ownerClubId:pick.club,signedAt:date,rightsClubId:null,rightsUntil:null},'sign','选秀后签订职业合同');
 }
 for(const p of pool){r.registrations[p.id].draftEnteredYear=year;p.training=p.training.map(t=>({...t,to:year,graduated:true}));move(s,p.id,date,'free',null,{ownerClubId:null},'undrafted','选秀落选，可自由签约');}
 r.drafts.push({year,date,picks,undrafted:pool.map(p=>p.id)});
}
function review(s,date){
 const r=ensurePlayerRegistry(s);if(r.reviews.includes(date))return;r.reviews.push(date);
 const context=recruitmentContext(s,date,id=>registeredRoster(s,id));recruitmentContexts.set(s,context);
 const standards=new Map(seniorTeams(s).map(t=>[t.id,clubStandard(s,t.id)]));
 for(const p of Object.values(r.players)){
  const reg=r.registrations[p.id],age=youthAge(p,date),score=ability(s,p,date),owner=reg.ownerClubId||reg.academyClubId;
  if(reg.status==='retired'||reg.status==='loan'||['youth','senior'].includes(reg.status)&&owner===s.manager?.clubId||s.manager&&reg.rightsClubId===s.manager.clubId)continue;
  if(reg.status==='youth'&&reg.pathway==='local'){
   const threshold=clubStandard(s,reg.clubId,standards);
   if(age>=17&&score>=threshold-12&&hasSeat(s,reg.clubId,p,date))move(s,p.id,date,'senior',reg.clubId,{ownerClubId:reg.clubId,signedAt:date},'promote','根据训练和青年比赛表现进入一线队');
   else if(age>=19){
    const options=loanOptions(s,p,reg,standards);
    if(options.length&&score>=threshold-21)move(s,p.id,date,'loan',options[0].id,{ownerClubId:reg.clubId,signedAt:date,loanUntil:dateOf(Number(date.slice(0,4))+Number(date.slice(5)==='12-31'),12,31)},'loan','前往较低级别争取成年比赛');
    else if(age>=20||score<threshold-25)move(s,p.id,date,'free',null,{ownerClubId:null},'release','青训评估后寻找新俱乐部');
   }
  }else if(reg.status==='senior'&&age<28){
   // AI keeps a natural backup keeper; player decisions and retirement retain
   // the existing one-keeper hard floor through canLeave's default policy.
   if(lacksPlayingTime(context,p,reg)&&context.opportunity(reg.clubId,context.player(p)).expectedMinutes<45&&canLeave(s,p,reg.clubId,{goalkeepers:2})){
    const options=loanOptions(s,p,reg,standards);
    if(options.length)move(s,p.id,date,'loan',options[0].id,{ownerClubId:reg.clubId,loanUntil:dateOf(Number(date.slice(0,4))+Number(date.slice(5)==='12-31'),12,31)},'loan','租借争取成年比赛');
    else if(age>=22&&score<clubStandard(s,reg.clubId,standards)-10)move(s,p.id,date,'free',null,{ownerClubId:null},'release','评估后解除注册，寻找新机会');
   }
  }
  if(reg.status==='free'&&!reg.rightsClubId&&age>=18&&(reg.pathway!=='royal'||reg.draftEnteredYear)){
   // A limited set of clubs observes each player; release is not a permanent verdict.
   const candidates=seniorTeams(s).filter(t=>t.id!==s.manager?.clubId&&!isMetroLeague(t.league)&&(getDivision(divisionOf(s,t.id))?.tier||1)>=2&&rng(`trial:${date}:${p.id}:${t.id}`).next()<.04&&hasSeat(s,t.id,p,date)).map(t=>({club:t,standard:clubStandard(s,t.id,standards)})).filter(t=>score>=t.standard-13).sort((a,b)=>Math.abs(a.standard-score)-Math.abs(b.standard-score));
   if(candidates.length)move(s,p.id,date,'senior',candidates[0].club.id,{ownerClubId:candidates[0].club.id,signedAt:reg.signedAt||date},'sign','经过试训进入职业球队');
   else if(age>=28&&daysBetween(reg.statusSince,date)>730)move(s,p.id,date,'retired',null,{ownerClubId:null},'retire','结束球员生涯');
  }
  if(reg.status==='youth'&&reg.pathway==='royal'&&age>=24)move(s,p.id,date,'free',null,{ownerClubId:null},'graduate','结束学院培养，可自由签约');
 }
}

function recruitEstablishedPlayers(s,date,context){
 const r=ensurePlayerRegistry(s),players=registeredPlayers(s),departures=new Map();
 // Recruitment is an abstract agreed move, not a simulated financial contract.
 // No player or manager-owned roster is moved without the human manager's choice.
 for(const club of recruitmentOrder(context)){
  if(club.id===s.manager?.clubId)continue;
  let arrivals=0;
  for(const {p} of transferCandidates(context,players,r.registrations,club.id)){
   if(arrivals>=2)break;
   const reg=r.registrations[p.id],source=reg?.clubId||p.club;
   if(source===s.manager?.clubId||(departures.get(source)||0)>=2||!canLeave(s,p,source,{goalkeepers:2}))continue;
   const remaining=registeredRoster(s,source).filter(q=>q.id!==p.id);
   if(remaining.length<18||remaining.filter(q=>q.position===p.position).length<(p.position==='CB'?3:p.position==='GK'?2:1))continue;
   const opportunity=context.opportunity(club.id,p);
   if(!opportunity.starter||opportunity.expectedMinutes<60)continue;
   const seatAvailable=hasSeat(s,club.id,p,date),replacement=seatAvailable?null:recruitmentReplacement(s,club.id,p,date,context);
   if(!seatAvailable&&!replacement)continue;
   if(replacement){
    if(!r.registrations[replacement.id])registerOriginal(s,replacement,date);
    move(s,replacement.id,date,'free',null,{ownerClubId:null},'release','阵容调整后解除注册，寻找比赛机会');
   }
   if(!reg)registerOriginal(s,p,date);
   const sourceTier=context.tier(source),targetTier=context.tier(club.id);
   move(s,p.id,date,'senior',club.id,{ownerClubId:club.id,signedAt:date,transferredAt:date},'transfer',targetTier<sourceTier?`转会至${club.name}，争取更高级别比赛`:`转会至${club.name}`);
   departures.set(source,(departures.get(source)||0)+1);arrivals++;
  }
 }
}

function recruitmentReplacement(s,clubId,incoming,date,context){
 const roster=registeredRoster(s,clubId),r=ensurePlayerRegistry(s),plan=context.plan(clubId);
 return roster.filter(p=>{
  const reg=r.registrations[p.id]||{clubId,statusSince:context.originalSince,status:'senior'};
  if(reg.status!=='senior'||plan.opportunities[p.id].starter||!lacksPlayingTime(context,p,reg))return false;
  const after=[...roster.filter(q=>q.id!==p.id),incoming];
  return after.length>=18&&after.length<=40&&after.filter(q=>youthAge(q,date)>=21).length<=25&&
   after.filter(q=>q.position==='GK').length>=2&&after.filter(q=>q.position==='CB').length>=3;
 }).sort((a,b)=>ability(s,a,date)-ability(s,b,date)||a.id.localeCompare(b.id))[0]||null;
}
function registerOriginal(s,p,date){
 const r=ensurePlayerRegistry(s);if(r.registrations[p.id])return r.registrations[p.id];
 const pathway=isMetroLeague(teamById.get(p.club)?.league)?'royal':'local';
 invalidateRosterIndex(s);return r.registrations[p.id]={clubId:p.club,ownerClubId:p.club,academyClubId:p.club,academyId:null,pathway,status:'senior',statusSince:date,history:[{date,status:'senior',clubId:p.club,ownerClubId:p.club}]};
}
function fillVacancies(s,clubId,date,{minimum=18,goalkeepers=2}={}){
 const r=ensurePlayerRegistry(s),managed=clubId===s.manager?.clubId;
 if(managed){minimum=Math.min(minimum,11);goalkeepers=1;}
 for(let attempt=0;attempt<40;attempt++){
  const roster=registeredRoster(s,clubId),needKeeper=roster.filter(p=>p.position==='GK').length<goalkeepers;
  if(roster.length>=minimum&&!needKeeper)return;
  const candidates=Object.values(r.players).filter(p=>{
   const reg=r.registrations[p.id],age=youthAge(p,date);
   if(age<17||needKeeper&&p.position!=='GK'||!hasSeat(s,clubId,p,date))return false;
   const ownYouth=reg.pathway==='local'&&reg.status==='youth'&&reg.clubId===clubId;
   if(managed)return ownYouth;
   const free=reg.status==='free'&&age>=18&&(!reg.rightsClubId||reg.rightsClubId===clubId)&&(reg.pathway==='local'||reg.draftEnteredYear||age>=24);
   return ownYouth||free;
  }).sort((a,b)=>ability(s,b,date)-ability(s,a,date)||a.id.localeCompare(b.id));
  if(!candidates.length)return;
  const p=candidates[0],reg=r.registrations[p.id],isYouth=reg.status==='youth';
  if(move(s,p.id,date,'senior',clubId,{ownerClubId:clubId,signedAt:reg.signedAt||date,rightsClubId:null,rightsUntil:null},isYouth?'promote':'sign',isYouth?'提拔青训球员补充比赛名单':'签约补充一线队位置')===false)return;
 }
}
function retirePlayers(s,date){
 const r=ensurePlayerRegistry(s),year=Number(date.slice(0,4));
 for(const p of registeredPlayers(s).sort((a,b)=>youthAge(b,date)-youthAge(a,date)||a.id.localeCompare(b.id))){
  const age=youthAge(p,date),threshold=p.position==='GK'?40:37;
  if(age<threshold)continue;
  const reg=r.registrations[p.id]||registerOriginal(s,p,date);
  if(reg.status==='loan')continue;
  if(reg.status==='senior'&&!canLeave(s,p,reg.clubId))fillVacancies(s,reg.clubId,date,{minimum:12,goalkeepers:p.position==='GK'?2:1});
  if(reg.status==='senior'&&!canLeave(s,p,reg.clubId)){
   if(reg.retirementDeferredYear!==year){reg.retirementDeferredYear=year;emit(r,p,date,'retirement-deferred','退役计划延后，等待比赛名单补位');}
   continue;
  }
  const clubId=reg.clubId;move(s,p.id,date,'retired',null,{ownerClubId:null},'retire','结束职业生涯');
  if(clubId)fillVacancies(s,clubId,date);
 }
 for(const team of seniorTeams(s))fillVacancies(s,team.id,date);
}
export function advanceYouthPathways(s,date=s.date){
 if(!registryDate(date))throw Error('青训日期无效');
 const r=ensurePlayerRegistry(s);
 if(r.through&&date<r.through)throw Error('青训日期不能倒退');
 ensureYouthIntake(s,date);
 beginRosterContext(s);
 try{
 for(const [id,reg] of Object.entries(r.registrations)){
  if(reg.status==='loan'&&reg.loanUntil<=date)move(s,id,date,'senior',reg.ownerClubId,{ownerClubId:reg.ownerClubId},'return','租借期满归队');
  if(reg.rightsUntil&&reg.rightsUntil<=date){reg.rightsClubId=null;reg.rightsUntil=null;emit(r,r.players[id],date,'rights-expired','选秀签约权到期');}
 }
 if(date.slice(5)==='01-20')runDraft(s,date);
 if(['06-30','12-31'].includes(date.slice(5)))review(s,date);
 else if(inRecruitmentWindow(date)){
  const context=recruitmentContext(s,date,id=>registeredRoster(s,id));recruitmentContexts.set(s,context);
  recruitEstablishedPlayers(s,date,context);
 }
 if(date.slice(5)==='12-31'&&!r.retirementYears?.includes(Number(date.slice(0,4)))){retirePlayers(s,date);(r.retirementYears??=[]).push(Number(date.slice(0,4)));}
 r.through=date;return r;
 }finally{rosterContexts.delete(s);recruitmentContexts.delete(s);}
}

export function youthWeekContext(s,p,startDate,endDate){
 const reg=s.playerRegistry?.registrations?.[p.id];
 const result={minutes:0,appearances:0,challenge:1,training:'balanced',load:.6,trainingQuality:academyTrainingQuality(s,p,endDate),fixtures:[]};
 if(!reg||endDate<=startDate)return result;
 let weighted=0;
 for(const fixture of academyFixtures(s,p,startDate,endDate)){result.fixtures.push({...fixture});result.minutes+=fixture.minutes;result.appearances++;weighted+=fixture.minutes*fixture.challenge;}
 for(let day=addDays(startDate,1);day<=endDate;day=addDays(day,1)){
  const state=[...reg.history].reverse().find(h=>h.date<day);if(!state||state.status!=='free')continue;
  const month=Number(day.slice(5,7));if(month<2||month>11||new Date(`${day}T12:00:00Z`).getUTCDay()!==6)continue;
  const random=rng(`youth-match:${p.id}:${day}`);if(random.next()<(state.status==='free'?.28:.12))continue;
  const minutes=random.int(30,75),opposition=52,score=preciseSkill(p);
  const challenge=clamp(1-Math.max(0,score-opposition-5)/45-Math.max(0,opposition-score-15)/80,.25,1);
  result.fixtures.push({date:day,minutes,challenge});result.minutes+=minutes;result.appearances++;weighted+=minutes*challenge;
 }
 if(result.minutes)result.challenge=weighted/result.minutes;
 return result;
}
