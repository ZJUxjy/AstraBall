import test from 'node:test';
import assert from 'node:assert/strict';
import {createSeason} from '../src/competitions/runtime.js';
import {appointManager} from '../src/competitions/career.js';
import {academyReport,setAcademyPlan,academyTrainingQuality,academyLineup,validateAcademies,prepareAcademyContext} from '../src/competitions/academy.js';
import {setYouthPath,youthWeekContext} from '../src/competitions/youth.js';
import {advanceDevelopment,createDevelopment} from '../src/competitions/development.js';
import {addDays} from '../src/competitions/calendar.js';
const own='youth:318:bridge:1',other='youth:318:bridge:2';
const setup=()=>{const s=createSeason();appointManager(s,'bridge');return s;};

test('重点名额限两名本队青年，离队立即释放名额，历史仍可校验',()=>{
 const s=setup();setAcademyPlan(s,{selection:'development',focusPlayers:[own,other]});
 assert.equal(academyReport(s).focusPlayers.length,2);
 assert.throws(()=>setAcademyPlan(s,{focusPlayers:[own,other,'youth:318:bridge:0']}),/最多两人/);
 assert.throws(()=>setAcademyPlan(s,{focusPlayers:['youth:318:sky:0']}),/本队/);
 setYouthPath(s,other,'promote');
 assert.deepEqual(academyReport(s).focusPlayers,[own]);assert.doesNotThrow(()=>validateAcademies(s));
 setAcademyPlan(s,{focusPlayers:[own,'youth:318:bridge:0']});assert.doesNotThrow(()=>validateAcademies(s));
});
test('重点培养次日生效，资源倍率不修改隐藏潜力',()=>{
 const s=setup(),p=s.playerRegistry.players[own],potential=p.potential,profile=structuredClone(p.growthProfile),base=academyTrainingQuality(s,p,'0318-01-02');
 s.date='0318-01-02';setAcademyPlan(s,{focusPlayers:[own]});
 assert.equal(academyTrainingQuality(s,p,s.date),base);
 assert.equal(academyTrainingQuality(s,p,'0318-01-03'),base*1.08);
 assert.equal(academyTrainingQuality(s,s.playerRegistry.players[other],'0318-01-03'),base*.98);
 assert.equal(p.potential,potential);assert.deepEqual(p.growthProfile,profile);
 s.activeMatch={};assert.throws(()=>setAcademyPlan(s,{selection:'competitive'}),/比赛结束/);
 const royal=createSeason();appointManager(royal,'sky');assert.equal(academyReport(royal).managed,false);assert.throws(()=>setAcademyPlan(royal,{}),/皇家学院/);
});
test('同位置青年竞争有限分钟，选人不读取潜力且受伤者不能抢占名额',()=>{
 const s=setup(),ids=['youth:318:bridge:0',own,other];
 for(const id of ids){const p=s.playerRegistry.players[id];p.position='GK';for(const key of Object.keys(p.attributes))p.attributes[key]=80;}
 setAcademyPlan(s,{selection:'competitive'});
 const a=academyLineup(s,'bridge','0318-02-02');
 assert.equal(a.totalMinutes,990);assert.equal(a.players.length,1);assert.equal(a.players[0].minutes,90);
 for(const id of ids)s.playerRegistry.players[id].potential=1;
 assert.deepEqual(academyLineup(s,'bridge','0318-02-02'),a);
 s.playerState[a.players[0].id]={date:'0318-02-01',condition:100,injuryDays:3};
 const injured=academyLineup(s,'bridge','0318-02-02');assert.equal(injured.players.length,1);assert.notEqual(injured.players[0].id,a.players[0].id);
});
test('轮换策略改变年轻球员机会，所有阵容每场分钟上限一致',()=>{
 const competitive=setup(),development=structuredClone(competitive);
 setAcademyPlan(competitive,{selection:'competitive'});setAcademyPlan(development,{selection:'development'});
 const totals=[];
 for(const s of [competitive,development]){
  let total=0;for(let date='0318-02-02';date<'0318-06-01';date=addDays(date,7)){const lineup=academyLineup(s,'bridge',date);assert.equal(lineup.totalMinutes,990);assert.ok(lineup.players.length<=16);total+=lineup.players.reduce((sum,p)=>sum+p.minutes,0);}
  totals.push(total);
 }
 assert.notEqual(totals[0],totals[1]);
});
test('青年比赛按日严格结算，整段、分段和存档续跑一致',()=>{
 const a=setup();a.date='0318-02-01';a.development=createDevelopment(a.date);setAcademyPlan(a,{selection:'development',focusPlayers:[own]});
 const b=structuredClone(a);advanceDevelopment(a,'0318-02-22');
 for(const date of ['0318-02-03','0318-02-05','0318-02-08','0318-02-12','0318-02-22'])advanceDevelopment(b,date);
 assert.deepEqual(a.development,b.development);assert.deepEqual(a.playerRegistry,b.playerRegistry);
 const s=setup(),p=s.playerRegistry.players[other];prepareAcademyContext(s,'0318-02-01','0318-02-09');
 const all=youthWeekContext(s,p,'0318-02-01','0318-02-09'),parts=[...youthWeekContext(s,p,'0318-02-01','0318-02-03').fixtures,...youthWeekContext(s,p,'0318-02-03','0318-02-09').fixtures];
 assert.deepEqual(parts,all.fixtures);
 s.date='0318-02-03';setYouthPath(s,other,'promote');assert.equal(youthWeekContext(s,p,'0318-02-03','0318-02-10').minutes,0);
});
test('青训安排拒绝损坏策略和跨队历史，旧存档默认可读',()=>{
 const s=setup();assert.doesNotThrow(()=>validateAcademies(s));setAcademyPlan(s,{focusPlayers:[own]});
 for(const patch of [{selection:'anything'},{focusPlayers:[own,own]},{focusPlayers:['missing']}]){const bad=structuredClone(s);Object.assign(bad.playerRegistry.academies.bridge.history[0],patch);assert.throws(()=>validateAcademies(bad),/青训安排/);}
});
