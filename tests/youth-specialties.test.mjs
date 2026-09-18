import {toSkill,calibratePotential} from '../src/football/ability.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generateYouthPlayer,developWeek,publicProfile} from '../src/football/players.js';
import {youthSpecialties} from '../src/football/youth-specialties.js';
import {createSeason,validateSave} from '../src/competitions/runtime.js';
import {advanceDevelopment} from '../src/competitions/development.js';
const sample=Array.from({length:4000},(_,i)=>generateYouthPlayer({id:`specialty-test-${i}`,seed:'specialty-test',age:16,position:'CM'}));
const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
const values=k=>sample.map(p=>p.attributes[k]);
function correlation(a,b){const x=mean(a),y=mean(b);return a.reduce((s,n,i)=>s+(n-x)*(b[i]-y),0)/Math.sqrt(a.reduce((s,n)=>s+(n-x)**2,0)*b.reduce((s,n)=>s+(n-y)**2,0));}

test('相关专项形成技术特点，同时保留跨专项短板',()=>{
 assert.ok(correlation(values('passing'),values('longPassing'))>correlation(values('passing'),values('finishing'))+.06);
 assert.ok(correlation(values('dribbling'),values('technique'))>correlation(values('dribbling'),values('tackling'))+.06);
 assert.ok(sample.filter(p=>p.attributes.corners-p.attributes.freeKicks>10).length>100);
 assert.ok(sample.filter(p=>p.attributes.freeKicks-p.attributes.corners>10).length>100);
});

test('定位球不再共用相同分布，既往练习不直接提高发展上限',()=>{
 const corner=mean(values('corners')),free=mean(values('freeKicks')),pen=mean(values('penalties'));
 assert.ok(pen>corner+1);assert.ok(corner>free+1);
 let differingPractice=0;
 for(let i=0;i<300;i++){
  const base={id:`practice-${i}`,seed:'practice'},wide=youthSpecialties({...base,position:'LW'}),central=youthSpecialties({...base,position:'CM'});
  assert.deepEqual(wide.ceiling,central.ceiling);
  if(wide.initial.corners!==central.initial.corners)differingPractice++;
 }
 assert.ok(differingPractice>5);
});

test('门将传控与终结有不同起点，外场守门分支仍保持低值',()=>{
 const keepers=Array.from({length:300},(_,i)=>generateYouthPlayer({id:`specialty-keeper-${i}`,position:'GK'}));
 assert.ok(mean(keepers.map(p=>p.attributes.passing-p.attributes.finishing))>9);
 assert.ok(sample.every(p=>p.attributes.reflexes<=21));
 assert.ok(sample.every(p=>publicProfile(p).growthProfile===undefined));
});

test('旧青年存档保持原属性和包络，新旧球员均可继续成长',async()=>{
 let source=fs.readFileSync(new URL('../artifacts/youth-current-billion/sources/players.js',import.meta.url),'utf8');
 source=source.replace(/from '(\.\/[^']+)'/g,(_,name)=>`from '${new URL('../src/football/'+name.slice(2),import.meta.url).href}'`);
 const old=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const s=createSeason(),id='youth:318:bridge:1',fresh=s.playerRegistry.players[id];
 const legacy=old.generateYouthPlayer({id,seed:'intake:318',age:16,position:fresh.position,identity:{club:fresh.club,city:fresh.city,ageReferenceDate:fresh.ageReferenceDate}});
 delete s.abilityVersion;for(const p of Object.values(s.playerRegistry.players)){p.potential=toSkill(p.potential);delete p.abilityVersion;}
 s.playerRegistry.players[id]={...fresh,...legacy};delete s.playerRegistry.players[id].abilityVersion;
 const before=structuredClone(s.playerRegistry.players[id]);
 assert.equal(before.growthProfile.generationVersion,undefined);
 const restored=validateSave(JSON.parse(JSON.stringify(s)));
 assert.deepEqual(restored.playerRegistry.players[id].attributes,before.attributes);assert.deepEqual(restored.playerRegistry.players[id].growthProfile,before.growthProfile);assert.equal(restored.playerRegistry.players[id].potential,calibratePotential(before.potential,id));
 advanceDevelopment(restored,'0318-01-08');
 assert.deepEqual(restored.playerRegistry.players[id].attributes,before.attributes);assert.deepEqual(restored.playerRegistry.players[id].growthProfile,before.growthProfile);assert.equal(restored.playerRegistry.players[id].potential,calibratePotential(before.potential,id));
 assert.notDeepEqual(restored.development.records[id].attributes,before.attributes);
 const authored=generateYouthPlayer({id:'new-specialty-authored',potential:157});
 const frozen=structuredClone(authored.growthProfile);let adult=authored;
 for(let i=0;i<624;i++)adult=developWeek(adult,{minutes:90});
 assert.deepEqual(adult.growthProfile,frozen);
 assert.ok(Object.entries(adult.attributes).every(([k,v])=>v<=frozen.ceilings[k]+1e-10));
});
