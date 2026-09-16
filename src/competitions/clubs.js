import {leagueSystems} from './catalog.js';
export function completeClubs(existing,cities,provinces){
 const result=existing.map(c=>({...c,division:c.league})),used=new Set(result.map(c=>c.name));
 for(const league of leagueSystems){
  const local=cities.filter(c=>{const p=provinces.find(p=>p.id===c.province);return p.region===league.region&&(!league.provinces||league.provinces.includes(p.id));});
  for(const division of league.levels){
   const count=result.filter(c=>c.division===division.id).length;
   for(let i=count;i<division.teams;i++){
    const city=local[(i+(division.tier-1)*7)%local.length];let n=0,name;
    const suffix=['联队','竞技','体育会','联城','青年','城南','先锋','流浪者','工人','学院'];
    do{name=city.name+suffix[n%suffix.length]+(n>=suffix.length?` ${Math.floor(n/suffix.length)+1}`:'');n++;}while(used.has(name));
    used.add(name);result.push({id:`${division.id}-club-${i+1}`,name,city:city.id,league:league.id,division:division.id,short:`${league.id.split('-')[0].slice(0,3).toUpperCase()}${division.tier}${i+1}`,founded:Math.max(city.founded+2,220+(i*7+division.tier*13)%80),generated:true});
   }
  }
 }
 return result;
}
