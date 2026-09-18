import test from 'node:test';
import assert from 'node:assert/strict';
import {footballTeams} from '../src/football/data.js';
import {ATTRIBUTE_KEYS} from '../src/football/players.js';
import {ensurePlayerRegistry,registeredPlayers,registeredPlayer,registeredRoster,validatePlayerRegistry} from '../src/competitions/registry.js';
import {ensureYouthIntake,advanceYouthPathways,youthPlayers,youthOpportunities,setYouthPath,observeYouth,youthObservation,youthWeekContext} from '../src/competitions/youth.js';
const clone=value=>structuredClone(value);
function state(clubId='bridge'){
 const s={date:'0318-01-01',year:318,revision:0,manager:clubId?{clubId}:null,members:Object.fromEntries([...new Set(footballTeams.map(t=>t.division))].map(d=>[d,footballTeams.filter(t=>t.division===d).map(t=>t.id)])),playerState:{},development:{records:{}}};
 ensureYouthIntake(s);return s;
}
const local17=s=>youthPlayers(s,'bridge').find(p=>p.age===17);

test('每年青训只入库一次，引用年龄日独立于世界初始年，注册不污染静态球队',()=>{
 const s=state(),original=clone(footballTeams.find(t=>t.id==='bridge')),count=footballTeams.length*3;
 assert.equal(Object.keys(s.playerRegistry.players).length,count);const same=JSON.stringify(s.playerRegistry);ensureYouthIntake(s);assert.equal(JSON.stringify(s.playerRegistry),same);
 assert.equal(registeredPlayers(s).length,footballTeams.flatMap(t=>t.roster).length+count);
 assert.equal(registeredRoster(s,'bridge').length,original.roster.length);
 s.date='0319-01-01';s.year=319;ensureYouthIntake(s);assert.equal(Object.keys(s.playerRegistry.players).length,count*2);
 assert.ok(Object.values(s.playerRegistry.players).filter(p=>p.id.startsWith('youth:319:')).every(p=>p.ageReferenceDate==='0319-01-01'));
 assert.deepEqual(footballTeams.find(t=>t.id==='bridge'),original);validatePlayerRegistry(s);
});
test('地方青训提拔与租借会改变真实参赛名单，租期结束归队且不重复青年出场',()=>{
 const s=state(),p=local17(s);setYouthPath(s,p.id,'promote');assert.ok(registeredRoster(s,'bridge').some(q=>q.id===p.id));
 const host=youthOpportunities(s,p.id).loans[0];assert.ok(host);setYouthPath(s,p.id,'loan',{clubId:host.id});
 assert.ok(!registeredRoster(s,'bridge').some(q=>q.id===p.id));assert.ok(registeredRoster(s,host.id).some(q=>q.id===p.id));
 assert.equal(new Set(registeredRoster(s,host.id).map(q=>q.number)).size,registeredRoster(s,host.id).length);
 assert.equal(youthWeekContext(s,p,'0318-02-01','0318-04-01').minutes,0);
 advanceYouthPathways(s,'0318-12-31');assert.equal(s.playerRegistry.registrations[p.id].status,'senior');assert.equal(registeredPlayer(s,p.id).club,'bridge');
 assert.equal(s.playerRegistry.registrations[p.id].returnedAt,'0318-12-31');
 assert.ok(!youthOpportunities(s,p.id).actions.includes('loan'));
 const before=JSON.stringify(s.playerRegistry);advanceYouthPathways(s,'0318-12-31');assert.equal(JSON.stringify(s.playerRegistry),before);validatePlayerRegistry(s);
});
test('皇家学院不受关联职业队任意处分，毕业选秀先授签约权再进入职业队',()=>{
 const s=state('sky'),p=youthPlayers(s,'sky').find(p=>p.age===17);
 assert.deepEqual(youthOpportunities(s,p.id).actions,[]);assert.throws(()=>setYouthPath(s,p.id,'promote'));assert.throws(()=>setYouthPath(s,p.id,'release'));
 s.date='0319-01-01';s.year=319;advanceYouthPathways(s,s.date);s.date='0319-01-20';advanceYouthPathways(s,s.date);
 const draft=s.playerRegistry.drafts.find(d=>d.year===319);assert.equal(draft.picks.length,36);
 assert.equal(new Set(draft.picks.map(p=>p.playerId)).size,draft.picks.length);
 const pick=draft.picks.find(p=>p.club==='sky');assert.ok(pick);
 const reg=s.playerRegistry.registrations[pick.playerId];assert.equal(reg.status,'free');assert.equal(reg.rightsClubId,'sky');
 assert.ok(!registeredRoster(s,'sky').some(p=>p.id===pick.playerId));setYouthPath(s,pick.playerId,'sign');assert.ok(registeredRoster(s,'sky').some(p=>p.id===pick.playerId));
 assert.equal(s.playerRegistry.registrations[pick.playerId].rightsClubId,null);validatePlayerRegistry(s);
});
test('释放保留球员身份，其他俱乐部可以重新签约且转移参赛归属',()=>{
 const s=state(),p=local17(s);setYouthPath(s,p.id,'release');assert.equal(registeredPlayer(s,p.id).club,null);
 s.manager.clubId='sky';assert.ok(youthOpportunities(s,p.id).actions.includes('sign'));setYouthPath(s,p.id,'sign');
 assert.equal(registeredPlayer(s,p.id).club,'sky');assert.ok(registeredRoster(s,'sky').some(q=>q.id===p.id));assert.ok(!registeredRoster(s,'bridge').some(q=>q.id===p.id));
 assert.ok(s.playerRegistry.events.some(e=>e.playerId===p.id&&e.type==='release'));assert.ok(s.playerRegistry.events.some(e=>e.playerId===p.id&&e.type==='sign'));validatePlayerRegistry(s);
});
test('观察只由可见能力和新证据更新，隐藏潜力改变不改变报告，点击不能刷新',()=>{
 const a=state(),p=local17(a),b=clone(a);b.playerRegistry.players[p.id].potential=99;b.playerRegistry.players[p.id].growthProfile.ceilings=Object.fromEntries(ATTRIBUTE_KEYS.map(k=>[k,99]));
 assert.deepEqual(observeYouth(a,p.id),observeYouth(b,p.id));const report=youthObservation(a,p.id),before=a.revision;
 assert.deepEqual(observeYouth(a,p.id),report);assert.equal(a.revision,before);
 a.date='0318-02-01';assert.deepEqual(observeYouth(a,p.id),report);
 a.development.records[p.id]={attributes:{...p.attributes},minutes:0,appearances:0,youthMinutes:270,youthAppearances:3,history:[{date:'0318-02-01',ability:report.currentAbility}]};
 assert.equal(observeYouth(a,p.id).samples,2);validatePlayerRegistry(a);
 for(const key of ['evidenceThrough','evidenceMinutes','samples']){const broken=clone(a);delete broken.playerRegistry.observations[`bridge/${p.id}`][key];assert.throws(()=>validatePlayerRegistry(broken),/观察/);}
});
test('青年出场按具体比赛日结算，任意分段相加一致，升队后的日期不再重复计算',()=>{
 const s=state(),p=local17(s),whole=youthWeekContext(s,p,'0318-02-01','0318-03-01');assert.ok(whole.fixtures.length>0);
 const parts=[['0318-02-01','0318-02-09'],['0318-02-09','0318-02-18'],['0318-02-18','0318-03-01']].map(([a,b])=>youthWeekContext(s,p,a,b));
 assert.equal(parts.reduce((n,c)=>n+c.minutes,0),whole.minutes);assert.deepEqual(parts.flatMap(c=>c.fixtures),whole.fixtures);
 s.date='0318-02-15';setYouthPath(s,p.id,'promote');const after=youthWeekContext(s,p,'0318-02-01','0318-03-01');assert.deepEqual(after.fixtures,whole.fixtures.filter(f=>f.date<='0318-02-15'));
});
test('损坏的成长禀赋、归属和日期不能进入注册存档',()=>{
 const base=state(),p=local17(base);
 for(const mutate of [s=>s.playerRegistry.players[p.id].growthProfile.ceilings.passing=NaN,s=>s.playerRegistry.players[p.id].growthProfile.domains.technical=Infinity,s=>s.playerRegistry.players[p.id].personality.professionalism=NaN,s=>s.playerRegistry.registrations[p.id].clubId='unknown',s=>s.playerRegistry.through='0318-02-31']){
  const broken=clone(base);mutate(broken);assert.throws(()=>validatePlayerRegistry(broken));
 }
 const empty={};ensurePlayerRegistry(empty);assert.equal(validatePlayerRegistry(empty),empty);
});
test('成年退出覆盖原始注册，补位后仍可比赛，原始数据保持不变',()=>{
 const s=state(null),original=footballTeams.find(t=>t.id==='bridge').roster.find(p=>p.position!=='GK'&&p.age>=30),before=clone(original);
 s.year=326;s.date='0326-12-31';advanceYouthPathways(s,s.date);
 assert.equal(registeredPlayer(s,original.id).retired,true);assert.ok(!registeredRoster(s,'bridge').some(p=>p.id===original.id));
 for(const team of footballTeams){const roster=registeredRoster(s,team.id);assert.ok(roster.length>=11);assert.ok(roster.some(p=>p.position==='GK'));}
 assert.deepEqual(footballTeams.find(t=>t.id==='bridge').roster.find(p=>p.id===original.id),before);validatePlayerRegistry(s);
});

function goalkeeperReviewState({keepers=2,ability=65,age=19}={}){
 const s=state(),p=s.playerRegistry.players[local17(s).id];
 p.position='GK';p.age=age;p.growthProfile.referencePosition='GK';p.attributes=Object.fromEntries(ATTRIBUTE_KEYS.map(key=>[key,ability]));
 setYouthPath(s,p.id,'promote');s.development.records[p.id]={attributes:{...p.attributes},seasonMinutes:0};
 const originals=registeredRoster(s,'bridge').filter(q=>q.position==='GK'&&q.id!==p.id);
 for(const q of originals.slice(keepers-1))s.playerRegistry.registrations[q.id]={clubId:null,ownerClubId:null,pathway:'local',status:'retired',statusSince:s.date,academyClubId:'bridge',academyId:null,history:[{date:s.date,status:'retired',clubId:null,ownerClubId:null}]};
 assert.equal(registeredRoster(s,'bridge').filter(q=>q.position==='GK').length,keepers);
 // Six completed fixtures establish a genuine spell without playing time;
 // the new opportunity review must not treat an empty calendar as bench time.
 s.fixtures=Array.from({length:6},(_,i)=>({date:`0318-04-${String(i+1).padStart(2,'0')}`,home:'bridge',away:'iron-fc',score:[0,0],report:{players:[[],[]]}}));
 return {s,p};
}
test('AI 不外租第二门将，有第三门将时仍可外租争取出场',()=>{
 for(const keepers of [2,3]){
  const {s,p}=goalkeeperReviewState({keepers});assert.ok(youthOpportunities(s,p.id).loans.length>0);
  s.manager=null;s.date='0318-06-30';advanceYouthPathways(s,s.date);
  assert.equal(s.playerRegistry.registrations[p.id].status,keepers===2?'senior':'loan');
  assert.equal(registeredRoster(s,'bridge').filter(q=>q.position==='GK').length,2);
  validatePlayerRegistry(s);
 }
});
test('AI 不释放第二门将，玩家仍可自行外租并保留一名门将',()=>{
 for(const keepers of [2,3]){
  const {s,p}=goalkeeperReviewState({keepers,ability:1,age:22});assert.equal(youthOpportunities(s,p.id).loans.length,0);
  s.manager=null;s.date='0318-06-30';advanceYouthPathways(s,s.date);
  assert.equal(s.playerRegistry.registrations[p.id].status,keepers===2?'senior':'free');
  assert.equal(registeredRoster(s,'bridge').filter(q=>q.position==='GK').length,2);
  validatePlayerRegistry(s);
 }
 const controlled=goalkeeperReviewState();const host=youthOpportunities(controlled.s,controlled.p.id).loans[0];assert.ok(host);
 setYouthPath(controlled.s,controlled.p.id,'loan',{clubId:host.id});
 assert.equal(registeredRoster(controlled.s,'bridge').filter(q=>q.position==='GK').length,1);
 validatePlayerRegistry(controlled.s);
});
