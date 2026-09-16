import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {LEGACY_ENGINES} from '../src/football/legacy.js';
import {createMatch,stepMatch,applyCommand,getResult,snapshotMatch,restoreMatch} from '../src/football/engine.js';
import {generateTeam} from '../src/football/players.js';
const input={home:generateTeam({id:'legacy-h'}),away:generateTeam({id:'legacy-a'}),seed:55821};
test('V6—V13 未完赛快照在新版本继续，事件与各自旧引擎逐字一致',()=>{
 for(const [version,engine] of Object.entries(LEGACY_ENGINES)){
  const original=engine.createMatch({...input,ai:[false,Number(version)>=10]});original.version=Number(version);for(let i=0;i<160;i++)engine.stepMatch(original);
  const resumed=restoreMatch(JSON.parse(JSON.stringify(engine.snapshotMatch(original))));
  const out=original.teams[0].slots.at(-1).id,incoming=original.teams[0].roster.find(p=>!original.teams[0].used.has(p.id)).id;
  const command={type:'substitution',side:0,out,in:incoming};engine.applyCommand(original,command);applyCommand(resumed,command);
  const again=restoreMatch(JSON.parse(JSON.stringify(snapshotMatch(resumed))));
  while(engine.stepMatch(original));while(stepMatch(again));assert.deepEqual(getResult(again),engine.getResult(original),`version ${version}`);
 }
});
test('冻结的旧引擎与归档哈希一致，避免新校准污染老比赛',()=>{
 const manifest=JSON.parse(fs.readFileSync('src/football/legacy/manifest.json'));
 for(const [version,record] of Object.entries(manifest))for(const [file,hash] of Object.entries(record.hashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(`src/football/legacy/v${version}/${file}`)).digest('hex'),hash);
});
test('拒绝损坏的位置、名单、统计及随机游标，不静默重抽比赛',()=>{
 const snapshot=snapshotMatch(createMatch(input));
 for(const corrupt of [s=>s.randomState=NaN,s=>s.x=Infinity,s=>s.side=4,s=>s.teams[0].slots[1].id=s.teams[0].slots[0].id,s=>s.teams[0].lines[s.teams[0].slots[2].id].position=[NaN,30],s=>s.teams[0].stats.goals=5]){const s=structuredClone(snapshot);corrupt(s);assert.throws(()=>restoreMatch(s),/存档/);}
 assert.deepEqual(snapshotMatch(restoreMatch(snapshot)),snapshot);
});
test('V13 兼容层不改变 V12 已校准的比赛动作与统计',()=>{
 const old=LEGACY_ENGINES[12];
 for(let seed=0;seed<20;seed++){
  const options={...input,seed:9200000+seed,ai:[seed%2===0,true]};
  const a=createMatch(options),b=old.createMatch(options);while(stepMatch(a));while(old.stepMatch(b));
  const {version:av,...ar}=getResult(a),{version:bv,...br}=old.getResult(b);assert.notEqual(av,bv);assert.deepEqual(ar,br);
 }
});
