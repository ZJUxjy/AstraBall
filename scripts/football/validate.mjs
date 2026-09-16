import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {simulateMatch} from '../../src/football/engine.js';
import {generateTeam,ATTRIBUTE_KEYS} from '../../src/football/players.js';
const report={fixtures:[],sensitivity:{},failures:[]},N=Number(process.env.PER_CASE||400);
const team=(id,quality,seed)=>generateTeam({id,quality,seed});
const suites=[['balanced',68,68,{},{}],['elite',85,85,{},{}],['developing',48,48,{},{}],['mismatch',86,52,{},{}],['press-v-short',72,72,{pressing:'high',line:'high',tempo:'fast'},{passing:'short'}],['direct-v-deep',72,72,{passing:'direct',width:'wide'},{line:'deep',mentality:'defensive'}],['narrow-v-wide',72,72,{width:'narrow',formation:'4-2-3-1'},{width:'wide',formation:'3-5-2'}],['knockout',68,68,{},{}]];
let total=0;
for(const [name,q1,q2,t1,t2] of suites){
 const aggregate={matches:0,goals:0,shots:0,passes:0,completed:0,xG:0,red:0,fouls:0,corners:0,draws:0,homeWins:0,teamOneWins:0,interceptions:0,tackles:0};
 for(let i=0;i<N;i++){
  const a=team('A',q1,`holdout-${Math.floor(i/40)}`),b=team('B',q2,`holdout-${Math.floor(i/40)}`),reverse=i%2===1;
  const r=simulateMatch({home:reverse?b:a,away:reverse?a:b,homeTactics:reverse?t2:t1,awayTactics:reverse?t1:t2,seed:800000+total++,knockout:name==='knockout',capture:i<12});
  aggregate.matches++;aggregate.draws+=Number(r.score[0]===r.score[1]);aggregate.homeWins+=Number(r.score[0]>r.score[1]);aggregate.teamOneWins+=Number(r.score[reverse?1:0]>r.score[reverse?0:1]);
  for(let side=0;side<2;side++){const t=r.teams[side],opp=r.teams[1-side];for(const k of ['goals','shots','passes','completed','xG','red','fouls','corners','interceptions','tackles'])aggregate[k]+=t.stats[k];
   for(const k of ['goals','shots','passes','completed','onTarget','fouls','yellow','red','tackles','interceptions'])assert.equal(t.players.reduce((s,p)=>s+p[k],0),t.stats[k],name+k);
   assert.ok(Math.abs(t.players.reduce((s,p)=>s+p.xG,0)-t.stats.xG)<1e-7);
   assert.ok(Math.abs(t.players.reduce((s,p)=>s+p.seconds,0)-t.stats.playerSeconds)<1e-6);
   assert.equal(t.players.reduce((s,p)=>s+p.saves,0),opp.stats.onTarget-opp.stats.goals);
   assert.ok(t.stats.goals<=t.stats.onTarget&&t.stats.onTarget<=t.stats.shots);assert.ok(t.stats.completed<=t.stats.passes);assert.ok(t.players.every(p=>Object.values(p).every(v=>typeof v!=='number'||Number.isFinite(v))));
   for(const p of t.players)assert.ok(p.seconds>=0&&p.seconds<=r.seconds+.000001);
  }
  if(i<12){assert.equal(r.events.filter(e=>e.type==='shot'&&e.outcome==='goal').length,r.score[0]+r.score[1]);for(const e of r.events.filter(e=>e.type==='red'))assert.ok(!r.events.some(n=>n.seq>e.seq&&['pass','shot','dribble'].includes(n.type)&&n.player===e.player));}
  if(name==='knockout')assert.ok(r.score[0]!==r.score[1]||r.shootout||r.status==='abandoned');
 }
 const avg=Object.fromEntries(Object.entries(aggregate).filter(([k])=>k!=='matches').map(([k,v])=>[k,+(v/N).toFixed(4)]));avg.completion=aggregate.completed/aggregate.passes;
 report.fixtures.push({name,matches:N,...avg});console.log(name,JSON.stringify(avg));
}
const a=team('A',68,'causal'),b=team('B',68,'causal');
for(const [name,keys,metric,side,direction] of [['finishing',['finishing','composure','longShots','heading'],'goals',0,1],['goalkeeping',['reflexes','oneOnOnes','handling','agility'],'goals',1,-1],['passing',['passing','longPassing','firstTouch','vision','decisions'],'completed',0,1]]){
 const values=[];for(const delta of [-18,18]){const changed=structuredClone(a);for(const p of changed.roster)for(const k of keys)p.attributes[k]=Math.max(1,Math.min(99,p.attributes[k]+delta));let sum=0;for(let seed=0;seed<N;seed++){const r=simulateMatch({home:changed,away:b,seed:900000+seed,neutral:true,capture:false});sum+=r.teams[side].stats[metric];}values.push(sum/N);}
 report.sensitivity[name]={low:values[0],high:values[1],delta:values[1]-values[0]};assert.ok((values[1]-values[0])*direction>0,`${name} 因果方向错误`);console.log(name,values);
}
const balanced=report.fixtures.find(f=>f.name==='balanced');
for(const [key,min,max] of [['goals',1.9,3.6],['shots',20,34],['completion',.74,.90],['fouls',17,33],['corners',4,13],['red',0,.25],['draws',.17,.36]])if(balanced[key]<min||balanced[key]>max)report.failures.push(`${key}: ${balanced[key]} outside ${min}..${max}`);
if(report.fixtures.find(f=>f.name==='mismatch').teamOneWins<.62)report.failures.push('强弱对阵缺少能力区分');
report.hashes=Object.fromEntries(fs.readdirSync('src/football').filter(f=>f.endsWith('.js')&&!['data.js','ui.js'].includes(f)).map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(`src/football/${f}`)).digest('hex')]));
report.totalMatches=total+6*N;report.seedDescription='留出 800000 起，属性干预 900000 起；每 40 场换阵容种子，互换主客';
fs.mkdirSync('artifacts/football/v6',{recursive:true});fs.writeFileSync('artifacts/football/v6/validation.json',JSON.stringify(report,null,2)+'\n');
assert.equal(report.failures.length,0,report.failures.join('\n'));console.log('PASS',report.totalMatches);
