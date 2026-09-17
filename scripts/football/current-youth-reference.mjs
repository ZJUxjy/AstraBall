import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {ATTRIBUTE_GROUPS,ATTRIBUTE_KEYS,POSITIONS,POSITION_WEIGHTS,generateYouthPlayer,preciseRating} from '../../src/football/players.js';

const root=new URL('../../',import.meta.url);
const output=new URL('artifacts/youth-current-billion/',root);
const seed='billion-current-v1';
const total=1_000_000_000;
const positions=Object.keys(POSITIONS);
const attributes=Object.entries(ATTRIBUTE_GROUPS).flatMap(([groupId,definition],group)=>
  Object.entries(definition.fields).map(([key,label])=>({key,label,group,groupId})));
assert.deepEqual(attributes.map(a=>a.key),ATTRIBUTE_KEYS);
// This directory is a historical experiment. Never relabel its native checkpoints
// after the JavaScript generator changes.
const sourceFiles=['src/football/players.js','src/football/random.js','src/football/body.js'];
const sources=Object.fromEntries(await Promise.all(sourceFiles.map(async path=>[path,{sha256:createHash('sha256').update(await readFile(new URL(path,root))).digest('hex')}])));
for(const name of ['model.json','summary.json']){
  let baseline;
  try{baseline=JSON.parse(await readFile(new URL(name,output),'utf8'));}catch(error){if(error.code==='ENOENT')continue;throw error;}
  const hashes=name==='model.json'?Object.fromEntries(Object.entries(baseline.sources??{}).map(([path,value])=>[path,value.sha256])):baseline.sourceHashes;
  for(const path of sourceFiles)assert.equal(hashes?.[path],sources[path].sha256,`Historical experiment source mismatch in ${name}: ${path}. Refusing to overwrite the baseline. Create a separate experiment and update/verify its native implementation.`);
}
const indices=[...Array.from({length:300},(_,i)=>i),...Array.from({length:700},(_,i)=>Math.round(300+i*(total-1-300)/699))];
assert.equal(new Set(indices).size,1000);
const reference=indices.map(index=>{
  const age=15+index%3,position=positions[Math.floor(index/3)%positions.length];
  const player=generateYouthPlayer({id:`billion-${index}`,seed,age,position});
  return {index,age,position,ca:preciseRating(player),pa:player.potential,attributes:ATTRIBUTE_KEYS.map(key=>player.attributes[key])};
});
const model={
  version:1,
  attributes,
  positions:positions.map(id=>({id,label:POSITIONS[id],weights:ATTRIBUTE_KEYS.map(key=>POSITION_WEIGHTS[id][key]??0)})),
  sources,
  samplePopulation:{
    count:total,seed,idTemplate:'billion-${index}',indexRange:[0,total-1],
    ageFormula:'15 + index % 3',positionFormula:'Object.keys(POSITIONS)[Math.floor(index / 3) % 10]',
    ageCounts:{15:333333334,16:333333333,17:333333333},
    positionCounts:Object.fromEntries(positions.map((id,p)=>[id,Math.floor(total/30)*3+Math.max(0,Math.min(3,total%30-p*3))])),
    source:'generateYouthPlayer with default random potential; no explicit potential or quality override',
    interpretation:'Synthetic balanced academy intake aged 15–17. This is the current game generator, not a fitted general-population distribution or a longitudinal adult career simulation.',
    ca:'Position-weighted mean of initial attributes, before display rounding.',
    pa:'Position-weighted mean of hidden attribute ceilings, before display rounding; not guaranteed attained adult ability.',
    attributes:'All 42 initial attributes, before display rounding; body height and weight are separate from these ability attributes.',
    randomness:'Existing game RNG hashes each seed to 32 bits. One billion IDs do not imply one billion independent RNG states; hash collisions retain the existing generator behavior.',
  },
  referenceSample:{count:reference.length,indexSelection:'0–299 inclusive, plus 700 unique evenly spaced indices from 300 to 999999999 inclusive',absoluteTolerance:1e-10},
};
const header=[
  '// Generated from model.json; regenerate using current-youth-reference.mjs.',
  `const int GROUP[${attributes.length}]={${attributes.map(a=>a.group).join(',')}};`,
  `const int WEIGHTS[${positions.length}][${attributes.length}]={${model.positions.map(p=>`{${p.weights.join(',')}}`).join(',')}};`,
  `const char* POS[${positions.length}]={${positions.map(p=>JSON.stringify(p)).join(',')}};`,
];
const headerText=header.join('\n')+'\n';
// Fresh experiments also record native provenance, so their first verification
// does not need an already aggregated summary to establish source identity.
sources['scripts/football/current-youth-native.cpp']={sha256:createHash('sha256').update(await readFile(new URL('scripts/football/current-youth-native.cpp',root))).digest('hex')};
sources['scripts/football/current-youth-model.hpp']={sha256:createHash('sha256').update(headerText).digest('hex')};
await mkdir(output,{recursive:true});
await writeFile(new URL('model.json',output),JSON.stringify(model,null,2)+'\n');
await writeFile(new URL('reference.json',output),JSON.stringify(reference)+'\n');
await writeFile(new URL('reference-indices.txt',output),indices.join('\n')+'\n');
await writeFile(new URL('scripts/football/current-youth-model.hpp',root),headerText);
console.log(JSON.stringify({output:fileURLToPath(output),referenceCount:reference.length,attributes:attributes.length,positions:positions.length,sources},null,2));
