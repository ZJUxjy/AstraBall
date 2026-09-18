import {getDivision,leagueSystems,championshipName} from './catalog.js';
import {clubProfile} from './club-profiles.js';

export const PLAYER_STAT_KEYS=['minutes','goals','assists','shots','onTarget','xG','xA','passes','completed','tackles','interceptions','dribbles','dribblesWon','saves','goalsAgainst','yellow','red'];
export const MVP_RULE='赛事贡献分：进球×4＋助攻×3＋成功传球×0.015＋抢断×0.20＋拦截×0.25＋扑救×0.40＋出场分钟/90×0.5＋后场零封贡献－黄牌×0.3－红牌×2－门将失球×0.5；至少出场90分钟或该赛事最多出场分钟的25%（取较大值）。同分依次比较助攻、进球、分钟、球员ID。';
export function competitionName(id,fallback=id){
 return getDivision(id)?.name||leagueSystems.find(s=>s.cup?.id===id)?.cup.name||(championshipName(id)===id?fallback:championshipName(id));
}
export function contribution(p){return (p.goals||0)*4+(p.assists||0)*3+(p.completed||0)*.015+(p.tackles||0)*.2+(p.interceptions||0)*.25+(p.saves||0)*.4+(p.minutes||0)/90*.5+(p.cleanSheetCredit||0)-(p.yellow||0)*.3-(p.red||0)*2-(p.position==='GK'?(p.goalsAgainst||0)*.5:0);}
const rankPlayers=(a,b)=>b.contribution-a.contribution||b.assists-a.assists||b.goals-a.goals||b.minutes-a.minutes||a.id.localeCompare(b.id);
const blank=()=>({played:0,won:0,drawn:0,lost:0,gf:0,ga:0,shootoutWon:0,shootoutLost:0});
export function addMatch(row,score,side,shootout){const gf=score[side],ga=score[1-side];row.played++;row.gf+=gf;row.ga+=ga;row[gf>ga?'won':gf<ga?'lost':'drawn']++;if(shootout){row[shootout.winner===side?'shootoutWon':'shootoutLost']++;}return row;}
export function competitionStats(s,competition){
 const matches=s.fixtures.filter(m=>m.competition===competition&&m.score&&!m.bye),players=new Map(),teams=new Map();
 for(const m of matches)for(const [side,club] of [m.home,m.away].entries()){
  if(!teams.has(club))teams.set(club,{id:club,...blank()});addMatch(teams.get(club),m.score,side,m.shootout);
  for(const line of m.report?.players?.[side]||[]){
   let p=players.get(line.id);if(!p){p={id:line.id,name:line.name||line.id,position:line.position||null,clubs:[],appearances:0,cleanSheetCredit:0,...Object.fromEntries(PLAYER_STAT_KEYS.map(k=>[k,0]))};players.set(line.id,p);}
   if(!p.clubs.includes(club))p.clubs.push(club);p.appearances++;
   for(const key of PLAYER_STAT_KEYS)p[key]+=line[key]||0;
   if(m.score[1-side]===0&&['GK','CB','LB','RB','DM'].includes(p.position))p.cleanSheetCredit+=Math.min(1,line.minutes/90);
  }
 }
 const rows=[...players.values()].map(p=>({...p,contribution:Math.round(contribution(p)*1000)/1000}));
 const minimum=Math.max(90,Math.max(0,...rows.map(p=>p.minutes))*.25),mvp=rows.filter(p=>p.minutes>=minimum).sort(rankPlayers)[0]||null;
 const boards=Object.fromEntries(['goals','assists','saves','contribution','minutes'].map(key=>[key,[...rows].sort((a,b)=>b[key]-a[key]||a.id.localeCompare(b.id)).slice(0,10)]));
 return {competition,name:competitionName(competition),matches:matches.length,goals:matches.reduce((n,m)=>n+m.score[0]+m.score[1],0),shootouts:matches.filter(m=>m.shootout).length,teams:[...teams.values()],players:rows,mvp,leaderboards:boards,completeStats:matches.every(m=>m.report?.historyVersion===2)};
}
export function seasonRecord(s){
 if(!s.summary)throw Error('赛季尚未结算');
 const competitions=s.summary.champions.map(champion=>{const data=competitionStats(s,champion.competition);delete data.players;return {...data,champion:champion.id,kind:'title',table:s.summary.tables[champion.competition]||null};});
 const clubs=Object.entries(s.members).flatMap(([division,ids])=>ids.map(id=>({id,division,royal:clubProfile(id).royal,rank:s.summary.tables[division].find(r=>r.id===id).rank,...blank()})));
 const index=new Map(clubs.map(c=>[c.id,c]));
 const matches=s.fixtures.filter(m=>m.score&&!m.bye).map(m=>{addMatch(index.get(m.home),m.score,0,m.shootout);addMatch(index.get(m.away),m.score,1,m.shootout);return {id:m.id,date:m.date,competition:m.competition,kind:m.kind,home:m.home,away:m.away,score:[...m.score],shootout:m.shootout?{...m.shootout}:null,winner:m.winner||null};});
 return {year:s.year,ruleset:s.ruleset,expectedMatches:s.fixtures.filter(m=>!m.bye).length,matches,competitions,clubs,movements:s.summary.movements};
}
export function archiveSeasonHistory(s){
 const history=s.history??={version:1,since:s.year,seasons:[]};
 if(!history.seasons.some(r=>r.year===s.year))history.seasons.push(seasonRecord(s));
 return history;
}
export function historyRecords(s,{current=true}={}){const records=[...(s.history?.seasons||[])];if(current&&s.summary&&!records.some(r=>r.year===s.year))records.push(seasonRecord(s));return records;}
export function historicalResults(records,{club,opponent,competition='all',topFlight=false}={}){
 const total=blank(),matches=[];
 for(const season of records)for(const m of season.matches){
  if(m.home!==club&&m.away!==club)continue;const side=m.home===club?0:1,other=side?m.home:m.away;
  if(opponent&&other!==opponent||competition!=='all'&&m.competition!==competition||topFlight&&!(m.kind==='league'&&getDivision(m.competition)?.tier===1))continue;
  addMatch(total,m.score,side,m.shootout);matches.push({...m,year:season.year,side,opponent:other});
 }
 return {...total,matches};
}
export function championRanking(records,competition='all'){
 const counts=new Map();for(const s of records)for(const c of s.competitions){if(c.kind==='promotion'||competition!=='all'&&c.competition!==competition)continue;const row=counts.get(c.champion)||{id:c.champion,titles:0,years:[]};row.titles++;row.years.push({year:s.year,competition:c.competition});counts.set(row.id,row);}
 return [...counts.values()].sort((a,b)=>b.titles-a.titles||a.id.localeCompare(b.id));
}
export function validateHistory(s){
 if(!s.history)return;const h=s.history;if(h.version!==1||!Array.isArray(h.seasons)||new Set(h.seasons.map(r=>r.year)).size!==h.seasons.length)throw Error('历史档案无效');
 for(const r of h.seasons){if(!Number.isInteger(r.year)||r.year>s.year||!Array.isArray(r.matches)||new Set(r.matches.map(m=>m.id)).size!==r.matches.length||!Array.isArray(r.competitions)||r.matches.some(m=>!Array.isArray(m.score)||m.score.length!==2||m.score.some(n=>!Number.isInteger(n)||n<0)))throw Error('历史赛季无效');}
}
