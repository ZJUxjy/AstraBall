import {developedPlayer} from '../../src/competitions/development.js';
import {playerAgeOnDate} from '../../src/competitions/registry.js';
import {preciseRating} from '../../src/football/players.js';
const mean=a=>a.length?a.reduce((n,x)=>n+x,0)/a.length:null;
function stats(a){const xs=[...a].sort((x,y)=>x-y);return {count:xs.length,mean:mean(xs),min:xs[0]??null,p50:xs[Math.floor(xs.length*.5)]??null,p90:xs[Math.min(xs.length-1,Math.floor(xs.length*.9))]??null,max:xs.at(-1)??null};}
// Pure diagnostics: never selects players, changes registrations or reads PA
// into production decisions. Identical queries can enrich an archived baseline.
export function youthAuditMetrics(season,{players,teams,actualMinutes}){
 const allYouth=Object.values(season.playerRegistry.players),registrations=season.playerRegistry.registrations;
 const byClub=new Map(teams.map(t=>[t.id,t]));
 const paBands=[45,60,70,80,85,90,100],agePotential=new Map(),roleOpportunity={};
 for(const base of allYouth){
  const reg=registrations[base.id];if(reg.status==='retired')continue;
  const p=developedPlayer(season,players.get(base.id)||base),age=Math.floor(playerAgeOnDate(base,season.date)),band=paBands.findIndex((n,i)=>i<paBands.length-1&&p.potential>=n&&p.potential<paBands[i+1]),key=`${age}/${band}`;
  const group=agePotential.get(key)||{age,paMin:paBands[band],paMaxExclusive:paBands[band+1],players:[]};
  group.players.push({ca:preciseRating(p),pa:p.potential,minutes:actualMinutes.get(p.id)||0});agePotential.set(key,group);
  if(!['senior','loan'].includes(reg.status))continue;
  const opportunity=byClub.get(reg.clubId)?.aiOpportunities?.[p.id],row=roleOpportunity[p.position]??={players:0,minutes:0,zeroMinutes:0,below450:0,ca80Plus:0,ca80PlusBelow450:0,blocked:[]},minutes=actualMinutes.get(p.id)||0,ca=preciseRating(p);
  row.players++;row.minutes+=minutes;row.zeroMinutes+=Number(minutes===0);row.below450+=Number(minutes<450);row.ca80Plus+=Number(ca>=80);row.ca80PlusBelow450+=Number(ca>=80&&minutes<450);
  if(ca>=80&&minutes<450)row.blocked.push({id:p.id,clubId:reg.clubId,age,ca,minutes,expectedMinutes:opportunity?.expectedMinutes??null,role:opportunity?.position??null});
 }
 const agePotentialRealization=[...agePotential.values()].map(g=>({age:g.age,paMin:g.paMin,paMaxExclusive:g.paMaxExclusive,count:g.players.length,ca:stats(g.players.map(p=>p.ca)),pa:stats(g.players.map(p=>p.pa)),headroom:stats(g.players.map(p=>p.pa-p.ca)),caOverPa:stats(g.players.map(p=>p.ca/p.pa)),minutes:stats(g.players.map(p=>p.minutes)),ca80Plus:g.players.filter(p=>p.ca>=80).length})).sort((a,b)=>a.age-b.age||a.paMin-b.paMin);
 const transfers=[];
 for(const [id,reg] of Object.entries(registrations))for(let i=1;i<reg.history.length;i++){
  const previous=reg.history[i-1],next=reg.history[i];
  if(next.date.slice(0,4)!==String(season.year).padStart(4,'0')||previous.status!=='senior'||next.status!=='senior'||!previous.clubId||!next.clubId||previous.clubId===next.clubId)continue;
  const from=byClub.get(previous.clubId),to=byClub.get(next.clubId);
  transfers.push({id,date:next.date,fromClubId:previous.clubId,toClubId:next.clubId,fromDivision:from?.division,toDivision:to?.division,fromTier:from?.tier,toTier:to?.tier,direction:from?.division==='closed'||to?.division==='closed'?'closed':from?.tier>to?.tier?'up':from?.tier<to?.tier?'down':'same'});
 }
 return {roleOpportunity,agePotentialRealization,transfers,transferDirections:Object.fromEntries(['up','same','down','closed'].map(direction=>[direction,transfers.filter(t=>t.direction===direction).length]))};
}
