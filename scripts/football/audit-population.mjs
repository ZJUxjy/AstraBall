import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createSeason} from '../../src/competitions/runtime.js';
import {annualPopulation,populationPlayers,clubPlayers,validatePopulation} from '../../src/competitions/population.js';
import {footballTeams} from '../../src/football/data.js';
const years=Number(process.env.YEARS||12),report=process.env.REPORT||'artifacts/engine-evolution/v14-population-audit.json';
if(fs.existsSync(report))throw Error('Report already exists');
const s=createSeason(),rows=[],start=performance.now();
for(let i=0;i<=years;i++){
 let change=null;if(i){s.year++;s.date=`${String(s.year).padStart(4,'0')}-01-01`;change=annualPopulation(s);}
 validatePopulation(s.population);
 const active=populationPlayers(s),rosters=footballTeams.map(t=>clubPlayers(s,t.id)),all=populationPlayers(s,{retired:true});
 assert.equal(new Set(all.map(p=>p.id)).size,all.length);
 assert.ok(rosters.every(r=>r.length<=30));
 rows.push({year:s.year,active:active.length,retired:all.length-active.length,youth:active.filter(p=>p.unit==='youth').length,free:active.filter(p=>p.unit==='free').length,senior:rosters.reduce((n,r)=>n+r.length,0),minRoster:Math.min(...rosters.map(r=>r.length)),maxRoster:Math.max(...rosters.map(r=>r.length)),shortRosters:rosters.filter(r=>r.length<18).length,noGoalkeeper:rosters.filter(r=>!r.some(p=>p.position==='GK')).length,change});
 console.log(JSON.stringify(rows.at(-1)));
}
const hash=crypto.createHash('sha256').update(fs.readFileSync('src/competitions/population.js')).digest('hex');
fs.writeFileSync(report,JSON.stringify({scope:'Population lifecycle only; no matches, player growth or transfers. Detects recruitment gaps for V15; not a long-term football balance verdict.',years,sourceHash:hash,seconds:(performance.now()-start)/1000,rows},null,2)+'\n');
