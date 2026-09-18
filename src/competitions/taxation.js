import {accountOf,accountsOf} from './economic-ledger.js';
import {localClubById} from './local-catalog.js';
import {clubs} from '../world.js';
import {getSystem} from './catalog.js';
import {dateOf,daysBetween} from './calendar.js';

// Fictional world policy, in star dollars. Rates apply only within each band.
export const TRANSFER_TAX_RATE=.05;
export const INCOME_TAX_BANDS=[[60000,0],[300000,.10],[1000000,.20],[5000000,.30],[20000000,.40],[Infinity,.45]];
const zero=()=>({gross:0,incomeTax:0,net:0});
const receipt=()=>({incomeTax:0,transferTax:0,leagueLevy:0});
const regionByClub=new Map(clubs.map(c=>[c.id,getSystem(c.league).region]));
export function personalIncomeTax(gross){
 if(!Number.isSafeInteger(gross)||gross<0)throw Error('应税收入无效');
 let lower=0,tax=0;for(const [upper,rate] of INCOME_TAX_BANDS){tax+=Math.max(0,Math.min(gross,upper)-lower)*rate;lower=upper;if(gross<=upper)break;}
 return Math.floor(tax+1e-7);
}
export function initializeTaxation(s){
 const e=s.economy;if(e.taxVersion!==1||e.taxation)return;
 e.taxation={year:e.year,players:{},regions:Object.fromEntries([...new Set(regionByClub.values())].map(r=>[r,{season:receipt(),totals:receipt(),history:[]}]))};
 for(const a of Object.values(e.accounts)){a.season.transferTax=0;a.totals.transferTax=0;a.withholding={season:zero(),totals:zero()};}
}
export const transferTax=(e,fee)=>e.taxVersion===1?Math.round(fee*TRANSFER_TAX_RATE):0;
export function taxReceipt(e,club,key,amount){
 if(e.taxVersion!==1)return;
 const r=e.taxation.regions[(regionByClub.get(club)||localClubById.get(club)?.region)];r.season[key]+=amount;r.totals[key]+=amount;
}
// Gross wages/bonuses/compensation already leave the club account. This splits
// that same payment between the player and treasury; never debit it twice.
export function payPlayer(e,id,club,gross){
 if(e.taxVersion!==1||!gross)return;
 if(!Number.isSafeInteger(gross)||gross<0)throw Error('球员收入无效');
 const p=e.taxation.players[id]??={year:e.year,...zero(),totals:zero(),history:[]};
 const incomeTax=personalIncomeTax(p.gross+gross)-p.incomeTax,delta={gross,incomeTax,net:gross-incomeTax};
 for(const [key,n] of Object.entries(delta)){p[key]+=n;p.totals[key]+=n;accountOf(e,club).withholding.season[key]+=n;accountOf(e,club).withholding.totals[key]+=n;}
 taxReceipt(e,club,'incomeTax',incomeTax);
}
export function salaryBreakdown(s,weekly){
 const days=daysBetween(dateOf(s.year,1,1),dateOf(s.year+1,1,1)),annualGross=Math.round(weekly/7*days);
 const annualTax=s.economy?.taxVersion===1?personalIncomeTax(annualGross):0;
 return {annualGross,annualTax,annualNet:annualGross-annualTax,netWeekly:Math.round((annualGross-annualTax)/days*7)};
}
export function rollTaxation(s){
 const e=s.economy;if(e.taxVersion!==1)return;
 for(const p of Object.values(e.taxation.players)){p.history.push({year:p.year,gross:p.gross,incomeTax:p.incomeTax,net:p.net});Object.assign(p,zero(),{year:s.year});}
 for(const r of Object.values(e.taxation.regions)){r.history.push({year:e.year,...r.season});r.season=receipt();}
 for(const [,a] of accountsOf(e))a.withholding.season=zero();
 e.taxation.year=s.year;
}
export function validateTaxation(s){
 const e=s.economy;if(e.taxVersion===undefined){if(e.taxation)throw Error('税务模型版本缺失');return;}
 const integer=n=>Number.isSafeInteger(n)&&n>=0,fail=()=>{throw Error('税务账本不平衡');};
 if(e.taxVersion!==1||!e.taxation||e.taxation.year!==e.year)fail();
 const regions=Object.fromEntries(Object.keys(e.taxation.regions).map(r=>[r,{season:receipt(),totals:receipt()}]));
 const sum={season:zero(),totals:zero()},players={season:zero(),totals:zero()};
 for(const [id,a] of accountsOf(e)){
  const r=regions[(regionByClub.get(id)||localClubById.get(id)?.region)];if(!r||!a.withholding)fail();
  for(const period of ['season','totals']){
   const w=a.withholding[period],v=a[period];if(!w||!integer(v.transferTax)||!Object.keys(zero()).every(k=>integer(w[k]))||w.gross!==w.net+w.incomeTax||w.gross!==v.wages+v.bonuses+v.severance)fail();
   for(const key of Object.keys(zero()))sum[period][key]+=w[key];
   r[period].incomeTax+=w.incomeTax;r[period].transferTax+=v.transferTax;r[period].leagueLevy+=v.tax;
  }
 }
 for(const p of Object.values(e.taxation.players)){
  if(p.year!==e.year||!Array.isArray(p.history)||!Object.keys(zero()).every(k=>integer(p[k])&&integer(p.totals[k]))||p.incomeTax!==personalIncomeTax(p.gross)||p.net+p.incomeTax!==p.gross)fail();
  for(const h of p.history)if(!integer(h.year)||!Object.keys(zero()).every(k=>integer(h[k]))||h.incomeTax!==personalIncomeTax(h.gross)||h.net+h.incomeTax!==h.gross)fail();
  for(const key of Object.keys(zero())){if(p.totals[key]!==p[key]+p.history.reduce((n,h)=>n+h[key],0))fail();players.season[key]+=p[key];players.totals[key]+=p.totals[key];}
 }
 for(const period of ['season','totals'])for(const key of Object.keys(zero()))if(players[period][key]!==sum[period][key])fail();
 for(const [region,r] of Object.entries(e.taxation.regions)){
  if(!Array.isArray(r.history))fail();
  for(const key of Object.keys(receipt())){
   for(const period of ['season','totals'])if(!integer(r[period]?.[key])||r[period][key]!==regions[region][period][key])fail();
   if(r.history.some(h=>!integer(h[key]))||r.totals[key]!==r.season[key]+r.history.reduce((n,h)=>n+h[key],0))fail();
  }
 }
 for(const m of e.moves)if(m.type==='transfer'&&(m.transferTax!==transferTax(e,m.fee)||m.sellerNet!==m.fee-m.transferTax||!m.from&&m.fee!==0))fail();
 for(const [id,a] of accountsOf(e))if(a.totals.transferTax!==e.moves.reduce((n,m)=>n+(m.type==='transfer'&&m.from===id?m.transferTax:0),0))fail();
}
