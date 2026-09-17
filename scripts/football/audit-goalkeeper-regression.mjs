import fs from 'node:fs';
import path from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {validateSave,followingSeason,advanceTo,engineSimulation,seasonTeam,pendingMatches} from '../../src/competitions/runtime.js';
import {available} from '../../src/football/players.js';
import {dateOf,addDays} from '../../src/competitions/calendar.js';

// Replay a new branch from a preserved pre-season ancestor. Never relabel the
// fixed twenty-season baseline or bypass its resume source-hash protection.
const root=fileURLToPath(new URL('../../',import.meta.url));
const {values}=parseArgs({options:{parent:{type:'string',default:'artifacts/academy-world/world-final/season-329.json.gz'},out:{type:'string',default:'artifacts/academy-world/goalkeeper-regression'}}});
const out=path.resolve(root,values.out),parentFile=path.resolve(root,values.parent);
if(fs.existsSync(path.join(out,'report.json')))throw Error('输出目录已有结果，请指定新的 --out');
fs.mkdirSync(out,{recursive:true});
const parent=JSON.parse(gunzipSync(fs.readFileSync(parentFile)));
const sha=x=>createHash('sha256').update(x).digest('hex');
const parentSeasonHash=sha(JSON.stringify(parent.season));
const files=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):e.name.endsWith('.js')?[path.join(dir,e.name)]:[]);
const sourceHashes=Object.fromEntries([...files(path.join(root,'src')),fileURLToPath(import.meta.url)].sort().map(file=>[path.relative(root,file),sha(fs.readFileSync(file))]));
const s=followingSeason(validateSave(parent.season)),target='sichuan-league-club-17',year=s.year;
const lookup=new Map(s.fixtures.map(m=>[`official:${m.id}`,m]));
const report={schema:1,status:'running',year,startedAt:new Date().toISOString(),runtime:process.version,sourceHash:sha(JSON.stringify(sourceHashes)),sourceHashes,parent:{file:path.relative(root,parentFile),sourceHash:parent.report.sourceHash,seasonHash:parentSeasonHash,year:parent.season.year},changedProductionFiles:Object.entries(sourceHashes).filter(([file,hash])=>file.startsWith('src/')&&parent.report.sourceHashes[file]!==hash).map(([file])=>file),targetClubId:target,matches:0,availabilityWarnings:[],engineFailures:[],juneReview:[],targetAugustFixtures:[],notes:['从同一329年末真实快照分支，完整重放330年全部正式比赛。','这是修复后单季回归，不能宣称修复后20季已经通过。','完整结果保留生产引擎，包括其他球队的可用性问题。']};
function keeperRows(team){return team.roster.filter(p=>p.position==='GK').map(p=>({id:p.id,name:p.name,available:available(p),injuryDays:p.injuryDays,suspended:p.suspended,condition:p.condition,playedToday:p.playedToday,registration:s.playerRegistry.registrations[p.id]||null}));}
function snapshotReview(label){const team=seasonTeam(s,target),rows=keeperRows(team);report.juneReview.push({label,date:s.date,players:team.roster.length,goalkeepers:rows.length,keeperRows:structuredClone(rows)});}
const simulate=input=>{
 const fixture=lookup.get(input.seed);
 try{
  for(const team of [input.home,input.away]){
   const eligible=team.roster.filter(available),goalkeepers=eligible.filter(p=>p.position==='GK').length;
   if(eligible.length<11||!goalkeepers)report.availabilityWarnings.push({fixture:fixture.id,date:fixture.date,clubId:team.id,available:eligible.length,goalkeepers});
   if(team.id===target&&[dateOf(year,8,9),dateOf(year,8,13)].includes(fixture.date))report.targetAugustFixtures.push({fixture:fixture.id,date:fixture.date,players:team.roster.length,available:eligible.length,goalkeepers:team.roster.filter(p=>p.position==='GK').length,availableGoalkeepers:goalkeepers,keeperRows:structuredClone(keeperRows(team))});
  }
  const result=engineSimulation(input);if(result.status!=='finished')throw Error('比赛没有正常结束');report.matches++;return result;
 }catch(error){report.engineFailures.push({fixture:fixture?.id,date:fixture?.date,message:error.message});throw error;}
};
function persist(){
 report.currentDate=s.date;report.updatedAt=new Date().toISOString();
 fs.writeFileSync(path.join(out,'report.json.tmp'),JSON.stringify(report,null,2)+'\n');fs.renameSync(path.join(out,'report.json.tmp'),path.join(out,'report.json'));
}
const started=performance.now();
try{
 for(let month=1;month<=12;month++){
  if(month===6){advanceTo(s,dateOf(year,6,29),{simulate});snapshotReview('半年度评估前');advanceTo(s,dateOf(year,6,30),{simulate});snapshotReview('半年度评估后');}
  else advanceTo(s,month===12?dateOf(year,12,31):addDays(dateOf(year,month+1,1),-1),{simulate});
  validateSave(s);report.elapsedSeconds=(performance.now()-started)/1000;persist();console.log(JSON.stringify({year,date:s.date,matches:report.matches,warnings:report.availabilityWarnings.length,seconds:Math.round(report.elapsedSeconds)}));
 }
 if(pendingMatches(s).length||report.matches!==s.fixtures.filter(m=>m.score).length)throw Error('完整赛季比赛计数不一致');
 report.status='completed';report.completedAt=new Date().toISOString();
}catch(error){report.status='failed';report.failure={date:s.date,message:error.message,stack:error.stack};process.exitCode=1;}
persist();fs.writeFileSync(path.join(out,'season.json.gz'),gzipSync(JSON.stringify({report,season:s}),{level:1}));
const august=report.targetAugustFixtures.map(m=>`| ${m.date} | ${m.players} | ${m.goalkeepers} | ${m.availableGoalkeepers} |`).join('\n');
const text=`# 门将深度修复：单季真实回放\n\n状态 ${report.status}。从${parent.season.year}年末完整快照分支，实际完成${report.matches}场${year}年正式比赛；可用性告警${report.availabilityWarnings.length}次，引擎中断${report.engineFailures.length}次。\n\n这是一季修复回归，20季固定基线仍保留其原始问题；不得视为新版20季测试。\n\n源版本：\`${report.sourceHash}\`。父快照完整season SHA：\`${parentSeasonHash}\`；父源版本：\`${report.parent.sourceHash}\`。变更生产文件：${report.changedProductionFiles.join('、')}。\n\n半年度评估前/后目标俱乐部门将人数：${report.juneReview.map(r=>`${r.date} ${r.goalkeepers}人`).join(' → ')}。每名门将的真实注册与状态见report.json。\n\n| 日期 | 注册总人数 | 注册门将 | 可用门将 |\n|---|---:|---:|---:|\n${august}\n\n其余球队告警亦保留在report.json，没有过滤。完整年末存档见season.json.gz。${report.failure?`\n\n失败原因：${report.failure.message}`:''}\n`;
fs.writeFileSync(path.join(out,'report.md'),text);
