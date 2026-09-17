import fs from 'node:fs';
import assert from 'node:assert/strict';
import {generateTeam} from '../../src/football/players.js';
import {simulateMatch} from '../../src/football/engine.js';
import {ENGINE_VERSION} from '../../src/football/config.js';
const n=Number(process.env.PER_CASE||300),report={version:ENGINE_VERSION,n,seed:9600000,groups:[]};
for(const [name,keys,metric,side,direction] of [
 ['finishing',['finishing','composure','longShots','heading'],'goals',0,1],
 ['goalkeeping',['reflexes','oneOnOnes','handling','agility'],'goals',1,-1],
 ['passing',['passing','longPassing','firstTouch','vision','decisions'],'completed',0,1],
]){
 const values=[];
 for(const delta of [-18,18]){
  let total=0;
  for(let i=0;i<n;i++){
   const a=generateTeam({id:`sensitivity-A-${Math.floor(i/30)}`,seed:'sensitivity'}),b=generateTeam({id:`sensitivity-B-${Math.floor(i/30)}`,seed:'sensitivity'});
   for(const player of a.roster)if(name!=='goalkeeping'||player.position==='GK')for(const key of keys)player.attributes[key]=Math.max(1,Math.min(99,player.attributes[key]+delta));
   const reverse=i%2===1,r=simulateMatch({home:reverse?b:a,away:reverse?a:b,neutral:true,seed:report.seed+i,capture:false});
   total+=r.teams[reverse?1-side:side].stats[metric];
  }
  values.push(total/n);
 }
 const result={name,low:values[0],high:values[1],difference:values[1]-values[0],passed:(values[1]-values[0])*direction>0};report.groups.push(result);console.log(result);
}
report.matches=n*6;const file=`artifacts/engine-evolution/v${ENGINE_VERSION}-sensitivity.json`;if(fs.existsSync(file))throw Error('Report already exists');fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');assert.ok(report.groups.every(g=>g.passed),'Attribute direction failed');
