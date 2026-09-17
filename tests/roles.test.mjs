import test from 'node:test';
import assert from 'node:assert/strict';
import {generatePlayer,generateTeam} from '../src/football/players.js';
import {roleFamiliarity,positionalAttribute} from '../src/football/roles.js';
import {createMatch,simulateMatch} from '../src/football/engine.js';
import {updateSpace,coverage} from '../src/football/spatial.js';
test('错位分别影响进攻与防守位置感，有球技术保持原属性',()=>{
 const winger=generatePlayer({id:'wing',position:'LW'}),f=roleFamiliarity(winger,'LB');assert.ok(f.defense<f.attack);assert.ok(f.attack>.9);
 assert.equal(positionalAttribute(winger,'LB','passing'),winger.attributes.passing);assert.equal(positionalAttribute(winger,'LB','dribbling'),winger.attributes.dribbling);
 const cb=generatePlayer({id:'cb',position:'CB'}),striker=roleFamiliarity(cb,'ST');assert.ok(striker.attack<striker.defense);assert.deepEqual(roleFamiliarity(cb,'CB'),{attack:1,defense:1});
});
test('边后卫套上与中锋回撤改变进攻站位，错位收缩防守覆盖',()=>{
 const make=t=>createMatch({home:generateTeam({id:'a'}),away:generateTeam({id:'b'}),homeTactics:t,seed:2});
 const hold=make({fullbacks:'hold',striker:'link'}),run=make({fullbacks:'overlap',striker:'run'});
 for(const s of [hold,run]){s.side=0;s.x=80;s.y=34;for(let i=0;i<20;i++)updateSpace(s,5);}
 const x=(s,i)=>s.teams[0].lines[s.teams[0].slots[i].id].position[0];assert.ok(x(run,1)>x(hold,1)+15);assert.ok(x(run,9)>x(hold,9)+4);
 const t=run.teams[0],slot=t.slots[2],p=t.roster.find(p=>p.id===slot.id),point=t.lines[p.id].position.map((v,i)=>v+(i?0:8));const before=coverage(t,point).find(c=>c.id===p.id).influence;p.position='ST';p.secondary=[];assert.ok(coverage(t,point).find(c=>c.id===p.id).influence<before);
});
test('进攻侧重真实改变传球目标分布，左右方向使用本队坐标',()=>{
 const home=generateTeam({id:'a'}),away=generateTeam({id:'b'});let left=0,right=0;
 for(let seed=0;seed<20;seed++){
  for(const focus of ['left','right']){const r=simulateMatch({home,away,homeTactics:{focus},seed:34000+seed});const passes=r.events.filter(e=>e.type==='pass'&&e.side===0);const share=passes.filter(e=>e.to[1]<28).length/passes.length;if(focus==='left')left+=share;else right+=share;}
 }
 assert.ok(left/20>right/20+.12,`${left/20} vs ${right/20}`);
});
