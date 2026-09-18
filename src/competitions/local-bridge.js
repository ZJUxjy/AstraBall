import {toAbility,toSkill,ABILITY_VERSION} from '../football/ability.js';
import {seniorTeams} from './team-directory.js';
import {footballTeams} from '../football/data.js';
import {generateYouthPlayer,preciseRating,preciseSkill,ATTRIBUTE_KEYS} from '../football/players.js';
import {clamp} from '../football/random.js';
import {dateOf,daysBetween} from './calendar.js';
import {localClubById,LOCAL_TIERS} from './local-catalog.js';
import {postAccount} from './economic-ledger.js';
import {payPlayer,taxReceipt,transferTax} from './taxation.js';
import {clubPlayers,populationPlayers,populationPlayer,currentAbility,persistPlayer} from './population.js';
import {invalidateRosterIndex} from './registry.js';
import {wageBill,weeklyWage,availableBudget,isTransferWindow} from './market.js';
import {financialReserve,payrollCapacity,wageCeiling} from './finance.js';

export function materializeLocal(s,p,club){
 const info=localClubById.get(p.club)||localClubById.get(p.originClub),age=s.year-p.birthYear;
 const full=generateYouthPlayer({id:p.id,seed:'local-career',age:Math.max(15,Math.min(18,age)),potential:Math.max(toAbility(45),p.potential),position:p.position,region:info?.region||'liberlin',identity:{city:p.city,club,ageReferenceDate:s.date}});
 for(let i=0;i<4;i++){const delta=toSkill(p.ability)-preciseSkill(full);for(const key of ATTRIBUTE_KEYS){full.attributes[key]=clamp(full.attributes[key]+delta,1,99);full.growthProfile.ceilings[key]=Math.max(full.growthProfile.ceilings[key],full.attributes[key]);}}
 Object.assign(full,{age,name:p.name,originalName:p.originalName,ageReferenceDate:s.date,club,potential:Math.max(p.potential,preciseRating(full)),number:1});
 return full;
}
export function registerLocalSenior(s,full){
 if(!populationPlayer(s,full.id))s.playerRegistry.players[full.id]=full;
 else if(s.playerRegistry.players[full.id])s.playerRegistry.players[full.id]={...s.playerRegistry.players[full.id],...full};
 if(s.development?.records[full.id]){const r=s.development.records[full.id];r.attributes={...full.attributes};r.weekDays=0;r.healthyDays=0;r.weekMinutes=0;r.weekChallenge=0;r.dose=Object.fromEntries(Object.keys(r.dose).map(k=>[k,0]));r.recentExposure=[];}
 persistPlayer(s,{...full,unit:'senior'});invalidateRosterIndex(s);
}
export function recruitLocalPlayer(s,id,buyer,{automatic=false}={}){
 const e=s.economy,w=e.world,p=w?.players[id],source=w?.clubs[p?.club],a=e.accounts[buyer];
 if(!p||p.status!=='local'||!source||source.status!=='active'||!a||!isTransferWindow(s)||!automatic&&buyer!==s.manager?.clubId||p.lastTransfer&&daysBetween(p.lastTransfer,s.date)<90)throw Error('地方引援不可执行');
 const roster=clubPlayers(s,buyer);if(roster.length>=40||s.year-p.birthYear>=21&&roster.filter(q=>s.year-q.birthYear>=21).length>=25||source.roster.length<=23||source.roster.filter(id=>w.players[id].position===p.position).length<=(p.position==='GK'?2:1))throw Error('地方引援阵容不足');
 const full=materializeLocal(s,p,buyer),wage=Math.min(Math.max(p.weeklyWage,weeklyWage(s,full,buyer)),wageCeiling(s,buyer)),fee=source.tier==='amateur'?0:Math.round(p.weeklyWage*45),bonus=wage*4,bill=wageBill(s,buyer)+wage;
 if(bill>payrollCapacity(s,buyer)||fee+bonus>availableBudget(s,buyer)||a.cash-fee-bonus<financialReserve(s,buyer,bill)||e.world.credit[buyer]?.status&&e.world.credit[buyer].status!=='normal')throw Error('地方引援预算不足');
 const seller=p.club,tax=transferTax(e,fee);postAccount(e,buyer,'transferOut',fee);postAccount(e,seller,'transferIn',fee);postAccount(e,seller,'transferTax',tax);taxReceipt(e,seller,'transferTax',tax);postAccount(e,buyer,'bonuses',bonus);payPlayer(e,id,buyer,bonus);a.spent+=fee+bonus;
 const numbers=new Set(clubPlayers(s,buyer,{unit:'all'}).map(p=>p.number));while(numbers.has(full.number))full.number++;
 registerLocalSenior(s,{...full,lastClub:seller,lastTransfer:s.date,joinedYear:s.year});
 e.contracts[id]={club:buyer,start:s.date,end:dateOf(s.year+2,12,31),weeklyWage:wage,kind:'senior'};
 source.roster=source.roster.filter(x=>x!==id);p.status='core';p.originClub=seller;p.club=buyer;p.weeklyWage=wage;p.lastTransfer=s.date;
 const move={id:`move:${e.sequence++}`,type:'transfer',date:s.date,player:id,from:seller,to:buyer,fee,transferTax:tax,sellerNet:fee-tax,bonus,weeklyWage:wage,end:e.contracts[id].end,local:true,bridge:'up'};e.moves.push(move);w.events.push({date:s.date,type:'career-up',player:id,from:seller,to:buyer});invalidateRosterIndex(s);return move;
}
export function recruitReleasedPlayer(s,id,buyer){
 const e=s.economy,w=e.world,p=populationPlayer(s,id),c=w?.clubs[buyer];if(!p||p.club||p.retired||p.unit!=='free'||!c||c.status!=='active'||!isTransferWindow(s)||e.contracts[id])throw Error('地方回流对象无效');
 const age=s.year-p.birthYear,ability=currentAbility(s,p);if(age<18||c.roster.length>=28||c.tier==='amateur')throw Error('地方回流注册无效');
 const wage=Math.round(LOCAL_TIERS[c.tier].wage*Math.pow(1.055,toSkill(ability)-LOCAL_TIERS[c.tier].quality)/7)*7,bill=c.roster.reduce((n,id)=>n+w.players[id].weeklyWage,0);
 if(bill+wage>c.finance.wageLimit||c.finance.cash<c.finance.operatingRevenueBudget*.1||e.world.credit[buyer]?.status&&e.world.credit[buyer].status!=='normal')throw Error('地方回流预算不足');
 const local={id,abilityVersion:ABILITY_VERSION,name:p.name,originalName:p.originalName,club:buyer,city:p.city,birthYear:p.birthYear,position:p.position,ability,potential:Math.max(ability,p.potential),weeklyWage:wage,end:dateOf(s.year+1,12,31),status:'local',minutes:w.players[id]?.minutes||0,goals:w.players[id]?.goals||0,seasonMinutes:0,seasonGoals:0,history:w.players[id]?.history||[],lastTransfer:s.date};
 w.players[id]=local;c.roster.push(id);persistPlayer(s,{...p,club:buyer,unit:'external',lastTransfer:s.date});
 const move={id:`move:${e.sequence++}`,type:'transfer',date:s.date,player:id,from:null,to:buyer,fee:0,transferTax:0,sellerNet:0,bonus:0,weeklyWage:wage,end:local.end,local:true,bridge:'down'};e.moves.push(move);w.events.push({date:s.date,type:'career-down',player:id,to:buyer});return move;
}
export function runLocalBridge(s){
 const w=s.economy?.world;if(!w||!isTransferWindow(s))return;const month=s.date.slice(0,7);w.bridgeMonths??=[];if(w.bridgeMonths.includes(month))return;w.bridgeMonths.push(month);
 const targets=Object.values(w.players).filter(p=>p.status==='local'&&s.year-p.birthYear<=25&&p.ability>=toAbility(52)&&(!p.lastTransfer||daysBetween(p.lastTransfer,s.date)>=90)&&w.clubs[p.club]?.status==='active').sort((a,b)=>b.ability-a.ability||a.id.localeCompare(b.id));
 for(const team of seniorTeams(s)){if(team.id===s.manager?.clubId)continue;const roster=clubPlayers(s,team.id),outfield=roster.filter(p=>p.position!=='GK'),floor=outfield.length?Math.min(...outfield.map(p=>currentAbility(s,p))):1;
  for(const p of targets.filter(p=>p.status==='local'&&toSkill(p.ability)>toSkill(floor)+3&&w.clubs[p.club].roster.length>23&&w.clubs[p.club].roster.filter(id=>w.players[id].position===p.position).length>(p.position==='GK'?2:1)).slice(0,8)){try{recruitLocalPlayer(s,p.id,team.id,{automatic:true});break;}catch{}}
 }
 const released=populationPlayers(s).filter(p=>p.unit==='free'&&s.year-p.birthYear>=18&&currentAbility(s,p)>=toAbility(40)).sort((a,b)=>currentAbility(s,b)-currentAbility(s,a)||a.id.localeCompare(b.id));
 const candidates=Object.values(w.clubs).filter(c=>c.status==='active'&&c.tier!=='amateur').sort((a,b)=>b.finance.wageLimit-a.finance.wageLimit||a.id.localeCompare(b.id));
 for(const p of released.slice(0,200))for(const c of candidates){if(c.roster.length>=27)continue;const average=c.roster.length?c.roster.reduce((n,id)=>n+toSkill(w.players[id].ability),0)/c.roster.length:0;if(toSkill(currentAbility(s,p))<average+2)continue;try{recruitReleasedPlayer(s,p.id,c.id);break;}catch{}}
}
