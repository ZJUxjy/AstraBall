import {cities} from '../world.js';
import {hash,clamp} from '../football/random.js';
import {getDivision,isMetroLeague} from './catalog.js';
import {localClubById,localDivisionById} from './local-catalog.js';
import {clubIdentity} from './team-directory.js';
import {clubProfile} from './club-profiles.js';
import {ECONOMIC_MODEL} from './economics.js';

// One shared 50—9999 scale: only metro-level (top flight) clubs sustain 9000+.
export const REPUTATION_MIN=50,REPUTATION_MAX=9999;
export const REPUTATION_SCALE_VERSION=2;
const MATCH_K=50,RATING_SCALE=1200,PROMOTION_BONUS=400,RELEGATION_PENALTY=400;
const LOCAL_BASE={professional:1800,semi:900,amateur:400};
const CORE_ANCHOR={1:8000,2:5800,3:4000,4:2600},METRO_ANCHOR=9500;

const round2=v=>Math.round(v*100)/100;
export const clampReputation=v=>clamp(v,REPUTATION_MIN,REPUTATION_MAX);
export function initialLocalReputation(id,tier=localClubById.get(id)?.tier||'amateur'){
 return Math.round(LOCAL_BASE[tier]*(.9+hash(`reputation:${id}`)%10000/9999*.2));
}
// Zero-sum Elo-style exchange; actual is 1 home win, .5 draw, 0 away win.
export function matchReputation(home,away,actual){
 const expected=1/(1+Math.pow(10,(away-home)/RATING_SCALE)),delta=round2(MATCH_K*(actual-expected));
 return [clampReputation(round2(home+delta)),clampReputation(round2(away-delta))];
}
export function moveReputation(reputation,kind){
 return clampReputation(round2(reputation+(kind==='up'?PROMOTION_BONUS:-RELEGATION_PENALTY)));
}
// Seasonal decay target: champions converge to their level anchor, the bottom
// club to half of it. Regional champions stay below the metro ceiling.
export function reputationTarget(division,performance){
 const anchor=isMetroLeague(division)?METRO_ANCHOR:CORE_ANCHOR[getDivision(division)?.tier]||CORE_ANCHOR[4];
 return anchor*(.5+.5*clamp(performance,0,1));
}
const rescaleReputation=v=>v<100?clampReputation(Math.round(400+(v-5)*100)):v;
// Saves written before the 50—9999 scale keep single/double-digit values; one
// versioned pass rescales them. Legacy financeVersion 2 accounts keep the old
// scale their formulas expect.
export function migrateReputationScale(e){
 if(!e||e.reputationScale===REPUTATION_SCALE_VERSION)return;
 if(e.financeVersion===ECONOMIC_MODEL)for(const a of Object.values(e.accounts))if(Number.isFinite(a.reputation))a.reputation=rescaleReputation(a.reputation);
 for(const c of Object.values(e.world?.clubs||{}))if(Number.isFinite(c.reputation))c.reputation=rescaleReputation(c.reputation);
 e.reputationScale=REPUTATION_SCALE_VERSION;
}
export function worldClubRanking(s){
 const e=s?.economy,rows=[],seen=new Set();
 for(const [division,ids] of Object.entries(s?.members||{}))for(const id of ids){
  const c=clubIdentity(id),a=e?.accounts?.[id];
  rows.push({id,name:c?.name||id,city:c?.city,region:cities.find(x=>x.id===c?.city)?.region||localClubById.get(id)?.region,level:'core',division,divisionName:getDivision(division)?.name||division,reputation:a?.reputation??clubProfile(id).initialReputation});
  seen.add(id);
 }
 for(const c of Object.values(e?.world?.clubs||{})){
  if(c.status!=='active'||seen.has(c.id))continue;
  const info=localClubById.get(c.id);
  rows.push({id:c.id,name:info?.name||c.id,city:info?.city,region:info?.region,level:c.tier,division:c.division,divisionName:localDivisionById.get(c.division)?.name||c.division,reputation:c.reputation??initialLocalReputation(c.id,c.tier)});
 }
 return rows.sort((a,b)=>b.reputation-a.reputation||a.id.localeCompare(b.id));
}
