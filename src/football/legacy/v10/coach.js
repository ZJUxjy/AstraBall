import {hash,mean} from './random.js';
import {FORMATIONS,available,rating,familiarity,selectLineup} from './players.js';
export const COACH_STYLES={
 possession:{formation:'4-2-3-1',passing:'short',tempo:'slow',width:'narrow',striker:'link',fullbacks:'overlap'},
 pressing:{formation:'4-3-3',passing:'mixed',pressing:'high',line:'high',tempo:'fast',fullbacks:'support'},
 counter:{formation:'4-4-2',passing:'direct',pressing:'low',line:'deep',tempo:'fast',striker:'run',fullbacks:'hold'},
 wide:{formation:'3-5-2',passing:'direct',width:'wide',fullbacks:'overlap',striker:'run'},
 balanced:{formation:'4-3-3',passing:'mixed',pressing:'balanced',line:'normal',tempo:'normal'},
};
export function coachStyle(team){return Object.keys(COACH_STYLES)[hash(`coach:${team.id}`)%Object.keys(COACH_STYLES).length];}
export function matchReadiness(player,position){
 return rating(player,position)*familiarity(player,position)*(.55+.45*player.condition/100)*(.94+.06*player.sharpness/100);
}
export function coachLineup(team,formation){
 const used=new Set();
 return FORMATIONS[formation].map(position=>{
  const candidates=team.roster.filter(p=>available(p)&&!used.has(p.id)).sort((a,b)=>matchReadiness(b,position)-matchReadiness(a,position)||a.id.localeCompare(b.id));
  if(!candidates.length)throw Error('健康球员不足 11 人');
  used.add(candidates[0].id);return {id:candidates[0].id,position};
 });
}
const lineupQuality=team=>mean(selectLineup(team).map(slot=>rating(team.roster.find(p=>p.id===slot.id),slot.position)));
export function prepareCoach(team,opponent){
 const style=coachStyle(team),tactics={...COACH_STYLES[style]},gap=lineupQuality(team)-lineupQuality(opponent);
 const players=team.roster.filter(available),defenders=players.filter(p=>['CB','LB','RB'].includes(p.position)),runners=opponent.roster.filter(p=>available(p)&&['ST','LW','RW'].includes(p.position));
 if(gap<-9)Object.assign(tactics,{mentality:'defensive',fullbacks:'hold'});
 else if(gap>9)tactics.mentality='attacking';
 if(tactics.line==='high'&&mean(runners.map(p=>p.attributes.pace))>mean(defenders.map(p=>p.attributes.pace))+8)tactics.line='normal';
 if(mean(players.map(p=>p.condition))<75)Object.assign(tactics,{pressing:'low',tempo:'normal'});
 return {style,tactics,lineup:coachLineup(team,tactics.formation)};
}
