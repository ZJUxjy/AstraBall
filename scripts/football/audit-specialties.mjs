import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import * as current from '../../src/football/players.js';

const {values}=parseArgs({options:{count:{type:'string',default:'30000'},seed:{type:'string',default:'youth-specialties-v1'}}});
const count=Number(values.count),seed=values.seed;
if(!Number.isInteger(count)||count<30000||count>300000||count%30)throw Error('--count 必须为 30000～300000 之间的 30 的整数倍');
const root=fileURLToPath(new URL('../../',import.meta.url)),output=path.join(root,'artifacts/youth-specialties');
const baselinePath=path.join(root,'artifacts/youth-current-billion/sources/players.js');
const baselineSource=fs.readFileSync(baselinePath,'utf8');
// Keep the archived generator intact. Imports resolve to the same unchanged
// dependencies used by this comparison; their hashes are part of the report.
const resolvedSource=baselineSource.replace(/from\s+(['"])(\.\/[^'"]+)\1/g,(_,quote,specifier)=>`from ${quote}${pathToFileURL(path.join(root,'src/football',specifier)).href}${quote}`);
const previous=await import(`data:text/javascript;base64,${Buffer.from(resolvedSource).toString('base64')}`);
const positions=Object.keys(current.POSITIONS),labels=Object.assign({},...Object.values(current.ATTRIBUTE_GROUPS).map(group=>group.fields));
const mean=xs=>xs.reduce((sum,x)=>sum+x,0)/xs.length;
function stats(xs){
 const sorted=[...xs].sort((a,b)=>a-b),average=mean(xs),quantile=p=>sorted[Math.max(0,Math.ceil(p*sorted.length)-1)];
 return {count:xs.length,mean:average,stddev:Math.sqrt(mean(xs.map(x=>(x-average)**2))),min:sorted[0],p01:quantile(.01),p10:quantile(.1),p50:quantile(.5),p90:quantile(.9),p99:quantile(.99),max:sorted.at(-1)};
}
function correlation(xs,ys){
 const mx=mean(xs),my=mean(ys),numerator=xs.reduce((sum,x,i)=>sum+(x-mx)*(ys[i]-my),0);
 const denominator=Math.sqrt(xs.reduce((sum,x)=>sum+(x-mx)**2,0)*ys.reduce((sum,y)=>sum+(y-my)**2,0));
 return denominator?numerator/denominator:null;
}
function histogram(xs){
 const bins=Array(20).fill(0);
 for(const value of xs)bins[Math.min(19,Math.floor(value/5))]++;
 return {width:5,range:[0,100],counts:bins};
}
function summarize(players){
 const ca=players.map(p=>current.preciseRating(p)),pa=players.map(p=>p.potential);
 return {ability:stats(ca),potential:stats(pa),caPaCorrelation:correlation(ca,pa),potentialAtLeast:Object.fromEntries([85,90,95].map(threshold=>[threshold,pa.filter(value=>value>=threshold).length/pa.length]))};
}
const pairs=[['passing','longPassing'],['dribbling','technique'],['finishing','penalties'],['passing','finishing'],['corners','freeKicks'],['freeKicks','penalties']];
function group(players){
 return {...summarize(players),attributes:Object.fromEntries(current.ATTRIBUTE_KEYS.map(key=>{
  const xs=players.map(p=>p.attributes[key]);
  return [key,{...stats(xs),below40:xs.filter(x=>x<40).length/xs.length,atLeast60:xs.filter(x=>x>=60).length/xs.length,atLeast70:xs.filter(x=>x>=70).length/xs.length,histogram:histogram(xs)}];
 })),attributeCorrelations:Object.fromEntries(pairs.map(([a,b])=>[`${a}/${b}`,correlation(players.map(p=>p.attributes[a]),players.map(p=>p.attributes[b]))]))};
}
function model(players){
 return {all:group(players),outfield:group(players.filter(p=>p.position!=='GK')),goalkeepers:group(players.filter(p=>p.position==='GK')),byAge:Object.fromEntries([15,16,17].map(age=>[age,summarize(players.filter(p=>p.age===age))])),byPosition:Object.fromEntries(positions.map(position=>[position,summarize(players.filter(p=>p.position===position))]))};
}
const before=[],after=[];
for(let index=0;index<count;index++){
 const config={id:`specialty-audit-${index}`,seed,age:15+Math.floor(index/10)%3,position:positions[index%10]};
 const a=previous.generateYouthPlayer(config),b=current.generateYouthPlayer(config);
 assert.equal(a.id,b.id);assert.equal(a.age,b.age);assert.equal(a.position,b.position);
 for(const key of current.ATTRIBUTE_KEYS){
  assert.ok(Number.isFinite(b.attributes[key])&&b.attributes[key]>=1&&b.attributes[key]<=99);
  assert.ok(b.attributes[key]<=b.growthProfile.ceilings[key]+1e-9);
 }
 before.push(a);after.push(b);
}
const difference={ability:stats(after.map((p,i)=>current.preciseRating(p)-previous.preciseRating(before[i]))),potential:stats(after.map((p,i)=>p.potential-before[i].potential)),attributes:Object.fromEntries(current.ATTRIBUTE_KEYS.map(key=>[key,stats(after.map((p,i)=>p.attributes[key]-before[i].attributes[key]))]))};
const sourceFiles=['src/football/players.js','src/football/youth-specialties.js','src/football/random.js','src/football/names.js','src/football/body.js','artifacts/youth-current-billion/sources/players.js','scripts/football/audit-specialties.mjs'];
const report={purpose:'游戏生成器调整的同种子对照；不是现实数据拟合，也不是重跑10亿人',config:{count,seed,ages:[15,16,17],positions,balancedAgePositionCells:count/30,selection:false,professionalExperience:false,quantiles:'nearest rank，直接排序计算',skillThresholds:{below40:'低于40',atLeast60:'至少60',atLeast70:'至少70'},thresholdNote:'仅为本次对照的统一数值阈值，不是现实能力等级或游戏新增标签'},sourceSha256:Object.fromEntries(sourceFiles.map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')])),before:model(before),after:model(after),pairedDifference:difference};
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'comparison.json'),JSON.stringify(report,null,2)+'\n');
const f=value=>value.toFixed(3),pct=value=>`${(value*100).toFixed(2)}%`;
const overallRows=['ability','potential'].map(key=>`| ${key==='ability'?'CA':'PA'} | ${f(report.before.all[key].mean)} | ${f(report.after.all[key].mean)} | ${f(difference[key].mean)} | ${f(report.before.all[key].stddev)} → ${f(report.after.all[key].stddev)} | ${f(report.after.all[key].p10)}—${f(report.after.all[key].p90)} |`).join('\n');
const specialtyRows=['corners','freeKicks','penalties'].map(key=>{
 const a=report.before.outfield.attributes[key],b=report.after.outfield.attributes[key];
 return `| ${labels[key]} | ${f(a.mean)} → ${f(b.mean)} | ${f(a.stddev)} → ${f(b.stddev)} | ${f(b.p10)}—${f(b.p90)} | ${pct(a.below40)} → ${pct(b.below40)} | ${pct(a.atLeast60)} → ${pct(b.atLeast60)} | ${pct(a.atLeast70)} → ${pct(b.atLeast70)} |`;
}).join('\n');
const correlationRows=pairs.map(([a,b])=>`| ${labels[a]}／${labels[b]} | ${f(report.before.outfield.attributeCorrelations[`${a}/${b}`])} | ${f(report.after.outfield.attributeCorrelations[`${a}/${b}`])} |`).join('\n');
const groupRows=key=>Object.entries(report.after[key]).map(([id,row])=>{
 const old=report.before[key][id];
 return `| ${current.POSITIONS[id]??`${id}岁`} | ${row.ability.count.toLocaleString('en-US')} | ${f(old.ability.mean)} → ${f(row.ability.mean)} | ${f(row.ability.stddev)} | ${f(row.ability.p10)}—${f(row.ability.p90)} | ${f(old.potential.mean)} → ${f(row.potential.mean)} | ${f(row.potential.stddev)} | ${f(row.potential.p10)}—${f(row.potential.p90)} |`;
}).join('\n');
const attributeRows=current.ATTRIBUTE_KEYS.map(key=>{
 const a=report.before.outfield.attributes[key],b=report.after.outfield.attributes[key];
 return `| ${labels[key]} | ${f(a.mean)} | ${f(b.mean)} | ${f(b.stddev)} | ${f(b.p10)} | ${f(b.p50)} | ${f(b.p90)} | ${f(b.p99)} |`;
}).join('\n');
const markdown=`# 青训专项生成对照\n\n本次运行 **${count.toLocaleString('en-US')} 人新旧同种子对照**，没有重新生成10亿人。旧版本读取原10亿实验的 \`sources/players.js\` 快照，新版本调用当前游戏生成器。两组使用相同ID、seed、年龄与位置。\n\n15、16、17岁与10个位置各组合均为${count/30}人；无职业经验，未筛选前1%，未模拟成长。该实验检验设计改动，不证明分布符合现实。原10亿报告保持不变。\n\n## 总体能力与潜力\n\n| 指标 | 旧均值 | 新均值 | 同种子均值差 | 旧→新标准差 | 新P10—P90 |\n|---|---:|---:|---:|---:|---:|\n${overallRows}\n\nPA是参考位置的隐藏属性上限投影，不是必然兑现的成年能力。定位球未纳入当前位置总评；CA和PA不变或变化小，不能据此判断专项改动无效。\n\n## 外场定位球分布\n\n样本排除门将，共${report.after.outfield.ability.count.toLocaleString('en-US')}人。低于40、至少60、至少70是本次对照的统一阈值，不是现实能力等级。\n\n| 属性 | 旧→新均值 | 旧→新标准差 | 新P10—P90 | 低于40 | 至少60 | 至少70 |\n|---|---:|---:|---:|---:|---:|---:|\n${specialtyRows}\n\n## 外场属性相关\n\n| 属性对 | 旧皮尔逊相关 | 新皮尔逊相关 |\n|---|---:|---:|\n${correlationRows}\n\n相关性反映共享发展因素，不代表一项属性在比赛中直接给另一项加分。整体混合年龄、位置与训练背景也会贡献相关性。\n\n## 年龄分组\n\n| 分组 | 人数 | 旧→新CA均值 | 新CA标准差 | 新CA P10—P90 | 旧→新PA均值 | 新PA标准差 | 新PA P10—P90 |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${groupRows('byAge')}\n\n## 位置分组\n\n| 分组 | 人数 | 旧→新CA均值 | 新CA标准差 | 新CA P10—P90 | 旧→新PA均值 | 新PA标准差 | 新PA P10—P90 |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${groupRows('byPosition')}\n\n## 外场全部42项当前属性\n\n门将专项在外场低值集中是既有模型分支；完整JSON另含全体与门将分组。分位数直接排序，未从分箱估算。\n\n| 属性 | 旧均值 | 新均值 | 新标准差 | P10 | P50 | P90 | P99 |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${attributeRows}\n\n## 复现与溯源\n\n\`node scripts/football/audit-specialties.mjs --count ${count} --seed ${seed}\`\n\n完整结果：\`artifacts/youth-specialties/comparison.json\`，含总体、年龄、位置分组、全部属性的5分箱直方图、同种子差值和源码SHA-256。旧生成器的相对导入指向当前未改变的random、names与body依赖；这些依赖的哈希一并记录。\n`;
fs.writeFileSync(path.join(output,'report.md'),markdown);
console.log(JSON.stringify({count,meanDifference:{ca:difference.ability.mean,pa:difference.potential.mean},overallBefore:report.before.all.ability,overallAfter:report.after.all.ability,specialties:Object.fromEntries(['corners','freeKicks','penalties'].map(key=>[key,{before:report.before.outfield.attributes[key].mean,after:report.after.outfield.attributes[key].mean}]))},null,2));
