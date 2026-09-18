import test from 'node:test';
import assert from 'node:assert/strict';
import {createSeason,playFixture,validateSave} from '../src/competitions/runtime.js';
import {ensureEconomy} from '../src/competitions/market.js';
import {settleFinanceSeason} from '../src/competitions/finance.js';
import {localClubs} from '../src/competitions/local-catalog.js';
import {advanceWorld,rollWorld,validateWorld} from '../src/competitions/local-football.js';
import {initialLocalReputation,matchReputation,moveReputation,worldClubRanking,clampReputation,REPUTATION_MIN,REPUTATION_MAX,REPUTATION_SCALE_VERSION} from '../src/competitions/reputation.js';
import {rankingContent} from '../src/competitions/ranking-ui.js';
import {addDays} from '../src/competitions/calendar.js';
const fresh=()=>{const s=createSeason({worldModel:true});ensureEconomy(s);return s;};
const fake=input=>({status:'finished',score:input.knockout?[1,0]:[0,0],teams:[input.home,input.away].map(t=>({id:t.id,stats:{yellow:0,red:0},players:[]})),events:[],seconds:5400});
function localAdvance(s,date){s.date=date;s.economy.through=date;s.economy.nextReview=addDays(date,7);advanceWorld(s,date);}

test('全部俱乐部都有声望；地方初始声望按层级递减',()=>{
 const s=fresh(),w=s.economy.world;
 for(const c of Object.values(w.clubs))assert.ok(Number.isFinite(c.reputation)&&c.reputation>=REPUTATION_MIN&&c.reputation<=REPUTATION_MAX);
 const byTier=t=>localClubs.filter(c=>c.tier===t).map(c=>initialLocalReputation(c.id,c.tier));
 assert.ok(Math.min(...byTier('professional'))>Math.max(...byTier('semi')));
 assert.ok(Math.min(...byTier('semi'))>Math.max(...byTier('amateur')));
 const rows=worldClubRanking(s);
 assert.equal(rows.length,3241);
 assert.ok(rows.every((r,i)=>!i||rows[i-1].reputation>=r.reputation));
 assert.equal(rows[0].level,'core');assert.ok(rows[0].reputation>=9000);
 assert.equal(rows.filter(r=>r.reputation>9000).length,3,'初始只有皇室俱乐部声望超过 9000');
 assert.match(rankingContent(s),/世界俱乐部排名/);assert.match(rankingContent(s,{level:'amateur'}),/城市业余/);
});

test('胜负交换声望：弱者爆冷收益更大，总量守恒且受边界约束',()=>{
 const [h1,a1]=matchReputation(5000,5000,1);assert.equal(h1-5000,-(a1-5000));assert.ok(h1>5000);
 const [h2,a2]=matchReputation(2000,8000,1),[h3,a3]=matchReputation(8000,2000,1);
 assert.ok(h2-2000>h3-8000,'爆冷击败强队应比强队获胜涨得更多');
 const [h4,a4]=matchReputation(7000,3000,.5);assert.ok(h4<7000&&a4>3000,'平局使声望向中间靠拢');
 assert.equal(matchReputation(9900,9900,1)[0]<=REPUTATION_MAX,true);
 assert.equal(matchReputation(60,60,0)[0]>=REPUTATION_MIN,true);
 assert.equal(moveReputation(5000,'up'),5400);assert.equal(moveReputation(5000,'down'),4600);
 assert.equal(moveReputation(9800,'up'),REPUTATION_MAX);assert.equal(clampReputation(20000),REPUTATION_MAX);
});

test('地方比赛逐场改变声望，升降级一次性增减',()=>{
 const s=fresh(),w=s.economy.world;localAdvance(s,'0319-01-01');
 const played=new Set(w.fixtures.slice(0,w.fixtureCursor).flatMap(m=>[m.home,m.away]));
 assert.ok(played.size>0);
 assert.ok([...played].some(id=>w.clubs[id].reputation!==initialLocalReputation(id)));
 const before=Object.fromEntries(Object.values(w.clubs).map(c=>[c.id,c.reputation]));
 s.year=319;rollWorld(s);
 const expected=new Map();
 for(const m of w.history[0].movements){
  const moves=m.type==='promotion'?[[m.up,'up'],[m.down,'down']]:m.type==='vacancy-promotion'?[[m.id,'up']]:m.type==='replacement'?[[m.to,'up']]:[];
  for(const [id,kind] of moves)if(id&&before[id]!==undefined)expected.set(id,moveReputation(expected.get(id)??before[id],kind));
 }
 assert.ok(expected.size>0);
 for(const [id,v] of expected)assert.equal(w.clubs[id].reputation,v);
 validateWorld(s);
});

test('职业比赛结果改变双方声望，赛季升降级在财政结算中生效',()=>{
 const s=createSeason();ensureEconomy(s);
 const m=s.fixtures.find(m=>!m.bye),[rh,ra]=[s.economy.accounts[m.home].reputation,s.economy.accounts[m.away].reputation];
 playFixture(s,m.id,fake);
 const [nh,na]=[s.economy.accounts[m.home].reputation,s.economy.accounts[m.away].reputation];
 if(rh===ra){assert.equal(nh,rh);assert.equal(na,ra);}
 else{const [ns,nw,rs,rw]=rh>ra?[nh,na,rh,ra]:[na,nh,ra,rh];assert.ok(ns<rs&&nw>rw,'强队被弱队逼平声望下降，弱队上升');assert.ok(Math.abs(ns-rs+nw-rw)<.01,'声望交换总量守恒');}
 const up=s.members['liberlin-league-2'][0],down=s.members['liberlin-league'][0];
 s.summary={tables:{},champions:[],movements:[{id:up,from:'liberlin-league-2',to:'liberlin-league',kind:'up'},{id:down,from:'liberlin-league',to:'liberlin-league-2',kind:'down'}]};
 const [bu,bd]=[s.economy.accounts[up].reputation,s.economy.accounts[down].reputation];
 settleFinanceSeason(s);
 assert.equal(s.economy.accounts[up].reputation,moveReputation(bu,'up'));
 assert.equal(s.economy.accounts[down].reputation,moveReputation(bd,'down'));
 validateSave(s);
});

test('旧量表存档读取时迁移到 50—9999，只执行一次',()=>{
 const s=fresh(),e=s.economy;
 delete e.reputationScale;e.accounts.sky.reputation=86;
 const local=Object.values(e.world.clubs).find(c=>c.tier==='professional');local.reputation=30;
 ensureEconomy(s);
 assert.ok(e.accounts.sky.reputation>8000&&e.accounts.sky.reputation<9000);
 assert.ok(local.reputation>2000);assert.equal(e.reputationScale,REPUTATION_SCALE_VERSION);
 const after=e.accounts.sky.reputation;ensureEconomy(s);assert.equal(e.accounts.sky.reputation,after);
 validateSave(s);
});
