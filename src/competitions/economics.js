import {toSkill} from '../football/ability.js';
import {hash,clamp} from '../football/random.js';
import {getDivision,isMetroLeague} from './catalog.js';
import {clubProfile} from './club-profiles.js';

// Fictional star-dollar calibration, not a currency conversion. All amounts are
// nominal: no automatic annual inflation and no income derived from payroll.
export const ECONOMIC_MODEL=3;
const unit=(key)=>(hash(key)%10000)/9999;
export function businessProfile(id,homeTier=clubProfile(id).homeTier){
 const p=clubProfile(id),reach=p.reach;
 const sizes={1:[18000,48000],2:[10000,18000],3:[4500,10000],4:[1500,5500]},[base,span]=sizes[homeTier];
 return {reach,localSupport:p.localSupport,stadiumCapacity:Math.round((p.royal?78000+unit(`stadium:${id}`)*7000:(base+Math.sqrt(reach)*span)*(.9+.1*Math.sqrt(p.localSupport)))/100)*100,
  localLoyalty:.72+unit(`loyalty:${id}`)*.18,ownerCommitment:p.royal?55000000:(1000000+unit(`owner:${id}`)**3*20000000)*(.8+.2*p.localSupport)};
}
export function marketScale(division){
 const tier=getDivision(division).tier;
 if(isMetroLeague(division))return {broadcast:165000000,commercial:1,ticket:1,wage:1};
 if(division==='lima-league')return {broadcast:125000000,commercial:.75,ticket:.8,wage:.75};
 if(division==='sichuan-league')return {broadcast:105000000,commercial:.6,ticket:.7,wage:.6};
 return [{broadcast:72000000,commercial:.45,ticket:.6,wage:.5},{broadcast:25000000,commercial:.12,ticket:.4,wage:.4},{broadcast:8000000,commercial:.035,ticket:.25,wage:.3},{broadcast:2200000,commercial:.009,ticket:.15,wage:.2}][tier-1];
}
export const marketWage=ability=>Math.max(700,Math.round(3000*Math.pow(1.11,toSkill(ability)-40)/7)*7);
export const clubWage=(ability,division,club)=>Math.max(350,Math.round(marketWage(ability)*marketScale(division).wage*Math.max(.38,.3+.7*Math.min(1.15,businessProfile(club).reach))/7)*7);
export function commercialPlan({id,division,homeTier,reputation,performance=.5,homeGames,broadcast}){
 const profile=businessProfile(id,homeTier),scale=marketScale(division),form=clamp(reputation/clubProfile(id).initialReputation,.5,1.6),brand=profile.reach;
 const attendance=clamp(profile.localLoyalty+(form-1)*.18+performance*.1,.5,.99);
 const ticketYield=Math.round((45+brand*155)*scale.ticket);
 const gatePerGame=Math.round(profile.stadiumCapacity*attendance*ticketYield);
 const sponsorship=Math.round(320000000*Math.pow(brand,1.3)*scale.commercial*Math.pow(form,1.2));
 const commercial=Math.round(340000000*Math.pow(brand,1.7)*scale.commercial*Math.pow(form,1.5));
 const matchday=gatePerGame*homeGames,operatingRevenue=broadcast+sponsorship+commercial+matchday;
 return {...profile,attendance,ticketYield,gatePerGame,homeGames,operatingRevenue,
  plan:{broadcast,sponsorship,commercial,owner:Math.round(profile.ownerCommitment*scale.commercial)},
  operatingBudget:Math.round(operatingRevenue*(.20+brand*.04))};
}
export function marketTransferValue({ability,age,remainingDays,position}){
 if(remainingDays<=0)return 0;
 const prime=position==='GK'?27:24,ageFactor=age<prime?clamp(1.2-(prime-age)*.025,.9,1.2):clamp(1.2-(age-prime)*.085,.15,1.2);
 const term=clamp(remainingDays/730,.12,1.35),scarcity=['ST','AM','LW','RW'].includes(position)?1.12:position==='GK'?.8:1;
 return Math.round(marketWage(ability)*210*ageFactor*term*scarcity/1000)*1000;
}
