import test from 'node:test';
import assert from 'node:assert/strict';
import {bodyAtAge,createBodyProfile,validateBodyProfile} from '../src/football/body.js';
import {generateYouthPlayer} from '../src/football/players.js';

const player=(id='body-model',maturityShift=0)=>({id,position:'CM',age:15,height:180,weight:74,growthProfile:{maturityShift}});
const withBody=p=>({...p,bodyProfile:createBodyProfile(p,{seed:'body-tests'})});

test('同 ID 和种子的成年体格不随入学年龄或重载改变',()=>{
 const young=player(),older={...young,age:18};
 const profile=createBodyProfile(young,{seed:'body-tests'});
 assert.deepEqual(profile,createBodyProfile(older,{seed:'body-tests'}));
 assert.deepEqual(profile,createBodyProfile(JSON.parse(JSON.stringify(young)),{seed:'body-tests'}));
 assert.ok(validateBodyProfile(profile));
 assert.notDeepEqual(profile,createBodyProfile(young,{seed:'other-seed'}));
 assert.ok(bodyAtAge({...young,bodyProfile:profile},18).height>bodyAtAge({...young,bodyProfile:profile},15).height);
});

test('早熟与晚熟改变少年体格和成熟时间，成年目标保持相同',()=>{
 const early=withBody(player('same-person',-1.8)),late=withBody(player('same-person',1.8));
 assert.equal(early.bodyProfile.adultHeight,late.bodyProfile.adultHeight);
 assert.equal(early.bodyProfile.adultWeight,late.bodyProfile.adultWeight);
 assert.ok(bodyAtAge(early,16).height>bodyAtAge(late,16).height);
 assert.ok(bodyAtAge(early,16).weight>bodyAtAge(late,16).weight);
 assert.deepEqual(bodyAtAge(early,25),bodyAtAge(late,25));
});

test('曲线连续单调，成年以后保持稳定且不超过目标',()=>{
 for(const shift of [-1.8,0,1.8]){
  const p=withBody(player(`curve-${shift}`,shift));
  let previous=bodyAtAge(p,12);
  for(let step=1;step<=1400;step++){
   const body=bodyAtAge(p,12+step/100);
   assert.ok(body.height>=previous.height&&body.weight>=previous.weight);
   assert.ok(body.height<=p.bodyProfile.adultHeight&&body.weight<=p.bodyProfile.adultWeight);
   assert.ok(body.height-previous.height<.1&&body.weight-previous.weight<.1);
   previous=body;
  }
  for(const boundary of [12,p.bodyProfile.heightMaturityAge,p.bodyProfile.weightMaturityAge]){
   const before=bodyAtAge(p,boundary-1e-7),after=bodyAtAge(p,boundary+1e-7);
   assert.ok(Math.abs(after.height-before.height)<1e-5&&Math.abs(after.weight-before.weight)<1e-5);
  }
  assert.deepEqual(bodyAtAge(p,25),bodyAtAge(p,90));
 }
});

test('迁移以当日精确年龄和体格为锚，重复迁移不改变资料',()=>{
 for(const age of [15.75,17.25,21.5,30]){
  const p={...player('migrated'),age:Math.floor(age),developmentAge:age};
  p.bodyProfile=createBodyProfile(p,{migrate:true});
  assert.equal(p.bodyProfile.anchorAge,age);
  assert.ok(validateBodyProfile(p.bodyProfile));
  assert.deepEqual(bodyAtAge(p,age),{height:p.height,weight:p.weight});
  assert.deepEqual(createBodyProfile(p,{migrate:true,age:age+1}),p.bodyProfile);
  assert.deepEqual(bodyAtAge(p,age),bodyAtAge(JSON.parse(JSON.stringify(p)),age));
  const future=bodyAtAge(p,age+1e-7);
  assert.ok(future.height-p.height<1e-5&&future.weight-p.weight<1e-5);
  assert.ok(bodyAtAge(p,40).height<=p.height+8&&bodyAtAge(p,40).weight<=p.weight+12);
  if(age===30)assert.deepEqual(bodyAtAge(p,50),{height:p.height,weight:p.weight});
 }
});

test('体格计算不改写球员属性、潜力或输入对象，无资料沿用原体格',()=>{
 const p=generateYouthPlayer({id:'body-no-stat-inflation',age:15,seed:'body-tests'});
 const before=structuredClone(p),profile=createBodyProfile(p,{seed:'body-tests'});
 const measured={...p,bodyProfile:profile};
 bodyAtAge(measured,25);
 assert.deepEqual(p,before);
 assert.equal(measured.attributes,p.attributes);
 assert.equal(measured.potential,p.potential);
 const legacy=player('legacy');
 assert.deepEqual(bodyAtAge(legacy,19),{height:legacy.height,weight:legacy.weight});
});

test('存档体格资料拒绝非法数值、反向成长和成年后继续增长',()=>{
 const valid=createBodyProfile(player());
 for(const [key,value] of [['version',2],['adultHeight',NaN],['anchorAge',-1],['anchorWeight',0],['adultWeight',valid.anchorWeight-1],['heightMaturityAge',200],['weightMaturityAge',19]]){
  assert.equal(validateBodyProfile({...valid,[key]:value}),false);
 }
 assert.equal(validateBodyProfile({...valid,anchorAge:30}),false);
 assert.equal(validateBodyProfile(null),false);
 assert.throws(()=>bodyAtAge({bodyProfile:valid},NaN));
 assert.throws(()=>createBodyProfile({...player(),height:NaN},{migrate:true}));
});
