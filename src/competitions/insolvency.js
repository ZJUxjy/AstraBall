import {unpaidTotal,settlePayables} from './payables.js';
import {clubs,cities} from '../world.js';
import {localClubById} from './local-catalog.js';
import {creditFor,writeOffDebt,repay,economicRegion} from './public-credit.js';
import {postAccount} from './economic-ledger.js';
import {settleLocalSeason} from './local-football.js';
import {materializeLocal,registerLocalSenior} from './local-bridge.js';
import {populationPlayer,persistPlayer} from './population.js';
import {dateOf,addDays,daysBetween} from './calendar.js';
import {payPlayer} from './taxation.js';
import {clubProfile} from './club-profiles.js';
import {getDivision} from './catalog.js';
export function scheduleDissolution(s,id){
 const e=s.economy,c=creditFor(e,id);if(!e.accounts[id]||c.status!=='administration'||e.accounts[id].dissolved)throw Error('须先托管再安排解散');
 c.dissolveAfterSeason=true;e.world.events.push({date:s.date,type:'dissolution-pending',club:id});
}
// Called on a private rollover copy after the last day's payroll is closed.
export function prepareSuccession(s){
 const e=s.economy,w=e.world;if(!w)return;settleLocalSeason(s);
 for(const [id,a] of Object.entries(e.accounts)){
  const debt=creditFor(e,id);if(a.dissolved||debt.status!=='administration'||!debt.dissolveAfterSeason&&!(debt.missed>=6&&unpaidTotal(a)>0))continue;
  const division=Object.keys(s.summary.nextMembers).find(d=>s.summary.nextMembers[d].includes(id)),region=economicRegion(id);
  if(!division)continue;
  const ranked=Object.values(w.clubs).filter(c=>c.status==='active'&&c.tier==='professional'&&localClubById.get(c.id).region===region&&!c.dissolveAfterSeason&&creditFor(e,c.id).status==='normal'&&c.roster.length>=23).sort((a,b)=>(w.tables[a.division].find(r=>r.id===a.id)?.rank||99)-(w.tables[b.division].find(r=>r.id===b.id)?.rank||99)||b.finance.cash-a.finance.cash||a.id.localeCompare(b.id));
  const next=ranked[0];if(!next){w.events.push({date:s.date,type:'replacement-deferred',club:id});continue;}
  // Employment claims have priority over lenders. Unpaid claims are explicit;
  // neither wage tax nor cash payment is invented for an unpaid claim.
  const claims=Object.entries(e.contracts).filter(([,c])=>c.club===id).map(([player,c])=>({player,amount:Math.round(Math.max(0,daysBetween(addDays(s.date,1),addDays(c.end,1)))*c.weeklyWage/7)}));
  settlePayables(e,id);debt.unpaidEstate=a.payables?structuredClone(a.payables):null;
  const total=claims.reduce((n,c)=>n+c.amount,0),available=Math.max(0,a.cash),budget=Math.min(available,total);let paid=0;
  for(const [i,claim] of claims.entries()){
   const p=populationPlayer(s,claim.player),amount=i===claims.length-1?budget-paid:Math.floor(budget*claim.amount/Math.max(1,total));paid+=amount;
   postAccount(e,id,'severance',amount);payPlayer(e,p.id,id,amount);delete e.contracts[p.id];persistPlayer(s,{...p,club:null,unit:'free',lastClub:id,freeSince:s.date},{type:'release'});
   e.moves.push({id:`move:${e.sequence++}`,type:'release',date:s.date,player:p.id,from:id,compensation:amount,unpaidClaim:claim.amount-amount,insolvency:true});
  }
  debt.employeeClaimsUnpaid=(debt.employeeClaimsUnpaid||0)+total-paid;
  if(a.cash>0&&debt.principal)repay(s,id,Math.min(a.cash,debt.principal));writeOffDebt(s,id);debt.interestWrittenOff=(debt.interestWrittenOff||0)+(debt.interestArrears||0);debt.interestArrears=0;debt.status='dissolved';a.dissolved=true;a.transferBudget=0;a.wageLimit=0;
  const from=next.division;w.members[from]=w.members[from].filter(x=>x!==next.id);next.status='core';next.coreDivision=division;
  e.accounts[next.id]=next.finance;const incoming=e.accounts[next.id];Object.assign(incoming,{division,homeTier:getDivision(division).tier,reputation:Math.max(next.reputation||0,clubProfile(next.id).initialReputation),baseWageLimit:incoming.wageLimit,baseLevel:74-(getDivision(division).tier-1)*9,policy:{...a.policy},plan:{},funding:0,accrual:{year:e.year,days:0,income:{},operating:0,taxUnits:0,taxPaid:0},review:{status:'合规',loss:0,allowance:0,restricted:false}});
  for(const pid of next.roster){const p=w.players[pid],full=materializeLocal({...s,year:s.year+1},p,next.id);full.number=next.roster.indexOf(pid)+1;registerLocalSenior(s,full);e.contracts[pid]={club:next.id,start:s.date,end:dateOf(s.year+2,12,31),weeklyWage:Math.max(350,p.weeklyWage),kind:'senior'};p.status='core';p.originClub=next.id;}
  next.roster=[];s.summary.nextMembers[division]=s.summary.nextMembers[division].map(x=>x===id?next.id:x);
  s.summary.qualifiers=s.summary.qualifiers.map(q=>q.id===id?{...q,id:next.id}:q);s.summary.draftRanking=s.summary.draftRanking.map(x=>x===id?next.id:x);
  if(s.manager?.clubId===id)s.manager=null;
  w.events.push({date:s.date,type:'core-replacement',dissolved:id,replacement:next.id,division,from,employeeClaims:total,employeePaid:paid});
 }
}
