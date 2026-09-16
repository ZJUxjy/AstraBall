import {roleFamiliarity} from './roles.js';
import {clamp} from './random.js';
import {distance,localPressure,laneRisk} from './spatial.js';

export function offsideLine(state,side){
 const defenders=state.teams[1-side].slots.map(slot=>105-state.teams[1-side].lines[slot.id].position[0]).sort((a,b)=>b-a);
 return defenders[1]??105;
}
export function passOptions(state,actor,{forward=false,back=false,crossing=false,through=false}={}){
 const side=state.side,team=state.teams[side],from=[state.x,state.y],line=offsideLine(state,side);
 return team.slots.filter(slot=>slot.id!==actor.id).map(slot=>{
  const p=team.roster.find(p=>p.id===slot.id),start=team.lines[p.id].position;
  const fam=roleFamiliarity(p,slot.position);
  const runner=['ST','LW','RW','AM'].includes(slot.position);
  const run=forward&&runner&&start[0]>50?clamp((p.attributes.offBall*fam.attack+p.attributes.pace)/13,3,14)*(through?1:.35):0;
  const target=[clamp(start[0]+run,4,98),start[1]],length=distance(from,target),progress=target[0]-from[0];
  const offside=start[0]>Math.max(52.5,from[0],line)+1;
  const openness=1-localPressure(state,side,target);
  // Short play prefers nearby support; direct play accepts long, forward routes.
  const range=team.tactics.passing==='short'?16:team.tactics.passing==='direct'?36:25;
  let weight=Math.exp(-length/range)*(.35+openness)*(.65+p.attributes.offBall*fam.attack/140);
  weight*=forward?Math.exp(clamp(progress/22,-2,1.4)):back?Math.exp(clamp(-progress/18,-2,1.2)):Math.exp(-Math.abs(progress)/28);
  if(crossing)weight*=Math.exp(-Math.abs(target[1]-34)/12)*Math.exp(clamp((target[0]-75)/15,-3,1));
  if(team.tactics.focus==='left')weight*=target[1]<28?1.6:target[1]>40?.65:1;
  if(team.tactics.focus==='right')weight*=target[1]>40?1.6:target[1]<28?.65:1;
  if(slot.position==='GK')weight*=back?.8:.08;
  if(offside)weight*=.06;
  return {player:p,start:[...start],target,length,progress,openness,offside,weight};
 });
}
export function selectPass(state,actor,intent){
 const options=passOptions(state,actor,intent);
 const option=state.random.pick(options,p=>p.weight);
 return {...option,laneRisk:laneRisk(state,state.side,[state.x,state.y],option.target)};
}
export function routeModifier(option){
 return clamp((option.openness-.5)*.035-(option.laneRisk-.65)*.065-Math.max(0,option.length-22)*.0013,-.12,.04);
}
