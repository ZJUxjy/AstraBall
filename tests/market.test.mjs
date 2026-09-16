import {seasonCalendar} from '../src/competitions/calendar.js';
import {seasonGoal} from '../src/competitions/career.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createSeason,seasonTeam,validateSave,matchInput,commitResult} from '../src/competitions/runtime.js';
import {populationPlayer,clubPlayers,annualPopulation} from '../src/competitions/population.js';
import {ensureEconomy,availableBudget,transferQuote,signPlayer,renewPlayer,renewalQuote,releasePlayer,releaseQuote,saleOffers,advanceCareer,accrueEconomy,rolloverEconomy,validateEconomy,isTransferWindow,promoteProfessional} from '../src/competitions/market.js';
const clone=x=>JSON.parse(JSON.stringify(x)),digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function target(s,club='sky'){for(const p of Object.values(s.population.players)){try{return transferQuote(s,p.id,club);}catch{}}throw Error('no eligible transfer target');}

test('初始合同和预算确定性，旧档按当前日期迁移，财务账本可验证',()=>{
 const s=createSeason(),again=createSeason();assert.equal(digest(s.economy),digest(again.economy));validateEconomy(s);
 const old=clone(s);delete old.economy;old.date='0318-07-01';ensureEconomy(old);assert.equal(old.economy.through,old.date);assert.equal(Object.values(old.economy.accounts).reduce((n,a)=>n+a.totals.wages,0),0);
 const before=digest(s);for(let i=0;i<2;i++)availableBudget(s,'sky');assert.equal(digest(s),before);validateSave(clone(s));
});
test('转会一次性更新归属、双方资金、工资和正式比赛输入，重复签约不扣款',()=>{
 const s=createSeason();s.manager={clubId:'sky'};const q=target(s),p=populationPlayer(s,q.player),seller=p.club,buyerBefore=s.economy.accounts.sky.cash,sellerBefore=s.economy.accounts[seller].cash;
 const beforeRoster=clubPlayers(s,'sky').length;signPlayer(s,p.id);assert.equal(p.club,'sky');assert.equal(s.economy.contracts[p.id].club,'sky');assert.equal(s.economy.accounts.sky.cash,buyerBefore-q.fee-q.bonus);assert.equal(s.economy.accounts[seller].cash,sellerBefore+q.fee);
 assert.ok(!seasonTeam(s,seller).roster.some(x=>x.id===p.id));assert.equal(seasonTeam(s,'sky').roster.length,beforeRoster+1);assert.ok(seasonTeam(s,'sky').roster.some(x=>x.id===p.id));validateEconomy(s);
 const saved=digest(s);assert.throws(()=>signPlayer(s,p.id));assert.equal(digest(s),saved);const restored=validateSave(clone(s));assert.equal(digest(restored.economy),digest(s.economy));
 const fixture=s.fixtures.find(m=>m.home==='sky'&&!m.bye);assert.ok(matchInput(s,fixture).home.roster.some(x=>x.id===p.id));
});
test('窗口、预算和用户出售授权在写入前检查，失败保持原档',()=>{
 const s=createSeason();s.manager={clubId:'sky'};const q=target(s);s.date='0318-05-01';s.economy.through=s.date;assert.equal(isTransferWindow(s),false);let before=digest(s);assert.throws(()=>signPlayer(s,q.player),/窗口/);assert.equal(digest(s),before);
 s.date='0318-01-01';s.economy.through=s.date;s.economy.accounts.sky.cash=0;before=digest(s);assert.throws(()=>signPlayer(s,q.player),/资金/);assert.equal(digest(s),before);
 const own=clubPlayers(s,'sky').find(p=>p.position==='CM');assert.throws(()=>signPlayer(s,own.id,'closed-club-3',3,{automatic:true}),/经理|俱乐部/);
});
test('经理可接受明确买方报价；续约与解约保留交易记录和精确补偿',()=>{
 const s=createSeason();s.manager={clubId:'sky'};const own=clubPlayers(s,'sky').find(p=>p.position==='CM'),offers=saleOffers(s,own.id);assert.ok(offers.length);
 const offer=offers[0];signPlayer(s,own.id,offer.to,3,{sellerApproved:true});assert.equal(own.club,offer.to);assert.equal(s.economy.moves.at(-1).from,'sky');
 const p=clubPlayers(s,'sky').find(p=>p.position==='CM'),q=renewalQuote(s,p.id,3);renewPlayer(s,p.id,3);assert.equal(s.economy.contracts[p.id].end,q.end);assert.equal(s.economy.contracts[p.id].weeklyWage,q.weeklyWage);
 const youth=clubPlayers(s,'sky',{unit:'youth'})[0],release=releaseQuote(s,youth.id),cash=s.economy.accounts.sky.cash;releasePlayer(s,youth.id);assert.equal(youth.club,null);assert.equal(youth.unit,'free');assert.equal(s.economy.accounts.sky.cash,cash-release.compensation);assert.equal(s.economy.contracts[youth.id],undefined);validateEconomy(s);
});
test('青年升队签职业合同并检查预算，旧成长计划继续跟随本人',()=>{
 const s=createSeason();s.manager={clubId:'sky'};const p=clubPlayers(s,'sky',{unit:'youth'}).find(p=>318-p.birthYear>=16);s.development.plans[p.id]={focus:'technical',load:.6};promoteProfessional(s,p.id);assert.equal(p.unit,'senior');assert.equal(s.economy.contracts[p.id].kind,'senior');assert.ok(s.economy.contracts[p.id].weeklyWage>140);assert.equal(s.development.plans[p.id].focus,'technical');validateEconomy(s);
});
test('分段日历、整段日历和 JSON 恢复的 AI 交易、工资与成长完全相同',()=>{
 const s=createSeason();s.manager={clubId:'sky'};const split=clone(s),originalUser=clubPlayers(s,'sky').map(p=>p.id);advanceCareer(s,'0318-02-01');s.date='0318-02-01';
 for(const d of ['0318-01-04','0318-01-08','0318-01-14','0318-01-21','0318-02-01']){advanceCareer(split,d);split.date=d;}
 assert.equal(digest(split),digest(s));assert.deepEqual(clubPlayers(s,'sky').map(p=>p.id),originalUser);assert.ok(s.economy.moves.some(m=>m.type==='transfer'));assert.ok(s.economy.accounts.sky.totals.wages>0);validateSave(clone(s));
 const saved=digest(s);advanceCareer(s,s.date);assert.equal(digest(s),saved);
});
test('跨年合同到期进入自由市场，AI 续约和新资金只结算一次',()=>{
 const s=createSeason();s.manager={clubId:'sky'};const p=clubPlayers(s,'sky').find(p=>p.position==='CM'&&318-p.birthYear<30);s.economy.contracts[p.id].end='0318-12-31';
 accrueEconomy(s,'0319-01-01');s.year=319;s.date='0319-01-01';s.calendar=seasonCalendar(s.year);annualPopulation(s);rolloverEconomy(s);assert.equal(p.club,null);assert.equal(p.unit,'free');assert.ok(s.economy.moves.some(m=>m.player===p.id&&m.type==='expiry'));assert.ok(s.economy.accounts.sky.totals.funding>0);validateEconomy(s);
 const before=digest(s);rolloverEconomy(s);assert.equal(digest(s),before);
});
test('损坏账本、合同归属和重复交易记录被拒绝',()=>{
 const s=createSeason();s.manager={clubId:'sky'};signPlayer(s,target(s).player);for(const corrupt of [s=>s.economy.accounts.sky.cash++,s=>s.economy.contracts[clubPlayers(s,'sky')[0].id].club='silver-fc',s=>s.economy.accounts.sky.totals.wages=-1,s=>s.economy.moves.push(s.economy.moves[0]),s=>s.economy.moves[0].fee++]){const broken=clone(s);corrupt(broken);assert.throws(()=>validateSave(broken));}
});

test('合同到期导致一线队不足十一人时仍能进入经理页面和重建阵容',()=>{
 const s=createSeason();s.manager={clubId:'sky'};for(const p of clubPlayers(s,'sky'))s.economy.contracts[p.id].end='0318-12-31';accrueEconomy(s,'0319-01-01');s.year=319;s.date='0319-01-01';s.calendar=seasonCalendar(s.year);annualPopulation(s);rolloverEconomy(s);assert.equal(clubPlayers(s,'sky').length,0);assert.ok(Number.isFinite(seasonGoal(s).target));const q=target(s);signPlayer(s,q.player);assert.equal(clubPlayers(s,'sky').length,1);validateEconomy(s);
});

test('同日到期的工资先解除承诺，再按门将和位置深度分配续约预算',()=>{
 const s=createSeason();for(const p of clubPlayers(s,'silver-fc'))s.economy.contracts[p.id].end='0318-12-31';accrueEconomy(s,'0319-01-01');s.year=319;s.date='0319-01-01';s.calendar=seasonCalendar(s.year);annualPopulation(s);rolloverEconomy(s);const roster=clubPlayers(s,'silver-fc');assert.ok(roster.length>=18);assert.ok(roster.filter(p=>p.position==='GK').length>=2);validateEconomy(s);
});
