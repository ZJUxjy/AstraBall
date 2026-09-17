import {clamp} from './random.js';

// Metres in each team's own attacking frame; frame conversion is an involution.
export const FORMATION_ANCHORS = {
 '4-3-3': [[6,34],[29,9],[26,26],[26,42],[29,59],[43,34],[55,24],[55,44],[73,10],[78,34],[73,58]],
 '4-2-3-1': [[6,34],[29,9],[26,26],[26,42],[29,59],[43,25],[43,43],[66,10],[64,34],[66,58],[79,34]],
 '4-4-2': [[6,34],[28,9],[25,26],[25,42],[28,59],[53,10],[49,26],[49,42],[53,58],[76,25],[76,43]],
 '3-5-2': [[6,34],[27,19],[25,34],[27,49],[47,7],[41,34],[55,25],[62,43],[47,61],[77,25],[77,43]],
};
export const toAbsolute = (side,xy) => side ? [105-xy[0],68-xy[1]] : [...xy];
export const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);

export function anchorFor(team,slot){
 const anchors=FORMATION_ANCHORS[team.tactics.formation];
 // Slots retain their anchor index when a team loses a player.
 return anchors[slot.anchorIndex] || anchors[team.slots.indexOf(slot)] || [50,34];
}
export function initializeSpace(state){
 for(const team of state.teams)team.slots.forEach((slot,index)=>{
  slot.anchorIndex ??= index;
  team.lines[slot.id].position ??= [...anchorFor(team,slot)];
 });
}
export function updateSpace(state,seconds){
 initializeSpace(state);
 for(let side=0;side<2;side++){
  const team=state.teams[side],attacking=side===state.side;
  const ball=attacking?[state.x,state.y]:[105-state.x,68-state.y];
  const width=team.tactics.width==='wide'?1.22:team.tactics.width==='narrow'?.76:1;
  const line=team.tactics.line==='high'?5:team.tactics.line==='deep'?-5:0;
  const intent=team.tactics.mentality==='attacking'?3:team.tactics.mentality==='defensive'?-3:0;
  for(const slot of team.slots){
   const p=team.roster.find(p=>p.id===slot.id),record=team.lines[slot.id],anchor=anchorFor(team,slot);
   const goalkeeper=slot.position==='GK';
   let x=goalkeeper?clamp(ball[0]*.12,4,12):anchor[0]+(ball[0]-52)*.45+(attacking?6:-7)+line+intent;
   let y=goalkeeper?34+(ball[1]-34)*.12:34+(anchor[1]-34)*width+(ball[1]-34)*.15;
   if(attacking&&state.holder===slot.id){x=ball[0];y=ball[1];}
   const target=[clamp(x,3,99),clamp(y,3,65)],gap=distance(record.position,target);
   const maxTravel=seconds*(2.5+p.attributes.pace*.035)*(.55+.45*record.condition/100);
   const fraction=gap?Math.min(1,maxTravel/gap,1-Math.exp(-seconds/7)):1;
   record.position=record.position.map((value,i)=>value+(target[i]-value)*fraction);
  }
 }
}
export function coverage(team,point){
 return team.slots.filter(slot=>slot.position!=='GK').map(slot=>{
  const p=team.roster.find(p=>p.id===slot.id),record=team.lines[slot.id];
  const radius=(5+p.attributes.pace*.04)*(team.tactics.pressing==='high'?1.15:team.tactics.pressing==='low'?.9:1)*(.65+.35*record.condition/100);
  const influence=Math.exp(-(distance(record.position,point)**2)/(2*radius**2))*(.5+(p.attributes.positioning+p.attributes.anticipation)/200);
  return {id:slot.id,influence,distance:distance(record.position,point)};
 });
}
export function localPressure(state,attackingSide,point){
 const defense=state.teams[1-attackingSide];
 const sum=coverage(defense,[105-point[0],68-point[1]]).reduce((n,p)=>n+p.influence,0);
 return 1-Math.exp(-sum*.65);
}
export function laneRisk(state,side,from,to){
 // Ignore the passer's endpoint; sample the actual route, including reception.
 return Math.max(...[.25,.5,.75,1].map(t=>localPressure(state,side,from.map((x,i)=>x+(to[i]-x)*t))));
}
export function nearestDefender(state,side,point){
 const candidates=coverage(state.teams[side],point);
 return candidates.sort((a,b)=>b.influence-a.influence||a.distance-b.distance||a.id.localeCompare(b.id))[0]?.id;
}
