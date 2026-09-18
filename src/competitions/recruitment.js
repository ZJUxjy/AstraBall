import {seniorTeams,allKnownTeams,knownTeam} from './team-directory.js';
import {isMetroLeague,METRO_SYSTEMS} from './catalog.js';
import {footballTeams} from '../football/data.js';
import {preciseSkill} from '../football/players.js';
import {planAITeam,evaluateOpportunity,aiRoleScore} from '../football/ai-team.js';
import {getDivision} from './catalog.js';
import {daysBetween} from './calendar.js';
import {playerAgeOnDate} from './registry.js';
import {rng} from '../football/random.js';

const clubs={get:knownTeam,has:id=>Boolean(knownTeam(id))};
export function recruitmentOrder(context){
 const priority=new Map(context.clubs.map(t=>[t.id,rng(`recruit-order:${context.date}:${t.id}`).next()]));
 return [...context.clubs].sort((a,b)=>context.tier(a.id)-context.tier(b.id)||priority.get(a.id)-priority.get(b.id)||a.id.localeCompare(b.id));
}
// One review window, invalidated after every move. No hidden development fields
// enter a decision and no cache survives the mutable registration transaction.
export function recruitmentContext(s,date,roster){
 const teams=new Map(),plans=new Map(),minutes=new Map(),games=new Map(),ages=new Map(),scores=new Map(),clubMatches=new Map(),evidenceCache=new Map();
 const divisions=new Map(Object.entries(s.members).flatMap(([division,ids])=>ids.map(id=>[id,division])));
 for(const fixture of s.fixtures||[]){
  if(!fixture.report||fixture.date>date||daysBetween(fixture.date,date)>180)continue;
  for(const id of [fixture.home,fixture.away])games.set(id,(games.get(id)||0)+1);
  for(const lines of fixture.report.players)for(const line of lines)minutes.set(line.id,(minutes.get(line.id)||0)+line.minutes);
  for(let side=0;side<2;side++){
   const id=side?fixture.away:fixture.home;if(!clubMatches.has(id))clubMatches.set(id,[]);
   clubMatches.get(id).push({date:fixture.date,minutes:new Map(fixture.report.players[side].map(line=>[line.id,line.minutes]))});
  }
 }
 const team=id=>{
  if(!teams.has(id))teams.set(id,{id,roster:roster(id).map(p=>({...p,attributes:s.development?.records[p.id]?.attributes||p.attributes,age:playerAgeOnDate(p,date),injuryDays:0,suspended:0,playedToday:false,condition:100}))});
  return teams.get(id);
 };
 const plan=id=>{if(!plans.has(id))plans.set(id,planAITeam(team(id),{healthy:true,rotation:false,allowIncomplete:true}));return plans.get(id);};
 const wageBills=new Map();
 for(const c of Object.values(s.economy?.contracts||{}))wageBills.set(c.club,(wageBills.get(c.club)||0)+c.weeklyWage);
 const relegated=new Set((s.history?.seasons?.at(-1)?.movements||[]).filter(m=>m.kind==='down').map(m=>m.id));
 return {clubs:seniorTeams(s),date,managedClubId:s.manager?.clubId,originalSince:s.development?.since||`${date.slice(0,4)}-01-01`,team,plan,minutes,games,division:id=>divisions.get(id),tier:id=>id&&isMetroLeague(divisions.get(id))?0:getDivision(divisions.get(id))?.tier??1,
  age(p){if(!ages.has(p.id))ages.set(p.id,playerAgeOnDate(p,date));return ages.get(p.id);},
  roleScore(p,position){const key=`${p.id}/${position}`;if(!scores.has(key))scores.set(key,aiRoleScore({...p,attributes:s.development?.records[p.id]?.attributes||p.attributes},position,{condition:100}));return scores.get(key);},
  evidence(p,reg){
   const key=`${p.id}/${reg.clubId}/${reg.statusSince}`;
   if(!evidenceCache.has(key)){
    const matches=(clubMatches.get(reg.clubId)||[]).filter(m=>m.date>=reg.statusSince);
    evidenceCache.set(key,{games:matches.length,minutes:matches.reduce((sum,m)=>sum+(m.minutes.get(p.id)||0),0)});
   }
   return evidenceCache.get(key);
  },
  player:p=>({...p,attributes:s.development?.records[p.id]?.attributes||p.attributes}),
  opportunity:(id,p)=>plan(id).opportunities[p.id]||evaluateOpportunity(team(id),p,{healthy:true,rotation:false,allowIncomplete:true}),
  mustOffload:id=>{
   const a=s.economy?.accounts[id];if(!a)return false;
   return (wageBills.get(id)||0)>a.wageLimit||relegated.has(id);
  },
  invalidate(...ids){for(const id of ids){teams.delete(id);plans.delete(id);}}
 };
}
export function inRecruitmentWindow(date){
 const md=date.slice(5);
 return md>='01-01'&&md<='02-28'||md>='07-01'&&md<='07-31';
}
export function isRecruitmentReviewDate(date){
 if(!inRecruitmentWindow(date))return false;
 // Same 7-day grid as development weeks from 1 January, plus the summer window open.
 return daysBetween(`${date.slice(0,4)}-01-01`,date)%7===0||date.slice(5)==='07-01';
}

export function lacksPlayingTime(context,p,reg){
 // Six months of actual fixtures, with a settling-in period. Missing match
 // evidence is not interpreted as an entire season spent on the bench.
 const {games,minutes}=context.evidence(p,reg);
 return games>=6&&daysBetween(reg.statusSince,context.date)>=90&&minutes<games*90*.22;
}

export function loanDestinations(context,p,reg,hasSeat){
 p=context.player(p);
 const origin=reg.ownerClubId||reg.clubId,source=clubs.get(origin),sourceTier=context.tier(origin);
 const current=context.opportunity(origin,p).expectedMinutes;
 // A same-level club can offer the missing role as well. Shortlisting uses
 // current role ability, then the shared AI selector checks the actual vacancy.
 const candidates=context.clubs.filter(t=>t.id!==origin&&t.id!==context.managedClubId&&!isMetroLeague(t.league)&&context.tier(t.id)>=sourceTier&&hasSeat(t.id,p));
 const rough=t=>{
  const roster=context.team(t.id).roster,peers=roster.filter(q=>q.position===p.position).map(q=>preciseSkill(q));
  const level=peers.length?Math.max(...peers):Math.max(...roster.map(q=>preciseSkill(q)))-8;
  return Math.abs(level-preciseSkill(p))+(source.league===t.league?0:3);
 };
 return candidates.map(t=>({t,gap:rough(t)})).sort((a,b)=>a.gap-b.gap||a.t.id.localeCompare(b.t.id)).slice(0,16)
  .map(({t})=>({id:t.id,name:t.name,division:context.division(t.id),expectedMinutes:context.opportunity(t.id,p).expectedMinutes}))
  .filter(t=>t.expectedMinutes>=(p.position==='GK'?60:25)&&t.expectedMinutes>=current+15)
  .sort((a,b)=>b.expectedMinutes-a.expectedMinutes||Number(clubs.get(b.id).league===source.league)-Number(clubs.get(a.id).league===source.league)||a.id.localeCompare(b.id)).slice(0,8);
}

function sellerWouldSell(context,p,reg,targetTier){
 const sourceTier=context.tier(reg.clubId);
 if(sourceTier>targetTier)return true;
 return context.mustOffload?.(reg.clubId)||lacksPlayingTime(context,p,reg)||context.opportunity(reg.clubId,context.player(p)).expectedMinutes<45;
}
export function transferCandidates(context,players,registrations,clubId){
 const targetTier=context.tier(clubId),target=context.plan(clubId),targetTeam=context.team(clubId);
 const slots=[...target.lineup.map(slot=>({position:slot.position,score:context.roleScore(targetTeam.roster.find(p=>p.id===slot.id),slot.position)})),...(target.vacancies||[]).map(position=>({position,score:0}))];
 return players.filter(p=>{
  const reg=registrations[p.id]||{status:'senior',clubId:p.club,statusSince:context.originalSince};
  if(reg.status!=='senior'||reg.clubId===clubId||!sellerWouldSell(context,p,reg,targetTier))return false;
  const age=context.age(p);
  return age>=18&&age<=30&&
   daysBetween(reg.statusSince,context.date)>=180&&(!reg.transferredAt||daysBetween(reg.transferredAt,context.date)>=365);
 }).map(p=>{
  p=context.player(p);
  // Public position fit only. Personality and potential are intentionally absent.
  const gain=Math.max(...slots.filter(slot=>(p.position==='GK')===(slot.position==='GK')).map(slot=>context.roleScore(p,slot.position)-slot.score));
  return {p,gain};
 }).filter(row=>row.gain>=5).sort((a,b)=>b.gain-a.gain||a.p.id.localeCompare(b.p.id)).slice(0,12);
}
