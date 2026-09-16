import test from 'node:test';
import assert from 'node:assert/strict';
import {generateTeam} from '../src/football/players.js';
import {createMatch,simulateMatch} from '../src/football/engine.js';
import {passOptions,routeModifier,offsideLine} from '../src/football/passing.js';
import {laneRisk} from '../src/football/spatial.js';
const input={home:generateTeam({id:'a'}),away:generateTeam({id:'b'}),seed:23981};
test('传球落点对应接应者站位或可达前插，距离与事件坐标一致',()=>{
 const result=simulateMatch(input),passes=result.events.filter(e=>e.type==='pass');assert.ok(passes.length>100);
 for(const e of passes){const target=e.side?[105-e.to[0],68-e.to[1]]:e.to;
  assert.ok(Math.hypot(target[0]-e.receiverStart[0],target[1]-e.receiverStart[1])<=8.000001);
  assert.ok(Math.abs(Math.hypot(e.to[0]-e.from[0],e.to[1]-e.from[1])-e.passLength)<1e-8);
 }
});
test('防守者封堵线路增加风险，落点空当和距离参与成功率',()=>{
 const s=createMatch(input);for(const slot of s.teams[1].slots)s.teams[1].lines[slot.id].position=[10,5];
 const clear=laneRisk(s,0,[30,34],[70,34]);s.teams[1].lines[s.teams[1].slots[2].id].position=[55,34];
 assert.ok(laneRisk(s,0,[30,34],[70,34])>clear+.3);
 assert.ok(routeModifier({openness:1,laneRisk:.1,length:10})>routeModifier({openness:0,laneRisk:1,length:50}));
});
test('越位使用出球时接应者和倒数第二名防守者位置，门将不固定为最后一人',()=>{
 const s=createMatch(input);s.side=0;s.x=60;s.y=34;
 const d=s.teams[1];d.slots.forEach((slot,i)=>d.lines[slot.id].position=[i===0?40:i===1?10:30,34]);assert.equal(offsideLine(s,0),75);
 const receiver=s.teams[0].slots[10];s.teams[0].lines[receiver.id].position=[80,34];const actor=s.teams[0].roster.find(p=>p.id===s.teams[0].slots[6].id);
 assert.equal(passOptions(s,actor).find(p=>p.player.id===receiver.id).offside,true);
 s.teams[0].lines[receiver.id].position=[74,34];assert.equal(passOptions(s,actor,{through:true}).find(p=>p.player.id===receiver.id).offside,false);
});
