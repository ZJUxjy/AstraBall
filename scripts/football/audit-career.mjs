import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createSeason,advanceTo,followingSeason,engineSimulation,pendingMatches,validateSave,tableFor} from '../../src/competitions/runtime.js';
import {dateOf,daysBetween} from '../../src/competitions/calendar.js';
import {leagueSystems} from '../../src/competitions/catalog.js';
import {clubPlayers,populationPlayers,currentAbility,annualPopulation} from '../../src/competitions/population.js';
import {advanceDevelopment} from '../../src/competitions/development.js';
import {accrueEconomy,rolloverEconomy} from '../../src/competitions/market.js';
import {available} from '../../src/football/players.js';
import {footballTeams} from '../../src/football/data.js';
const path=process.env.REPORT||'artifacts/engine-evolution/v16-career.json',years=Number(process.env.YEARS||3);
if(fs.existsSync(path))throw Error('Report exists');
const files=['src/competitions/runtime.js','src/competitions/market.js','src/competitions/population.js','src/competitions/development.js','src/football/engine.js','src/football/players.js','src/football/config.js'];
const report={scope:'Consecutive full-world seasons using actual match engine, injuries, suspensions, minutes, development, market and promotion/relegation. No fabricated results or replacement players.',years,hashes:Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')])),seasons:[],months:[],matches:0,startedAt:new Date().toISOString(),complete:false,failures:[]};
let season=createSeason(),currentFixture=null;const start=performance.now();
if(process.env.FROM_GENERATION){const text=fs.readFileSync(process.env.FROM_GENERATION,'utf8'),old=JSON.parse(text);season=createSeason({year:old.year+1,members:old.members,population:old.population,development:old.development,economy:old.economy});advanceDevelopment(season,season.date);accrueEconomy(season,season.date);annualPopulation(season);rolloverEconomy(season);report.prehistory={through:old.date,saveHash:crypto.createHash('sha256').update(text).digest('hex'),scope:'Personnel and training only, no previous match results, minutes or promotion/relegation fabricated.'};}
const write=()=>{report.seconds=(performance.now()-start)/1000;fs.writeFileSync(path,JSON.stringify(report,null,2)+'\n');};
try{for(let n=0;n<years;n++){
 const last=new Map();let matches=0,goals=0,injuries=0,reds=0,shootouts=0,minRest=Infinity,minEligible=Infinity,minKeepers=Infinity;
 const simulate=input=>{currentFixture={home:input.home.id,away:input.away.id,date:season.date};for(const t of [input.home,input.away]){const eligible=t.roster.filter(available);minEligible=Math.min(minEligible,eligible.length);minKeepers=Math.min(minKeepers,eligible.filter(p=>p.position==='GK').length);assert.ok(eligible.length>=11,`${t.id}: fewer than 11 eligible players`);assert.ok(eligible.some(p=>p.position==='GK'),`${t.id}: no eligible goalkeeper`);assert.equal(new Set(t.roster.map(p=>p.id)).size,t.roster.length);}
  const r=engineSimulation(input);assert.equal(r.status,'finished');assert.ok(r.teams.every(t=>t.players.reduce((n,p)=>n+p.goals,0)===t.stats.goals));assert.ok(r.teams.every(t=>t.players.every(p=>Number.isFinite(p.minutes)&&p.minutes>=0&&p.minutes<=r.seconds/60+.001)));matches++;report.matches++;goals+=r.score[0]+r.score[1];injuries+=r.events.filter(e=>e.type==='injury').length;reds+=r.teams.reduce((n,t)=>n+t.stats.red,0);shootouts+=Boolean(r.shootout);return r;};
 for(let month=1;month<=12;month++){
  const end=month===12?dateOf(season.year,12,31):new Date(Date.parse(`${dateOf(season.year,month+1,1)}T12:00:00Z`)-86400000).toISOString().slice(0,10);
  advanceTo(season,end,{simulate});season=validateSave(JSON.parse(JSON.stringify(season)));
  const row={date:end,matches,minEligible:Number.isFinite(minEligible)?minEligible:null,minKeepers:Number.isFinite(minKeepers)?minKeepers:null,minCash:Math.min(...Object.values(season.economy.accounts).map(a=>a.cash))};report.months.push(row);assert.ok(row.minCash>=0,`${end}: negative cash`);write();console.log(JSON.stringify(row));
 }
 assert.equal(matches,4759);assert.equal(pendingMatches(season).length,0);
 for(const m of season.fixtures.filter(m=>!m.bye))for(const id of [m.home,m.away]){if(last.has(id)){const rest=daysBetween(last.get(id),m.date);assert.ok(rest>=3);minRest=Math.min(minRest,rest);}last.set(id,m.date);}
 for(const sys of leagueSystems)for(const d of sys.levels)assert.ok(tableFor(season,d.id).every(r=>r.played===d.rounds));
 assert.equal(season.summary.movements.length,60);assert.equal(season.summary.qualifiers.length,32);
 const serialized=JSON.stringify(season),abilities=Object.fromEntries(Object.entries(season.members).map(([division,clubs])=>{const values=clubs.flatMap(id=>clubPlayers(season,id).map(p=>currentAbility(season,p))).sort((a,b)=>a-b);return [division,{median:values[Math.floor(values.length/2)],min:values[0],max:values.at(-1)}];}));
 const next=followingSeason(season);assert.deepEqual(next.qualifiers,season.summary.qualifiers);assert.deepEqual(next.members,season.summary.nextMembers);validateSave(next);
 report.seasons.push({year:season.year,matches,goals,goalsPerGame:goals/matches,injuries,reds,shootouts,minEligible,minKeepers,minRestDays:minRest,saveBytes:Buffer.byteLength(serialized),resultHash:crypto.createHash('sha256').update(serialized).digest('hex'),movements:season.summary.movements,abilities,senior:footballTeams.reduce((n,t)=>n+clubPlayers(season,t.id).length,0),free:populationPlayers(season).filter(p=>p.unit==='free').length});
 if(process.env.CHECKPOINT)fs.writeFileSync(process.env.CHECKPOINT,serialized);season=next;write();
}report.complete=true;write();console.log('PASS',report.matches,'real-engine matches');}
catch(error){report.failures.push({message:error.message,fixture:currentFixture,date:season.date,stack:error.stack});write();fs.writeFileSync('/tmp/astraball-v16-career-failure.json',JSON.stringify(season));throw error;}
