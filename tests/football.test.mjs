import test from 'node:test';import assert from 'node:assert/strict';
import {generatePlayer,generateTeam,selectLineup,ATTRIBUTE_KEYS,developWeek,publicProfile} from '../src/football/players.js';
import {createMatch,stepMatch,simulateMatch,getResult} from '../src/football/engine.js';
const home=generateTeam({id:'h',seed:12}),away=generateTeam({id:'a',seed:14});
const options={home,away,seed:318};
test('球员属性、身份、位置分布稳定，公开档案不泄露潜力和性格数值',()=>{const p=generatePlayer({id:'p'});assert.deepEqual(p,generatePlayer({id:'p'}));assert.equal(ATTRIBUTE_KEYS.length,42);for(const n of Object.values(p.attributes))assert.ok(n>=1&&n<=99);assert.equal(publicProfile(p).potential,undefined);assert.equal(publicProfile(p).personality,undefined);assert.equal(new Set(selectLineup(home).map(p=>p.id)).size,11);});
test('同种子完全一致，逐步执行、批量执行和不捕获事件比分统计一致',()=>{const input=JSON.stringify(options),a=simulateMatch(options),b=simulateMatch(options);assert.deepEqual(a,b);const s=createMatch(options);while(stepMatch(s));assert.deepEqual(getResult(s),a);const c=simulateMatch({...options,capture:false});assert.deepEqual(c.teams,a.teams);assert.equal(JSON.stringify(options),input);});
test('比分、射门、扑救、个人统计和出场时长守恒',()=>{for(let seed=0;seed<30;seed++){const r=simulateMatch({...options,seed});for(let side=0;side<2;side++){const t=r.teams[side],opp=r.teams[1-side];for(const k of ['goals','shots','onTarget','passes','completed'])assert.equal(t.players.reduce((s,p)=>s+p[k],0),t.stats[k]);assert.equal(t.players.reduce((s,p)=>s+p.saves,0),opp.stats.onTarget-opp.stats.goals);assert.ok(Math.abs(t.players.reduce((s,p)=>s+p.seconds,0)-t.stats.playerSeconds)<1e-6);assert.ok(t.stats.completed<=t.stats.passes);}assert.ok(r.events.every((e,i)=>i===0||e.seconds>=r.events[i-1].seconds));assert.equal(r.status,'finished');}});
test('非法名单拒绝，输入不被修改，生涯发展保持身份和属性边界',()=>{assert.throws(()=>createMatch({...options,away:home}));const injured=structuredClone(home);injured.roster.forEach(p=>p.injuryDays=7);assert.throws(()=>createMatch({...options,home:injured}));const p=generatePlayer({id:'y',age:18});let next=p;for(let i=0;i<104;i++)next=developWeek(next,{seed:i,minutes:90});assert.equal(next.id,p.id);assert.ok(Object.values(next.attributes).every(n=>n>=1&&n<=99));assert.deepEqual(p,generatePlayer({id:'y',age:18}));});

import {shotQuality,goalProbability} from '../src/football/shots.js';
test('射门距离、角度、受压与机会质量有正确方向，门将和终结影响转化而非 xG',()=>{
 assert.ok(shotQuality({x:94,y:34})>shotQuality({x:78,y:34}));assert.ok(shotQuality({x:88,y:34})>shotQuality({x:88,y:60}));assert.ok(shotQuality({pressure:.1})>shotQuality({pressure:.9}));assert.equal(shotQuality({kind:'penalty'}),.78);
 assert.ok(goalProbability(.12,90,65)>goalProbability(.12,40,65));assert.ok(goalProbability(.12,65,90)<goalProbability(.12,65,40));
});

test('战术生效：短传提高成功率与传球量，快节奏增加动作，阵型进入首发',()=>{
 const aggregate=tactics=>{let passes=0,completed=0,actions=0;for(let seed=100;seed<180;seed++){const r=simulateMatch({...options,seed,homeTactics:tactics,awayTactics:tactics,capture:false});for(const t of r.teams){passes+=t.stats.passes;completed+=t.stats.completed;actions+=t.stats.passes+t.stats.dribbles+t.stats.shots;}}return {passes,completion:completed/passes,actions};};
 const short=aggregate({passing:'short'}),direct=aggregate({passing:'direct'});assert.ok(short.completion>direct.completion+.03);assert.ok(short.passes>direct.passes);
 assert.ok(aggregate({tempo:'fast'}).actions>aggregate({tempo:'slow'}).actions);
 assert.equal(createMatch({...options,homeTactics:{formation:'3-5-2'}}).teams[0].slots.filter(s=>s.position==='CB').length,3);
});

import {applyCommand} from '../src/football/engine.js';
import {exertion} from '../src/football/fitness.js';
test('换人保留人数、累计区间分钟，禁止重返和超过次数；门将换人正确归账',()=>{
 const s=createMatch(options);while(s.elapsed<3600)stepMatch(s);const team=s.teams[0],old=team.slots.find(x=>x.position==='GK').id,sub=team.roster.find(p=>p.position==='GK'&&!team.used.has(p.id)).id;
 applyCommand(s,{type:'substitution',side:0,out:old,in:sub});const at=s.elapsed;assert.equal(team.slots.length,11);assert.throws(()=>applyCommand(s,{type:'substitution',side:0,out:sub,in:old}));while(stepMatch(s));
 assert.equal(team.lines[old].seconds,at);assert.ok(Math.abs(team.lines[sub].seconds-(s.elapsed-at))<1e-7);
 assert.ok(s.events.filter(e=>e.type==='shot'&&e.side===1&&e.seconds>at).every(e=>e.keeper===sub));
});
test('高压战术消耗更大，耐力有作用；即时指令不抽取随机数',()=>{
 const p=home.roster[12],low={pressing:'low',tempo:'normal'},high={pressing:'high',tempo:'normal'};
 assert.ok(exertion(p,high,90*60,'CM')>exertion(p,low,90*60,'CM'));
 const strong=structuredClone(p);strong.attributes.stamina=99;assert.ok(exertion(strong,high,90*60,'CM')<exertion(p,high,90*60,'CM'));
 const a=createMatch(options),b=createMatch(options);applyCommand(a,{type:'tactics',side:0,tactics:{pressing:'high'}});assert.equal(a.random.next(),b.random.next());
});

import {penaltyShootout} from '../src/football/rules.js';
import {rng} from '../src/football/random.js';
test('点球大战独立于比赛比分、每轮轮换，提前决胜正确',()=>{const s=createMatch(options),out=penaltyShootout(s.teams,rng(5));assert.notEqual(out.score[0],out.score[1]);assert.equal(s.teams[0].stats.goals,0);for(let side=0;side<2;side++){const kicks=out.kicks.filter(k=>k.side===side);assert.equal(new Set(kicks.slice(0,11).map(k=>k.player)).size,Math.min(11,kicks.length));}assert.ok(out.kicks.length>=6);});
test('淘汰赛完成常规、加时和点球；红牌不能通过换人补回',()=>{let redSeen=false,extraSeen=false;for(let seed=0;seed<150;seed++){
 const s=createMatch({...options,seed,knockout:true,capture:true});while(stepMatch(s));const r=getResult(s);assert.ok(r.score[0]!==r.score[1]||r.shootout||r.status==='abandoned');
 for(const e of r.events.filter(e=>e.type==='red')){redSeen=true;assert.ok(!s.teams[e.side].slots.some(p=>p.id===e.player));assert.ok(!r.events.some(n=>n.seconds>e.seconds&&['pass','shot','dribble'].includes(n.type)&&n.player===e.player));}
 if(s.period>2){extraSeen=true;assert.ok(r.seconds>=120*60);}
 }assert.ok(redSeen);assert.ok(extraSeen);});

test('五人/三次换人窗口限制和阵型重排不增加场上人数',()=>{const s=createMatch(options),t=s.teams[0];for(let i=0;i<3;i++){const out=t.slots.at(-1).id,into=t.roster.find(p=>!t.used.has(p.id)).id;applyCommand(s,{type:'substitution',side:0,out,in:into});stepMatch(s);}assert.equal(t.windows,3);assert.throws(()=>applyCommand(s,{type:'substitution',side:0,out:t.slots.at(-1).id,in:t.roster.find(p=>!t.used.has(p.id)).id}));applyCommand(s,{type:'tactics',side:0,tactics:{formation:'4-4-2'}});assert.equal(t.slots.length,11);assert.equal(new Set(t.slots.map(p=>p.id)).size,11);});
test('低于七人时中止，不补回红牌、不伪造比分；更换阵型保留减员',()=>{const s=createMatch(options);s.random.next=()=>0;let n=0;while(s.status==='playing'&&n++<15)stepMatch(s);assert.equal(s.status,'abandoned');assert.equal(s.teams[s.abandonedSide].slots.length,6);assert.deepEqual(s.teams.map(t=>t.stats.goals),[0,0]);});
test('同一窗口可换五人，换下的替补也只能累计实际在场时间',()=>{const s=createMatch(options),t=s.teams[0];for(let i=0;i<5;i++){applyCommand(s,{type:'substitution',side:0,out:t.slots.at(-1).id,in:t.roster.find(p=>!t.used.has(p.id)).id});}assert.equal(t.subs,5);assert.equal(t.windows,1);assert.throws(()=>applyCommand(s,{type:'substitution',side:0,out:t.slots.at(-1).id,in:t.roster.find(p=>!t.used.has(p.id)).id}));});
test('非有限属性、重复首发、错误阵型和非法战术都拒绝',()=>{const broken=structuredClone(home);broken.roster[0].attributes.reflexes=NaN;assert.throws(()=>createMatch({...options,home:broken}));const lineup=selectLineup(home);lineup[1].id=lineup[2].id;assert.throws(()=>createMatch({...options,homeLineup:lineup}));assert.throws(()=>createMatch({...options,homeTactics:{tempo:'impossible'}}));});

test('半场换人不占比赛中窗口，仍占五人名额',()=>{const s=createMatch(options);while(s.period===1)stepMatch(s);const t=s.teams[0],windows=t.windows;applyCommand(s,{type:'substitution',side:0,out:t.slots.at(-1).id,in:t.roster.find(p=>!t.used.has(p.id)).id});assert.equal(t.windows,windows);assert.ok(t.subs>=1);});
test('减员后改阵不会复活罚下球员，也不产生空首发',()=>{const s=createMatch(options);s.random.next=()=>0;stepMatch(s);const side=s.teams.findIndex(t=>t.stats.red),t=s.teams[side];assert.equal(t.slots.length,10);applyCommand(s,{type:'tactics',side,tactics:{formation:'3-5-2'}});assert.equal(t.slots.length,10);assert.ok(t.slots.every(p=>p?.id));assert.equal(t.slots.filter(p=>p.position==='GK').length,1);});

import {clubs} from '../src/world.js';
import {footballTeams,findFootballPlayer} from '../src/football/data.js';
test('世界球员连接竞技档案，全部球队名单可用且身份唯一',()=>{assert.equal(footballTeams.length,clubs.length);const all=footballTeams.flatMap(t=>t.roster);assert.equal(new Set(all.map(p=>p.id)).size,all.length);assert.equal(findFootballPlayer('lin').name,'林知远');assert.equal(findFootballPlayer('lin').city,'jiangqiao');assert.equal(findFootballPlayer('lin').number,8);assert.equal(findFootballPlayer('lin').attributes.passing,78);for(const t of footballTeams)assert.equal(selectLineup(t).length,11);});
test('实际游戏名单均可模拟，对局事件与个人进球一致',()=>{for(let i=0;i<footballTeams.length;i++){const r=simulateMatch({home:footballTeams[i],away:footballTeams[(i+1)%footballTeams.length],seed:2026+i});assert.equal(r.status,'finished');assert.equal(r.events.filter(e=>e.type==='shot'&&e.outcome==='goal').length,r.score[0]+r.score[1]);}});
