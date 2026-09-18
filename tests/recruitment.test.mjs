import test from 'node:test';
import assert from 'node:assert/strict';
import {createSeason} from '../src/competitions/runtime.js';
import {footballTeams} from '../src/football/data.js';
import {ATTRIBUTE_KEYS} from '../src/football/players.js';
import {recruitmentContext,recruitmentOrder,lacksPlayingTime,loanDestinations,transferCandidates} from '../src/competitions/recruitment.js';
import {registeredPlayers,registeredRoster,validatePlayerRegistry} from '../src/competitions/registry.js';
import {advanceYouthPathways} from '../src/competitions/youth.js';
import {ensureEconomy} from '../src/competitions/market.js';

const source=footballTeams.find(t=>t.division.endsWith('-3'));
function signedTalent(){
 const s=createSeason(),p=Object.values(s.playerRegistry.players).find(p=>p.club===source.id),r=s.playerRegistry.registrations[p.id];
 p.position='ST';p.age=22;p.potential=99;p.growthProfile.referencePosition='ST';
 p.attributes=Object.fromEntries(ATTRIBUTE_KEYS.map(k=>[k,99]));
 Object.assign(r,{status:'senior',ownerClubId:source.id,signedAt:s.date});r.history[0].status='senior';
 return {s,p};
}
test('缺少赛历不视为缺少机会；评估须有比赛和足够留队时间',()=>{
 const s=createSeason(),p=footballTeams[0].roster[0],date='0318-06-30',reg={clubId:p.club,statusSince:'0318-01-01'};
 const context=recruitmentContext(s,date,id=>registeredRoster(s,id));
 assert.equal(lacksPlayingTime(context,p,reg),false);
 s.fixtures=Array.from({length:10},(_,i)=>({date:`0318-04-${String(i+1).padStart(2,'0')}`,home:p.club,away:'bridge',report:{players:[[],[]]}}));
 const played=recruitmentContext(s,date,id=>registeredRoster(s,id));assert.equal(lacksPlayingTime(played,p,reg),true);
 assert.equal(lacksPlayingTime(played,p,{...reg,statusSince:'0318-06-01'}),false);
 for(const m of s.fixtures)m.report.players[0]=[{id:p.id,minutes:60}];
 assert.equal(lacksPlayingTime(recruitmentContext(s,date,id=>registeredRoster(s,id)),p,reg),false);
});
test('旧队分钟不掩盖新队坐板凳，只比较本次注册后的本队赛历',()=>{
 const s=createSeason(),p=footballTeams[0].roster[0],date='0318-06-30',reg={clubId:'bridge',statusSince:'0318-04-01'};
 s.fixtures=Array.from({length:10},(_,i)=>({date:`0318-03-${String(i+1).padStart(2,'0')}`,home:p.club,away:'iron-fc',report:{players:[[{id:p.id,minutes:90}],[]]}}));
 s.fixtures.push(...Array.from({length:10},(_,i)=>({date:`0318-04-${String(i+1).padStart(2,'0')}`,home:'bridge',away:'iron-fc',report:{players:[[],[]]}})));
 assert.equal(lacksPlayingTime(recruitmentContext(s,date,id=>registeredRoster(s,id)),p,reg),true);
});
test('外租目标必须提供更好的真实角色竞争机会且不读取潜力',()=>{
 const s=createSeason(),p=Object.values(s.playerRegistry.players).find(p=>p.club==='bridge'&&p.age===17),reg=s.playerRegistry.registrations[p.id];
 const context=recruitmentContext(s,s.date,id=>registeredRoster(s,id));
 const before=loanDestinations(context,p,reg,()=>true);assert.ok(before.length);
 const home=context.opportunity('bridge',context.player(p)).expectedMinutes;
 for(const host of before){assert.ok(host.expectedMinutes>=25);assert.ok(host.expectedMinutes>=home+15);}
 const altered={...p,potential:1,growthProfile:{...p.growthProfile,ceilings:Object.fromEntries(ATTRIBUTE_KEYS.map(k=>[k,1]))}};
 assert.deepEqual(loanDestinations(context,altered,reg,()=>true),before);
 assert.deepEqual(loanDestinations(context,p,reg,()=>false),[]);
 s.manager={clubId:before[0].id};const controlled=recruitmentContext(s,s.date,id=>registeredRoster(s,id));
 assert.ok(!loanDestinations(controlled,p,reg,()=>true).some(host=>host.id===s.manager.clubId));
});
test('已签约成材球员可向更高级别流动，保留身份历史并限制重复转会',()=>{
 const {s,p}=signedTalent();s.date='0318-07-01';advanceYouthPathways(s,s.date);
 const r=s.playerRegistry.registrations[p.id];assert.notEqual(r.clubId,source.id);
 assert.equal(r.status,'senior');assert.equal(r.ownerClubId,r.clubId);assert.equal(r.transferredAt,s.date);
 assert.equal(s.playerRegistry.events.filter(e=>e.playerId===p.id&&e.type==='transfer').length,1);
 assert.ok(registeredRoster(s,r.clubId).some(q=>q.id===p.id));assert.ok(!registeredRoster(s,source.id).some(q=>q.id===p.id));
 const after=structuredClone(r);advanceYouthPathways(s,s.date);assert.deepEqual(r,after);validatePlayerRegistry(s);
});
test('高总评替补也按实际零出场外租，不再被总评分门槛锁住',()=>{
 const s=createSeason(),p=Object.values(s.playerRegistry.players).find(p=>p.club==='bridge'&&p.age===17),r=s.playerRegistry.registrations[p.id];
 for(const original of registeredRoster(s,'bridge'))s.development.records[original.id]={attributes:Object.fromEntries(ATTRIBUTE_KEYS.map(k=>[k,90]))};
 p.position='ST';p.age=22;p.attributes=Object.fromEntries(ATTRIBUTE_KEYS.map(k=>[k,80]));p.growthProfile.referencePosition='ST';
 Object.assign(r,{status:'senior',signedAt:s.date});r.history[0].status='senior';
 s.fixtures=Array.from({length:10},(_,i)=>({date:`0318-04-${String(i+1).padStart(2,'0')}`,home:'bridge',away:'iron-fc',score:[0,0],report:{players:[[],[]]}}));
 s.date='0318-06-30';advanceYouthPathways(s,s.date);
 assert.equal(r.status,'loan');assert.equal(r.ownerClubId,'bridge');assert.notEqual(r.clubId,'bridge');validatePlayerRegistry(s);
});
test('AI 招募不自动处置玩家所属球员',()=>{
 const {s,p}=signedTalent();s.manager={clubId:source.id};s.date='0318-07-01';advanceYouthPathways(s,s.date);
 assert.equal(s.playerRegistry.registrations[p.id].clubId,source.id);validatePlayerRegistry(s);
});
test('满员AI队可在确认强援后置换无出场替补，人数和位置底线保持',()=>{
 const {s,p}=signedTalent(),target=recruitmentOrder(recruitmentContext(s,'0318-07-01',id=>registeredRoster(s,id)))[0];
 const count=40-registeredRoster(s,target.id).length;
 for(const filler of Object.values(s.playerRegistry.players).filter(q=>q.id!==p.id&&q.club!==target.id).slice(0,count)){
  const reg=s.playerRegistry.registrations[filler.id];filler.age=17;filler.position='AM';filler.growthProfile.referencePosition='AM';filler.attributes=Object.fromEntries(ATTRIBUTE_KEYS.map(k=>[k,1]));
  const numbers=new Set(registeredRoster(s,target.id).map(q=>q.number));let number=30;while(numbers.has(number))number++;
  Object.assign(reg,{status:'senior',clubId:target.id,ownerClubId:target.id,number});
  Object.assign(reg.history[0],{status:'senior',clubId:target.id,ownerClubId:target.id});
 }
 s.fixtures=Array.from({length:10},(_,i)=>({date:`0318-04-${String(i+1).padStart(2,'0')}`,home:target.id,away:'bridge',score:[0,0],report:{players:[[],[]]}}));
 s.date='0318-07-01';advanceYouthPathways(s,s.date);
 assert.equal(s.playerRegistry.registrations[p.id].clubId,target.id);
 const roster=registeredRoster(s,target.id);assert.ok(roster.length>=18&&roster.length<=40);assert.ok(roster.filter(q=>q.position==='GK').length>=2);assert.ok(roster.filter(q=>q.position==='CB').length>=3);
 assert.ok(s.playerRegistry.events.some(e=>e.type==='release'&&e.fromClubId===target.id&&e.text.includes('阵容调整')));validatePlayerRegistry(s);
});
test('同级招募次序按窗口轮换，可重放且不再长期依赖球队编号',()=>{
 const s=createSeason(),context=date=>recruitmentContext(s,date,id=>registeredRoster(s,id));
 const june=recruitmentOrder(context('0318-06-30')).map(t=>t.id),repeat=recruitmentOrder(context('0318-06-30')).map(t=>t.id),december=recruitmentOrder(context('0318-12-31')).map(t=>t.id);
 assert.deepEqual(june,repeat);assert.notDeepEqual(june.slice(0,16),december.slice(0,16));
 assert.equal(new Set(june).size,footballTeams.length);
 const c=context('0318-06-30');for(let i=1;i<june.length;i++)assert.ok(c.tier(june[i-1])<=c.tier(june[i]));
});
test('转会日期损坏时拒绝注册存档',()=>{
 const {s,p}=signedTalent();s.playerRegistry.registrations[p.id].transferredAt='0318-02-31';
 assert.throws(()=>validatePlayerRegistry(s),/转会日期/);
});
test('原始球员转会使用注册号码覆盖，不修改原始名册或与接收队撞号',()=>{
 const s=createSeason(),p=source.roster.find(p=>p.position==='ST'),original=structuredClone(p);
 s.development.records[p.id]={attributes:Object.fromEntries(ATTRIBUTE_KEYS.map(k=>[k,99]))};
 s.date='0318-07-01';advanceYouthPathways(s,s.date);
 const reg=s.playerRegistry.registrations[p.id];assert.ok(reg?.transferredAt);
 const roster=registeredRoster(s,reg.clubId);assert.equal(new Set(roster.map(q=>q.number)).size,roster.length);
 assert.deepEqual(p,original);validatePlayerRegistry(s);
});
test('六月三十日不批量转会，窗口日才招募成材球员',()=>{
 const {s,p}=signedTalent();s.date='0318-06-30';advanceYouthPathways(s,s.date);
 assert.equal(s.playerRegistry.registrations[p.id].clubId,source.id);
 s.date='0318-07-01';advanceYouthPathways(s,s.date);
 assert.notEqual(s.playerRegistry.registrations[p.id].clubId,source.id);
});
test('缺少出场的上级球员可以转入较低级别',()=>{
 const s=createSeason(),seller=footballTeams.find(t=>t.division==='closed'),buyer=s.members['liberlin-league-4'][0];
 const p=Object.values(s.playerRegistry.players).find(q=>q.club===seller.id&&q.position!=='GK')||seller.roster.find(q=>q.position!=='GK');
 const id=p.id,reg=s.playerRegistry.registrations[id]||{status:'senior',clubId:seller.id,statusSince:'0318-01-01'};
 if(!s.playerRegistry.registrations[id])s.playerRegistry.registrations[id]={status:'senior',clubId:seller.id,ownerClubId:seller.id,statusSince:'0318-01-01',history:[{date:'0318-01-01',status:'senior',clubId:seller.id,ownerClubId:seller.id}]};
 Object.assign(s.playerRegistry.registrations[id],{status:'senior',clubId:seller.id,statusSince:'0318-01-01'});
 const player=s.playerRegistry.players[id]||p;
 player.position='ST';player.age=24;
 s.development.records[id]={attributes:Object.fromEntries(ATTRIBUTE_KEYS.map(k=>[k,92]))};
 s.fixtures=Array.from({length:10},(_,i)=>({date:`0318-04-${String(i+1).padStart(2,'0')}`,home:seller.id,away:'bridge',score:[0,0],report:{players:[[],[]]}}));
 const context=recruitmentContext(s,'0318-07-01',club=>registeredRoster(s,club));
 const down=transferCandidates(context,registeredPlayers(s),s.playerRegistry.registrations,buyer);
 assert.ok(down.some(row=>row.p.id===id),`替补应可向 ${buyer} 流动`);
});
test('官方多年入口与页面一样打开世界模型和经济账本',()=>{
 const world=createSeason({worldModel:true});assert.equal(world.worldModel,1);
 const s=createSeason();ensureEconomy(s);
 assert.ok(s.economy.accounts.sky);assert.equal(s.economy.biddingVersion,1);
});
