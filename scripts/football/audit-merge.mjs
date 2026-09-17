import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createSeason,advanceTo,engineSimulation,validateSave,pendingMatches} from '../../src/competitions/runtime.js';
import {ensureEconomy,validateEconomy} from '../../src/competitions/market.js';
import {available} from '../../src/football/players.js';
const reportPath=process.env.REPORT||'/tmp/astraball-merge-season.json';
if(fs.existsSync(reportPath))throw Error('Report already exists');
const s=createSeason();ensureEconomy(s);const start=performance.now(),report={scope:'V18 merged registry, academy, finance and actual match engine through the first competitive month',matches:0,clubs:[],goals:0,minEligible:100,minKeepers:100};const clubs=new Set();
const simulate=input=>{for(const t of [input.home,input.away]){clubs.add(t.id);const ready=t.roster.filter(available);report.minEligible=Math.min(report.minEligible,ready.length);report.minKeepers=Math.min(report.minKeepers,ready.filter(p=>p.position==='GK').length);assert.ok(ready.length>=11&&ready.some(p=>p.position==='GK'));assert.equal(new Set(t.roster.map(p=>p.id)).size,t.roster.length);}const result=engineSimulation(input);assert.equal(result.status,'finished');report.matches++;report.goals+=result.score[0]+result.score[1];return result;};
for(const date of ['0318-01-31','0318-02-28','0318-03-31']){advanceTo(s,date,{simulate});validateSave(JSON.parse(JSON.stringify(s)));validateEconomy(s);assert.equal(s.population,undefined);console.log(date,report.matches);}
assert.equal(pendingMatches(s).filter(m=>m.date<=s.date).length,0);
Object.assign(report,{complete:true,through:s.date,clubs:[...clubs].sort(),goalsPerGame:report.goals/report.matches,minCash:Math.min(...Object.values(s.economy.accounts).map(a=>a.cash)),registryPlayers:Object.keys(s.playerRegistry.players).length,movements:s.economy.moves.length,seconds:(performance.now()-start)/1000,sourceHashes:Object.fromEntries(['runtime','market','population','registry','youth','development'].map(name=>{const file=`src/competitions/${name}.js`;return [file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')];}))});
assert.ok(report.minCash>=0);fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log('PASS',report.matches,report.goalsPerGame,reportPath);
