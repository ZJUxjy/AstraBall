import test from 'node:test';
import assert from 'node:assert/strict';
import {navigationModel} from '../src/navigation.js';

test('every primary destination resolves to one unique navigation entry',()=>{
 const model=navigationModel();
 const items=model.groups.flatMap(g=>g.items);
 assert.equal(new Set(items.map(i=>i.id)).size,items.length);
 assert.equal(new Set(items.map(i=>i.path)).size,items.length);
 for(const item of items) assert.equal(navigationModel(item.path).active,item.id);
 assert.ok(!items.some(i=>i.path.startsWith('player/')));
});
test('club navigation follows the managed club rather than the inspected player or opponent',()=>{
 const model=navigationModel('squad/away/overview',{clubId:'home'});
 const club=model.groups.find(g=>g.id==='club');
 assert.equal(club.items.find(i=>i.id==='club').path,'squad/home/overview');
 assert.equal(club.items.find(i=>i.id==='squad').path,'squad/home');
 assert.equal(model.active,'club');
 assert.equal(navigationModel('squad/away/person',{clubId:'home'}).active,'squad');
});
test('detail and game routes keep their parent context without selecting an unrelated player',()=>{
 assert.equal(navigationModel('friendly/sky').active,'squad');
 assert.equal(navigationModel('coach').active,'match');
 assert.equal(navigationModel('match/calendar/closed/sky').active,'match');
 assert.equal(navigationModel('leagues/closed/1/rules').active,'leagues');
 assert.equal(navigationModel('player/lin/place/province/yunmin').active,null);
 assert.equal(navigationModel('player/lin').title,'球员档案');
});
