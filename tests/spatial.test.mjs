import test from 'node:test';
import assert from 'node:assert/strict';
import {generateTeam} from '../src/football/players.js';
import {createMatch,stepMatch,snapshotMatch,restoreMatch,getResult,applyCommand} from '../src/football/engine.js';
import {updateSpace,coverage,localPressure,toAbsolute} from '../src/football/spatial.js';
const make=(tactics={})=>createMatch({home:generateTeam({id:'a'}),away:generateTeam({id:'b'}),homeTactics:tactics,seed:7481});
test('全员事件位置有界、主客坐标可逆，完整快照恢复一致',()=>{
 const s=make();for(let i=0;i<180;i++)stepMatch(s);
 for(const t of s.teams)for(const slot of t.slots){const xy=t.lines[slot.id].position;assert.ok(xy[0]>=0&&xy[0]<=105&&xy[1]>=0&&xy[1]<=68);assert.ok(toAbsolute(1,toAbsolute(1,xy)).every((v,i)=>Math.abs(v-xy[i])<1e-12));}
 const restored=restoreMatch(JSON.parse(JSON.stringify(snapshotMatch(s))));
 while(stepMatch(s));while(stepMatch(restored));assert.deepEqual(getResult(s),getResult(restored));
});
test('宽度和防线改变真实站位，红牌空缺不重排其余锚点',()=>{
 const narrow=make({width:'narrow',line:'deep'}),wide=make({width:'wide',line:'high'});
 for(const s of [narrow,wide]){s.side=1;s.x=50;s.y=34;for(let i=0;i<15;i++)updateSpace(s,5);}
 const span=s=>{const ys=s.teams[0].slots.map(p=>s.teams[0].lines[p.id].position[1]);return Math.max(...ys)-Math.min(...ys);};
 assert.ok(span(wide)>span(narrow)+10);
 const x=s=>s.teams[0].lines[s.teams[0].slots[2].id].position[0];assert.ok(x(wide)>x(narrow)+8);
 const t=wide.teams[0],kept=t.slots[3],anchor=kept.anchorIndex;t.slots.splice(2,1);updateSpace(wide,5);assert.equal(kept.anchorIndex,anchor);assert.equal(coverage(t,[50,34]).length,9);
});
test('局部防守人数和体能影响压力；换人继承场上位置，改阵锚点唯一',()=>{
 const s=make(),t=s.teams[1];for(const slot of t.slots)t.lines[slot.id].position=[40,34];
 const initial=localPressure(s,0,[65,34]);t.slots=t.slots.slice(0,7);assert.ok(localPressure(s,0,[65,34])<initial);
 for(const slot of t.slots)t.lines[slot.id].position=[48,34];const fit=localPressure(s,0,[65,34]);for(const line of Object.values(t.lines))line.condition=30;assert.ok(localPressure(s,0,[65,34])<fit);
 const home=s.teams[0],out=home.slots[4],position=home.lines[out.id].position,into=home.roster.find(p=>!home.used.has(p.id));
 applyCommand(s,{type:'substitution',side:0,out:out.id,in:into.id});assert.deepEqual(home.lines[into.id].position,position);
 applyCommand(s,{type:'tactics',side:0,tactics:{formation:'3-5-2'}});assert.equal(new Set(home.slots.map(p=>p.anchorIndex)).size,11);
});
test('高防线前的接应者等待合法出球位置，低位防守保持近身覆盖',()=>{
 const s=make();s.side=0;s.x=60;s.y=34;s.teams[1].tactics.line='high';
 for(let i=0;i<30;i++)updateSpace(s,5);
 const second=s.teams[1].slots.map(slot=>105-s.teams[1].lines[slot.id].position[0]).sort((a,b)=>b-a)[1];
 for(const slot of s.teams[0].slots.filter(slot=>['ST','LW','RW'].includes(slot.position)))assert.ok(s.teams[0].lines[slot.id].position[0]<=Math.max(s.x,second)+1);
 s.x=90;s.teams[1].tactics.line='deep';for(let i=0;i<30;i++)updateSpace(s,5);
 const defenders=s.teams[1].slots.filter(slot=>slot.position==='CB').map(slot=>s.teams[1].lines[slot.id].position);
 assert.ok(defenders.every(xy=>xy[0]>8&&xy[0]<18));assert.ok(localPressure(s,0,[90,34])>.6);
});
