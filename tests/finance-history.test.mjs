import test from 'node:test';
import assert from 'node:assert/strict';
import {createSeason,matchInput,engineSimulation,playFixture,commitResult,validateSave,pendingMatches} from '../src/competitions/runtime.js';
import {appointManager,coachPreview,beginCoachedMatch,updateCoachedMatch} from '../src/competitions/career.js';
import {FORMATIONS} from '../src/football/players.js';
import {ensureEconomy,accrueEconomy,validateEconomy,wageBill,advanceCareer,availableBudget,renewalQuote} from '../src/competitions/market.js';
import {clubPlayers,persistPlayer} from '../src/competitions/population.js';
import {academyLineup} from '../src/competitions/academy.js';
import {planAITeam,evaluateOpportunity} from '../src/football/ai-team.js';
import {annualTax,payrollCapacity,settleMatchFinance,financeYear,rollFinance,financialReserve,postFinance} from '../src/competitions/finance.js';
import {competitionStats,historicalResults,championRanking} from '../src/competitions/history.js';
import {ROYAL_CLUBS} from '../src/competitions/club-profiles.js';
test('软线允许超额但收税；现金账与分类收支相符，分段计提不改变结果',()=>{
 const s=createSeason();ensureEconomy(s);const a=s.economy.accounts.sky,copy=structuredClone(s);
 assert.equal(ROYAL_CLUBS.length,3);assert.ok(ROYAL_CLUBS.every(id=>s.members.closed.includes(id)));
 assert.ok(payrollCapacity(s,'sky')>a.wageLimit);assert.equal(annualTax(a,a.wageLimit),0);assert.ok(annualTax(a,a.wageLimit*1.1)>0);
 a.wageLimit=7;copy.economy.accounts.sky.wageLimit=7;
 accrueEconomy(s,'0318-02-01');for(const d of ['0318-01-04','0318-01-18','0318-02-01'])accrueEconomy(copy,d);
 assert.deepEqual(s.economy,copy.economy);s.date='0318-02-01';s.economy.nextReview='0318-02-08';validateEconomy(s);
 const r=financeYear(s,'sky');assert.equal(r.cash,r.openingCash+r.net);assert.ok(r.wages>0&&r.operating>0&&r.tax>0);assert.ok(r.income.broadcast>0);
 postFinance(s.economy,'sky','operating',a.cash+1000);assert.equal(a.cash,-1000);a.wageLimit=999999;validateEconomy(s);
 assert.equal(availableBudget(s,'sky'),0);assert.throws(()=>renewalQuote(s,clubPlayers(s,'sky')[0].id),/预算不足/);
});
test('比赛日收入只结算一次，中立场双方分账',()=>{
 const s=createSeason();ensureEconomy(s);const m={id:'gate-test',home:'sky',away:'silver-fc',kind:'league',score:[1,1],neutral:true};
 settleMatchFinance(s,m);const saved=JSON.stringify(s.economy);settleMatchFinance(s,m);assert.equal(JSON.stringify(s.economy),saved);
 assert.ok(s.economy.accounts.sky.income.matchday>0&&s.economy.accounts['silver-fc'].income.matchday>0);validateEconomy(s);
});
test('三年审查排除股东注资，限制后续扩大工资',()=>{
 const s=createSeason();ensureEconomy(s);const a=s.economy.accounts.sky;
 a.history=[317,316].map(year=>({year,net:-10000000,income:{owner:5000000},incomeTotal:6000000,transferIn:0}));
 s.year=319;rollFinance(s);assert.equal(a.review.restricted,true);assert.equal(payrollCapacity(s,'sky'),a.wageLimit);assert.equal(a.history.at(-1).year,318);assert.equal(a.season.wages,0);
});
test('降级补助两年递减，不扩大工资软线，签约预留下一年经营缺口',()=>{
 const s=createSeason();ensureEconomy(s);const id=s.members['liberlin-league-2'][0],other=s.members['liberlin-league-3'][0],a=s.economy.accounts[id],contracts=JSON.stringify(s.economy.contracts);
 s.members['liberlin-league-2'][0]=other;s.members['liberlin-league-3'][0]=id;s.year=319;rollFinance(s);
 const grant=a.plan.relegation;assert.ok(grant>0);assert.equal(JSON.stringify(s.economy.contracts),contracts);
 assert.equal(a.wageLimit,Math.round((a.revenueBudget-a.plan.owner-grant)*a.policy.wageRatio/52/7)*7);
 assert.equal(a.transferBudget,Math.round((a.revenueBudget-grant)*.23));
 const bill=a.wageLimit*1.35,nextGap=bill/7*366+a.operatingBudget+annualTax(a,bill)-(a.funding-grant);
 const reserve=financialReserve(s,id,bill,'0319-12-31');assert.ok(reserve>bill*8);assert.ok(reserve>=nextGap*.99);
 s.economy.year=319;s.year=320;rollFinance(s);assert.ok(Math.abs(a.plan.relegation-grant/2)<=1);
 s.economy.year=320;s.year=321;rollFinance(s);assert.equal(a.plan.relegation,0);assert.equal(a.relegationGrants.length,0);
});
test('完整比赛报告保留助攻与实名，赛事MVP依据实际累计；点球与胜平负分开',()=>{
 const p={id:'p',name:'球员甲',position:'ST',minutes:100,goals:2,assists:1,completed:10};
 const m={id:'m',date:'0318-06-01',kind:'global-ko',competition:'global-cup',home:'sky',away:'silver-fc',score:[2,2],shootout:{score:[4,3],winner:0},report:{historyVersion:2,players:[[p],[{id:'q',name:'球员乙',position:'GK',minutes:100,saves:2}]]}};
 const r=competitionStats({fixtures:[m]},'global-cup');assert.equal(r.mvp.name,'球员甲');assert.equal(r.mvp.assists,1);assert.equal(r.teams[0].drawn,1);assert.equal(r.teams[0].shootoutWon,1);
 const records=[{year:318,matches:[m],competitions:[{competition:'global-cup',champion:'sky',kind:'title'},{competition:'crown-league-2-playoffs',champion:'sky',kind:'promotion'}]}];
 assert.equal(historicalResults(records,{club:'sky',opponent:'silver-fc'}).won,0);assert.equal(historicalResults(records,{club:'sky',topFlight:true}).played,0);assert.equal(championRanking(records)[0].titles,1);
});
test('注册制球队在窗口外能用本队适龄青训补缺，皇家学院仍遵守选秀路径',()=>{
 const s=createSeason();ensureEconomy(s);s.manager={clubId:'sky'};
 const club=s.members['liberlin-league-3'][0],beforeRoyal=clubPlayers(s,'silver-fc',{unit:'youth'}).map(p=>p.id);
 for(const p of clubPlayers(s,club).slice(9)){p.club=null;p.unit='free';persistPlayer(s,p,{type:'expiry'});delete s.economy.contracts[p.id];}
 for(const p of clubPlayers(s,club,{unit:'youth'}))s.playerRegistry.players[p.id].age=18;
 s.date='0318-05-01';s.economy.through=s.date;s.economy.nextReview='0318-05-08';
 assert.equal(clubPlayers(s,club).length,9);advanceCareer(s,'0318-05-08');
 assert.ok(clubPlayers(s,club).length>=11);assert.ok(s.economy.moves.some(m=>m.type==='professional'&&m.club===club));
 assert.deepEqual(clubPlayers(s,'silver-fc',{unit:'youth'}).map(p=>p.id),beforeRoyal);validateEconomy(s);
});
test('伤停与财政限制叠加时，临时征召真实地方青训且不改动合同或注册',()=>{
 const s=createSeason();ensureEconomy(s);const club=s.members['liberlin-league-3'][0];
 for(const p of clubPlayers(s,club).slice(9)){p.club=null;p.unit='free';persistPlayer(s,p,{type:'expiry'});delete s.economy.contracts[p.id];}
 for(const p of clubPlayers(s,club,{unit:'youth'}))s.playerRegistry.players[p.id].age=18;
 const m=s.fixtures.find(m=>m.home===club&&m.kind==='league'),injured=clubPlayers(s,club)[0];
 s.playerState[injured.id]={date:m.date,condition:100,injuryDays:20};s.economy.accounts[club].review.restricted=true;
 const before=JSON.stringify({economy:s.economy,registry:s.playerRegistry}),input=matchInput(s,m);
 assert.ok(input.home.roster.some(p=>p.academyCallup));assert.equal(input.homeLineup.length,11);assert.ok(!input.homeLineup.some(p=>p.id===injured.id));
 assert.equal(clubPlayers(s,club).length,9);assert.equal(JSON.stringify({economy:s.economy,registry:s.playerRegistry}),before);
});
test('临时征召号码不冲突；青训停赛随本队正式比赛服满而不永久卡住',()=>{
 const s=createSeason();ensureEconomy(s);const club=s.members['liberlin-league-3'][0];
 for(const p of clubPlayers(s,club).slice(14)){p.club=null;p.unit='free';persistPlayer(s,p,{type:'expiry'});delete s.economy.contracts[p.id];}
 const youths=clubPlayers(s,club,{unit:'youth'});for(const p of youths){s.playerRegistry.players[p.id].age=18;s.playerRegistry.players[p.id].number=1;}
 const m=s.fixtures.find(m=>m.home===club&&m.kind==='league'),banned=youths[0].id;s.discipline[`${m.competition}/${banned}`]={yellow:0,ban:1};
 const input=matchInput(s,m);assert.ok(!input.homeLineup.some(p=>p.id===banned));assert.equal(new Set(input.home.roster.map(p=>p.number)).size,input.home.roster.length);
 commitResult(s,m,input,engineSimulation(input));assert.equal(s.discipline[`${m.competition}/${banned}`].ban,0);
});
test('一线队缺员且与青训同日比赛时，适龄青年优先留给正式比赛',()=>{
 const s=createSeason({year:324});ensureEconomy(s);const m=s.fixtures.find(m=>m.competition==='liberlin-league-3'&&m.date==='0324-03-01');assert.ok(m);const club=m.home;
 const youth=clubPlayers(s,club,{unit:'youth'});for(const p of youth){const base=s.playerRegistry.players[p.id];base.age=18;for(const k of Object.keys(base.attributes))base.attributes[k]=90;}
 assert.ok(academyLineup(s,club,m.date).players.length>0);
 for(const p of clubPlayers(s,club).slice(9)){p.club=null;p.unit='free';persistPlayer(s,p,{type:'expiry'});delete s.economy.contracts[p.id];}
 assert.equal(academyLineup(s,club,m.date).players.length,0);assert.equal(matchInput(s,m).homeLineup.length,11);
});
test('不足十一人时才紧急征召满十六岁青训，并保留伤停和同日限制',()=>{
 const s=createSeason({year:324});ensureEconomy(s);const m=s.fixtures.find(m=>m.competition==='liberlin-league-3'&&m.date==='0324-03-01'),club=m.home;
 for(const p of clubPlayers(s,club,{unit:'youth'}))s.playerRegistry.players[p.id].age=16;
 assert.ok(!matchInput(s,m).home.roster.some(p=>p.emergencyCallup));
 for(const p of clubPlayers(s,club).slice(10)){p.club=null;p.unit='free';persistPlayer(s,p,{type:'expiry'});delete s.economy.contracts[p.id];}
 const youth=clubPlayers(s,club,{unit:'youth'}),injured=youth[0];s.playerState[injured.id]={date:m.date,condition:100,injuryDays:20};
 const contracts=JSON.stringify(s.economy.contracts),input=matchInput(s,m);assert.equal(input.homeLineup.length,11);assert.equal(input.home.roster.filter(p=>p.emergencyCallup).length,1);assert.ok(!input.home.roster.some(p=>p.id===injured.id));assert.equal(JSON.stringify(s.economy.contracts),contracts);
 assert.equal(academyLineup(s,club,m.date).players.length,0);
});
test('引援评估支持空队和不足十一人的阵容，默认完整阵容检查仍拒绝缺员',()=>{
 const s=createSeason(),roster=clubPlayers(s,'sky');
 for(const count of [0,5,10]){const team={id:'sky',roster:roster.slice(0,count)},plan=planAITeam(team,{healthy:true,allowIncomplete:true});assert.equal(plan.lineup.length,count);assert.equal(plan.vacancies.length,11-count);assert.throws(()=>planAITeam(team),/11/);assert.ok(Number.isFinite(evaluateOpportunity(team,roster.at(-1),{allowIncomplete:true}).expectedMinutes));}
 assert.deepEqual(planAITeam({id:'sky',roster},{allowIncomplete:true}),planAITeam({id:'sky',roster}));
});
test('正式赛事可使用七至十人首发；必须有门将，不制造补位球员',()=>{
 const s=createSeason(),m=s.fixtures.find(m=>m.kind==='league'),input=matchInput(s,m);input.home.roster=input.home.roster.slice(0,9);
 const plan=planAITeam(input.home,{allowIncomplete:true,requireKeeper:true});input.homeLineup=plan.lineup;input.homeTactics={formation:plan.formation};
 assert.equal(plan.lineup.length,9);assert.equal(plan.lineup.filter(p=>p.position==='GK').length,1);assert.throws(()=>engineSimulation(input),/首发/);
 assert.ok(plan.lineup.every(p=>FORMATIONS[plan.formation][p.anchorIndex]===p.position));
 const result=engineSimulation({...input,allowShortHanded:true});assert.equal(result.status,'finished');assert.ok(result.teams[0].players.every(p=>input.home.roster.some(q=>q.id===p.id)));assert.ok(result.teams[0].players.filter(p=>p.minutes>0).length<=9);
 const full=matchInput(s,m);assert.deepEqual(engineSimulation(full),engineSimulation({...full,allowShortHanded:true}));
});
test('玩家亲自执教少人阵容可开场、保存恢复并完成比赛，场上站位匹配阵型',()=>{
 const s=createSeason(),m=pendingMatches(s)[0];appointManager(s,m.home);s.date=m.date;
 for(const p of clubPlayers(s,m.home).slice(9)){p.club=null;p.unit='free';persistPlayer(s,p,{type:'expiry'});}
 const preview=coachPreview(s);assert.equal(preview.lineup.length,9);assert.ok(preview.lineup.every(p=>FORMATIONS[preview.tactics.formation][p.anchorIndex]===p.position));
 const state=beginCoachedMatch(s);assert.equal(state.teams[0].slots.length,9);assert.equal(state.teams[0].slots.find(p=>p.position==='GK').anchorIndex,0);
 const restored=validateSave(JSON.parse(JSON.stringify(s))),result=updateCoachedMatch(restored,{fixtureId:m.id,serial:0,steps:20000});assert.equal(result.status,'finished');assert.equal(restored.activeMatch,null);assert.ok(restored.fixtures.find(f=>f.id===m.id).score);
});
