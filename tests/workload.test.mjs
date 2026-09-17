import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyWorkload,workloadAdvice} from '../src/football/workload.js';
import {createSeason,seasonTeam,validateSave,commitResult} from '../src/competitions/runtime.js';
import {advanceDevelopment,playerWorkload} from '../src/competitions/development.js';
import {registeredPlayer} from '../src/competitions/registry.js';
import {appointManager} from '../src/competitions/career.js';
import {setYouthPath} from '../src/competitions/youth.js';
import {preciseRating} from '../src/football/players.js';

test('短期加练有收益，连续高负荷累积疲劳；比赛前加练收益降低',()=>{
 const train=(load,days)=>{let fatigue=0,dose=0;for(let i=0;i<days;i++){const next=dailyWorkload({fatigue,load});fatigue=next.fatigue;dose+=next.dose;}return {fatigue,dose};};
 assert.ok(train(.9,7).dose>train(.6,7).dose);
 assert.ok(train(.9,90).dose<train(.6,90).dose);
 assert.ok(train(.9,90).fatigue>70);
 assert.ok(dailyWorkload({fatigue:50,load:.3}).fatigue<dailyWorkload({fatigue:50,load:.6}).fatigue);
 assert.ok(dailyWorkload({load:.9,nextMatchDays:1}).dose<dailyWorkload({load:.9,nextMatchDays:4}).dose);
 assert.equal(dailyWorkload({load:.9,injured:true}).dose,0);
 assert.equal(workloadAdvice({nextMatchDays:1}).recommendedLoad,.3);
 assert.equal(workloadAdvice({recentMinutes:180}).recommendedLoad,.3);
});

test('新青年真实成长接入加练，疲劳与出场在分段、保存后完全一致',()=>{
 const id='youth:318:bridge:1',standard=createSeason(),high=structuredClone(standard);
 high.development.plans[id]={focus:'balanced',load:.9};
 const split=structuredClone(high);
 advanceDevelopment(standard,'0318-01-08');advanceDevelopment(high,'0318-01-08');
 const ability=s=>preciseRating({...registeredPlayer(s,id),attributes:s.development.records[id].attributes});
 assert.ok(ability(high)>ability(standard));
 for(const date of ['0318-01-04','0318-01-08','0318-02-06','0318-02-14'])advanceDevelopment(split,date);
 advanceDevelopment(high,'0318-02-14');
 assert.deepEqual(split.development,high.development);
 high.date='0318-02-14';const restored=validateSave(JSON.parse(JSON.stringify(high)));
 advanceDevelopment(high,'0318-02-22');advanceDevelopment(restored,'0318-02-22');
 assert.deepEqual(restored.development,high.development);
 restored.date='0318-02-22';
 const report=playerWorkload(restored,registeredPlayer(restored,id));
 assert.ok(report.fatigue>70);assert.ok(report.effectiveCondition<90);assert.equal(report.recommendedLoad,.3);
 const broken=structuredClone(restored);broken.development.records[id].fatigue=101;
 assert.throws(()=>validateSave(broken),/疲劳/);
});

test('正式比赛传入疲劳后的状态，提交比赛不会重复扣减原有疲劳',()=>{
 const s=createSeason(),id='youth:318:bridge:2';appointManager(s,'bridge');setYouthPath(s,id,'promote');
 advanceDevelopment(s,'0318-01-08');s.date='0318-01-08';
 s.development.records[id].fatigue=50;s.playerState[id]={date:s.date,condition:90,injuryDays:0};
 const home=seasonTeam(s,'bridge'),away=seasonTeam(s,'sky'),p=home.roster.find(p=>p.id===id);
 assert.equal(p.condition,80);
 const input={home,away,knockout:false},m={competition:'test',date:s.date};
 commitResult(s,m,input,{status:'finished',score:[0,0],seconds:5400,events:[],teams:[{stats:{},players:[{id,minutes:90}]},{stats:{},players:[]}],health:[{id,condition:60,injuryDays:0}]});
 assert.equal(s.playerState[id].condition,70);
 const after=seasonTeam(s,'bridge').roster.find(p=>p.id===id);
 assert.ok(Math.abs(after.condition-(70-62.6*.2))<1e-9);
 const report=playerWorkload(s,registeredPlayer(s,id));assert.equal(report.recentMinutes,90);
 assert.equal(report.effectiveCondition,after.condition);
});

test('尚无正式健康记录时，报表不会重复扣疲劳；旧成长球员不展示不适用的建议',()=>{
 const s=createSeason(),id='youth:318:bridge:2';appointManager(s,'bridge');setYouthPath(s,id,'promote');
 advanceDevelopment(s,'0318-01-08');s.date='0318-01-08';s.development.records[id].fatigue=50;
 const roster=seasonTeam(s,'bridge').roster,p=roster.find(p=>p.id===id);
 assert.equal(playerWorkload(s,p).effectiveCondition,p.condition);
 assert.equal(playerWorkload(s,roster.find(p=>!p.growthProfile)),undefined);
});

test('已晋级球队识别次日淘汰赛，未确定胜者不虚构比赛安排',()=>{
 const s=createSeason(),id='youth:318:bridge:2';appointManager(s,'bridge');setYouthPath(s,id,'promote');
 s.date='0318-11-01';
 s.fixtures=[{id:'semi',home:'bridge',away:'sky',date:'0318-10-29',kind:'cup',score:[1,0],winner:'bridge'},{id:'final',home:'winner:semi',away:'sky',date:'0318-11-02',kind:'cup',score:null}];
 const p=registeredPlayer(s,id),known=playerWorkload(s,p);
 assert.equal(known.nextMatchDays,1);assert.equal(known.recommendedLoad,.3);
 s.fixtures[0].score=null;delete s.fixtures[0].winner;
 assert.equal(playerWorkload(s,p).nextMatchDays,null);
});
