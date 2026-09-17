import test from 'node:test';
import assert from 'node:assert/strict';
import {generateYouthPlayer,developWeek,preciseRating,publicProfile,ATTRIBUTE_KEYS,ATTRIBUTE_GROUPS} from '../src/football/players.js';
import {footballTeams} from '../src/football/data.js';
import {createSeason,playFixture,matchInput,seasonTeam,validateSave} from '../src/competitions/runtime.js';
import {advanceDevelopment,developedPlayer,setPlayerTraining,developmentReport,createDevelopment} from '../src/competitions/development.js';
import {appointManager} from '../src/competitions/career.js';
const clone=x=>JSON.parse(JSON.stringify(x));
const base=()=>generateYouthPlayer({id:'growth-test',age:16,potential:84,seed:'fixed'});
const mature=(p,options,weeks=416)=>{for(let i=0;i<weeks;i++)p=developWeek(p,options);return p;};
const mean=(p,group)=>Object.keys(ATTRIBUTE_GROUPS[group].fields).reduce((n,k)=>n+p.attributes[k],0)/Object.keys(ATTRIBUTE_GROUPS[group].fields).length;

test('青训起点可重复，潜力不因训练无限增加，连续成长会推进年龄',()=>{
 const p=base(),before=clone(p);assert.deepEqual(p,base());assert.ok(preciseRating(p)<p.potential-20);
 const adult=mature(p,{minutes:90});assert.equal(p.age,16);assert.equal(adult.age,23);assert.ok(adult.developmentAge>23.9);
 assert.ok(preciseRating(adult)>preciseRating(p)+15);assert.ok(preciseRating(adult)<=p.potential);assert.equal(adult.potential,p.potential);assert.deepEqual(p,before);
 assert.equal(publicProfile(adult).potential,undefined);assert.equal(publicProfile(adult).personality,undefined);assert.equal(publicProfile(adult).developmentAge,undefined);
});
test('出场和职业态度影响兑现程度，过量负荷不能刷出更快成长',()=>{
 const p=base(),regular=mature(p,{minutes:90}),bench=mature(p,{minutes:0}),overload=mature(p,{minutes:240,load:.9});
 assert.ok(preciseRating(regular)>preciseRating(bench)+3);assert.ok(preciseRating(regular)>preciseRating(overload));
 const pro=clone(p),poor=clone(p);pro.personality.professionalism=95;poor.personality.professionalism=10;
 assert.ok(preciseRating(mature(pro,{minutes:90}))>preciseRating(mature(poor,{minutes:90}))+2);
});
test('技术专项有明确收益，门将属性和侵略性不随外场训练同步上涨',()=>{
 const p=base(),focused=mature(p,{training:'technical',minutes:60},104),balanced=mature(p,{minutes:60},104);
 assert.ok(mean(focused,'technical')>mean(balanced,'technical'));
 assert.ok(mean(focused,'physical')<mean(balanced,'physical'));
 assert.equal(focused.attributes.aggression,p.attributes.aggression);
 for(const key of Object.keys(ATTRIBUTE_GROUPS.goalkeeper.fields))assert.equal(focused.attributes[key],p.attributes[key]);
});
test('伤停按缺席天数影响训练；临近潜力不越界，老将身体先退化',()=>{
 const p=base(),healthy=developWeek(p,{minutes:0}),partial=developWeek({...p,injuryDays:3},{minutes:0}),injured=developWeek({...p,injuryDays:7},{minutes:0});
 assert.ok(preciseRating(healthy)>preciseRating(partial));assert.ok(preciseRating(partial)>preciseRating(injured));
 let near={...p,potential:preciseRating(p)+.015};for(let i=0;i<20;i++)near=developWeek(near,{minutes:180,training:'mental'});
 assert.ok(preciseRating(near)<=near.potential+1e-10);
 const veteran={...clone(p),age:33,developmentAge:33},older=mature(veteran,{minutes:90},104);
 assert.ok(mean(older,'physical')<mean(veteran,'physical')-3);
 assert.ok(ATTRIBUTE_KEYS.every(k=>older.attributes[k]>=1&&older.attributes[k]<=99));
 assert.throws(()=>developWeek(p,{minutes:-1}));assert.throws(()=>developWeek(p,{load:2}));assert.throws(()=>developWeek(p,{training:'unknown'}));
});
test('赛历分段推进、整段推进、JSON 恢复一致，同日期不重复成长',()=>{
 const s=createSeason(),p=footballTeams[0].roster[0];
 s.playerState[p.id]={date:s.date,condition:31,injuryDays:3};
 s.development.plans[p.id]={focus:'physical',load:.9};
 const split=clone(s);
 advanceDevelopment(s,'0318-02-01');
 for(const date of ['0318-01-04','0318-01-08','0318-01-18','0318-01-25','0318-02-01'])advanceDevelopment(split,date);
 assert.deepEqual(split.development,s.development);
 const saved=validateSave(clone(s)),before=JSON.stringify(saved.development);advanceDevelopment(saved,'0318-02-01');assert.equal(JSON.stringify(saved.development),before);
 advanceDevelopment(s,'0318-02-08');advanceDevelopment(saved,'0318-02-08');assert.deepEqual(saved.development,s.development);
 assert.notDeepEqual(developedPlayer(s,p).attributes,p.attributes);
});
test('训练计划只影响之后的训练日，不能给其他球队或比赛中的球员改计划',()=>{
 const s=createSeason();appointManager(s,'sky');const p=footballTeams.find(t=>t.id==='sky').roster.find(p=>p.position==='CM');
 advanceDevelopment(s,'0318-01-04');s.date='0318-01-04';const dose=clone(s.development.records[p.id].dose);
 setPlayerTraining(s,p.id,{focus:'technical',load:.9});assert.deepEqual(s.development.records[p.id].dose,dose);
 advanceDevelopment(s,'0318-01-08');assert.ok(s.development.records[p.id].attributes.passing>p.attributes.passing);
 const stranger=footballTeams.find(t=>t.id!=='sky').roster[0];assert.throws(()=>setPlayerTraining(s,stranger.id,{focus:'balanced',load:.6}),/本队/);
 s.activeMatch={};assert.throws(()=>setPlayerTraining(s,p.id,{focus:'balanced',load:.6}),/比赛结束/);
});
test('正式出场记录与成长属性进入比赛输入，旧存档从当前日期起算',()=>{
 const s=createSeason(),m=s.fixtures.find(m=>!m.bye);let playedId;
 playFixture(s,m.id,input=>(playedId=input.home.roster[0].id,{status:'finished',score:[1,0],seconds:5400,events:[],teams:[input.home,input.away].map(t=>({id:t.id,stats:{yellow:0,red:0},players:[{id:t.roster[0].id,minutes:90,goals:0,yellow:0,red:0}]}))}));
 const p=seasonTeam(s,m.home).roster.find(p=>p.id===playedId),r=s.development.records[p.id];assert.equal(r.seasonMinutes,90);assert.equal(r.seasonAppearances,1);
 const ready=seasonTeam(s,m.home).roster.find(x=>x.id===p.id);assert.deepEqual(ready.attributes,r.attributes);assert.deepEqual(matchInput(s,m).home.roster[0].attributes,r.attributes);
 const report=developmentReport(s,ready);assert.equal(report.minutes,90);assert.equal(report.appearances,1);
 assert.throws(()=>playFixture(s,m.id));assert.equal(r.seasonMinutes,90);
 const old=createSeason();delete old.development;old.date='0318-07-01';advanceDevelopment(old,'0318-07-08');assert.equal(old.development.since,'0318-07-01');assert.equal(old.development.records[p.id].history.at(-1).date,'0318-07-08');
});
test('跨年按日期增加年龄、保留能力和培养计划，并留下年度记录',()=>{
 const s=createSeason(),p=footballTeams.find(t=>t.id==='sky').roster.find(p=>p.position==='CM');appointManager(s,'sky');s.date='0318-12-25';s.development=createDevelopment(s.date);
 setPlayerTraining(s,p.id,{focus:'mental',load:.3});advanceDevelopment(s,'0319-01-08');s.year=319;s.date='0319-01-08';
 const grown=seasonTeam(s,'sky').roster.find(x=>x.id===p.id);assert.equal(grown.age,p.age+1);assert.notDeepEqual(grown.attributes,p.attributes);
 assert.equal(s.development.plans[p.id].focus,'mental');const report=developmentReport(s,grown);assert.equal(report.annual[0].year,318);assert.equal(report.minutes,0);
 assert.throws(()=>advanceDevelopment(s,'0318-12-31'),/倒退/);
});
