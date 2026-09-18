import test from 'node:test';
import assert from 'node:assert/strict';
import {formatMoney,moneyData} from '../src/format.js';
import {compareValues,sortPlayers,cellValue} from '../src/list-sort.js';
import {generatePlayer} from '../src/football/players.js';
test('金额统一万亿，负数、零、单位进位、小额与缺失值',()=>{
 for(const [n,expected] of [[0,'0'],[999,'999'],[10000,'1万'],[25000,'2.5万'],[12345678,'1234.6万'],[158000000,'1.58亿'],[-150000,'-15万'],[99999999,'1亿']])assert.equal(formatMoney(n),expected);
 assert.equal(formatMoney(undefined),'—');assert.equal(formatMoney(25000,{currency:true}),'2.5万 星元');
 assert.match(moneyData(12345678),/value="12345678"/);
});
test('排序按原始数值，缺失值始终最后，同值保持稳定，位置按球场顺序',()=>{
 const ps=[generatePlayer({id:'a',position:'ST',age:30}),generatePlayer({id:'b',position:'GK',age:18}),generatePlayer({id:'c',position:'CB',age:30})];
 assert.deepEqual(sortPlayers(ps,{key:'position',direction:'asc'}).map(p=>p.id),['b','c','a']);
 assert.deepEqual(sortPlayers(ps,{key:'age',direction:'desc'}).map(p=>p.id),['a','c','b']);
 const wages={a:100000001,b:99999999,c:null};
 assert.deepEqual(sortPlayers(ps,{key:'wage',direction:'desc',wage:p=>wages[p.id]}).map(p=>p.id),['a','b','c']);
 assert.ok(compareValues(null,0,'desc')>0);assert.ok(compareValues(90,200,'asc')<0);
 const cell=text=>({dataset:{},querySelector:()=>null,textContent:text});
 assert.equal(cellValue(cell('1.5亿 星元')),150000000);assert.equal(cellValue(cell('900万')),9000000);
});
