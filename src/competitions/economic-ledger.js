export const CASH_IN=['funding','transferIn','borrowing'];
export const CASH_OUT=['transferOut','wages','severance','bonuses','operating','tax','transferTax','interest','principal'];
export const emptyLedger=()=>Object.fromEntries([...CASH_IN,...CASH_OUT].map(k=>[k,0]));
export const accountOf=(e,id)=>e.accounts[id]||e.world?.clubs[id]?.finance;
export const accountsOf=e=>[...Object.entries(e.accounts),...Object.entries(e.world?.clubs||{}).filter(([id])=>!e.accounts[id]).map(([id,c])=>[id,c.finance])];
export function postAccount(e,id,key,amount){
 if(!Number.isSafeInteger(amount)||amount<0||![...CASH_IN,...CASH_OUT].includes(key))throw Error('经济流水无效');
 const a=accountOf(e,id);if(!a)throw Error('经济账户不存在');
 a.season[key]=(a.season[key]||0)+amount;a.totals[key]=(a.totals[key]||0)+amount;a.cash+=(CASH_IN.includes(key)?1:-1)*amount;
}
export function publicGrant(e,id,amount){const a=accountOf(e,id);postAccount(e,id,'funding',amount);a.income.publicGrant=(a.income.publicGrant||0)+amount;a.incomeTotals.publicGrant=(a.incomeTotals.publicGrant||0)+amount;}
export function ledgerCash(a){return a.openingCash+CASH_IN.reduce((n,k)=>n+(a.totals[k]||0),0)-CASH_OUT.reduce((n,k)=>n+(a.totals[k]||0),0);}
