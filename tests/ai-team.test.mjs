import * as mainV6 from '../src/football/legacy/main-v6/engine.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generateTeam,ATTRIBUTE_KEYS,selectLineup} from '../src/football/players.js';
import {planAITeam,evaluateOpportunity,selectAISubstitutions,aiRoleScore} from '../src/football/ai-team.js';
import {createMatch,stepMatch,getResult,snapshotMatch,restoreMatch,DEFAULT_TACTICS} from '../src/football/engine.js';
import {createSeason,matchInput} from '../src/competitions/runtime.js';
import {appointManager,beginCoachedMatch} from '../src/competitions/career.js';
const uniform=(id,quality=70)=>{const t=generateTeam({id});for(const p of t.roster){p.attributes=Object.fromEntries(ATTRIBUTE_KEYS.map(key=>[key,quality]));p.personality.injuryProneness=0;}return t;};

test('真实330快照中84.467分零分钟前腰在4231获得本职首发',()=>{
 const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/ai-role-team-330.json',import.meta.url))),before=JSON.stringify(fixture.team),plan=planAITeam(fixture.team,{rotation:false});
 assert.equal(fixture.previousMinutes,0);assert.equal(plan.formation,'4-2-3-1');assert.ok(plan.lineup.some(slot=>slot.id===fixture.trackedPlayer&&slot.position==='AM'));
 assert.equal(plan.opportunities[fixture.trackedPlayer].starter,true);assert.ok(Object.values(plan.opportunities).reduce((sum,row)=>sum+row.expectedMinutes,0)<=990+1e-9);assert.equal(JSON.stringify(fixture.team),before);
 const hidden=structuredClone(fixture.team);for(const p of hidden.roster){p.potential=1;p.personality={adaptability:1};p.growthProfile={ceilings:Object.fromEntries(ATTRIBUTE_KEYS.map(key=>[key,1]))};}
 assert.deepEqual(planAITeam(hidden,{rotation:false}),plan);
});
test('连续两场满场且体能下降时强制轮换，比赛状态进入选人',()=>{
 const team=uniform('forced-rest',88),star=team.roster.find(p=>p.id==='forced-rest-13'),backup=team.roster.find(p=>p.id==='forced-rest-14');
 for(const [p,value] of [[star,95],[backup,76]]){p.attributes=Object.fromEntries(ATTRIBUTE_KEYS.map(key=>[key,value]));p.secondary=[];p.sharpness=80;}
 star.condition=70;backup.condition=95;
 const options={date:'0318-03-09',formation:'4-2-3-1',records:{[star.id]:{recentExposure:[{date:'0318-03-06',minutes:90,kind:'senior'},{date:'0318-03-03',minutes:90,kind:'senior'}]}}};
 assert.ok(!planAITeam(team,options).lineup.some(slot=>slot.id===star.id));
 assert.ok(planAITeam(team,options).lineup.length===11);
 star.sharpness=20;backup.sharpness=90;star.condition=100;
 const fresh={date:'0318-03-09',formation:'4-2-3-1',rotation:false};
 assert.ok(aiRoleScore(backup,'AM')>aiRoleScore({...backup,sharpness:20},'AM'));
});
test('顶级联赛有可用U21时首发至少一人',()=>{
 const team=uniform('u21',80);
 for(const p of team.roster)p.age=28;
 const youth=team.roster.find(p=>p.position==='AM');youth.age=19;youth.attributes=Object.fromEntries(ATTRIBUTE_KEYS.map(key=>[key,68]));
 const plan=planAITeam(team,{formation:'4-2-3-1',rotation:false,requireUnder21:true,date:'0318-03-08'});
 assert.ok(plan.lineup.some(slot=>team.roster.find(p=>p.id===slot.id).age<21));
});
test('连续出场只在能力接近时轮换，明显更强球员不会随机失去首发',()=>{
 const team=uniform('rotation',88),star=team.roster.find(p=>p.id==='rotation-13'),backup=team.roster.find(p=>p.id==='rotation-14'),third=team.roster.find(p=>p.id==='rotation-15');
 for(const [p,value] of [[star,78],[backup,76.5],[third,50]]){p.attributes=Object.fromEntries(ATTRIBUTE_KEYS.map(key=>[key,value]));p.secondary=[];}
 const options={date:'0318-03-09',formation:'4-2-3-1',records:{[star.id]:{recentExposure:[{date:'0318-03-06',minutes:90},{date:'0318-03-03',minutes:90}]}}};
 assert.ok(planAITeam(team,{...options,rotation:false}).lineup.some(slot=>slot.id===star.id));
 assert.ok(!planAITeam(team,options).lineup.some(slot=>slot.id===star.id));assert.ok(planAITeam(team,options).lineup.some(slot=>slot.id===backup.id));
 star.attributes=Object.fromEntries(ATTRIBUTE_KEYS.map(key=>[key,95]));assert.ok(planAITeam(team,options).lineup.some(slot=>slot.id===star.id));
 backup.injuryDays=5;assert.ok(!planAITeam(team,options).lineup.some(slot=>slot.id===backup.id));
});
test('机会评估复用实际角色方案，不因候选PA或调用顺序改变，弱替补不承诺分钟',()=>{
 const team=uniform('opportunity',80),candidate=structuredClone(team.roster.find(p=>p.position==='AM'));candidate.id='candidate';candidate.attributes=Object.fromEntries(ATTRIBUTE_KEYS.map(key=>[key,87]));
 const before=JSON.stringify(team),a=evaluateOpportunity(team,candidate);assert.equal(a.starter,true);assert.equal(a.position,'AM');assert.equal(a.expectedMinutes,75);
 candidate.potential=1;assert.deepEqual(evaluateOpportunity(team,candidate),a);
 candidate.attributes=Object.fromEntries(ATTRIBUTE_KEYS.map(key=>[key,45]));assert.equal(evaluateOpportunity(team,candidate).expectedMinutes,0);assert.equal(JSON.stringify(team),before);
});
test('AI常规换人补充相近实力的新鲜球员，不换健康门将、不超5人3窗口',()=>{
 const state=createMatch({home:uniform('auto-home'),away:uniform('auto-away'),seed:44,homeAI:true,awayAI:true});
 const keepers=state.teams.map(team=>team.slots.find(slot=>slot.position==='GK').id);
 while(state.status==='playing')stepMatch(state);
 assert.equal(state.status,'finished');
 for(let side=0;side<2;side++){
  const team=state.teams[side],changes=state.events.filter(e=>e.type==='substitution'&&e.side===side);
  assert.ok(changes.length>=2);assert.ok(team.subs<=5);assert.ok(team.windows<=3);
  assert.ok(changes.filter(e=>!state.events.some(i=>i.type==='injury'&&i.player===e.player)).every(e=>e.minute>=55&&e.player!==keepers[side]));
  assert.equal(new Set(changes.map(e=>e.incoming)).size,changes.length);
  assert.equal(team.slots.length,11-team.stats.red);
 }
});
test('换人评估没有随机数，弱替补与受伤替补不会被常规换上',()=>{
 const state=createMatch({home:uniform('sub-home'),away:uniform('sub-away'),seed:8,homeAI:true}),team=state.teams[0],random=state.random.snapshot();
 for(const slot of team.slots)team.lines[slot.id].condition=75;
 const changes=selectAISubstitutions(team,{minute:65});assert.ok(changes.length>0);assert.equal(state.random.snapshot(),random);
 for(const p of team.roster.filter(p=>!team.used.has(p.id)))p.attributes=Object.fromEntries(ATTRIBUTE_KEYS.map(key=>[key,35]));
 assert.deepEqual(selectAISubstitutions(team,{minute:65}),[]);
 for(const p of team.roster.filter(p=>!team.used.has(p.id))){p.attributes=Object.fromEntries(ATTRIBUTE_KEYS.map(key=>[key,99]));p.injuryDays=1;}
 assert.deepEqual(selectAISubstitutions(team,{minute:65}),[]);
});
test('AI常规换人与角色首发在中途存档后逐事件一致',()=>{
 const state=createMatch({home:uniform('save-home'),away:uniform('save-away'),seed:19,homeAI:true,awayAI:true});
 while(state.elapsed<4000)stepMatch(state);assert.ok(state.teams.some(team=>team.coach?.subReviews.length>0));const restored=restoreMatch(snapshotMatch(state));
 while(state.status==='playing')stepMatch(state);while(restored.status==='playing')stepMatch(restored);
 assert.deepEqual(getResult(restored),getResult(state));
});
test('正式比赛默认由AI选角色，经理指定阵型首发与常规换人权不被覆盖',()=>{
 const s=createSeason();appointManager(s,'bridge');const fixture=s.fixtures.find(f=>!f.bye&&(f.home==='bridge'||f.away==='bridge'));s.date=fixture.date;
 const input=matchInput(s,fixture),side=input.home.id==='bridge'?0:1,team=side?input.away:input.home,tactics={...DEFAULT_TACTICS,formation:'4-4-2'},lineup=selectLineup(team,tactics.formation);
 assert.equal(input.homeAI,true);assert.equal(input.awayAI,true);
 const match=beginCoachedMatch(s,{fixtureId:fixture.id,tactics,lineup});assert.deepEqual(match.teams[side].slots.map(({id,position})=>({id,position})),lineup);assert.equal(match.teams[side].tactics.formation,'4-4-2');assert.equal(match.teams[side].coach,null);assert.ok(match.teams[1-side].coach);
 while(match.status==='playing')stepMatch(match);assert.equal(match.teams[side].coach,null);assert.equal(match.teams[1-side].coach.subReviews.length,3);
});


test('AI换人存档拒绝损坏字段，旧存档缺失字段继续保持手动控制',()=>{
 const state=mainV6.createMatch({home:uniform('legacy-home'),away:uniform('legacy-away'),seed:36});
 while(state.elapsed<3000)mainV6.stepMatch(state);const saved=mainV6.snapshotMatch(state);
 for(const [field,values] of [['aiManaged',['true',1,null]],['aiReviews',[-1,.5,4,'0',null]]])for(const value of values){
  const invalid=structuredClone(saved);invalid.teams[0][field]=value;assert.throws(()=>restoreMatch(invalid),/AI换人存档/);
 }
 for(const team of saved.teams){delete team.aiManaged;delete team.aiReviews;}
 const restored=restoreMatch(saved);while(state.status==='playing')mainV6.stepMatch(state);while(restored.status==='playing')mainV6.stepMatch(restored);
 assert.deepEqual(mainV6.getResult(restored),mainV6.getResult(state));
});
