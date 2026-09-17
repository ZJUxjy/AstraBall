import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import fs from 'node:fs';

const importStart=performance.now();
const {createSeason,matchInput,engineSimulation}=await import('../../src/competitions/runtime.js');
const runtimeImportMs=performance.now()-importStart;
if(!isMainThread){
 parentPort.postMessage({type:'ready',runtimeImportMs});
 parentPort.on('message',({id,input})=>{try{parentPort.postMessage({type:'result',id,result:engineSimulation(input)});}catch(error){parentPort.postMessage({type:'error',id,error:error.stack});}});
}else{
 const {advanceDevelopment}=await import('../../src/competitions/development.js');
 const report={benchmark:'same-day-independent-production-engine',workers:4,mainRuntimeImportMs:runtimeImportMs,startedAt:new Date().toISOString()};
 const preparationStart=performance.now(),s=createSeason(),date=s.fixtures.find(f=>!f.bye).date;
 advanceDevelopment(s,date);s.date=date;
 const fixtures=s.fixtures.filter(f=>!f.bye&&f.date===date).slice(0,128),inputs=fixtures.map(f=>matchInput(s,f));
 const ids=inputs.flatMap(input=>[input.home.id,input.away.id]);assert.equal(new Set(ids).size,ids.length,'比赛日球队重复，不能独立并行');
 report.date=date;report.matches=inputs.length;report.preparationMs=performance.now()-preparationStart;
 const pending=new Map(),workers=[],ready=[];let serial=0;
 const startupStart=performance.now();
 for(let index=0;index<4;index++){
  const worker=new Worker(new URL(import.meta.url),{workerData:{index}});workers.push(worker);
  ready.push(new Promise((resolve,reject)=>{
   worker.on('message',message=>{if(message.type==='ready')resolve(message.runtimeImportMs);else{const task=pending.get(message.id);if(!task)return;pending.delete(message.id);message.type==='error'?task.reject(Error(message.error)):task.resolve(message.result);}});
   worker.on('error',error=>{reject(error);for(const task of pending.values())task.reject(error);pending.clear();});
  }));
 }
 const run=(worker,input)=>new Promise((resolve,reject)=>{const id=serial++;pending.set(id,{resolve,reject});worker.postMessage({id,input});});
 try{
  report.workerRuntimeImportMs=await Promise.all(ready);report.poolStartupMs=performance.now()-startupStart;
  let start=performance.now();for(let i=0;i<4;i++)engineSimulation(inputs[i%inputs.length]);report.sequentialWarmupMs=performance.now()-start;
  start=performance.now();await Promise.all(workers.map((worker,i)=>run(worker,inputs[i%inputs.length])));report.parallelWarmupMs=performance.now()-start;
  start=performance.now();const sequential=inputs.map(input=>engineSimulation(input));report.sequentialMs=performance.now()-start;
  start=performance.now();const parallel=Array(inputs.length);let next=0;
  await Promise.all(workers.map(async worker=>{while(next<inputs.length){const index=next++;parallel[index]=await run(worker,inputs[index]);}}));
  report.parallelMs=performance.now()-start;
  for(let i=0;i<inputs.length;i++)assert.deepEqual(parallel[i],sequential[i],fixtures[i].id);
  report.exactResults=true;report.speedup=report.sequentialMs/report.parallelMs;report.totalSimulations=inputs.length*2+8;
  report.note='含 worker 消息输入/结果复制；不含创建世界、生产模块预加载、预热。与正在运行的长期审计共享主机。只比较比赛求解，未改日历或提交逻辑。';
  fs.mkdirSync('artifacts/academy-worker-benchmark',{recursive:true});fs.writeFileSync('artifacts/academy-worker-benchmark/result.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
 }finally{await Promise.all(workers.map(worker=>worker.terminate()));}
}
