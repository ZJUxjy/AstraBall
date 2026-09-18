import {knownTeam} from './team-directory.js';
import {footballTeams} from '../football/data.js';
import {standings} from './season.js';
import {METRO_SYSTEMS} from './catalog.js';

const teams=new Set(footballTeams.map(t=>t.id));
const finished=m=>m.score!==null||m.bye;
export function tableFor(s,division){
 if(division==='metro-champions'){
  const qualifiers=METRO_SYSTEMS.flatMap(id=>tableFor(s,id).slice(0,4)),ids=qualifiers.map(r=>r.id);
  return standings(ids,s.fixtures.filter(m=>m.competition===division&&m.kind==='championship-group'&&m.score),{seed:`${s.year}:${division}`,priorRanks:Object.fromEntries(qualifiers.map(r=>[r.id,r.rank]))});
 }
 return standings(s.members[division],s.fixtures.filter(m=>m.competition===division),{seed:`${s.year}:${division}`});
}
export function groupTable(s,group){const g=s.groups.find(g=>g.id===group);return standings(g.teams.map(t=>t.id),s.fixtures.filter(m=>m.group===group),{seed:`${s.year}:group:${group}`});}
export function resolveParticipant(s,id,context){
 if(!id)return null;
 if(id.startsWith('winner:'))return (context?.fixturesById?context.fixturesById.get(id.slice(7)):s.fixtures.find(m=>m.id===id.slice(7)))?.winner||null;
 if(id.startsWith('rank:')){const [,division,rank]=id.split(':');if(s.fixtures.some(m=>m.competition===division&&(division!=='metro-champions'||m.kind==='championship-group')&&!finished(m)))return null;return tableFor(s,division)[Number(rank)-1]?.id;}
 if(id.startsWith('group:')){const [,g,rank]=id.split(':');if(s.fixtures.some(m=>m.group===g&&!finished(m)))return null;return groupTable(s,g)[Number(rank)-1]?.id;}
 return knownTeam(id)?id:null;
}
export function fixtureSides(s,m){let home=resolveParticipant(s,m.home),away=resolveParticipant(s,m.away);if(m.kind==='playoff'&&home&&away&&!m.neutral){const order=tableFor(s,m.division).map(r=>r.id);if(order.indexOf(home)>order.indexOf(away))[home,away]=[away,home];}return {home,away};}
