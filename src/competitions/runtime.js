import {ABILITY_VERSION} from '../football/ability.js';
import {migrateAbilities} from './ability-migration.js';
import {prepareSuccession} from './insolvency.js';
import {knownTeam,clubIdentity} from './team-directory.js';
import {settleMatchFinance,settleFinanceSeason} from './finance.js';
import {PLAYER_STAT_KEYS,archiveSeasonHistory,validateHistory} from './history.js';
import {ensureEconomy,advanceCareer,accrueEconomy,rolloverEconomy,validateEconomy} from './market.js';
import {createPopulation,populationPlayers,clubPlayers,populationPlayer,annualPopulation,validatePopulation,currentAbility} from './population.js';
import {createDevelopment,advanceDevelopment,developedPlayer,recordDevelopmentMatch,validateDevelopment} from './development.js';
import {clubs,YEAR} from '../world.js';
import {footballTeams} from '../football/data.js';
import {ensurePlayerRegistry,registeredPlayers,registeredRoster,validatePlayerRegistry,migrateYouthBodies,playerAgeOnDate} from './registry.js';
import {ensureYouthIntake} from './youth.js';
import {validateAcademies} from './academy.js';
import {fatiguePenalty} from '../football/workload.js';
import {available} from '../football/players.js';
import {planAITeam} from '../football/ai-team.js';
import {matchReputation} from './reputation.js';
import {ECONOMIC_MODEL} from './economics.js';
import {createMatch,stepMatch,getResult,validateMatchSnapshot} from '../football/engine.js';
import {leagueSystems,getDivision,RULESET_VERSION,METRO_SYSTEMS,isMetroLeague,isGlobalCupYear} from './catalog.js';
import {roundRobin,knockoutBracket,globalQualifiers,globalGroups,moveDivisions,draftOrder,metroChampionshipFixtures} from './season.js';
import {dateOf,addDays,daysBetween,seasonCalendar,roundDates} from './calendar.js';
import {tableFor,fixtureSides} from './participants.js';
export {tableFor,groupTable,resolveParticipant,fixtureSides} from './participants.js';
export const SAVE_VERSION=2;
const teams=new Map(footballTeams.map(t=>[t.id,t]));
export const initialMembership=()=>Object.fromEntries(leagueSystems.flatMap(s=>s.levels.map(d=>[d.id,clubs.filter(c=>c.division===d.id).map(c=>c.id)])));
export function createSeason({worldModel=false,year=YEAR,members=initialMembership(),qualifiers,playerState={},carryDiscipline={},draftRanking=null,manager=null,development,playerRegistry,population,economy,history}={}){
 validateMembers(members);
 const calendar=seasonCalendar(year),fixtures=[];
 const add=(m,competition,kind,date,extra={})=>fixtures.push({...m,competition,kind,date,time:'19:30',score:null,...extra});
 for(const system of leagueSystems){
  for(const d of system.levels){const dates=roundDates(system.levels.length===1?calendar.regular:calendar.league,d.rounds);for(const m of roundRobin(members[d.id],{legs:d.legs,seed:`${year}:${d.id}`,prefix:`${year}:${d.id}`}))add(m,d.id,'league',dates[m.round-1]);}
  if(system.cup){const bracket=knockoutBracket(system.levels.flatMap(d=>members[d.id]),{seed:`${year}:${system.cup.id}`,prefix:`${year}:${system.cup.id}`});for(const m of bracket)add(m,system.cup.id,'cup',calendar.cup[m.round-1],{neutral:m.round===6});}
  if(system.playoffs?.kind==='championship'){
   const d=system.levels[0],ranks=Array.from({length:system.playoffs.teams},(_,i)=>i+1);
   const bracket=knockoutBracket(ranks.map(n=>`rank:${d.id}:${n}`),{shuffle:false,prefix:`${year}:${d.id}-playoffs`});
   const rounds=Math.log2(ranks.length);
   for(const m of bracket)add(m,`${d.id}-playoffs`,'playoff',calendar.playoffs[m.round-1+4-rounds],{division:d.id,neutral:m.round===rounds});
  }
 }
 const metroDates=roundDates(calendar.metro,8);
 for(const m of metroChampionshipFixtures({prefix:`${year}:metro-champions`}))add(m,'metro-champions','championship-group',metroDates[m.round-1]);
 for(const m of knockoutBracket([1,2,3,4].map(n=>`rank:metro-champions:${n}`),{shuffle:false,prefix:`${year}:metro-finals`}))add(m,'metro-champions','playoff',calendar.playoffs[m.round+1],{division:'metro-champions',neutral:m.round===2});
 const qualificationSource=qualifiers?`${year-1} 赛季年度排名`:'创始赛季资格名单';
 const founding=Object.fromEntries(leagueSystems.map(s=>[s.id,members[s.id].map(id=>({id}))]));
 founding.closed=METRO_SYSTEMS.flatMap(id=>members[id].slice(0,2).map(id=>({id})));
 qualifiers??=globalQualifiers(founding);
 const groups=isGlobalCupYear(year)?globalGroups(qualifiers):[];
 for(const g of groups)for(const m of roundRobin(g.teams.map(t=>t.id),{legs:1,seed:`${year}:group:${g.id}`,prefix:`${year}:global:${g.id}`}))add(m,'global-cup','group',calendar.global[m.round-1],{group:g.id,neutral:true});
 let slots=groups.length?['A:1','B:2','C:1','D:2','B:1','A:2','D:1','C:2'].map(x=>`group:${x}`):[];
 for(let round=1;slots.length>1;round++){const next=[];for(let i=0;i<slots.length;i+=2){const id=`${year}:global-ko:${round}:${i/2}`;add({id,home:slots[i],away:slots[i+1],round},'global-cup','global-ko',calendar.global[round+2],{neutral:true});next.push(`winner:${id}`);}slots=next;}
 fixtures.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 const s={...(worldModel||economy?.world?{worldModel:1}:{}),version:SAVE_VERSION,abilityVersion:ABILITY_VERSION,ruleset:RULESET_VERSION,year,date:dateOf(year,1,1),members:structuredClone(members),qualifiers,qualificationSource,groups,fixtures,calendar,playerState:structuredClone(playerState),discipline:structuredClone(carryDiscipline),summary:null,draft:null,draftRanking:draftRanking||METRO_SYSTEMS.flatMap(id=>members[id]),revision:0,manager:structuredClone(manager),activeMatch:null,development:structuredClone(development||createDevelopment(dateOf(year,1,1))),playerRegistry:structuredClone(playerRegistry),population:structuredClone(population),economy:structuredClone(economy),history:structuredClone(history)};
 if(!s.population){ensurePlayerRegistry(s);ensureYouthIntake(s,s.date);migrateYouthBodies(s);}if(s.population||s.economy)ensureEconomy(s);if(!s.population)delete s.population;if(!s.economy)delete s.economy;if(!s.playerRegistry)delete s.playerRegistry;if(!s.history)delete s.history;return s;
}
function validateMembers(members){const all=[];for(const system of leagueSystems)for(const d of system.levels){const ids=members?.[d.id];if(!Array.isArray(ids)||ids.length!==d.teams||ids.some(id=>{const t=knownTeam(id);return !t||(t.local?t.region!==system.region:t.league!==system.id);}))throw Error('赛季参赛名单无效');all.push(...ids);}if(new Set(all).size!==clubs.length||all.length!==clubs.length)throw Error('球队重复或缺失');}
const finished=m=>m.score!==null||m.bye;
function advanceSeason(s,date){if(s.economy)advanceCareer(s,date);else advanceDevelopment(s,date);}
export const pendingMatches=s=>s.fixtures.filter(m=>!finished(m));
function eligibleAcademy(s,id,date,minimumAge=17){return clubPlayers(s,id,{unit:'youth'}).filter(p=>{const reg=s.playerRegistry?.registrations[p.id],age=playerAgeOnDate(p,date);return reg?.pathway==='local'&&age>=minimumAge&&age<21&&s.economy?.contracts[p.id]?.club===id;});}
function teamAt(s,id,competition,date){
 const t=knownTeam(id);if(!t)throw Error('球队不存在');
 const atDate=p=>{const state=s.playerState[p.id];const elapsed=state?Math.max(0,daysBetween(state.date,date)):0;return {...developedPlayer(s,p,date),playedToday:[s.development?.records[p.id]?.lastMatchDate,s.development?.records[p.id]?.lastYouthMatchDate].includes(date),trainingFatiguePenalty:fatiguePenalty(s.development?.records[p.id]?.fatigue),condition:Math.max(0,(state?Math.min(100,state.condition+elapsed*7):p.condition)-fatiguePenalty(s.development?.records[p.id]?.fatigue)),injuryDays:state?Math.max(0,state.injuryDays-elapsed):p.injuryDays,injuryHistory:state?.injuryHistory||p.injuryHistory||0,suspended:s.discipline[`${competition}/${p.id}`]?.ban||0};};
 const roster=clubPlayers(s,id).map(atDate),availableCount=roster.filter(available).length;
 // A local academy player's existing contract permits emergency first-team duty.
 // No new player, transfer or professional wage is invented to fill the bench.
 if(s.economy?.financeVersion&&availableCount<18){
  const academy=eligibleAcademy(s,id,date).map(atDate).filter(available).sort((a,b)=>currentAbility(s,b)-currentAbility(s,a)||a.id.localeCompare(b.id));
  const usedNumbers=new Set(roster.map(p=>p.number));
  for(const p of academy.slice(0,18-availableCount)){let number=p.number;while(usedNumbers.has(number))number++;usedNumbers.add(number);roster.push({...p,number,academyCallup:true});}
  const shortage=11-roster.filter(available).length;
  if(shortage>0)for(const p of eligibleAcademy(s,id,date,16).filter(p=>!roster.some(q=>q.id===p.id)).map(atDate).filter(available).sort((a,b)=>currentAbility(s,b)-currentAbility(s,a)||a.id.localeCompare(b.id)).slice(0,shortage)){let number=p.number;while(usedNumbers.has(number))number++;usedNumbers.add(number);roster.push({...p,number,academyCallup:true,emergencyCallup:true});}
 }
 return {...t,division:Object.keys(s.members).find(d=>s.members[d].includes(id)),roster};
}
export function seasonPlayer(s,id){const p=populationPlayer(s,id);if(!p)return null;const division=Object.keys(s.members).find(d=>s.members[d].includes(p.club));return {...developedPlayer(s,p),...(teamAt(s,p.club||p.lastClub||'sky',division,s.date).roster.find(q=>q.id===id)||{})};}
export function seasonTeam(s,id,competition){return teamAt(s,id,competition||Object.keys(s.members).find(d=>s.members[d].includes(id)),s.date);}
export function matchInput(s,m){
 const {home,away}=fixtureSides(s,m);if(!home||!away)throw Error('参赛队尚未确定');
 const input={home:teamAt(s,home,m.competition,m.date),away:teamAt(s,away,m.competition,m.date),seed:`official:${m.id}`,knockout:!['league','group','championship-group'].includes(m.kind),neutral:Boolean(m.neutral),importance:m.kind==='playoff'?1:.6,capture:true,ai:[home!==s.manager?.clubId,away!==s.manager?.clubId]};
 for(const side of ['home','away']){const count=input[side].roster.filter(available).length;if(count<7)throw Error('可用球员不足7人，需要赛事裁决');const plan=planAITeam(input[side],{date:m.date,records:s.development?.records,allowIncomplete:true,requireKeeper:true});input[`${side}Tactics`]={formation:plan.formation};input[`${side}Lineup`]=plan.lineup;input[`${side}AI`]=true;if(count<11)input.allowShortHanded=true;}
 return input;
}
export function engineSimulation(input){const state=createMatch(input);while(state.status==='playing')stepMatch(state);const result=getResult(state);return {...result,health:state.teams.flatMap(t=>t.roster.map(p=>({id:p.id,condition:t.lines[p.id].condition,injuryDays:p.injuryDays,injuryHistory:p.injuryHistory||0}))) };}
export function commitResult(s,m,input,result){
 if(m.score)throw Error('比赛已经结束');
 if(result.status!=='finished'||!Array.isArray(result.score)||result.score.length!==2||!result.score.every(n=>Number.isInteger(n)&&n>=0))throw Error('比赛未正常结束，需要赛事裁决');
 const [h,a]=result.score,side=h>a?0:a>h?1:result.shootout?.winner;
 if(input.knockout&&side!==0&&side!==1)throw Error('淘汰赛尚未决胜');
 const identities=new Map([input.home,input.away].flatMap(t=>t.roster.map(p=>[p.id,p])));
 const report={historyVersion:2,stats:result.teams.map(t=>t.stats),events:(result.events||[]).filter(e=>e.type==='shot'&&e.outcome==='goal'||['red','injury'].includes(e.type)).map(e=>({type:e.type,minute:Math.floor(e.minute),side:e.side,player:e.player,days:e.days})),players:result.teams.map(t=>(t.players||[]).filter(p=>p.minutes>0).map(p=>({id:p.id,name:identities.get(p.id)?.name||p.id,position:identities.get(p.id)?.position||null,...Object.fromEntries(PLAYER_STAT_KEYS.map(k=>[k,p[k]||0]))}))),seconds:result.seconds};
 // Everything above validates before touching the season; each fixture commits once.
 Object.assign(m,{home:input.home.id,away:input.away.id,score:result.score,shootout:result.shootout?{score:result.shootout.score,winner:result.shootout.winner}:null,winner:input.knockout?(side===0?input.home.id:input.away.id):null,fairPlay:result.teams.map(t=>(t.stats.yellow||0)+(t.stats.red||0)*3),report});
 for(const t of [input.home,input.away])for(const p of [...t.roster,...(s.economy?.financeVersion?eligibleAcademy(s,t.id,m.date,16).filter(p=>!t.roster.some(q=>q.id===p.id)):[])]){const key=`${m.competition}/${p.id}`,d=s.discipline[key];if(d?.ban)d.ban--;}
 for(const t of result.teams)for(const p of t.players||[]){if(!p.yellow&&!p.red)continue;const key=`${m.competition}/${p.id}`,d=s.discipline[key]??={yellow:0,ban:0};d.yellow+=p.yellow||0;d.ban+=p.red?1:0;if(d.yellow>=5){d.ban+=Math.floor(d.yellow/5);d.yellow%=5;}}
 settleMatchFinance(s,m);
 const home=s.economy?.accounts?.[m.home],away=s.economy?.accounts?.[m.away];
 if(home&&away&&s.economy?.financeVersion===ECONOMIC_MODEL&&Number.isFinite(home.reputation)&&Number.isFinite(away.reputation))[home.reputation,away.reputation]=matchReputation(home.reputation,away.reputation,side===0?1:side===1?0:.5);
 recordDevelopmentMatch(s,input,result,m.date);
 // Match condition already includes the starting fatigue penalty. Store its raw
 // component so the next match does not subtract the same fatigue twice.
 const penalties=new Map([input.home,input.away].flatMap(t=>t.roster.map(p=>[p.id,p.trainingFatiguePenalty||0])));
 for(const p of result.health||[])s.playerState[p.id]={condition:Math.min(100,p.condition+(penalties.get(p.id)||0)),injuryDays:p.injuryDays,injuryHistory:p.injuryHistory||s.playerState[p.id]?.injuryHistory||0,date:m.date};
 s.revision++;
}
export function nextDate(s){if(s.date>=dateOf(s.year,12,31))return null;const dates=[...pendingMatches(s).map(m=>m.date),...s.calendar.events.flatMap(e=>[e.date,...(e.end?[e.end]:[])]),dateOf(s.year,12,31)].filter(d=>d>s.date||d===s.date&&pendingMatches(s).some(m=>m.date===d));return dates.sort()[0]||null;}
export function playFixture(s,id,simulate=engineSimulation){
 if(s.activeMatch)throw Error('请先完成正在执教的比赛');
 const m=s.fixtures.find(m=>m.id===id);if(!m||finished(m))throw Error('比赛不存在或已经结束');
 if(pendingMatches(s).some(f=>f.date<m.date))throw Error('请先完成之前的比赛日');
 if(s.manager&&Object.values(fixtureSides(s,m)).includes(s.manager.clubId))throw Error('请执教或委托本队比赛');
 // Stage a date's growth so a rejected simulation cannot change player abilities.
 const work=(s.economy?s.economy.through:s.development?.through)<m.date||!s.development?{...s,development:structuredClone(s.development),playerRegistry:structuredClone(s.playerRegistry),playerState:structuredClone(s.playerState),population:structuredClone(s.population),economy:structuredClone(s.economy),discipline:structuredClone(s.discipline)}:s;
 // Growth was already committed by the first fixture on this calendar day.
 // Repeating its intake/migration scan for every club does no additional work.
 advanceSeason(work,m.date);
 const input=matchInput(work,m),result=simulate(input);commitResult(work,m,input,result);
 s.development=work.development;s.playerRegistry=work.playerRegistry;s.playerState=work.playerState;s.population=work.population;s.economy=work.economy;s.discipline=work.discipline;s.revision=work.revision;s.date=m.date;if(!s.population)delete s.population;if(!s.economy)delete s.economy;if(!s.playerRegistry)delete s.playerRegistry;return m;
}
export function finishDate(s,date){
 if(date<s.date||date>dateOf(s.year,12,31)||pendingMatches(s).some(m=>m.date<=date))throw Error('比赛日尚未完成');
 advanceSeason(s,date);s.date=date;
 if(!s.draft&&date>=dateOf(s.year,1,20))s.draft=draftOrder([...s.draftRanking].reverse(),{seed:`draft:${s.year}`});
 if(date>=dateOf(s.year,12,1)&&!s.summary)s.summary=settleSeason(s);
 settleFinanceSeason(s);
 s.revision++;
}
export function advanceTo(s,date,{simulate=engineSimulation}={}){if(date<s.date||date>dateOf(s.year,12,31))throw Error('日期超出本赛季');for(const m of pendingMatches(s).filter(m=>m.date<=date))playFixture(s,m.id,simulate);finishDate(s,date);return s;}
export function settleSeason(s){
 if(pendingMatches(s).length)throw Error('全部赛事结束后才可结算');
 const tables=Object.fromEntries(Object.keys(s.members).map(id=>[id,tableFor(s,id)])),nextMembers={},movements=[],champions=[];
 for(const sys of leagueSystems){
  if(sys.levels.length===1)nextMembers[sys.id]=[...s.members[sys.id]];
  else {const next=moveDivisions(sys.levels,sys.levels.map(d=>tables[d.id]),sys.levels.map(d=>s.fixtures.filter(m=>m.competition===`${d.id}-playoffs`).at(-1)?.winner));sys.levels.forEach((d,i)=>{nextMembers[d.id]=next[i];for(const id of next[i])if(!s.members[d.id].includes(id)){const from=sys.levels.find(x=>s.members[x.id].includes(id));movements.push({id,from:from.id,to:d.id,kind:from.tier>d.tier?'up':'down'});}});}
  for(const d of sys.levels)champions.push({competition:d.id,id:tables[d.id][0].id});
 }
 for(const competition of [...new Set(s.fixtures.filter(m=>!['league','group','championship-group'].includes(m.kind)).map(m=>m.competition))])champions.push({competition,id:s.fixtures.filter(m=>m.competition===competition).at(-1).winner});
 tables['metro-champions']=tableFor(s,'metro-champions');
 const knockoutRanking=(id,regular)=>{
  const ms=s.fixtures.filter(m=>m.competition===id&&m.kind==='playoff'),final=ms.at(-1);
  const champion=final.winner,runner=[final.home,final.away].find(id=>id!==champion);
  const order=regular.map(r=>r.id),reached=id=>Math.max(0,...ms.filter(m=>m.home===id||m.away===id).map(m=>m.round));
  return [champion,runner,...order.filter(id=>id!==champion&&id!==runner).sort((a,b)=>reached(b)-reached(a)||order.indexOf(a)-order.indexOf(b))].map(id=>({id}));
 };
 // Semifinalists precede group places 5+; their order follows group ranking.
 const metroRanking=knockoutRanking('metro-champions',tables['metro-champions']);
 const rankings=Object.fromEntries(leagueSystems.map(sys=>[sys.id,sys.playoffs?knockoutRanking(`${sys.id}-playoffs`,tables[sys.id]):tables[sys.id]]));rankings.closed=metroRanking;
 const qualifiers=globalQualifiers(rankings);
 const seeded=new Set(metroRanking.map(r=>r.id));
 const unqualified=METRO_SYSTEMS.flatMap(id=>tables[id]).filter(r=>!seeded.has(r.id)).sort((a,b)=>b.points-a.points||b.gd-a.gd||b.gf-a.gf||a.id.localeCompare(b.id));
 const draftRanking=[...metroRanking.map(r=>r.id),...unqualified.map(r=>r.id)];
 return {tables,nextMembers,movements,champions,qualifiers,draftRanking,metroRanking};
}
export function followingSeason(s){if(s.version!==SAVE_VERSION||s.ruleset!==RULESET_VERSION)throw Error('存档版本不兼容：请使用原赛制继续，或创建新赛季');if(!s.summary||s.date!==dateOf(s.year,12,31))throw Error('完成全年赛历后才可进入新赛季');
 if(s.economy?.world){s=structuredClone(s);accrueEconomy(s,dateOf(s.year+1,1,1));prepareSuccession(s);}
 const divisionByClub=new Map(Object.entries(s.summary.nextMembers).flatMap(([division,clubs])=>clubs.map(club=>[club,division]))),clubByPlayer=new Map(populationPlayers(s).filter(p=>p.club&&(!p.registrationStatus||['senior','loan'].includes(p.registrationStatus))).map(p=>[p.id,p.club]));
 const carryDiscipline=Object.fromEntries(Object.entries(s.discipline).filter(([,d])=>d.ban>0).map(([key,d])=>{let [competition,id]=key.split('/');if(getDivision(competition))competition=divisionByClub.get(clubByPlayer.get(id))||competition;return [`${competition}/${id}`,{yellow:0,ban:d.ban}];}));const next=createSeason({year:s.year+1,members:s.summary.nextMembers,qualifiers:s.summary.qualifiers,playerState:s.playerState,carryDiscipline,draftRanking:s.summary.draftRanking,manager:s.manager?{...s.manager,goal:null}:null,development:s.development,playerRegistry:s.playerRegistry,population:s.population,economy:s.economy,history:archiveSeasonHistory({...s,history:s.history?structuredClone(s.history):undefined})});advanceDevelopment(next,next.date);if(next.economy)accrueEconomy(next,next.date);if(next.population)annualPopulation(next);if(next.economy)rolloverEconomy(next);return next;}
export function validateSave(s){
 if(!s||s.version!==SAVE_VERSION||s.ruleset!==RULESET_VERSION||!Number.isInteger(s.year)||s.year<YEAR)throw Error('存档版本不兼容');
 migrateAbilities(s);
 if(s.activeMatch)validateMatchSnapshot(s.activeMatch.state);validatePopulation(s.population);if(s.population&&s.population.processedYear!==s.year)throw Error('人员年份与赛季不符');validateEconomy(s);validateHistory(s);validateMembers(s.members);validatePlayerRegistry(s);validateAcademies(s);validateDevelopment(s.development,s);
 if(s.manager&&!Object.values(s.members).flat().includes(s.manager.clubId))throw Error('执教俱乐部无效');
 if(s.activeMatch&&(!s.manager||!s.fixtures?.some(m=>m.id===s.activeMatch.fixtureId&&!m.score)))throw Error('执教比赛存档无效');
 if(!Array.isArray(s.fixtures)||s.fixtures.length!==expectedFixtureCount(s.year)||new Set(s.fixtures.map(m=>m.id)).size!==s.fixtures.length||!Array.isArray(s.groups)||!s.playerState||!s.discipline||s.date<dateOf(s.year,1,1)||s.date>dateOf(s.year,12,31))throw Error('存档数据不完整');
 // Older saves gain this year's intake at the saved date, without retroactive
 // training or changes to the established senior squad.
 if(!s.playerRegistry&&!s.population){ensurePlayerRegistry(s);ensureYouthIntake(s,s.date);}
 migrateYouthBodies(s);return s;
}

export function expectedFixtureCount(year){return leagueSystems.flatMap(s=>s.levels).reduce((n,d)=>n+d.matches,0)+leagueSystems.reduce((n,s)=>n+(s.playoffs?.teams||1)-1,0)+51+(isGlobalCupYear(year)?31:0);}
