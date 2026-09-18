import test from 'node:test';
import assert from 'node:assert/strict';
import {createSeason} from '../src/competitions/runtime.js';
import {ensureEconomy,wageBill,askingPrice,transferQuote,signPlayer,validateEconomy,accrueEconomy,advanceCareer} from '../src/competitions/market.js';
import {clubPlayers,populationPlayers} from '../src/competitions/population.js';
import {rollFinance,financeYear,postFinance,settleMatchFinance,wageCeiling} from '../src/competitions/finance.js';
import {METRO_SYSTEMS} from '../src/competitions/catalog.js';
import {marketScale,marketTransferValue,ECONOMIC_MODEL} from '../src/competitions/economics.js';
const state=()=>{const s=createSeason();ensureEconomy(s);return s;};
test('经营规模独立于工资，头部十亿级、同赛区贫富差异主要来自商业和球场',()=>{
 const s=state(),e=s.economy,ids=METRO_SYSTEMS.flatMap(id=>s.members[id]),accounts=ids.map(id=>e.accounts[id]);
 assert.equal(e.financeVersion,ECONOMIC_MODEL);assert.ok(e.accounts.sky.operatingRevenueBudget>1e9);
 const rich=Math.max(...accounts.map(a=>a.operatingRevenueBudget)),poor=Math.min(...accounts.map(a=>a.operatingRevenueBudget));assert.ok(rich/poor>4&&rich/poor<8);
 assert.ok(Math.max(...accounts.map(a=>a.plan.broadcast))/Math.min(...accounts.map(a=>a.plan.broadcast))<1.8);
 for(const division of Object.keys(s.members))assert.equal(s.members[division].reduce((n,id)=>n+e.accounts[id].plan.broadcast,0),marketScale(division).broadcast*s.members[division].length);
 assert.ok(accounts.every(a=>a.operatingRevenueBudget===a.plan.broadcast+a.plan.sponsorship+a.plan.commercial+a.expectedMatchday));
 const altered=structuredClone(s);altered.economy.accounts.sky.baseWageLimit*=100;altered.economy.accounts.sky.wageLimit*=100;
 for(const c of Object.values(altered.economy.contracts))if(c.club==='sky')c.weeklyWage*=100;
 s.year=319;altered.year=319;rollFinance(s);rollFinance(altered);assert.deepEqual(altered.economy.accounts.sky.plan,e.accounts.sky.plan);
});
test('升降级改变联赛资源，球场规模保留；声望变化逐年影响商业',()=>{
 const s=state(),high=structuredClone(s),low=structuredClone(s);high.economy.accounts.sky.reputation=9500;low.economy.accounts.sky.reputation=3000;
 high.year=319;low.year=319;rollFinance(high);rollFinance(low);assert.ok(high.economy.accounts.sky.plan.commercial>low.economy.accounts.sky.plan.commercial);
 assert.equal(high.economy.accounts.sky.business.stadiumCapacity,low.economy.accounts.sky.business.stadiumCapacity);
 const id=s.members['liberlin-league'][0],other=s.members['liberlin-league-2'][0],before=s.economy.accounts[id].business.stadiumCapacity,oldRevenue=s.economy.accounts[id].operatingRevenueBudget;
 s.members['liberlin-league'][0]=other;s.members['liberlin-league-2'][0]=id;s.year=319;rollFinance(s);
 assert.equal(s.economy.accounts[id].business.stadiumCapacity,before);assert.ok(s.economy.accounts[id].operatingRevenueBudget<oldRevenue);assert.ok(s.economy.accounts[id].plan.relegation>0);
});
test('转会估值随实力、年龄和剩余合同变化，顶级球星可达亿元',()=>{
 const player={ability:175,age:24,remainingDays:1095,position:'ST'},top=marketTransferValue(player);
 assert.ok(top>=1e8&&top<3e8);assert.ok(marketTransferValue({...player,ability:115})<top/5);
 assert.ok(marketTransferValue({...player,remainingDays:120})<top/5);assert.ok(marketTransferValue({...player,age:34})<top/2);
 assert.equal(marketTransferValue({...player,remainingDays:0}),0);
 const s=state(),p=clubPlayers(s,'sky')[0];assert.equal(askingPrice(s,{...p,club:null}),0);
 s.economy.contracts[p.id].end='0317-12-31';assert.equal(askingPrice(s,p),0);
});
test('个人工资上限为俱乐部经营收入的 3.5%，小俱乐部有地板线',()=>{
 const s=state(),a=s.economy.accounts.sky;
 assert.equal(wageCeiling(s,'sky'),Math.floor(a.operatingRevenueBudget*.035/52/7)*7);
 assert.ok(wageCeiling(s,'sky')*52>3e7&&wageCeiling(s,'sky')*52<5e7,'顶级俱乐部年薪上限应在 3000—5000 万');
 assert.equal(wageCeiling({economy:{accounts:{x:{operatingRevenueBudget:1e6}}}},'x'),80000,'小俱乐部地板线');
 assert.equal(wageCeiling({economy:{accounts:{}}},'x'),Infinity,'无预算账户不设限');
});
test('新金额下真实转会守恒、收入排除出售与注资、分段计提一致',()=>{
 const s=state();s.manager={clubId:'sky'};let quote;
 for(const p of populationPlayers(s)){try{const q=transferQuote(s,p.id,'sky');if(q.fee>1e6){quote=q;break;}}catch{}}
 assert.ok(quote);const buyer=s.economy.accounts.sky.cash,seller=s.economy.accounts[quote.from].cash;
 signPlayer(s,quote.player);assert.equal(s.economy.accounts.sky.cash,buyer-quote.fee-quote.bonus);assert.equal(s.economy.accounts[quote.from].cash,seller+quote.sellerNet);validateEconomy(s);
 const copy=structuredClone(s);accrueEconomy(s,'0318-02-01');for(const d of ['0318-01-07','0318-01-21','0318-02-01'])accrueEconomy(copy,d);assert.deepEqual(copy.economy,s.economy);
 const a=s.economy.accounts[quote.from],row=financeYear(s,quote.from);assert.equal(row.operatingRevenue,a.income.broadcast+a.income.sponsorship+a.income.commercial+a.income.matchday+a.income.prize);
 assert.equal(row.cash,row.openingCash+row.net);assert.ok(row.incomeTotal>row.operatingRevenue);
});
test('比赛日预算按实际主场场数计算，单循环与轮休不虚增；旧财务版本不会被重标金额',()=>{
 const s=state(),id=s.members['liberlin-league-4'][0],a=s.economy.accounts[id],games=s.fixtures.filter(m=>m.kind==='league'&&m.home===id);
 assert.equal(a.business.homeGames,games.length);for(const m of games)settleMatchFinance(s,{...m,score:[0,0]});assert.equal(a.income.matchday,a.expectedMatchday);
 const old=structuredClone(s);old.economy.financeVersion=2;delete old.economy.marketVersion;const snapshot=JSON.stringify(old.economy);ensureEconomy(old);assert.equal(JSON.stringify(old.economy),snapshot);
});
