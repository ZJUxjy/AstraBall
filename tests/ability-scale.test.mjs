import test from 'node:test';
import assert from 'node:assert/strict';
import {toAbility,toSkill,talentCeiling,calibratePotential} from '../src/football/ability.js';
import {ATTRIBUTE_KEYS,generatePlayer,generateYouthPlayer,preciseRating,developWeek} from '../src/football/players.js';
import {migrateAbilities} from '../src/competitions/ability-migration.js';
import {createSeason,validateSave} from '../src/competitions/runtime.js';
import {marketWage,marketTransferValue} from '../src/competitions/economics.js';
import {footballTeams} from '../src/football/data.js';
import {materializeLocal} from '../src/competitions/local-bridge.js';

test('CA/PA采用200分制，80校准为145，曲线可逆且单调',()=>{
 assert.equal(toAbility(80),145);assert.equal(toAbility(85),160);assert.equal(toAbility(90),175);assert.equal(toAbility(99),200);
 for(let raw=1;raw<=99;raw+=.1){assert.ok(Math.abs(toSkill(toAbility(raw))-raw)<1e-10);assert.ok(toAbility(raw)>=1&&toAbility(raw)<=200);}
 const p=generatePlayer({id:'uniform'});p.attributes=Object.fromEntries(ATTRIBUTE_KEYS.map(k=>[k,80]));assert.equal(preciseRating(p),145);
});
test('普通潜力不超过180；天才和传奇使用独立、可复现的稀缺分布',()=>{
 const ps=Array.from({length:100000},(_,i)=>talentCeiling('rarity-'+i));
 const genius=ps.filter(n=>n>180).length,legend=ps.filter(n=>n>190).length;
 assert.ok(genius>=60&&genius<=140);assert.ok(legend>=1&&legend<=7);
 assert.equal(talentCeiling('fixed'),talentCeiling('fixed'));
 const roster=footballTeams.flatMap(t=>t.roster);
 assert.ok(roster.every(p=>preciseRating(p)<=200&&p.potential<=200&&p.potential+1e-8>=preciseRating(p)));
 assert.ok(roster.filter(p=>preciseRating(p)>180).length<roster.length*.002);
 assert.ok(roster.filter(p=>preciseRating(p)>=160&&preciseRating(p)<=180).length>100);
});
test('高潜力成长守住CA≤PA，属性保留原单位，顶级估值不会因换算爆炸',()=>{
 for(const pa of [145,180,195,200]){
  let p=generateYouthPlayer({id:'grow-'+pa,potential:pa});const start=preciseRating(p);
  for(let week=0;week<520;week++)p=developWeek(p,{minutes:90});
  assert.ok(preciseRating(p)>start);assert.ok(preciseRating(p)<=pa+1e-8);
  assert.ok(Object.values(p.attributes).every(n=>n>=1&&n<=99));
 }
 const legacyWage=raw=>Math.max(700,Math.round(3000*Math.pow(1.11,raw-40)/7)*7);
 for(const raw of [40,60,70,80,85,90,97,99])assert.equal(marketWage(toAbility(raw)),legacyWage(raw));
 const price=ca=>marketTransferValue({ability:ca,age:24,remainingDays:1095,position:'ST'});
 assert.ok(price(175)>1e8&&price(175)<3e8);assert.ok(price(195)>price(175));assert.ok(price(145)<price(175));
});
test('旧档转换只改能力字段，保留钱、比赛快照和原始属性，重复读取不重复放大',()=>{
 const p=generatePlayer({id:'old-player',quality:70});delete p.abilityVersion;p.potential=85;
 const local={id:'grass-old',ability:55,potential:80,history:[{year:317,ability:54}]};
 const s={playerRegistry:{players:{[p.id]:p},observations:{x:{forecastLow:70,forecastHigh:90,currentAbility:75,trend:2}}},
  economy:{accounts:{sky:{cash:123456789}},contracts:{x:{weeklyWage:123456}},world:{players:{[local.id]:local}}},
  development:{records:{[p.id]:{attributes:{...p.attributes},startRating:70,seasonRating:75,history:[{ability:70}],annual:[{ability:75,gain:5}]}}},
  activeMatch:{state:{seed:123,roster:[structuredClone(p)]}}};
 const preserved=structuredClone({attributes:p.attributes,accounts:s.economy.accounts,contracts:s.economy.contracts,match:s.activeMatch});
 migrateAbilities(s);assert.equal(p.potential,160);assert.equal(local.ability,80);assert.equal(local.potential,145);
 assert.equal(s.development.records[p.id].annual[0].gain,15);
 assert.deepEqual({attributes:p.attributes,accounts:s.economy.accounts,contracts:s.economy.contracts,match:s.activeMatch},preserved);
 const once=structuredClone(s);migrateAbilities(s);assert.deepEqual(s,once);
 assert.throws(()=>migrateAbilities({abilityVersion:999}),/版本/);
 const fresh=createSeason();assert.equal(validateSave(structuredClone(fresh)).abilityVersion,2);
});
test('地方球员实体化保持同一CA和PA，不将200分值直接写入技术属性',()=>{
 const p={id:'bridge-calibration',ability:145,potential:175,birthYear:298,position:'CM',name:'测试',city:'unknown'};
 const full=materializeLocal({year:318,date:'0318-01-01'},p,'sky');
 assert.ok(Math.abs(preciseRating(full)-145)<.001);assert.equal(full.potential,175);
});
