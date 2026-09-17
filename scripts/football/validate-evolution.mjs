import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {generateTeam} from '../../src/football/players.js';
import {simulateMatch} from '../../src/football/engine.js';
import {ENGINE_VERSION} from '../../src/football/config.js';
import {COACH_STYLES} from '../../src/football/coach.js';
const N=Number(process.env.PER_CASE||500),start=performance.now(),report={version:ENGINE_VERSION,seed:Number(process.env.SEED||7300000),samples:[],failures:[],hashes:{}};
const within=(value,lo,hi,label)=>{if(value<lo||value>hi)report.failures.push(`${label}: ${value} outside [${lo},${hi}]`);};
function scenario(name,qa,qb,{a={},b={},ai=false,n=N}={}){
 const sums={goals:0,shots:0,passes:0,completed:0,xG:0,fouls:0,corners:0,red:0,draw:0,win:0,loss:0,goalsA:0,goalsB:0,subs:0};
 for(let i=0;i<n;i++){
  const aTeam=generateTeam({id:`holdout-A-${Math.floor(i/20)}`,seed:'evolution-holdout',quality:qa}),bTeam=generateTeam({id:`holdout-B-${Math.floor(i/20)}`,seed:'evolution-holdout',quality:qb}),reverse=i%2===1;
  const r=simulateMatch({home:reverse?bTeam:aTeam,away:reverse?aTeam:bTeam,homeTactics:reverse?b:a,awayTactics:reverse?a:b,ai:[ai,ai],seed:report.seed+i,capture:i<8});
  assert.equal(r.status,'finished');
  for(let side=0;side<2;side++){
   const t=r.teams[side];for(const k of ['goals','shots','passes','completed','xG','fouls','corners','red'])sums[k]+=t.stats[k];sums.subs+=t.subs;
   for(const k of ['goals','shots','onTarget','passes','completed','fouls','yellow','red','tackles','interceptions'])assert.equal(t.players.reduce((n,p)=>n+p[k],0),t.stats[k]);
   assert.equal(t.players.reduce((n,p)=>n+p.saves,0),r.teams[1-side].stats.onTarget-r.teams[1-side].stats.goals);
   assert.ok(Math.abs(t.players.reduce((n,p)=>n+p.seconds,0)-t.stats.playerSeconds)<1e-6);
   assert.ok(t.subs<=5);assert.ok(t.onField.length<=11);assert.ok(t.players.every(p=>p.seconds>=0&&p.seconds<=r.seconds+1e-6));
  }
  const scoreA=r.score[reverse?1:0],scoreB=r.score[reverse?0:1];sums.goalsA+=scoreA;sums.goalsB+=scoreB;sums.win+=Number(scoreA>scoreB);sums.loss+=Number(scoreA<scoreB);sums.draw+=Number(scoreA===scoreB);
 }
 const row={name,n,...Object.fromEntries(Object.entries(sums).map(([k,v])=>[k,v/n])),completion:sums.completed/sums.passes};report.samples.push(row);console.log(name,JSON.stringify(row));return row;
}
const base=scenario('balanced',68,68);
for(const [key,lo,hi] of [['goals',2,3.4],['shots',20,34],['completion',.74,.9],['draw',.17,.36],['red',0,.25]])within(base[key],lo,hi,`balanced ${key}`);
let previous=base.win;
for(const [gap,qa,qb] of [[10,73,63],[20,78,58],[34,86,52]]){
 const r=scenario(`gap${gap}`,qa,qb);if(r.win<previous)report.failures.push('strength win rate is not monotonic');previous=r.win;
 if(gap===34){within(r.win,.75,.95,'gap34 win');within(r.loss,.01,.18,'gap34 upset');within(r.goalsB,.25,1.3,'gap34 weaker goals');}
}
const auto=scenario('ai-balanced',68,68,{ai:true});within(auto.goals,1.8,3.6,'AI balanced goals');within(auto.shots,18,36,'AI balanced shots');
if(process.env.MATRIX!=='0'){
 const styles=Object.keys(COACH_STYLES),stylePoints=Object.fromEntries(styles.map(k=>[k,{points:0,games:0}]));
 for(let i=0;i<styles.length;i++)for(let j=i;j<styles.length;j++){
  const r=scenario(`${styles[i]}:${styles[j]}`,68,68,{a:COACH_STYLES[styles[i]],b:COACH_STYLES[styles[j]],n:Math.max(60,Math.floor(N/5))});
  if(i===j)within(r.goals,1.5,4.3,`${r.name} goals`);
  else{stylePoints[styles[i]].points+=r.win+r.draw*.5;stylePoints[styles[j]].points+=r.loss+r.draw*.5;stylePoints[styles[i]].games++;stylePoints[styles[j]].games++;}
 }
 report.stylePoints=Object.fromEntries(Object.entries(stylePoints).map(([k,v])=>[k,v.points/v.games]));
 for(const [style,points] of Object.entries(report.stylePoints))within(points,.25,.75,`${style} points share`);
}
for(const folder of ['src/football','src/competitions'])for(const f of fs.readdirSync(folder).filter(f=>f.endsWith('.js')))report.hashes[`${folder}/${f}`]=crypto.createHash('sha256').update(fs.readFileSync(`${folder}/${f}`)).digest('hex');
report.seconds=(performance.now()-start)/1000;report.matches=report.samples.reduce((n,s)=>n+s.n,0);
const file=process.env.REPORT||`artifacts/engine-evolution/v${ENGINE_VERSION}-validation.json`;if(fs.existsSync(file))throw Error('Choose a new REPORT path; do not overwrite archived evidence');fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');console.log('FAILURES',report.failures);assert.equal(report.failures.length,0,report.failures.join('\n'));
