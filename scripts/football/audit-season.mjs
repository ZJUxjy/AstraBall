import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createSeason,advanceTo,followingSeason,engineSimulation,pendingMatches,validateSave,tableFor} from '../../src/competitions/runtime.js';
import {dateOf,daysBetween} from '../../src/competitions/calendar.js';
import {leagueSystems} from '../../src/competitions/catalog.js';
const report={seasons:[],matches:0,startedAt:new Date().toISOString()};let season=createSeason();
for(let n=0;n<2;n++){
 const last=new Map();let matches=0,goals=0,injuries=0,reds=0,shootouts=0,minRest=Infinity;
 const simulate=input=>{const r=engineSimulation(input);assert.equal(r.status,'finished');assert.ok(r.teams.every(t=>t.players.reduce((n,p)=>n+p.goals,0)===t.stats.goals));matches++;goals+=r.score[0]+r.score[1];injuries+=r.events.filter(e=>e.type==='injury').length;reds+=r.teams.reduce((n,t)=>n+t.stats.red,0);shootouts+=Boolean(r.shootout);return r;};
 for(let month=1;month<=12;month++){
  const end=month===12?dateOf(season.year,12,31):new Date(Date.parse(`${dateOf(season.year,month+1,1)}T12:00:00Z`)-86400000).toISOString().slice(0,10);
  advanceTo(season,end,{simulate});season=validateSave(JSON.parse(JSON.stringify(season)));console.log(`${season.year}-${month}: ${matches} matches`);
 }
 assert.equal(matches,4759);assert.equal(pendingMatches(season).length,0);
 for(const m of season.fixtures.filter(m=>!m.bye))for(const id of [m.home,m.away]){if(last.has(id)){const rest=daysBetween(last.get(id),m.date);assert.ok(rest>=3);minRest=Math.min(minRest,rest);}last.set(id,m.date);}
 for(const sys of leagueSystems)for(const d of sys.levels)assert.ok(tableFor(season,d.id).every(r=>r.played===d.rounds));
 assert.equal(season.summary.movements.length,60);assert.equal(season.summary.qualifiers.length,32);
 const serialized=JSON.stringify(season),next=followingSeason(season);assert.deepEqual(next.qualifiers,season.summary.qualifiers);assert.deepEqual(next.members,season.summary.nextMembers);
 report.seasons.push({year:season.year,matches,goals,goalsPerGame:goals/matches,injuries,reds,shootouts,minRestDays:minRest,saveBytes:Buffer.byteLength(serialized),resultHash:crypto.createHash('sha256').update(serialized).digest('hex'),promotions:season.summary.movements.filter(m=>m.kind==='up'),relegations:season.summary.movements.filter(m=>m.kind==='down'),champions:season.summary.champions});report.matches+=matches;season=next;
}
report.completedAt=new Date().toISOString();const files=['src/competitions/runtime.js','src/competitions/calendar.js','src/competitions/season.js','src/football/engine.js'];report.hashes=Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));fs.mkdirSync('artifacts/season',{recursive:true});fs.writeFileSync('artifacts/season/audit.json',JSON.stringify(report,null,2)+'\n');console.log('PASS',report.matches,'real-engine matches, 2 consecutive seasons');
