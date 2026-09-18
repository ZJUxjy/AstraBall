import {accountOf,postAccount} from './economic-ledger.js';
import {payPlayer,taxReceipt} from './taxation.js';
const obligations=a=>a.payables??={operating:0,tax:0,wages:{}};
export const unpaidTotal=a=>a.payables?a.payables.operating+a.payables.tax+Object.values(a.payables.wages).reduce((n,v)=>n+v,0):0;
export function payOperating(e,id,key,amount){
 const a=accountOf(e,id),paid=e.world?Math.min(amount,Math.max(0,a.cash)):amount;
 postAccount(e,id,key,paid);if(key==='tax')taxReceipt(e,id,'leagueLevy',paid);
 if(paid<amount)obligations(a)[key]+=amount-paid;return paid;
}
export function payPayroll(e,club,rows){
 const a=accountOf(e,club),total=rows.reduce((n,p)=>n+p.amount,0),budget=e.world?Math.min(total,Math.max(0,a.cash)):total;let paid=0;
 for(const [i,row] of rows.entries()){
  const amount=i===rows.length-1?budget-paid:Math.floor(budget*row.amount/Math.max(1,total));paid+=amount;
  payPlayer(e,row.id,club,amount);if(amount<row.amount){const due=obligations(a).wages;due[row.id]=(due[row.id]||0)+row.amount-amount;}
 }
 postAccount(e,club,'wages',paid);
}
export function settlePayables(e,id){
 const a=accountOf(e,id),p=a.payables;if(!p)return;
 const rows=Object.entries(p.wages).map(([id,amount])=>({id,amount})),total=rows.reduce((n,r)=>n+r.amount,0),budget=Math.min(total,Math.max(0,a.cash));let used=0;
 for(const [i,row] of rows.entries()){const amount=i===rows.length-1?budget-used:Math.floor(budget*row.amount/Math.max(1,total));used+=amount;p.wages[row.id]-=amount;payPlayer(e,row.id,id,amount);if(!p.wages[row.id])delete p.wages[row.id];}
 postAccount(e,id,'wages',used);
 for(const key of ['tax','operating']){const amount=Math.min(p[key],Math.max(0,a.cash));postAccount(e,id,key,amount);p[key]-=amount;if(key==='tax')taxReceipt(e,id,'leagueLevy',amount);}
}
