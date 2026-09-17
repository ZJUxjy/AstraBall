import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {isDeepStrictEqual} from 'node:util';

// Only the isolated, pure production match solver runs in workers. Dates,
// development, roster decisions and result commits remain in original order.
if(!isMainThread&&workerData?.academyMatchAudit){
 const {engineSimulation}=await import(workerData.runtimeURL);
 parentPort.on('message',({id,input})=>{try{parentPort.postMessage({id,result:engineSimulation(input)});}catch(error){parentPort.postMessage({id,error:error.stack});}});
 parentPort.postMessage({ready:true});
}
export async function createMatchPool(runtimeURL,count=4){
 const workers=[],pending=new Map();let serial=0;
 await Promise.all(Array.from({length:count},()=>new Promise((resolve,reject)=>{
  const worker=new Worker(new URL(import.meta.url),{workerData:{academyMatchAudit:true,runtimeURL}});workers.push(worker);
  worker.on('message',message=>{if(message.ready){resolve();return;}const task=pending.get(message.id);if(!task)return;pending.delete(message.id);message.error?task.reject(Error(message.error)):task.resolve(message.result);});
  worker.on('error',error=>{reject(error);for(const task of pending.values())task.reject(error);pending.clear();});
  worker.on('exit',code=>{if(code&&pending.size){for(const task of pending.values())task.reject(Error(`Match worker exited ${code}`));pending.clear();}});
 })));
 const run=(worker,input)=>new Promise((resolve,reject)=>{const id=serial++;pending.set(id,{resolve,reject});worker.postMessage({id,input});});
 return {
  async solve(inputs){const results=Array(inputs.length);let next=0;await Promise.all(workers.map(async worker=>{while(next<inputs.length){const i=next++;results[i]=await run(worker,inputs[i]);}}));return results;},
  async close(){await Promise.all(workers.map(worker=>worker.terminate()));}
 };
}
export async function playAuditDate(season,fixtures,{runtime,pool,onInput=()=>{},metrics={}}){
 const {playFixture,matchInput,engineSimulation}=runtime;
 if(!fixtures.length)return;
 if(fixtures.some(f=>f.date!==fixtures[0].date))throw Error('Parallel batch must contain exactly one date');
 const commit=(fixture,result,expected)=>playFixture(season,fixture.id,input=>{
  onInput(input,fixture);
  if(expected&&!isDeepStrictEqual(input,expected)){
   metrics.inputFallbacks=(metrics.inputFallbacks||0)+1;
   return engineSimulation(input);
  }
  return result||engineSimulation(input);
 });
 // The first official entry stages and commits the date's real development.
 commit(fixtures[0]);metrics.sequentialMatches=(metrics.sequentialMatches||0)+1;
 if(fixtures.length===1)return;
 const remaining=fixtures.slice(1),inputs=remaining.map(f=>matchInput(season,f));
 const clubs=[fixtures[0].home,fixtures[0].away,...inputs.flatMap(input=>[input.home.id,input.away.id])];
 if(new Set(clubs).size!==clubs.length){
  metrics.overlapDates=(metrics.overlapDates||0)+1;
  for(const fixture of remaining){commit(fixture);metrics.sequentialMatches++;}
  return;
 }
 const results=await pool.solve(inputs);
 for(let i=0;i<remaining.length;i++)commit(remaining[i],results[i],inputs[i]);
 metrics.parallelMatches=(metrics.parallelMatches||0)+remaining.length;
 metrics.parallelDates=(metrics.parallelDates||0)+1;
}
