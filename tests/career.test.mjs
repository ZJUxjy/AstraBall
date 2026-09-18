import test from 'node:test';
import assert from 'node:assert/strict';
import {createSeason,pendingMatches,playFixture,tableFor,followingSeason,finishDate,validateSave,fixtureSides} from '../src/competitions/runtime.js';
import {appointManager,isManagedFixture,coachPreview,beginCoachedMatch,updateCoachedMatch,savePreparation,seasonGoal} from '../src/competitions/career.js';
import {createMatch,stepMatch,applyCommand,getResult,snapshotMatch,restoreMatch,DEFAULT_TACTICS} from '../src/football/engine.js';
import {footballTeams} from '../src/football/data.js';
const fake=input=>({status:'finished',score:input.knockout?[1,0]:[0,0],teams:[input.home,input.away].map(t=>({id:t.id,stats:{yellow:0,red:0},players:[]})),events:[],seconds:5400});
const roundTrip=value=>JSON.parse(JSON.stringify(value));
function toMatch(s){for(const m of pendingMatches(s)){if(isManagedFixture(s,m)){s.date=m.date;return m;}playFixture(s,m.id,fake);}return null;}
function update(s,options){return updateCoachedMatch(s,{fixtureId:s.activeMatch.fixtureId,serial:s.activeMatch.serial,...options});}

test('执教俱乐部、默认目标与旧存档兼容，禁止重复任职',()=>{
 const s=createSeason();delete s.manager;delete s.activeMatch;validateSave(s);
 assert.throws(()=>appointManager(s,'missing'));
 appointManager(s,'sky');assert.equal(s.manager.goal.year,318);assert.equal(s.manager.goal.division,'closed');
 assert.throws(()=>appointManager(s,'silver-fc'),/已经/);
 assert.equal(validateSave(roundTrip(s)).manager.clubId,'sky');
 assert.throws(()=>validateSave({...s,manager:{clubId:'missing'}}));
 assert.throws(()=>coachPreview(s),/下一场/);
});
test('比赛中途保存随机游标、换人资格和战术，恢复后逐事件结果一致',()=>{
 const state=createMatch({home:footballTeams[0],away:footballTeams[1],seed:741});
 for(let i=0;i<120;i++)stepMatch(state);
 const t=state.teams[0],incoming=t.roster.find(p=>!t.used.has(p.id));
 applyCommand(state,{type:'substitution',side:0,out:t.slots.at(-1).id,in:incoming.id});
 applyCommand(state,{type:'tactics',side:0,tactics:{mentality:'attacking'}});
 const restored=restoreMatch(roundTrip(snapshotMatch(state)));
 assert.deepEqual(restored.teams[0].used,state.teams[0].used);
 while(state.status==='playing')stepMatch(state);
 while(restored.status==='playing')stepMatch(restored);
 assert.deepEqual(getResult(restored),getResult(state));
});
test('主客场正式执教只可指挥本队，过期页面、跳赛与重复赛果被拒绝',()=>{
 for(const desiredSide of [0,1]){
  const s=createSeason(),first=pendingMatches(s)[0],id=desiredSide?first.away:first.home;
  appointManager(s,id);const m=toMatch(s),preview=coachPreview(s);
  assert.equal(preview.side,desiredSide);assert.throws(()=>playFixture(s,m.id,fake),/执教/);
  assert.throws(()=>beginCoachedMatch(s,{fixtureId:'stale'}),/更新/);
  beginCoachedMatch(s);assert.throws(()=>beginCoachedMatch(s),/正在进行/);
  assert.throws(()=>update(s,{command:{type:'tactics',side:1-desiredSide,tactics:{tempo:'fast'}}}),/自己的球队/);
  update(s,{steps:100});const saved=validateSave(roundTrip(s));
  assert.throws(()=>updateCoachedMatch(saved,{fixtureId:m.id,serial:0,steps:1}),/其他页面/);
  const result=update(saved,{steps:20000});
  assert.equal(result.status,'finished');assert.equal(saved.activeMatch,null);
  const played=saved.fixtures.find(f=>f.id===m.id);assert.equal(played.coached,true);
  assert.deepEqual(played.score,getResult(result).score);
  if(m.kind==='league')assert.equal(tableFor(saved,m.competition).find(r=>r.id===id).played,1);
  const p=result.teams[desiredSide].roster[0];assert.equal(saved.playerState[p.id].date,m.date);
  assert.throws(()=>updateCoachedMatch(saved,{fixtureId:m.id,serial:1,steps:1}),/其他页面/);
 }
});
test('伤病和赛事停赛禁止进入正式首发，补位保留其余健康球员',()=>{
 const s=createSeason();appointManager(s,'sky');const m=toMatch(s),preview=coachPreview(s),side=preview.side;
 const lineup=preview.lineup,injured=lineup[2].id,suspended=lineup[4].id;
 s.playerState[injured]={date:m.date,condition:75,injuryDays:12};
 s.discipline[`${m.competition}/${suspended}`]={yellow:0,ban:1};
 s.manager.lineup=lineup;
 const next=coachPreview(s),ids=next.lineup.map(p=>p.id);
 assert.equal(new Set(ids).size,11);assert.ok(!ids.includes(injured));assert.ok(!ids.includes(suspended));
 assert.ok(ids.includes(lineup[0].id));
 assert.throws(()=>beginCoachedMatch(s,{lineup}),/首发/);
 const state=beginCoachedMatch(s);assert.equal(state.teams[side].slots.length,11);
});
test('托管完整赛季：杯赛动态晋级不跳过本队，跨年保留执教与阵容',()=>{
 const s=createSeason();appointManager(s,'sky');let coached=0;
 while(toMatch(s)){
  const m=coachPreview(s).fixture;
  beginCoachedMatch(s);
  const finished=update(s,{steps:20000});assert.equal(finished.status,'finished',m.id);coached++;
 }
 finishDate(s,'0318-12-31');
 const ours=s.fixtures.filter(m=>!m.bye&&Object.values(fixtureSides(s,m)).includes('sky'));
 assert.equal(coached,ours.length);assert.ok(coached>=25);
 assert.ok(ours.every(m=>m.score&&m.coached));assert.equal(pendingMatches(s).length,0);
 assert.equal(tableFor(s,'closed').find(r=>r.id==='sky').played,22);
 const next=followingSeason(s);assert.equal(next.manager.clubId,'sky');assert.deepEqual(next.manager.tactics,s.manager.tactics);
 assert.deepEqual(next.manager.lineup,s.manager.lineup);assert.equal(next.activeMatch,null);assert.equal(seasonGoal(next).year,319);
});

test('赛前布置独立保存，刷新可恢复；比赛开始后不能改写首发',()=>{
 const s=createSeason();appointManager(s,'sky');toMatch(s);const p=coachPreview(s);
 const tactics={...DEFAULT_TACTICS,mentality:'attacking'};
 savePreparation(s,{fixtureId:p.fixture.id,tactics,lineup:p.lineup});
 const saved=validateSave(roundTrip(s));assert.equal(coachPreview(saved).tactics.mentality,'attacking');
 assert.deepEqual(coachPreview(saved).lineup,p.lineup);
 beginCoachedMatch(saved);assert.throws(()=>savePreparation(saved,{fixtureId:p.fixture.id,tactics,lineup:p.lineup}),/已开始/);
});
