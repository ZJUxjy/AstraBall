import {geography} from '../geography/generate.js';
import {cityMarket} from './city-markets.js';
export const LOCAL_TIERS={professional:{name:'省级职业',teams:12,quality:53,wage:2800,cost:1800000},semi:{name:'城市半职业',teams:8,quality:43,wage:700,cost:450000},amateur:{name:'城市业余',teams:16,quality:33,wage:0,cost:90000}};
const nouns=['联队','工人','青年','竞技','社区','机车','绿茵','河畔','体育会','先锋','城南','北星','流浪者','港湾','新城','山麓'];
export const localDivisions=geography.provinces.flatMap(p=>[
 {id:`province:${p.id}`,name:`${p.name}职业联赛`,province:p.id,region:p.region,tier:'professional',city:null},
 ...geography.cities.filter(c=>c.province===p.id).flatMap(c=>['semi','amateur'].map(tier=>({id:`${tier}:${c.id}`,name:`${c.name}${LOCAL_TIERS[tier].name.slice(2)}联赛`,province:p.id,region:p.region,city:c.id,tier})))
]);
export const localClubs=localDivisions.flatMap(d=>{
 const cities=geography.cities.filter(c=>c.province===d.province&&(!d.city||c.id===d.city)),counts=new Map(cities.map(c=>[c.id,0]));
 return Array.from({length:LOCAL_TIERS[d.tier].teams},(_,i)=>{
  const c=[...cities].sort((a,b)=>cityMarket(b,geography.provinces.find(p=>p.id===b.province)).demand/(counts.get(b.id)+1)-cityMarket(a,geography.provinces.find(p=>p.id===a.province)).demand/(counts.get(a.id)+1)||a.id.localeCompare(b.id))[0];counts.set(c.id,counts.get(c.id)+1);
  return {id:`local:${d.id}:${i+1}`,name:`${c.name}${d.tier==='professional'?'省联':d.tier==='semi'?'城联':'社区'}${nouns[i]}`,city:c.id,province:d.province,region:d.region,division:d.id,tier:d.tier,local:true,short:`L${localDivisions.indexOf(d)+1}-${i+1}`,founded:260+i};
 });
});
export const localClubById=new Map(localClubs.map(c=>[c.id,c]));
export const localDivisionById=new Map(localDivisions.map(d=>[d.id,d]));
