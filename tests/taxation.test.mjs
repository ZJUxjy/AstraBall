import test from 'node:test';
import assert from 'node:assert/strict';
import {createSeason,validateSave} from '../src/competitions/runtime.js';
import {ensureEconomy,accrueEconomy,signPlayer,transferQuote,renewPlayer,releasePlayer,validateEconomy,rolloverEconomy,registryMovement} from '../src/competitions/market.js';
import {personalIncomeTax,salaryBreakdown} from '../src/competitions/taxation.js';
import {postFinance,financeYear} from '../src/competitions/finance.js';
import {populationPlayer,setPlayerClub,persistPlayer} from '../src/competitions/population.js';
const target='silver-fc-21',buyer='closed-club-3';
function scenario(){const s=createSeason();ensureEconomy(s);const a=s.economy.accounts[buyer],d=5e9-a.cash;a.cash+=d;a.openingCash+=d;a.seasonOpeningCash+=d;for(const [id,a] of Object.entries(s.economy.accounts))if(id!==buyer)a.wageLimit=0;return s;}
const totalCash=s=>Object.values(s.economy.accounts).reduce((n,a)=>n+a.cash,0);
test('累进个税只对各档增量征税，低收入免税，跨档不会降低税后收入',()=>{
 assert.equal(personalIncomeTax(60000),0);assert.equal(personalIncomeTax(300000),24000);assert.equal(personalIncomeTax(1000000),164000);assert.equal(personalIncomeTax(5000000),1364000);assert.equal(personalIncomeTax(20000000),7364000);assert.equal(personalIncomeTax(30000000),11864000);
 for(const n of [60000,300000,1000000,5000000,20000000])assert.ok(n+100-personalIncomeTax(n+100)>n-personalIncomeTax(n));
 assert.throws(()=>personalIncomeTax(-1));
});
test('转会卖方实收、税库、球员实得与买方总支付守恒，无重复扣税',()=>{
 const s=scenario(),e=s.economy,q=transferQuote(s,target,buyer),cash=totalCash(s),seller=e.accounts[q.from].cash;
 const deal=signPlayer(s,target,buyer,3,{automatic:true}),p=e.taxation.players[target];
 assert.equal(deal.transferTax,Math.round(deal.fee*.05));assert.equal(e.accounts[q.from].cash,seller+deal.fee-deal.transferTax);
 assert.equal(cash-totalCash(s),deal.transferTax+deal.bonus);
 assert.equal(deal.bonus,p.net+p.incomeTax);assert.equal(p.incomeTax,personalIncomeTax(deal.bonus));
 assert.equal(e.taxation.regions.metro.season.transferTax,deal.transferTax);assert.equal(e.taxation.regions.metro.season.incomeTax,p.incomeTax);
 assert.equal(e.accounts[buyer].season.bonuses,deal.bonus);assert.equal(e.accounts[buyer].withholding.season.gross,deal.bonus);
 validateEconomy(s);validateSave(structuredClone(s));
 for(const mutate of [s=>s.economy.taxation.players[target].net++,s=>s.economy.accounts[buyer].withholding.totals.incomeTax++,s=>s.economy.taxation.regions.metro.totals.transferTax++,s=>s.economy.moves.at(-1).sellerNet++]){const bad=structuredClone(s);mutate(bad);assert.throws(()=>validateEconomy(bad),/税务/);}
});
test('按日拆分、恢复存档不改变个税；换队继承年度累计收入',()=>{
 const a=scenario(),b=structuredClone(a);accrueEconomy(a,'0318-01-06');for(const d of ['0318-01-02','0318-01-04','0318-01-06'])accrueEconomy(b,d);assert.deepEqual(b,a);
 a.date='0318-01-06';const restored=validateSave(structuredClone(a)),old=restored.economy.taxation.players[target].gross;
 const q=signPlayer(restored,target,buyer,3,{automatic:true}),p=restored.economy.taxation.players[target];assert.equal(p.gross,old+q.bonus);assert.equal(p.incomeTax,personalIncomeTax(old+q.bonus));validateEconomy(restored);
});
test('续约签字费和解约补偿计税，注册入口拒绝重复签约',()=>{
 const s=scenario();s.manager={clubId:buyer};signPlayer(s,target);const e=s.economy,old=e.taxation.players[target].gross;
 const q=renewPlayer(s,target);assert.equal(e.taxation.players[target].gross,old+q.bonus);const before=e.taxation.players[target].gross;
 const release=releasePlayer(s,target);assert.equal(e.taxation.players[target].gross,before+release.compensation);assert.equal(e.taxation.players[target].incomeTax,personalIncomeTax(before+release.compensation));
 const p=populationPlayer(s,target),reg=s.playerRegistry.registrations[target];
 // Recent-transfer restriction must block a registry re-sign without taxation.
 const snapshot=JSON.stringify(e);assert.equal(registryMovement(s,p,reg,{date:s.date,status:'senior',clubId:buyer,type:'sign'}),false);assert.equal(JSON.stringify(e),snapshot);validateEconomy(s);
});
test('跨年归档保留累计税库，新年免税额重置；超额税与政府税分账',()=>{
 const s=scenario();accrueEconomy(s,'0318-01-06');s.date='0318-01-06';postFinance(s.economy,buyer,'tax',12345);
 const prior=structuredClone(s.economy.taxation),annual=financeYear(s,buyer);assert.equal(annual.withholding.gross,annual.wages+annual.bonuses+annual.severance);
 s.year=319;s.date='0319-01-01';rolloverEconomy(s);s.economy.through=s.date;
 assert.equal(s.economy.taxation.players[target].gross,0);assert.equal(s.economy.taxation.players[target].history[0].gross,prior.players[target].gross);
 assert.equal(s.economy.taxation.regions.metro.totals.leagueLevy,prior.regions.metro.totals.leagueLevy);assert.equal(s.economy.taxation.regions.metro.season.leagueLevy,0);
 accrueEconomy(s,'0319-01-02');s.date='0319-01-02';validateEconomy(s);
 assert.ok(salaryBreakdown(s,700000).netWeekly<700000);
});
test('旧存档不补扣税，新规则自由签约不产生转会税',()=>{
 const s=scenario();delete s.economy.taxVersion;delete s.economy.taxation;for(const a of Object.values(s.economy.accounts)){delete a.withholding;delete a.season.transferTax;delete a.totals.transferTax;}
 const before=JSON.stringify(s);ensureEconomy(s);assert.equal(JSON.stringify(s),before);const q=signPlayer(s,target,buyer,3,{automatic:true});assert.equal(q.transferTax,undefined);validateEconomy(s);
 const fresh=scenario(),p=populationPlayer(fresh,target);setPlayerClub(fresh,p,null);p.unit='free';persistPlayer(fresh,p,{type:'expiry'});delete fresh.economy.contracts[target];
 const free=signPlayer(fresh,target,buyer,3,{automatic:true});assert.equal(free.fee,0);assert.equal(free.transferTax,0);assert.equal(free.sellerNet,0);assert.equal(fresh.economy.taxation.regions.metro.totals.transferTax,0);assert.ok(fresh.economy.taxation.players[target].incomeTax>0);validateEconomy(fresh);
});
