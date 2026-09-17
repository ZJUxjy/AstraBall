import test from 'node:test';
import assert from 'node:assert/strict';
import {createSeason,validateSave,seasonTeam} from '../src/competitions/runtime.js';
import {registeredPlayer} from '../src/competitions/registry.js';
import {advanceDevelopment,developedPlayer,developmentReport} from '../src/competitions/development.js';
import {generateYouthPlayer,developWeek,publicProfile} from '../src/football/players.js';
import {bodyAtAge} from '../src/football/body.js';

const id='youth:318:bridge:0';
test('新青年的当前体格随日历变化，分段推进和读档一致',()=>{
 const s=createSeason(),split=structuredClone(s),p=registeredPlayer(s,id),initial=developedPlayer(s,p);
 assert.ok(p.bodyProfile);assert.equal(publicProfile(initial).bodyProfile,undefined);
 advanceDevelopment(s,'0318-04-01');s.date='0318-04-01';
 advanceDevelopment(split,'0318-02-12');split.date='0318-02-12';
 advanceDevelopment(split,'0318-04-01');split.date='0318-04-01';
 const current=developedPlayer(s,p);assert.ok(current.height>initial.height);assert.ok(current.weight>initial.weight);
 assert.deepEqual(s.development,split.development);assert.deepEqual(s.playerRegistry,split.playerRegistry);
 assert.deepEqual(developedPlayer(validateSave(JSON.parse(JSON.stringify(s))),p),current);
 const report=developmentReport(s,current);assert.equal(report.body.height,current.height);assert.equal(report.body.heightChange,current.height-initial.height);
 const before=JSON.stringify(s);advanceDevelopment(s,s.date);assert.equal(JSON.stringify(s),before);
 assert.ok(s.development.records[id].history.at(-1).height>initial.height);
});

test('旧青年从保存日体格平滑接入，原有成年人不改写',()=>{
 const s=createSeason();advanceDevelopment(s,'0318-07-01');s.date='0318-07-01';
 const p=s.playerRegistry.players[id];delete p.bodyProfile;p.height=181;p.weight=72;
 const originalAdult=seasonTeam(s,'bridge').roster[0];
 const migrated=validateSave(JSON.parse(JSON.stringify(s))),current=developedPlayer(migrated,registeredPlayer(migrated,id));
 assert.equal(current.height,181);assert.equal(current.weight,72);
 assert.equal(developmentReport(migrated,current).body.heightChange,0);
 assert.deepEqual(validateSave(structuredClone(migrated)),migrated);
 advanceDevelopment(migrated,'0318-08-01');migrated.date='0318-08-01';
 const later=developedPlayer(migrated,registeredPlayer(migrated,id));assert.ok(later.height>181);assert.ok(later.weight>72);
 assert.equal(seasonTeam(migrated,'bridge').roster[0].height,originalAdult.height);
 assert.equal(seasonTeam(migrated,'bridge').roster[0].weight,originalAdult.weight);
});

test('跨年归零当季体格增量，保留上年观测而不暴露成年目标',()=>{
 const s=createSeason();advanceDevelopment(s,'0319-01-01');s.date='0319-01-01';
 const p=registeredPlayer(s,id),current=developedPlayer(s,p),report=developmentReport(s,current);
 assert.equal(report.body.heightChange,0);assert.equal(report.body.weightChange,0);
 assert.equal(report.annual.at(-1).height,current.height);
 assert.equal(report.annual.at(-1).weight,current.weight);
 assert.ok(report.history.every(point=>!('bodyProfile' in point)));
});

test('独立周成长同步体格，属性发展不依赖体格目标',()=>{
 const p=generateYouthPlayer({id:'body-week',age:16}),legacy=structuredClone(p);delete legacy.bodyProfile;
 const next=developWeek(p,{minutes:60}),withoutBody=developWeek(legacy,{minutes:60});
 assert.deepEqual({height:next.height,weight:next.weight},bodyAtAge(p,next.developmentAge));
 assert.ok(next.height>p.height);assert.deepEqual(next.attributes,withoutBody.attributes);assert.equal(next.potential,withoutBody.potential);
});

test('损坏的身体档案和历史在模拟前被拒绝',()=>{
 const s=createSeason();advanceDevelopment(s,'0318-01-08');s.date='0318-01-08';
 for(const value of [null,{}, {version:99}]){
  const broken=structuredClone(s);broken.playerRegistry.players[id].bodyProfile=value;
  assert.throws(()=>validateSave(broken),/身体/);
 }
 const broken=structuredClone(s);broken.development.records[id].history[0].height=NaN;
 assert.throws(()=>validateSave(broken),/身体/);
});
