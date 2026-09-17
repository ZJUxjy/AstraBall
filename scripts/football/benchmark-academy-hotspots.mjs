import fs from 'node:fs';
import zlib from 'node:zlib';
import {performance} from 'node:perf_hooks';
import {Worker,isMainThread,parentPort} from 'node:worker_threads';
import inspector from 'node:inspector';

const output='artifacts/academy-worker-benchmark/hotspots.json';
if(isMainThread){
 const report={source:'artifacts/academy-world/world-final/season-329.json.gz',diagnosticOnly:true,note:'克隆第12季结束状态；未来半年/年末仅调用人员流转，不推进比赛或成长，非模型结果。总时限52秒。',stages:[]};
 const worker=new Worker(new URL(import.meta.url));let active=null;
 const save=()=>{fs.mkdirSync('artifacts/academy-worker-benchmark',{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');};
 const deadline=setTimeout(async()=>{report.timedOutStage=active;report.limitSeconds=52;save();console.log(JSON.stringify(report,null,2));await worker.terminate();},52000);
 worker.on('message',message=>{
  if(message.type==='start'){active=message.name;console.log(`start ${active}`);}
  if(message.type==='result'){report.stages.push(message.result);save();console.log(JSON.stringify(message.result));}
  if(message.type==='done'){clearTimeout(deadline);report.completed=true;save();console.log(JSON.stringify(report,null,2));worker.terminate();}
 });
 worker.on('error',error=>{clearTimeout(deadline);report.error=error.stack;save();console.error(error);process.exitCode=1;});
}else{
 const {advanceDevelopment}=await import('../../src/competitions/development.js');
 const {registeredRoster}=await import('../../src/competitions/registry.js');
 const {advanceYouthPathways}=await import('../../src/competitions/youth.js');
 const {footballTeams}=await import('../../src/football/data.js');
 const raw=JSON.parse(zlib.gunzipSync(fs.readFileSync('artifacts/academy-world/world-final/season-329.json.gz')));
 const original=raw.state||raw.season||raw;
 const session=new inspector.Session();session.connect();
 const post=(method,params={})=>new Promise((resolve,reject)=>session.post(method,params,(error,result)=>error?reject(error):resolve(result)));
 await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:1000});
 const stages=[
  ['advanceDevelopment-one-week',s=>advanceDevelopment(s,'0330-01-07')],
  ['registeredRoster-268-clubs',s=>{let players=0;for(const team of footballTeams)players+=registeredRoster(s,team.id).length;return {players};}],
  ['advanceYouthPathways-halfyear',s=>{s.date='0330-06-30';advanceYouthPathways(s,s.date);}],
  ['advanceYouthPathways-yearend',s=>{s.date='0330-12-31';advanceYouthPathways(s,s.date);}]
 ];
 for(const [name,fn] of stages){
  parentPort.postMessage({type:'start',name});const cloneStart=performance.now(),s=structuredClone(original),cloneMs=performance.now()-cloneStart;
  await post('Profiler.start');const start=performance.now(),details=fn(s),elapsedMs=performance.now()-start,{profile}=await post('Profiler.stop');
  const totals=new Map();for(const node of profile.nodes){const location=`${node.callFrame.functionName||'(anonymous)'} ${node.callFrame.url.split('/').slice(-2).join('/')}:${node.callFrame.lineNumber+1}`;totals.set(location,(totals.get(location)||0)+(node.hitCount||0));}
  const samples=[...totals.values()].reduce((a,b)=>a+b,0),hotspots=[...totals].sort((a,b)=>b[1]-a[1]).slice(0,14).map(([location,count])=>({location,samples:count,share:+(count/samples).toFixed(4)}));
  parentPort.postMessage({type:'result',result:{name,elapsedMs,cloneMs,details,hotspots}});
 }
 session.disconnect();parentPort.postMessage({type:'done'});
}
