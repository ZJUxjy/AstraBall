import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {generateYouthPlayer,ROSTER_POSITIONS} from '../../src/football/players.js';
import {bodyAtAge,createBodyProfile,validateBodyProfile} from '../../src/football/body.js';
const count=1000,ages=[15,16,17,18,20,24],cohort=Array.from({length:count},(_,i)=>generateYouthPlayer({id:`body-audit-${i}`,seed:'body-audit-v1',age:15,position:ROSTER_POSITIONS[i%ROSTER_POSITIONS.length]}));
const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
const stats=xs=>{const sorted=[...xs].sort((a,b)=>a-b);return {mean:mean(xs),p10:sorted[Math.floor(xs.length*.1)],p90:sorted[Math.floor(xs.length*.9)]};};
const measurements=Object.fromEntries(ages.map(age=>[age,{height:stats(cohort.map(p=>bodyAtAge(p,age).height)),weight:stats(cohort.map(p=>bodyAtAge(p,age).weight))}]));
for(const p of cohort){
 assert.ok(validateBodyProfile(p.bodyProfile));
 let previous=bodyAtAge(p,15);
 for(let step=1;step<=480;step++){
  const current=bodyAtAge(p,15+step/48);
  assert.ok(current.height>=previous.height&&current.weight>=previous.weight);
  assert.ok(current.height<=p.bodyProfile.adultHeight&&current.weight<=p.bodyProfile.adultWeight);previous=current;
 }
 assert.deepEqual(bodyAtAge(p,25),bodyAtAge(p,60));
 const migrated={...p,bodyProfile:undefined,height:180,weight:75};
 migrated.bodyProfile=createBodyProfile(migrated,{age:16.5,migrate:true});
 assert.deepEqual(bodyAtAge(migrated,16.5),{height:180,weight:75});
}
const report={description:'游戏设计曲线，非真实人体测量拟合；不含营养、伤病或体重训练效应。',seed:'body-audit-v1',count,ages,sourceSha256:createHash('sha256').update(fs.readFileSync(new URL('../../src/football/body.js',import.meta.url))).digest('hex'),measurements,checks:{monotonic:true,adultStable:true,migrationContinuous:true}};
const output=new URL('../../artifacts/youth-development/body-calibration.json',import.meta.url);fs.mkdirSync(new URL('.',output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
for(const age of ages)console.log(`${age} 岁：平均身高 ${measurements[age].height.mean.toFixed(1)} cm，体重 ${measurements[age].weight.mean.toFixed(1)} kg`);
console.log('1000 人曲线与迁移检查通过');
