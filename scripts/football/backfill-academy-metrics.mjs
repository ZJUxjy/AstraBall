import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {registeredPlayers} from '../../src/competitions/registry.js';
import {youthAuditMetrics} from './academy-world-metrics.mjs';
const source='artifacts/academy-world/world-final',report=JSON.parse(fs.readFileSync(path.join(source,'report.json')));
if(report.status!=='completed'||report.seasons.length!==20)throw Error('The archived baseline must contain twenty completed seasons');
const result={sourceHash:report.sourceHash,scope:'Read-only enrichment of the unchanged completed baseline. Official minutes and full registration histories from original snapshots. No games replayed; no new AI policy applied. Expected-role diagnostics unavailable for the old selector.',helperHash:createHash('sha256').update(fs.readFileSync('scripts/football/academy-world-metrics.mjs')).digest('hex'),seasons:[]};
for(const row of report.seasons){
 const season=JSON.parse(gunzipSync(fs.readFileSync(path.join(source,`season-${row.year}.json.gz`)))).season,actualMinutes=new Map();
 for(const fixture of season.fixtures)for(const lines of fixture.report?.players||[])for(const line of lines)actualMinutes.set(line.id,(actualMinutes.get(line.id)||0)+line.minutes);
 const players=new Map(registeredPlayers(season,{includeRetired:true}).map(p=>[p.id,p]));
 result.seasons.push({year:row.year,...youthAuditMetrics(season,{players,teams:row.teams,actualMinutes})});
 console.log(JSON.stringify({year:row.year,groups:result.seasons.at(-1).agePotentialRealization.length}));
}
fs.writeFileSync('artifacts/academy-world/baseline-comparable-metrics.json',JSON.stringify(result,null,2)+'\n');
