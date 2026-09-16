import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {leagueSystems,GLOBAL_CUP} from '../src/competitions/catalog.js';
import {clubs,leagues,cities,provinces,players,playerLeague} from '../src/world.js';
import {footballTeams} from '../src/football/data.js';
import {generateName,NAME_POOLS,REGION_NAME_WEIGHTS} from '../src/football/names.js';
import {roundRobin,standings,knockoutBracket,promotedTeams,moveDivisions,globalQualifiers,globalGroups,draftOrder} from '../src/competitions/season.js';
const ids=d=>clubs.filter(c=>c.division===d.id).map(c=>c.id);
test('四区六体系十六级别全员齐备，行政边界与分区注册相符',()=>{
 assert.equal(leagueSystems.length,6);assert.equal(leagueSystems.flatMap(l=>l.levels).length,16);assert.equal(clubs.length,268);assert.equal(new Set(clubs.map(c=>c.name)).size,clubs.length);
 for(const l of leagues)for(const d of l.levels){assert.equal(ids(d).length,d.teams);for(const id of ids(d)){const c=clubs.find(c=>c.id===id),p=provinces.find(p=>p.id===cities.find(x=>x.id===c.city).province);assert.equal(p.region,l.region);if(l.provinces)assert.ok(l.provinces.includes(p.id));}}
 const lower=clubs.find(c=>c.division==='crown-league-3');assert.equal(playerLeague({club:lower.id}).tier,3);assert.equal(playerLeague(players.find(p=>p.id==='lin')).tier,1);
});
test('每级双循环：轮次和场次正确，每轮只出场一次，每对恰好交换主客',()=>{
 for(const d of leagues.flatMap(l=>l.levels)){
  const teams=ids(d),f=roundRobin(teams);assert.equal(f.length,d.matches);assert.equal(Math.max(...f.map(m=>m.round)),d.rounds);assert.equal(new Set(f.map(m=>m.id)).size,f.length);
  for(let r=1;r<=d.rounds;r++){const matches=f.filter(m=>m.round===r);assert.equal(matches.length,d.teams/2);assert.equal(new Set(matches.flatMap(m=>[m.home,m.away])).size,d.teams);}
  const pairs=new Set(f.map(m=>`${m.home}:${m.away}`));assert.equal(pairs.size,f.length);for(const m of f)assert.ok(pairs.has(`${m.away}:${m.home}`));
  for(const id of teams){assert.equal(f.filter(m=>m.home===id).length,d.teams-1);assert.equal(f.filter(m=>m.away===id).length,d.teams-1);}
 }
 const odd=roundRobin(['a','b','c']);assert.equal(odd.length,6);assert.equal(new Set(odd.map(m=>m.round)).size,6);assert.throws(()=>roundRobin(['a','a']));
});
test('积分榜只统计已完成比赛，积分进失球守恒，公平分与同分排序确定',()=>{
 const teams=['a','b','c','d'],f=roundRobin(teams,{seed:41});const unfinished=standings(teams,f);assert.ok(unfinished.every(r=>r.played===0&&r.points===0));
 f.forEach((m,i)=>{m.score=[i%4,(i*3)%4];m.fairPlay=[i%2,0];});const rows=standings(teams,f);assert.equal(rows.reduce((s,r)=>s+r.gf,0),rows.reduce((s,r)=>s+r.ga,0));assert.equal(rows.reduce((s,r)=>s+r.played,0),f.length*2);assert.equal(rows.reduce((s,r)=>s+r.points,0),f.reduce((s,m)=>s+(m.score[0]===m.score[1]?2:3),0));assert.deepEqual(rows,standings(teams,f));
 const draws=roundRobin(teams).map(m=>({...m,score:[0,0],fairPlay:[m.home==='a'?10:0,m.away==='a'?10:0]}));assert.equal(standings(teams,draws).at(-1).id,'a');assert.throws(()=>standings(teams,[f[0],f[0]]));assert.throws(()=>standings(teams,[{id:'bad',home:'a',away:'z',score:[1,0]}]));
});
test('上下级交换人数守恒，原始排名不变，附加赛资格严格',()=>{
 for(const l of leagues.filter(l=>l.levels.length>1)){
  const tables=l.levels.map(d=>ids(d).map((id,i)=>({id,rank:i+1}))),original=JSON.stringify(tables),winners=Object.fromEntries(tables.map((t,i)=>[i,t[4].id]));const next=moveDivisions(l.levels,tables,winners);
  assert.equal(JSON.stringify(tables),original);assert.equal(new Set(next.flat()).size,next.flat().length);assert.deepEqual([...next.flat()].sort(),tables.flat().map(r=>r.id).sort());next.forEach((teams,i)=>assert.equal(teams.length,l.levels[i].teams));assert.ok(next[0].includes(tables[1][0].id));assert.ok(next[1].includes(tables[0].at(-1).id));
  assert.throws(()=>promotedTeams(tables[1],{playoffWinner:tables[1][8].id}));
 }
});
test('地区杯轮空与淘汰场次正确，参赛者只出现一次且不会自动夺冠',()=>{
 for(const l of leagues.filter(l=>l.cup)){
  const teams=clubs.filter(c=>c.league===l.id).map(c=>c.id),bracket=knockoutBracket(teams,{seed:318}),first=bracket.filter(m=>m.round===1),participants=first.flatMap(m=>[m.home,m.away]).filter(Boolean);
  assert.deepEqual(participants.sort(),[...teams].sort());assert.equal(bracket.filter(m=>!m.bye).length,teams.length-1);assert.ok(first.filter(m=>m.bye).every(m=>m.winner));assert.equal(bracket.at(-1).winner,null);assert.deepEqual(bracket,knockoutBracket(teams,{seed:318}));
 }
});
test('全球杯32席来源闭合，8组每组4队且同体系最多2队，共48场小组赛',()=>{
 assert.equal(leagues.reduce((s,l)=>s+l.globalSlots,0),32);const rankings=Object.fromEntries(leagues.map(l=>[l.id,ids(l.levels[0]).map(id=>({id}))]));const qualifiers=globalQualifiers(rankings),groups=globalGroups(qualifiers);assert.equal(groups.length,8);assert.equal(new Set(groups.flatMap(g=>g.teams.map(t=>t.id))).size,32);let matches=0;
 for(const g of groups){assert.equal(g.teams.length,4);for(const l of leagues)assert.ok(g.teams.filter(t=>t.system===l.id).length<=2);matches+=roundRobin(g.teams.map(t=>t.id),{legs:1}).length;}assert.equal(matches,GLOBAL_CUP.groupMatches);assert.equal(knockoutBracket(qualifiers.slice(0,16).map(q=>q.id)).length,15);assert.throws(()=>globalQualifiers({}));assert.throws(()=>globalGroups([...qualifiers.slice(1),qualifiers[1]]));
});
test('选秀48签按规则分轮，前三抽签无重复，后二轮保持逆战绩',()=>{
 const order=ids(leagues[0].levels[0]);for(let seed=0;seed<100;seed++){const picks=draftOrder(order,{seed});assert.equal(picks.length,48);for(let round=1;round<=3;round++){const rows=picks.filter(p=>p.round===round);assert.equal(new Set(rows.map(p=>p.club)).size,16);}assert.ok(picks.slice(0,3).every(p=>order.slice(0,8).includes(p.club)));assert.deepEqual(picks.slice(16,32).map(p=>p.club),order);assert.deepEqual(picks.slice(32).map(p=>p.club),order);assert.deepEqual(picks,draftOrder(order,{seed}));}assert.throws(()=>draftOrder(order.slice(1)));
});
test('八种姓名语系稳定、成组组合与原文完整，继承姓氏，非法参数拒绝',()=>{
 assert.equal(Object.keys(NAME_POOLS).length,8);for(const culture of Object.keys(NAME_POOLS))for(let n=0;n<100;n++){
  const options={id:`p${n}`,culture,seed:318},name=generateName(options);assert.deepEqual(name,generateName(options));assert.equal(name.culture,culture);assert.ok(name.originalName&&name.translatedName);assert.ok(NAME_POOLS[culture].first.some(f=>f.original===name.firstName.original));assert.ok(NAME_POOLS[culture].last.some(f=>f.original===name.surname.original));assert.equal(generateName({...options,display:'original'}).name,name.originalName);
  const child=generateName({id:`child${n}`,culture,familyName:name.surname});assert.deepEqual(child.surname,name.surname);
 }
 const used=new Set();for(let i=0;i<400;i++)generateName({id:`unique${i}`,usedNames:used});assert.equal(used.size,400);assert.throws(()=>generateName({id:'a',culture:'bad'}));assert.throws(()=>generateName({id:'a',region:'bad'}));
});
test('出生地区命名比例有差异，球队内不重名，能力不由姓名语系决定',()=>{
 const samples={};for(const region of Object.keys(REGION_NAME_WEIGHTS)){samples[region]={};for(let i=0;i<3000;i++){const p=generateName({id:`sample${i}`,region});samples[region][p.culture]=(samples[region][p.culture]||0)+1;}assert.equal(Object.keys(samples[region]).length,8);}
 assert.ok(samples.sichuan.zh>samples.metro.zh*2);assert.ok(samples.liberlin.de>samples.lima.de*3);assert.ok(samples.lima.es>samples.liberlin.es*3);
 for(const t of footballTeams)assert.equal(new Set(t.roster.map(p=>p.name)).size,t.roster.length,t.name);const all=footballTeams.flatMap(t=>t.roster);assert.ok(all.some(p=>p.originalName?.match(/[А-Яа-я]/)));assert.ok(all.some(p=>p.originalName?.match(/[\u0600-\u06ff]/)));assert.equal(players.find(p=>p.id==='lin').name,'林知远');assert.equal(players.find(p=>p.id==='father').name,'林承岳');
});

import {generatePlayer} from '../src/football/players.js';
import {playKnockout} from '../src/competitions/season.js';
test('姓名改变不扰动竞技属性、体型和性格随机序列',()=>{
 const a=generatePlayer({id:'same',seed:41,culture:'zh'}),b=generatePlayer({id:'same',seed:41,culture:'ar'});assert.notEqual(a.name,b.name);for(const key of ['attributes','personality','height','weight','potential','weakFoot','foot'])assert.deepEqual(a[key],b[key]);
});
test('淘汰赛实际推进轮空、加时/点球与高顺位主场，禁止未决平局',()=>{
 const ids=['a','b','c','d','e'];const played=[];const result=playKnockout(ids,{shuffle:false,higherSeedHome:true,simulate:opts=>{played.push(opts);return {status:'finished',score:[0,0],shootout:{winner:1,score:[3,4]}};}});
 assert.equal(played.length,4);assert.ok(ids.includes(result.champion));assert.equal(result.matches.filter(m=>m.score).length,4);assert.ok(played.every(m=>ids.indexOf(m.home)<ids.indexOf(m.away)));assert.equal(played.filter(m=>m.neutral).length,1);assert.equal(played.at(-1).neutral,true);assert.throws(()=>playKnockout(ids,{simulate:()=>({status:'finished',score:[0,0]})}));
});
