import {seasonCalendar} from '../src/competitions/calendar.js';
import {seasonGoal} from '../src/competitions/career.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createSeason,seasonTeam,validateSave,matchInput,commitResult} from '../src/competitions/runtime.js';
import {populationPlayer,clubPlayers,annualPopulation,setPlayerClub,currentAbility} from '../src/competitions/population.js';
import {ensureEconomy,availableBudget,transferQuote,signPlayer,renewPlayer,renewalQuote,releasePlayer,releaseQuote,saleOffers,advanceCareer,accrueEconomy,rolloverEconomy,validateEconomy,isTransferWindow,promoteProfessional,wageBill,weeklyWage} from '../src/competitions/market.js';
const clone=x=>JSON.parse(JSON.stringify(x)),digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function target(s,club='sky'){for(const p of Object.values(s.population.players)){try{return transferQuote(s,p.id,club);}catch{}}throw Error('no eligible transfer target');}

test('初始合同和预算确定性，旧档按当前日期迁移，财务账本可验证',()=>{
 const s=createSeason(),again=createSeason();assert.equal(digest(s.economy),digest(again.economy));validateEconomy(s);
 const old=clone(s);delete old.economy;old.date='0318-07-01';ensureEconomy(old);assert.equal(old.economy.through,old.date);assert.equal(Object.values(old.economy.accounts).reduce((n,a)=>n+a.totals.wages,0),0);
 const before=digest(s);for(let i=0;i<2;i++)availableBudget(s,'sky');assert.equal(digest(s),before);validateSave(clone(s));
});
test('转会一次性更新归属、双方资金、工资和正式比赛输入，重复签约不扣款',()=>{
 const s=createSeason();s.manager={clubId:'sky'};const q=target(s),p=populationPlayer(s,q.player),seller=p.club,buyerBefore=s.economy.accounts.sky.cash,sellerBefore=s.economy.accounts[seller].cash;
 const beforeRoster=clubPlayers(s,'sky').length;signPlayer(s,p.id);assert.equal(p.club,'sky');assert.equal(s.economy.contracts[p.id].club,'sky');assert.equal(s.economy.accounts.sky.cash,buyerBefore-q.fee-q.bonus);assert.equal(s.economy.accounts[seller].cash,sellerBefore+q.fee);
 assert.ok(!seasonTeam(s,seller).roster.some(x=>x.id===p.id));assert.equal(seasonTeam(s,'sky').roster.length,beforeRoster+1);assert.ok(seasonTeam(s,'sky').roster.some(x=>x.id===p.id));validateEconomy(s);
 const saved=digest(s);assert.throws(()=>signPlayer(s,p.id));assert.equal(digest(s),saved);const restored=validateSave(clone(s));assert.equal(digest(restored.economy),digest(s.economy));
 const fixture=s.fixtures.find(m=>m.home==='sky'&&!m.bye);assert.ok(matchInput(s,fixture).home.roster.some(x=>x.id===p.id));
});
test('窗口、预算和用户出售授权在写入前检查，失败保持原档',()=>{
 const s=createSeason();s.manager={clubId:'sky'};const q=target(s);s.date='0318-05-01';s.economy.through=s.date;assert.equal(isTransferWindow(s),false);let before=digest(s);assert.throws(()=>signPlayer(s,q.player),/窗口/);assert.equal(digest(s),before);
 s.date='0318-01-01';s.economy.through=s.date;s.economy.accounts.sky.cash=0;before=digest(s);assert.throws(()=>signPlayer(s,q.player),/资金/);assert.equal(digest(s),before);
 const own=clubPlayers(s,'sky').find(p=>p.position==='CM');assert.throws(()=>signPlayer(s,own.id,'closed-club-3',3,{automatic:true}),/经理|俱乐部/);
});
test('经理可接受明确买方报价；续约与解约保留交易记录和精确补偿',()=>{
 const s=createSeason();s.manager={clubId:'sky'};const own=clubPlayers(s,'sky').find(p=>p.position==='CM'),offers=saleOffers(s,own.id);assert.ok(offers.length);
 const offer=offers[0];signPlayer(s,own.id,offer.to,3,{sellerApproved:true});assert.equal(own.club,offer.to);assert.equal(s.economy.moves.at(-1).from,'sky');
 const p=clubPlayers(s,'sky').find(p=>p.position==='CM'),q=renewalQuote(s,p.id,3);renewPlayer(s,p.id,3);assert.equal(s.economy.contracts[p.id].end,q.end);assert.equal(s.economy.contracts[p.id].weeklyWage,q.weeklyWage);
 const youth=clubPlayers(s,'sky',{unit:'youth'})[0],release=releaseQuote(s,youth.id),cash=s.economy.accounts.sky.cash;releasePlayer(s,youth.id);assert.equal(youth.club,null);assert.equal(youth.unit,'free');assert.equal(s.economy.accounts.sky.cash,cash-release.compensation);assert.equal(s.economy.contracts[youth.id],undefined);validateEconomy(s);
});
test('青年升队签职业合同并检查预算，旧成长计划继续跟随本人',()=>{
 const s=createSeason();s.manager={clubId:'sky'};const p=clubPlayers(s,'sky',{unit:'youth'}).find(p=>318-p.birthYear>=16);s.development.plans[p.id]={focus:'technical',load:.6};promoteProfessional(s,p.id);assert.equal(p.unit,'senior');assert.equal(s.economy.contracts[p.id].kind,'senior');assert.ok(s.economy.contracts[p.id].weeklyWage>140);assert.equal(s.development.plans[p.id].focus,'technical');validateEconomy(s);
});
test('分段日历、整段日历和 JSON 恢复的 AI 交易、工资与成长完全相同',()=>{
 const s=createSeason();s.manager={clubId:'sky'};const split=clone(s),originalUser=clubPlayers(s,'sky').map(p=>p.id);advanceCareer(s,'0318-02-01');s.date='0318-02-01';
 for(const d of ['0318-01-04','0318-01-08','0318-01-14','0318-01-21','0318-02-01']){advanceCareer(split,d);split.date=d;}
 assert.equal(digest(split),digest(s));assert.deepEqual(clubPlayers(s,'sky').map(p=>p.id),originalUser);assert.ok(s.economy.moves.some(m=>m.type==='transfer'));assert.ok(s.economy.accounts.sky.totals.wages>0);validateSave(clone(s));
 const saved=digest(s);advanceCareer(s,s.date);assert.equal(digest(s),saved);
});
test('跨年合同到期进入自由市场，AI 续约和新资金只结算一次',()=>{
 const s=createSeason();s.manager={clubId:'sky'};const p=clubPlayers(s,'sky').find(p=>p.position==='CM'&&318-p.birthYear<30);s.economy.contracts[p.id].end='0318-12-31';
 accrueEconomy(s,'0319-01-01');s.year=319;s.date='0319-01-01';s.calendar=seasonCalendar(s.year);annualPopulation(s);rolloverEconomy(s);assert.equal(p.club,null);assert.equal(p.unit,'free');assert.ok(s.economy.moves.some(m=>m.player===p.id&&m.type==='expiry'));assert.ok(s.economy.accounts.sky.totals.funding>0);validateEconomy(s);
 const before=digest(s);rolloverEconomy(s);assert.equal(digest(s),before);
});
test('损坏账本、合同归属和重复交易记录被拒绝',()=>{
 const s=createSeason();s.manager={clubId:'sky'};signPlayer(s,target(s).player);for(const corrupt of [s=>s.economy.accounts.sky.cash++,s=>s.economy.contracts[clubPlayers(s,'sky')[0].id].club='silver-fc',s=>s.economy.accounts.sky.totals.wages=-1,s=>s.economy.moves.push(s.economy.moves[0]),s=>s.economy.moves[0].fee++]){const broken=clone(s);corrupt(broken);assert.throws(()=>validateSave(broken));}
});

test('已续约青年满二十一岁仍保留有效合同，实际到期后才释放',()=>{
 let s=createSeason();s.manager={clubId:'sky'};const p=clubPlayers(s,'sky',{unit:'youth'})[0],id=p.id;
 p.birthYear=298;s.economy.contracts[id].end='0318-12-31';renewPlayer(s,id,3);
 assert.equal(s.economy.contracts[id].end,'0320-12-31');
 for(const year of [319,320,321]){
  const date=`${String(year).padStart(4,'0')}-01-01`;accrueEconomy(s,date);s.year=year;s.date=date;s.calendar=seasonCalendar(year);annualPopulation(s);rolloverEconomy(s);
  const current=populationPlayer(s,id);
  if(year<=320){assert.equal(current.club,'sky');assert.equal(current.unit,'youth');assert.equal(s.economy.contracts[id].end,'0320-12-31');assert.ok(clubPlayers(s,'sky',{unit:'youth'}).some(q=>q.id===id));}
  else{assert.equal(current.club,null);assert.equal(current.unit,'free');assert.equal(s.economy.contracts[id],undefined);}
  validateEconomy(s);const restored=validateSave(clone(s));assert.equal(digest(restored),digest(s));s=restored;
 }
});

test('合同到期导致一线队不足十一人时仍能进入经理页面和重建阵容',()=>{
 const s=createSeason();s.manager={clubId:'sky'};for(const p of clubPlayers(s,'sky'))s.economy.contracts[p.id].end='0318-12-31';accrueEconomy(s,'0319-01-01');s.year=319;s.date='0319-01-01';s.calendar=seasonCalendar(s.year);annualPopulation(s);rolloverEconomy(s);assert.equal(clubPlayers(s,'sky').length,0);assert.ok(Number.isFinite(seasonGoal(s).target));const q=target(s);signPlayer(s,q.player);assert.equal(clubPlayers(s,'sky').length,1);validateEconomy(s);
});

test('同日到期的工资先解除承诺，再按门将和位置深度分配续约预算',()=>{
 const s=createSeason();for(const p of clubPlayers(s,'silver-fc'))s.economy.contracts[p.id].end='0318-12-31';accrueEconomy(s,'0319-01-01');s.year=319;s.date='0319-01-01';s.calendar=seasonCalendar(s.year);annualPopulation(s);rolloverEconomy(s);const roster=clubPlayers(s,'silver-fc');assert.ok(roster.length>=18);assert.ok(roster.filter(p=>p.position==='GK').length>=2);validateEconomy(s);
});


test('自由球员跨联赛签约仍执行剩余联赛停赛，杯赛纪律独立保留',()=>{
 const s=createSeason();s.manager={clubId:'sky'};const p=clubPlayers(s,'sky').find(p=>p.position==='CM');s.economy.contracts[p.id].end='0318-12-31';
 s.discipline[`closed/${p.id}`]={yellow:4,ban:2};s.discipline[`global-cup/${p.id}`]={yellow:1,ban:1};releasePlayer(s,p.id);
 let quote;for(const club of Object.values(s.members).flat().filter(id=>!s.members.closed.includes(id))){try{quote=transferQuote(s,p.id,club);break;}catch{}}
 assert.ok(quote);signPlayer(s,p.id,quote.to,3,{automatic:true});const division=Object.keys(s.members).find(d=>s.members[d].includes(quote.to));assert.deepEqual(s.discipline[`${division}/${p.id}`],{yellow:0,ban:2});assert.equal(s.discipline[`closed/${p.id}`],undefined);assert.deepEqual(s.discipline[`global-cup/${p.id}`],{yellow:1,ban:1});assert.equal(seasonTeam(s,quote.to).roster.find(q=>q.id===p.id).suspended,2);validateEconomy(s);
});
test('拨款覆盖固定工资容量而不随当前工资滚动膨胀，升降级按级别缩放',()=>{
 const s=createSeason();for(const a of Object.values(s.economy.accounts))assert.equal(a.funding,a.wageLimit*72);
 const club=s.members['lima-league-3'][0],other=s.members['lima-league-2'][0],before=s.economy.accounts[club].wageLimit;
 s.members['lima-league-3'][0]=other;s.members['lima-league-2'][0]=club;accrueEconomy(s,'0319-01-01');s.year=319;s.date='0319-01-01';s.calendar=seasonCalendar(s.year);annualPopulation(s);rolloverEconomy(s);
 const a=s.economy.accounts[club];assert.ok(a.wageLimit>before);assert.equal(a.funding,a.wageLimit*72);assert.equal(a.baseWageLimit,before);validateEconomy(s);
});
test('AI 一线队已有二十七人时仍优先补缺失门将',()=>{
 const s=createSeason(),club='sky',roster=clubPlayers(s,club),keepers=roster.filter(p=>p.position==='GK');
 for(const p of keepers){setPlayerClub(s,p,null);p.unit='free';delete s.economy.contracts[p.id];}
 for(const p of clubPlayers(s,club,{unit:'youth'})){if(clubPlayers(s,club).length>=27)break;p.unit='senior';}
 // Fill a deliberately unbalanced roster using real existing reserve identities.
 for(const team of Object.values(s.members).flat()){for(const p of clubPlayers(s,team)){if(clubPlayers(s,club).length>=27)break;if(team!==club&&p.position!=='GK'){setPlayerClub(s,p,club);s.economy.contracts[p.id].club=club;}}if(clubPlayers(s,club).length>=27)break;}
 s.economy.accounts[club].wageLimit*=2;assert.equal(clubPlayers(s,club).length,27);advanceCareer(s,'0318-01-08');assert.ok(clubPlayers(s,club).some(p=>p.position==='GK'));validateEconomy(s);
});

test('引援预算预筛不改变完整交易结果：新档、自由球员与紧张工资额度',async()=>{
 const fs=await import('node:fs');const source=fs.readFileSync('artifacts/engine-evolution/v16-market-before-prefilter.txt','utf8').replace(/from '([^']+)'/g,(_,url)=>`from '${new URL(url,new URL('../src/competitions/market.js',import.meta.url)).href}'`);
 const old=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
 const optimizedSource=fs.readFileSync('artifacts/engine-evolution/v16-market-before-renewal-reserve.txt','utf8').replace(/from '([^']+)'/g,(_,url)=>`from '${new URL(url,new URL('../src/competitions/market.js',import.meta.url)).href}'`);const optimized=await import(`data:text/javascript;base64,${Buffer.from(optimizedSource).toString('base64')}`);
 for(const tight of [false,true]){const s=createSeason();if(tight){let i=0;for(const club of Object.values(s.members).flat()){const p=clubPlayers(s,club).find(p=>p.position==='CM');setPlayerClub(s,p,null);p.unit='free';delete s.economy.contracts[p.id];s.economy.accounts[club].wageLimit=Object.values(s.economy.contracts).filter(c=>c.club===club).reduce((n,c)=>n+c.weeklyWage,0)+(i++%4)*350;}}
  const previous=clone(s);old.advanceCareer(previous,'0318-01-22');optimized.advanceCareer(s,'0318-01-22');assert.equal(digest(s),digest(previous));validateEconomy(s);
 }
});


test('AI 续约为未填满的一线队预留工资，避免有现金却无法补员',()=>{
 const s=createSeason(),club='crown-league-3-club-3';for(const p of clubPlayers(s,club).slice(-7)){setPlayerClub(s,p,null);p.unit='free';delete s.economy.contracts[p.id];}
 const p=clubPlayers(s,club).find(p=>p.position==='CM'),before=s.economy.contracts[p.id].weeklyWage;
 s.economy.accounts[club].wageLimit=wageBill(s,club)+Math.ceil(before*.1/7)*7;
 assert.doesNotThrow(()=>renewalQuote(s,p.id));const hashBefore=digest(s);assert.throws(()=>renewPlayer(s,p.id,3,{automatic:true}),/预算/);assert.equal(digest(s),hashBefore);
 s.economy.accounts[club].wageLimit+=3000;renewPlayer(s,p.id,3,{automatic:true});assert.ok(s.economy.accounts[club].wageLimit-wageBill(s,club)>2000);validateEconomy(s);
});


test('合同到期后定期补查青年队，关闭转会窗口也能在预算内提拔现有球员',()=>{
 const s=createSeason(),club='crown-league-3-club-3';s.date='0318-05-01';s.economy.through=s.date;s.economy.nextReview='0318-05-08';s.development={...s.development,since:s.date,through:s.date,nextWeek:'0318-05-08'};
 const academy=clubPlayers(s,club,{unit:'youth'}).filter(p=>318-p.birthYear>=16),ids=new Set(academy.map(p=>p.id));assert.ok(ids.size>0);
 for(const p of clubPlayers(s,club).slice(-8)){setPlayerClub(s,p,null);p.unit='free';delete s.economy.contracts[p.id];}
 const count=clubPlayers(s,club).length;advanceCareer(s,'0318-05-08');assert.ok(clubPlayers(s,club).length>count);assert.ok(clubPlayers(s,club).some(p=>ids.has(p.id)));assert.ok(s.economy.moves.some(m=>m.type==='professional'&&ids.has(m.player)));assert.equal(s.economy.moves.filter(m=>m.type==='transfer').length,0);validateEconomy(s);
});


test('青年提拔先填门将缺口，外场球员不能先占用最后的可用工资',()=>{
 const s=createSeason();let club,keeper,field;
 for(const id of Object.values(s.members).flat()){const youth=clubPlayers(s,id,{unit:'youth'}),gk=youth.find(p=>p.position==='GK'&&318-p.birthYear>=16&&weeklyWage(s,p)>210),out=gk&&youth.find(p=>p.position!=='GK'&&318-p.birthYear>=16&&currentAbility(s,p)>currentAbility(s,gk));if(gk&&out&&clubPlayers(s,id).length===25){club=id;keeper=gk;field=out;break;}}
 assert.ok(club);for(const p of clubPlayers(s,club).filter(p=>p.position==='GK')){setPlayerClub(s,p,null);p.unit='free';delete s.economy.contracts[p.id];}
 for(const p of clubPlayers(s,club,{unit:'youth'}))if(p.id!==keeper.id&&p.id!==field.id)p.birthYear=303;
 s.economy.accounts[club].wageLimit=wageBill(s,club)+(weeklyWage(s,keeper)-140)+(weeklyWage(s,field)-140)-7;
 s.date='0318-05-01';s.economy.through=s.date;s.economy.nextReview='0318-05-08';s.development={...s.development,since:s.date,through:s.date,nextWeek:'0318-05-08'};
 advanceCareer(s,'0318-05-08');assert.equal(keeper.unit,'senior');assert.ok(wageBill(s,club)<=s.economy.accounts[club].wageLimit);validateEconomy(s);
});
