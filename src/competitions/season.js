import {rng} from '../football/random.js';
import {leagueSystems,GLOBAL_CUP,METRO_SYSTEMS} from './catalog.js';
const unique=ids=>{if(!Array.isArray(ids)||ids.length<2||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!id))throw Error('参赛队身份无效');};
export function roundRobin(ids,{legs=2,seed='318',prefix='league'}={}){
 unique(ids);if(![1,2].includes(legs))throw Error('仅支持单、双循环');
 const random=rng(seed),ring=[...ids];for(let i=ring.length-1;i>0;i--){const j=random.int(0,i);[ring[i],ring[j]]=[ring[j],ring[i]];}
 if(ring.length%2)ring.push(null);const first=[];
 for(let r=0;r<ring.length-1;r++){
  for(let i=0;i<ring.length/2;i++){let [home,away]=[ring[i],ring[ring.length-1-i]];if((r+i)%2)[home,away]=[away,home];if(home&&away)first.push({id:`${prefix}-r${r+1}-${i}`,round:r+1,home,away,score:null});}
  ring.splice(1,0,ring.pop());
 }
 return legs===1?first:[...first,...first.map(m=>({...m,id:`${m.id}-return`,round:m.round+ring.length-1,home:m.away,away:m.home}))];
}
export function standings(ids,fixtures,{seed='318',priorRanks={}}={}){
 unique(ids);const draw=roundRobin(ids,{legs:1,seed}).flatMap(m=>[m.home,m.away]);const lots=[...new Set(draw)],table=new Map(ids.map(id=>[id,{id,played:0,won:0,drawn:0,lost:0,gf:0,ga:0,gd:0,points:0,fairPlay:0,lot:lots.indexOf(id)}]));
 const done=[],seen=new Set();
 for(const m of fixtures){if(m.score==null)continue;if(seen.has(m.id))throw Error('重复比赛');seen.add(m.id);const [h,a]=[table.get(m.home),table.get(m.away)];if(!h||!a||h===a||m.score.length!==2||!m.score.every(n=>Number.isInteger(n)&&n>=0))throw Error('比赛结果无效');
  const [x,y]=m.score;h.played++;a.played++;h.gf+=x;h.ga+=y;a.gf+=y;a.ga+=x;
  if(x===y){h.drawn++;a.drawn++;h.points++;a.points++;}else{const win=x>y?h:a,lose=x>y?a:h;win.won++;lose.lost++;win.points+=3;}
  const cards=m.fairPlay||[0,0];if(cards.length!==2||!cards.every(n=>Number.isFinite(n)&&n>=0))throw Error('公平竞赛分无效');h.fairPlay+=cards[0];a.fairPlay+=cards[1];done.push(m);
 }
 const rows=[...table.values()];rows.forEach(r=>r.gd=r.gf-r.ga);
 // Mini-league uses the full group tied on points, goal difference and goals scored.
 for(const r of rows){const tied=new Set(rows.filter(t=>t.points===r.points&&t.gd===r.gd&&t.gf===r.gf).map(t=>t.id));r.h2hPoints=0;r.h2hGD=0;
  for(const m of done.filter(m=>tied.has(m.home)&&tied.has(m.away))){if(m.home!==r.id&&m.away!==r.id)continue;const [x,y]=m.home===r.id?m.score:[m.score[1],m.score[0]];r.h2hPoints+=x>y?3:x===y?1:0;r.h2hGD+=x-y;}}
 return rows.sort((a,b)=>b.points-a.points||b.gd-a.gd||b.gf-a.gf||b.h2hPoints-a.h2hPoints||b.h2hGD-a.h2hGD||a.fairPlay-b.fairPlay||(priorRanks[a.id]??0)-(priorRanks[b.id]??0)||a.lot-b.lot).map((r,i)=>({...r,rank:i+1}));
}
export function knockoutBracket(ids,{seed='318',prefix='cup',shuffle=true}={}){
 unique(ids);let order=[...ids];if(shuffle){const r=rng(seed);for(let i=order.length-1;i>0;i--){const j=r.int(0,i);[order[i],order[j]]=[order[j],order[i]];}}
 const size=2**Math.ceil(Math.log2(order.length));let seeds=[1,2];while(seeds.length<size){const sum=seeds.length*2+1;seeds=seeds.flatMap(n=>[n,sum-n]);}
 let slots=seeds.map(n=>order[n-1]||null),round=1,result=[];
 while(slots.length>1){const next=[];for(let i=0;i<slots.length;i+=2){const id=`${prefix}-r${round}-${i/2+1}`,home=slots[i],away=slots[i+1],bye=!home||!away;result.push({id,round,home,away,bye,winner:bye?(home||away):null});next.push(bye?(home||away):`winner:${id}`);}slots=next;round++;}
 return result;
}
export function promotedTeams(table,{playoffWinner,automatic=2,playoff}={}){
 const ranks=playoff?.length?playoff:[3,4,5,6],auto=automatic??ranks[0]-1;
 if(table.length<ranks.at(-1)||new Set(table.map(r=>r.id)).size!==table.length)throw Error('排名表无效');
 const eligible=ranks.map(n=>table[n-1]?.id);if(!eligible.includes(playoffWinner))throw Error('附加赛冠军须来自附加赛资格名次');
 return [...table.slice(0,auto).map(r=>r.id),playoffWinner];
}
export function friendlyFixtures(year,members,dates){
 const ids=Object.values(members).flat(),result=[];
 for(const date of dates){
  const order=[...ids],random=rng(`friendly:${year}:${date}`);
  for(let i=order.length-1;i>0;i--){const j=random.int(0,i);[order[i],order[j]]=[order[j],order[i]];}
  for(let i=0;i+1<order.length;i+=2)result.push({id:`${year}:friendly:${date}:${i/2}`,round:1,home:order[i],away:order[i+1],date});
 }
 return result;
}
export function moveDivisions(levels,tables,playoffWinners){
 if(levels.length!==tables.length)throw Error('缺少级别排名');for(let i=0;i<levels.length;i++){if(tables[i].length!==levels[i].teams||new Set(tables[i].map(r=>r.id)).size!==levels[i].teams)throw Error('排名人数无效');}
 const next=tables.map(t=>t.map(r=>r.id));if(new Set(next.flat()).size!==next.flat().length)throw Error('球队跨级重复');
 for(let i=0;i<levels.length-1;i++){const policy=levels[i+1].promotion,up=policy.playoff?.length?promotedTeams(tables[i+1],{playoffWinner:playoffWinners[i+1],automatic:policy.automatic,playoff:policy.playoff}):tables[i+1].slice(0,policy.automatic).map(r=>r.id),down=tables[i].slice(-levels[i].relegation).map(r=>r.id);if(up.length!==down.length)throw Error('升降级名额不平衡');next[i]=next[i].filter(id=>!down.includes(id)).concat(up);next[i+1]=next[i+1].filter(id=>!up.includes(id)).concat(down);}
 return next;
}
export function globalQualifiers(rankings){return leagueSystems.filter(s=>s.globalSlots>0).flatMap(s=>{const list=rankings[s.id];if(!list||list.length<s.globalSlots)throw Error(`缺少 ${s.name} 排名`);return list.slice(0,s.globalSlots).map((row,i)=>({id:row.id,system:s.id,rank:i+1}));});}
export function globalGroups(qualifiers){
 if(qualifiers.length!==GLOBAL_CUP.teams||new Set(qualifiers.map(q=>q.id)).size!==qualifiers.length)throw Error(`全球冠军杯须有 ${GLOBAL_CUP.teams} 支不同球队`);
 const sorted=[...qualifiers].sort((a,b)=>a.rank-b.rank||a.system.localeCompare(b.system)),groups=Array.from({length:GLOBAL_CUP.groups},()=>[]);
 function place(index){if(index===GLOBAL_CUP.teams)return true;const q=sorted[index],pot=Math.floor(index/GLOBAL_CUP.groups);for(let offset=0;offset<GLOBAL_CUP.groups;offset++){const g=groups[(index+offset)%GLOBAL_CUP.groups];if(g.length!==pot||g.filter(t=>t.system===q.system).length>=2)continue;g.push(q);if(place(index+1))return true;g.pop();}return false;}
 if(!place(0))throw Error('资格配置无法完成分组');return groups.map((teams,i)=>({id:String.fromCharCode(65+i),teams}));
}
export function draftOrder(reverseStandings){
 unique(reverseStandings);const rule=leagueSystems[0].draft;
 if(reverseStandings.length!==rule.teams)throw Error(`选秀须有 ${rule.teams} 队`);
 return Array.from({length:rule.rounds},(_,round)=>reverseStandings.map((club,i)=>({round:round+1,overall:round*rule.teams+i+1,club}))).flat();
}
// Eight edge-disjoint perfect matchings of K(4,4,4): one game per club
// per round, all eight opponents outside its own league, four home games.
export function metroChampionshipFixtures({prefix='metro'}={}){
 const rounds=[[[0, 4], [8, 1], [2, 5], [9, 3], [10, 6], [7, 11]], [[0, 5], [8, 2], [1, 6], [4, 9], [11, 3], [7, 10]], [[6, 0], [3, 8], [7, 1], [2, 9], [4, 10], [11, 5]], [[7, 0], [4, 8], [6, 2], [1, 11], [5, 9], [10, 3]], [[0, 8], [5, 1], [10, 2], [3, 4], [6, 11], [9, 7]], [[0, 9], [1, 4], [5, 10], [2, 11], [8, 6], [3, 7]], [[10, 0], [9, 1], [6, 3], [5, 8], [11, 4], [2, 7]], [[11, 0], [1, 10], [4, 2], [3, 5], [8, 7], [9, 6]]];
 const result=rounds.flatMap((pairs,r)=>pairs.map(([h,a],i)=>({id:`${prefix}-r${r+1}-${i}`,round:r+1,home:`rank:${METRO_SYSTEMS[Math.floor(h/4)]}:${h%4+1}`,away:`rank:${METRO_SYSTEMS[Math.floor(a/4)]}:${a%4+1}`,score:null})));
 return result;
}

// Runs a complete bracket through an injected match engine; never invents a tie winner.
export function playKnockout(ids,{simulate,seed='318',prefix='cup',shuffle=true,higherSeedHome=false}={}){
 if(typeof simulate!=='function')throw Error('须提供比赛引擎');const bracket=knockoutBracket(ids,{seed,prefix,shuffle}),winners=new Map(),matches=[];
 const resolve=id=>id?.startsWith('winner:')?winners.get(id.slice(7)):id,finalRound=bracket.at(-1).round;
 for(const m of bracket){let home=resolve(m.home),away=resolve(m.away);if(m.bye){winners.set(m.id,home||away);matches.push({...m,home,away,winner:home||away});continue;}
  if(!home||!away)throw Error('前轮胜者缺失');if(higherSeedHome&&ids.indexOf(home)>ids.indexOf(away))[home,away]=[away,home];
  const result=simulate({home,away,seed:`${seed}:${m.id}`,knockout:true,neutral:m.round===finalRound});
  if(result.status!=='finished'||!Array.isArray(result.score)||result.score.length!==2||!result.score.every(n=>Number.isInteger(n)&&n>=0))throw Error('淘汰赛结果无效，需赛事裁决');
  const [h,a]=result.score;let side=h>a?0:a>h?1:result.shootout?.winner;if(side!==0&&side!==1)throw Error('淘汰赛平局未决胜');
  const winner=side===0?home:away;winners.set(m.id,winner);matches.push({...m,home,away,winner,score:result.score,shootout:result.shootout||null,neutral:m.round===finalRound});
 }
 return {champion:winners.get(bracket.at(-1).id),matches};
}
