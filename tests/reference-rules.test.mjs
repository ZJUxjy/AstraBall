import test from 'node:test';
import assert from 'node:assert/strict';
import {clubs} from '../src/world.js';
import {referenceClubs} from '../src/competitions/reference-clubs.js';
import {METRO_SYSTEMS,leagueSystems,isGlobalCupYear} from '../src/competitions/catalog.js';
import {metroChampionshipFixtures} from '../src/competitions/season.js';
import {createSeason,fixtureSides,settleSeason,expectedFixtureCount,validateSave} from '../src/competitions/runtime.js';
import {clubProfile,FINANCIAL_POLICIES} from '../src/competitions/club-profiles.js';
import {daysBetween} from '../src/competitions/calendar.js';

test('参考档案的145个名称逐一入库，三平级联赛各12队，大都会雄狮不归皇室',()=>{
 assert.equal(referenceClubs.length,145);
 for(const r of referenceClubs){const c=clubs.find(c=>c.division===r.division&&c.name===r.name);assert.ok(c,r.name);assert.equal(c.referenceSource,r.source);}
 for(const id of METRO_SYSTEMS){assert.equal(clubs.filter(c=>c.league===id).length,12);assert.deepEqual(FINANCIAL_POLICIES[id],FINANCIAL_POLICIES.closed);}
 assert.equal(clubProfile(clubs.find(c=>c.name==='大都会雄狮').id).royal,false);
 assert.equal(clubProfile('sky').royalProvisional,false);assert.equal(clubProfile('closed-club-3').royalProvisional,true);
});
test('大都会争冠组每轮12队，每队跨联赛8个不同对手，四主四客',()=>{
 const fs=metroChampionshipFixtures(),ids=[...new Set(fs.flatMap(m=>[m.home,m.away]))];assert.equal(fs.length,48);assert.equal(ids.length,12);
 for(let round=1;round<=8;round++){const ms=fs.filter(m=>m.round===round);assert.equal(ms.length,6);assert.equal(new Set(ms.flatMap(m=>[m.home,m.away])).size,12);}
 for(const id of ids){const ms=fs.filter(m=>m.home===id||m.away===id),opponents=ms.map(m=>m.home===id?m.away:m.home);assert.equal(ms.length,8);assert.equal(new Set(opponents).size,8);assert.ok(opponents.every(o=>o.split(':')[1]!==id.split(':')[1]));assert.equal(ms.filter(m=>m.home===id).length,4);}
});
test('318—325年度帝国杯每四年举办，场次与当年赛历一致，旧规则存档拒绝混入',()=>{
 assert.deepEqual(Array.from({length:8},(_,i)=>318+i).filter(isGlobalCupYear),[318,322]);
 for(const year of [318,319,322]){const s=createSeason({year});assert.equal(s.fixtures.length,expectedFixtureCount(year));assert.equal(s.fixtures.filter(m=>m.competition==='global-cup').length,isGlobalCupYear(year)?31:0);assert.equal(s.groups.length,isGlobalCupYear(year)?4:0);assert.throws(()=>validateSave({...s,ruleset:1}),/版本不兼容/);}
});
test('结构赛果贯通资格与升降级：三平级和两大陆封闭，矿业岛3/3/2交换，无赛程冲突',()=>{
 const s=createSeason(),last=new Map();
 // Synthetic scores validate bracket topology only; these are not engine results.
 for(const m of s.fixtures){const sides=fixtureSides(s,m);assert.ok(sides.home&&sides.away,m.id);for(const id of Object.values(sides)){if(last.has(id))assert.ok(daysBetween(last.get(id),m.date)>=3,`${id}: ${last.get(id)} ${m.date}`);last.set(id,m.date);}Object.assign(m,sides,{score:[1,0],winner:['league','group','championship-group'].includes(m.kind)?null:sides.home});}
 const r=settleSeason(s);assert.equal(r.champions.length,16);assert.equal(r.movements.length,16);assert.ok(r.movements.every(m=>m.from.startsWith('liberlin-league')&&m.to.startsWith('liberlin-league')));
 for(const sys of leagueSystems.filter(s=>s.levels.length===1))assert.deepEqual(r.nextMembers[sys.id],s.members[sys.id]);
 assert.deepEqual(['closed','sichuan-league','lima-league','liberlin-league'].map(id=>r.qualifiers.filter(q=>q.system===id).length),[6,4,4,2]);
 const mcl=r.tables['metro-champions'];assert.ok(mcl.every(t=>t.played===8));assert.deepEqual(r.qualifiers.filter(q=>q.system==='closed').map(q=>q.id),r.metroRanking.slice(0,6).map(r=>r.id));
 assert.equal(r.draftRanking.length,36);assert.equal(new Set(r.draftRanking).size,36);assert.equal(r.draftRanking[0],r.champions.find(c=>c.competition==='metro-champions').id);
 for(const tier of [1,2,3]){const upper=tier===1?'liberlin-league':`liberlin-league-${tier}`,lower=`liberlin-league-${tier+1}`;assert.equal(r.movements.filter(m=>m.from===upper&&m.to===lower).length,tier===3?2:3);}
});
