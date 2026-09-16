import {ATTRIBUTE_KEYS,POSITIONS} from './players.js';
const finite=(value,min=0,max=Infinity)=>Number.isFinite(value)&&value>=min&&value<=max;
export function validateMatchSnapshot(saved){
 const fail=()=>{throw Error('比赛存档无效或已损坏');};
 if(!saved||!Number.isInteger(saved.version)||!Number.isSafeInteger(saved.randomState)||!Array.isArray(saved.teams)||saved.teams.length!==2||![0,1].includes(saved.side)||![1,2,3,4].includes(saved.period)||!finite(saved.elapsed)||!finite(saved.periodClock,0,4000)||!finite(saved.periodEnd,0,4000)||!finite(saved.x,0,105)||!finite(saved.y,0,68)||!['playing','finished','abandoned'].includes(saved.status)||!Array.isArray(saved.events)||!Array.isArray(saved.plans))fail();
 const allIds=new Set();
 for(const t of saved.teams){
  if(!t?.id||!Array.isArray(t.roster)||!Array.isArray(t.slots)||!Array.isArray(t.used)||!t.lines||!t.stats||!finite(t.subs,0,5)||!finite(t.windows,0,3))fail();
  const ids=new Set();for(const p of t.roster){if(!p.id||allIds.has(p.id)||!p.attributes||!ATTRIBUTE_KEYS.every(k=>finite(p.attributes[k],1,99))||!p.personality||!['consistency','bigMatches','adaptability','injuryProneness'].every(k=>finite(p.personality[k],0,100)))fail();ids.add(p.id);allIds.add(p.id);}
  if(t.slots.length>11||t.slots.length<6||new Set(t.slots.map(slot=>slot.id)).size!==t.slots.length||t.slots.some(slot=>!ids.has(slot.id)||!t.used.includes(slot.id)||!POSITIONS[slot.position])||t.slots.filter(slot=>slot.position==='GK').length!==1)fail();
  if(!['goals','shots','onTarget','passes','completed','fouls','yellow','red','playerSeconds'].every(k=>finite(t.stats[k]))||!Object.values(t.stats).every(v=>finite(v))||!Number.isInteger(t.stats.goals)||t.stats.goals>t.stats.onTarget||t.stats.onTarget>t.stats.shots||t.stats.completed>t.stats.passes)fail();
  for(const p of t.roster){const line=t.lines[p.id];if(!line||!finite(line.seconds,0,saved.elapsed+.000001)||!finite(line.condition,0,100))fail();if(line.position&&(!Array.isArray(line.position)||line.position.length!==2||!finite(line.position[0],0,105)||!finite(line.position[1],0,68)))fail();}
  if(t.coach&&(!finite(t.coach.nextReview)||!Array.isArray(t.coach.subReviews)))fail();
 }
 if(saved.teams[0].id===saved.teams[1].id)fail();
 if(saved.holder&&!saved.teams[saved.side].slots.some(slot=>slot.id===saved.holder))fail();
 return saved;
}
