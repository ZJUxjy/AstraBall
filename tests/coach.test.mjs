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
