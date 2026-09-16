import fs from 'node:fs';
import assert from 'node:assert/strict';
import {generateYouthPlayer,developWeek,preciseRating,ATTRIBUTE_GROUPS} from '../../src/football/players.js';
const milestones=[16,18,21,24,27,30,33,36],positions=['CM','ST','CB','LW','GK'];
const scenarios={regular:{minutes:90,load:.6},bench:{minutes:0,load:.6},overload:{minutes:240,load:.9},injury:{minutes:90,load:.6},professional:{minutes:90,load:.6,professionalism:90,ambition:85},uncommitted:{minutes:90,load:.6,professionalism:25,ambition:30}};
const rows=[];
for(const position of positions)for(let seed=0;seed<12;seed++){
 const initial=generateYouthPlayer({id:`cohort-${position}-${seed}`,seed:'growth-v1',position,age:16,potential:82});
 for(const [scenario,settings] of Object.entries(scenarios)){
  let p=structuredClone(initial),next=0;
  if(settings.professionalism)p.personality.professionalism=settings.professionalism;
  if(settings.ambition)p.personality.ambition=settings.ambition;
  for(let week=0;week<=1045;week++){
   const age=p.developmentAge??p.age;
   if(next<milestones.length&&age>=milestones[next]){
    rows.push({position,seed,scenario,age:milestones[next++],ability:preciseRating(p),potential:p.potential,physical:Object.keys(ATTRIBUTE_GROUPS.physical.fields).reduce((sum,k)=>sum+p.attributes[k],0)/8});
   }
   const injury=scenario==='injury'&&age>=19&&age<19.5;
   p=developWeek(p,{...settings,minutes:injury?0:settings.minutes,trainingAvailability:injury?0:1});
   assert.ok(preciseRating(p)<=82+1e-8);assert.equal(p.potential,82);
  }
 }
}
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
const metrics=(scenario,age,position)=>{const subset=rows.filter(r=>r.scenario===scenario&&r.age===age&&(!position||r.position===position));return {ability:+mean(subset.map(r=>r.ability)).toFixed(2),physical:+mean(subset.map(r=>r.physical)).toFixed(2)};};
const summary=Object.fromEntries(Object.keys(scenarios).map(s=>[s,Object.fromEntries(milestones.map(a=>[a,metrics(s,a)]))]));
const comparison={regular24:summary.regular[24].ability,bench24:summary.bench[24].ability,overload24:summary.overload[24].ability,injury21:summary.injury[21].ability,regular21:summary.regular[21].ability,professional24:summary.professional[24].ability,uncommitted24:summary.uncommitted[24].ability};
const positional=Object.fromEntries(positions.map(p=>[p,Object.fromEntries(milestones.map(a=>[a,metrics('regular',a,p)]))]));
const report={model:'development-v1',purpose:'游戏成长节奏校准；并非职业球员实证拟合',players:60,scenarios:6,playerYears:7200,summary,comparison,positional};
fs.mkdirSync('artifacts/development',{recursive:true});fs.writeFileSync('artifacts/development/calibration.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
assert.ok(comparison.regular24>comparison.bench24+3,'稳定出场应产生明显成长差异');
assert.ok(comparison.regular24>comparison.overload24,'过量比赛和训练不应优于适当负荷');
assert.ok(comparison.injury21<comparison.regular21,'长期伤停应延缓发展');
assert.ok(comparison.professional24>comparison.uncommitted24+3,'职业态度应形成长期差异');
assert.ok(summary.regular[18].ability>summary.regular[16].ability+5,'青训阶段应有可见成长');
assert.ok(summary.regular[24].ability<81,'不能过早集体兑现全部潜力');
assert.ok(summary.regular[36].physical<summary.regular[27].physical-8,'晚期身体衰退应可见');
console.log('成长校准检查通过');
