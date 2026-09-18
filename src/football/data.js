import {clubProfile} from '../competitions/club-profiles.js';
import {clubs,players,cities,provinces} from '../world.js';
import {generateTeam,generatePlayer,preciseRating} from './players.js';
import {generateName} from './names.js';
import {rng} from './random.js';
const positions={'中场':'CM','前锋':'ST','边锋':'LW','门将':'GK','中后卫':'CB'};
const knownKeys={'传球':'passing','视野':'vision','控球':'firstTouch','速度':'pace','盘带':'dribbling','传中':'crossing','反应':'reflexes','扑救':'handling','出击':'rushingOut','防守':'tackling','预判':'anticipation','力量':'strength'};
export const footballTeams=clubs.map(club=>{
 const team=generateTeam({id:club.id,name:club.name,seed:'astraball-318',quality:clubProfile(club.id).initialQuality});
 const used=new Set();
 for(const known of players.filter(p=>p.club===club.id&&!p.retired)){
  const p=generatePlayer({id:known.id,name:known.name,position:positions[known.position]||'CM',age:known.age,quality:Math.min(83,known.reputation*.45+35),seed:'astraball-318',identity:{city:known.city,family:known.family,training:known.training,worldId:known.id}});
  for(const [label,value] of known.skills)if(knownKeys[label])p.attributes[knownKeys[label]]=value;
  p.potential=Math.max(p.potential,preciseRating(p));
  if(known.height)p.height=known.height;if(known.foot)p.foot=known.foot==='左脚'?'left':'right';p.number=known.number;if(known.originalName)Object.assign(p,{originalName:known.originalName,culture:known.culture,surname:known.surname,firstName:known.firstName,secondSurname:known.secondSurname});
  const replace=team.roster.findIndex(q=>q.position===p.position&&!used.has(q.id));if(replace>=0)team.roster[replace]=p;else team.roster.push(p);used.add(p.id);
 }
 const random=rng(`birth:${club.id}`),numbers=new Set();
 // Reserve established players' shirt numbers before numbering generated teammates.
 for(const p of [...team.roster.filter(p=>p.worldId),...team.roster.filter(p=>!p.worldId)]){let n=p.number||1;while(numbers.has(n))n++;p.number=n;numbers.add(n);}
 const clubRegion=provinces.find(p=>p.id===cities.find(c=>c.id===club.city).province).region;
 const localCities=cities.filter(c=>provinces.find(p=>p.id===c.province).region===clubRegion),usedNames=new Set(team.roster.filter(p=>p.worldId).map(p=>p.name));
 for(const p of team.roster){const origins=random.next()<.72?localCities:cities;p.city??=origins[random.int(0,origins.length-1)].id;p.club=club.id;if(!p.worldId)Object.assign(p,generateName({id:p.id,seed:'world-roster',region:provinces.find(q=>q.id===cities.find(c=>c.id===p.city).province).region,usedNames}));}
 return {...team,city:club.city,short:club.short,league:club.league,division:club.division};
});
export const findFootballPlayer=id=>footballTeams.flatMap(t=>t.roster).find(p=>p.id===id);
