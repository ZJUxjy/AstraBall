import fs from 'node:fs';
import path from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {createMatchPool,playAuditDate} from './parallel-match-audit.mjs';

const invoked=performance.now();
const {values}=parseArgs({options:{out:{type:'string',default:'artifacts/academy-worker-benchmark/parallel-season'},workers:{type:'string',default:'4'},'pre-advance':{type:'boolean',default:false},'start-year':{type:'string',default:'318'}}});
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const archive=JSON.parse(gunzipSync(fs.readFileSync('artifacts/academy-world/baseline-source.json.gz')));
const isolated='/private/tmp/astraball-audit-baseline-'+archive.sourceHash.slice(0,12);
for(const [file,source] of Object.entries(archive.sources)){
 if(digest(source)!==archive.sourceHashes[file])throw Error(`Archived source hash mismatch: ${file}`);
 const target=path.join(isolated,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,source);
}
fs.writeFileSync(path.join(isolated,'package.json'),JSON.stringify({type:'module'}));
const runtimeURL=pathToFileURL(path.join(isolated,'src/competitions/runtime.js')).href;
const runtime=await import(runtimeURL),{advanceDevelopment}=await import(pathToFileURL(path.join(isolated,'src/competitions/development.js')).href),{dateOf,addDays}=await import(pathToFileURL(path.join(isolated,'src/competitions/calendar.js')).href);
const out=path.resolve(values.out);fs.mkdirSync(out,{recursive:true});
if(fs.existsSync(path.join(out,'result.json')))throw Error('Use a new output directory');
const year=Number(values['start-year']);
const season=year===318?runtime.createSeason():runtime.followingSeason(JSON.parse(gunzipSync(fs.readFileSync(`artifacts/academy-world/world-final/season-${year-1}.json.gz`))).season);
const reference=JSON.parse(gunzipSync(fs.readFileSync(`artifacts/academy-world/world-final/season-${year}.json.gz`))).season;
const report={kind:'production-engine-same-day-parallel-parity',baselineSourceHash:archive.sourceHash,isolated,year,workers:Number(values.workers),preAdvance:values['pre-advance'],setupSeconds:(performance.now()-invoked)/1000,metrics:{},months:[],startedAt:new Date().toISOString(),toolHashes:Object.fromEntries(['scripts/football/parallel-match-audit.mjs','scripts/football/benchmark-audit-parallel-season.mjs'].map(f=>[f,digest(fs.readFileSync(f))]))};
const start=performance.now(),pool=await createMatchPool(runtimeURL,report.workers);
try{
 for(let month=1;month<=12;month++){
  const end=month===12?dateOf(year,12,31):addDays(dateOf(year,month+1,1),-1);
  const fixtures=runtime.pendingMatches(season).filter(m=>m.date<=end),dates=[...new Set(fixtures.map(m=>m.date))];
  for(const date of dates){
   if(values['pre-advance']&&season.development.through<date)advanceDevelopment(season,date);
   await playAuditDate(season,fixtures.filter(m=>m.date===date),{runtime,pool,metrics:report.metrics});
  }
  runtime.finishDate(season,end);runtime.validateSave(season);
  const entry={date:end,matches:season.fixtures.filter(m=>m.score).length,elapsedSeconds:(performance.now()-start)/1000};report.months.push(entry);console.log(JSON.stringify(entry));
 }
 const actual=JSON.stringify(season),expected=JSON.stringify(reference);
 report.seasonHash=digest(actual);report.referenceHash=digest(expected);report.bytes=Buffer.byteLength(actual);report.exact=actual===expected;report.elapsedSeconds=(performance.now()-start)/1000;report.totalElapsedSeconds=(performance.now()-invoked)/1000;
 fs.writeFileSync(path.join(out,'season.json.gz'),gzipSync(actual,{level:1}));
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
 if(!report.exact)throw Error('Full season differs from serial baseline');
 if(report.metrics.inputFallbacks)throw Error('Inputs changed before commit; inspect dependencies');
}finally{await pool.close();}
