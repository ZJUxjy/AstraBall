import test from 'node:test';
import assert from 'node:assert/strict';
import {skillDifference,TUNE} from '../src/football/config.js';
import {goalProbability} from '../src/football/shots.js';
import {generateTeam} from '../src/football/players.js';
import {simulateMatch,injuryAbsence} from '../src/football/engine.js';
import {rng} from '../src/football/random.js';
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
test('同等实力下主场胜多于客胜，开场第一分钟不进球',()=>{
 const home=generateTeam({id:'home-edge',quality:72,seed:21}),away=generateTeam({id:'away-edge',quality:72,seed:22});
 let homeWins=0,awayWins=0,opening=0,tight=0;
 for(let seed=0;seed<80;seed++){
  const r=simulateMatch({home,away,seed:41000+seed});
  if(r.score[0]>r.score[1])homeWins++;else if(r.score[1]>r.score[0])awayWins++;
  opening+=r.events.filter(e=>e.type==='shot'&&e.outcome==='goal'&&e.minute<1).length;
  if(r.score[0]<=1&&r.score[1]<=1)tight++;
 }
 assert.equal(opening,0);
 assert.ok(homeWins>awayWins,`主胜 ${homeWins} 应多于客胜 ${awayWins}`);
 assert.ok(tight<48,`1-1/0-0/1-0/0-1 共 ${tight} 场，应低于 60%`);
});
test('中立场不给主队射门和对抗加成',()=>{
 const home=generateTeam({id:'n-home',quality:74,seed:3}),away=generateTeam({id:'n-away',quality:74,seed:4});
 let venue=0,neutral=0;
 for(let seed=0;seed<24;seed++){
  const a=simulateMatch({home,away,seed:43000+seed}),b=simulateMatch({home,away,seed:43000+seed,neutral:true});
  venue+=a.score[0]-a.score[1];neutral+=b.score[0]-b.score[1];
 }
 assert.ok(venue>neutral,`主场净胜 ${venue} 应高于中立场 ${neutral}`);
});
test('伤停以短伤为主，伤病史提高复发天数',()=>{
 const fresh=[],repeat=[];
 for(let i=0;i<800;i++){
  fresh.push(injuryAbsence(rng(`inj-new:${i}`),{history:0}));
  repeat.push(injuryAbsence(rng(`inj-old:${i}`),{history:3}));
 }
 const median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
 const short=xs=>xs.filter(n=>n<=9).length;
 assert.ok(median(fresh)<=10,`无伤史中位 ${median(fresh)} 天`);
 assert.ok(short(fresh)>fresh.length*.55,`短伤 ${short(fresh)}/${fresh.length}`);
 assert.ok(fresh.every(n=>n>=3&&n<=70));
 assert.ok(median(repeat)>median(fresh),`复发中位 ${median(repeat)} 应高于首伤 ${median(fresh)}`);
});
