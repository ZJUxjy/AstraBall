import {daysBetween} from './calendar.js';
import {unpaidTotal,settlePayables} from './payables.js';
import {clubs,cities} from '../world.js';
import {localClubById} from './local-catalog.js';
import {accountOf,accountsOf,postAccount,publicGrant} from './economic-ledger.js';
const coreRegions=new Map(clubs.map(c=>[c.id,cities.find(t=>t.id===c.city).region]));
export const economicRegion=id=>coreRegions.get(id)||localClubById.get(id)?.region;
export const creditFor=(e,id)=>e.world.credit[id]??={principal:0,drawn:0,repaid:0,writtenOff:0,interestPaid:0,missed:0,status:'normal',trustee:null,entered:null};
export function publicBalance(e,region,league=false){const r=e.taxation.regions[region].totals,p=e.world.public[region];return league?r.leagueLevy-p.leagueSpent:r.incomeTax+r.transferTax-p.stateSpent;}
function accrueInterest(s,id){
 const c=creditFor(s.economy,id);c.interestSince??=s.date;
 const days=Math.max(0,daysBetween(c.interestSince,s.date));
 const units=(c.interestUnits||0)+c.principal*6*days;c.interestArrears=(c.interestArrears||0)+Math.floor(units/36500);c.interestUnits=units%36500;c.interestSince=s.date;
 return c.interestArrears;
}
export function borrow(s,id,amount){
 const e=s.economy,w=e.world,a=accountOf(e,id);if(!w||!a||!Number.isSafeInteger(amount)||amount<=0)throw Error('贷款金额无效');
 const c=creditFor(e,id),bank=w.banks[economicRegion(id)],limit=Math.floor((a.operatingRevenueBudget||0)*.35);
 if(c.status!=='normal'||c.principal+amount>limit||bank.cash<amount)throw Error('授信额度或银行资金不足');
 accrueInterest(s,id);(c.loans??=[]).push({date:s.date,drawn:amount,remaining:amount,installment:Math.ceil(amount/36)});bank.cash-=amount;bank.lent+=amount;c.principal+=amount;c.drawn+=amount;postAccount(e,id,'borrowing',amount);
 w.events.push({date:s.date,type:'loan',club:id,amount});return amount;
}
export function repay(s,id,amount){
 const e=s.economy,c=creditFor(e,id),a=accountOf(e,id),bank=e.world.banks[economicRegion(id)];
 if(!Number.isSafeInteger(amount)||amount<=0||amount>c.principal||amount>a.cash)throw Error('还款金额无效');
 accrueInterest(s,id);let remaining=amount;for(const loan of c.loans||[]){const paid=Math.min(loan.remaining,remaining);loan.remaining-=paid;remaining-=paid;}postAccount(e,id,'principal',amount);c.principal-=amount;c.repaid+=amount;bank.cash+=amount;bank.repaid+=amount;return amount;
}
export function enterAdministration(s,id,{trustee='auto'}={}){
 const e=s.economy,w=e.world,c=creditFor(e,id),a=accountOf(e,id),region=economicRegion(id);
 if(c.status==='dissolved')throw Error('俱乐部已解散');if(c.status==='administration')return c;
 if(!unpaidTotal(a)&&c.missed<3&&a.cash>=(a.operatingRevenueBudget||0)*.08)throw Error('俱乐部尚无偿付危机');
 if(!['auto','league','state'].includes(trustee))throw Error('托管方无效');
 const need=Math.ceil(Math.max(0,-a.cash)+unpaidTotal(a)+(a.operatingRevenueBudget||0)*.08);
 const choices=trustee==='auto'?['league','state']:[trustee];
 const sponsor=choices.find(t=>publicBalance(e,region,t==='league')>=need);
 c.status='administration';c.entered??=s.date;c.trustee=sponsor||null;
 if(sponsor&&need){const p=w.public[region];p[sponsor==='league'?'leagueSpent':'stateSpent']+=need;p.rescue+=need;publicGrant(e,id,need);settlePayables(e,id);w.events.push({date:s.date,type:'custody-grant',club:id,trustee:sponsor,amount:need});}
 w.events.push({date:s.date,type:'administration',club:id,trustee:c.trustee});return c;
}
export function writeOffDebt(s,id){
 const e=s.economy,c=creditFor(e,id),bank=e.world.banks[economicRegion(id)];
 accrueInterest(s,id);const loss=c.principal;for(const loan of c.loans||[])loan.remaining=0;bank.interestLosses=(bank.interestLosses||0)+(c.interestArrears||0);c.interestWrittenOff=(c.interestWrittenOff||0)+(c.interestArrears||0);c.interestArrears=0;c.interestUnits=0;c.writtenOff+=loss;c.principal=0;bank.losses+=loss;
 e.world.events.push({date:s.date,type:'creditor-loss',club:id,amount:loss});return loss;
}
function distribute(e,ids,total){
 if(!ids.length||!total)return 0;
 const per=Math.floor(total/ids.length),rest=total-per*ids.length;
 ids.forEach((id,i)=>publicGrant(e,id,per+(i<rest?1:0)));return total;
}
export function spendPublicRevenue(s){
 const e=s.economy,w=e.world;
 for(const [region,p] of Object.entries(w.public)){
  const r=e.taxation.regions[region].totals,receipts=r.incomeTax+r.transferTax,newReceipts=receipts-p.assessed;p.assessed=receipts;
  const budget=Math.min(publicBalance(e,region),Math.floor(newReceipts*.60));
  const local=Object.keys(w.clubs).filter(id=>economicRegion(id)===region&&w.clubs[id].status==='active');
  const grants=distribute(e,local,Math.floor(budget/12)),facilities=Math.floor(budget/6),services=budget-grants-facilities;
  p.stateSpent+=grants+facilities+services;p.grassroots+=grants;p.facilities+=facilities;p.services+=services;
  const leagueNew=r.leagueLevy-p.leagueAssessed;p.leagueAssessed=r.leagueLevy;
  const youth=distribute(e,local,Math.min(publicBalance(e,region,true),Math.floor(leagueNew*.30)));p.leagueSpent+=youth;p.youth+=youth;
  if(budget||youth)w.events.push({date:s.date,type:'public-spending',region,grants,facilities,services,youth});
 }
}
export function settleCreditMonth(s){
 const e=s.economy,w=e.world;w.creditMonths??=[];const month=s.date.slice(0,7);if(w.creditMonths.includes(month))return;w.creditMonths.push(month);
 spendPublicRevenue(s);
 for(const [id,a] of accountsOf(e)){
  if(a.dissolved||w.clubs[id]?.status==='dissolved')continue;
  const c=creditFor(e,id),bank=w.banks[economicRegion(id)],interest=accrueInterest(s,id),installment=(c.loans||[]).reduce((n,l)=>n+Math.min(l.remaining,l.installment),0);
  settlePayables(e,id);const available=Math.max(0,a.cash-Math.ceil((a.operatingRevenueBudget||0)/12*.2));
  if(available>=interest+installment){if(interest){postAccount(e,id,'interest',interest);c.interestPaid+=interest;bank.cash+=interest;bank.interest+=interest;c.interestArrears=0;}if(installment)repay(s,id,installment);c.missed=0;}
  else if(c.principal||c.interestArrears){c.missed++;}
  if(c.interestArrears&&a.cash>c.interestArrears+(a.operatingRevenueBudget||0)/6){postAccount(e,id,'interest',c.interestArrears);bank.cash+=c.interestArrears;bank.interest+=c.interestArrears;c.interestPaid+=c.interestArrears;c.interestArrears=0;}
  const gap=Math.ceil(Math.max(0,(a.operatingRevenueBudget||0)*.025+unpaidTotal(a)-a.cash));
  if(gap&&c.status==='normal'){try{borrow(s,id,gap);settlePayables(e,id);}catch{if(unpaidTotal(a)>0||a.cash<0||c.missed>=3)enterAdministration(s,id);}}
  if(c.missed>=3&&c.status==='normal')enterAdministration(s,id);
  if(c.status==='administration'&&a.cash>Math.max(0,c.principal)+(a.operatingRevenueBudget||0)*.15&&!c.interestArrears&&!unpaidTotal(a)){if(c.principal)repay(s,id,c.principal);c.status='normal';c.trustee=null;c.entered=null;w.events.push({date:s.date,type:'administration-exit',club:id});}
 }
}
export function validatePublicCredit(s){
 const e=s.economy,w=e.world;if(!w)return;const integer=n=>Number.isSafeInteger(n)&&n>=0;
 for(const [region,b] of Object.entries(w.banks)){
  const cs=Object.entries(w.credit).filter(([id])=>economicRegion(id)===region).map(([,c])=>c);
  if(!['openingCash','cash','lent','repaid','interest','losses'].every(k=>integer(b[k]))||b.cash!==b.openingCash-b.lent+b.repaid+b.interest||b.lent-b.repaid-b.losses!==cs.reduce((n,c)=>n+c.principal,0)||b.losses!==cs.reduce((n,c)=>n+c.writtenOff,0))throw Error('银行资产负债不平衡');
  const p=w.public[region];if(Object.values(p).some(n=>!integer(n))||publicBalance(e,region)<0||publicBalance(e,region,true)<0||p.stateSpent+p.leagueSpent!==p.grassroots+p.facilities+p.services+p.youth+p.rescue)throw Error('公共支出不平衡');
 }
 for(const [id,c] of Object.entries(w.credit)){
  const a=accountOf(e,id);if(!a||!['principal','drawn','repaid','writtenOff','interestPaid','missed'].every(k=>integer(c[k]))||c.principal!==c.drawn-c.repaid-c.writtenOff||c.principal!==(c.loans||[]).reduce((n,l)=>n+l.remaining,0)||c.drawn!==(a.totals.borrowing||0)||c.repaid!==(a.totals.principal||0)||c.interestPaid!==(a.totals.interest||0)||!['normal','administration','dissolved'].includes(c.status))throw Error('债务账本不平衡');
 }
}
