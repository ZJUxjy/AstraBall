import {selectAISubstitutions,planAITeam} from './ai-team.js';
import {hash,mean} from './random.js';
import {FORMATIONS,available,skillRating,familiarity,selectLineup} from './players.js';
export const COACH_STYLES={
 possession:{formation:'4-2-3-1',passing:'short',tempo:'slow',width:'narrow',striker:'link',fullbacks:'overlap'},
 pressing:{formation:'4-3-3',passing:'mixed',pressing:'high',line:'high',tempo:'fast',fullbacks:'support'},
 counter:{formation:'4-4-2',passing:'direct',pressing:'low',line:'deep',tempo:'fast',striker:'run',fullbacks:'hold'},
 wide:{formation:'3-5-2',passing:'direct',width:'wide',fullbacks:'overlap',striker:'run'},
 balanced:{formation:'4-3-3',passing:'mixed',pressing:'balanced',line:'normal',tempo:'normal'},
};
export function coachStyle(team){return Object.keys(COACH_STYLES)[hash(`coach:${team.id}`)%Object.keys(COACH_STYLES).length];}
export function matchReadiness(player,position){
 return skillRating(player,position)*familiarity(player,position)*(.55+.45*player.condition/100)*(.94+.06*player.sharpness/100);
}
export function coachLineup(team,formation){
 if(team.roster.filter(available).length<11)return planAITeam(team,{formation,allowIncomplete:true,requireKeeper:true,rotation:false}).lineup;
 const used=new Set();
 return FORMATIONS[formation].map(position=>{
  const candidates=team.roster.filter(p=>available(p)&&!used.has(p.id)).sort((a,b)=>matchReadiness(b,position)-matchReadiness(a,position)||a.id.localeCompare(b.id));
  if(!candidates.length)throw Error('健康球员不足 11 人');
  used.add(candidates[0].id);return {id:candidates[0].id,position};
 });
}
const lineupQuality=team=>mean((team.roster.filter(available).length<11?coachLineup(team,'4-3-3'):selectLineup(team)).map(slot=>skillRating(team.roster.find(p=>p.id===slot.id),slot.position)));
export function prepareCoach(team,opponent){
 const style=coachStyle(team),tactics={...COACH_STYLES[style]},gap=lineupQuality(team)-lineupQuality(opponent);
 const players=team.roster.filter(available),defenders=players.filter(p=>['CB','LB','RB'].includes(p.position)),runners=opponent.roster.filter(p=>available(p)&&['ST','LW','RW'].includes(p.position));
 if(gap<-9)Object.assign(tactics,{mentality:'defensive',fullbacks:'hold'});
 else if(gap>9)tactics.mentality='attacking';
 if(tactics.line==='high'&&mean(runners.map(p=>p.attributes.pace))>mean(defenders.map(p=>p.attributes.pace))+8)tactics.line='normal';
 if(mean(players.map(p=>p.condition))<75)Object.assign(tactics,{pressing:'low',tempo:'normal'});
 return {style,tactics,lineup:coachLineup(team,tactics.formation)};
}

// All decisions depend only on visible match state. No match random draws.
export function coachCommands(state,side){
 const team=state.teams[side],opponent=state.teams[1-side],coach=team.coach;
 if(!coach||state.status!=='playing')return [];
 const minute=[0,45,90,105][state.period-1]+Math.min(state.periodClock/60,state.period>2?15:45);
 const difference=team.stats.goals-opponent.stats.goals;
 const signature=`${difference}:${team.slots.length}:${opponent.slots.length}`;
 const changed=coach.signature!==signature;
 const emergency=team.slots.length<(coach.lastPlayers??11);
 const commands=[];
 if(minute>=coach.nextReview||changed&&(state.elapsed-(coach.lastReview??-120)>=120||emergency)){
  const condition=mean(team.slots.filter(p=>p.position!=='GK').map(p=>team.lines[p.id].condition));
  const tactics={...coach.baseTactics};let reason='assess';
  if(team.slots.length<opponent.slots.length&&!(difference<0&&minute>=75)){
   Object.assign(tactics,{mentality:'defensive',line:'deep',pressing:'low',fullbacks:'hold',passing:'direct'});reason='redCard';
  }else if(difference<0&&minute>=55){
   Object.assign(tactics,{mentality:'attacking',tempo:'fast',fullbacks:'overlap',striker:'run',pressing:condition>67?'high':'balanced'});reason='chase';
   if(minute>=75&&team.slots.length===11)tactics.formation='4-4-2';
  }else if(difference>0&&(minute>=70||difference>=2&&minute>=55)){
   Object.assign(tactics,{mentality:'defensive',tempo:'slow',fullbacks:'hold',pressing:'low',line:'deep',passing:'mixed'});reason='protect';
  }else if(condition<65){Object.assign(tactics,{pressing:'low',tempo:'normal'});reason='fatigue';}
  else if(opponent.tactics.line==='high'){
   Object.assign(tactics,{passing:'direct',striker:'run'});reason='behindLine';
  }else if(opponent.tactics.passing==='short'&&condition>80){tactics.pressing='high';reason='pressBuildUp';}
  if(Object.keys(tactics).some(key=>tactics[key]!==team.tactics[key]))commands.push({type:'tactics',side,tactics,reason});
  coach.nextReview=minute+10;coach.lastReview=state.elapsed;coach.lastPlayers=team.slots.length;coach.signature=signature;coach.lastDecision=reason;
 }
 // Re-evaluate replacements after a formation change has assigned actual slots.
 if(commands.some(c=>c.type==='tactics'&&c.tactics.formation!==team.tactics.formation))return commands;
 const trigger=[55,65,78,100].find(m=>minute>=m&&!coach.subReviews.includes(m));
 if(trigger!==undefined){
  coach.subReviews.push(trigger);
  if(team.subs<5&&team.windows<3){
   const used=new Set(team.used),outgoing=new Set();
   const allowance=Math.min(trigger===78?1:2,5-team.subs);
   for(let i=0;i<allowance;i++){
    const candidates=team.slots.filter(slot=>!outgoing.has(slot.id)&&team.lines[slot.id].seconds>=20*60&&
     (slot.position!=='GK'||team.roster.find(p=>p.id===slot.id).position!=='GK')).map(slot=>{
      const current=team.roster.find(p=>p.id===slot.id),condition=team.lines[slot.id].condition;
      const bench=team.roster.filter(p=>available(p)&&!used.has(p.id)&&(slot.position==='GK'?p.position==='GK':p.position!=='GK'))
       .sort((a,b)=>matchReadiness(b,slot.position)-matchReadiness(a,slot.position)||a.id.localeCompare(b.id))[0];
      if(!bench)return null;
      const improvement=matchReadiness(bench,slot.position)-matchReadiness({...current,condition},slot.position);
      const booked=team.lines[slot.id].yellow>0;
      return {slot,bench,condition,improvement,priority:improvement+(booked?3:0)+(slot.position==='GK'?30:0)};
     }).filter(Boolean).filter(c=>(c.condition<88&&c.improvement>1.5)||c.improvement>7||c.slot.position==='GK').sort((a,b)=>b.priority-a.priority||a.slot.id.localeCompare(b.slot.id));
    if(!candidates.length){for(const change of selectAISubstitutions(team,{minute,maxChanges:allowance-i,scoreDifference:difference}).filter(c=>!outgoing.has(c.out)&&!used.has(c.in)))commands.push({type:'substitution',side,...change,reason:'rotation'});break;}
    const candidate=candidates[0];used.add(candidate.bench.id);outgoing.add(candidate.slot.id);
    commands.push({type:'substitution',side,out:candidate.slot.id,in:candidate.bench.id,reason:candidate.condition<88?'fatigue':'upgrade'});
   }
  }
 }
 return commands;
}
