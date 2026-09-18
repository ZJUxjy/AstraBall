import {toAbility,toSkill,calibratePotential,ABILITY_VERSION} from '../football/ability.js';
import {populationPlayer,persistPlayer} from './population.js';
import {payOperating,payPayroll,unpaidTotal,settlePayables} from './payables.js';
import {clubs,cities,regions,YEAR} from '../world.js';
import {localClubs,localDivisions,localClubById,localDivisionById,LOCAL_TIERS} from './local-catalog.js';
import {roundRobin,standings} from './season.js';
import {dateOf,addDays,daysBetween} from './calendar.js';
import {rng,hash,clamp} from '../football/random.js';
import {generateName} from '../football/names.js';
import {ROSTER_POSITIONS} from '../football/players.js';
import {emptyLedger,accountOf,accountsOf,postAccount,ledgerCash} from './economic-ledger.js';
import {payPlayer,taxReceipt,transferTax} from './taxation.js';
import {creditFor,settleCreditMonth,writeOffDebt,repay,validatePublicCredit} from './public-credit.js';
import {initialLocalReputation,matchReputation,moveReputation,REPUTATION_MIN,REPUTATION_MAX} from './reputation.js';

const regionWeight={metro:3.2,lima:1.15,liberlin:1,sichuan:.85};
const playerWage=(ability,tier)=>tier==='amateur'?0:Math.round(LOCAL_TIERS[tier].wage*Math.pow(1.055,toSkill(ability)-LOCAL_TIERS[tier].quality)/7)*7;
const dates=year=>Array.from({length:30},(_,i)=>addDays(dateOf(year,3,1),Math.round(i*270/29)));
function schedules(w,year){const days=dates(year);return localDivisions.flatMap(d=>{const ids=w.members[d.id];return roundRobin(ids,{prefix:`${year}:${d.id}`,seed:`${year}:${d.id}`}).map(m=>({...m,competition:d.id,date:days[Math.round((m.round-1)*29/(ids.length*2-3))],players:null}));}).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));}
function createLocalPlayer(w,c,index,year,intake=false){
 const id=`grass:${c.id}:${year}:${index}`,r=rng(id),tier=c.tier,age=intake?17:r.int(18,35),ability=clamp(LOCAL_TIERS[tier].quality+r.normal()*5-(age<21?5:0),20,75);
 const potential=Math.max(ability,clamp(58+r.normal()*12+(r.next()<.01?18:0),35,96));
 const p={id,...generateName({id,region:localClubById.get(c.id).region,seed:'grassroots'}),club:c.id,city:localClubById.get(c.id).city,birthYear:year-age,position:ROSTER_POSITIONS[index%25],abilityVersion:ABILITY_VERSION,ability:toAbility(ability),potential:calibratePotential(potential,id,toAbility(ability)),weeklyWage:playerWage(toAbility(ability),tier),end:dateOf(year+(index%3),12,31),status:'local',minutes:0,goals:0,seasonMinutes:0,seasonGoals:0,history:[]};
 w.players[id]=p;c.roster.push(id);return p;
}
function allocateBudgets(w){
 // Fixed regional markets: adding clubs divides these pools, never multiplies them.
 for(const region of regions){
  const ids=Object.keys(w.clubs).filter(id=>localClubById.get(id)?.region===region.id&&w.clubs[id].status==='active');
  const weights=ids.map(id=>{const c=w.clubs[id],city=cities.find(c=>c.id===localClubById.get(id).city);return [id,({professional:12,semi:3,amateur:.4}[c.tier])*Math.sqrt(city.populationUnits)];});
  const total=weights.reduce((n,[,v])=>n+v,0),pool=w.regionalMarkets[region.id];let distributed=0;
  weights.forEach(([id,v],i)=>{const a=w.clubs[id].finance,amount=i===weights.length-1?pool-distributed:Math.floor(pool*v/total);distributed+=amount;a.operatingRevenueBudget=amount;a.operatingBudget=Math.round(amount*.36);a.annualCommercial=Math.floor(amount*.82);a.annualGate=amount-a.annualCommercial;a.wageLimit=Math.floor(amount*.55/52/7)*7;a.transferBudget=Math.floor(amount*.12);a.spent=0;a.localDays=0;a.postedCommercial=0;a.postedOperating=0;});
 }
}
const hydratedWorlds=new WeakSet();
export function hydrateWorld(e){const w=e?.world;if(!w||hydratedWorlds.has(w))return;for(const c of Object.values(w.clubs)){if(c.identity)localClubById.set(c.id,c.identity);c.reputation??=initialLocalReputation(c.id,c.tier);}hydratedWorlds.add(w);}
function syncExternal(s,p){const r=s.playerRegistry?.registrations[p.id];if(!r||!['external','free'].includes(r.status))return;const unit=p.status==='local'?'external':p.status;persistPlayer(s,{...populationPlayer(s,p.id),club:p.club,unit,retired:unit==='retired'});}
export function initializeWorld(s){
 const e=s.economy;if(!s.worldModel||e.world)return;
 const w=e.world={version:1,year:s.year,through:s.date,nextMonth:dateOf(s.year,2,1),clubs:{},players:{},members:{},fixtures:[],fixtureCursor:0,credit:{},banks:{},public:{},events:[],history:[],processedMarkets:[],regionalMarkets:{}};
 for(const r of regions){w.banks[r.id]={openingCash:1e9,cash:1e9,lent:0,repaid:0,interest:0,losses:0};w.public[r.id]={assessed:0,leagueAssessed:0,stateSpent:0,leagueSpent:0,grassroots:0,facilities:0,services:0,youth:0,rescue:0};w.regionalMarkets[r.id]=Math.round(180e6*Math.sqrt(r.population)*regionWeight[r.id]);}
 for(const d of localDivisions)w.members[d.id]=localClubs.filter(c=>c.division===d.id).map(c=>c.id);
 for(const info of localClubs){
  const a={cash:0,openingCash:0,seasonOpeningCash:0,totals:emptyLedger(),season:emptyLedger(),income:{},incomeTotals:{},withholding:{season:{gross:0,incomeTax:0,net:0},totals:{gross:0,incomeTax:0,net:0}},history:[]};
  const c=w.clubs[info.id]={id:info.id,tier:info.tier,division:info.division,status:'active',reputation:initialLocalReputation(info.id,info.tier),roster:[],finance:a};
  for(let i=0;i<25;i++)createLocalPlayer(w,c,i,s.year);
 }
 allocateBudgets(w);
 for(const c of Object.values(w.clubs)){const a=c.finance;a.cash=a.openingCash=a.seasonOpeningCash=Math.round(a.operatingRevenueBudget*.3);const bill=c.roster.reduce((n,id)=>n+w.players[id].weeklyWage,0),ratio=Math.min(1,a.wageLimit/Math.max(1,bill));for(const id of c.roster)w.players[id].weeklyWage=Math.floor(w.players[id].weeklyWage*ratio/7)*7;}
 w.fixtures=schedules(w,s.year);
}
function localIncome(e,id,key,amount){const a=accountOf(e,id);postAccount(e,id,'funding',amount);a.income[key]=(a.income[key]||0)+amount;a.incomeTotals[key]=(a.incomeTotals[key]||0)+amount;}
function accrueLocal(s,to){
 const e=s.economy,w=e.world,days=daysBetween(w.through,to);if(!days)return;
 const duration=daysBetween(dateOf(w.year,1,1),dateOf(w.year+1,1,1));
 for(const c of Object.values(w.clubs)){if(c.status!=='active')continue;const a=c.finance;a.localDays+=days;
  const revenue=Math.floor(a.annualCommercial*a.localDays/duration),cost=Math.floor(a.operatingBudget*a.localDays/duration);localIncome(e,c.id,'commercial',revenue-a.postedCommercial);a.postedCommercial=revenue;payOperating(e,c.id,'operating',cost-a.postedOperating);a.postedOperating=cost;
  const payments=[];for(const id of c.roster){const p=w.players[id];if(p.status!=='local')continue;const gross=p.weeklyWage/7*days;payments.push({id,amount:gross});const age=w.year-p.birthYear,exposure=clamp(p.seasonMinutes/1200,.15,1),training=1+Math.min(.25,w.public[localClubById.get(c.id).region].facilities/(w.regionalMarkets[localClubById.get(c.id).region]*3)),rate=age<24?(p.potential-p.ability)*.12*exposure*training:age<30?.2:-(age-29)*.15;p.ability=Math.min(p.potential,toAbility(clamp(age<24?toSkill(p.potential)-(toSkill(p.potential)-toSkill(p.ability))*Math.exp(-.12*exposure*training*days/365):toSkill(p.ability)+rate*days/365,1,toSkill(p.potential))));}
  payPayroll(e,c.id,payments);
 }
 w.through=to;
}
function poisson(random,mean){const limit=Math.exp(-mean);let p=1,k=0;do{k++;p*=random.next();}while(p>limit&&k<12);return k-1;}
function localLineup(w,id){const c=w.clubs[id],ps=c.roster.map(id=>w.players[id]).filter(p=>p.status==='local'),keeper=ps.filter(p=>p.position==='GK').sort((a,b)=>b.ability-a.ability||a.id.localeCompare(b.id))[0];return [keeper,...ps.filter(p=>p.position!=='GK').sort((a,b)=>b.ability-a.ability||a.id.localeCompare(b.id)).slice(0,10)].filter(Boolean);}
function playLocal(s,m){
 const e=s.economy,w=e.world,lineups=[localLineup(w,m.home),localLineup(w,m.away)];if(lineups.some(ps=>ps.length!==11||ps[0].position!=='GK'))throw Error('地方球队阵容不足');
 const strength=lineups.map(ps=>ps.reduce((n,p)=>n+toSkill(p.ability),0)/11),r=rng(`local-match:${m.id}`);m.score=[poisson(r,clamp(1.45+(strength[0]-strength[1])*.045,.2,3.8)),poisson(r,clamp(1.15+(strength[1]-strength[0])*.045,.2,3.8))];
 m.players=lineups.map((ps,side)=>{const goals=new Map();for(let i=0;i<m.score[side];i++){const targets=ps.filter(p=>p.position!=='GK'),p=targets[r.int(0,targets.length-1)];goals.set(p.id,(goals.get(p.id)||0)+1);}
  return ps.map(p=>{p.minutes+=90;p.seasonMinutes+=90;p.goals+=goals.get(p.id)||0;p.seasonGoals+=goals.get(p.id)||0;return {id:p.id,minutes:90,goals:goals.get(p.id)||0};});});
 const home=w.clubs[m.home],away=w.clubs[m.away],actual=m.score[0]>m.score[1]?1:m.score[0]<m.score[1]?0:.5;
 [home.reputation,away.reputation]=matchReputation(home.reputation,away.reputation,actual);
 const a=home.finance,homeGames=w.members[m.competition].length-1;localIncome(e,m.home,'matchday',Math.floor(a.annualGate/homeGames));
}
export function localTransfer(s,id,buyer){
 const e=s.economy,w=e.world,p=w.players[id],b=w.clubs[buyer],seller=w.clubs[p?.club];
 if(!p||p.status!=='local'||!b||b.status!=='active'||buyer===p.club||!['01','02','07'].includes(s.date.slice(5,7))||p.lastTransfer&&daysBetween(p.lastTransfer,s.date)<90)throw Error('地方转会不可执行');
 if(creditFor(e,buyer).status!=='normal'||b.roster.length>=28||!seller||seller.roster.length<=23||seller.roster.filter(id=>w.players[id].position===p.position).length<=(p.position==='GK'?2:1))throw Error('地方转会阵容或财政受限');
 const fee=seller.tier==='amateur'?0:Math.round(p.weeklyWage*30*Math.min(1.5,Math.max(.2,(36-(w.year-p.birthYear))/12))),tax=transferTax(e,fee),wage=playerWage(p.ability,b.tier),bill=b.roster.reduce((n,id)=>n+w.players[id].weeklyWage,0);
 if(b.finance.cash-fee<b.finance.operatingRevenueBudget*.15||bill+wage>b.finance.wageLimit||fee>b.finance.transferBudget-b.finance.spent)throw Error('地方转会预算不足');
 postAccount(e,buyer,'transferOut',fee);postAccount(e,seller.id,'transferIn',fee);postAccount(e,seller.id,'transferTax',tax);taxReceipt(e,seller.id,'transferTax',tax);b.finance.spent+=fee;
 seller.roster=seller.roster.filter(x=>x!==id);b.roster.push(id);p.history.push({date:s.date,from:seller.id,to:buyer,fee});p.club=buyer;p.weeklyWage=wage;p.end=dateOf(w.year+2,12,31);p.lastTransfer=s.date;syncExternal(s,p);
 const move={id:`move:${e.sequence++}`,type:'transfer',date:s.date,player:id,from:seller.id,to:buyer,fee,transferTax:tax,sellerNet:fee-tax,bonus:0,weeklyWage:wage,end:p.end,local:true};e.moves.push(move);return move;
}
function runLocalMarket(s){
 const w=s.economy.world,key=s.date.slice(0,7);if(!['01','07'].includes(s.date.slice(5,7))||w.processedMarkets.includes(key))return;w.processedMarkets.push(key);
 const byProvince=new Map();for(const p of Object.values(w.players))if(p.status==='local'){const province=localClubById.get(p.club).province,list=byProvince.get(province)||[];list.push(p);byProvince.set(province,list);}
 for(const c of Object.values(w.clubs).filter(c=>c.status==='active'&&c.tier!=='amateur')){
  const available=byProvince.get(localClubById.get(c.id).province)||[],own=c.roster.map(id=>w.players[id]),ownOutfield=own.filter(p=>p.position!=='GK'),worst=ownOutfield.length?Math.min(...ownOutfield.map(p=>p.ability)):1;
  const targets=available.filter(p=>p.club!==c.id&&toSkill(p.ability)>toSkill(worst)+3&&w.clubs[p.club]?.status==='active').sort((a,b)=>b.ability-a.ability||a.id.localeCompare(b.id));
  for(const p of targets.slice(0,12)){try{localTransfer(s,p.id,c.id);break;}catch{}}
 }
}
export function nextWorldBoundary(s){const w=s.economy?.world;return w?[w.nextMonth,w.fixtures[w.fixtureCursor]?.date].filter(Boolean).sort()[0]:null;}
export function advanceWorld(s,date){
 const w=s.economy?.world;if(!w)return;if(date<w.through)throw Error('地方赛历不能倒退');
 while(w.through<date||w.fixtures[w.fixtureCursor]?.date<=date||w.nextMonth<=date){
  const end=[date,w.nextMonth,w.fixtures[w.fixtureCursor]?.date].filter(Boolean).sort()[0];
  accrueLocal(s,end);while(w.fixtureCursor<w.fixtures.length&&w.fixtures[w.fixtureCursor].date<=end)playLocal(s,w.fixtures[w.fixtureCursor++]);
  if(end===w.nextMonth){settleCreditMonth({...s,date:end});const year=Number(end.slice(0,4)),month=Number(end.slice(5,7));w.nextMonth=month===12?dateOf(year+1,1,1):dateOf(year,month+1,1);}
 }
 if(date===s.economy.nextReview)runLocalMarket({...s,date});
}
export function dissolveLocalClub(s,id){
 const e=s.economy,w=e.world,c=w?.clubs[id];if(!c||c.status!=='active')throw Error('解散对象无效');
 const credit=creditFor(e,id);if(credit.status!=='administration')throw Error('须先进入托管');
 // Finish this season's fixtures; dissolution and replacement occur together.
 c.dissolveAfterSeason=true;w.events.push({date:s.date,type:'dissolution-pending',club:id});
}
export function settleLocalSeason(s){
 const e=s.economy,w=e.world;if(!w)return;if(w.fixtureCursor!==w.fixtures.length)throw Error('地方赛季尚未完成');
 const tables=Object.fromEntries(localDivisions.map(d=>[d.id,standings(w.members[d.id],w.fixtures.filter(m=>m.competition===d.id),{seed:`${w.year}:${d.id}`})]));
 w.tables=tables;
}
export function rollWorld(s){
 const e=s.economy,w=e.world;if(!w||w.year===s.year)return;
 if(w.year!==s.year-1)throw Error('地方赛季不能跳年');if(!w.tables)settleLocalSeason(s);
 const summary={year:w.year,matches:w.fixtureCursor,tables:w.tables,movements:[],finances:[],transfers:e.moves.filter(m=>m.local&&m.date.startsWith(String(w.year).padStart(4,'0'))).length};
 // City champions compete for three provincial places; locality survives movement.
 for(const d of localDivisions.filter(d=>d.tier==='professional')){
  const children=localDivisions.filter(x=>x.province===d.province&&x.tier==='semi'),up=children.map(x=>w.tables[x.id].find(r=>w.clubs[r.id].status==='active')?.id).filter(Boolean),down=w.tables[d.id].filter(r=>w.clubs[r.id].status==='active').slice(-up.length).map(r=>r.id);
  up.forEach((id,i)=>swapMembership(w,id,down[i],summary.movements));
 }
 for(const d of localDivisions.filter(d=>d.tier==='semi')){const amateur=localDivisions.find(x=>x.city===d.city&&x.tier==='amateur'),up=w.tables[amateur.id][0].id,down=w.members[d.id].filter(id=>!w.tables[d.id].slice(0,1).some(r=>r.id===id)).sort((a,b)=>(w.tables[d.id].find(r=>r.id===b)?.rank||0)-(w.tables[d.id].find(r=>r.id===a)?.rank||0))[0];swapMembership(w,up,down,summary.movements);}
 for(const c of Object.values(w.clubs).filter(c=>c.status==='active')){
  const credit=creditFor(e,c.id);
  if(credit.status==='administration'&&(unpaidTotal(c.finance)>c.finance.operatingRevenueBudget*.2||credit.missed>=6))c.dissolveAfterSeason=true;
  if(!c.dissolveAfterSeason)continue;
  const division=c.division,lower=Object.values(w.clubs).filter(x=>x.status==='active'&&!x.dissolveAfterSeason&&localClubById.get(x.id).province===localClubById.get(c.id).province&&({professional:1,semi:2,amateur:3}[x.tier])>({professional:1,semi:2,amateur:3}[c.tier])).sort((a,b)=>(w.tables[a.division]?.find(r=>r.id===a.id)?.rank||99)-(w.tables[b.division]?.find(r=>r.id===b.id)?.rank||99)||a.id.localeCompare(b.id))[0];
  if(!lower&&c.tier!=='amateur')continue;
  const lowerDivision=lower?.division||division;
  w.members[division]=w.members[division].filter(id=>id!==c.id);
  if(lower){w.members[division].push(lower.id);lower.division=division;lower.tier=localDivisionById.get(division).tier;lower.reputation=moveReputation(lower.reputation,'up');w.members[lowerDivision]=w.members[lowerDivision].filter(id=>id!==lower.id);}
  c.status='dissolved';credit.status='dissolved';settlePayables(e,c.id);credit.unpaidEstate=c.finance.payables?structuredClone(c.finance.payables):null;
  const claims=c.roster.map(id=>({id,amount:Math.round(Math.max(0,daysBetween(s.date,addDays(w.players[id].end,1)))*w.players[id].weeklyWage/7)})),total=claims.reduce((n,x)=>n+x.amount,0),budget=Math.min(Math.max(0,c.finance.cash),total);let paid=0;
  for(const [i,claim] of claims.entries()){const amount=i===claims.length-1?budget-paid:Math.floor(budget*claim.amount/Math.max(1,total));paid+=amount;postAccount(e,c.id,'severance',amount);payPlayer(e,claim.id,c.id,amount);e.moves.push({id:`move:${e.sequence++}`,type:'release',date:s.date,player:claim.id,from:c.id,compensation:amount,unpaidClaim:claim.amount-amount,insolvency:true,local:true});w.events.push({date:s.date,type:'employment-claim',club:c.id,player:claim.id,amount,unpaid:claim.amount-amount});}
  credit.employeeClaimsUnpaid=(credit.employeeClaimsUnpaid||0)+total-paid;
  if(c.finance.cash>0&&credit.principal)repay(s,c.id,Math.min(c.finance.cash,credit.principal));writeOffDebt(s,c.id);
  credit.interestWrittenOff=(credit.interestWrittenOff||0)+(credit.interestArrears||0);credit.interestArrears=0;
  for(const id of c.roster){w.players[id].club=null;w.players[id].status='free';w.players[id].weeklyWage=0;syncExternal(s,w.players[id]);}c.roster=[];
  summary.movements.push({type:'replacement',from:c.id,to:lower?.id||null,division,lowerDivision});
 }
 // Fill successive vacancies from the actual lower standings. At the bottom,
 // a new community association hires released players and receives no free cash.
 for(const tier of ['professional','semi','amateur'])for(const d of localDivisions.filter(d=>d.tier===tier))while(w.members[d.id].length<LOCAL_TIERS[d.tier].teams){
  const lower=Object.values(w.clubs).filter(c=>c.status==='active'&&!c.dissolveAfterSeason&&localClubById.get(c.id).province===d.province&&({professional:1,semi:2,amateur:3}[c.tier])>({professional:1,semi:2,amateur:3}[d.tier])).sort((a,b)=>(w.tables[a.division]?.find(r=>r.id===a.id)?.rank||99)-(w.tables[b.division]?.find(r=>r.id===b.id)?.rank||99)||a.id.localeCompare(b.id))[0];
  if(lower){const from=lower.division;w.members[from]=w.members[from].filter(id=>id!==lower.id);w.members[d.id].push(lower.id);lower.division=d.id;lower.tier=d.tier;lower.reputation=moveReputation(lower.reputation,'up');summary.movements.push({type:'vacancy-promotion',id:lower.id,from,to:d.id});continue;}
  if(d.tier!=='amateur')throw Error('地方递补缺少下级球队');
  const id=`community:${d.id}:${s.year}:${w.members[d.id].length}`,city=d.city,info={id,name:`${cities.find(c=>c.id===city).name}新社区${s.year}-${w.members[d.id].length+1}`,division:d.id,tier:d.tier,province:d.province,region:d.region,city,local:true};localClubById.set(id,info);
  const a={cash:0,openingCash:0,seasonOpeningCash:0,totals:emptyLedger(),season:emptyLedger(),income:{},incomeTotals:{},withholding:{season:{gross:0,incomeTax:0,net:0},totals:{gross:0,incomeTax:0,net:0}},history:[]};
  const c=w.clubs[id]={id,identity:info,tier:d.tier,division:d.id,status:'active',reputation:initialLocalReputation(id,d.tier),roster:[],finance:a};w.members[d.id].push(id);
  for(const position of ROSTER_POSITIONS){
   let p=Object.values(w.players).find(p=>p.status==='free'&&p.position===position),from=null;
   if(!p){const donor=Object.values(w.clubs).filter(x=>x.status==='active'&&x.id!==id&&x.tier==='amateur'&&x.roster.length>23&&x.roster.filter(pid=>w.players[pid].position===position).length>(position==='GK'?2:1)).sort((a,b)=>Number(localClubById.get(b.id).city===city)-Number(localClubById.get(a.id).city===city)||a.id.localeCompare(b.id))[0];if(!donor)throw Error('社区报名缺少自由球员');p=donor.roster.map(pid=>w.players[pid]).filter(p=>p.position===position).sort((a,b)=>a.ability-b.ability)[0];from=donor.id;donor.roster=donor.roster.filter(pid=>pid!==p.id);}
   p.club=id;p.status='local';p.weeklyWage=0;p.end=dateOf(s.year,12,31);c.roster.push(p.id);syncExternal(s,p);
   e.moves.push({id:`move:${e.sequence++}`,type:'transfer',date:s.date,player:p.id,from,to:id,fee:0,transferTax:0,sellerNet:0,bonus:0,weeklyWage:0,end:p.end,local:true});
  }
  summary.movements.push({type:'new-community',id,division:d.id});
 }
 for(const p of Object.values(w.players)){p.history.push({year:w.year,club:p.club,ability:p.ability,minutes:p.seasonMinutes,goals:p.seasonGoals});p.seasonMinutes=0;p.seasonGoals=0;if(p.status==='local'&&s.year-p.birthYear>=38){w.clubs[p.club].roster=w.clubs[p.club].roster.filter(id=>id!==p.id);p.status='retired';p.club=null;p.weeklyWage=0;syncExternal(s,p);}}
 for(const c of Object.values(w.clubs)){if(c.status==='core')continue;const a=c.finance;summary.finances.push({id:c.id,cash:a.cash,openingCash:a.seasonOpeningCash,...a.season,withholding:{...a.withholding.season},debt:creditFor(e,c.id).principal,reputation:c.reputation,status:c.status});a.history.push(summary.finances.at(-1));}
 for(const c of Object.values(w.clubs)){if(c.status==='core')continue;const a=c.finance;a.season=emptyLedger();a.income={};a.seasonOpeningCash=a.cash;if(c.status!=='active')continue;let n=0;while(c.roster.length<25){const counts=new Map(ROSTER_POSITIONS.map(pos=>[pos,c.roster.filter(id=>w.players[id].position===pos).length])),position=ROSTER_POSITIONS.find(pos=>counts.get(pos)<ROSTER_POSITIONS.filter(x=>x===pos).length);let index=ROSTER_POSITIONS.indexOf(position)+25*n++;while(w.players[`grass:${c.id}:${s.year}:${index}`])index+=25;createLocalPlayer(w,c,index,s.year,true);}}
 w.history.push(summary);w.year=s.year;allocateBudgets(w);
 for(const c of Object.values(w.clubs).filter(c=>c.status==='active'))for(const id of c.roster){const p=w.players[id];if(p.end<s.date){p.weeklyWage=playerWage(p.ability,c.tier);p.end=dateOf(s.year+1,12,31);}}
 w.fixtures=schedules(w,s.year);w.fixtureCursor=0;w.nextMonth=dateOf(s.year,2,1);delete w.tables;
}
function swapMembership(w,up,down,movements){if(!up||!down)return;const a=w.clubs[up],b=w.clubs[down],ad=a.division,bd=b.division;w.members[ad]=w.members[ad].map(id=>id===up?down:id);w.members[bd]=w.members[bd].map(id=>id===down?up:id);a.division=bd;b.division=ad;a.tier=localDivisionById.get(bd).tier;b.tier=localDivisionById.get(ad).tier;a.reputation=moveReputation(a.reputation,'up');b.reputation=moveReputation(b.reputation,'down');movements.push({type:'promotion',up,down,from:ad,to:bd});}
export function validateWorld(s){
 const e=s.economy,w=e?.world;if(!w)return;const integer=n=>Number.isSafeInteger(n)&&n>=0;
 if(w.version!==1||w.year!==s.year||w.through>e.through)throw Error('地方世界版本或日期无效');
 for(const c of Object.values(w.clubs))if(c.identity)localClubById.set(c.id,c.identity);
 const ids=Object.values(w.members).flat();if(new Set(ids).size!==ids.length||localDivisions.some(d=>w.members[d.id]?.length!==LOCAL_TIERS[d.tier].teams))throw Error('地方联赛席位无效');
 const active=new Set(ids),players=new Set();for(const [id,c] of Object.entries(w.clubs)){
  if(!localClubById.has(id)||c.status==='active'!==active.has(id)||c.status==='active'&&!w.members[c.division]?.includes(id)||!Number.isFinite(c.reputation)||c.reputation<REPUTATION_MIN||c.reputation>REPUTATION_MAX||c.roster.some(p=>players.has(p)))throw Error('地方俱乐部归属无效');
  for(const id of c.roster){const p=w.players[id];if(!p||p.club!==c.id||p.status!=='local'||!integer(p.weeklyWage)||p.weeklyWage%7!==0||!Number.isFinite(p.ability)||p.ability<1||p.ability>p.potential||!Number.isFinite(p.potential)||p.potential>200)throw Error('地方球员无效');players.add(id);}
  const a=c.finance;if(a.payables&&(!Number.isSafeInteger(a.payables.operating)||a.payables.operating<0||!Number.isSafeInteger(a.payables.tax)||a.payables.tax<0||Object.values(a.payables.wages).some(n=>!Number.isSafeInteger(n)||n<0)))throw Error('应付款无效');
  if(a.cash!==ledgerCash(a)||Object.values(a.totals).some(n=>!integer(n))||Object.values(a.season).some(n=>!integer(n)))throw Error('地方财政不平衡');
 }
 if(w.fixtureCursor>w.fixtures.length||w.fixtures.some((m,i)=>(i<w.fixtureCursor)!==Boolean(m.score)||m.score&&(!m.score.every(integer)||m.players.some(ps=>ps.length!==11||ps.reduce((n,p)=>n+p.minutes,0)!==990))))throw Error('地方比赛记录无效');
 validatePublicCredit(s);
}
