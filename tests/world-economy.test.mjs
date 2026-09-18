import test from 'node:test';
import assert from 'node:assert/strict';
import {createSeason,validateSave} from '../src/competitions/runtime.js';
import {ensureEconomy,validateEconomy,releasePlayer,accrueEconomy,rolloverEconomy,advanceCareer} from '../src/competitions/market.js';
import {localDivisions,localClubs,localClubById,LOCAL_TIERS} from '../src/competitions/local-catalog.js';
import {advanceWorld,rollWorld,validateWorld,dissolveLocalClub} from '../src/competitions/local-football.js';
import {recruitLocalPlayer,recruitReleasedPlayer,materializeLocal,registerLocalSenior} from '../src/competitions/local-bridge.js';
import {borrow,repay,enterAdministration,settleCreditMonth,spendPublicRevenue,publicBalance} from '../src/competitions/public-credit.js';
import {payOperating,payPayroll,unpaidTotal} from '../src/competitions/payables.js';
import {postFinance,rollFinance} from '../src/competitions/finance.js';
import {accountOf,accountsOf,ledgerCash} from '../src/competitions/economic-ledger.js';
import {prepareSuccession,scheduleDissolution} from '../src/competitions/insolvency.js';
import {populationPlayer} from '../src/competitions/population.js';
import {addDays} from '../src/competitions/calendar.js';
import {economyContent} from '../src/competitions/economy-ui.js';
const fresh=()=>{const s=createSeason({worldModel:true});ensureEconomy(s);return s;};
function localAdvance(s,date){s.date=date;s.economy.through=date;s.economy.nextReview=addDays(date,7);advanceWorld(s,date);}
test('省市金字塔有真实身份、完整阵容、稳定地区资金池和逐场赛历',()=>{
 const s=fresh(),w=s.economy.world;assert.equal(localClubs.length,3024);assert.equal(Object.keys(w.players).length,75600);assert.equal(w.fixtures.length,36720);
 assert.equal(Object.keys(s.economy.accounts).length,217);assert.equal(new Set(Object.values(w.members).flat()).size,3024);
 for(const d of localDivisions)assert.equal(w.members[d.id].length,LOCAL_TIERS[d.tier].teams);
 for(const [region,pool] of Object.entries(w.regionalMarkets))assert.equal(Object.values(w.clubs).filter(c=>localClubById.get(c.id).region===region).reduce((n,c)=>n+c.finance.operatingRevenueBudget,0),pool);
 validateSave(s);assert.match(economyContent(s),/省市联赛/);assert.match(economyContent(s),/公共资金与银行/);
});
test('真实地方比赛记录比分、首发分钟与积分；存档恢复后不重复发薪或结算比赛',()=>{
 const s=fresh();localAdvance(s,'0318-03-15');const w=s.economy.world;assert.ok(w.fixtureCursor>0);assert.ok(w.fixtures[0].players.every(ps=>ps.length===11&&ps.reduce((n,p)=>n+p.minutes,0)===990));
 const snapshot=structuredClone(s);advanceWorld(snapshot,s.date);assert.deepEqual(snapshot,s);validateEconomy(s);
 const bad=structuredClone(s);bad.economy.world.fixtures[0].players[0][0].minutes++;assert.throws(()=>validateWorld(bad),/比赛/);
});
test('地方与现有职业体系双向流动保留身份、税账及发展记录',()=>{
 const s=fresh(),w=s.economy.world,p=Object.values(w.players).filter(p=>p.position==='CM'&&p.birthYear>=294).sort((a,b)=>b.ability-a.ability)[0];
 const deal=recruitLocalPlayer(s,p.id,'sky',{automatic:true});assert.equal(populationPlayer(s,p.id).club,'sky');assert.equal(w.players[p.id].status,'core');assert.ok(!w.clubs[deal.from].roster.includes(p.id));validateSave(s);
 s.manager={clubId:'sky'};releasePlayer(s,p.id);let down;
 for(const c of Object.values(w.clubs).filter(c=>c.tier==='professional').sort((a,b)=>b.finance.wageLimit-a.finance.wageLimit)){try{down=recruitReleasedPlayer(s,p.id,c.id);break;}catch{}}
 assert.ok(down);assert.equal(w.players[p.id].id,p.id);assert.equal(populationPlayer(s,p.id).registrationStatus,'external');validateSave(s);
});
test('贷款由有限银行资金支付，本金、利息、欠息和重复月结对账',()=>{
 const s=fresh(),e=s.economy,a=e.accounts.sky,b=e.world.banks.metro,cash=a.cash,bank=b.cash;
 borrow(s,'sky',1000000);assert.equal(a.cash,cash+1000000);assert.equal(b.cash,bank-1000000);repay(s,'sky',200000);assert.equal(e.world.credit.sky.principal,800000);
 s.date='0318-02-01';settleCreditMonth(s);assert.ok(e.world.credit.sky.interestPaid>0);assert.ok(e.world.credit.sky.principal<800000);const snapshot=JSON.stringify(e.world);settleCreditMonth(s);assert.equal(JSON.stringify(e.world),snapshot);
 assert.throws(()=>borrow(s,'sky',10e12),/授信/);validateWorld(s);
});
test('公共支出来自已收税款，员工欠薪不冒充已付工资或提前扣税',()=>{
 const s=fresh(),e=s.economy,p=Object.keys(e.contracts).find(id=>e.contracts[id].club==='sky');payPayroll(e,'sky',[{id:p,amount:1000000}]);postFinance(e,'sky','tax',100000);
 const before=publicBalance(e,'metro')+publicBalance(e,'metro',true);spendPublicRevenue(s);const after=publicBalance(e,'metro')+publicBalance(e,'metro',true),t=e.world.public.metro;assert.equal(before-after,t.stateSpent+t.leagueSpent);assert.ok(t.grassroots>0&&t.facilities>0&&t.services>0&&t.youth>0);
 const a=e.accounts.sky;payOperating(e,'sky','operating',a.cash);const paid=a.totals.wages,tax=e.taxation.regions.metro.totals.incomeTax;payPayroll(e,'sky',[{id:p,amount:14000}]);assert.equal(a.cash,0);assert.equal(a.totals.wages,paid);assert.equal(unpaidTotal(a),14000);assert.equal(e.taxation.regions.metro.totals.incomeTax,tax);validateEconomy(s);
});
test('偿付危机托管只拨款一次，禁止健康球队和托管球队反复融资',()=>{
 const s=fresh(),e=s.economy;assert.throws(()=>enterAdministration(s,'sky'),/危机/);payOperating(e,'sky','operating',e.accounts.sky.cash+5000);
 const c=enterAdministration(s,'sky');assert.equal(c.status,'administration');assert.throws(()=>borrow(s,'sky',100),/授信/);const saved=JSON.stringify(e);enterAdministration(s,'sky');assert.equal(JSON.stringify(e),saved);validateEconomy(s);
});
test('地方解散由现有下级递补，身份不复用，银行损失保留，释放球员进入新社区',()=>{
 const s=fresh(),e=s.economy,w=e.world;localAdvance(s,'0319-01-01');
 const id=w.members[localDivisions.find(d=>d.tier==='professional').id][0];payPayroll(e,'sky',[{id:Object.keys(e.contracts).find(id=>e.contracts[id].club==='sky'),amount:25000000}]);borrow(s,id,Math.min(100000,Math.floor(w.clubs[id].finance.operatingRevenueBudget*.1)));payOperating(e,id,'operating',w.clubs[id].finance.cash+5000);enterAdministration(s,id);dissolveLocalClub(s,id);
 s.year=319;rollWorld(s);assert.ok(w.clubs[id].finance.totals.severance>0);assert.equal(e.moves.filter(m=>m.type==='release'&&m.from===id).reduce((n,m)=>n+m.compensation,0),w.clubs[id].finance.totals.severance);assert.equal(w.clubs[id].status,'dissolved');assert.ok(!Object.values(w.members).flat().includes(id));assert.equal(new Set(Object.values(w.members).flat()).size,3024);assert.ok(w.history[0].movements.some(m=>m.type==='replacement'&&m.from===id));assert.ok(w.history[0].movements.some(m=>m.type==='new-community'));validateWorld(s);
});
test('现有联赛解散席位由真实省级球队递补，原俱乐部与债权档案保留',()=>{
 const s=fresh(),e=s.economy;localAdvance(s,'0318-12-31');s.summary={nextMembers:structuredClone(s.members),qualifiers:structuredClone(s.qualifiers),draftRanking:[...s.draftRanking]};
 borrow(s,'sky',100000);payOperating(e,'sky','operating',e.accounts.sky.cash+5000);enterAdministration(s,'sky');scheduleDissolution(s,'sky');prepareSuccession(s);
 const event=e.world.events.find(e=>e.type==='core-replacement');assert.ok(event);assert.notEqual(event.replacement,'sky');assert.ok(s.summary.nextMembers.closed.includes(event.replacement));assert.ok(!s.summary.nextMembers.closed.includes('sky'));assert.equal(e.accounts.sky.dissolved,true);assert.equal(e.world.credit.sky.status,'dissolved');assert.ok(Object.values(e.contracts).filter(c=>c.club===event.replacement).length>=23);assert.equal(e.accounts[event.replacement].cash,ledgerCash(e.accounts[event.replacement]));
 const next=createSeason({year:319,worldModel:true,members:s.summary.nextMembers,qualifiers:s.summary.qualifiers,draftRanking:s.summary.draftRanking,playerRegistry:s.playerRegistry,development:s.development,economy:e});accrueEconomy(next,next.date);rolloverEconomy(next);validateSave(next);assert.ok(next.fixtures.some(m=>m.home===event.replacement||m.away===event.replacement));
});

test('融资不能掩盖经营亏损或提高亏损容许额',()=>{
 const s=fresh();borrow(s,'sky',3000000);payOperating(s.economy,'sky','operating',1000000);s.year++;rollFinance(s);
 const a=s.economy.accounts.sky;assert.equal(a.history.at(-1).net,2000000);assert.equal(a.review.loss,1000000);assert.equal(a.review.allowance,0);assert.equal(a.review.restricted,true);
});
test('原职业球员经地方回流再注册，不复制初始球员身份',()=>{
 const s=fresh(),id=Object.keys(s.economy.contracts).find(id=>s.economy.contracts[id].club==='sky'),p=populationPlayer(s,id),w=s.economy.world;
 s.manager={clubId:'sky'};releasePlayer(s,id);let down;
 for(const c of Object.values(w.clubs).filter(c=>c.tier==='professional').sort((a,b)=>b.finance.wageLimit-a.finance.wageLimit)){try{down=recruitReleasedPlayer(s,id,c.id);break;}catch{}}
 assert.ok(down);const full=materializeLocal(s,w.players[id],'sky');registerLocalSenior(s,full);assert.ok(!s.playerRegistry.players[id]);assert.equal(populationPlayer(s,id).club,'sky');
 // Complete the same state transition used by promotion/replacement.
 w.clubs[down.to].roster=w.clubs[down.to].roster.filter(x=>x!==id);w.players[id].status='core';w.players[id].club='sky';s.economy.contracts[id]={club:'sky',start:s.date,end:'0320-12-31',weeklyWage:w.players[id].weeklyWage,kind:'senior'};validateSave(s);
});

test('正常职业 AI 会从地方引援，不被刚转会的短名单堵住',()=>{
 const s=fresh();advanceCareer(s,'0318-01-08');assert.ok(s.economy.moves.some(m=>m.bridge==='up'));validateSave(s);
});
