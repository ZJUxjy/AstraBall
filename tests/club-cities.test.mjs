import test from 'node:test';
import assert from 'node:assert/strict';
import {clubs,cities,provinces,regions} from '../src/world.js';
import {completeClubs} from '../src/competitions/clubs.js';
import {clubProfile} from '../src/competitions/club-profiles.js';
import {leagueSystems} from '../src/competitions/catalog.js';
import {footballTeams} from '../src/football/data.js';
import {preciseRating} from '../src/football/players.js';
import {createSeason,validateSave} from '../src/competitions/runtime.js';
import {ensureEconomy,validateEconomy,wageBill} from '../src/competitions/market.js';

test('217 家俱乐部覆盖全部城市，保持赛区、席位、已有归属及可重复性',()=>{
 assert.equal(clubs.length,217);assert.equal(new Set(clubs.map(c=>c.city)).size,cities.length);
 for(const league of leagueSystems)for(const division of league.levels){const local=clubs.filter(c=>c.division===division.id);assert.equal(local.length,division.teams);assert.ok(local.every(c=>cities.find(t=>t.id===c.city).region===league.region));}
 const anchors=clubs.filter(c=>!c.generated);assert.equal(anchors.length,10);
 assert.deepEqual(anchors.map(c=>[c.id,c.city]),[['sky','crown-city'],['silver-fc','silver-city'],['crown-fc','crown-city'],['bay-fc','silver-city'],['bridge','jiangqiao'],['rong-fc','rong-city'],['harbor','haimen'],['isles-fc','isle-city'],['iron-fc','iron-city'],['pine-fc','pine']]);
 assert.deepEqual(completeClubs(anchors,[...cities].reverse(),[...provinces].reverse()),clubs);
});
test('大都会按人口密度明显领先，城市核心容纳更多球队且同城共享市场',()=>{
 const density=r=>clubs.filter(c=>cities.find(t=>t.id===c.city).region===r.id).length/r.population;
 assert.ok(regions.filter(r=>r.id!=='metro').every(r=>density(regions[0])>density(r)*5));
 const count=id=>clubs.filter(c=>c.city===id).length;
 assert.ok(count('crown-city')>count('greenfield'));assert.ok(count('silver-city')>count('cedar-city'));
 for(const c of clubs){assert.equal(c.market.clubs,count(c.city));assert.ok(c.market.support>0);}
});
test('初始商业、实力和合同同源，全部球队具有完整位置且新存档账目有效',()=>{
 const s=createSeason();ensureEconomy(s);validateSave(s);validateEconomy(s);
 const rich=clubs.filter(c=>c.league==='closed').sort((a,b)=>clubProfile(b.id).reach-clubProfile(a.id).reach);
 assert.ok(clubProfile(rich[0].id).initialQuality>clubProfile(rich.at(-1).id).initialQuality);
 for(const c of clubs){const a=s.economy.accounts[c.id],t=footballTeams.find(t=>t.id===c.id);assert.equal(a.business.reach,clubProfile(c.id).reach);assert.equal(a.reputation,clubProfile(c.id).initialReputation);assert.ok(a.cash>0);assert.ok(wageBill(s,c.id)*52<a.operatingRevenueBudget*.8);assert.ok(t.roster.length>=25&&t.roster.length<=30);assert.equal(t.roster.filter(p=>p.position==='GK').length,3);assert.ok(t.roster.every(p=>Number.isFinite(preciseRating(p))));}
});
