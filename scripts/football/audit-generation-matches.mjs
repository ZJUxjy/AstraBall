import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createSeason,advanceTo,engineSimulation,validateSave} from '../../src/competitions/runtime.js';
import {advanceDevelopment} from '../../src/competitions/development.js';
import {annualPopulation,populationPlayers} from '../../src/competitions/population.js';
import {accrueEconomy,rolloverEconomy} from '../../src/competitions/market.js';
import {footballTeams} from '../../src/football/data.js';
import {available} from '../../src/football/players.js';
import {dateOf} from '../../src/competitions/calendar.js';
const path=process.env.REPORT||'artifacts/engine-evolution/v16-generation-matches.json';if(fs.existsSync(path))throw Error('Report exists');
const seedText=fs.readFileSync(process.env.CHECKPOINT||'/tmp/astraball-v16-generation-academy.json','utf8'),seed=JSON.parse(seedText),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const s=createSeason({year:seed.year+1,members:seed.members,population:seed.population,development:seed.development,economy:seed.economy});advanceDevelopment(s,s.date);accrueEconomy(s,s.date);annualPopulation(s);rolloverEconomy(s);
const files=['src/competitions/runtime.js','src/competitions/market.js','src/competitions/population.js','src/competitions/development.js','src/football/players.js','src/football/engine.js','src/football/config.js'];
const report={scope:'First competitive month across all clubs after the training-only 30-year population run. Uses actual match engine, injury/suspension health and minutes; does not fabricate past match history.',initialDate:s.date,seedHash:hash(seedText),sourceHashes:Object.fromEntries(files.map(f=>[f,hash(fs.readFileSync(f))])),matches:0,goals:0,minEligible:Infinity,minKeepers:Infinity,complete:false,failures:[]};let fixture;const clubs=new Set(),start=performance.now();
const write=()=>{report.seconds=(performance.now()-start)/1000;fs.writeFileSync(path,JSON.stringify(report,null,2)+'\n');};
try{
 assert.equal(populationPlayers(s).filter(p=>!p.intakeYear).length,0,'original generation must be fully retired');
 const simulate=input=>{fixture={home:input.home.id,away:input.away.id};for(const t of [input.home,input.away]){clubs.add(t.id);const eligible=t.roster.filter(available);report.minEligible=Math.min(report.minEligible,eligible.length);report.minKeepers=Math.min(report.minKeepers,eligible.filter(p=>p.position==='GK').length);assert.ok(eligible.length>=11);assert.ok(eligible.some(p=>p.position==='GK'));assert.ok(t.roster.every(p=>p.intakeYear));}
  const r=engineSimulation(input);assert.equal(r.status,'finished');assert.ok(r.teams.every(t=>t.stats.goals===t.players.reduce((n,p)=>n+p.goals,0)));report.matches++;report.goals+=r.score[0]+r.score[1];return r;};
 advanceTo(s,dateOf(s.year,3,31),{simulate});validateSave(s);report.clubs=clubs.size;assert.equal(clubs.size,footballTeams.length);assert.ok(report.matches>=500);report.goalsPerGame=report.goals/report.matches;assert.ok(report.goalsPerGame>=1.5&&report.goalsPerGame<=4,'late-world scoring outside broad gameplay range');report.minCash=Math.min(...Object.values(s.economy.accounts).map(a=>a.cash));assert.ok(report.minCash>=0);report.through=s.date;report.complete=true;write();console.log(report);
}catch(error){report.failures.push({message:error.message,fixture,stack:error.stack});write();throw error;}
