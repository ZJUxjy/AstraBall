import {rng,clamp,mean,sigmoid,logit} from './random.js';
import {selectLineup,FORMATIONS,available,familiarity,ATTRIBUTE_KEYS,rating} from './players.js';
import {ENGINE_VERSION,TUNE} from './config.js';
export {ENGINE_VERSION};
export const DEFAULT_TACTICS={formation:'4-3-3',passing:'mixed',pressing:'balanced',tempo:'normal',line:'normal',width:'normal',mentality:'balanced'};
export const TACTIC_VALUES={formation:Object.keys(FORMATIONS),passing:['short','mixed','direct'],pressing:['low','balanced','high'],tempo:['slow','normal','fast'],line:['deep','normal','high'],width:['narrow','normal','wide'],mentality:['defensive','balanced','attacking']};
export function validateTactics(value={}){for(const [k,v] of Object.entries(value))if(!TACTIC_VALUES[k]?.includes(v))throw Error(`战术无效：${k}`);return {...DEFAULT_TACTICS,...value};}
function lineStats(id){return {id,seconds:0,goals:0,assists:0,shots:0,onTarget:0,xG:0,xA:0,passes:0,completed:0,tackles:0,interceptions:0,dribbles:0,dribblesWon:0,saves:0,goalsAgainst:0,fouls:0,yellow:0,red:0,condition:100};}
function teamStats(){return {goals:0,shots:0,onTarget:0,xG:0,passes:0,completed:0,dribbles:0,dribblesWon:0,tackles:0,interceptions:0,corners:0,fouls:0,yellow:0,red:0,offsides:0,possessionSeconds:0,penalties:0};}
function teamContext(input,tactics,lineup){
 const team=structuredClone(input),ids=new Set();if(!team?.id||!Array.isArray(team.roster))throw Error('球队数据无效');
 for(const p of team.roster){if(!p.id||ids.has(p.id))throw Error('球员 ID 重复');ids.add(p.id);for(const k of ATTRIBUTE_KEYS)if(!Number.isFinite(p.attributes?.[k])||p.attributes[k]<1||p.attributes[k]>99)throw Error(`球员属性无效：${p.id}/${k}`);if(!Number.isFinite(p.condition)||p.condition<0||p.condition>100)throw Error('体能无效');}
 const settings=validateTactics(tactics),slots=structuredClone(lineup??selectLineup(team,settings.formation));
 if(slots.length!==11||new Set(slots.map(s=>s.id)).size!==11||slots.filter(s=>s.position==='GK').length!==1)throw Error('首发必须有 11 名不同球员和 1 名门将');
 for(const s of slots){const p=team.roster.find(p=>p.id===s.id);if(!p||!available(p)||!FORMATIONS[settings.formation].includes(s.position))throw Error('首发球员或位置无效');}
 const lines=Object.fromEntries(team.roster.map(p=>[p.id,{...lineStats(p.id),condition:p.condition}]));
 return {...team,tactics:settings,slots,lines,stats:teamStats(),used:new Set(slots.map(s=>s.id)),subs:0,windows:0,lastSubTime:-1};
}
export function createMatch({home,away,seed=1,homeTactics={},awayTactics={},homeLineup,awayLineup,neutral=false,knockout=false,capture=true}={}){
 if(home?.id===away?.id)throw Error('不能与自己比赛');
 const teams=[teamContext(home,homeTactics,homeLineup),teamContext(away,awayTactics,awayLineup)];
 const ids=teams.flatMap(t=>t.roster.map(p=>p.id));if(new Set(ids).size!==ids.length)throw Error('两队球员 ID 不得相同');
 const random=rng(`match:${seed}`);
 return {version:ENGINE_VERSION,seed,teams,random,neutral,knockout,capture,events:[],elapsed:0,period:1,periodClock:0,periodEnd:47*60,status:'playing',side:random.int(0,1),x:40,y:34,holder:null,lastPass:null,sequence:0,actions:0,shootout:null};
}
const player=(team,id)=>team.roster.find(p=>p.id===id);
const field=team=>team.slots.map(s=>player(team,s.id));
const outfield=team=>team.slots.filter(s=>s.position!=='GK').map(s=>player(team,s.id));
const keeper=team=>player(team,team.slots.find(s=>s.position==='GK')?.id)||field(team).sort((a,b)=>b.attributes.reflexes-a.attributes.reflexes)[0];
function ability(state,team,p,keys){const value=mean(keys.map(k=>p.attributes[k]));const slot=team.slots.find(s=>s.id===p.id);return value*familiarity(p,slot?.position||p.position);}
function teamAbility(state,team,keys){return mean(outfield(team).map(p=>ability(state,team,p,keys)));}
function emit(s,type,data={}){const e={seq:s.sequence++,type,seconds:s.elapsed,period:s.period,minute:(s.period-1)*45+s.periodClock/60,side:s.side,x:s.side===0?s.x:105-s.x,y:s.side===0?s.y:68-s.y,score:s.teams.map(t=>t.stats.goals),...data};if(s.capture)s.events.push(e);return e;}
function clock(s,seconds,active=true){const dt=Math.min(seconds,s.periodEnd-s.periodClock);s.elapsed+=dt;s.periodClock+=dt;if(active)s.teams[s.side].stats.possessionSeconds+=dt;for(const t of s.teams)for(const slot of t.slots)t.lines[slot.id].seconds+=dt;}
function takeBall(s,side,x=25,y=34,holder=null){s.side=side;s.x=clamp(x,5,98);s.y=clamp(y,4,64);s.holder=holder;s.lastPass=null;}
function choose(s,team,role,exclude){return s.random.pick(outfield(team).filter(p=>p.id!==exclude),p=>{
 const pos=team.slots.find(slot=>slot.id===p.id).position;
 const forward=['ST','LW','RW','AM'].includes(pos),defender=['CB','LB','RB','DM'].includes(pos);
 if(role==='defend')return (defender?3:1)*(p.attributes.positioning+p.attributes.anticipation)/100;
 if(role==='shoot')return (forward?5:pos==='CM'?2:.5)*(p.attributes.offBall+30)/100;
 return (s.x<35?(defender?3:1):s.x>72?(forward?3:1):(['CM','DM','AM'].includes(pos)?3:1))*(p.attributes.teamwork+40)/100;
 });}
function shot(s,shooter,{kind='open',assist=s.lastPass}={}){
 const attack=s.teams[s.side],defense=s.teams[1-s.side],gk=keeper(defense),line=attack.lines[shooter.id];
 const xG=kind==='penalty'?.78:.11;
 const fin=ability(s,attack,shooter,['finishing','composure']),gkSkill=ability(s,defense,gk,['reflexes','handling']);
 const probability=clamp(xG+(fin-gkSkill)*.001,.01,.90),onTarget=clamp(.35+(fin-65)*.002,probability,.85);
 const roll=s.random.next(),outcome=roll<probability?'goal':roll<onTarget?'save':roll<.62?'blocked':'miss';
 attack.stats.shots++;attack.stats.xG+=xG;line.shots++;line.xG+=xG;
 if(assist&&assist.id!==shooter.id&&attack.slots.some(p=>p.id===assist.id)){attack.lines[assist.id].xA+=xG;}
 if(outcome==='goal'||outcome==='save'){attack.stats.onTarget++;line.onTarget++;}
 if(outcome==='goal'){attack.stats.goals++;line.goals++;defense.lines[gk.id].goalsAgainst++;if(assist&&assist.id!==shooter.id&&attack.slots.some(p=>p.id===assist.id)){attack.lines[assist.id].assists++;}}
 if(outcome==='save')defense.lines[gk.id].saves++;
 emit(s,'shot',{player:shooter.id,keeper:gk.id,kind,outcome,xG,probability,assist:assist?.id||null});
 clock(s,18,false);takeBall(s,1-s.side,outcome==='goal'?52:12,34,gk.id);
}
function playAction(s){
 const attack=s.teams[s.side],defense=s.teams[1-s.side],actor=player(attack,s.holder)||choose(s,attack,'pass');
 s.holder=actor.id;const defender=choose(s,defense,'defend');
 clock(s,TUNE.actionSeconds*(.65+s.random.next()*.7));
 if(s.x>75&&s.random.next()<TUNE.shoot){shot(s,choose(s,attack,'shoot'));return;}
 if(s.random.next()<.11){
  const skill=ability(s,attack,actor,['dribbling','agility','balance','acceleration']);
  const stop=ability(s,defense,defender,['tackling','positioning','strength']);
  const success=s.random.next()<clamp(.59+(skill-stop)*.004,.15,.91);
  attack.stats.dribbles++;attack.lines[actor.id].dribbles++;
  emit(s,'dribble',{player:actor.id,defender:defender.id,success});
  if(success){attack.stats.dribblesWon++;attack.lines[actor.id].dribblesWon++;s.x=Math.min(96,s.x+8);s.lastPass=null;}
  else{defense.stats.tackles++;defense.lines[defender.id].tackles++;takeBall(s,1-s.side,105-s.x,68-s.y,defender.id);}return;
 }
 const receiver=choose(s,attack,'pass',actor.id),forward=s.random.next()<TUNE.advance,back=!forward&&s.random.next()<.18;
 const distance=forward?14+s.random.next()*10:back?-12:0;
 const target=[clamp(s.x+distance,10,97),clamp(s.y+(s.random.next()-.5)*28,5,63)];
 const skill=ability(s,attack,actor,['passing','decisions','technique'])+ability(s,attack,receiver,['firstTouch','offBall'])*.15;
 const pressure=teamAbility(s,defense,['anticipation','positioning','workRate'])*1.15;
 const probability=clamp(TUNE.passBase+(skill-pressure)*.0024-(forward?.045:0)+(s.side===0&&!s.neutral?TUNE.homeEdge:0),.4,.97);
 const success=s.random.next()<probability;attack.stats.passes++;attack.lines[actor.id].passes++;
 emit(s,'pass',{player:actor.id,receiver:receiver.id,defender:defender.id,success,from:[s.side===0?s.x:105-s.x,s.side===0?s.y:68-s.y],to:s.side===0?target:[105-target[0],68-target[1]],kind:forward?'progressive':back?'back':'short'});
 if(success){attack.stats.completed++;attack.lines[actor.id].completed++;s.x=target[0];s.y=target[1];s.holder=receiver.id;s.lastPass={id:actor.id,kind:forward?'progressive':'short'};}
 else{defense.stats.interceptions++;defense.lines[defender.id].interceptions++;takeBall(s,1-s.side,105-target[0],68-target[1],defender.id);}
}
export function stepMatch(s){if(s.status!=='playing')return false;if(++s.actions>20000)throw Error('比赛动作数超过安全上限');
 playAction(s);
 if(s.periodClock>=s.periodEnd){emit(s,'periodEnd');if(s.period===1){s.period=2;s.periodClock=0;s.periodEnd=48*60;takeBall(s,1-s.side,52);emit(s,'periodStart');}else{s.status='finished';emit(s,'fullTime');}}
 return s.status==='playing';
}
export function getResult(s){return {version:s.version,seed:s.seed,status:s.status,seconds:s.elapsed,score:s.teams.map(t=>t.stats.goals),teams:s.teams.map(t=>({id:t.id,name:t.name,stats:structuredClone(t.stats),players:Object.values(t.lines).map(p=>({...p,minutes:p.seconds/60})),onField:t.slots.map(p=>p.id),subs:t.subs})),events:structuredClone(s.events),shootout:s.shootout};}
export function simulateMatch(options){const s=createMatch(options);while(s.status==='playing')stepMatch(s);return getResult(s);}
