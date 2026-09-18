import test from 'node:test';
import assert from 'node:assert/strict';
import {rosterStatistics,recentForm,escapeHTML} from '../src/competitions/presentation.js';

test('roster statistics count only appearances for this club in completed non-bye fixtures',()=>{
 const line={id:'p',minutes:65,goals:2,assists:1,yellow:1};
 const season={fixtures:[
  {home:'a',away:'b',score:[2,0],report:{players:[[line,{id:'unused',minutes:0}],[]]}},
  {home:'b',away:'a',score:[0,1],report:{players:[[],[{...line,minutes:25,goals:1,assists:0,yellow:0,red:1}]]}},
  {home:'x',away:'b',score:[2,0],report:{players:[[line],[]]}},
  {home:'a',away:'b',report:{players:[[line],[]]}},
  {home:'a',away:'b',score:[1,0],bye:true,report:{players:[[line],[]]}},
 ]};
 assert.deepEqual(rosterStatistics(season,'a').get('p'),{appearances:2,minutes:90,goals:3,assists:1,yellow:1,red:1});
 assert.equal(rosterStatistics(season,'a').has('unused'),false);
});
test('form respects team perspective, date order, competition and five-match limit',()=>{
 const fixtures=Array.from({length:7},(_,i)=>({date:`0318-03-0${i+1}`,home:i%2?'b':'a',away:i%2?'a':'b',score:[2,0],competition:'league'})).reverse();
 fixtures.push({date:'0318-03-09',home:'a',away:'b',score:[0,0],competition:'cup'});
 assert.deepEqual(recentForm({fixtures},'a','league').map(r=>r.result),['win','loss','win','loss','win']);
 assert.equal(recentForm({fixtures},'a').at(-1).result,'draw');
 assert.equal(escapeHTML('<"&>'),'&lt;&quot;&amp;&gt;');
});
