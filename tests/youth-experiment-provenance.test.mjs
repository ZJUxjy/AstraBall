import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const sourcePaths=['src/football/players.js','src/football/random.js','src/football/body.js','scripts/football/current-youth-native.cpp','scripts/football/current-youth-model.hpp'];
const scripts=['current-youth-reference.mjs','verify-current-youth.mjs','summarize-current-youth.py'];
const baselineNames=['model.json','summary.json','reference.json','native-reference.json','validation.json'];
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'astraball-provenance-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const folder=join(root,'artifacts/youth-current-billion');
  await Promise.all(['src/football','scripts/football','artifacts/youth-current-billion'].map(path=>mkdir(join(root,path),{recursive:true})));
  await writeFile(join(root,'package.json'),' {"type":"module"} ');
  // Only the reference script imports these exports. Source mismatch must fail
  // before it can call the generator or touch any historical output.
  const stub='export const ATTRIBUTE_GROUPS={a:{fields:{x:"X"}}}, ATTRIBUTE_KEYS=["x"], POSITIONS={GK:"GK"}, POSITION_WEIGHTS={}; export function generateYouthPlayer(){throw Error("Generator must not run before provenance checks");} export function preciseRating(){}\n';
  const hashes={};
  for(const path of sourcePaths){
    const content=path.endsWith('players.js')?stub:'// fixture source\n';
    await writeFile(join(root,path),content);
    hashes[path]=createHash('sha256').update(content).digest('hex');
  }
  await Promise.all(scripts.map(name=>copyFile(new URL(`../scripts/football/${name}`,import.meta.url),join(root,'scripts/football',name))));
  const samples=Array.from({length:1000},(_,index)=>({index,ca:50,pa:70,attributes:Array(42).fill(50)}));
  const baseline={
    'model.json':{sources:Object.fromEntries(sourcePaths.slice(0,3).map(path=>[path,{sha256:hashes[path]}]))},
    'summary.json':{sourceHashes:hashes},
    'reference.json':samples,'native-reference.json':samples,'validation.json':{passed:true,historical:true},
  };
  for(const [name,value] of Object.entries(baseline))await writeFile(join(folder,name),JSON.stringify(value));
  return {root,folder,hashes};
}
async function snapshot(folder){return Object.fromEntries(await Promise.all(baselineNames.map(async name=>[name,await readFile(join(folder,name),'utf8')])));}
function run(root,script){return spawnSync(script.endsWith('.py')?'python3':process.execPath,[join(root,'scripts/football',script)],{encoding:'utf8'});}

for(const script of scripts)test(`${script} rejects changed generator without rewriting historical artifacts`,async t=>{
  const {root,folder}=await fixture(t),before=await snapshot(folder);
  await writeFile(join(root,sourcePaths[0]),(await readFile(join(root,sourcePaths[0]),'utf8'))+'// new generation version\n');
  const result=run(root,script);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Historical experiment source mismatch/);
  assert.deepEqual(await snapshot(folder),before);
});

test('reference refuses a relabeled model when summary still records the original source',async t=>{
  const {root,folder,hashes}=await fixture(t);
  const summary={sourceHashes:{...hashes,[sourcePaths[0]]:'historical-hash'}};
  await writeFile(join(folder,'summary.json'),JSON.stringify(summary));
  const before=await snapshot(folder),result=run(root,scripts[0]);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/source mismatch in summary.json/);
  assert.deepEqual(await snapshot(folder),before);
});

test('verify rejects a changed native implementation before overwriting validation',async t=>{
  const {root,folder}=await fixture(t),before=await snapshot(folder);
  await writeFile(join(root,sourcePaths[3]),'// different native implementation\n');
  const result=run(root,scripts[1]);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Historical experiment source mismatch/);
  assert.deepEqual(await snapshot(folder),before);
});

test('verify allows matching recorded sources and reports exactly the verified source hashes',async t=>{
  const {root,folder,hashes}=await fixture(t),result=run(root,scripts[1]);
  assert.equal(result.status,0,result.stderr);
  const validation=JSON.parse(await readFile(join(folder,'validation.json'),'utf8'));
  assert.equal(validation.passed,true);
  assert.equal(validation.sampleCount,1000);
  assert.deepEqual(validation.sourceHashes,hashes);
});

test('first verification accepts native provenance recorded in the model without a summary',async t=>{
  const {root,folder,hashes}=await fixture(t);
  await writeFile(join(folder,'model.json'),JSON.stringify({sources:Object.fromEntries(Object.entries(hashes).map(([path,sha256])=>[path,{sha256}]))}));
  await rm(join(folder,'summary.json'));
  const result=run(root,scripts[1]);
  assert.equal(result.status,0,result.stderr);
  const validation=JSON.parse(await readFile(join(folder,'validation.json'),'utf8'));
  assert.equal(validation.passed,true);
  assert.deepEqual(validation.sourceHashes,hashes);
});
