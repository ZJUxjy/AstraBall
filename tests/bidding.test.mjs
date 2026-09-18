import test from 'node:test';
import assert from 'node:assert/strict';
import {createSeason,validateSave} from '../src/competitions/runtime.js';
import {ensureEconomy,marketAuction,transferQuote,signPlayer,renewalQuote,availableBudget,advanceCareer,validateEconomy,runMarketAuctions} from '../src/competitions/market.js';
import {populationPlayer,persistPlayer,setPlayerClub,currentAbility,clubPlayers} from '../src/competitions/population.js';
import {clearBids} from '../src/competitions/bidding.js';

const target='silver-fc-21',winner='closed-club-3',rival='sky';
function capital(s,id,cash){const a=s.economy.accounts[id],delta=cash-a.cash;a.cash+=delta;a.openingCash+=delta;a.seasonOpeningCash+=delta;}
function scenario(rivalCash=0){
 const s=createSeason();ensureEconomy(s);
 for(const [id,a] of Object.entries(s.economy.accounts))if(![winner,rival].includes(id))a.wageLimit=0;
 capital(s,winner,5e9);capital(s,rival,rivalCash);return s;
}
test('真实超级球星：单一富买方不自抬价，有资金的竞争者越富，转会费和工资越高',()=>{
 const states=[scenario(0),scenario(500e6),scenario(2e9)],qs=states.map(s=>marketAuction(s,target));
 assert.ok(currentAbility(states[0],populationPlayer(states[0],target))>90);
 assert.equal(qs[0].factor,1);assert.equal(qs[0].bidders.length,1);
 assert.ok(qs.every(q=>q.club===winner));
 for(let i=1;i<qs.length;i++){assert.equal(qs[i].bidders.length,2);assert.ok(qs[i].fee>qs[i-1].fee);assert.ok(qs[i].weeklyWage>qs[i-1].weeklyWage);}
 const s=states[2],before=JSON.stringify(s);assert.deepEqual(marketAuction(s,target),qs[2]);assert.equal(JSON.stringify(s),before);
});
test('无支付能力或无注册名额的球队不能虚抬报价，降低资金会回落',()=>{
 const s=scenario(2e9),high=marketAuction(s,target);capital(s,rival,0);
 const low=marketAuction(s,target);assert.equal(low.factor,1);assert.ok(low.fee<high.fee);
 capital(s,rival,2e9);s.economy.accounts[rival].wageLimit=0;assert.equal(marketAuction(s,target).factor,1);
 const full=scenario(2e9);for(const p of clubPlayers(full,'closed-club-1')){if(clubPlayers(full,rival).length>=40)break;setPlayerClub(full,p,rival);persistPlayer(full,p);full.economy.contracts[p.id].club=rival;}
 assert.equal(clubPlayers(full,rival).length,40);assert.equal(marketAuction(full,target).factor,1);
 assert.equal(clearBids([{club:'a',ceiling:.9,minimumWage:7}],{fee:100,wage:7}),null);
});
test('竞价按成交条款结算、转会费守恒且旧合同不被其他报价追溯改价',()=>{
 const s=scenario(2e9),q=transferQuote(s,target,winner),seller=populationPlayer(s,target).club;
 const before=structuredClone(s.economy),worldCash=()=>Object.values(s.economy.accounts).reduce((n,a)=>n+a.cash,0),cash=worldCash();
 signPlayer(s,target,winner,3,{automatic:true});assert.equal(s.economy.accounts[seller].cash,before.accounts[seller].cash+q.sellerNet);assert.equal(s.economy.accounts[winner].cash,before.accounts[winner].cash-q.fee-q.bonus);
 assert.equal(worldCash(),cash-q.bonus-q.transferTax);assert.equal(s.economy.contracts[target].weeklyWage,q.weeklyWage);
 for(const [id,c] of Object.entries(before.contracts))if(id!==target)assert.deepEqual(s.economy.contracts[id],c);
 assert.deepEqual(s.economy.moves.at(-1).bidding,q.bidding);validateEconomy(s);validateSave(structuredClone(s));
 const broken=structuredClone(s);broken.economy.moves.at(-1).bidding.factor++;assert.throws(()=>validateEconomy(broken),/竞价/);
 const after=JSON.stringify(s);assert.throws(()=>signPlayer(s,target,winner,3,{automatic:true}));assert.equal(JSON.stringify(s),after);
});
test('自由球员竞争推高工资，转会费始终为零；续约参考可成交的外部薪资',()=>{
 const free=rivalCash=>{const s=scenario(rivalCash),p=populationPlayer(s,target);setPlayerClub(s,p,null);p.unit='free';persistPlayer(s,p,{type:'expiry'});delete s.economy.contracts[target];return marketAuction(s,target);};
 const single=free(0),contested=free(2e9);assert.equal(single.fee,0);assert.equal(contested.fee,0);assert.ok(contested.weeklyWage>single.weeklyWage);
 const s=scenario(2e9),owner=populationPlayer(s,target).club;capital(s,owner,5e9);s.economy.accounts[owner].wageLimit=30e6;
 const outside=marketAuction(s,target),renew=renewalQuote(s,target);assert.ok(renew.weeklyWage>=outside.weeklyWage);assert.equal(renew.outsideOffer.club,outside.club);
});
test('积累现金能够投入买人，旧存档不自动启用新竞价',()=>{
 const s=scenario(2e9),before=availableBudget(s,winner);capital(s,winner,8e9);assert.ok(availableBudget(s,winner)>before);
 delete s.economy.biddingVersion;const saved=JSON.stringify(s.economy);ensureEconomy(s);assert.equal(JSON.stringify(s.economy),saved);assert.equal(marketAuction(s,target),null);assert.ok(availableBudget(s,winner)<=s.economy.accounts[winner].transferBudget);
});
test('同一竞价轮确定性且不花掉已承诺资金；日历分段和恢复不改变成交',()=>{
 const s=scenario(2e9),restored=structuredClone(s),deals=runMarketAuctions(s),again=runMarketAuctions(restored);
 assert.deepEqual(again,deals);assert.ok(deals.length);assert.deepEqual(restored,s);validateEconomy(s);
 const whole=scenario(2e9),split=structuredClone(whole);advanceCareer(whole,'0318-01-09');advanceCareer(split,'0318-01-04');const loaded=validateSave(structuredClone(split));advanceCareer(loaded,'0318-01-09');assert.deepEqual(loaded,whole);validateEconomy(whole);
});
