import {FORMATIONS,available,preciseRating} from './players.js';
import {clamp} from './random.js';

// Selection uses observable position familiarity, not hidden adaptability or PA.
export function roleFit(player,position){
 if(player.position===position)return 1;
 if(player.position==='GK'||position==='GK')return .05;
 if(player.secondary?.includes(position))return .95;
 return [['CB','LB','RB','DM'],['DM','CM','AM'],['LW','RW','AM','ST']].some(group=>group.includes(player.position)&&group.includes(position))?.83:.64;
}
export function aiRoleScore(player,position,{condition=player.condition??100,recentMinutes=0,rotation=false}={}){
 const quality=preciseRating(player,position)*roleFit(player,position);
 const rest=rotation?Math.min(5,Math.max(0,recentMinutes-90)/90*2.5)*(position==='GK'?.2:1):0;
 return quality*(.7+.3*clamp(condition/100))-rest;
}
function minutesFor(player,date,records){
 if(!date)return player.recentMinutes||0;
 const now=Date.parse(`${date}T12:00:00Z`);
 return (records?.[player.id]?.recentExposure||[]).reduce((total,row)=>{
  const gap=(now-Date.parse(`${row.date}T12:00:00Z`))/86400000;return total+(gap>=0&&gap<7?row.minutes:0);
 },0);
}
// Rectangular Hungarian assignment: each of the eleven roles gets one player.
// Stable roster ordering makes exact-score ties reproducible without randomness.
function assign(scores){
 const n=scores.length,m=scores[0].length,u=Array(n+1).fill(0),v=Array(m+1).fill(0),p=Array(m+1).fill(0),way=Array(m+1).fill(0);
 for(let i=1;i<=n;i++){
  p[0]=i;let j0=0;const min=Array(m+1).fill(Infinity),used=Array(m+1).fill(false);
  do{
   used[j0]=true;const i0=p[j0];let delta=Infinity,j1=0;
   for(let j=1;j<=m;j++)if(!used[j]){
    const current=-scores[i0-1][j-1]-u[i0]-v[j];if(current<min[j]){min[j]=current;way[j]=j0;}
    if(min[j]<delta){delta=min[j];j1=j;}
   }
   for(let j=0;j<=m;j++)if(used[j]){u[p[j]]+=delta;v[j]-=delta;}else min[j]-=delta;
   j0=j1;
  }while(p[j0]!==0);
  do{const j1=way[j0];p[j0]=p[j1];j0=j1;}while(j0!==0);
 }
 const result=Array(n);for(let j=1;j<=m;j++)if(p[j])result[p[j]-1]=j-1;return result;
}
export function planAITeam(team,{date,records={},rotation=true,formation,healthy=false}={}){
 if(formation&&!FORMATIONS[formation])throw Error('未知阵型');
 const all=team.roster.map(p=>healthy?{...p,condition:100,injuryDays:0,suspended:0,playedToday:false}:p).sort((a,b)=>a.id.localeCompare(b.id));
 const candidates=all.filter(available);if(candidates.length<11)throw Error('健康球员不足 11 人');
 const roles=[...new Set(Object.values(FORMATIONS).flat())];
 const scores=new Map(all.map(p=>[p.id,Object.fromEntries(roles.map(role=>[role,aiRoleScore(p,role,{recentMinutes:minutesFor(p,date,records),rotation})]))]));
 let best;
 for(const name of formation?[formation]:Object.keys(FORMATIONS)){
  const slots=FORMATIONS[name],matrix=slots.map(role=>candidates.map(p=>scores.get(p.id)[role])),assignment=assign(matrix),score=assignment.reduce((sum,index,i)=>sum+matrix[i][index],0);
  if(!best||score>best.score+1e-9)best={formation:name,score,lineup:assignment.map((index,i)=>({id:candidates[index].id,position:slots[i]}))};
 }
 const selected=new Map(best.lineup.map(slot=>[slot.id,slot])),opportunities={};
 for(const player of all){
  const starter=selected.has(player.id);let opportunity;
  for(const position of new Set(FORMATIONS[best.formation])){
   const occupants=best.lineup.filter(slot=>slot.position===position),roleScore=scores.get(player.id)[position],starterScore=Math.min(...occupants.map(slot=>scores.get(slot.id)[position])),gap=roleScore-starterScore;
   const rank=candidates.filter(other=>scores.get(other.id)[position]>roleScore+1e-9||Math.abs(scores.get(other.id)[position]-roleScore)<1e-9&&other.id.localeCompare(player.id)<0).length+1;
   const direct=selected.get(player.id)?.position===position;
   const minutes=direct?(position==='GK'?90:75):position==='GK'?(player.position==='GK'&&rank===2&&gap>=-12?5:0):clamp(22+gap*1.5-Math.max(0,rank-occupants.length-1)*5,0,30);
   const row={position,roleScore,starterScore,gap,rank,starter,expectedMinutes:available(player)?minutes:0};
   if(direct){opportunity=row;break;}
   if(!opportunity||row.expectedMinutes>opportunity.expectedMinutes||row.expectedMinutes===opportunity.expectedMinutes&&gap>opportunity.gap)opportunity=row;
  }
  opportunities[player.id]=opportunity;
 }
 // Reserve at most the minutes released by ten 75-minute outfield starters.
 // A crowded bench must share those opportunities rather than multiply them.
 const bench=Object.values(opportunities).filter(row=>!row.starter),benchMinutes=bench.reduce((sum,row)=>sum+row.expectedMinutes,0);
 if(benchMinutes>150)for(const row of bench)row.expectedMinutes*=150/benchMinutes;
 return {...best,opportunities};
}
export function evaluateOpportunity(team,player,options={}){
 const roster=[...team.roster.filter(p=>p.id!==player.id),player];
 const plan=planAITeam({...team,roster},{healthy:true,rotation:false,...options});
 return {...plan.opportunities[player.id],formation:plan.formation};
}

// Only fresh, position-compatible substitutes close to the incumbent's level.
// Fixed review times and score-based choices consume no match random numbers.
export function selectAISubstitutions(team,{minute,maxChanges=2,scoreDifference=0}={}){
 if(minute<55||team.subs>=5||team.windows>=3)return [];
 const used=new Set(team.used),outgoing=new Set(),result=[];
 const limit=Math.min(maxChanges,5-team.subs);
 for(let i=0;i<limit;i++){
  let best;
  for(const slot of team.slots){
   if(slot.position==='GK'||outgoing.has(slot.id))continue;
   const incumbent=team.roster.find(p=>p.id===slot.id),current=aiRoleScore(incumbent,slot.position,{condition:team.lines[slot.id].condition}),base=aiRoleScore(incumbent,slot.position,{condition:100});
   for(const candidate of team.roster){
    if(used.has(candidate.id)||!available(candidate)||candidate.position==='GK'||roleFit(candidate,slot.position)<.8)continue;
    const incoming=aiRoleScore(candidate,slot.position,{condition:team.lines[candidate.id].condition}),gap=aiRoleScore(candidate,slot.position,{condition:100})-base,gain=incoming-current;
    if(gap < -12||gain<(minute>=80&&scoreDifference>=2?-.5:.75))continue;
    const priority=gain+(team.lines[slot.id].yellow?1:0),key=`${slot.id}/${candidate.id}`;
    if(!best||priority>best.priority+1e-9||Math.abs(priority-best.priority)<1e-9&&key<best.key)best={out:slot.id,in:candidate.id,priority,key};
   }
  }
  if(!best)break;used.add(best.in);outgoing.add(best.out);result.push({out:best.out,in:best.in});
 }
 return result;
}
