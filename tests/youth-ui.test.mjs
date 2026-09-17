import test from 'node:test';
import assert from 'node:assert/strict';
import {createSeason} from '../src/competitions/runtime.js';
import {appointManager} from '../src/competitions/career.js';
import {youthPlayers,youthOpportunities,setYouthPath,observeYouth} from '../src/competitions/youth.js';
import {setAcademyPlan,academyReport} from '../src/competitions/academy.js';
import {youthContent} from '../src/competitions/youth-ui.js';
import {playerGrowthPanel,workloadMarkup} from '../src/football/development-ui.js';
import {developedPlayer,developmentReport,advanceDevelopment,setPlayerTraining} from '../src/competitions/development.js';
import {footballTeams} from '../src/football/data.js';

const managed=()=>{const s=createSeason();appointManager(s,'bridge');return s;};
test('青训中心有未执教入口，所有栏目渲染安全且不泄露成长参数',()=>{
 const s=createSeason();assert.match(youthContent(s),/尚未接手俱乐部/);assert.match(youthContent(s),/href="#manager"/);
 appointManager(s,'bridge');const p=youthPlayers(s,'bridge')[0];s.playerRegistry.players[p.id].name='<script>不执行</script>';
 for(const tab of ['academy','senior','loan','candidates','draft','history']){
  const html=youthContent(s,{tab,selectedId:p.id});
  if(['academy','history'].includes(tab))assert.match(html,/&lt;script&gt;不执行&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>|growthProfile|bodyProfile|potential|ceilings|adultHeight|adultWeight|maturityShift|NaN|undefined/);
  if(['academy','history','draft'].includes(tab)){assert.match(html,/本季青年分钟/);assert.match(html,/本季正式分钟/);}
 }
});
test('青年路径变化在中心同步呈现，比赛中禁用操作且租借可选目的地',()=>{
 const s=managed(),p=youthPlayers(s,'bridge').find(p=>p.age===17),opportunities=youthOpportunities(s,p.id);
 let html=youthContent(s,{selectedId:p.id});assert.match(html,/data-youth-action="promote"/);
 assert.ok(opportunities.loans.length);assert.match(html,new RegExp(`value="${opportunities.loans[0].id}"`));
 setYouthPath(s,p.id,'loan',{clubId:opportunities.loans[0].id});
 html=youthContent(s,{tab:'loan',selectedId:p.id});assert.match(html,/租借至/);assert.doesNotMatch(html,/data-youth-action="promote"/);
 s.activeMatch={};html=youthContent(s,{tab:'loan',selectedId:p.id});assert.match(html,/比赛结束后可调整/);assert.match(html,/data-youth-action="observe"[^>]+disabled/);
});
test('观察报告显示范围、依据和时间，重复渲染不制造新报告',()=>{
 const s=managed(),p=youthPlayers(s,'bridge')[0];observeYouth(s,p.id);
 const before=structuredClone(s.playerRegistry.observations),html=youthContent(s,{selectedId:p.id});
 assert.match(html,/预计成年能力/);assert.match(html,/较低/);assert.match(html,/暂无成年正式比赛记录/);assert.match(html,/0318-01-01/);
 assert.doesNotMatch(html,/data-youth-action="observe"/);assert.equal(youthContent(s,{selectedId:p.id}),html);assert.deepEqual(s.playerRegistry.observations,before);
});
test('皇家学院显示关联身份，未签约球员不显示职业队训练控件',async()=>{
 const s=createSeason();appointManager(s,'sky');const p=youthPlayers(s,'sky')[0];
 assert.match(youthContent(s,{selectedId:p.id}),/关联学院/);
 assert.doesNotMatch(playerGrowthPanel(s,p,{editable:true}),/data-growth=/);
});
test('青训和完整成长面板按当前日期显示体格及本季变化，隐藏成年目标',()=>{
 const s=managed(),p=youthPlayers(s,'bridge')[0],initial=developmentReport(s,p).body;
 assert.ok(initial);assert.equal(initial.heightChange,0);assert.equal(initial.weightChange,0);
 s.date='0318-06-01';const current=developedPlayer(s,p),body=developmentReport(s,current).body;
 assert.ok(body.height>initial.height);assert.ok(body.weight>initial.weight);
 const snapshot=JSON.stringify(s);
 for(const html of [youthContent(s,{selectedId:p.id}),playerGrowthPanel(s,current)]){
  assert.match(html,new RegExp(`<dt>身高</dt><dd>${Math.round(body.height)} cm</dd>`));
  assert.ok(html.includes(`<dt>体重</dt><dd>${body.weight.toFixed(1)} kg</dd>`));
  assert.ok(html.includes(`<dt>本季身高变化</dt><dd>+${body.heightChange.toFixed(1)} cm</dd>`));
  assert.ok(html.includes(`<dt>本季体重变化</dt><dd>+${body.weightChange.toFixed(1)} kg</dd>`));
  assert.doesNotMatch(html,/成年身高|成年体重|bodyProfile|adultHeight|adultWeight|maturityShift|NaN|undefined/);
 }
 assert.equal(JSON.stringify(s),snapshot);
});
test('既有职业球员未建立身体发育档案时不显示本季体格变化',()=>{
 const s=managed(),p=footballTeams.find(t=>t.id==='bridge').roster[0],html=playerGrowthPanel(s,p);
 assert.match(html,/个人成长/);assert.doesNotMatch(html,/身体发育|本季身高变化|本季体重变化|NaN|undefined/);
});

test('培养计划显示重点名额、选人策略，满员后可取消但不能增加',()=>{
 const s=managed(),players=youthPlayers(s,'bridge'),first=players[0],second=players[1],third=players[2];
 let html=youthContent(s,{selectedId:first.id});
 assert.match(html,/重点培养 0 \/ 2/);assert.match(html,/data-academy-selection/);assert.match(html,/列为重点培养/);
 setAcademyPlan(s,{selection:'development',focusPlayers:[first.id,second.id]});
 const before=JSON.stringify(s);html=youthContent(s,{selectedId:third.id});
 assert.match(html,/重点培养 2 \/ 2/);assert.match(html,/value="development" selected/);assert.match(html,/重点名额已满/);assert.match(html,/data-youth-action="focus"[^>]+disabled/);
 assert.equal(JSON.stringify(s),before);
 html=youthContent(s,{selectedId:first.id});assert.match(html,/aria-pressed="true"/);assert.match(html,/取消重点培养/);assert.doesNotMatch(html,/data-youth-action="focus"[^>]+disabled/);
 s.activeMatch={};html=youthContent(s,{selectedId:first.id});assert.match(html,/data-academy-selection[^>]+disabled/);assert.match(html,/data-youth-action="focus"[^>]+disabled/);
});
test('皇家学院无俱乐部培养开关，离队球员不占重点名额',()=>{
 const royal=createSeason();appointManager(royal,'sky');const html=youthContent(royal);
 assert.match(html,/训练与选人由学院负责/);assert.doesNotMatch(html,/data-academy-selection|data-youth-action="focus"/);
 const s=managed(),p=youthPlayers(s,'bridge').find(p=>p.age===17);
 setAcademyPlan(s,{focusPlayers:[p.id]});setYouthPath(s,p.id,'loan',{clubId:youthOpportunities(s,p.id).loans[0].id});
 assert.equal(academyReport(s,'bridge').focusPlayers.length,0);
 assert.match(youthContent(s),/重点培养 0 \/ 2/);assert.doesNotMatch(youthContent(s,{tab:'loan',selectedId:p.id}),/data-youth-action="focus"/);
});
test('恢复建议区分今天比赛与无近期赛程，并转义原因',()=>{
 assert.equal(workloadMarkup(null),'');
 let html=workloadMarkup({fatigue:65,recentMinutes:180,nextMatchDays:0,recommendedLoad:.3,reason:'连续比赛 <恢复>'});
 assert.match(html,/较高 · 65/);assert.match(html,/180 分钟/);assert.match(html,/今日/);assert.match(html,/建议轻量训练/);assert.match(html,/&lt;恢复&gt;/);assert.doesNotMatch(html,/<恢复>|undefined|NaN/);
 html=workloadMarkup({fatigue:4,recentMinutes:0,nextMatchDays:null,recommendedLoad:.9,reason:'近期没有比赛'});
 assert.match(html,/7 日内无赛程/);assert.match(html,/建议高强度训练/);
});

test('成长报表实际负荷接入两处界面，建议不改写训练计划或承诺出场',()=>{
 const s=managed(),p=youthPlayers(s,'bridge').find(p=>p.age===17);
 setPlayerTraining(s,p.id,{focus:'balanced',load:.9});advanceDevelopment(s,'0318-02-05');s.date='0318-02-05';
 const current=developedPlayer(s,p),report=developmentReport(s,current),workload=report.workload;
 assert.ok(workload.fatigue>=30);assert.equal(workload.recommendedLoad,.3);
 assert.equal(workload.recentMinutes,(s.development.records[p.id].recentExposure||[]).reduce((total,row)=>total+row.minutes,0));
 assert.ok(workload.nextMatchDays>=0&&workload.nextMatchDays<=7);assert.equal(report.plan.load,.9);
 const before=JSON.stringify(s),expected=workloadMarkup(workload);
 for(const html of [youthContent(s,{selectedId:p.id}),playerGrowthPanel(s,current,{editable:true})]){
  assert.ok(html.includes(expected));assert.match(html,/近期比赛日/);assert.match(html,/建议轻量训练/);assert.match(html,/疲劳较高，优先恢复/);
  assert.doesNotMatch(html,/下场比赛|必定出场|NaN|undefined/);
 }
 assert.match(playerGrowthPanel(s,current,{editable:true}),/value="0.9" selected/);
 assert.equal(JSON.stringify(s),before);
});
