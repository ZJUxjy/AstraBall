import {payOperating} from './payables.js';
import {taxReceipt,rollTaxation} from './taxation.js';
import {ECONOMIC_MODEL,businessProfile,marketScale,commercialPlan} from './economics.js';
import {isMetroLeague,METRO_SYSTEMS} from './catalog.js';
import {clubProfile,FINANCIAL_POLICIES} from './club-profiles.js';
import {moveReputation,clampReputation,reputationTarget} from './reputation.js';
import {getDivision,leagueSystems} from './catalog.js';
import {dateOf,daysBetween} from './calendar.js';

export const INCOME_LABELS={broadcast:'转播分成',sponsorship:'赞助收入',commercial:'商业收入',owner:'股东注资',relegation:'降级过渡补助',matchday:'比赛日收入',prize:'赛事奖金',publicGrant:'公共拨款'};
export const EXPENSE_LABELS={wages:'球员税前工资',transferOut:'转会支出',bonuses:'签字费',severance:'解约补偿',operating:'运营支出',tax:'工资超额税',transferTax:'转会交易税',interest:'贷款利息',principal:'偿还本金'};
const emptyIncome=()=>Object.fromEntries(Object.keys(INCOME_LABELS).map(k=>[k,0]));
export const financePolicy=(s,id)=>FINANCIAL_POLICIES[leagueSystems.find(l=>l.levels.some(d=>s.members[d.id].includes(id))).id];
const divisionOf=(s,id)=>Object.keys(s.members).find(d=>s.members[d].includes(id));
const daysIn=year=>daysBetween(dateOf(year,1,1),dateOf(year+1,1,1));
export function postFinance(e,id,key,amount){
 if(!Number.isSafeInteger(amount)||amount<0)throw Error('财务金额须为非负整数');
 if(e.world&&['operating','tax'].includes(key))return payOperating(e,id,key,amount);
 const a=e.accounts[id];a.season[key]=(a.season[key]||0)+amount;a.totals[key]=(a.totals[key]||0)+amount;
 a.cash+=['funding','transferIn'].includes(key)?amount:-amount;if(key==='tax')taxReceipt(e,id,'leagueLevy',amount);
}
function income(e,id,key,amount){const a=e.accounts[id];a.income[key]=(a.income[key]||0)+amount;a.incomeTotals[key]=(a.incomeTotals[key]||0)+amount;postFinance(e,id,'funding',amount);}
function legacyBudget(s,id){
 const a=s.economy.accounts[id],policy=financePolicy(s,id),profile=clubProfile(id),tier=getDivision(divisionOf(s,id)).tier;
 // Fixed base capacity, current division and lagged results; never current wages.
 const level=isMetroLeague(divisionOf(s,id))?79:74-(tier-1)*9;
 const base=a.baseWageLimit*Math.pow(1.07,level-a.baseLevel)*52;
 const support=.84+a.reputation/250;
 const priorTier=a.division?getDivision(a.division).tier:tier,priorRecurring=['broadcast','sponsorship','commercial'].reduce((n,k)=>n+(a.plan?.[k]||0),0);
 a.plan={broadcast:Math.round(base*.53),sponsorship:Math.round(base*.35*support),commercial:Math.round(base*.22*support),owner:Math.round(base*(profile.royal?.16:.04))};
 const recurring=a.plan.broadcast+a.plan.sponsorship+a.plan.commercial;
 a.relegationGrants=(a.relegationGrants||[]).filter(g=>s.year<g.year+2&&tier>g.fromTier);
 if(tier>priorTier)a.relegationGrants.push({year:s.year,fromTier:priorTier,loss:Math.max(0,priorRecurring-recurring)});
 a.plan.relegation=Math.round(a.relegationGrants.reduce((n,g)=>n+g.loss*(s.year===g.year?.6:.3),0));
 a.expectedMatchday=Math.round(base*.20*support);a.operatingBudget=Math.round(base*.17);
 a.revenueBudget=Object.values(a.plan).reduce((n,v)=>n+v,0)+a.expectedMatchday;
 // Temporary aid honours old commitments; it does not increase signing limits.
 const eligible=a.revenueBudget-a.plan.owner-a.plan.relegation;
 a.wageLimit=Math.round(eligible*policy.wageRatio/52/7)*7;
 a.transferBudget=Math.round((a.revenueBudget-a.plan.relegation)*.23);a.funding=Object.values(a.plan).reduce((n,v)=>n+v,0);
 a.division=divisionOf(s,id);a.policy={...policy};
}
function budget(s,id){
 if(s.economy.financeVersion!==ECONOMIC_MODEL)return legacyBudget(s,id);
 const e=s.economy,a=e.accounts[id],division=divisionOf(s,id),tier=getDivision(division).tier,policy=financePolicy(s,id);
 const priorTier=a.division?getDivision(a.division).tier:tier,priorRecurring=['broadcast','sponsorship','commercial'].reduce((n,k)=>n+(a.plan?.[k]||0),0);
 a.homeTier??=tier;a.reputation??=clubProfile(id).initialReputation;
 const members=s.members[division],weight=club=>.65+.25*(e.accounts[club].performance??.5)+.1*Math.min(1,businessProfile(club,e.accounts[club].homeTier??tier).reach);
 const weights=members.map(club=>[club,weight(club)]),total=weights.reduce((n,[,w])=>n+w,0),pool=marketScale(division).broadcast*members.length;
 // Integer apportionment keeps the league's TV pool fixed, with a narrow merit spread.
 const shares=weights.map(([club,w])=>[club,Math.floor(pool*w/total)]),remainder=pool-shares.reduce((n,[,v])=>n+v,0);
 const broadcast=shares.find(([club])=>club===id)[1]+(members.indexOf(id)<remainder?1:0);
 const homeGames=s.fixtures.filter(m=>m.competition===division&&m.kind==='league'&&m.home===id).length;
 const business=commercialPlan({id,division,homeTier:a.homeTier,reputation:a.reputation,performance:a.performance??.5,homeGames,broadcast});
 a.business=business;a.plan={...business.plan};
 const recurring=a.plan.broadcast+a.plan.sponsorship+a.plan.commercial;
 a.relegationGrants=(a.relegationGrants||[]).filter(g=>s.year<g.year+2&&tier>g.fromTier);
 if(tier>priorTier)a.relegationGrants.push({year:s.year,fromTier:priorTier,loss:Math.max(0,priorRecurring-recurring)});
 a.plan.relegation=Math.round(a.relegationGrants.reduce((n,g)=>n+g.loss*(s.year===g.year?.6:.3),0));
 a.expectedMatchday=business.gatePerGame*homeGames;a.operatingBudget=business.operatingBudget;
 a.operatingRevenueBudget=business.operatingRevenue;a.revenueBudget=business.operatingRevenue+a.plan.owner+a.plan.relegation;
 a.wageLimit=Math.round(business.operatingRevenue*policy.wageRatio/52/7)*7;
 a.transferBudget=Math.round((a.revenueBudget-a.plan.relegation)*.23);a.funding=Object.values(a.plan).reduce((n,v)=>n+v,0);
 a.division=division;a.policy={...policy};
}
export function initializeFinance(s){
 const e=s.economy;if(e.financeVersion||s.population)return;
 e.financeVersion=e.marketVersion===ECONOMIC_MODEL?ECONOMIC_MODEL:2;e.financeSince=s.date;e.settledMatches={};e.settledSeasons=[];
 for(const [id,a] of Object.entries(e.accounts)){
  a.reputation=clubProfile(id).initialReputation;a.income=emptyIncome();a.incomeTotals=emptyIncome();
  // Preserve old cash and ledger; old undifferentiated income remains explicit.
  a.unclassifiedFunding=a.totals.funding;a.seasonUnclassifiedFunding=a.season.funding;
  for(const key of ['operating','tax']){a.season[key]=0;a.totals[key]=0;}
  a.accrual={year:e.year,days:0,income:emptyIncome(),operating:0,taxUnits:0,taxPaid:0};
  budget(s,id);if(e.financeVersion===ECONOMIC_MODEL&&a.totals.funding===0&&!e.moves.length){a.cash=Math.round(a.operatingRevenueBudget*.24+a.plan.owner);a.openingCash=a.cash;}a.seasonOpeningCash=a.cash-a.season.funding-a.season.transferIn+Object.keys(EXPENSE_LABELS).reduce((n,k)=>n+(a.season[k]||0),0);a.review={status:'合规',loss:0,allowance:0,restricted:false};
 }
}
export function payrollCapacity(s,id){const a=s.economy.accounts[id];return s.economy.financeVersion?Math.floor(a.wageLimit*(a.review?.restricted||s.economy.world?.credit[id]?.status==='administration'?1:1.35)/7)*7:a.wageLimit;}
// Individual ceiling: 3.5% of the club's operating revenue budget, floored so
// small clubs can always pay their own level. UEFA squad-cost style rule.
export function wageCeiling(s,id){const a=s.economy?.accounts?.[id];if(!a?.operatingRevenueBudget)return Infinity;return Math.max(Math.floor(a.operatingRevenueBudget*.035/52/7)*7,80000);}
export function annualTax(a,weekly){const annual=weekly*52,soft=a.wageLimit*52;return Math.max(0,annual-soft)*a.policy.taxRate+Math.max(0,annual-soft*1.15)*a.policy.taxRate;}
export function accrueFinance(s,from,to,bills){
 const e=s.economy;if(!e.financeVersion)return;
 const count=daysBetween(from,to);if(!count)return;
 for(const [id,a] of Object.entries(e.accounts)){
  if(a.dissolved)continue;const accrual=a.accrual;accrual.days+=count;const duration=daysIn(e.year);
  for(const key of Object.keys(a.plan)){const target=Math.floor(a.plan[key]*accrual.days/duration),delta=target-accrual.income[key];income(e,id,key,delta);accrual.income[key]=target;}
  const operating=Math.floor(a.operatingBudget*accrual.days/duration);postFinance(e,id,'operating',operating-accrual.operating);accrual.operating=operating;
  // Rational daily accrual, rounded only when posting. Kept separate from the payroll.
  accrual.taxUnits+=Math.round(annualTax(a,bills[id])*100)*count;const tax=Math.floor(accrual.taxUnits/(duration*100));postFinance(e,id,'tax',tax-accrual.taxPaid);accrual.taxPaid=tax;
 }
}
export function settleMatchFinance(s,m){
 const e=s.economy;if(!e?.financeVersion||e.settledMatches[m.id]||!m.score)return;
 const home=e.accounts[m.home],away=e.accounts[m.away];if(!home||!away)throw Error('比赛账本球队不存在');
 const homeGames=getDivision(home.division).rounds/2;
 const gate=e.financeVersion===ECONOMIC_MODEL?Math.round((m.neutral?Math.max(home.business.gatePerGame,away.business.gatePerGame):home.business.gatePerGame)*(m.kind==='league'?1:1.15)):Math.round(home.expectedMatchday/homeGames*(m.kind==='league'?1:.65)*(clubProfile(m.home).royal&&clubProfile(m.away).royal?1.25:1));
 if(m.neutral){income(e,m.home,'matchday',Math.floor(gate/2));income(e,m.away,'matchday',gate-Math.floor(gate/2));}else income(e,m.home,'matchday',gate);
 e.settledMatches[m.id]=true;
}
export function settleFinanceSeason(s){
 const e=s.economy;if(!e?.financeVersion||!s.summary||e.settledSeasons.includes(s.year))return;
 for(const [division,table] of Object.entries(s.summary.tables)){if(e.financeVersion===ECONOMIC_MODEL&&!getDivision(division))continue;for(const row of table){const a=e.accounts[row.id],performance=(table.length-row.rank)/(table.length-1);income(e,row.id,'prize',Math.round(e.financeVersion===ECONOMIC_MODEL?marketScale(division).broadcast*(.025+.055*performance):a.revenueBudget*(.025+.055*performance)));a.performance=performance;a.reputation=e.financeVersion===ECONOMIC_MODEL?clampReputation(a.reputation*.9+reputationTarget(division,performance)*.1):Math.max(20,Math.min(95,a.reputation*.9+(30+performance*65)*.1));}}
 for(const c of s.summary.champions.filter(c=>!getDivision(c.competition))){const a=e.accounts[c.id];income(e,c.id,'prize',Math.round(e.financeVersion===ECONOMIC_MODEL?(c.competition==='global-cup'?55000000:c.competition==='metro-champions'?30000000:18000000):a.revenueBudget*(c.competition==='global-cup'?.12:c.competition==='metro-champions'?.08:.035)));}
 if(e.financeVersion===ECONOMIC_MODEL)for(const mv of s.summary.movements||[]){const a=e.accounts[mv.id];if(a&&Number.isFinite(a.reputation))a.reputation=moveReputation(a.reputation,mv.kind);}
 e.settledSeasons.push(s.year);
}
export function financeYear(s,id){
 const a=s.economy.accounts[id],incomeTotal=a.season.funding+a.season.transferIn+(a.season.borrowing||0);
 const spending=Object.keys(EXPENSE_LABELS).reduce((n,key)=>n+(a.season[key]||0),0);
 const operatingRevenue=Object.entries(a.income||{}).reduce((n,[k,v])=>n+(!['owner','relegation','publicGrant'].includes(k)?v:0),0);
 return {operatingRevenue,ownerFunding:a.income?.owner||0,year:s.economy.year,division:a.division,openingCash:a.seasonOpeningCash??a.openingCash,...a.season,...(a.withholding?{withholding:{...a.withholding.season}}:{}),income:{...a.income},unclassifiedFunding:a.seasonUnclassifiedFunding||0,cash:a.cash,incomeTotal,expenseTotal:spending,net:incomeTotal-spending,operatingResult:a.season.funding-(a.income?.owner||0)-spending+(a.season.principal||0),reputation:a.reputation,wageLimit:a.wageLimit,transferBudget:a.transferBudget,review:{...a.review}};
}
export function rollFinance(s){
 const e=s.economy;
 for(const [id,a] of Object.entries(e.accounts)){
  const row=financeYear(s,id);a.history.push(row);
  const recent=a.history.filter(r=>r.income).slice(-3),loss=Math.max(0,-recent.reduce((n,r)=>n+r.net-(r.borrowing||0)+(r.principal||0)-(r.income.owner||0),0)),allowance=Math.round(recent.reduce((n,r)=>n+r.incomeTotal-(r.borrowing||0)-(r.income.owner||0)-r.transferIn,0)*(a.dissolved?a.policy:financePolicy(s,id)).lossAllowance);
  a.review={status:loss>allowance?'限制扩大工资':'合规',loss,allowance,restricted:loss>allowance,years:recent.map(r=>r.year)};
  a.season=Object.fromEntries(Object.keys(a.totals).map(k=>[k,0]));a.income=emptyIncome();a.seasonUnclassifiedFunding=0;a.seasonOpeningCash=a.cash;a.spent=0;
  a.accrual={year:s.year,days:0,income:emptyIncome(),operating:0,taxUnits:0,taxPaid:0};if(!a.dissolved)budget(s,id);
 }
 rollTaxation(s);e.settledMatches={};
}
export function financialReserve(s,id,bill,date=s.date){
 const a=s.economy.accounts[id],days=daysBetween(date,dateOf(s.year+1,1,1));
 if(!s.economy.financeVersion)return Math.ceil(bill/7*days);
 // Future contracted revenues fund operating costs; commitments may not consume
 // the final 8 weeks of wages. No unlimited shareholder bailout or negative credit.
 const futureIncome=a.funding*days/daysIn(s.year),outgo=(bill/7+(a.operatingBudget+annualTax(a,bill))/daysIn(s.year))*days;
 const nextYearGap=Math.max(0,bill/7*daysIn(s.year+1)+a.operatingBudget+annualTax(a,bill)-(a.funding-(a.plan.relegation||0)));
 const debt=s.economy.world?.credit[id],debtReserve=debt?Math.min(debt.principal,(debt.loans||[]).reduce((n,l)=>n+Math.min(l.remaining,l.installment*12),0))+Math.ceil(debt.principal*.06)+(debt.interestArrears||0):0;return Math.ceil(Math.max(bill*8,outgo-futureIncome+nextYearGap)+debtReserve);
}
