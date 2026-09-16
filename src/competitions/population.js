import {footballTeams} from '../football/data.js';
import {YEAR,cities,provinces} from '../world.js';
import {generateYouthPlayer,preciseRating,POSITIONS,ATTRIBUTE_KEYS} from '../football/players.js';
import {rng,hash,clamp} from '../football/random.js';
import {getDivision} from './catalog.js';
const originals=footballTeams.flatMap(t=>t.roster),originalById=new Map(originals.map(p=>[p.id,p]));
const teamById=new Map(footballTeams.map(t=>[t.id,t]));
export const populationPlayers=(s,{retired=false}={})=>(s.population?Object.values(s.population.players):originals).filter(p=>retired||!p.retired);
export const populationPlayer=(s,id)=>s.population?s.population.players[id]:originalById.get(id);
// Indexes contain references to canonical records and are rebuilt after JSON/structured cloning.
// Membership changes must use setPlayerClub; promotion/retirement are filtered from live records.
const rosterIndexes=new WeakMap();
function indexPopulation(pop){let index=rosterIndexes.get(pop);if(!index){index=new Map();index.order=new Map();for(const p of Object.values(pop.players)){index.order.set(p.id,index.order.size);const list=index.get(p.club)||[];list.push(p);index.set(p.club,list);}rosterIndexes.set(pop,index);}return index;}
export function setPlayerClub(s,p,club){
 const pop=ensurePopulation(s);if(pop.players[p.id]!==p||club&&!teamById.has(club))throw Error('球员归属无效');
 p.club=club;const index=rosterIndexes.get(pop);if(index){const list=index.get(club)||[];if(!list.includes(p))list.push(p);index.set(club,list);}
}
function registerPlayer(pop,p){if(pop.players[p.id])throw Error('球员身份重复');pop.players[p.id]=p;const index=rosterIndexes.get(pop);if(index){index.order.set(p.id,index.order.size);const list=index.get(p.club)||[];list.push(p);index.set(p.club,list);}}
export function clubPlayers(s,club,{unit='senior'}={}){
 const index=s.population&&indexPopulation(s.population),list=index?index.get(club)||[]:teamById.get(club)?.roster||[];
 const selected=list.filter(p=>p.club===club&&!p.retired&&(unit==='all'||(p.unit||'senior')===unit));
 return index?selected.sort((a,b)=>index.order.get(a.id)-index.order.get(b.id)):selected;
}
export function createPopulation(year=YEAR){
 const pop={version:1,processedYear:year,players:Object.fromEntries(originals.map(p=>[p.id,{...JSON.parse(JSON.stringify(p)),birthYear:YEAR-p.age,unit:'senior',joinedYear:YEAR,registeredAt:`${String(year).padStart(4,'0')}-01-01`,retirementAge:(p.position==='GK'?37:34)+hash(`retire:${p.id}`)%5}])),events:[]};
 for(const team of footballTeams)addIntake(pop,team,year,getDivision(team.division).tier,`${String(year).padStart(4,'0')}-01-01`,team.roster);
 return pop;
}
export const ensurePopulation=s=>s.population??=createPopulation(s.year);
export function currentAbility(s,p){return preciseRating({...p,attributes:s.development?.records[p.id]?.attributes||p.attributes});}
function event(pop,year,type,p,club,extra={}){pop.events.push({id:`${year}:${type}:${p.id}`,year,type,player:p.id,club,...extra});}
function numberPlayer(s,p){const used=new Set(clubPlayers(s,p.club,{unit:'all'}).filter(q=>q.id!==p.id).map(p=>p.number));let number=1;while(used.has(number))number++;p.number=number;}
export function promotePlayer(s,id,{automatic=false}={}){
 const pop=ensurePopulation(s),p=pop.players[id];
 if(!p||p.retired||p.unit!=='youth')throw Error('球员不在青年队');
 if(!automatic&&(!s.manager||s.manager.clubId!==p.club))throw Error('只能提拔本队球员');
 if(s.activeMatch)throw Error('请在比赛结束后调整名单');
 if(s.year-p.birthYear<16)throw Error('球员须满 16 岁');
 if(clubPlayers(s,p.club).length>=30)throw Error('一线队已满 30 人');
 p.unit='senior';p.promotedYear=s.year;numberPlayer(s,p);event(pop,s.year,'promotion',p,p.club);s.revision++;
 return p;
}
const intakePositions=['GK','CB','CM','ST','LB','LW','DM','CB','RB','RW','AM','CM'];
function addIntake(pop,team,year,tier,date,roster){
  const usedNumbers=new Set(roster.map(p=>p.number));
  const random=rng(`intake:${team.id}:${year}`),count=4+(random.next()<.5?1:0);
  const region=provinces.find(p=>p.id===cities.find(c=>c.id===team.city).province).region;
  // Fixed tier talent distribution. No copying retirees or inflating ceilings from current world CA.
  const median=team.league==='closed'?86:82-(tier-1)*8;
  for(let i=0;i<count;i++){
   const id=`youth:${year}:${team.id}:${i}`,position=intakePositions[(hash(team.id)+(year-YEAR)*5+i)%intakePositions.length];
   const potential=Math.round(clamp(median+random.normal()*8+(random.next()<.025?8:0),45,96));
   const age=random.int(15,17),p=generateYouthPlayer({id,seed:`intake:${year}`,age,potential,position,region,identity:{club:team.id,city:team.city}});
   Object.assign(p,{birthYear:year-age,unit:'youth',joinedYear:year,intakeYear:year,registeredAt:date,retirementAge:(position==='GK'?37:34)+hash(`retire:${id}`)%5});let number=1;while(usedNumbers.has(number))number++;p.number=number;usedNumbers.add(number);registerPlayer(pop,p);event(pop,year,'intake',p,team.id);
  }
 return count;
}
export function annualPopulation(s){
 if(s.activeMatch)throw Error('请先完成比赛再结算人员');
 const pop=ensurePopulation(s);if(pop.processedYear>=s.year)return {intake:0,retired:0,promoted:0,released:0};
 if(pop.processedYear!==s.year-1)throw Error('人员年份不能跳过');
 const result={intake:0,retired:0,promoted:0,released:0};
 for(const p of Object.values(pop.players))if(!p.retired&&s.year-p.birthYear>=p.retirementAge){
  const club=p.club;p.retired=true;p.lastClub=club||p.lastClub;p.club=null;p.unit='retired';p.retiredYear=s.year;p.retiredDate=s.date;event(pop,s.year,'retirement',p,club);result.retired++;
 }
 for(const team of footballTeams){
  const division=Object.keys(s.members).find(d=>s.members[d].includes(team.id)),tier=getDivision(division).tier;
  result.intake+=addIntake(pop,team,s.year,tier,s.date,clubPlayers(s,team.id,{unit:'all'}));
  const youths=clubPlayers(s,team.id,{unit:'youth'}).sort((a,b)=>currentAbility(s,b)-currentAbility(s,a)||a.id.localeCompare(b.id));
  for(const p of youths){
   const age=s.year-p.birthYear,senior=clubPlayers(s,team.id),peers=senior.filter(q=>q.position===p.position),best=Math.max(0,...peers.map(q=>currentAbility(s,q)));
   const needed=senior.length<23||peers.length<(p.position==='GK'?3:1);
   // Financial careers defer promotion until contract expiry has been settled,
   // then use payroll-checked reviews in market.js.
   if(!s.economy&&team.id!==s.manager?.clubId&&age>=16&&senior.length<30&&(needed||age>=18&&currentAbility(s,p)>=best-6)){
    promotePlayer(s,p.id,{automatic:true});result.promoted++;
   }else if(age>=21){
    p.lastClub=p.club;p.club=null;p.unit='free';event(pop,s.year,'release',p,team.id);result.released++;
   }
  }
 }
 pop.processedYear=s.year;s.revision++;return result;
}
export function validatePopulation(pop){
 if(!pop)return;
 if(pop.version!==1||!Number.isInteger(pop.processedYear)||pop.processedYear<YEAR||!pop.players||!Array.isArray(pop.events))throw Error('人员存档无效');
 if(new Set(pop.events.map(e=>e.id)).size!==pop.events.length||pop.events.some(e=>!pop.players[e.player]||!Number.isInteger(e.year)||e.year>pop.processedYear||!['intake','promotion','retirement','release'].includes(e.type)))throw Error('人员事件无效');
 for(const [id,p] of Object.entries(pop.players)){
  if(id!==p.id||!POSITIONS[p.position]||!Number.isInteger(p.birthYear)||p.birthYear>pop.processedYear-15||p.birthYear<YEAR-60||!Number.isFinite(p.potential)||p.potential<1||p.potential>99||!Number.isInteger(p.retirementAge)||p.retirementAge<30||p.retirementAge>45||!['senior','youth','free','retired'].includes(p.unit)||p.club&&!teamById.has(p.club)||p.retired!==(p.unit==='retired')||!ATTRIBUTE_KEYS.every(k=>Number.isFinite(p.attributes?.[k])&&p.attributes[k]>=1&&p.attributes[k]<=99))throw Error('球员人员记录无效');
  if(['senior','youth'].includes(p.unit)&&!p.club||['free','retired'].includes(p.unit)&&p.club)throw Error('球员归属无效');
 }
}
