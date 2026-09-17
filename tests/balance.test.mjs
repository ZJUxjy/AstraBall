import test from 'node:test';
import assert from 'node:assert/strict';
import {skillDifference,TUNE} from '../src/football/config.js';
import {goalProbability} from '../src/football/shots.js';
import {generateTeam} from '../src/football/players.js';
import {simulateMatch} from '../src/football/engine.js';
test('能力对抗连续单调且边际递减，射门和门将作用方向保持',()=>{
 let prev=-Infinity;for(let gap=-98;gap<=98;gap++){const value=skillDifference(gap);assert.ok(value>prev);assert.ok(Math.abs(value)<TUNE.passSkillCap*TUNE.passSkillScale);prev=value;}
 assert.equal(skillDifference(0),0);assert.ok(skillDifference(60)-skillDifference(40)<skillDifference(20)-skillDifference(0));
 assert.ok(goalProbability(.15,85,65)>goalProbability(.15,55,65));assert.ok(goalProbability(.15,65,85)<goalProbability(.15,65,55));
});
test('强弱组不通过赛后比分修正，事件与个人进球逐场一致',()=>{
 const home=generateTeam({id:'strong',quality:86}),away=generateTeam({id:'weak',quality:52});
 for(let seed=0;seed<30;seed++){
  const r=simulateMatch({home,away,seed:830000+seed});for(let side=0;side<2;side++)assert.equal(r.score[side],r.events.filter(e=>e.type==='shot'&&e.outcome==='goal'&&e.side===side).length);
 }
});
