import {footballTeams} from '../football/data.js';
import {averageQuality,selectLineup,available,FORMATIONS} from '../football/players.js';
import {createMatch,stepMatch,applyCommand,getResult,snapshotMatch,restoreMatch,validateTactics,DEFAULT_TACTICS} from '../football/engine.js';
import {pendingMatches,fixtureSides,matchInput,commitResult,tableFor,seasonTeam} from './runtime.js';
import {getDivision} from './catalog.js';

export const managedDivision=s=>Object.keys(s.members).find(id=>s.members[id].includes(s.manager?.clubId));
export const isManagedFixture=(s,m)=>Boolean(s.manager&&Object.values(fixtureSides(s,m)).includes(s.manager.clubId));
export const nextManagedFixture=s=>pendingMatches(s).find(m=>isManagedFixture(s,m));
export const readyManagedFixture=s=>pendingMatches(s).find(m=>m.date===s.date&&isManagedFixture(s,m));

export function seasonGoal(s,clubId=s.manager?.clubId){
 const division=Object.keys(s.members).find(id=>s.members[id].includes(clubId)),d=getDivision(division);
 if(!d)throw Error('俱乐部未注册');
 const ranking=s.members[division].map(id=>seasonTeam(s,id,division)).sort((a,b)=>averageQuality(b)-averageQuality(a)||a.id.localeCompare(b.id));
 const predicted=ranking.findIndex(t=>t.id===clubId)+1;
 const target=division==='closed'?(predicted<=8?8:12):predicted<=Math.ceil(d.teams/4)?(d.promotion?6:3):predicted<=Math.ceil(d.teams/2)?Math.ceil(d.teams/2):d.teams-(d.relegation||0);
 return {year:s.year,division,target,label:division==='closed'&&target===8?'进入季后赛':d.promotion&&target===6?'进入升级附加赛':target===d.teams-(d.relegation||0)&&d.relegation?'完成保级':`联赛前 ${target} 名`};
}
export function appointManager(s,clubId){
 if(s.manager)throw Error('已经接手俱乐部');
 if(!footballTeams.some(t=>t.id===clubId))throw Error('俱乐部不存在');
 s.manager={clubId,appointed:s.date,tactics:{...DEFAULT_TACTICS},lineup:null,goal:seasonGoal(s,clubId)};
 s.revision++;
}
export function preferredLineup(team,tactics,saved){
 const fallback=selectLineup(team,tactics.formation),used=new Set();
 // Keep eligible selections in their positions; fill gaps from the best available XI.
 return FORMATIONS[tactics.formation].map((position,i)=>{
  const preferred=saved?.[i];
  const candidate=preferred?.position===position&&team.roster.find(p=>p.id===preferred.id&&available(p)&&!used.has(p.id));
  if(candidate){used.add(candidate.id);return {position,id:candidate.id};}
  return {position,id:null};
 }).map(slot=>{
  if(slot.id)return slot;
  const candidate=fallback.find(p=>p.position===slot.position&&!used.has(p.id))||fallback.find(p=>!used.has(p.id));
  used.add(candidate.id);return {...slot,id:candidate.id};
 });
}
export function coachPreview(s){
 const m=readyManagedFixture(s);
 if(!m)throw Error('请先前往下一场比赛');
 if(pendingMatches(s).some(f=>f.date<m.date))throw Error('请先完成之前的比赛日');
 const input=matchInput(s,m),side=input.home.id===s.manager.clubId?0:1;
 const tactics=validateTactics(s.manager.tactics);
 const lineup=preferredLineup(side?input.away:input.home,tactics,s.manager.lineup);
 return {fixture:m,input,side,tactics,lineup};
}
export function beginCoachedMatch(s,{fixtureId,tactics,lineup}={}){
 if(s.activeMatch)throw Error('已有比赛正在进行，请继续比赛');
 const preview=coachPreview(s),side=preview.side;
 if(fixtureId&&fixtureId!==preview.fixture.id)throw Error('赛程已更新，请返回经理首页');
 tactics=validateTactics(tactics||preview.tactics);lineup=lineup||preferredLineup(side?preview.input.away:preview.input.home,tactics,s.manager.lineup);
 const state=createMatch({...preview.input,[side?'awayTactics':'homeTactics']:tactics,[side?'awayLineup':'homeLineup']:lineup,[side?'awayAI':'homeAI']:false});
 s.activeMatch={fixtureId:preview.fixture.id,serial:0,state:snapshotMatch(state)};
 s.manager.tactics=structuredClone(tactics);s.manager.lineup=structuredClone(lineup);s.revision++;
 return state;
}
export function savePreparation(s,{fixtureId,tactics,lineup}){
 if(s.activeMatch)throw Error('比赛已开始，请使用临场战术');
 const preview=coachPreview(s);
 if(preview.fixture.id!==fixtureId)throw Error('赛程已更新，请返回经理首页');
 const side=preview.side;
 // Use the same eligibility and formation validation as kickoff.
 createMatch({...preview.input,[side?'awayTactics':'homeTactics']:tactics,[side?'awayLineup':'homeLineup']:lineup,[side?'awayAI':'homeAI']:false});
 s.manager.tactics=validateTactics(tactics);s.manager.lineup=structuredClone(lineup);s.revision++;
}
export function updateCoachedMatch(s,{fixtureId,serial,steps=0,command}={}){
 const active=s.activeMatch;
 if(!active||active.fixtureId!==fixtureId||active.serial!==serial)throw Error('比赛进度已在其他页面更新，请刷新后继续');
 if(!Number.isInteger(steps)||steps<0||steps>20000)throw Error('比赛步数无效');
 const state=restoreMatch(active.state),side=state.teams.findIndex(t=>t.id===s.manager.clubId);
 if(command){if(command.side!==side||!['tactics','substitution'].includes(command.type))throw Error('只能指挥自己的球队');applyCommand(state,command);}
 for(let i=0;i<steps&&state.status==='playing';i++)stepMatch(state);
 if(state.status==='abandoned')throw Error('比赛中止，暂未支持赛事裁决');
 if(state.status==='finished'){
  const m=s.fixtures.find(m=>m.id===fixtureId);
  if(!m||m.score)throw Error('比赛已经结束');
  const result={...getResult(state),health:state.teams.flatMap(t=>t.roster.map(p=>({id:p.id,condition:t.lines[p.id].condition,injuryDays:p.injuryDays})))};
  commitResult(s,m,matchInput(s,m),result);
  m.coached=true;s.activeMatch=null;
 }else{s.activeMatch={fixtureId,serial:serial+1,state:snapshotMatch(state)};s.revision++;}
 s.manager.tactics=structuredClone(state.teams[side].tactics);
 return state;
}
export function goalProgress(s){
 const goal=s.manager.goal||seasonGoal(s),row=tableFor(s,managedDivision(s)).find(r=>r.id===s.manager.clubId);
 return {goal,row,met:row.played>0&&row.rank<=goal.target};
}
