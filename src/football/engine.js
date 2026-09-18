import {LEGACY_ENGINES,legacyEngine} from './legacy.js';
import {validateMatchSnapshot} from './snapshot-validation.js';
export {validateMatchSnapshot} from './snapshot-validation.js';
import {prepareCoach,coachLineup,coachCommands} from './coach.js';
import {positionalAttribute} from './roles.js';
import {selectPass,routeModifier} from './passing.js';
import {initializeSpace,updateSpace,localPressure,nearestDefender} from './spatial.js';
import {rng,clamp,mean,sigmoid,logit} from './random.js';
import {selectLineup,FORMATIONS,available,familiarity,ATTRIBUTE_KEYS,skillRating} from './players.js';
import {ENGINE_VERSION,TUNE,skillDifference} from './config.js';
import {shotQuality,goalProbability} from './shots.js';
import {tacticalEffects} from './tactics.js';
import {exertion,conditionEffect} from './fitness.js';
import {periodBase,penaltyShootout} from './rules.js';
export {ENGINE_VERSION};
export const DEFAULT_TACTICS={formation:'4-3-3',passing:'mixed',pressing:'balanced',tempo:'normal',line:'normal',width:'normal',mentality:'balanced',fullbacks:'support',striker:'run',focus:'balanced'};
export const TACTIC_VALUES={formation:Object.keys(FORMATIONS),passing:['short','mixed','direct'],pressing:['low','balanced','high'],tempo:['slow','normal','fast'],line:['deep','normal','high'],width:['narrow','normal','wide'],mentality:['defensive','balanced','attacking'],fullbacks:['hold','support','overlap'],striker:['link','run'],focus:['balanced','left','right']};
export function validateTactics(value={}){for(const [k,v] of Object.entries(value))if(!TACTIC_VALUES[k]?.includes(v))throw Error(`战术无效：${k}`);return {...DEFAULT_TACTICS,...value};}
function lineStats(id){return {id,seconds:0,goals:0,assists:0,shots:0,onTarget:0,xG:0,xA:0,passes:0,completed:0,tackles:0,interceptions:0,dribbles:0,dribblesWon:0,saves:0,goalsAgainst:0,fouls:0,yellow:0,red:0,condition:100};}
function teamStats(){return {goals:0,shots:0,onTarget:0,xG:0,passes:0,completed:0,dribbles:0,dribblesWon:0,tackles:0,interceptions:0,corners:0,fouls:0,yellow:0,red:0,offsides:0,possessionSeconds:0,playerSeconds:0,penalties:0};}
function teamContext(input,tactics,lineup,allowShortHanded=false){
 const team=structuredClone(input),ids=new Set();if(!team?.id||!Array.isArray(team.roster))throw Error('球队数据无效');
 for(const p of team.roster){if(!p.id||ids.has(p.id))throw Error('球员 ID 重复');ids.add(p.id);for(const k of ATTRIBUTE_KEYS)if(!Number.isFinite(p.attributes?.[k])||p.attributes[k]<1||p.attributes[k]>99)throw Error(`球员属性无效：${p.id}/${k}`);for(const k of ['morale','sharpness','weakFoot'])if(!Number.isFinite(p[k])||p[k]<0||p[k]>100)throw Error('球员状态无效');for(const k of ['consistency','bigMatches','injuryProneness','adaptability'])if(!Number.isFinite(p.personality?.[k]))throw Error('球员性格数据无效');if(!Number.isFinite(p.condition)||p.condition<0||p.condition>100)throw Error('体能无效');}
 const settings=validateTactics(tactics),slots=structuredClone(lineup??selectLineup(team,settings.formation));
 const short=allowShortHanded&&slots.length>=7&&slots.length<11,positions=[...FORMATIONS[settings.formation]];
 if(short){for(const slot of slots){const index=positions.indexOf(slot.position);if(index<0)throw Error('首发位置必须符合所选阵型');positions.splice(index,1);}}
 else if(slots.map(s=>s.position).sort().join(',')!==positions.sort().join(','))throw Error('首发位置必须符合所选阵型');
 if((!short&&slots.length!==11)||new Set(slots.map(s=>s.id)).size!==slots.length||slots.filter(s=>s.position==='GK').length!==1)throw Error('首发必须有 11 名不同球员和 1 名门将');
 for(const s of slots){const p=team.roster.find(p=>p.id===s.id);if(!p||!available(p)||!FORMATIONS[settings.formation].includes(s.position))throw Error('首发球员或位置无效');}
 const lines=Object.fromEntries(team.roster.map(p=>[p.id,{...lineStats(p.id),condition:p.condition}]));
 return {...team,tactics:settings,slots,lines,stats:teamStats(),used:new Set(slots.map(s=>s.id)),subs:0,windows:0,lastSubTime:-1};
}
export function createMatch({home,away,seed=1,homeTactics={},awayTactics={},homeLineup,awayLineup,neutral=false,knockout=false,capture=true,plans=[],importance=0,homeAI=false,awayAI=false,ai=[homeAI,awayAI],allowShortHanded=false}={}){
 if(home?.id===away?.id)throw Error('不能与自己比赛');
 if(!Array.isArray(ai)||ai.length!==2||ai.some(v=>typeof v!=='boolean'))throw Error('教练控制设置无效');
 const inputs=[home,away],settings=[homeTactics,awayTactics],lineups=[homeLineup,awayLineup];
 const teams=inputs.map((input,side)=>{
  const coach=ai[side]?prepareCoach(input,inputs[1-side]):null;
  const tactics=validateTactics({...coach?.tactics,...settings[side]});
  const team=teamContext(input,tactics,lineups[side]||(coach?coachLineup(input,tactics.formation):undefined),allowShortHanded);
  team.coach=coach?{style:coach.style,baseTactics:{...tactics},nextReview:15,subReviews:[],lastDecision:null}:null;return team;
 });
 const ids=teams.flatMap(t=>t.roster.map(p=>p.id));if(new Set(ids).size!==ids.length)throw Error('两队球员 ID 不得相同');
 const random=rng(`match:${seed}`);
 const kickoff=random.int(0,1);
 for(const t of teams)for(const p of t.roster)t.lines[p.id].form=random.normal()*(100-p.personality.consistency)*.035+(p.personality.bigMatches-50)*clamp(importance)*.04;
 const state={version:ENGINE_VERSION,seed,plans:structuredClone(plans).sort((a,b)=>a.minute-b.minute),teams,random,neutral,knockout,capture,events:[],elapsed:0,period:1,periodClock:0,lostSeconds:0,periodEnd:47*60,status:'playing',kickoff,side:kickoff,x:40,y:34,holder:null,lastPass:null,sequence:0,actions:0,shootout:null};
 initializeSpace(state);return state;
}
const player=(team,id)=>team.roster.find(p=>p.id===id);
const field=team=>team.slots.map(s=>player(team,s.id));
const outfield=team=>team.slots.filter(s=>s.position!=='GK').map(s=>player(team,s.id));
const keeper=team=>player(team,team.slots.find(s=>s.position==='GK')?.id)||field(team).sort((a,b)=>b.attributes.reflexes-a.attributes.reflexes)[0];
function ability(state,team,p,keys){const slot=team.slots.find(s=>s.id===p.id);const value=mean(keys.map(k=>positionalAttribute(p,slot?.position||p.position,k)));const physical=keys.some(k=>['pace','acceleration','agility','strength','jumping'].includes(k));
 return (value+team.lines[p.id].form+(p.morale-50)*.025+(p.sharpness-70)*.025)*conditionEffect(team.lines[p.id].condition,physical);}
function teamAbility(state,team,keys){const active=outfield(team);const leadership=Math.max(...active.map(p=>p.attributes.leadership));return (mean(active.map(p=>ability(state,team,p,keys)))+(leadership-65)*.025)*Math.sqrt(team.slots.length/11);}
function emit(s,type,data={}){const e={seq:s.sequence++,type,seconds:s.elapsed,period:s.period,minute:periodBase(s.period)+s.periodClock/60,side:s.side,x:s.side===0?s.x:105-s.x,y:s.side===0?s.y:68-s.y,score:s.teams.map(t=>t.stats.goals),...data};if(s.capture)s.events.push(e);return e;}
function clock(s,seconds,active=true){const dt=Math.max(0,Math.min(seconds,s.periodEnd-s.periodClock));s.elapsed+=dt;s.periodClock+=dt;if(active)s.teams[s.side].stats.possessionSeconds+=dt;else{s.lostSeconds+=dt;s.periodEnd=Math.max(s.periodClock,(s.period>2?15:45)*60+Math.min(s.period>2?120:480,60+Math.round(s.lostSeconds*.3/60)*60));}for(const t of s.teams)for(const slot of t.slots){const line=t.lines[slot.id];line.seconds+=dt;t.stats.playerSeconds+=dt;line.condition=clamp(line.condition-exertion(player(t,slot.id),t.tactics,dt*(active?1:.35),slot.position),15,100);}}
function takeBall(s,side,x=25,y=34,holder=null){const previous=s.side;if(previous!==side)s.turnoverAt=holder&&s.teams[side].slots.some(slot=>slot.id===holder&&slot.position!=='GK')?s.elapsed:null;s.side=side;s.x=clamp(x,5,98);s.y=clamp(y,4,64);s.holder=holder;if(holder&&s.teams[side].lines[holder])s.teams[side].lines[holder].position=[s.x,s.y];s.lastPass=null;}
function choose(s,team,role,exclude){return s.random.pick(outfield(team).filter(p=>p.id!==exclude),p=>{
 const pos=team.slots.find(slot=>slot.id===p.id).position;
 const forward=['ST','LW','RW','AM'].includes(pos),defender=['CB','LB','RB','DM'].includes(pos);
 if(role==='defend')return (defender?3:1)*(p.attributes.positioning+p.attributes.anticipation)/100;
 if(role==='shoot')return (forward?5:pos==='CM'?2:.5)*(p.attributes.offBall+30)/100;
 return (s.x<35?(defender?3:1):s.x>72?(forward?6:['CM','DM'].includes(pos)?1.3:.35):(['CM','DM','AM'].includes(pos)?3:1))*(p.attributes.teamwork+40)/100;
 });}
function venueSign(s,side=s.side){return s.neutral?0:side===0?1:-1;}
function shot(s,shooter,{kind='open',assist=s.lastPass}={}){
 const attack=s.teams[s.side],defense=s.teams[1-s.side],gk=keeper(defense),line=attack.lines[shooter.id];
 const tactics=tacticalEffects(attack,defense,s.x);
 const home=venueSign(s);
 const pressure=clamp(localPressure(s,s.side,[s.x,s.y])*.7+teamAbility(s,defense,['marking','positioning','concentration'])/430+tactics.defensivePressure*.3-tactics.exposure*.3-home*TUNE.homeEdge*4,.1,.9);
 if(kind==='penalty')attack.stats.penalties++;
 const xG=shotQuality({x:s.x,y:s.y,pressure,kind,counter:assist?.kind==='through'&&defense.tactics.line==='high'});
 const fin=ability(s,attack,shooter,kind==='penalty'?['penalties','composure']:kind==='freeKick'?['freeKicks','technique']:kind==='header'?['heading','jumping','bravery']:s.x<82?['longShots','technique','composure']:['finishing','composure'])+home*4.5,gkSkill=ability(s,defense,gk,s.x>93?['oneOnOnes','reflexes','rushingOut']:['reflexes','handling','agility'])-home*3.2;
 const weak=(s.y<34&&shooter.foot==='right'||s.y>34&&shooter.foot==='left')?shooter.weakFoot:100;
 const probability=goalProbability(xG,fin,gkSkill,{weakFoot:kind==='penalty'?100:weak}),onTarget=clamp(.32+xG*.45+(fin-65)*.0015,probability,.95);
 const roll=s.random.next(),outcome=roll<probability?'goal':roll<onTarget?'save':roll<.62?'blocked':'miss';
 attack.stats.shots++;attack.stats.xG+=xG;line.shots++;line.xG+=xG;
 if(assist&&assist.id!==shooter.id&&attack.slots.some(p=>p.id===assist.id)){attack.lines[assist.id].xA+=xG;}
 if(outcome==='goal'||outcome==='save'){attack.stats.onTarget++;line.onTarget++;}
 if(outcome==='goal'){attack.stats.goals++;line.goals++;defense.lines[gk.id].goalsAgainst++;if(assist&&assist.id!==shooter.id&&attack.slots.some(p=>p.id===assist.id)){attack.lines[assist.id].assists++;}}
 if(outcome==='save')defense.lines[gk.id].saves++;
 emit(s,'shot',{player:shooter.id,keeper:gk.id,kind,outcome,xG,probability,assist:assist?.id||null});
 clock(s,18,false);
 if(kind!=='penalty'&&(outcome==='blocked'||outcome==='save')&&s.random.next()<.44){s.pending='corner';s.lastPass=null;return;}
 if(kind!=='penalty'&&outcome==='save'&&s.random.next()<clamp((100-gk.attributes.handling)/230,.03,.35)){s.x=94;s.y=34;s.holder=null;s.lastPass=null;emit(s,'rebound');return;}
 takeBall(s,1-s.side,outcome==='goal'?52:12,34,outcome==='goal'?null:gk.id);
}

function removePlayer(s,side,id){
 const t=s.teams[side];t.slots=t.slots.filter(p=>p.id!==id);
 if(!t.slots.some(p=>p.position==='GK')&&t.slots.length){const next=keeper(t);t.slots.find(p=>p.id===next.id).position='GK';emit(s,'emergencyKeeper',{side,player:next.id});}
 if(s.side===side){if(s.holder===id)s.holder=null;s.lastPass=null;}
 if(t.slots.length<7){s.status='abandoned';s.abandonedSide=side;emit(s,'abandoned',{side});}
}
function foul(s,defender){
 const side=1-s.side,defense=s.teams[side],line=defense.lines[defender.id];defense.stats.fouls++;line.fouls++;
 const penalty=s.x>88&&Math.abs(s.y-34)<19&&s.random.next()<.11;
 emit(s,'foul',{side,player:defender.id,penalty});
 const cardChance=clamp(.17+(defender.attributes.aggression-defender.attributes.decisions)*.0015,.05,.4)*(line.yellow?.09:1);
 const direct=s.random.next()<.002;
 if(direct||s.random.next()<cardChance){
  if(!direct){line.yellow++;defense.stats.yellow++;emit(s,'yellow',{side,player:defender.id});}
  if(direct||line.yellow>=2){line.red++;defense.stats.red++;removePlayer(s,side,defender.id);emit(s,'red',{side,player:defender.id,secondYellow:!direct});}
 }
 if(s.status!=='playing')return;clock(s,24,false);s.lastPass=null;
 if(penalty){const taker=field(s.teams[s.side]).sort((a,b)=>b.attributes.penalties-a.attributes.penalties)[0];s.x=94;s.y=34;shot(s,taker,{kind:'penalty',assist:null});}
 else if(s.periodClock>=60&&s.x>74&&s.random.next()<.20){const taker=outfield(s.teams[s.side]).sort((a,b)=>b.attributes.freeKicks-a.attributes.freeKicks)[0];shot(s,taker,{kind:'freeKick',assist:null});}
}
function corner(s){
 s.pending=null;const attack=s.teams[s.side],defense=s.teams[1-s.side],gk=keeper(defense);
 const taker=outfield(attack).sort((a,b)=>b.attributes.corners-a.attributes.corners)[0];attack.stats.corners++;emit(s,'corner',{player:taker.id});clock(s,20,false);
 const delivery=ability(s,attack,taker,['corners','crossing','technique'])+venueSign(s)*3.5;const defending=teamAbility(s,defense,['heading','jumping','marking'])*.75+ability(s,defense,gk,['aerialReach','command'])*.25-venueSign(s)*2.5;
 if(s.random.next()<clamp(.23+(delivery-defending)*.003+venueSign(s)*TUNE.homeEdge*2,.08,.48)){
  const receiver=s.random.pick(outfield(attack).filter(p=>p.id!==taker.id),p=>(p.attributes.heading+p.attributes.jumping+p.attributes.bravery)**2);
  s.x=s.random.int(90,98);s.y=s.random.int(25,43);shot(s,receiver,{kind:'header',assist:{id:taker.id,kind:'corner'}});
 }else takeBall(s,1-s.side,15,34,gk.id);
}
export function injuryAbsence(random,{history=0}={}){
 const rec=Math.min(4,Math.max(0,history));
 const roll=random.next();
 const shift=rec*.05;
 if(roll<Math.max(.42,.62-shift*1.4))return random.int(3,9);
 if(roll<Math.max(.72,.88-shift*.5))return random.int(10,21);
 if(roll<.97)return random.int(22,35);
 return random.int(36,70);
}
function injure(s,side){
 const t=s.teams[side],p=s.random.pick(field(t),p=>(20+p.personality.injuryProneness)*(1+(100-t.lines[p.id].condition)/80)*(1+(p.injuryHistory||0)*.35));
 p.injuryDays=injuryAbsence(s.random,{history:p.injuryHistory||0});p.injuryHistory=(p.injuryHistory||0)+1;emit(s,'injury',{side,player:p.id,days:p.injuryDays});clock(s,30,false);
 const slot=t.slots.find(x=>x.id===p.id),candidate=t.roster.filter(p=>available(p)&&!t.used.has(p.id)).sort((a,b)=>skillRating(b,slot.position)*familiarity(b,slot.position)-skillRating(a,slot.position)*familiarity(a,slot.position))[0];
 if(candidate&&t.subs<5&&t.windows<3)applyCommand(s,{type:'substitution',side,out:p.id,in:candidate.id});else removePlayer(s,side,p.id);
}

function playAction(s){
 if(s.pending==='corner'){corner(s);return;}
 const attack=s.teams[s.side],defense=s.teams[1-s.side],actor=player(attack,s.holder)||choose(s,attack,'pass');
 s.holder=actor.id;attack.lines[actor.id].position=[s.x,s.y];
 const effects=tacticalEffects(attack,defense,s.x);
 const actionSeconds=TUNE.actionSeconds*effects.seconds*(.65+s.random.next()*.7);
 updateSpace(s,actionSeconds);clock(s,actionSeconds);
 const defender=player(defense,nearestDefender(s,1-s.side,[105-s.x,68-s.y]));
 if(s.random.next()<TUNE.foulRate*(.55+defender.attributes.aggression/100)){foul(s,defender);return;}
 if(s.random.next()<TUNE.injuryRate){injure(s,s.random.int(0,1));return;}
 if(s.periodClock>=60&&s.x>75&&s.random.next()<(s.lastPass?.kind==='cross'?.62:TUNE.shoot*effects.shooting)){shot(s,actor,{kind:s.lastPass?.kind==='cross'?'header':'open'});return;}
 if(s.random.next()<.11){
  const skill=ability(s,attack,actor,['dribbling','agility','balance','acceleration']);
  const stop=ability(s,defense,defender,['tackling','positioning','strength']);
  const success=s.random.next()<clamp(.59+skillDifference(skill-stop,TUNE.duelSkillScale)+venueSign(s)*TUNE.homeEdge*2,.15,.91);
  attack.stats.dribbles++;attack.lines[actor.id].dribbles++;
  emit(s,'dribble',{player:actor.id,defender:defender.id,success});
  if(success){attack.stats.dribblesWon++;attack.lines[actor.id].dribblesWon++;s.x=Math.min(96,s.x+8);if(s.x>70)s.y+=Math.sign(34-s.y)*Math.min(5,Math.abs(34-s.y));attack.lines[actor.id].position=[s.x,s.y];s.lastPass=null;}
  else{defense.stats.tackles++;defense.lines[defender.id].tackles++;takeBall(s,1-s.side,105-s.x,68-s.y,defender.id);}return;
 }
 const crossing=s.x>72&&Math.abs(s.y-34)>16&&s.random.next()<.17*effects.width;
 const forward=s.random.next()<TUNE.advance+effects.advance,back=!forward&&s.random.next()<.18;
 const through=forward&&s.x>45&&s.random.next()<.18+(attack.tactics.passing==='direct'?.1:0);
 const route=selectPass(s,actor,{forward,back,crossing,through}),receiver=route.player,target=route.target;
 const skill=ability(s,attack,actor,attack.slots.find(slot=>slot.id===actor.id)?.position==='GK'?(forward?['kicking','decisions']:['throwing','decisions']):crossing?['crossing','technique','vision']:through||route.length>30?['longPassing','vision','decisions']:['passing','decisions','technique'])+ability(s,attack,receiver,['firstTouch','offBall','pace'])*.15;
 const pressure=teamAbility(s,defense,['anticipation','positioning','workRate'])*1.15;
 const probability=clamp(TUNE.passBase+skillDifference(skill-pressure)+effects.completion+routeModifier(route)-(crossing?.14:route.progress>5?.045:0)+venueSign(s)*TUNE.homeEdge,.4,.97);
 const offside=route.offside;
 const success=!offside&&s.random.next()<probability;attack.stats.passes++;attack.lines[actor.id].passes++;
 emit(s,'pass',{player:actor.id,receiver:receiver.id,defender:defender.id,success,from:[s.side===0?s.x:105-s.x,s.side===0?s.y:68-s.y],to:s.side===0?target:[105-target[0],68-target[1]],kind:crossing?'cross':through?'through':route.progress>5?'progressive':route.progress<-5?'back':'short',offside,receiverStart:route.start,passLength:route.length,laneRisk:route.laneRisk,openness:route.openness});
 if(success){attack.stats.completed++;attack.lines[actor.id].completed++;s.x=target[0];s.y=target[1];s.holder=receiver.id;attack.lines[receiver.id].position=[...target];s.lastPass={id:actor.id,kind:crossing?'cross':through?'through':forward?'progressive':'short'};}
 else{if(offside){attack.stats.offsides++;emit(s,'offside',{player:receiver.id});clock(s,12,false);}else if(s.random.next()<.24){defense.stats.interceptions++;defense.lines[defender.id].interceptions++;}else{emit(s,'restart',{side:1-s.side,kind:'throwIn'});clock(s,4,false);}takeBall(s,1-s.side,105-target[0],68-target[1],defender.id);}
}
export function stepMatch(s){if(legacyEngine(s))return legacyEngine(s).stepMatch(s);if(s.status!=='playing')return false;if(++s.actions>20000)throw Error('比赛动作数超过安全上限');
 while(s.plans.length&&s.plans[0].minute<=periodBase(s.period)+Math.min(s.periodClock,(s.period>2?15:45)*60)/60){const plan=s.plans.shift();applyCommand(s,plan.command);}
 for(let side=0;side<2;side++)for(const command of coachCommands(s,side))applyCommand(s,command);
 playAction(s);
 if(s.status!=='playing')return false;
 if(s.periodClock>=s.periodEnd){emit(s,'periodEnd');
  const tied=s.teams[0].stats.goals===s.teams[1].stats.goals;
  const continues=s.period===1||s.period===3||s.period===2&&s.knockout&&tied;
  if(continues){
   if(s.period===1)for(const t of s.teams)for(const slot of t.slots)t.lines[slot.id].condition=clamp(t.lines[slot.id].condition+player(t,slot.id).attributes.naturalFitness*.055,0,100);
   s.period++;s.periodClock=0;s.lostSeconds=0;s.periodEnd=(s.period===2?47:16)*60;s.pending=null;
   takeBall(s,s.period===2?1-s.kickoff:s.period===3?s.kickoff:1-s.kickoff,52);emit(s,'periodStart');
  }else{
   if(s.knockout&&tied){s.shootout=penaltyShootout(s.teams,s.random);for(const kick of s.shootout.kicks)emit(s,'shootout',kick);}
   s.status='finished';emit(s,'fullTime');
  }
 }
 return s.status==='playing';
}
export function applyCommand(s,command){
 if(legacyEngine(s))return legacyEngine(s).applyCommand(s,command);
 if(s.status!=='playing')throw Error('比赛已结束');
 const t=s.teams[command.side];if(!t)throw Error('球队无效');
 if(command.type==='tactics'){
  const tactics=validateTactics({...t.tactics,...command.tactics});
  if(tactics.formation!==t.tactics.formation){
   const remaining=[...t.slots];const slots=FORMATIONS[tactics.formation].slice(0,t.slots.length).map((position,anchorIndex)=>{
    remaining.sort((a,b)=>skillRating(player(t,b.id),position)*familiarity(player(t,b.id),position)-skillRating(player(t,a.id),position)*familiarity(player(t,a.id),position));
    return {id:remaining.shift().id,position,anchorIndex};});t.slots=slots;
  }
  t.tactics=tactics;emit(s,'tactics',{side:command.side,tactics:{...tactics},reason:command.reason||null});return;
 }
 if(command.type!=='substitution')throw Error('未知指令');
 const index=t.slots.findIndex(p=>p.id===command.out),incoming=player(t,command.in);
 const sameWindow=t.lastSubTime===s.elapsed,halfTime=s.period===2&&s.periodClock===0;
 if(index<0||!incoming||!available(incoming)||t.used.has(incoming.id)||t.subs>=5||!sameWindow&&!halfTime&&t.windows>=3)throw Error('换人不符合规则');
 const outgoing=t.slots[index];t.slots[index]={id:incoming.id,position:outgoing.position,anchorIndex:outgoing.anchorIndex};t.lines[incoming.id].position=[...t.lines[command.out].position];
 t.used.add(incoming.id);t.subs++;if(!sameWindow&&!halfTime)t.windows++;t.lastSubTime=s.elapsed;
 if(s.side===command.side){if(s.holder===command.out)s.holder=incoming.id;s.lastPass=null;}
 emit(s,'substitution',{side:command.side,player:command.out,incoming:incoming.id,reason:command.reason||null});
}
export function getResult(s){if(legacyEngine(s))return legacyEngine(s).getResult(s);return {version:s.version,seed:s.seed,status:s.status,seconds:s.elapsed,score:s.teams.map(t=>t.stats.goals),teams:s.teams.map(t=>({id:t.id,name:t.name,stats:structuredClone(t.stats),players:Object.values(t.lines).map(p=>({...p,minutes:p.seconds/60})),onField:t.slots.map(p=>p.id),subs:t.subs})),events:structuredClone(s.events),shootout:s.shootout,abandonedSide:s.abandonedSide??null};}
export function simulateMatch(options){const s=createMatch(options);while(s.status==='playing')stepMatch(s);return getResult(s);}

// Save the random cursor and substitution sets alongside the event state.
export function snapshotMatch(state){
 if(LEGACY_ENGINES[state.version])return LEGACY_ENGINES[state.version].snapshotMatch(state);
 const {random,...data}=state;
 const saved=structuredClone(data);
 saved.randomState=random.snapshot();
 for(const t of saved.teams)t.used=[...t.used];
 return saved;
}
export function restoreMatch(saved){
 validateMatchSnapshot(saved);
 if(legacyEngine(saved))return legacyEngine(saved).restoreMatch(saved);
 if(saved?.version!==ENGINE_VERSION||!Number.isSafeInteger(saved.randomState)||saved.teams?.length!==2)throw Error('比赛存档无效');
 const state=structuredClone(saved);
 state.random=rng(state.seed,state.randomState);
 delete state.randomState;
 for(const t of state.teams)t.used=new Set(t.used);
 return state;
}
