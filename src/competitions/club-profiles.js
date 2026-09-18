import {localClubById} from './local-catalog.js';
import {hash,clamp} from '../football/random.js';
import {clubs} from '../world.js';
import {getDivision,isMetroLeague} from './catalog.js';

// Two reference clubs are confirmed; keep the third pre-existing slot provisional.
export const PROVISIONAL_ROYAL_CLUB='closed-club-3';
export const ROYAL_CLUBS=['sky','silver-fc','closed-club-3'];
const established={'closed-club-1':.86,'rong-fc':.82,harbor:.78,'iron-fc':.76,'pine-fc':.68};
const profiles=new Map();
export function clubProfile(id){
 if(profiles.has(id))return profiles.get(id);
 const royal=ROYAL_CLUBS.includes(id);
 const club=clubs.find(c=>c.id===id)||localClubById.get(id),tier=club?(getDivision(club.division)?.tier||4):1;
 const unit=key=>(hash(key)%10000)/9999;
 const localSupport=clamp((club?.market?.support??80)/100,.35,1.8);
 const reach=royal?1.02+unit(`reach:${id}`)*.08:clamp((established[id]??.10+unit(`reach:${id}`)**2.6*.78)*(.78+.22*Math.sqrt(localSupport)),.08,.95);
 const initialQuality=royal?79+ROYAL_CLUBS.indexOf(id):Math.round((isMetroLeague(club?.league)?66:62)+reach*15-(tier-1)*8+(unit(`strength:${id}`)-.5)*4);
 const profile={royal,royalProvisional:id===PROVISIONAL_ROYAL_CLUB,owner:id===PROVISIONAL_ROYAL_CLUB?'第三皇室席位暂定 · 待确认':royal?'皇室直接控股':'独立俱乐部',initialReputation:royal?9200+ROYAL_CLUBS.indexOf(id)*150:Math.round(clamp(2400+reach*5400-(tier-1)*1400,600,8900)),initialQuality,reach,localSupport,homeTier:tier};
 profiles.set(id,profile);return profile;
}
export const FINANCIAL_POLICIES={
 closed:{name:'软工资帽与奢侈税',wageRatio:.68,taxRate:.6,lossAllowance:.20},
 'crown-league':{name:'软工资帽与奢侈税',wageRatio:.68,taxRate:.6,lossAllowance:.20},
 'silver-league':{name:'软工资帽与奢侈税',wageRatio:.68,taxRate:.6,lossAllowance:.20},
 'lima-league':{name:'工资收入比例',wageRatio:.70,taxRate:.40,lossAllowance:.16},
 'liberlin-league':{name:'稳健经营审查',wageRatio:.68,taxRate:.45,lossAllowance:.12},
 'sichuan-league':{name:'发展与财政公平',wageRatio:.75,taxRate:.25,lossAllowance:.20},
};
