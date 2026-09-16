import {createDevelopment,advanceDevelopment,developedPlayer,recordDevelopmentMatch,validateDevelopment} from './development.js';
import {clubs,YEAR} from '../world.js';
import {footballTeams} from '../football/data.js';
import {createMatch,stepMatch,getResult} from '../football/engine.js';
import {leagueSystems,getDivision} from './catalog.js';
import {roundRobin,standings,knockoutBracket,globalQualifiers,globalGroups,moveDivisions,draftOrder} from './season.js';
import {dateOf,addDays,daysBetween,seasonCalendar,roundDates} from './calendar.js';
export const SAVE_VERSION=1;
const teams=new Map(footballTeams.map(t=>[t.id,t]));
export const initialMembership=()=>Object.fromEntries(leagueSystems.flatMap(s=>s.levels.map(d=>[d.id,clubs.filter(c=>c.division===d.id).map(c=>c.id)])));
export function tableFor(s,division){return standings(s.members[division],s.fixtures.filter(m=>m.competition===division),{seed:`${s.year}:${division}`});}
export function groupTable(s,group){const g=s.groups.find(g=>g.id===group);return standings(g.teams.map(t=>t.id),s.fixtures.filter(m=>m.group===group),{seed:`${s.year}:group:${group}`});}
export function createSeason({year=YEAR,members=initialMembership(),qualifiers,playerState={},carryDiscipline={},draftRanking=null,manager=null,development}={}){
 validateMembers(members);
 const calendar=seasonCalendar(year),fixtures=[];
 const add=(m,competition,kind,date,extra={})=>fixtures.push({...m,competition,kind,date,time:'19:30',score:null,...extra});
 for(const system of leagueSystems){
  for(const d of system.levels){const dates=roundDates(calendar.league,d.rounds);for(const m of roundRobin(members[d.id],{seed:`${year}:${d.id}`,prefix:`${year}:${d.id}`}))add(m,d.id,'league',dates[m.round-1]);}
  if(system.cup){const bracket=knockoutBracket(system.levels.flatMap(d=>members[d.id]),{seed:`${year}:${system.cup.id}`,prefix:`${year}:${system.cup.id}`});for(const m of bracket)add(m,system.cup.id,'cup',calendar.cup[m.round-1],{neutral:m.round===6});}
  for(const d of system.levels.filter(d=>d.promotion||system.id==='closed')){
   const ranks=d.promotion?[3,4,5,6]:[1,2,3,4,5,6,7,8];
   const bracket=knockoutBracket(ranks.map(n=>`rank:${d.id}:${n}`),{shuffle:false,prefix:`${year}:${d.id}-playoffs`});
   for(const m of bracket)add(m,`${d.id}-playoffs`,'playoff',calendar.playoffs[m.round-1+(d.promotion?1:0)],{division:d.id,neutral:system.id==='closed'&&m.round===3});
  }
 }
 // The inaugural edition has an explicit founding seed list, never fabricated past results.
 const qualificationSource=qualifiers?`${year-1} 赛季联赛排名`:'创始赛季资格名单';
 qualifiers??=globalQualifiers(Object.fromEntries(leagueSystems.map(s=>[s.id,members[s.id].map(id=>({id}))])));
 const groups=globalGroups(qualifiers);
 for(const g of groups)for(const m of roundRobin(g.teams.map(t=>t.id),{legs:1,seed:`${year}:group:${g.id}`,prefix:`${year}:global:${g.id}`}))add(m,'global-cup','group',calendar.global[m.round-1],{group:g.id,neutral:true});
 // A1–B2 / C1–D2 / E1–F2 / G1–H2; opposite half reverses group pairs.
 let slots=['A:1','B:2','C:1','D:2','E:1','F:2','G:1','H:2','B:1','A:2','D:1','C:2','F:1','E:2','H:1','G:2'].map(x=>`group:${x}`);
 for(let round=1;slots.length>1;round++){const next=[];for(let i=0;i<slots.length;i+=2){const id=`${year}:global-ko:${round}:${i/2}`;add({id,home:slots[i],away:slots[i+1],round},'global-cup','global-ko',calendar.global[round+2],{neutral:true});next.push(`winner:${id}`);}slots=next;}
 fixtures.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 return {version:SAVE_VERSION,year,date:dateOf(year,1,1),members:structuredClone(members),qualifiers,qualificationSource,groups,fixtures,calendar,playerState:structuredClone(playerState),discipline:structuredClone(carryDiscipline),summary:null,draft:null,draftRanking:draftRanking||members.closed,revision:0,manager:structuredClone(manager),activeMatch:null,development:structuredClone(development||createDevelopment(dateOf(year,1,1)))};
}
function validateMembers(members){const all=[];for(const system of leagueSystems)for(const d of system.levels){const ids=members?.[d.id];if(!Array.isArray(ids)||ids.length!==d.teams||ids.some(id=>teams.get(id)?.league!==system.id))throw Error('赛季参赛名单无效');all.push(...ids);}if(new Set(all).size!==clubs.length||all.length!==clubs.length)throw Error('球队重复或缺失');}
const finished=m=>m.score!==null||m.bye;
export const pendingMatches=s=>s.fixtures.filter(m=>!finished(m));
export function resolveParticipant(s,id){
 if(!id)return null;
 if(id.startsWith('winner:'))return s.fixtures.find(m=>m.id===id.slice(7))?.winner||null;
 if(id.startsWith('rank:')){const [,division,rank]=id.split(':');if(s.fixtures.some(m=>m.competition===division&&!finished(m)))return null;return tableFor(s,division)[Number(rank)-1]?.id;}
 if(id.startsWith('group:')){const [,g,rank]=id.split(':');if(s.fixtures.some(m=>m.group===g&&!finished(m)))return null;return groupTable(s,g)[Number(rank)-1]?.id;}
 return teams.has(id)?id:null;
}
export function fixtureSides(s,m){let home=resolveParticipant(s,m.home),away=resolveParticipant(s,m.away);if(m.kind==='playoff'&&home&&away&&!m.neutral){const order=tableFor(s,m.division).map(r=>r.id);if(order.indexOf(home)>order.indexOf(away))[home,away]=[away,home];}return {home,away};}
function teamAt(s,id,competition,date){const t=teams.get(id);if(!t)throw Error('球队不存在');return {...t,division:Object.keys(s.members).find(d=>s.members[d].includes(id)),roster:t.roster.map(p=>{const state=s.playerState[p.id];const elapsed=state?Math.max(0,daysBetween(state.date,date)):0;return {...developedPlayer(s,p,date),condition:state?Math.min(100,state.condition+elapsed*7):p.condition,injuryDays:state?Math.max(0,state.injuryDays-elapsed):p.injuryDays,suspended:s.discipline[`${competition}/${p.id}`]?.ban||0};})};}
export function seasonTeam(s,id,competition){return teamAt(s,id,competition||Object.keys(s.members).find(d=>s.members[d].includes(id)),s.date);}
export function matchInput(s,m){const {home,away}=fixtureSides(s,m);if(!home||!away)throw Error('参赛队尚未确定');return {home:teamAt(s,home,m.competition,m.date),away:teamAt(s,away,m.competition,m.date),seed:`official:${m.id}`,knockout:!['league','group'].includes(m.kind),neutral:Boolean(m.neutral),importance:m.kind==='playoff'?1:.6,capture:true,ai:[home!==s.manager?.clubId,away!==s.manager?.clubId]};}
export function engineSimulation(input){const state=createMatch(input);while(state.status==='playing')stepMatch(state);const result=getResult(state);return {...result,health:state.teams.flatMap(t=>t.roster.map(p=>({id:p.id,condition:t.lines[p.id].condition,injuryDays:p.injuryDays}))) };}
export function commitResult(s,m,input,result){
 if(result.status!=='finished'||!Array.isArray(result.score)||result.score.length!==2||!result.score.every(n=>Number.isInteger(n)&&n>=0))throw Error('比赛未正常结束，需要赛事裁决');
 const [h,a]=result.score,side=h>a?0:a>h?1:result.shootout?.winner;
 if(input.knockout&&side!==0&&side!==1)throw Error('淘汰赛尚未决胜');
 const report={stats:result.teams.map(t=>t.stats),events:(result.events||[]).filter(e=>e.type==='shot'&&e.outcome==='goal'||['red','injury'].includes(e.type)).map(e=>({type:e.type,minute:Math.floor(e.minute),side:e.side,player:e.player,days:e.days})),players:result.teams.map(t=>(t.players||[]).filter(p=>p.minutes>0).map(p=>({id:p.id,minutes:p.minutes,goals:p.goals,yellow:p.yellow,red:p.red}))),seconds:result.seconds};
 // Everything above validates before touching the season; each fixture commits once.
 Object.assign(m,{home:input.home.id,away:input.away.id,score:result.score,shootout:result.shootout?{score:result.shootout.score,winner:result.shootout.winner}:null,winner:input.knockout?(side===0?input.home.id:input.away.id):null,fairPlay:result.teams.map(t=>(t.stats.yellow||0)+(t.stats.red||0)*3),report});
 for(const t of [input.home,input.away])for(const p of t.roster){const key=`${m.competition}/${p.id}`,d=s.discipline[key];if(d?.ban)d.ban--;}
 for(const t of result.teams)for(const p of t.players||[]){if(!p.yellow&&!p.red)continue;const key=`${m.competition}/${p.id}`,d=s.discipline[key]??={yellow:0,ban:0};d.yellow+=p.yellow||0;d.ban+=p.red?1:0;if(d.yellow>=5){d.ban+=Math.floor(d.yellow/5);d.yellow%=5;}}
 recordDevelopmentMatch(s,input,result,m.date);
 for(const p of result.health||[])s.playerState[p.id]={condition:p.condition,injuryDays:p.injuryDays,date:m.date};
 s.revision++;
}
export function nextDate(s){if(s.date>=dateOf(s.year,12,31))return null;const dates=[...pendingMatches(s).map(m=>m.date),...s.calendar.events.flatMap(e=>[e.date,...(e.end?[e.end]:[])]),dateOf(s.year,12,31)].filter(d=>d>s.date||d===s.date&&pendingMatches(s).some(m=>m.date===d));return dates.sort()[0]||null;}
export function playFixture(s,id,simulate=engineSimulation){
 if(s.activeMatch)throw Error('请先完成正在执教的比赛');
 const m=s.fixtures.find(m=>m.id===id);if(!m||finished(m))throw Error('比赛不存在或已经结束');
 if(pendingMatches(s).some(f=>f.date<m.date))throw Error('请先完成之前的比赛日');
 if(s.manager&&Object.values(fixtureSides(s,m)).includes(s.manager.clubId))throw Error('请执教或委托本队比赛');
 // Stage a date's growth so a rejected simulation cannot change player abilities.
 const work=!s.development||s.development.through<m.date?{...s,development:structuredClone(s.development)}:s;
 advanceDevelopment(work,m.date);
 const input=matchInput(work,m),result=simulate(input);commitResult(work,m,input,result);
 s.development=work.development;s.date=m.date;return m;
}
export function finishDate(s,date){
 if(date<s.date||date>dateOf(s.year,12,31)||pendingMatches(s).some(m=>m.date<=date))throw Error('比赛日尚未完成');
 advanceDevelopment(s,date);s.date=date;
 if(!s.draft&&date>=dateOf(s.year,1,20))s.draft=draftOrder([...s.draftRanking].reverse(),{seed:`draft:${s.year}`});
 if(date>=dateOf(s.year,12,1)&&!s.summary)s.summary=settleSeason(s);
 s.revision++;
}
export function advanceTo(s,date,{simulate=engineSimulation}={}){if(date<s.date||date>dateOf(s.year,12,31))throw Error('日期超出本赛季');for(const m of pendingMatches(s).filter(m=>m.date<=date))playFixture(s,m.id,simulate);finishDate(s,date);return s;}
export function settleSeason(s){
 if(pendingMatches(s).length)throw Error('全部赛事结束后才可结算');
 const tables=Object.fromEntries(Object.keys(s.members).map(id=>[id,tableFor(s,id)])),nextMembers={},movements=[],champions=[];
 for(const sys of leagueSystems){
  if(sys.id==='closed')nextMembers.closed=[...s.members.closed];
  else {const next=moveDivisions(sys.levels,sys.levels.map(d=>tables[d.id]),sys.levels.map(d=>s.fixtures.filter(m=>m.competition===`${d.id}-playoffs`).at(-1)?.winner));sys.levels.forEach((d,i)=>{nextMembers[d.id]=next[i];for(const id of next[i])if(!s.members[d.id].includes(id)){const from=sys.levels.find(x=>s.members[x.id].includes(id));movements.push({id,from:from.id,to:d.id,kind:from.tier>d.tier?'up':'down'});}});}
  for(const d of sys.levels)champions.push({competition:d.id,id:tables[d.id][0].id});
 }
 for(const competition of [...new Set(s.fixtures.filter(m=>!['league','group'].includes(m.kind)).map(m=>m.competition))])champions.push({competition,id:s.fixtures.filter(m=>m.competition===competition).at(-1).winner});
 const qualifiers=globalQualifiers(Object.fromEntries(leagueSystems.map(sys=>[sys.id,tables[sys.id]])));
 return {tables,nextMembers,movements,champions,qualifiers};
}
export function followingSeason(s){if(!s.summary||s.date!==dateOf(s.year,12,31))throw Error('完成全年赛历后才可进入新赛季');const carryDiscipline=Object.fromEntries(Object.entries(s.discipline).filter(([,d])=>d.ban>0).map(([key,d])=>{let [competition,id]=key.split('/');if(getDivision(competition))competition=Object.keys(s.summary.nextMembers).find(d=>s.summary.nextMembers[d].some(t=>teams.get(t).roster.some(p=>p.id===id)))||competition;return [`${competition}/${id}`,{yellow:0,ban:d.ban}];}));const next=createSeason({year:s.year+1,members:s.summary.nextMembers,qualifiers:s.summary.qualifiers,playerState:s.playerState,carryDiscipline,draftRanking:s.summary.tables.closed.map(r=>r.id),manager:s.manager?{...s.manager,goal:null}:null,development:s.development});advanceDevelopment(next,next.date);return next;}
export function validateSave(s){if(!s||s.version!==SAVE_VERSION||!Number.isInteger(s.year)||s.year<YEAR)throw Error('存档版本不兼容');validateMembers(s.members);validateDevelopment(s.development);if(s.manager&&!teams.has(s.manager.clubId))throw Error('执教俱乐部无效');if(s.activeMatch&&(!s.manager||!s.fixtures?.some(m=>m.id===s.activeMatch.fixtureId&&!m.score)))throw Error('执教比赛存档无效');if(!Array.isArray(s.fixtures)||s.fixtures.length!==4827||new Set(s.fixtures.map(m=>m.id)).size!==s.fixtures.length||!Array.isArray(s.groups)||!s.playerState||!s.discipline||s.date<dateOf(s.year,1,1)||s.date>dateOf(s.year,12,31))throw Error('存档数据不完整');return s;}
