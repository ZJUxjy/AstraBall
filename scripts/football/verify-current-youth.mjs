import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';

const root=new URL('../../',import.meta.url);
const output=new URL('../../artifacts/youth-current-billion/',import.meta.url);
// Check provenance before writing anything, including a failed validation report.
// Comparing two old reference files alone cannot validate the current generator.
const model=JSON.parse(await readFile(new URL('model.json',output),'utf8'));
let summary;
try{summary=JSON.parse(await readFile(new URL('summary.json',output),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const sourceHashes={};
for(const path of ['src/football/players.js','src/football/random.js','src/football/body.js','scripts/football/current-youth-native.cpp','scripts/football/current-youth-model.hpp']){
  const actual=createHash('sha256').update(await readFile(new URL(path,root))).digest('hex');
  const expected=model.sources?.[path]?.sha256??summary?.sourceHashes?.[path];
  assert.ok(expected,`Missing experiment source hash: ${path}. Record native provenance before validation.`);
  assert.equal(actual,expected,`Historical experiment source mismatch: ${path}. Refusing to overwrite validation.json or validate the current generator from historical references. Create a separate experiment and update its native implementation.`);
  if(summary)assert.equal(summary.sourceHashes?.[path],expected,`Model and summary source hashes disagree: ${path}`);
  sourceHashes[path]=expected;
}
const report={sourceHashes,sampleCount:0,comparedValuesPerPlayer:44,maxAbsoluteDifference:0,tolerance:1e-10,passed:false,nativeMath:'Apple Accelerate vector double log/cos/sqrt; floating-point contraction disabled'};
try{
  const [reference,native]=await Promise.all(['reference.json','native-reference.json'].map(async name=>JSON.parse(await readFile(new URL(name,output),'utf8'))));
  assert.ok(Array.isArray(reference)&&Array.isArray(native),'Both reference files must contain arrays');
  assert.ok(reference.length>=1000,'At least 1000 JS reference samples are required');
  assert.equal(native.length,reference.length,'Native and JS sample counts differ');
  const nativeByIndex=new Map(native.map(p=>[p.index,p]));
  assert.equal(nativeByIndex.size,native.length,'Native sample indices must be unique');
  assert.equal(new Set(reference.map(p=>p.index)).size,reference.length,'JS sample indices must be unique');
  let firstMismatch;
  for(const expected of reference){
    assert.ok(Number.isInteger(expected.index)&&expected.index>=0&&expected.index<1_000_000_000,'Invalid JS sample index');
    const actual=nativeByIndex.get(expected.index);
    assert.ok(actual,`Native sample missing index ${expected.index}`);
    assert.ok(Array.isArray(expected.attributes)&&expected.attributes.length===42,`JS attribute count differs at ${expected.index}`);
    assert.ok(Array.isArray(actual.attributes)&&actual.attributes.length===42,`Native attribute count differs at ${expected.index}`);
    const expectedValues=[expected.ca,expected.pa,...expected.attributes];
    const actualValues=[actual.ca,actual.pa,...actual.attributes];
    for(let i=0;i<expectedValues.length;i++){
      assert.ok(Number.isFinite(expectedValues[i])&&Number.isFinite(actualValues[i]),`Non-finite metric at index ${expected.index}, metric ${i}`);
      const difference=Math.abs(expectedValues[i]-actualValues[i]);
      report.maxAbsoluteDifference=Math.max(report.maxAbsoluteDifference,difference);
      if(difference>report.tolerance)firstMismatch??={index:expected.index,metric:i===0?'ca':i===1?'pa':`attributes[${i-2}]`,expected:expectedValues[i],actual:actualValues[i]};
    }
    report.sampleCount++;
  }
  report.passed=!firstMismatch;
  if(firstMismatch)report.firstMismatch=firstMismatch;
}catch(error){
  report.error=error.message;
}
await writeFile(new URL('validation.json',output),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!report.passed)process.exitCode=1;
