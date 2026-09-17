import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {ATTRIBUTE_KEYS,ROSTER_POSITIONS,generateYouthPlayer,developWeek,preciseRating} from '../../src/football/players.js';

const {values}=parseArgs({options:{count:{type:'string',default:'400'},seed:{type:'string',default:'youth-calibration-v1'}}});
const count=Number(values.count),seed=values.seed;
if(!Number.isInteger(count)||count<100||count>5000)throw Error('--count 必须是100到5000的整数');
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=path.join(root,'artifacts/youth-development/calibration.json');
const document=path.join(root,'docs/football/新青训模型校准.md');
const mean=xs=>xs.reduce((sum,x)=>sum+x,0)/xs.length;
const stats=xs=>{
 const sorted=[...xs].sort((a,b)=>a-b),average=mean(xs),quantile=p=>sorted[Math.max(0,Math.ceil(p*sorted.length)-1)];
 return {count:xs.length,mean:average,stddev:Math.sqrt(mean(xs.map(x=>(x-average)**2))),min:sorted[0],p10:quantile(.1),p50:quantile(.5),p90:quantile(.9),p99:quantile(.99),max:sorted.at(-1)};
};
const correlation=(xs,ys)=>{
 const mx=mean(xs),my=mean(ys),covariance=xs.reduce((sum,x,i)=>sum+(x-mx)*(ys[i]-my),0);
 const denominator=Math.sqrt(xs.reduce((sum,x)=>sum+(x-mx)**2,0)*ys.reduce((sum,y)=>sum+(y-my)**2,0));
 return denominator?covariance/denominator:null;
};
const summarize=players=>{
 const ability=players.map(p=>preciseRating(p)),potential=players.map(p=>p.potential);
 return {ability:stats(ability),potential:stats(potential),caPaCorrelation:correlation(ability,potential),above85:ability.filter(x=>x>=85).length,above90:ability.filter(x=>x>=90).length};
};
const generate=age=>Array.from({length:count},(_,index)=>generateYouthPlayer({id:`audit-youth-${index}`,seed,age,position:ROSTER_POSITIONS[index%ROSTER_POSITIONS.length]}));
const initialByAge=Object.fromEntries([15,16,17,18].map(age=>[age,generate(age)]));
const scenarios={
 regular:{label:'青年正常训练，成年稳定出场',adultMinutes:90,adultLoad:.6},
 bench:{label:'青年正常训练，成年长期替补',adultMinutes:0,adultLoad:.6},
 overload:{label:'青年正常训练，成年持续过载',adultMinutes:240,adultLoad:.9},
};

function advanceYear(players,targetAge,settings){
 return players.map(initial=>{
  let p=initial;
  while((p.developmentAge??p.age)<targetAge-1e-10){
   const age=p.developmentAge??p.age,days=Math.min(7,(targetAge-age)*365.25),youth=age<18;
   p=developWeek(p,{days,minutes:(youth?60:settings.adultMinutes)*days/7,load:youth?.6:settings.adultLoad,challenge:1});
  }
  assert.ok(ATTRIBUTE_KEYS.every(key=>Number.isFinite(p.attributes[key])&&p.attributes[key]>=1&&p.attributes[key]<=p.growthProfile.ceilings[key]+1e-9));
  assert.ok(preciseRating(p,p.growthProfile.referencePosition)<=p.potential+1e-9);
  return p;
 });
}

function futureDifferences(initial,adults){
 const buckets=new Map();
 initial.forEach((p,index)=>{
  const ability=preciseRating(p),bucket=Math.round(ability);
  if(!buckets.has(bucket))buckets.set(bucket,[]);
  buckets.get(bucket).push({id:p.id,position:p.position,initialCA:ability,pa:p.potential,adultCA:preciseRating(adults[index])});
 });
 const comparable=[...buckets.entries()].filter(([,players])=>players.length>=5).map(([displayCA,players])=>{
  const sorted=[...players].sort((a,b)=>a.adultCA-b.adultCA);
  return {displayCA,count:players.length,initialCA:stats(players.map(p=>p.initialCA)),potential:stats(players.map(p=>p.pa)),adultCA:stats(players.map(p=>p.adultCA)),lowest:sorted[0],highest:sorted.at(-1)};
 });
 comparable.sort((a,b)=>b.count-a.count);
 let pairs=0,reversals=0;
 for(let i=0;i<initial.length;i++)for(let j=i+1;j<initial.length;j++){
  const initialDifference=preciseRating(initial[i])-preciseRating(initial[j]),adultDifference=preciseRating(adults[i])-preciseRating(adults[j]);
  if(Math.abs(initialDifference)<1e-9||Math.abs(adultDifference)<1e-9)continue;
  pairs++;if(initialDifference*adultDifference<0)reversals++;
 }
 return {initialAdultCorrelation:correlation(initial.map(p=>preciseRating(p)),adults.map(p=>preciseRating(p))),comparablePairs:pairs,rankReversalPairs:reversals,rankReversalFraction:reversals/pairs,mostPopulatedSameCABucket:comparable[0]??null};
}

const longitudinal={};
for(const startAge of [15,16]){
 longitudinal[startAge]={};
 for(const [scenario,settings] of Object.entries(scenarios)){
  const initial=initialByAge[startAge];let players=initial;
  const milestones={[startAge]:summarize(players)};
  for(let age=startAge+1;age<=28;age++){
   players=advanceYear(players,age,settings);milestones[age]=summarize(players);
  }
  players.forEach((p,index)=>{assert.deepEqual(p.growthProfile,initial[index].growthProfile);assert.equal(p.potential,initial[index].potential);});
  longitudinal[startAge][scenario]={milestones,futureDifferences:futureDifferences(initial,players),byPosition:Object.fromEntries([...new Set(ROSTER_POSITIONS)].map(position=>[position,summarize(players.filter(p=>p.position===position))]))};
  console.log(`${startAge}→28岁 ${settings.label}: 平均CA ${milestones[28].ability.mean.toFixed(2)}`);
 }
 assert.ok(longitudinal[startAge].regular.milestones[28].ability.mean>longitudinal[startAge].bench.milestones[28].ability.mean,'适量成年出场应改善平均发展');
 assert.ok(longitudinal[startAge].regular.milestones[28].ability.mean>longitudinal[startAge].overload.milestones[28].ability.mean,'持续过载不能成为最优培养路径');
}

// Change only the scoring position. Identical growth exposure must produce
// identical attributes and envelopes, including a goalkeeper reference profile.
let switchMaxAttributeDifference=0;
for(const position of ['CM','GK']){
 const original=generateYouthPlayer({id:`position-invariance-${position}`,seed,position,age:16});
 let a=[original],b=[{...original,position:position==='CM'?'ST':'CB'}];
 for(let age=17;age<=28;age++){
  a=advanceYear(a,age,scenarios.regular);b=advanceYear(b,age,scenarios.regular);
  for(const key of ATTRIBUTE_KEYS)switchMaxAttributeDifference=Math.max(switchMaxAttributeDifference,Math.abs(a[0].attributes[key]-b[0].attributes[key]));
 }
 assert.deepEqual(a[0].attributes,b[0].attributes);assert.deepEqual(a[0].growthProfile,b[0].growthProfile);
}
const report={
 model:'youth-growth-profile-v1',purpose:'游戏设计校准；不是现实球员数据拟合，也不验证现实潜力服从正态分布',
 sourceSha256:createHash('sha256').update(fs.readFileSync(path.join(root,'src/football/players.js'))).digest('hex'),
 sourceHashes:Object.fromEntries(['players.js','random.js','body.js','youth-specialties.js'].map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(root,'src/football',file))).digest('hex')])),
 config:{seed,countPerStartingAge:count,startingAges:[15,16],initialAgeComparison:[15,16,17,18],finalAge:28,positions:ROSTER_POSITIONS,scenarios,youthMinutesPerWeek:60,youthLoad:.6,challenge:1,injuries:false,selection:false},
 notes:[
  '样本视为青训入口候选池；同一组ID用于各年龄初始化及路径对照，不代表未筛选世界人口。',
  '按365.25天一年推进，跨生日最后一周按剩余天数计算；比赛分钟同比例缩放。',
  '不同年龄初始化是同一潜在参数的横断面比较，不保证与从15岁模拟一年后的16岁完全一致。',
  'PA为初始参考位置的属性包络投影；是内部模型上界，不是必然兑现的成年能力。',
  '所有人保持训练，没有随机伤病、退训或职业淘汰；路径分支只改变成年出场与负荷。',
  '首版身高、体重仍来自原有静态生成器，没有青春期身高/体重成长；成熟速度只影响能力属性。',
  '位置切换测试只验证不能凭更改评分位置刷属性，不包含改位置训练或门将转型。',
 ],
 initial:Object.fromEntries(Object.entries(initialByAge).map(([age,players])=>[age,summarize(players)])),
 longitudinal,checks:{profileStable:true,attributeEnvelopeRespected:true,positionSwitchMaxAttributeDifference:switchMaxAttributeDifference},
};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');

const f=value=>value.toFixed(2),initialRows=Object.entries(report.initial).map(([age,row])=>`| ${age} | ${f(row.ability.mean)} | ${f(row.ability.p10)}～${f(row.ability.p90)} | ${f(row.caPaCorrelation)} |`).join('\n');
const adultRows=Object.entries(longitudinal).flatMap(([age,paths])=>Object.entries(paths).map(([key,value])=>{const row=value.milestones[28];return `| ${age} | ${scenarios[key].label} | ${f(row.ability.mean)} | ${f(row.ability.p10)}～${f(row.ability.p90)} | ${row.above85}/${count} |`;})).join('\n');
const reference=longitudinal[16].regular,future=reference.futureDifferences,bucket=future.mostPopulatedSameCABucket;
const markdown=`# 新青训模型校准\n\n本实验检验游戏生成与成长机制的内部行为，**不是现实足球数据拟合**。没有预设现实潜力一定服从正态分布，也没有用更大的抽样规模替代现实数据。\n\n## 复现\n\n\`node scripts/football/audit-youth.mjs --count ${count} --seed ${seed}\`\n\n完整结果：\`artifacts/youth-development/calibration.json\`。players.js SHA-256：\`${report.sourceSha256}\`。相关源码哈希见 JSON 的 sourceHashes。\n\n固定${count}组球员ID及潜在参数，分别从15岁和16岁开始，模拟到28岁；各起始年龄运行三条路径。位置按现有25人名单比例取样。每条路径18岁前均为每周60分钟青年比赛、0.6训练负荷；成年后分别稳定出场90分钟/周、替补0分钟/周、过载240分钟/周并采用0.9负荷。其他条件相同，无随机伤病，不模拟选拔和退训。\n\n## 初始分布\n\n| 初始年龄 | 平均CA | CA第10～90百分位 | CA–PA相关 |\n|---|---:|---:|---:|\n${initialRows}\n\n16岁PA均值${f(report.initial[16].potential.mean)}，第10～90百分位${f(report.initial[16].potential.p10)}～${f(report.initial[16].potential.p90)}。PA是参考位置的属性包络投影，不是保证兑现的未来评分。同一组发展参数在不同年龄初始化时PA相同。\n\n## 成年结果\n\n| 起始年龄 | 培养路径 | 28岁平均CA | CA第10～90百分位 | CA≥85 |\n|---|---|---:|---:|---:|\n${adultRows}\n\n16岁起步的稳定出场路径：初始CA与28岁CA相关系数${f(future.initialAdultCorrelation)}；可比较的球员两两排序中，${f(future.rankReversalFraction*100)}%在28岁时发生先后互换。这个指标说明模型允许后发进步，不是现实逆袭概率。\n\n当前显示CA同为${bucket.displayCA}的${bucket.count}名16岁球员，在相同培养路径下，28岁CA范围为${f(bucket.adultCA.min)}～${f(bucket.adultCA.max)}，PA范围${f(bucket.potential.min)}～${f(bucket.potential.max)}。分组包含不同位置；它说明相同总评不代表相同发展前景，不是匹配真实球员的因果研究。\n\n## 机制检查与边界\n\n- 全部长期路径中，发展档案和PA保持稳定，各项能力未越过自己的包络。\n- CM改标为ST、GK改标为CB后保持相同训练条件，模拟至28岁属性差异最大值为${switchMaxAttributeDifference}；改评分位置不会刷新成长空间。此检查不代表已实现转位置培养。\n- 当前青年身高、体重按固定发展档案随年龄变化；体格不额外给比赛属性加分，因此本实验的CA对照仍隔离能力成长。体格曲线用 \`npm run audit:body\` 独立检查；它不代表完整生理发育模拟。\n- 领域关联、初始训练积累、年龄曲线和成长速率都是游戏设计参数。训练设施差异、伤病随机事件、退出与重返职业路径不在本实验内。\n- 不同年龄重新初始化与先从更小年龄逐周培养是不同实验，当前没有保证两者得到相同CA。\n- 本报告中的青年比赛分钟仅作为成长曝光输入；没有运行赛程、球探判断或职业选拔模块。\n`;
fs.mkdirSync(path.dirname(document),{recursive:true});fs.writeFileSync(document,markdown);
console.log(`校准通过：${path.relative(root,output)}；${path.relative(root,document)}`);
