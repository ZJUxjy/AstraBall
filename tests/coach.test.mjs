import test from 'node:test';
import assert from 'node:assert/strict';
import {generateTeam} from '../src/football/players.js';
import {coachStyle,coachLineup,prepareCoach} from '../src/football/coach.js';
import {createMatch,DEFAULT_TACTICS} from '../src/football/engine.js';
import {createSeason,matchInput,pendingMatches} from '../src/competitions/runtime.js';
import {appointManager,beginCoachedMatch} from '../src/competitions/career.js';
const home=generateTeam({id:'h'}),away=generateTeam({id:'a'});
test('俱乐部风格稳定且多样，赛前布置根据实力与体能变化',()=>{
 const styles=new Set();for(let i=0;i<25;i++){const t=generateTeam({id:`club${i}`});styles.add(coachStyle(t));assert.equal(coachStyle(t),coachStyle(structuredClone(t)));}assert.equal(styles.size,5);
 const weak=generateTeam({id:'weak',quality:48}),strong=generateTeam({id:'strong',quality:85});assert.equal(prepareCoach(weak,strong).tactics.mentality,'defensive');
 for(const p of weak.roster)p.condition=65;assert.equal(prepareCoach(weak,strong).tactics.pressing,'low');
});
test('AI 选人考虑疲劳与资格，手动首发和战术优先',()=>{
 const team=structuredClone(home),line=coachLineup(team,'4-3-3'),id=line[2].id;team.roster.find(p=>p.id===id).condition=26;assert.ok(!coachLineup(team,'4-3-3').some(p=>p.id===id));
 team.roster.find(p=>p.id===line[3].id).injuryDays=8;assert.ok(!coachLineup(team,'4-3-3').some(p=>p.id===line[3].id));
 const s=createMatch({home,away,ai:[true,true],homeTactics:{formation:'4-4-2',passing:'short'}});assert.equal(s.teams[0].tactics.formation,'4-4-2');assert.equal(s.teams[0].tactics.passing,'short');assert.ok(s.teams.every(t=>t.coach));
 const manual=createMatch({home,away});assert.equal(manual.teams[0].coach,null);assert.deepEqual(manual.teams[0].tactics,DEFAULT_TACTICS);
});
test('正式比赛双方默认 AI，接手球队后只保留对手 AI',()=>{
 const s=createSeason(),m=pendingMatches(s)[0];assert.deepEqual(matchInput(s,m).ai,[true,true]);
 appointManager(s,m.home);s.date=m.date;assert.deepEqual(matchInput(s,m).ai,[false,true]);
 const state=beginCoachedMatch(s);assert.equal(state.teams[0].coach,null);assert.ok(state.teams[1].coach);assert.deepEqual(state.teams[0].tactics,s.manager.tactics);
});

import {coachCommands} from '../src/football/coach.js';
import {applyCommand,stepMatch,snapshotMatch,restoreMatch,getResult} from '../src/football/engine.js';
const aiMatch=()=>createMatch({home,away,ai:[true,true],seed:2217});
const at=(s,minute)=>{s.period=minute>=45?2:1;s.periodClock=(minute-(s.period===2?45:0))*60;s.elapsed=minute*60;};
test('临场 AI 追分、守成、减员调整，不抽取随机数或改动人工队',()=>{
 const s=aiMatch();at(s,76);s.teams[0].stats.goals=0;s.teams[1].stats.goals=1;const before=s.random.snapshot();
 const commands=coachCommands(s,0);assert.equal(commands.find(c=>c.type==='tactics').reason,'chase');commands.forEach(c=>applyCommand(s,c));assert.equal(s.teams[0].tactics.formation,'4-4-2');
 const protect=coachCommands(s,1).find(c=>c.type==='tactics');assert.equal(protect.reason,'protect');assert.equal(protect.tactics.tempo,'slow');assert.equal(s.random.snapshot(),before);
 s.teams[0].slots.pop();s.teams[0].stats.goals=2;const reduced=coachCommands(s,0).find(c=>c.type==='tactics');assert.equal(reduced.reason,'redCard');applyCommand(s,reduced);assert.equal(s.teams[0].slots.length,10);
 s.teams[0].coach=null;assert.deepEqual(coachCommands(s,0),[]);
});
test('主动换人遵守五人三窗口并选择新鲜替补，重复事件不重复换人',()=>{
 const s=aiMatch(),t=s.teams[0];let total=0;
 for(const minute of [55,65,78]){
  at(s,minute);for(const slot of t.slots){t.lines[slot.id].seconds=35*60;t.lines[slot.id].condition=45;}
  const commands=coachCommands(s,0).filter(c=>c.type==='substitution');assert.ok(commands.length>0);total+=commands.length;commands.forEach(c=>applyCommand(s,c));
  assert.equal(coachCommands(s,0).filter(c=>c.type==='substitution').length,0);
 }
 assert.equal(total,5);assert.equal(t.subs,5);assert.equal(t.windows,3);assert.equal(new Set(t.slots.map(s=>s.id)).size,11);
});
test('AI 状态中途恢复与实时/批量一致，人工一方不会收到 AI 指令',()=>{
 const s=createMatch({home,away,ai:[false,true],seed:6644});while(s.elapsed<3700&&s.status==='playing')stepMatch(s);
 const saved=restoreMatch(JSON.parse(JSON.stringify(snapshotMatch(s))));while(stepMatch(s));while(stepMatch(saved));assert.deepEqual(getResult(s),getResult(saved));
 assert.ok(s.events.some(e=>e.reason&&e.side===1));assert.ok(!s.events.some(e=>e.reason&&e.side===0));assert.ok(s.teams[1].subs>0);assert.ok(s.teams[1].windows<=3);
});
