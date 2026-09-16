import {clamp} from './random.js';
export const periodBase=period=>[0,45,90,105][period-1];
export function penaltyShootout(teams,random){
 const count=Math.min(...teams.map(t=>t.slots.length)),order=teams.map(t=>{
  const pool=t.slots.map(s=>t.roster.find(p=>p.id===s.id));const gk=pool.find(p=>t.slots.find(s=>s.id===p.id).position==='GK');
  return [...pool.filter(p=>p!==gk).sort((a,b)=>b.attributes.penalties-a.attributes.penalties).slice(0,count-1),gk];});
 const score=[0,0],kicks=[];let round=0;
 while(round<1000){for(let side=0;side<2;side++){
   const p=order[side][round%count],other=teams[1-side],gk=other.roster.find(p=>p.id===other.slots.find(s=>s.position==='GK').id);
   const probability=clamp(.76+(p.attributes.penalties+p.attributes.composure-gk.attributes.reflexes-gk.attributes.oneOnOnes)*.0015,.45,.95);
   const goal=random.next()<probability;score[side]+=Number(goal);kicks.push({side,player:p.id,keeper:gk.id,goal,round:round+1});
   if(round<5){const homeLeft=5-round-1,awayLeft=5-round-(side===1?1:0);if(score[0]>score[1]+awayLeft||score[1]>score[0]+homeLeft)return {score,kicks,winner:score[0]>score[1]?0:1};}
  }round++;if(round>=5&&score[0]!==score[1])return {score,kicks,winner:score[0]>score[1]?0:1};}
 throw Error('点球大战异常超长，保留平局而不伪造获胜方');
}
