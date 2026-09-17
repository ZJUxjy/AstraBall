import test from 'node:test';
import assert from 'node:assert/strict';
import {createSeason,seasonTeam,matchInput,validateSave,playFixture} from '../src/competitions/runtime.js';
import {appointManager} from '../src/competitions/career.js';
import {advanceDevelopment,developedPlayer,createDevelopment,recordDevelopmentMatch,ageOnDate,setPlayerTraining} from '../src/competitions/development.js';
import {registeredPlayer,registeredRoster} from '../src/competitions/registry.js';
import {setYouthPath,youthOpportunities} from '../src/competitions/youth.js';
import {createMatch} from '../src/football/engine.js';
import {available} from '../src/football/players.js';
const clone=structuredClone;

test('新青训进入持久化成长表，生日参考不随赛季重置',()=>{
 const s=createSeason(),id='youth:318:bridge:1',p=registeredPlayer(s,id);
 assert.equal(ageOnDate(p,'0319-01-01'),17);
 advanceDevelopment(s,'0318-02-15');s.date='0318-02-15';
 assert.ok(s.development.records[id].youthMinutes>0);
 assert.equal(s.development.records[id].minutes,0);
 assert.notDeepEqual(developedPlayer(s,p).attributes,p.attributes);
 const restored=validateSave(JSON.parse(JSON.stringify(s)));
 assert.deepEqual(restored,s);
 const before=JSON.stringify(s);advanceDevelopment(s,s.date);assert.equal(JSON.stringify(s),before);
});

test('青年比赛按比赛日判断伤停，分段与整段推进相同',()=>{
 const original=createSeason(),id='youth:318:sky:0';
 original.date='0318-02-01';original.development=createDevelopment(original.date);
 original.playerState[id]={date:original.date,condition:100,injuryDays:3};
 const split=clone(original);
 advanceDevelopment(original,'0318-02-08');
 advanceDevelopment(split,'0318-02-04');advanceDevelopment(split,'0318-02-08');
 assert.deepEqual(original.development,split.development);
 assert.deepEqual(original.playerRegistry,split.playerRegistry);
 assert.equal(original.development.records[id].youthMinutes||0,0);
});

test('外租改变真实比赛阵容，正式出场只记一次且不再模拟青年分钟',()=>{
 const s=createSeason();appointManager(s,'bridge');const id='youth:318:bridge:2';
 const destination=youthOpportunities(s,id).loans[0].id;
 setYouthPath(s,id,'loan',{clubId:destination});
 assert.ok(registeredRoster(s,destination).some(p=>p.id===id));
 assert.ok(!seasonTeam(s,'bridge').roster.some(p=>p.id===id));
 advanceDevelopment(s,'0318-02-15');s.date='0318-02-15';
 assert.equal(s.development.records[id].youthMinutes||0,0);
 const fixture=s.fixtures.find(m=>m.home===destination||m.away===destination),input=matchInput(s,fixture);
 const side=input.home.id===destination?0:1;
 const roster=(side?input.away:input.home).roster;
 assert.ok(roster.some(p=>p.id===id));assert.doesNotThrow(()=>createMatch(input));
 recordDevelopmentMatch(s,input,{seconds:5400,teams:[{players:side===0?[{id,minutes:90}]:[]},{players:side===1?[{id,minutes:90}]:[]}]},s.date);
 assert.equal(s.development.records[id].minutes,90);
 assert.equal(s.development.records[id].appearances,1);
 assert.deepEqual(validateSave(JSON.parse(JSON.stringify(s))).playerRegistry,s.playerRegistry);
});

test('旧存档在保存日期接入新青训，不追补此前训练',()=>{
 const old=createSeason();delete old.playerRegistry;old.date='0318-07-01';old.development=createDevelopment(old.date);
 const s=validateSave(old),id='youth:318:bridge:1',p=registeredPlayer(s,id);
 assert.equal(p.ageReferenceDate,s.date);assert.equal(p.age,16);
 advanceDevelopment(s,s.date);assert.equal(s.development.records[id],undefined);
 advanceDevelopment(s,'0318-07-08');assert.ok(s.development.records[id]);
 assert.ok(ageOnDate(p,'0318-07-08')>=16&&ageOnDate(p,'0318-07-08')<16.1);
});

test('失败比赛不留下青训进度，皇家学院未签约者不能由职业队训练',()=>{
 const s=createSeason(),fixture=s.fixtures.find(m=>!m.bye),before=JSON.stringify(s);
 assert.throws(()=>playFixture(s,fixture.id,()=>({status:'abandoned'})));
 assert.equal(JSON.stringify(s),before);
 appointManager(s,'sky');
 assert.throws(()=>setPlayerTraining(s,'youth:318:sky:0',{focus:'physical',load:.6}),/学院/);
});

test('损坏的成长基础状态和青年计数在继续模拟前拒绝',()=>{
 const s=createSeason();advanceDevelopment(s,'0318-01-08');s.date='0318-01-08';
 for(const field of ['sharpness','seasonRating','startRating','seasonYear']){
  const broken=clone(s);delete broken.development.records['youth:318:bridge:1'][field];
  assert.throws(()=>validateSave(broken),/成长/);
 }
 const broken=clone(s);broken.development.records['youth:318:bridge:1'].youthMinutes=-1;
 assert.throws(()=>validateSave(broken),/青年比赛/);
});

test('当天踢过青年赛后提拔，不能再次参加成年比赛',()=>{
 const s=createSeason();appointManager(s,'bridge');const id='youth:318:bridge:2';
 advanceDevelopment(s,'0318-03-02');s.date='0318-03-02';
 assert.equal(s.development.records[id].lastYouthMatchDate,s.date);
 setYouthPath(s,id,'promote');
 const p=seasonTeam(s,'bridge').roster.find(p=>p.id===id);
 assert.equal(p.playedToday,true);assert.equal(available(p),false);
 s.date='0318-03-03';assert.equal(seasonTeam(s,'bridge').roster.find(p=>p.id===id).playedToday,false);
});
