import {accrueEconomy,rolloverEconomy} from '../src/competitions/market.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {footballTeams} from '../src/football/data.js';
import {createSeason,seasonTeam,seasonPlayer,validateSave,commitResult,matchInput} from '../src/competitions/runtime.js';
import {createPopulation,populationPlayer,clubPlayers,promotePlayer,annualPopulation,validatePopulation,ensurePopulation,setPlayerClub} from '../src/competitions/population.js';
import {advanceDevelopment,createDevelopment,developedPlayer,setPlayerTraining} from '../src/competitions/development.js';
import {createMatch,stepMatch,getResult,DEFAULT_TACTICS} from '../src/football/engine.js';
import {selectLineup} from '../src/football/players.js';
const clone=x=>JSON.parse(JSON.stringify(x));
const nextYear=s=>{s.year++;s.date=`${String(s.year).padStart(4,'0')}-01-01`;accrueEconomy(s,s.date);const result=annualPopulation(s);rolloverEconomy(s);return result;};

test('新赛季有独立青训名单，确定性身份和号码不会覆盖原球员',()=>{
 const pop=createPopulation();assert.deepEqual(pop,createPopulation());validatePopulation(pop);
 for(const team of footballTeams){const s={population:pop},senior=clubPlayers(s,team.id),youth=clubPlayers(s,team.id,{unit:'youth'}),all=clubPlayers(s,team.id,{unit:'all'});assert.equal(senior.length,team.roster.length);assert.ok(youth.length>=4&&youth.length<=5);assert.equal(new Set(all.map(p=>p.number)).size,all.length);assert.ok(youth.every(p=>p.intakeYear===318&&318-p.birthYear>=15&&318-p.birthYear<=17));}
});
test('年度补员和退役只执行一次，JSON 恢复与连续结算一致',()=>{
 const s=createSeason(),p=Object.values(s.population.players).find(p=>p.unit==='senior');p.birthYear=319-p.retirementAge;
 const restored=clone(s),result=nextYear(s);assert.ok(result.intake>=268*4);assert.ok(result.retired>0);nextYear(restored);assert.deepEqual(restored.population,clone(s.population));
 assert.equal(populationPlayer(s,p.id).retired,true);assert.equal(populationPlayer(s,p.id).lastClub,footballTeams.find(t=>t.roster.some(q=>q.id===p.id)).id);
 assert.ok(!seasonTeam(s,p.lastClub).roster.some(q=>q.id===p.id));
 const saved=JSON.stringify(s.population);assert.deepEqual(annualPopulation(s),{intake:0,retired:0,promoted:0,released:0});assert.equal(JSON.stringify(s.population),saved);validatePopulation(s.population);
 s.year+=2;assert.throws(()=>annualPopulation(s),/跳过/);
});
test('提拔限制年龄、归属和比赛状态，升队后正式首发与成长分钟使用同一身份',()=>{
 const s=createSeason(),fixture=s.fixtures.find(m=>!m.bye),club=fixture.home;s.manager={clubId:club};
 const youths=clubPlayers(s,club,{unit:'youth'}),p=youths.find(p=>318-p.birthYear>=16);assert.ok(p);
 const outsider=clubPlayers(s,fixture.away,{unit:'youth'}).find(p=>318-p.birthYear>=16);assert.throws(()=>promotePlayer(s,outsider.id),/本队/);
 s.activeMatch={};assert.throws(()=>promotePlayer(s,p.id),/比赛结束/);s.activeMatch=null;
 const originalBirth=p.birthYear;p.birthYear=303;assert.throws(()=>promotePlayer(s,p.id),/16/);p.birthYear=originalBirth;
 setPlayerTraining(s,p.id,{focus:'balanced',load:.6});promotePlayer(s,p.id);assert.equal(clubPlayers(s,club,{unit:'youth'}).some(q=>q.id===p.id),false);assert.throws(()=>promotePlayer(s,p.id),/青年队/);
 const input=matchInput(s,fixture);assert.ok(input.home.roster.some(q=>q.id===p.id));
 const lineup=selectLineup(input.home);lineup[lineup.findIndex(slot=>slot.position!=='GK')].id=p.id;
 const match=createMatch({...input,homeLineup:lineup,homeTactics:DEFAULT_TACTICS,ai:[false,true]});while(stepMatch(match));const result=getResult(match);commitResult(s,fixture,input,result);
 assert.ok(s.development.records[p.id].minutes>0);assert.equal(s.development.records[p.id].appearances,1);s.playerState[p.id]={date:s.date,condition:64,injuryDays:3};assert.equal(seasonPlayer(s,p.id).condition,64);assert.equal(seasonPlayer(s,p.id).injuryDays,3);assert.ok(fixture.report.players[0].some(q=>q.id===p.id));validateSave(clone(s));
});
test('跨年新入队球员只累积加入后的训练天数，分段与恢复不改变成长',()=>{
 const s=createSeason();s.date='0318-12-30';s.development=createDevelopment(s.date);advanceDevelopment(s,'0319-01-01');nextYear(s);
 const p=clubPlayers(s,'sky',{unit:'youth'}).find(p=>p.intakeYear===319),retired=Object.values(s.population.players).find(p=>p.retired);const frozen=retired&&clone(developedPlayer(s,retired));
 const split=clone(s);advanceDevelopment(s,'0319-01-06');advanceDevelopment(split,'0319-01-03');advanceDevelopment(split,'0319-01-06');assert.deepEqual(split.development,s.development);
 assert.equal(s.development.records[p.id].history[0].date,'0319-01-06');assert.ok(s.development.records[p.id].attributes.passing!==p.attributes.passing);assert.equal(developedPlayer(s,p).age,319-p.birthYear);
 if(retired)assert.deepEqual(clone(developedPlayer(s,retired,'0320-01-01')),frozen);
 validateSave(clone(s));
});
test('旧档迁移保留原队员属性，损坏人员归属和年度记录不能读入',()=>{
 const s=createSeason();delete s.population;delete s.economy;const before=seasonTeam(s,'sky');validateSave(clone(s));ensurePopulation(s);assert.deepEqual(seasonTeam(s,'sky').roster.map(({id,attributes,age})=>({id,attributes,age})),before.roster.map(({id,attributes,age})=>({id,attributes,age})));
 for(const corrupt of [p=>p.players[Object.keys(p.players)[0]].club='missing',p=>p.processedYear=317,p=>p.events.push(p.events[0]),p=>p.players[Object.keys(p.players)[0]].unit='retired']){const damaged=clone(s);corrupt(damaged.population);assert.throws(()=>validateSave(damaged));}
});

test('名单索引随新增、升队和归属变化更新，恢复不依赖内存缓存',()=>{
 const s=createSeason(),p=clubPlayers(s,'sky')[0],before=clubPlayers(s,'silver-fc').length;
 setPlayerClub(s,p,'silver-fc');assert.ok(!clubPlayers(s,'sky').some(q=>q.id===p.id));assert.equal(clubPlayers(s,'silver-fc').length,before+1);
 setPlayerClub(s,p,'sky');setPlayerClub(s,p,'silver-fc');assert.equal(clubPlayers(s,'silver-fc').filter(q=>q.id===p.id).length,1);
 assert.deepEqual(clone(clubPlayers(s,'silver-fc')),clubPlayers(clone(s),'silver-fc'));nextYear(s);
 assert.ok(clubPlayers(s,'sky',{unit:'youth'}).some(q=>q.intakeYear===319));
});
