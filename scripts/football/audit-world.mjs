import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {leagues,clubs} from '../../src/world.js';
import {footballTeams} from '../../src/football/data.js';
import {roundRobin,standings,playKnockout,globalQualifiers,globalGroups,moveDivisions} from '../../src/competitions/season.js';
import {simulateMatch} from '../../src/football/engine.js';
const teams=new Map(footballTeams.map(t=>[t.id,t])),report={seed:318,divisions:[],cups:[],playoffs:[],matches:0,players:footballTeams.reduce((s,t)=>s+t.roster.length,0),cultures:{}};
for(const t of footballTeams)for(const p of t.roster)report.cultures[p.culture||'authored']=(report.cultures[p.culture||'authored']||0)+1;
const run=({home,away,...options})=>{const r=simulateMatch({...options,home:teams.get(home),away:teams.get(away),capture:false});assert.equal(r.status,'finished');report.matches++;for(const t of r.teams)assert.equal(t.players.reduce((s,p)=>s+p.goals,0),t.stats.goals);return r;};
const tables={},winners={};
for(const l of leagues){for(const d of l.levels){
 const ids=clubs.filter(c=>c.division===d.id).map(c=>c.id),fixtures=roundRobin(ids,{seed:`318:${d.id}`,prefix:d.id});
 for(const f of fixtures){const r=run({home:f.home,away:f.away,seed:`season:318:${f.id}`});f.score=r.score;f.fairPlay=r.teams.map(t=>t.stats.yellow+t.stats.red*3);}
 const table=standings(ids,fixtures,{seed:`318:${d.id}`});tables[d.id]=table;assert.ok(table.every(r=>r.played===d.rounds));assert.equal(table.reduce((s,r)=>s+r.gf,0),table.reduce((s,r)=>s+r.ga,0));report.divisions.push({id:d.id,teams:ids.length,rounds:d.rounds,matches:fixtures.length,goals:table.reduce((s,r)=>s+r.gf,0),first:table[0].id});
 if(d.promotion||l.id==='closed'){const participants=d.promotion?table.slice(2,6):table.slice(0,8),result=playKnockout(participants.map(r=>r.id),{seed:`318:${d.id}:playoffs`,shuffle:false,higherSeedHome:true,simulate:run});winners[d.id]=result.champion;report.playoffs.push({id:d.id,champion:result.champion,matches:result.matches.length});}
 console.log(d.id,fixtures.length,'passed');
 }
 if(l.cup){const ids=clubs.filter(c=>c.league===l.id).map(c=>c.id),result=playKnockout(ids,{seed:`318:${l.cup.id}`,simulate:run});assert.equal(result.matches.filter(m=>!m.bye).length,ids.length-1);report.cups.push({id:l.cup.id,champion:result.champion,matches:ids.length-1});}
 if(l.levels.length>1){const updated=moveDivisions(l.levels,l.levels.map(d=>tables[d.id]),Object.fromEntries(l.levels.map((d,i)=>[i,winners[d.id]])));assert.equal(new Set(updated.flat()).size,updated.flat().length);}
}
const qualifiers=globalQualifiers(Object.fromEntries(leagues.map(l=>[l.id,tables[l.id]]))),groups=globalGroups(qualifiers),groupTables=[];
for(const group of groups){const ids=group.teams.map(t=>t.id),fixtures=roundRobin(ids,{legs:1,prefix:`global-${group.id}`,seed:318});for(const f of fixtures)f.score=run({home:f.home,away:f.away,seed:`global:318:${f.id}`,neutral:true}).score;groupTables.push(standings(ids,fixtures).slice(0,2));}
// A1-B2, C1-D2, E1-F2, G1-H2 / B1-A2, D1-C2, F1-E2, H1-G2.
const pairs=[[0,1],[2,3],[4,5],[6,7],[1,0],[3,2],[5,4],[7,6]],participants=pairs.flatMap(([a,b])=>[groupTables[a][0].id,groupTables[b][1].id]);
// Seed order converts the fixed round-of-16 pair list into the generic bracket layout.
const seeds=[1,16,8,9,4,13,5,12,2,15,7,10,3,14,6,11],ordered=Array(16);seeds.forEach((seed,i)=>ordered[seed-1]=participants[i]);
const global=playKnockout(ordered,{shuffle:false,seed:'318:global',simulate:o=>run({...o,neutral:true})});report.globalCup={teams:32,groups:8,matches:63,champion:global.champion};
const files=['src/world.js',...['src/football','src/competitions'].flatMap(dir=>fs.readdirSync(dir).filter(f=>f.endsWith('.js')).map(f=>`${dir}/${f}`))];report.hashes=Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
fs.mkdirSync('artifacts/world-systems',{recursive:true});fs.writeFileSync('artifacts/world-systems/audit.json',JSON.stringify(report,null,2)+'\n');console.log('PASS',report.matches,'matches');
