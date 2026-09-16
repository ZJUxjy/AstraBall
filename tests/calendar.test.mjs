import test from 'node:test';
import assert from 'node:assert/strict';
import {createSeason,advanceTo,playFixture,followingSeason,validateSave,tableFor,pendingMatches,fixtureSides,seasonTeam,matchInput,nextDate} from '../src/competitions/runtime.js';
import {seasonCalendar,dateOf,daysBetween} from '../src/competitions/calendar.js';
import {leagueSystems} from '../src/competitions/catalog.js';
const fake=input=>({status:'finished',score:input.knockout?[1,0]:[0,0],teams:[input.home,input.away].map(t=>({id:t.id,stats:{yellow:0,red:0},players:[]})),events:[],seconds:5400});
function completed(){const s=createSeason();advanceTo(s,'0318-12-31',{simulate:fake});return s;}
test('全年赛历覆盖十二个月；46轮、杯赛、全球杯留有独立日期',()=>{
 for(let year=318;year<346;year++){const c=seasonCalendar(year);assert.ok(c.league.length>=46);assert.equal(c.cup.length,6);const all=[...c.league,...c.cup,...c.global,...c.playoffs].sort();assert.equal(new Set(all).size,all.length);for(let i=1;i<all.length;i++)assert.ok(daysBetween(all[i-1],all[i])>=3,`${year}: ${all[i-1]} ${all[i]}`);assert.ok(c.league.every(d=>d.slice(5,7)!=='06'));}
 const s=createSeason();assert.equal(s.fixtures.length,4827);assert.equal(pendingMatches(s).length,4759);assert.equal(s.fixtures.filter(m=>m.bye).length,68);assert.ok(s.qualificationSource.includes('创始'));assert.equal(s.date,'0318-01-01');assert.equal(nextDate(s),'0318-01-20');
});
test('固定种子生成、轮次末日对齐、赛程主客与双循环完整',()=>{
 const s=createSeason();assert.deepEqual(createSeason(),s);for(const sys of leagueSystems)for(const d of sys.levels){const f=s.fixtures.filter(m=>m.competition===d.id);assert.equal(f.length,d.matches);assert.equal(new Set(f.map(m=>m.date)).size,d.rounds);assert.equal(f.at(-1).date,s.calendar.league.at(-1));assert.equal(new Set(f.map(m=>`${m.home}/${m.away}`)).size,f.length);}
 assert.throws(()=>createSeason({members:{}}));
});
test('未来附加赛不虚构球队；不能跳赛或重复计分，非法赛果不提交',()=>{
 const s=createSeason(),m=s.fixtures.find(m=>!m.bye),later=s.fixtures.find(f=>f.date>m.date&&!f.bye);const ko=s.fixtures.find(m=>m.kind==='playoff');assert.deepEqual(fixtureSides(s,ko),{home:null,away:null});assert.throws(()=>playFixture(s,later.id,fake),/之前/);const before=JSON.stringify(s);assert.throws(()=>playFixture(s,m.id,()=>({status:'abandoned',score:[0,0]})));assert.equal(JSON.stringify(s),before);playFixture(s,m.id,fake);assert.throws(()=>playFixture(s,m.id,fake),/已经结束/);assert.equal(tableFor(s,m.competition).reduce((sum,r)=>sum+r.played,0),2);assert.throws(()=>followingSeason(s));
});
test('完整赛季各队无撞期、休息至少三天；所有冠军、晋级与降级闭合',()=>{
 const s=completed();assert.equal(pendingMatches(s).length,0);assert.equal(s.summary.movements.filter(m=>m.kind==='up').length,30);assert.equal(s.summary.movements.filter(m=>m.kind==='down').length,30);assert.equal(s.summary.qualifiers.length,32);assert.equal(s.draft.length,48);
 const dates=new Map();for(const m of s.fixtures.filter(m=>!m.bye)){assert.ok(m.score);for(const id of [m.home,m.away]){const prev=dates.get(id);if(prev)assert.ok(daysBetween(prev,m.date)>=3,`${id}: ${prev} / ${m.date}`);dates.set(id,m.date);}if(m.kind==='playoff'&&!m.neutral){const order=tableFor(s,m.division).map(r=>r.id);assert.ok(order.indexOf(m.home)<order.indexOf(m.away));}if(!['league','group'].includes(m.kind))assert.ok([m.home,m.away].includes(m.winner));}
 for(const sys of leagueSystems)for(const d of sys.levels){const table=tableFor(s,d.id);assert.ok(table.every(r=>r.played===d.rounds));assert.equal(table.reduce((n,r)=>n+r.gf,0),table.reduce((n,r)=>n+r.ga,0));}
 assert.equal(s.fixtures.filter(m=>m.competition==='global-cup'&&m.kind==='global-ko').length,15);assert.equal(new Set(s.fixtures.filter(m=>m.kind==='global-ko'&&m.round===1).flatMap(m=>[m.home,m.away])).size,16);
});
test('跨季使用真实升降级名单、上一年资格和逆战绩选秀顺位，连续两季不丢球队',()=>{
 const s=completed(),original=JSON.stringify(s),next=followingSeason(s);assert.equal(JSON.stringify(s),original);assert.equal(next.year,319);assert.deepEqual(next.members,s.summary.nextMembers);assert.deepEqual(next.qualifiers,s.summary.qualifiers);assert.deepEqual(next.draftRanking,s.summary.tables.closed.map(r=>r.id));assert.equal(next.qualificationSource,'318 赛季联赛排名');for(const m of s.summary.movements){assert.ok(next.members[m.to].includes(m.id));assert.ok(!next.members[m.from].includes(m.id));}advanceTo(next,'0319-12-31',{simulate:fake});const third=followingSeason(next);assert.equal(new Set(Object.values(third.members).flat()).size,268);assert.equal(pendingMatches(third).length,4759);assert.deepEqual(third.members.closed,s.members.closed);
});
test('存档中断恢复结果一致，旧版本和损坏名单被拒绝',()=>{
 const s=createSeason();advanceTo(s,'0318-07-01',{simulate:fake});const saved=validateSave(JSON.parse(JSON.stringify(s)));advanceTo(s,'0318-12-31',{simulate:fake});advanceTo(saved,'0318-12-31',{simulate:fake});assert.deepEqual(saved,s);assert.throws(()=>validateSave({...s,version:999}));assert.throws(()=>validateSave({...s,fixtures:[]}));assert.throws(()=>validateSave({...s,members:{}}));
});
test('黄牌累计停赛按赛事执行，伤病恢复与体能跨比赛保留',()=>{
 const s=createSeason(),m=s.fixtures.find(m=>m.kind==='league'),player=matchInput(s,m).home.roster[0];s.discipline[`${m.competition}/${player.id}`]={yellow:4,ban:0};playFixture(s,m.id,input=>({...fake(input),teams:[input.home,input.away].map((t,i)=>({id:t.id,stats:{yellow:i?0:1,red:0},players:i?[]:[{id:player.id,yellow:1,red:0,minutes:90}]})),health:[{id:player.id,condition:60,injuryDays:10}]}));assert.equal(s.discipline[`${m.competition}/${player.id}`].ban,1);const p=seasonTeam(s,m.home,m.competition).roster.find(p=>p.id===player.id);assert.equal(p.suspended,1);assert.equal(p.condition,60);assert.equal(p.injuryDays,10);const other=seasonTeam(s,m.home,'global-cup').roster.find(p=>p.id===player.id);assert.equal(other.suspended,0);
});
