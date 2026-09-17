import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createSeason,pendingMatches,playFixture,finishDate,followingSeason,engineSimulation,validateSave,seasonTeam} from '../../src/competitions/runtime.js';
import {appointManager,isManagedFixture,coachPreview,beginCoachedMatch,updateCoachedMatch} from '../../src/competitions/career.js';
import {registeredPlayers,registeredPlayer,playerAgeOnDate} from '../../src/competitions/registry.js';
import {advanceDevelopment,developedPlayer,setPlayerTraining} from '../../src/competitions/development.js';
import {setYouthPath,youthOpportunities,observeYouth} from '../../src/competitions/youth.js';
import {academyReport,setAcademyPlan} from '../../src/competitions/academy.js';
import {preciseRating,selectLineup,available,POSITIONS} from '../../src/football/players.js';
import {getDivision} from '../../src/competitions/catalog.js';
import {dateOf,addDays} from '../../src/competitions/calendar.js';
import * as runtime from '../../src/competitions/runtime.js';
import {createMatchPool,playAuditDate} from './parallel-match-audit.mjs';
import {planAITeam} from '../../src/football/ai-team.js';
import {youthAuditMetrics} from './academy-world-metrics.mjs';

// Every official result comes from the production engine. A checkpoint contains
// the full game save and audit counters; incompatible source revisions cannot mix.
const {values}=parseArgs({options:{years:{type:'string',default:'20'},'career-years':{type:'string',default:'0'},months:{type:'string'},out:{type:'string'},resume:{type:'boolean',default:false},workers:{type:'string',default:'0'},'pre-advance':{type:'boolean',default:false},'checkpoint-months':{type:'string',default:'1'}}});
const root=fileURLToPath(new URL('../../',import.meta.url)),careerYears=Number(values['career-years']),years=careerYears||Number(values.years),mode=careerYears?'career':'world',months=values.months?Number(values.months):years*12;
if(!Number.isInteger(years)||years<1||years>100||!Number.isInteger(months)||months<1||months>years*12)throw Error('年数或月数无效');
const execution={workers:Number(values.workers),preAdvance:values['pre-advance'],checkpointMonths:Number(values['checkpoint-months'])};
if(!Number.isInteger(execution.workers)||execution.workers<0||execution.workers>16||!Number.isInteger(execution.checkpointMonths)||execution.checkpointMonths<1||execution.checkpointMonths>12)throw Error('审计并行或检查点参数无效');
if(careerYears&&execution.workers)throw Error('经理情景保留串行正式入口，请使用 --workers 0');
const out=path.resolve(root,values.out||`artifacts/academy-world/${mode}`);fs.mkdirSync(out,{recursive:true});
function sourceFiles(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?sourceFiles(path.join(dir,e.name)):e.name.endsWith('.js')?[path.join(dir,e.name)]:[]);}
const sources=[...sourceFiles(path.join(root,'src')),fileURLToPath(import.meta.url),fileURLToPath(new URL('./parallel-match-audit.mjs',import.meta.url)),fileURLToPath(new URL('./academy-world-metrics.mjs',import.meta.url))].sort();
const sourceHashes=Object.fromEntries(sources.map(file=>[path.relative(root,file),createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
const sourceHash=createHash('sha256').update(JSON.stringify(sourceHashes)).digest('hex');
const checkpoint=path.join(out,'checkpoint.json.gz'),reportFile=path.join(out,'report.json');
const mean=a=>a.length?a.reduce((n,x)=>n+x,0)/a.length:null;
function stats(a){const xs=[...a].sort((x,y)=>x-y);return {count:xs.length,mean:mean(xs),min:xs[0]??null,p50:xs[Math.floor(xs.length*.5)]??null,p90:xs[Math.min(xs.length-1,Math.floor(xs.length*.9))]??null,max:xs.at(-1)??null};}
let season,report;
if(values.resume){
 const saved=JSON.parse(gunzipSync(fs.readFileSync(checkpoint)));report=saved.report;
 if(report.sourceHash!==sourceHash||report.mode!==mode||report.requestedYears!==years||JSON.stringify(report.execution)!==JSON.stringify(execution))throw Error('源码或运行参数已变化，不能混合续跑；请使用新输出目录');
 season=validateSave(saved.season);report.status='running';delete report.failure;
}else{
 if(fs.existsSync(checkpoint))throw Error('输出目录已有检查点，请用 --resume 或指定新的 --out');
 season=createSeason();if(careerYears)appointManager(season,'bridge');
 report={schema:2,mode,execution,parallelMetrics:{},sourceHash,sourceHashes,requestedYears:years,startedAt:new Date().toISOString(),status:'running',completedMonths:0,matches:0,coachedMatches:0,engineFailures:[],availabilityWarnings:[],debuts:{},seasons:[],actions:[],tracked:[],baseline:null,notes:['正式赛事使用生产比赛引擎；青年比赛按现有游戏逻辑模拟。','startingCA保留成长后固定4-3-3选人可比指标；actualAIStartingCA为年末健康状态下AI所选阵型的槽位CA，非plan.score，也不是逐场实测均值。', '年龄×PA兑现仅新生成未退役球员，按年末周岁和隐藏PA分组；CA/PA为描述统计，不代表真实兑现概率。', '角色分钟取本季正式fixtures；转会取完整注册history的senior→senior跨队迁移，避免有界事件列表漏记，流向按当年members。','GK≥2、CB≥3为名单深度诊断，非引擎硬限制；GK≥1、总人数≥11单独检查。','3季经理情景为固定政策的集成试玩，不代表真人玩家可理解性研究。','初始老球员缺少之前赛季比赛履历，首次职业出场年龄只统计本次新生成青年。']};
 if(careerYears)report.tracked=[0,1,2].map((n)=>({id:`youth:${season.year}:bridge:${n}`,role:['重点培养','外租','提拔'][n]}));
}
function teamRows(s){return Object.entries(s.members).flatMap(([division,clubs])=>clubs.map(id=>{
 const team=seasonTeam(s,id,division),counts=Object.fromEntries(Object.keys(POSITIONS).map(p=>[p,team.roster.filter(q=>q.position===p).length]));
 const clean={...team,roster:team.roster.map(p=>({...p,injuryDays:0,suspended:0,playedToday:false,condition:100}))};
 let startingCA=null,actualAIStartingCA=null,aiFormation=null,aiOpportunities={};try{const xi=selectLineup(clean);startingCA=mean(xi.map(slot=>preciseRating(clean.roster.find(p=>p.id===slot.id),slot.position)));}catch{}
 try{const plan=planAITeam(clean,{healthy:true,rotation:false});aiFormation=plan.formation;actualAIStartingCA=mean(plan.lineup.map(slot=>preciseRating(clean.roster.find(p=>p.id===slot.id),slot.position)));aiOpportunities=plan.opportunities;}catch{}
 return {id,division,tier:getDivision(division).tier,players:team.roster.length,available:team.roster.filter(available).length,startingCA,actualAIStartingCA,aiFormation,aiOpportunities,meanAge:mean(team.roster.map(p=>p.age)),positions:counts,hardShortage:team.roster.length<11||counts.GK<1,depthShortage:counts.GK<2||counts.CB<3};
}));}
function divisionRows(rows){return Object.fromEntries([...new Set(rows.map(t=>t.division))].map(division=>{const teams=rows.filter(t=>t.division===division);return [division,{clubs:teams.length,startingCA:stats(teams.map(t=>t.startingCA).filter(Number.isFinite)),actualAIStartingCA:stats(teams.map(t=>t.actualAIStartingCA).filter(Number.isFinite)),formations:Object.fromEntries([...new Set(teams.map(t=>t.aiFormation))].map(name=>[name,teams.filter(t=>t.aiFormation===name).length])),roster:stats(teams.map(t=>t.players)),hardShortage:teams.filter(t=>t.hardShortage).map(t=>t.id),depthShortage:teams.filter(t=>t.depthShortage).map(t=>t.id),positionTotals:Object.fromEntries(Object.keys(POSITIONS).map(p=>[p,teams.reduce((n,t)=>n+t.positions[p],0)]))}];}));}
report.baseline??=divisionRows(teamRows(season));
function trackedState(s){return report.tracked.map(t=>{const base=registeredPlayer(s,t.id),p=developedPlayer(s,base),r=s.development.records[t.id],reg=s.playerRegistry.registrations[t.id];return {...t,name:p.name,age:p.age,ability:preciseRating(p),status:reg.status,clubId:reg.clubId,minutes:r?.minutes||0,seasonMinutes:r?.seasonMinutes||0,youthMinutes:r?.youthMinutes||0,seasonYouthMinutes:r?.seasonYouthMinutes||0,history:reg.history,observation:s.playerRegistry.observations[`bridge/${t.id}`]||null};});}
report.trackedInitial??=trackedState(season);
function careerActions(){
 if(!careerYears)return;
 const focus=report.tracked.find(t=>t.role==='重点培养'),academy=academyReport(season,'bridge');
 const focusPlayers=academy.players.some(p=>p.id===focus.id)?[focus.id]:[];
 if(academy.selection!=='development'||JSON.stringify(academy.focusPlayers)!==JSON.stringify(focusPlayers)){
  setAcademyPlan(season,{selection:'development',focusPlayers});report.actions.push({date:season.date,action:'academy-plan',selection:'development',focusPlayers});
 }
 for(const t of report.tracked){
  const reg=season.playerRegistry.registrations[t.id],op=youthOpportunities(season,t.id);
  let action=null,options={};
  if(t.role==='提拔'&&op.actions.includes('promote'))action='promote';
  if(t.role==='外租'&&op.actions.includes('loan')){action='loan';options={clubId:op.loans[0].id};}
  if(action){setYouthPath(season,t.id,action,options);report.actions.push({date:season.date,id:t.id,action,...options});}
  if(t.role==='重点培养'&&reg.clubId==='bridge'&&!['retired','free','loan'].includes(reg.status)){
   const plan=season.development.plans[t.id];
   if(!plan||plan.focus!=='technical'){setPlayerTraining(season,t.id,{focus:'technical',load:.6});report.actions.push({date:season.date,id:t.id,action:'training',focus:'technical',load:.6});}
  }
  if(op.canObserve){const observation=observeYouth(season,t.id);report.actions.push({date:season.date,id:t.id,action:'observe',forecast:[observation.forecastLow,observation.forecastHigh],samples:observation.samples});}
 }
}
function checkInput(input,fixture){for(const t of [input.home,input.away]){const n=t.roster.filter(available).length,gk=t.roster.filter(p=>p.position==='GK'&&available(p)).length;if(n<11||!gk)report.availabilityWarnings.push({fixture:fixture.id,date:fixture.date,clubId:t.id,available:n,goalkeepers:gk});}}
function seasonSummary(){
 const players=new Map(registeredPlayers(season,{includeRetired:true}).map(p=>[p.id,p])),teams=teamRows(season),divisions=divisionRows(teams),u21={},newDebut=[],actualMinutes=new Map();
 let matches=0,coached=0;
 for(const m of season.fixtures.filter(m=>m.score)){
  matches++;coached+=Number(Boolean(m.coached));
  for(let side=0;side<2;side++)for(const line of m.report.players[side]){
   actualMinutes.set(line.id,(actualMinutes.get(line.id)||0)+line.minutes);
   const p=players.get(line.id);if(!p)throw Error(`比赛球员不存在 ${line.id}`);const age=playerAgeOnDate(p,m.date),club=side?m.away:m.home;
   if(season.playerRegistry.players[p.id]&&!report.debuts[p.id]){const debut={date:m.date,age,clubId:club,position:p.position};report.debuts[p.id]=debut;newDebut.push(debut);}
   if(age<21){const division=Object.keys(season.members).find(d=>season.members[d].includes(club));const row=u21[division]??={minutes:0,appearances:0,players:[]};row.minutes+=line.minutes;row.appearances++;if(!row.players.includes(p.id))row.players.push(p.id);}
  }
 }
 const allYouth=Object.values(season.playerRegistry.players),registrations=season.playerRegistry.registrations;
 const outcomes=Object.fromEntries(['youth','senior','loan','free','retired'].map(status=>[status,allYouth.filter(p=>registrations[p.id].status===status).length]));
 const retired=[...players.values()].filter(p=>registrations[p.id]?.status==='retired'&&registrations[p.id].statusSince.startsWith(String(season.year).padStart(4,'0'))).length;
 const cohortYears=[...new Set(allYouth.map(p=>Number(p.ageReferenceDate.slice(0,4))))];
 const cohorts=Object.fromEntries(cohortYears.map(year=>{const members=allYouth.filter(p=>Number(p.ageReferenceDate.slice(0,4))===year);return [year,{count:members.length,everProfessional:members.filter(p=>report.debuts[p.id]).length,outcomes:Object.fromEntries(Object.keys(outcomes).map(status=>[status,members.filter(p=>registrations[p.id].status===status).length]))}];}));
 const diagnostics=youthAuditMetrics(season,{players,teams,actualMinutes});
 for(const team of teams)delete team.aiOpportunities;
 const result={year:season.year,date:season.date,matches,coachedMatches:coached,divisions,u21,firstProfessionalAppearances:{ages:stats(newDebut.map(d=>d.age)),positions:Object.fromEntries(Object.keys(POSITIONS).map(p=>[p,newDebut.filter(d=>d.position===p).length]))},outcomes,cohorts,intake:allYouth.filter(p=>p.ageReferenceDate.startsWith(String(season.year).padStart(4,'0'))).length,retired,teams,...diagnostics,tracked:trackedState(season),saveBytes:Buffer.byteLength(JSON.stringify(season))};
 for(const [division,row] of Object.entries(divisions))row.startingCADrift=row.startingCA.mean-report.baseline[division].startingCA.mean;
 return result;
}
function atomic(file,data){fs.writeFileSync(`${file}.tmp`,data);fs.renameSync(`${file}.tmp`,file);}
function persist({annual=false,checkpointDue=true}={}){
 report.updatedAt=new Date().toISOString();report.currentDate=season.date;
 if(checkpointDue){report.checkpointDate=season.date;const payload=gzipSync(JSON.stringify({report,season}),{level:1});atomic(checkpoint,payload);}
 atomic(reportFile,JSON.stringify(report,null,2)+'\n');
 if(annual)fs.copyFileSync(checkpoint,path.join(out,`season-${season.year}.json.gz`));
 const rows=report.seasons.map(s=>`| ${s.year} | ${s.matches} | ${s.intake} | ${s.retired} | ${s.outcomes.senior+s.outcomes.loan} | ${s.firstProfessionalAppearances.ages.mean?.toFixed(2)||'—'} | ${(s.saveBytes/1048576).toFixed(1)} |`).join('\n');
 const last=report.seasons.at(-1),drift=last?Object.entries(last.divisions).map(([id,d])=>`| ${id} | ${report.baseline[id].startingCA.mean.toFixed(2)} | ${d.startingCA.mean?.toFixed(2)||'—'} | ${d.startingCADrift.toFixed(2)} | ${d.hardShortage.length} | ${d.depthShortage.length} |`).join('\n'):'';
 const tracked=last?.tracked.length?`\n\n| 培养路径 | 球员 | 初始 CA | 最終 CA | 成年分钟 | 青年分钟 | 当前归属 |\n|---|---|---:|---:|---:|---:|---|\n${last.tracked.map(p=>`| ${p.role} | ${p.name} | ${report.trackedInitial.find(t=>t.id===p.id).ability.toFixed(2)} | ${p.ability.toFixed(2)} | ${p.minutes.toFixed(0)} | ${p.youthMinutes.toFixed(0)} | ${p.status}/${p.clubId||'—'} |`).join('\n')}`:'';
 const text=`# 青训${mode==='career'?'经理':'长期世界'}验证\n\n状态：${report.status}。已完成 ${report.completedMonths} 月、${report.matches} 场真实正式比赛，其中经理入口 ${report.coachedMatches} 场。当前日期 ${season.date}。\n\n源码 SHA-256：\`${sourceHash}\`。全部文件哈希、每季球队与位置数据、首次成年出场记录、经理操作记录见 report.json。每季及最新检查点包含可恢复完整存档。\n\n${report.notes.map(n=>`- ${n}`).join('\n')}\n\n| 赛季 | 正式比赛 | 新青年 | 当年退役 | 历届青年现役职业 | 新职业首秀平均年龄 | 存档 MiB |\n|---|---:|---:|---:|---:|---:|---:|\n${rows}\n\n| 级别 | 初始首发 CA | 最终首发 CA | 变化 | 硬缺口球队 | 深度缺口球队 |\n|---|---:|---:|---:|---:|---:|\n${drift}${tracked}\n\n比赛可用性告警 ${report.availabilityWarnings.length} 条，引擎中断 ${report.engineFailures.length} 次。${report.failure?`\n\n未完成原因：${report.failure.message}（${report.failure.date}）。`:''}\n`;
 atomic(path.join(out,'report.md'),text);
}
if(!values.resume){
 atomic(path.join(out,'source.json.gz'),gzipSync(JSON.stringify({sourceHash,sourceHashes,sources:Object.fromEntries(sources.map(file=>[path.relative(root,file),fs.readFileSync(file,'utf8')]))}),{level:1}));
 persist();
}
const pool=execution.workers?await createMatchPool(new URL('../../src/competitions/runtime.js',import.meta.url).href,execution.workers):null;
const started=performance.now(),beforeMatches=report.matches,previousElapsed=report.elapsedSeconds||0;
try{
 while(report.completedMonths<months){
  if(season.date===dateOf(season.year,12,31))season=followingSeason(season);
  const month=report.completedMonths%12+1,end=month===12?dateOf(season.year,12,31):addDays(dateOf(season.year,month+1,1),-1);
  careerActions();
  const fixtures=pendingMatches(season).filter(m=>m.date<=end);
  if(pool){
   for(const date of [...new Set(fixtures.map(m=>m.date))]){
    const batch=fixtures.filter(m=>m.date===date);
    try{
     if(execution.preAdvance&&season.development.through<date)advanceDevelopment(season,date);
     await playAuditDate(season,batch,{runtime,pool,onInput:checkInput,metrics:report.parallelMetrics});report.matches+=batch.length;
    }catch(error){report.engineFailures.push({fixture:error.fixtureId||null,date,message:error.message});throw error;}
   }
  }else for(const m of fixtures){
   try{
    if(execution.preAdvance&&season.development.through<m.date)advanceDevelopment(season,m.date);
    if(careerYears&&isManagedFixture(season,m)){
     advanceDevelopment(season,m.date);season.date=m.date;
     const preview=coachPreview(season);checkInput(preview.input,m);
     const promoted=report.tracked.find(p=>p.role==='提拔'),team=preview.side?preview.input.away:preview.input.home,player=team.roster.find(p=>p.id===promoted.id&&available(p));
     const lineup=preview.lineup.map(slot=>({...slot}));
     if(player&&!lineup.some(slot=>slot.id===player.id)){const slot=lineup.find(slot=>slot.position===player.position);if(slot)slot.id=player.id;}
     beginCoachedMatch(season,{fixtureId:m.id,lineup});
     const state=updateCoachedMatch(season,{fixtureId:m.id,serial:season.activeMatch.serial,steps:20000});
     if(state.status!=='finished')throw Error('经理比赛未正常结束');report.coachedMatches++;
    }else playFixture(season,m.id,input=>{checkInput(input,m);return engineSimulation(input);});
    report.matches++;
   }catch(error){report.engineFailures.push({fixture:m.id,date:m.date,message:error.message});throw error;}
  }
  finishDate(season,end);careerActions();validateSave(season);report.completedMonths++;
  if(month===12){if(pendingMatches(season).length)throw Error('全年正式赛事未完成');report.seasons.push(seasonSummary());}
  report.elapsedSeconds=previousElapsed+(performance.now()-started)/1000;
  persist({annual:month===12,checkpointDue:month===12||report.completedMonths%execution.checkpointMonths===0||report.completedMonths===months});
  console.log(JSON.stringify({mode,date:season.date,months:report.completedMonths,matches:report.matches,coached:report.coachedMatches,elapsedSeconds:Math.round((performance.now()-started)/1000),matchesPerSecond:(report.matches-beforeMatches)/((performance.now()-started)/1000)}));
 }
 report.status=report.completedMonths===years*12?'completed':'partial';report.completedAt=report.status==='completed'?new Date().toISOString():null;persist();
}catch(error){
 report.status='failed';report.failure={date:report.engineFailures.at(-1)?.date||season.date,message:error.message,stack:error.stack,partialMonthRecoverable:false,resumeFrom:report.checkpointDate};
 // A failed in-memory month is diagnostic only. Resume always loads the last
 // complete checkpoint, never a partially advanced or partially committed day.
 atomic(reportFile,JSON.stringify(report,null,2)+'\n');atomic(path.join(out,'report.md'),`# 青训审计中断\n\n失败日期：${report.failure.date}。${error.message}\n\n当月部分状态不可恢复；最后完整检查点：${report.checkpointDate}。详见 report.json。\n`);console.error(error);process.exitCode=1;
}finally{if(pool)await pool.close();}
