import {rng,clamp} from './random.js';

// Correlated skill families describe tendencies, not exclusive player classes.
// All scales and practice priors are game parameters, not empirical estimates.
const families={
 passing:{passing:1,longPassing:1,vision:.6,decisions:.4},
 ballControl:{firstTouch:.8,dribbling:1,technique:1,agility:.35},
 finishing:{finishing:1,longShots:.7,penalties:.35,offBall:.5,composure:.35},
 defending:{tackling:1,marking:1,positioning:.65,anticipation:.45},
 aerial:{heading:1,jumping:.65,strength:.35,aerialReach:.6},
 delivery:{crossing:1,corners:.8,freeKicks:.35,longPassing:.35},
 deadBall:{corners:.5,freeKicks:1,penalties:.55},
 athletic:{pace:1,acceleration:1},
 balance:{agility:.7,balance:1},
 endurance:{stamina:1,naturalFitness:.7},
 goalkeeping:{reflexes:1,handling:.7,oneOnOnes:.8,rushingOut:.5},
 distribution:{kicking:1,throwing:.8,command:.5},
};
const goalkeeperTechnicalPenalty={passing:9,longPassing:8,firstTouch:11,dribbling:17,technique:13,crossing:20,finishing:22,longShots:21,heading:18,tackling:16,marking:18,corners:21,freeKicks:20,penalties:14};
export function youthSpecialties({id,seed='academy',position}){
 const random=rng(`youth-specialties:v1:${seed}:${id}`);
 const tendencies=Object.fromEntries(Object.keys(families).map(key=>[key,clamp(random.normal(),-2.5,2.5)]));
 const wide=['LB','RB','LW','RW'].includes(position),creator=['DM','CM','AM'].includes(position),attacker=['AM','LW','RW','ST'].includes(position);
 const options=[['general',5],['corners',wide?2.8:1],['freeKicks',creator?2.3:1],['penalties',attacker?2:1]];
 const practiceFocus=random.pick(options,x=>x[1])[0];
 const practice={corners:clamp(.10+random.next()*.25+(practiceFocus==='corners'?.5:0)),freeKicks:clamp(.05+random.next()*.20+(practiceFocus==='freeKicks'?.6:0)),penalties:clamp(.25+random.next()*.25+(practiceFocus==='penalties'?.45:0))};
 const initial={},ceiling={};
 for(const [family,weights] of Object.entries(families))for(const [key,weight] of Object.entries(weights)){
  // A field player's unused goalkeeping ratings keep their low-value branch.
  initial[key]=(initial[key]||0)+tendencies[family]*weight*2.8;
  ceiling[key]=(ceiling[key]||0)+tendencies[family]*weight*3.6;
 }
 // Prior specialist practice changes present readiness, never talent ceilings.
 initial.corners=(initial.corners||0)-7+12*practice.corners;
 initial.freeKicks=(initial.freeKicks||0)-9+14*practice.freeKicks;
 initial.penalties=(initial.penalties||0)-3+8*practice.penalties;
 return {initial,ceiling};
}
export const youthGoalkeeperPenalty=key=>goalkeeperTechnicalPenalty[key]??18;
