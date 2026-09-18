import {youthContent} from '../src/competitions/youth-ui.js';
import {createPopulation} from '../src/competitions/population.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSeason,seasonTeam,validateSave,engineSimulation,matchInput} from '../src/competitions/runtime.js';
import {ensureEconomy,signPlayer,transferQuote,validateEconomy,advanceCareer,renewPlayer,releasePlayer} from '../src/competitions/market.js';
import {registeredPlayer,registeredRoster} from '../src/competitions/registry.js';
import {setYouthPath,youthOpportunities} from '../src/competitions/youth.js';
import {populationPlayer,clubPlayers} from '../src/competitions/population.js';
import * as prior from '../src/football/legacy/main-v6/engine.js';
import {restoreMatch,snapshotMatch,stepMatch,getResult} from '../src/football/engine.js';
import {footballTeams} from '../src/football/data.js';
const clone=x=>JSON.parse(JSON.stringify(x));
const career=()=>{const s=createSeason();s.manager={clubId:'bridge'};ensureEconomy(s);return s;};
test('合并新档只有主项目青训届次，合同转会写回同一注册表且JSON恢复一致',()=>{
 const s=career();assert.equal(s.population,undefined);assert.equal(Object.keys(s.playerRegistry.players).length,217*3);
 let q;for(const p of footballTeams.flatMap(t=>t.roster)){try{q=transferQuote(s,p.id,'bridge');break;}catch{}}
 assert.ok(q);const before=registeredRoster(s,q.from).length;signPlayer(s,q.player);
 assert.equal(registeredPlayer(s,q.player).club,'bridge');assert.equal(populationPlayer(s,q.player).club,'bridge');assert.equal(registeredRoster(s,q.from).length,before-1);
 assert.ok(seasonTeam(s,'bridge').roster.some(p=>p.id===q.player));validateEconomy(s);validateSave(clone(s));
 assert.equal(s.playerRegistry.registrations[q.player].history.at(-1).clubId,'bridge');
});
test('地方青训提拔与租借共用合同预算，归队保留母队合同与成长身份',()=>{
 const s=career(),id=Object.keys(s.playerRegistry.players).find(id=>s.playerRegistry.registrations[id].clubId==='bridge'&&s.playerRegistry.players[id].age===17),p=s.playerRegistry.players[id];
 const profile=clone(p.growthProfile),body=clone(p.bodyProfile);
 setYouthPath(s,id,'promote');assert.equal(s.economy.contracts[id].kind,'senior');assert.ok(clubPlayers(s,'bridge').some(p=>p.id===id));
 const loans=youthOpportunities(s,id).loans;assert.ok(loans.length);
 setYouthPath(s,id,'loan',{clubId:loans[0].id});assert.equal(registeredPlayer(s,id).club,loans[0].id);assert.equal(s.economy.contracts[id].club,'bridge');
 const borrower=loans[0].id;s.manager={clubId:borrower};assert.throws(()=>releasePlayer(s,id),/租借/);assert.throws(()=>renewPlayer(s,id),/租借/);s.manager={clubId:'bridge'};validateSave(clone(s));assert.deepEqual(s.playerRegistry.players[id].growthProfile,profile);assert.deepEqual(s.playerRegistry.players[id].bodyProfile,body);
 // Return is exercised at the natural year-end boundary without fictional matches.
 advanceCareer(s,'0318-12-31');assert.equal(s.playerRegistry.registrations[id].status,'senior');assert.equal(registeredPlayer(s,id).club,'bridge');assert.equal(s.economy.contracts[id].club,'bridge');validateSave(clone(s));
});
test('青训页面不能绕过职业合同预算，失败不改变注册与账本',()=>{
 const s=career(),id=Object.keys(s.playerRegistry.players).find(id=>s.playerRegistry.registrations[id].clubId==='bridge'&&s.playerRegistry.players[id].age===17);
 s.economy.accounts.bridge.wageLimit=0;const before=JSON.stringify(s);
 assert.throws(()=>setYouthPath(s,id,'promote'),/预算/);assert.equal(JSON.stringify(s),before);
});
test('主项目V6未完赛AI比赛在合并后仍按原执行路径完成',()=>{
 const a=prior.createMatch({home:footballTeams[0],away:footballTeams[1],seed:907,homeAI:true,awayAI:true});
 while(a.elapsed<3900)prior.stepMatch(a);const b=restoreMatch(prior.snapshotMatch(a));
 while(a.status==='playing')prior.stepMatch(a);while(b.status==='playing')stepMatch(b);
 assert.deepEqual(getResult(b),prior.getResult(a));assert.equal(snapshotMatch(b).version,6);
});
test('注册表生涯分段推进和JSON恢复保持财务、青训、成长一致',()=>{
 const a=career(),b=clone(a);advanceCareer(a,'0318-02-01');
 for(const date of ['0318-01-04','0318-01-12','0318-01-20','0318-02-01'])advanceCareer(b,date);
 assert.deepEqual(clone(a),b);validateSave(clone(a));assert.equal(a.population,undefined);
});

test('合同市场不能跳过皇家学院选秀直接取得青年所有权',()=>{const s=career();s.manager={clubId:'sky'};const id=Object.keys(s.playerRegistry.players).find(id=>s.playerRegistry.registrations[id].clubId==='sky');const before=JSON.stringify(s);assert.throws(()=>renewPlayer(s,id),/皇家学院/);assert.throws(()=>releasePlayer(s,id),/皇家学院/);assert.equal(JSON.stringify(s),before);});

test('旧worktree青年页面读取原人口名单，不建立另一套青训注册表',()=>{const s=createSeason({population:createPopulation()});s.manager={clubId:'sky'};const before=JSON.stringify(s),html=youthContent(s);assert.ok(html.includes(clubPlayers(s,'sky',{unit:'youth'})[0].name));assert.equal(s.playerRegistry,undefined);assert.equal(JSON.stringify(s),before);});

test('转会后退役档案归属最近俱乐部，读取不改写注册历史',()=>{const s=createSeason(),p=s.playerRegistry.players['youth:318:bridge:2'],reg=s.playerRegistry.registrations[p.id];reg.history.push({date:s.date,status:'senior',clubId:'iron-fc',ownerClubId:'iron-fc'},{date:s.date,status:'retired',clubId:null,ownerClubId:null});Object.assign(reg,{status:'retired',clubId:null,ownerClubId:null});const before=JSON.stringify(reg),view=populationPlayer(s,p.id);assert.equal(view.lastClub,'iron-fc');assert.equal(view.retired,true);assert.equal(JSON.stringify(reg),before);});

test('迁移旧档仍留青训的超龄球员时，不创建结束早于开始的合同',()=>{const s=createSeason({year:340}),p=s.playerRegistry.players['youth:340:bridge:2'];p.age=23;ensureEconomy(s);const c=s.economy.contracts[p.id];assert.equal(c.end,'0340-12-31');assert.ok(c.end>=c.start);validateSave(clone(s));});
