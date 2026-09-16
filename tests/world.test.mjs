import test from 'node:test';
import assert from 'node:assert/strict';
import {YEAR,regions,provinces,cities,leagues,clubs,academies,families,players,drafts,relationships,byId,location,playerLeague,hometownPlayers,hometownDrafts,alumni,relatives,originStory} from '../src/world.js';
test('所有实体身份唯一，所有引用均能追溯到实体',()=>{
  for(const list of [regions,provinces,cities,leagues,clubs,academies,families,players]) assert.equal(new Set(list.map(x=>x.id)).size,list.length);
  for(const p of provinces) assert.ok(byId(regions,p.region));
  for(const c of cities) assert.ok(byId(provinces,c.province));
  for(const l of leagues) assert.ok(byId(regions,l.region));
  for(const c of clubs){assert.ok(byId(cities,c.city));assert.ok(byId(leagues,c.league));}
  for(const a of academies)assert.ok(byId(cities,a.city));
  for(const f of families){assert.ok(byId(cities,f.origin));if(f.parent)assert.ok(byId(families,f.parent));}
  for(const p of players){assert.ok(location(p.city));if(p.club)assert.ok(byId(clubs,p.club));if(p.lastClub)assert.ok(byId(clubs,p.lastClub));if(p.family)assert.ok(byId(families,p.family));for(const t of p.training){assert.ok(byId(academies,t.academy));assert.ok(t.from>=byId(academies,t.academy).founded);assert.ok(t.from<t.to&&t.to<=YEAR);}for(const c of p.career){const target={club:clubs,academy:academies}[c.type];if(target)assert.ok(byId(target,c.target));else assert.ok(drafts.some(d=>String(d.year)===c.target));}}
  for(const r of relationships){assert.ok(byId(players,r.from));assert.ok(byId(players,r.to));}
});
test('四区人口与六套体系符合设定',()=>{assert.equal(regions.reduce((sum,r)=>sum+r.population,0),500);assert.equal(leagues.filter(l=>l.region==='metro').length,3);assert.equal(leagues.length,6);});
test('同级别同乡跨联赛、排除本人和退役者，同联赛筛选更严格',()=>{
  const lin=byId(players,'lin');assert.deepEqual(hometownPlayers(lin,'province','yunmin').map(x=>x.id),['zhou','xu']);assert.deepEqual(hometownPlayers(lin,'province','yunmin','league'),[]);assert.deepEqual(hometownPlayers(lin,'city','jiangqiao').map(x=>x.id),['zhou']);
  const moved={...lin,club:'bridge'};assert.deepEqual(hometownPlayers(moved,'province','yunmin','league').map(x=>x.id),['zhou']);assert.equal(location(moved.city).province.id,'yunmin');
});
test('历届状元完整连续，退役球员保留，第二位状元来自记录',()=>{
  assert.deepEqual(drafts.map(d=>d.year),Array.from({length:30},(_,i)=>288+i));assert.equal(new Set(drafts.map(d=>d.player)).size,30);
  for(const d of drafts){const p=byId(players,d.player);assert.ok(p);assert.ok(byId(clubs,d.club));assert.equal(p.age-(YEAR-d.year),d.ageAtSelection);assert.equal(d.overall,1);}
  assert.deepEqual(hometownDrafts('province','yunmin').map(d=>d.player),['he','lin']);assert.ok(byId(players,'he').retired);assert.equal(originStory(byId(players,'lin')),'冉坝省第 2 位状元');
});
test('校友关系与出生地独立、父子双向关系准确、退役者无现役联赛',()=>{
  assert.ok(alumni('morning').some(p=>p.id==='lin'));assert.ok(alumni('morning').some(p=>p.id==='shen'));assert.notEqual(location(byId(players,'lin').city).region.id,location(byId(players,'shen').city).region.id);
  assert.equal(relatives('lin')[0].label,'父亲');assert.equal(relatives('lin')[0].player.id,'father');assert.equal(relatives('father')[0].label,'儿子');assert.equal(playerLeague(byId(players,'father')),null);
});
