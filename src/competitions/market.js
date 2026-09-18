import {toAbility} from '../football/ability.js';
import {payPayroll} from './payables.js';
import {seniorTeams,knownTeam} from './team-directory.js';
import {runLocalBridge} from './local-bridge.js';
import {initializeWorld,advanceWorld,rollWorld,validateWorld,nextWorldBoundary,hydrateWorld} from './local-football.js';
import {accountOf,accountsOf,ledgerCash} from './economic-ledger.js';
import {localClubById} from './local-catalog.js';
import {ECONOMIC_MODEL,marketWage,clubWage,marketTransferValue} from './economics.js';
import {isMetroLeague,METRO_SYSTEMS} from './catalog.js';
import {initializeFinance,payrollCapacity,accrueFinance,rollFinance,financialReserve,wageCeiling} from './finance.js';
import {migrateReputationScale,REPUTATION_SCALE_VERSION,REPUTATION_MIN,REPUTATION_MAX} from './reputation.js';
import {footballTeams} from '../football/data.js';
import {hash,clamp} from '../football/random.js';
import {getDivision} from './catalog.js';
import {dateOf,addDays,daysBetween} from './calendar.js';
import {populationPlayers,populationPlayer,clubPlayers,ensurePopulation,setPlayerClub,currentSkill,promotePlayer,persistPlayer} from './population.js';
import {registeredPlayer,withRosterIndex,loanedPlayerIds} from './registry.js';
import {advanceDevelopment} from './development.js';
import {clearBids,fundedCeiling} from './bidding.js';
import {initializeTaxation,transferTax,payPlayer,taxReceipt,validateTaxation} from './taxation.js';
const clubIds=new Set([...footballTeams.map(t=>t.id),...localClubById.keys()]);
const knownClub=id=>clubIds.has(id)||localClubById.has(id);
const moneyKeys=['funding','transferIn','transferOut','wages','severance','bonuses'];
const zero=()=>Object.fromEntries(moneyKeys.map(k=>[k,0]));
const contractClub=(s,p)=>s.playerRegistry?.registrations[p.id]?.status==='loan'?s.playerRegistry.registrations[p.id].ownerClubId:p.club;
const yearEnd=s=>dateOf(s.year,12,31);
export const competitiveMarket=s=>s.economy?.biddingVersion===1&&!s.population;
// Accumulated cash can fund recruitment, while payroll and liquidity reserves
// are still checked on the complete contract. Spent cash is counted once.
export function recruitmentAllowance(s,id){const a=s.economy.accounts[id];if(s.economy.world?.credit[id]?.status&&s.economy.world.credit[id].status!=='normal')return 0;return a.transferBudget-a.spent+(competitiveMarket(s)?Math.floor(Math.max(0,a.cash+a.spent-(a.operatingRevenueBudget||0)*.5)*.35):0);}
export function isTransferWindow(s,date=s.date){return s.calendar.events.some(e=>e.kind==='window'&&date>=e.date&&date<=e.end);}
export function clubLevel(s,club){const division=Object.keys(s.members).find(d=>s.members[d].includes(club)),level=getDivision(division);return !level?0:isMetroLeague(division)?79:74-(level.tier-1)*9;}
const wageAt=ability=>Math.max(70,Math.round(150*Math.pow(1.07,ability-40)/7)*7);
const clubDivision=(s,id)=>Object.keys(s.members).find(d=>s.members[d].includes(id));
const demandAt=(s,ability,club)=>s.economy?.marketVersion===ECONOMIC_MODEL?(club?clubWage(toAbility(ability),clubDivision(s,club),club):marketWage(toAbility(ability))):wageAt(ability);
export const weeklyWage=(s,p,buyer=p.club)=>demandAt(s,currentSkill(s,p),buyer);
const annualTerms=(s,club)=>{const wageLimit=wageAt(clubLevel(s,club))*30;return {wageLimit,transferBudget:wageLimit*18,funding:wageLimit*72};};
function record(e,club,key,amount){const a=e.accounts[club];a.totals[key]=(a.totals[key]||0)+amount;a.season[key]=(a.season[key]||0)+amount;a.cash+=['funding','transferIn'].includes(key)?amount:-amount;}
function move(e,s,type,p,extra={}){e.moves.push({id:`move:${e.sequence++}`,date:s.date,type,player:p.id,...extra});}
function contractFor(s,p){const youth=p.unit==='youth',years=1+hash(`contract:${p.id}`)%3;return {club:p.club,start:s.date,end:dateOf(Math.max(s.year,youth?p.birthYear+20:s.year+years-1),12,31),weeklyWage:youth?(s.economy?.marketVersion===ECONOMIC_MODEL?700:140):weeklyWage(s,p),kind:youth?'youth':'senior'};}
export function ensureEconomy(s){
 ensurePopulation(s);if(s.economy){hydrateWorld(s.economy);initializeFinance(s);migrateReputationScale(s.economy);return s.economy;}
 const e=s.economy={version:1,marketVersion:s.population?1:ECONOMIC_MODEL,...(!s.population?{biddingVersion:1,taxVersion:1}:{}),reputationScale:REPUTATION_SCALE_VERSION,year:s.year,through:s.date,nextReview:addDays(s.date,7),accounts:{},contracts:{},moves:[],sequence:0};
 for(const p of populationPlayers(s))if(contractClub(s,p))e.contracts[p.id]={...contractFor(s,p),club:contractClub(s,p)};
 for(const team of seniorTeams(s)){const terms=annualTerms(s,team.id),bill=clubPlayers(s,team.id,{unit:'all'}).reduce((n,p)=>n+e.contracts[p.id].weeklyWage,0);terms.wageLimit=Math.max(terms.wageLimit,Math.ceil(bill*1.15/7)*7);terms.funding=terms.wageLimit*72;terms.transferBudget=terms.wageLimit*18;const cash=terms.funding+terms.transferBudget;e.accounts[team.id]={cash,openingCash:cash,...terms,baseWageLimit:terms.wageLimit,baseLevel:clubLevel(s,team.id),spent:0,totals:zero(),season:zero(),history:[]};}
 initializeFinance(s);initializeTaxation(s);initializeWorld(s);return e;
}
export function wageBill(s,club){const e=ensureEconomy(s);return clubPlayers(s,club,{unit:'all'}).reduce((n,p)=>n+(e.contracts[p.id]?.club===club?e.contracts[p.id].weeklyWage:0),0)+loanedPlayerIds(s,club).reduce((n,id)=>n+(e.contracts[id]?.weeklyWage||0),0);}
export function availableBudget(s,club){const e=ensureEconomy(s),a=e.accounts[club],reserve=financialReserve(s,club,wageBill(s,club));return Math.max(0,Math.min(recruitmentAllowance(s,club),a.cash-reserve));}
function ensureReady(s){if(s.activeMatch)throw Error('请在比赛结束后处理合同');const e=ensureEconomy(s);if(e.through!==s.date)throw Error('请先同步赛历');return e;}
function ownPlayer(s,id){const p=populationPlayer(s,id),reg=s.playerRegistry?.registrations[id];if(reg?.status==='loan')throw Error('租借球员须先归队再处理合同');if(reg?.pathway==='royal'&&reg.status==='youth'&&!reg.signedAt)throw Error('皇家学院球员须经选秀签约');if(!s.manager||!p||p.club!==s.manager.clubId||p.retired)throw Error('只能管理本队球员合同');return p;}
function canLose(s,p,{minimum=23}={}){const roster=clubPlayers(s,p.club);return roster.length>minimum&&roster.filter(q=>q.position===p.position).length>(p.position==='GK'?2:1);}
export function askingPrice(s,p){if(!p.club)return 0;if(s.economy?.marketVersion===ECONOMIC_MODEL){const c=s.economy.contracts[p.id];return marketTransferValue({ability:toAbility(currentSkill(s,p)),age:s.year-p.birthYear,remainingDays:c?daysBetween(s.date,addDays(c.end,1)):0,position:p.position});}const age=s.year-p.birthYear,ageFactor=clamp(1.25-(age-22)*.045,.35,1.6);return Math.round(weeklyWage(s,p)*65*ageFactor/100)*100;}
function transferEligibility(s,id,buyer,years=3,{sellerApproved=false,context}={}){
 const e=ensureEconomy(s),p=context?.byId.get(id)||populationPlayer(s,id),rosterFor=club=>context?.rosters.get(club)||clubPlayers(s,club);
 if(!p||p.retired||p.registrationStatus==='loan'||!['senior','free'].includes(p.unit))throw Error('球员不可签约');
 if(!e.accounts[buyer]||e.accounts[buyer].dissolved||!knownClub(buyer)||p.club===buyer)throw Error('目标俱乐部无效');
 if(![1,2,3].includes(years))throw Error('合同期限须为 1—3 年');
 if(!isTransferWindow(s))throw Error('注册窗口未开放');
 if(s.year-p.birthYear<16)throw Error('球员须满 16 岁');
 const reg=s.playerRegistry?.registrations[id];if(reg?.rightsClubId&&reg.rightsUntil>=s.date&&reg.rightsClubId!==buyer)throw Error('其他俱乐部持有选秀签约权');if(reg?.pathway==='royal'&&!reg.signedAt&&!reg.draftEnteredYear&&s.year-p.birthYear<24)throw Error('皇家学院球员须先参加选秀');
 if(p.lastTransfer&&daysBetween(p.lastTransfer,s.date)<90)throw Error('球员刚刚转会');
 const roster=rosterFor(buyer);if(s.population?roster.length>=30:roster.length>=40||s.year-p.birthYear>=21&&roster.filter(q=>s.year-q.birthYear>=21).length>=25)throw Error('一线队报名名额已满');
 if(p.club){if(p.club===s.manager?.clubId&&!sellerApproved)throw Error('需经理同意出售');const seller=rosterFor(p.club);if(seller.length<=(sellerApproved?18:23)||seller.filter(q=>q.position===p.position).length<=(p.position==='GK'?2:1))throw Error('卖方阵容或位置人数不足');
  if(!competitiveMarket(s)&&!sellerApproved){const peers=seller.filter(q=>q.position===p.position).sort((a,b)=>currentSkill(s,a)-currentSkill(s,b)||a.id.localeCompare(b.id));if(peers[0].id!==p.id)throw Error('卖方希望保留主力');}}
 if(!competitiveMarket(s)&&currentSkill(s,p)>clubLevel(s,buyer)+11)throw Error('球员希望加盟更高级别球队');
 return {p,roster};
}
function bidContext(s){
 const players=populationPlayers(s),ability=new Map(players.map(p=>[p.id,currentSkill(s,p)])),rosters=new Map(seniorTeams(s).map(t=>[t.id,[]])),bills=new Map(seniorTeams(s).map(t=>[t.id,0]));
 for(const p of players)if(p.club&&p.unit==='senior')rosters.get(p.club)?.push(p);
 for(const c of Object.values(s.economy.contracts))bills.set(c.club,(bills.get(c.club)||0)+c.weeklyWage);
 const depth=new Map([...rosters].map(([id,ps])=>[id,new Map([...new Set(ps.map(p=>p.position))].map(pos=>[pos,ps.filter(p=>p.position===pos).map(p=>ability.get(p.id)).sort((a,b)=>b-a)]))]));
 return {players,byId:new Map(players.map(p=>[p.id,p])),ability,rosters,bills,depth};
}
function openingTerms(s,p,context){
 const ability=context.ability.get(p.id),peers=p.club?context.depth.get(p.club)?.get(p.position)||[]:[];
 // A first-choice player commands a replacement premium, but still becomes
 // available when a funded bidder meets it and the seller retains cover.
 const importance=peers.length&&ability>=peers[0]?1.45:peers.length>1&&ability>=peers[1]?1.15:1;
 const baseFee=Math.round(askingPrice(s,p)*importance),baseWage=Math.max(350,Math.ceil((s.economy.contracts[p.id]?.weeklyWage||0)*1.05/7)*7,Math.floor(marketWage(toAbility(ability))*.38/7)*7);
 const scarcity=1+1/Math.sqrt(Math.max(1,context.players.filter(q=>q.club&&q.unit==='senior'&&q.position===p.position&&context.ability.get(q.id)>=ability).length));
 return {baseFee,baseWage,scarcity};
}
function clubBid(s,p,club,context,terms,{force=false,sellerApproved=false,years=3,retain=false}={}){
 const a=s.economy.accounts[club],quality=context.ability.get(p.id),roster=context.rosters.get(club),peers=context.depth.get(club).get(p.position)||[];
 if(!a||club===s.manager?.clubId&&!force)return null;
 if(!retain){
  if(!force&&!(peers.length<2||quality>(peers[1]??0)+2||roster.length<24&&quality>=clubLevel(s,club)-16))return null;
  try{transferEligibility(s,p.id,club,years,{sellerApproved,context});}catch{return null;}
 }
 const minimumWage=weeklyWage(s,p,club),old=retain?s.economy.contracts[p.id]?.weeklyWage||0:0,bill=context.bills.get(club)-old;
 const reserveDepth=Math.max(0,24-roster.length-(retain?0:1))*demandAt(s,clubLevel(s,club)-12,club);
 const importance=clamp(.5+(quality-(peers[1]??clubLevel(s,club)-12))/12,.25,2);
 const liquidity=Math.max(0,a.cash-financialReserve(s,club,bill))/(a.operatingRevenueBudget||a.revenueBudget||1);
 const upper=1+Math.sqrt(liquidity)*importance*terms.scarcity;
 const affordable=factor=>{
  const wage=Math.max(minimumWage,Math.floor(terms.baseWage*factor/7)*7),fee=retain?0:Math.round(terms.baseFee*factor),bonus=wage*(retain?2:4);
  if(bill+wage+reserveDepth>payrollCapacity(s,club))return false;
  if(fee+bonus>Math.min(retain?Infinity:recruitmentAllowance(s,club),a.cash-financialReserve(s,club,bill+wage)))return false;
  // Reserve the incremental guaranteed wage for the entire offered term,
  // including seasons beyond the finance module's one-year liquidity check.
  const annualRevenue=a.operatingRevenueBudget||a.revenueBudget||0;
  return a.cash-fee-bonus>=Math.max(bill*8,(bill+wage)*52*years+(a.operatingBudget||0)*years-annualRevenue*years);
 };
 const ceiling=fundedCeiling(upper,affordable);
 return ceiling>=1?{club,ceiling,minimumWage}:null;
}
export function marketAuction(s,id,{buyer,sellerApproved=false,years=3,context}={}){
 ensureEconomy(s);if(!competitiveMarket(s))return null;
 context??=bidContext(s);const p=context.players.find(p=>p.id===id);if(!p)return null;
 const terms=openingTerms(s,p,context),collect=()=>seniorTeams(s).map(t=>clubBid(s,p,t.id,context,terms,{force:t.id===buyer,sellerApproved,years})).filter(Boolean);
 let bids=collect();
 // A funded wage offer is a real alternative for the player. Reprice against
 // that common floor so a higher fee cannot win with an inferior salary.
 const wageFloor=Math.max(terms.baseWage,...bids.map(b=>b.minimumWage));
 if(wageFloor>terms.baseWage){terms.baseWage=wageFloor;bids=collect();}
 const result=clearBids(bids,{fee:terms.baseFee,wage:terms.baseWage});return result&&{...result,...terms};
}
export function transferQuote(s,id,buyer,years=3,{sellerApproved=false}={}){
 const {p}=transferEligibility(s,id,buyer,years,{sellerApproved}),e=s.economy;
 if(competitiveMarket(s)){
  const auction=marketAuction(s,id,{buyer,sellerApproved,years});
  if(!auction)throw Error('可用资金或工资预算不足');
  if(auction.club!==buyer)throw Error('竞争俱乐部提供了更高报价');
  return {player:id,from:p.club,to:buyer,fee:auction.fee,...(e.taxVersion===1?{transferTax:transferTax(e,auction.fee),sellerNet:auction.fee-transferTax(e,auction.fee)}:{}),bonus:auction.weeklyWage*4,weeklyWage:auction.weeklyWage,years,end:dateOf(s.year+years-1,12,31),bidding:{factor:auction.factor,bidders:auction.bidders,runnerUp:auction.runnerUp,baseFee:auction.baseFee,baseWage:auction.baseWage}};
 }
 const wage=Math.max(weeklyWage(s,p,buyer),Math.ceil((e.contracts[id]?.weeklyWage||0)*1.05/7)*7),fee=askingPrice(s,p),bonus=wage*4,a=e.accounts[buyer];
 const vacant=Math.max(0,24-clubPlayers(s,buyer).length-1),depthReserve=vacant*demandAt(s,clubLevel(s,buyer)-12,buyer);
 if(wageBill(s,buyer)+wage+depthReserve>payrollCapacity(s,buyer))throw Error('工资预算不足');
 const reserve=financialReserve(s,buyer,wageBill(s,buyer)+wage);
 if(fee+bonus>Math.min(a.transferBudget-a.spent,a.cash-reserve))throw Error('可用资金不足');
 return {player:id,from:p.club,to:buyer,fee,...(e.taxVersion===1?{transferTax:transferTax(e,fee),sellerNet:fee-transferTax(e,fee)}:{}),bonus,weeklyWage:wage,years,end:dateOf(s.year+years-1,12,31)};
}
export function signPlayer(s,id,buyer=s.manager?.clubId,years=3,{automatic=false,sellerApproved=false}={}){
 const e=ensureReady(s);if(!automatic&&buyer!==s.manager?.clubId&&!sellerApproved)throw Error('只能为本队签约');
 const q=transferQuote(s,id,buyer,years,{sellerApproved}),p=populationPlayer(s,id);
 if(sellerApproved&&p.club!==s.manager?.clubId)throw Error('只能出售本队球员');
 const seller=p.club;if(seller){record(e,seller,'transferIn',q.fee);if(e.taxVersion===1){record(e,seller,'transferTax',q.transferTax);taxReceipt(e,seller,'transferTax',q.transferTax);}p.lastClub=seller;}
 record(e,buyer,'transferOut',q.fee);record(e,buyer,'bonuses',q.bonus);payPlayer(e,id,buyer,q.bonus);e.accounts[buyer].spent+=q.fee+q.bonus;
 setPlayerClub(s,p,buyer);p.unit='senior';p.lastTransfer=s.date;p.joinedYear=s.year;delete s.development?.plans[id];
 const used=new Set(clubPlayers(s,buyer,{unit:'all'}).filter(x=>x.id!==id).map(x=>x.number));let number=1;while(used.has(number))number++;p.number=number;
 e.contracts[id]={club:buyer,start:s.date,end:q.end,weeklyWage:q.weeklyWage,kind:'senior'};
 // Pending league bans follow the player even after release; cup bans remain
 // competition-specific. Same-league yellow accumulation is preserved.
 const newDivision=Object.keys(s.members).find(d=>s.members[d].includes(buyer));
 for(const key of Object.keys(s.discipline)){const [competition,player]=key.split('/');if(player!==id||!getDivision(competition)||competition===newDivision)continue;const old=s.discipline[key],next=s.discipline[`${newDivision}/${id}`]??={yellow:0,ban:0};next.ban+=old.ban;delete s.discipline[key];}
 persistPlayer(s,p);move(e,s,'transfer',p,q);s.revision++;return q;
}
export function renewalQuote(s,id,years=3,{reserveDepth=false}={}){
 const e=ensureEconomy(s),p=populationPlayer(s,id);if(!p?.club||p.retired||![1,2,3].includes(years))throw Error('续约对象或期限无效');
 const reg=s.playerRegistry?.registrations[id];if(reg?.status==='loan'||reg?.pathway==='royal'&&reg.status==='youth'&&!reg.signedAt)throw Error('球员当前注册状态不可续约');
 const old=e.contracts[id],a=e.accounts[p.club],baseWage=Math.max(weeklyWage(s,p),Math.ceil((old?.weeklyWage||0)*1.05/7)*7),currentBill=wageBill(s,p.club)-(old?.weeklyWage||0);
 const signed=clubPlayers(s,p.club).filter(q=>q.id===id||e.contracts[q.id]).length,depthReserve=reserveDepth?Math.max(0,24-signed)*demandAt(s,clubLevel(s,p.club)-12,p.club):0;
 const funded=wage=>{const bill=currentBill+wage,bonus=wage*2,reserve=financialReserve(s,p.club,bill);
  if(bill+depthReserve>payrollCapacity(s,p.club)||bonus>a.cash-reserve)throw Error('续约预算不足');
  if(competitiveMarket(s)&&a.cash-bonus<Math.max(0,(bill*52+(a.operatingBudget||0)-(a.operatingRevenueBudget||0))*years))throw Error('续约预算不足');
 };
 // Rival offers can only raise the wage. Reject an unaffordable minimum before
 // surveying every club; the final, potentially higher offer is checked again.
 funded(baseWage);
 const outside=competitiveMarket(s)&&p.unit==='senior'?marketAuction(s,id,{sellerApproved:p.club===s.manager?.clubId}):null;
 const wage=Math.max(baseWage,outside?.weeklyWage||0),bonus=wage*2;funded(wage);
 return {player:id,club:p.club,weeklyWage:wage,bonus,end:[old?.end||'',dateOf(s.year+years-1,12,31)].sort().at(-1),...(outside?{outsideOffer:{club:outside.club,weeklyWage:outside.weeklyWage}}:{})};
}
export function renewPlayer(s,id,years=3,{automatic=false}={}){
 const e=ensureReady(s),p=automatic?populationPlayer(s,id):ownPlayer(s,id);if(automatic&&p?.club===s.manager?.clubId)throw Error('本队续约由经理决定');
 const q=renewalQuote(s,id,years,{reserveDepth:automatic});record(e,p.club,'bonuses',q.bonus);payPlayer(e,id,p.club,q.bonus);e.contracts[id]={club:p.club,start:s.date,end:q.end,weeklyWage:q.weeklyWage,kind:p.unit==='youth'?'youth':'senior'};move(e,s,'renewal',p,q);s.revision++;return q;
}
export function releaseQuote(s,id){const e=ensureEconomy(s),p=ownPlayer(s,id),c=e.contracts[id];if(p.unit==='senior'&&!canLose(s,p,{minimum:18}))throw Error('阵容或位置人数不足');const compensation=c?Math.max(0,daysBetween(s.date,addDays(c.end,1)))*c.weeklyWage/7:0,reserve=financialReserve(s,p.club,wageBill(s,p.club)-(c?.weeklyWage||0));if(compensation>e.accounts[p.club].cash-reserve)throw Error('解约资金不足');return {player:id,club:p.club,compensation};}
function release(s,p,type,extra={}){const e=s.economy,club=p.club;p.lastClub=club;p.freeSince=s.date;setPlayerClub(s,p,null);p.unit='free';persistPlayer(s,p,{type});delete e.contracts[p.id];delete s.development?.plans[p.id];move(e,s,type,p,{from:club,...extra});}
export function releasePlayer(s,id){const e=ensureReady(s),q=releaseQuote(s,id),p=ownPlayer(s,id);record(e,p.club,'severance',q.compensation);payPlayer(e,id,p.club,q.compensation);release(s,p,'release',{compensation:q.compensation});s.revision++;return q;}
export function saleOffers(s,id){const p=ownPlayer(s,id);return seniorTeams(s).filter(t=>t.id!==p.club).flatMap(t=>{try{const q=transferQuote(s,id,t.id,3,{sellerApproved:true}),roster=clubPlayers(s,t.id),peers=roster.filter(x=>x.position===p.position);if(roster.length>=27||peers.length>=3&&currentSkill(s,p)<Math.min(...peers.map(x=>currentSkill(s,x)))+3)return [];return [q];}catch{return [];}}).sort((a,b)=>b.fee-a.fee||a.to.localeCompare(b.to)).slice(0,5);}
export function accrueEconomy(s,date){const e=ensureEconomy(s);if(date<e.through)throw Error('财务日期不能倒退');const days=daysBetween(e.through,date);if(!days)return;const bills=Object.fromEntries(seniorTeams(s).map(t=>[t.id,wageBill(s,t.id)]));accrueFinance(s,e.through,date,bills);const payments=new Map(seniorTeams(s).map(t=>[t.id,[]]));for(const [id,c] of Object.entries(e.contracts))payments.get(c.club)?.push({id,amount:c.weeklyWage/7*days});for(const [club,rows] of payments)payPayroll(e,club,rows);e.through=date;advanceWorld(s,date);}
export function syncContracts(s){const e=ensureEconomy(s);for(const [id,c] of Object.entries(e.contracts)){const p=populationPlayer(s,id);if(!p||p.retired||contractClub(s,p)!==c.club)delete e.contracts[id];}for(const p of populationPlayers(s))if(contractClub(s,p)&&!e.contracts[p.id])e.contracts[p.id]={...contractFor(s,p),club:contractClub(s,p)};for(const p of populationPlayers(s))if(p.unit==='senior'&&e.contracts[p.id]?.kind==='youth'){const c=e.contracts[p.id];c.kind='senior';c.weeklyWage=weeklyWage(s,p);c.end=dateOf(s.year+2,12,31);}}
export function rolloverEconomy(s){return withRosterIndex(s,()=>rolloverEconomyIndexed(s));}
function rolloverEconomyIndexed(s){
 const e=ensureEconomy(s);if(e.year===s.year){syncContracts(s);return;}if(e.year!==s.year-1)throw Error('财务年份不能跳过');
 rollWorld(s);if(e.financeVersion)rollFinance(s);else for(const team of seniorTeams(s)){const a=e.accounts[team.id];a.history.push({year:e.year,...a.season,cash:a.cash});a.season=zero();const terms=annualTerms(s,team.id);a.baseWageLimit??=a.wageLimit;a.baseLevel??=clubLevel(s,team.id);terms.wageLimit=Math.max(terms.wageLimit,Math.round(a.baseWageLimit*wageAt(clubLevel(s,team.id))/wageAt(a.baseLevel)/7)*7);terms.funding=terms.wageLimit*72;terms.transferBudget=terms.wageLimit*18;Object.assign(a,terms,{spent:0});record(e,team.id,'funding',a.funding);}
 e.year=s.year;e.nextReview=addDays(s.date,7);syncContracts(s);
 // Expired wages are no longer commitments. Allocate the new payroll to essential
 // positions before deciding which expiring players can receive new contracts.
 const expired=Object.entries(e.contracts).filter(([id,c])=>c.end<s.date&&populationPlayer(s,id)?.registrationStatus!=='loan').map(([id])=>populationPlayer(s,id));
 for(const p of expired)delete e.contracts[p.id];
 expired.sort((a,b)=>(a.position==='GK'?0:1)-(b.position==='GK'?0:1)||currentSkill(s,b)-currentSkill(s,a)||a.id.localeCompare(b.id));
 for(const p of expired){
  if(p.registrationStatus==='loan')continue;
  if(p.club!==s.manager?.clubId){const contracted=clubPlayers(s,p.club).filter(q=>e.contracts[q.id]),peers=contracted.filter(q=>q.position===p.position);
   if(peers.length<(p.position==='GK'?2:1)||contracted.length<24||contracted.length<27&&currentSkill(s,p)>=clubLevel(s,p.club)-3){try{renewPlayer(s,p.id,2,{automatic:true});continue;}catch{}}
  }
  release(s,p,'expiry');
 }
 s.revision++;
}
function aiReview(s){
 const e=ensureEconomy(s);
 // Expiry and injuries can leave holes after the annual intake. Re-check real
 // registered academy players throughout the year, with the same payroll checks.
 for(const team of seniorTeams(s)){if(team.id===s.manager?.clubId)continue;
  const needsKeeper=clubPlayers(s,team.id).filter(p=>p.position==='GK').length<2;
  const academy=clubPlayers(s,team.id,{unit:'youth'}).filter(p=>{const reg=s.playerRegistry?.registrations[p.id];return s.year-p.birthYear>=(s.population?16:17)&&(!reg||reg.pathway==='local'||reg.signedAt);}).sort((a,b)=>(needsKeeper?Number(b.position==='GK')-Number(a.position==='GK'):0)||currentSkill(s,b)-currentSkill(s,a)||a.id.localeCompare(b.id));
  for(const p of academy){const roster=clubPlayers(s,team.id),peers=roster.filter(q=>q.position===p.position),needed=roster.length<23||peers.length<(p.position==='GK'?3:1),upgrade=roster.length<27&&s.year-p.birthYear>=18&&currentSkill(s,p)>=Math.max(0,...peers.map(q=>currentSkill(s,q)))-6;if(!needed&&!upgrade)continue;if(roster.length>=30)break;try{promoteProfessional(s,p.id,{automatic:true});}catch{}}
 }
 if(!isTransferWindow(s))return;
 if(competitiveMarket(s)){runMarketAuctions(s);runLocalBridge(s);}
 else {
 const all=populationPlayers(s).filter(p=>['senior','free'].includes(p.unit)&&p.club!==s.manager?.clubId&&p.registrationStatus!=='loan'&&(!p.lastTransfer||daysBetween(p.lastTransfer,s.date)>=90)),ability=new Map(all.map(p=>[p.id,currentSkill(s,p)])),offered=new Set();
 for(const team of seniorTeams(s)){if(team.id===s.manager?.clubId)continue;const roster=clubPlayers(s,team.id);if(roster.length<=23)continue;const positions=new Map();for(const p of roster){const peers=positions.get(p.position)||[];peers.push(p);positions.set(p.position,peers);}for(const [position,peers] of positions)if(peers.length>(position==='GK'?2:1)){peers.sort((a,b)=>(ability.get(a.id)??currentSkill(s,a))-(ability.get(b.id)??currentSkill(s,b))||a.id.localeCompare(b.id));offered.add(peers[0].id);}}
 const candidates=all.filter(p=>!p.club||offered.has(p.id));
 const order=seniorTeams(s).filter(t=>t.id!==s.manager?.clubId).sort((a,b)=>hash(`market:${s.date}:${a.id}`)-hash(`market:${s.date}:${b.id}`));
 for(const team of order){const roster=clubPlayers(s,team.id),level=clubLevel(s,team.id);if(roster.length>=30)continue;
  // Reject impossible payroll offers once per buyer, before expensive seller and
  // registration checks. Every surviving offer still passes transferQuote.
  const account=e.accounts[team.id],bill=wageBill(s,team.id),vacant=Math.max(0,24-roster.length-1),capacity=payrollCapacity(s,team.id)-bill-vacant*demandAt(s,level-12,team.id),remainingDays=daysBetween(s.date,dateOf(s.year+1,1,1));
  if(capacity<70)continue;
  const affordable=p=>{const demand=demandAt(s,ability.get(p.id),team.id),wage=Math.max(demand,Math.ceil((e.contracts[p.id]?.weeklyWage||0)*1.05/7)*7);if(wage>capacity)return false;const fee=askingPrice(s,p);return fee+wage*4<=Math.min(account.transferBudget-account.spent,account.cash-financialReserve(s,team.id,bill+wage));};
  const depths=new Map();for(const p of roster){const depth=depths.get(p.position)||{count:0,low:100};depth.count++;depth.low=Math.min(depth.low,ability.get(p.id)??currentSkill(s,p));depths.set(p.position,depth);}
  const targets=candidates.filter(p=>p.club!==team.id&&!p.retired&&p.unit!=='youth'&&ability.get(p.id)<=level+11&&(ability.get(p.id)>=level-16||p.position==='GK'&&!depths.get('GK')?.count)&&affordable(p)).map(p=>{const depth=depths.get(p.position)||{count:0,low:0},essential=depth.count<(p.position==='GK'?2:1),needed=depth.count<(p.position==='GK'?3:2),quality=ability.get(p.id),improvement=quality-depth.low;return {p,score:(p.position==='GK'&&!depth.count?1000:essential?300:needed?100:0)+(roster.length<24?60:0)+improvement,essential,needed,improvement,quality};}).filter(x=>(roster.length<27||x.essential)&&(x.needed||roster.length<24||x.improvement>5)&&(x.quality>=level-16||x.p.position==='GK'&&!depths.get('GK')?.count)).sort((a,b)=>b.score-a.score||a.p.id.localeCompare(b.p.id));
  for(const {p} of targets){try{signPlayer(s,p.id,team.id,3,{automatic:true});break;}catch{}}
 }
 }
 // AI renewal decisions happen before expiry, leaving the manager's own contracts to the player.
 for(const [id,c] of Object.entries(e.contracts))if(c.club!==s.manager?.clubId&&c.end===yearEnd(s)&&populationPlayer(s,id)?.unit==='senior'){
  const p=populationPlayer(s,id);if(!canLose(s,p)||currentSkill(s,p)>=clubLevel(s,p.club)-8){try{renewPlayer(s,id,3,{automatic:true});}catch{}}
 }
}
export function runMarketAuctions(s){return withRosterIndex(s,()=>runMarketAuctionsIndexed(s));}
function runMarketAuctionsIndexed(s){
 ensureReady(s);if(!competitiveMarket(s)||!isTransferWindow(s))return [];
 let context=bidContext(s);
 const candidates=context.players.filter(p=>['senior','free'].includes(p.unit)&&p.registrationStatus!=='loan'&&p.club!==s.manager?.clubId&&(!p.club||canLose(s,p))&&(!p.lastTransfer||daysBetween(p.lastTransfer,s.date)>=90));
 const terms=new Map(candidates.map(p=>[p.id,openingTerms(s,p,context)])),shortlist=new Set();
 for(const t of seniorTeams(s)){
  if(t.id===s.manager?.clubId)continue;
  const a=s.economy.accounts[t.id],bill=context.bills.get(t.id),cash=Math.min(recruitmentAllowance(s,t.id),a.cash-financialReserve(s,t.id,bill)),capacity=payrollCapacity(s,t.id)-bill,roster=context.rosters.get(t.id);
  if(roster.length>=40||capacity<=0||cash<=0)continue;
  const targets=candidates.filter(p=>p.club!==t.id&&terms.get(p.id).baseFee+terms.get(p.id).baseWage*4<=cash&&terms.get(p.id).baseWage<=capacity).map(p=>{
   const peers=context.depth.get(t.id).get(p.position)||[],quality=context.ability.get(p.id),improvement=quality-(peers[1]??clubLevel(s,t.id)-12);
   const needed=peers.length<(p.position==='GK'?2:1);
   return {p,score:(needed?100:0)+improvement,interested:needed||improvement>2||roster.length<24&&quality>=clubLevel(s,t.id)-16};
  }).filter(x=>x.interested).sort((a,b)=>b.score-a.score||a.p.id.localeCompare(b.p.id));
  for(const {p} of targets.slice(0,2))shortlist.add(p.id);
 }
 const completed=[];
 for(const id of [...shortlist].sort((a,b)=>context.ability.get(b)-context.ability.get(a)||a.localeCompare(b))){
  const auction=marketAuction(s,id,{context});if(!auction)continue;
  try{completed.push(signPlayer(s,id,auction.club,3,{automatic:true}));context=bidContext(s);}catch{}
 }
 return completed;
}
export function advanceCareer(s,date){return withRosterIndex(s,()=>advanceCareerIndexed(s,date));}
function advanceCareerIndexed(s,date){
 const e=ensureEconomy(s);if(date<e.through)throw Error('赛历不能倒退');
 while(e.through<date){const end=[date,e.nextReview,...(e.world?[nextWorldBoundary(s)]:[])].sort()[0];s.date=end;advanceDevelopment(s,end);accrueEconomy(s,end);syncContracts(s);if(end===e.nextReview){aiReview(s);e.nextReview=addDays(end,7);}}
 s.date=date;
}
export function validateEconomy(s){
 const e=s.economy;if(!e)return;hydrateWorld(e);
 const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&new Date(`${d}T12:00:00Z`).toISOString().slice(0,10)===d;
 const integer=n=>Number.isSafeInteger(n)&&n>=0;
 if(e.financeVersion!==undefined&&![2,ECONOMIC_MODEL].includes(e.financeVersion)||e.marketVersion!==undefined&&![1,ECONOMIC_MODEL].includes(e.marketVersion)||e.biddingVersion!==undefined&&e.biddingVersion!==1)throw Error('经济模型版本不兼容');
 if(e.version!==1||e.year!==s.year||!validDate(e.through)||!validDate(e.nextReview)||e.through>s.date||e.nextReview<=e.through||!e.contracts||!e.accounts||!Array.isArray(e.moves)||!integer(e.sequence))throw Error('财务存档无效');
 for(const [club,a] of accountsOf(e)){if(e.financeVersion===ECONOMIC_MODEL&&e.accounts[club]===a&&(!Number.isFinite(a.reputation)||a.reputation<REPUTATION_MIN||a.reputation>REPUTATION_MAX))throw Error('俱乐部声望无效');if(!a||!Number.isSafeInteger(a.cash)||!integer(a.openingCash)||!integer(a.wageLimit)||!integer(a.spent)||!integer(a.transferBudget)||!moneyKeys.every(k=>integer(a.totals?.[k])&&integer(a.season?.[k]))||!Array.isArray(a.history))throw Error('俱乐部账本无效');if(e.financeVersion&&(!['operating','tax'].every(k=>integer(a.totals[k])&&integer(a.season[k]))||!a.income||!a.incomeTotals||Object.values(a.income).some(n=>!integer(n))||Object.values(a.incomeTotals).some(n=>!integer(n))||Object.values(a.incomeTotals).reduce((n,v)=>n+v,0)+(a.unclassifiedFunding||0)!==a.totals.funding||Object.values(a.income).reduce((n,v)=>n+v,0)+(a.seasonUnclassifiedFunding||0)!==a.season.funding))throw Error('收入分类与账本不符');const t=a.totals;if(a.cash!==ledgerCash(a))throw Error('资金账本不平衡');}
 for(const [id,c] of Object.entries(e.contracts)){const p=populationPlayer(s,id);if(!p||p.retired||!p.club||contractClub(s,p)!==c.club||!validDate(c.start)||!validDate(c.end)||c.start>c.end||!integer(c.weeklyWage)||c.weeklyWage%7!==0)throw Error('球员合同无效');}
 if(populationPlayers(s).some(p=>contractClub(s,p)&&!e.contracts[p.id]))throw Error('球员合同缺失');
 if(e.sequence!==e.moves.length||new Set(e.moves.map(m=>m.id)).size!==e.moves.length||e.moves.some(m=>!(populationPlayer(s,m.player)||e.world?.players[m.player])||!validDate(m.date)))throw Error('交易记录无效');
 const recorded=Object.fromEntries(accountsOf(e).map(([id])=>[id,{transferIn:0,transferOut:0,bonuses:0,severance:0}]));
 for(const m of e.moves)if(m.bidding){const b=m.bidding;if(m.type!=='transfer'||!Number.isFinite(b.factor)||b.factor<1||!integer(b.baseFee)||!integer(b.baseWage)||!Array.isArray(b.bidders)||!b.bidders.length||b.bidders.some(x=>!knownClub(x.club)||!Number.isFinite(x.ceiling)||x.ceiling<1)||new Set(b.bidders.map(x=>x.club)).size!==b.bidders.length||b.bidders[0].club!==m.to||b.bidders[0].ceiling+1e-9<b.factor||b.runnerUp!==(b.bidders[1]?.club||null)||m.fee!==Math.round(b.baseFee*b.factor))throw Error('竞价记录无效');}
 for(const m of e.moves){if(!['transfer','renewal','expiry','release','professional'].includes(m.type))throw Error('交易类型无效');if(m.type==='transfer'){if(!knownClub(m.to)||m.from&&!knownClub(m.from)||!integer(m.fee)||!integer(m.bonus))throw Error('转会记录无效');recorded[m.to].transferOut+=m.fee;recorded[m.to].bonuses+=m.bonus;if(m.from)recorded[m.from].transferIn+=m.fee;}if(m.type==='renewal'){if(!knownClub(m.club)||!integer(m.bonus))throw Error('续约记录无效');recorded[m.club].bonuses+=m.bonus;}if(m.type==='release'){if(!knownClub(m.from)||!integer(m.compensation))throw Error('解约记录无效');recorded[m.from].severance+=m.compensation;}}
 for(const [club,a] of accountsOf(e))for(const key of ['transferIn','transferOut','bonuses','severance'])if(recorded[club][key]!==a.totals[key])throw Error('交易明细与账本不符');
 const totals=accountsOf(e).reduce((n,[,a])=>n+a.totals.transferIn-a.totals.transferOut,0);if(totals!==0)throw Error('转会费账本不守恒');validateWorld(s);validateTaxation(s);
}

export function promoteProfessional(s,id,{automatic=false}={}){const e=ensureReady(s),p=automatic?populationPlayer(s,id):ownPlayer(s,id);if(!p?.club||automatic&&p.club===s.manager?.clubId)throw Error('青年提拔对象无效');const c=e.contracts[id],wage=Math.min(weeklyWage(s,p),wageCeiling(s,p.club)),bill=wageBill(s,p.club)-(c?.weeklyWage||0)+wage,a=e.accounts[p.club];if(bill>payrollCapacity(s,p.club)||a.cash<financialReserve(s,p.club,bill))throw Error('职业合同预算不足');promotePlayer(s,id,{automatic});e.contracts[id]={club:p.club,start:s.date,end:dateOf(s.year+2,12,31),weeklyWage:wage,kind:'senior'};move(e,s,'professional',p,{club:p.club,weeklyWage:wage,end:e.contracts[id].end});}

// The academy owns registration decisions; this hook settles their financial side
// before any ownership/history is changed. Returning false leaves an AI move untouched.
export function registryMovement(s,p,reg,{date,status,clubId,ownerClubId,type}){
 const e=s.economy;if(!e)return true;
 const old=e.contracts[p.id],owner=ownerClubId??clubId,view={...s,date,year:Number(date.slice(0,4))};
 if(e.through<date)accrueEconomy(s,date);
 if(status==='retired'){delete e.contracts[p.id];return true;}
 if(status==='free'){
  if(!old)return true;
  const compensation=Math.max(0,daysBetween(date,addDays(old.end,1)))*old.weeklyWage/7;
  const a=e.accounts[old.club],bill=wageBill(s,old.club)-old.weeklyWage;
  if(compensation>a.cash-financialReserve(view,old.club,bill,date))return false;
  if(compensation){record(e,old.club,'severance',compensation);payPlayer(e,p.id,old.club,compensation);move(e,view,'release',p,{from:old.club,compensation});}
  else move(e,view,'expiry',p,{from:old.club});
  delete e.contracts[p.id];return true;
 }
 if(!['senior','loan'].includes(status))return true;
 if(old?.club===owner&&old.kind==='senior')return true;
 const transfer=old&&old.club!==owner&&reg.status==='senior';
 if(transfer&&!isTransferWindow(view,date))return false;
 let quote;
 if(competitiveMarket(s)&&(transfer||reg.status==='free')){try{quote=transferQuote(view,p.id,owner);}catch{return false;}}
 const wage=Math.min(quote?.weeklyWage??weeklyWage(s,p,owner),wageCeiling(view,owner)),bonus=quote?.bonus??(type==='promote'?0:wage*4),fee=quote?.fee??(transfer?askingPrice(view,p):0);
 const a=e.accounts[owner],bill=wageBill(s,owner)-(old?.club===owner?old.weeklyWage:0)+wage;
 if(!a||bill>payrollCapacity(view,owner)||fee+bonus>Math.min(recruitmentAllowance(view,owner),a.cash-financialReserve(view,owner,bill,date)))return false;
 if(transfer){record(e,old.club,'transferIn',fee);record(e,owner,'transferOut',fee);if(e.taxVersion===1){const tax=transferTax(e,fee);record(e,old.club,'transferTax',tax);taxReceipt(e,old.club,'transferTax',tax);}}
 record(e,owner,'bonuses',bonus);payPlayer(e,p.id,owner,bonus);a.spent+=fee+bonus;
 e.contracts[p.id]={club:owner,start:date,end:dateOf(view.year+2,12,31),weeklyWage:wage,kind:'senior'};
 if(transfer||reg.status==='free')move(e,view,'transfer',p,{from:transfer?old.club:null,to:owner,fee,...(e.taxVersion===1?{transferTax:transferTax(e,fee),sellerNet:fee-transferTax(e,fee)}:{}),bonus,weeklyWage:wage,end:e.contracts[p.id].end,...(quote?.bidding?{bidding:quote.bidding}:{})});
 else if(bonus)move(e,view,'renewal',p,{club:owner,bonus,weeklyWage:wage,end:e.contracts[p.id].end});
 else move(e,view,'professional',p,{club:owner,weeklyWage:wage,end:e.contracts[p.id].end});
 return true;
}
