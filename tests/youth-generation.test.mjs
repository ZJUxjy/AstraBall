import test from 'node:test';
import assert from 'node:assert/strict';
import {ATTRIBUTE_KEYS,POSITIONS,generateYouthPlayer,developWeek,preciseRating,publicProfile} from '../src/football/players.js';

const cohort=Array.from({length:1200},(_,i)=>generateYouthPlayer({id:`youth-model-${i}`,seed:'generation-test',age:16,position:'CM'}));
const correlation=(xs,ys)=>{
 const mx=xs.reduce((n,x)=>n+x,0)/xs.length,my=ys.reduce((n,y)=>n+y,0)/ys.length;
 const covariance=xs.reduce((n,x,i)=>n+(x-mx)*(ys[i]-my),0);
 return covariance/Math.sqrt(xs.reduce((n,x)=>n+(x-mx)**2,0)*ys.reduce((n,y)=>n+(y-my)**2,0));
};

test('青训发展参数可复现、可序列化，公开资料不泄漏发展真值',()=>{
 for(const position of Object.keys(POSITIONS)){
  const options={id:`profile-${position}`,seed:'profile-test',position},p=generateYouthPlayer(options);
  assert.deepEqual(p,generateYouthPlayer(options));
  assert.deepEqual(developWeek(p,{minutes:90}),developWeek(JSON.parse(JSON.stringify(p)),{minutes:90}));
  assert.equal(p.growthProfile.referencePosition,position);
  assert.ok(ATTRIBUTE_KEYS.every(key=>p.attributes[key]>=1&&p.attributes[key]<=p.growthProfile.ceilings[key]&&p.growthProfile.ceilings[key]<=99));
  assert.equal(p.potential,preciseRating({position,attributes:p.growthProfile.ceilings}));
  const visible=publicProfile(p);
  for(const key of ['growthProfile','potential','personality','developmentAge'])assert.equal(key in visible,false);
 }
});

test('同龄相近当前能力允许不同发展前景，潜力不再等于CA加固定年龄差',()=>{
 const buckets=new Map();
 for(const p of cohort){const key=Math.round(preciseRating(p));if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(p.potential);}
 const similar=[...buckets.values()].sort((a,b)=>b.length-a.length)[0];
 assert.ok(Math.max(...similar)-Math.min(...similar)>15,'相同显示总评分组需要容纳明显不同的发展空间');
 const ability=cohort.map(p=>preciseRating(p)),potential=cohort.map(p=>p.potential);
 const association=correlation(ability,potential);
 assert.ok(association>0&&association<.9,'当前能力有预测信息，但不能几乎完全泄漏潜力');
});

test('领域发展倾向有关联，同时保留技术和身体的个体差异',()=>{
 const technical=cohort.map(p=>p.growthProfile.domains.technical),physical=cohort.map(p=>p.growthProfile.domains.physical);
 const association=correlation(technical,physical);
 assert.ok(association>.2&&association<.95,'共有因素产生关联，领域差异不能消失');
 assert.ok(cohort.some(p=>p.growthProfile.domains.technical>p.growthProfile.domains.physical));
 assert.ok(cohort.some(p=>p.growthProfile.domains.physical>p.growthProfile.domains.technical));
});

test('年龄增加初始积累，显式潜力校准不重新设定当前能力',()=>{
 const young=generateYouthPlayer({id:'age-pair',age:15}),older=generateYouthPlayer({id:'age-pair',age:18});
 assert.deepEqual(young.growthProfile,older.growthProfile);assert.equal(young.potential,older.potential);
 assert.ok(preciseRating(older)>preciseRating(young));
 const first=generateYouthPlayer({id:'authored-pair',potential:88}),second=generateYouthPlayer({id:'authored-pair',potential:98});
 assert.deepEqual(first.attributes,second.attributes,'上调充分宽裕的成长包络不能凭空提升少年能力');
 assert.equal(first.potential,88);assert.equal(second.potential,98);
 for(const potential of [45,99]){
  const p=generateYouthPlayer({id:`edge-${potential}`,potential});
  assert.ok(preciseRating(p)<=potential);
  assert.ok(ATTRIBUTE_KEYS.every(key=>p.attributes[key]>=1&&p.growthProfile.ceilings[key]<=99));
 }
});

test('更改评分位置不能刷新属性成长或修改底层发展参数',()=>{
 for(const [position,newPosition] of [['CM','ST'],['GK','CB']]){
  let original=generateYouthPlayer({id:`switch-${position}`,position}),changed={...original,position:newPosition};
  const before=structuredClone(original.growthProfile);
  for(let week=0;week<104;week++){
   original=developWeek(original,{minutes:90,training:'technical'});
   changed=developWeek(changed,{minutes:90,training:'technical'});
  }
  assert.deepEqual(changed.attributes,original.attributes);
  assert.deepEqual(original.growthProfile,before);assert.deepEqual(changed.growthProfile,before);
  assert.equal(changed.potential,original.potential);
 }
});

test('某项属性接近包络不会阻止其他属性发展，连续培养不越过包络',()=>{
 let p=generateYouthPlayer({id:'attribute-room',potential:84}),before=structuredClone(p.growthProfile);
 p.attributes.pace=p.growthProfile.ceilings.pace;
 const next=developWeek(p,{minutes:90});
 assert.equal(next.attributes.pace,p.attributes.pace);assert.ok(next.attributes.passing>p.attributes.passing);
 for(let week=0;week<520;week++)p=developWeek(p,{minutes:90});
 assert.deepEqual(p.growthProfile,before);assert.equal(p.potential,84);
 assert.ok(ATTRIBUTE_KEYS.every(key=>p.attributes[key]<=p.growthProfile.ceilings[key]+1e-10));
 assert.ok(preciseRating(p)<=84);
});
