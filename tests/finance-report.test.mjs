import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createReportModel } from '../scripts/football/finance-report-model.mjs';

const game=(year,competition,home,away,score=[1,0],shootout=null)=>[`${year}-03-01`,competition,competition==='cup'?'cup':'league',home,away,...score,shootout,null];
const award=(competition,ids,champion,kind='title')=>({competition,kind,champion,teams:ids.map(id=>({id}))});
const data={clubs:[{id:'a',league:'top'},{id:'b',league:'top'},{id:'c',league:'top'}],years:[
  {year:318,finances:[{id:'a',incomeTotal:100},{id:'b',incomeTotal:200},{id:'c',incomeTotal:300}],transfers:[{id:1,from:'a',to:'b'},{id:2,from:null,to:'a'},{id:3,from:'c',to:'b'}],competitions:[award('top',['a','b'],'a'),award('lower',['c'],'c'),award('cup',['a','b','c'],'b'),award('playoff',['c'],'c','promotion')],matches:[game(318,'top','a','b'),game(318,'cup','a','c',[2,2],1)]},
  {year:319,finances:[{id:'a',incomeTotal:400},{id:'b',incomeTotal:500},{id:'c',incomeTotal:600}],transfers:[{id:4,from:'a',to:'c'}],competitions:[award('top',['a','c'],'c'),award('lower',['b'],'b'),award('cup',['a','b','c'],'a')],matches:[game(319,'top','c','a',[0,2]),game(319,'lower','b','c')]},
]};
const model=createReportModel(data);
test('report finances follow each season’s participants, including promotion and relegation',()=>{
  const f={competition:'top'};
  assert.deepEqual(data.years.map(y=>model.finances(y,f).map(a=>a.id)),[['a','b'],['a','c']]);
  assert.deepEqual(data.years.map(y=>model.finances(y,{...f,club:'b'}).map(a=>a.incomeTotal)),[[200],[]]);
  assert.equal(model.selectedYears({year:'319'})[0].year,319);
});
test('report transfers count both endpoints once and combine club and competition scope',()=>{
  assert.deepEqual(model.transfers(data.years[0],{competition:'top'}).map(t=>t.id),[1,2,3]);
  assert.deepEqual(model.transfers(data.years[0],{competition:'top',club:'a'}).map(t=>t.id),[1,2]);
  assert.deepEqual(model.transfers(data.years[0],{competition:'top',club:'c'}),[]);
});
test('title ranking and detail share team filtering, preserve tied ranks and omit promotion titles',()=>{
  assert.deepEqual(model.titleRanks({}),[{rank:1,id:'a',count:2},{rank:1,id:'b',count:2},{rank:1,id:'c',count:2}]);
  assert.deepEqual(model.titleRanks({club:'c',competition:'top'}),[{rank:1,id:'c',count:1}]);
  assert.deepEqual(model.competitions({club:'c',competition:'top'},true).map(c=>c.year),[319]);
  assert.deepEqual(model.competitions({club:'b',competition:'top'}).map(c=>c.year),[318]);
});
test('head-to-head is symmetric, top flight excludes cups and shootouts remain draws',()=>{
  const f={club:'a',opponent:'c'};
  const ms=data.years.flatMap(y=>model.matches(y,f));
  assert.equal(ms.length,2);
  assert.deepEqual(model.records(ms,f),[{id:'a',p:2,w:1,d:1,l:0,gf:4,ga:2,sw:0,sl:1}]);
  assert.equal(data.years.flatMap(y=>model.matches(y,f,true)).length,1);
  assert.deepEqual(model.matches(data.years[0],{club:'a',opponent:'a'}),[]);
  assert.deepEqual(model.records(ms,{opponent:'c'}).map(r=>r.id),['a']);
});
test('risk filters use the club’s competition in the warning year',()=>{
  const warnings=[{date:'0318-12-31',club:'b'},{date:'0319-12-31',club:'b'},{date:'0319-12-31',club:'c'}];
  assert.deepEqual(model.warnings(warnings,{competition:'top'}),[warnings[0],warnings[2]]);
  assert.deepEqual(model.warnings(warnings,{competition:'top',year:'319',club:'b'}),[]);
});
test('the offline report embeds a self-contained query model and parseable inline script',()=>{
  const embedded=vm.runInNewContext(`(${createReportModel.toString()})`)(data);
  assert.equal(embedded.finances(data.years[1],{competition:'top'}).length,2);
  const template=fs.readFileSync(new URL('../scripts/football/finance-report-template.html',import.meta.url),'utf8');
  const html=template.replace('/*REPORT_MODEL*/',()=>createReportModel.toString()).replace('/*REPORT_DATA*/',()=>JSON.stringify(data));
  new vm.Script(html.match(/<script>([\s\S]*)<\/script>/)[1]);
});
