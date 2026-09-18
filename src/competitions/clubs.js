import {leagueSystems} from './catalog.js';
import {referenceClubs} from './reference-clubs.js';
import {hash} from '../football/random.js';
import {cityMarket} from './city-markets.js';
const clubNouns=['体育','矿工','航天人','共产主义者','钢铁','机车','领航员','铸造者','工程师','开拓者','劳动者','火炬','赤星','守望者','水手','钻探者'];
const slots={sky:2,'silver-fc':4,'crown-fc':1,'bay-fc':1,harbor:1,'isles-fc':2,'iron-fc':1,'pine-fc':17,bridge:1,'rong-fc':4};
export function completeClubs(existing,cities,provinces){
 const result=[],used=new Set();
 const markets=new Map(cities.map(c=>[c.id,cityMarket(c,provinces.find(p=>p.id===c.province))]));
 const assignments=new Map();
 for(const region of new Set(leagueSystems.map(l=>l.region))){
  const local=cities.filter(c=>provinces.find(p=>p.id===c.province).region===region);
  const entries=leagueSystems.filter(l=>l.region===region).flatMap(l=>l.levels.flatMap(d=>Array.from({length:d.teams},(_,n)=>({league:l,division:d,slot:n+1,prior:d.tier===1?existing.find(c=>c.league===l.id&&slots[c.id]===n+1):null})))).sort((a,b)=>a.division.tier-b.division.tier||a.slot-b.slot||a.league.id.localeCompare(b.league.id));
  const counts=new Map(local.map(c=>[c.id,0]));
  for(const e of entries.filter(e=>e.prior)){if(!counts.has(e.prior.city))throw Error('俱乐部与城市赛区不符');counts.set(e.prior.city,counts.get(e.prior.city)+1);}
  // Every named city has at least one club; extra seats follow local demand.
  const quotas=new Map(local.map(c=>[c.id,Math.max(1,counts.get(c.id))]));
  let assigned=[...quotas.values()].reduce((a,b)=>a+b,0);
  if(assigned>entries.length)throw Error('联赛席位不足以覆盖全部城市');
  while(assigned++<entries.length){const city=[...local].sort((a,b)=>markets.get(b.id).demand/(quotas.get(b.id)+1)-markets.get(a.id).demand/(quotas.get(a.id)+1)||a.id.localeCompare(b.id))[0];quotas.set(city.id,quotas.get(city.id)+1);}
  for(const e of entries){
   const city=e.prior?local.find(c=>c.id===e.prior.city):[...local].filter(c=>counts.get(c.id)<quotas.get(c.id)).sort((a,b)=>markets.get(b.id).demand/(counts.get(b.id)+1)-markets.get(a.id).demand/(counts.get(a.id)+1)||a.id.localeCompare(b.id))[0];
   if(!e.prior)counts.set(city.id,counts.get(city.id)+1);
   assignments.set(`${e.division.id}:${e.slot}`,{city,market:{...markets.get(city.id),clubs:quotas.get(city.id),support:markets.get(city.id).demand/Math.sqrt(quotas.get(city.id))}});
  }
 }
 for(const league of leagueSystems){
  for(const division of league.levels)for(let i=1;i<=division.teams;i++){
   const prior=division.tier===1?existing.find(c=>c.league===league.id&&slots[c.id]===i):null;
   const {city,market}=assignments.get(`${division.id}:${i}`);
   const ref=referenceClubs.find(c=>c.division===division.id&&c.slot===i);
   let name=ref?.name,n=0;const suffix=[clubNouns[hash(`club-name:${city.id}`)%clubNouns.length],'竞技','体育会','工人','青年','城南','先锋','流浪者','学院'];
   if(!name)do{name=city.name+suffix[n%suffix.length]+(n>=suffix.length?` ${Math.floor(n/suffix.length)+1}`:'');n++;}while(used.has(name));
   if(used.has(name))throw Error(`俱乐部名重复：${name}`);used.add(name);
   result.push({...prior,id:prior?.id||`${division.id}-club-${i}`,name,city:city.id,market,league:league.id,division:division.id,short:prior?.short||`${league.id.split('-')[0].slice(0,3).toUpperCase()}${division.tier}${i}`,founded:prior?.founded||Math.max(city.founded+2,220+(i*7+division.tier*13)%80),generated:!prior,referenceSource:ref?.source||null});
  }
 }
 return result;
}
