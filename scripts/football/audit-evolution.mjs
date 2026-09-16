import fs from 'node:fs';
import crypto from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {simulateMatch} from '../../src/football/engine.js';
import {generateTeam} from '../../src/football/players.js';
import {ENGINE_VERSION} from '../../src/football/config.js';
const n=Number(process.env.MATCHES||100),seed=Number(process.env.SEED||2100000),start=performance.now();
const report={version:ENGINE_VERSION,matchesPerCase:n,seed,cases:[],hashes:{}};
for(const [name,q1,q2,t1,t2] of [
 ['balanced',68,68,{},{}],['gap10',73,63,{},{}],['gap20',78,58,{},{}],['gap34',86,52,{},{}],
 ['short',68,68,{passing:'short'},{}],['direct',68,68,{passing:'direct'},{}],
 ['wide',68,68,{width:'wide',formation:'3-5-2'},{}],['press',68,68,{pressing:'high',line:'high'},{}],
]){
 const totals={goals:0,shots:0,xG:0,passes:0,completed:0,fouls:0,corners:0,red:0,draws:0,teamOneWins:0,teamOneGoals:0,teamTwoGoals:0};
 for(let i=0;i<n;i++){
  const a=generateTeam({id:'A',quality:q1,seed:`evo:${Math.floor(i/20)}`}),b=generateTeam({id:'B',quality:q2,seed:`evo:${Math.floor(i/20)}`}),reverse=i%2===1;
  const r=simulateMatch({home:reverse?b:a,away:reverse?a:b,homeTactics:reverse?t2:t1,awayTactics:reverse?t1:t2,seed:seed+i,capture:false});
  if(r.status!=='finished')throw Error(`unfinished ${name}/${i}`);
  for(const t of r.teams)for(const k of ['goals','shots','xG','passes','completed','fouls','corners','red'])totals[k]+=t.stats[k];
  totals.draws+=Number(r.score[0]===r.score[1]);totals.teamOneWins+=Number(r.score[reverse?1:0]>r.score[reverse?0:1]);totals.teamOneGoals+=r.score[reverse?1:0];totals.teamTwoGoals+=r.score[reverse?0:1];
 }
 const row={name,...Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,v/n])),completion:totals.completed/totals.passes};report.cases.push(row);console.log(name,JSON.stringify(row));
}
for(const dir of ['src/football','src/competitions'])for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.js')))report.hashes[`${dir}/${file}`]=crypto.createHash('sha256').update(fs.readFileSync(`${dir}/${file}`)).digest('hex');
report.seconds=(performance.now()-start)/1000;
const file=process.env.REPORT||`artifacts/engine-evolution/v${ENGINE_VERSION}-audit.json`;
if(fs.existsSync(file))throw Error(`报告已存在，请指定新的 REPORT：${file}`);
fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');console.log(file,report.seconds);
