import {localClubById} from './local-catalog.js';
import {footballTeams} from '../football/data.js';
import {ATTRIBUTE_KEYS,ATTRIBUTE_GROUPS,PERSONALITY,POSITIONS} from '../football/players.js';
import {createBodyProfile,validateBodyProfile} from '../football/body.js';
import {YEAR} from '../world.js';
import {dateOf,daysBetween} from './calendar.js';

const originals=footballTeams.flatMap(t=>t.roster),originalById=new Map(originals.map(p=>[p.id,p]));
const clubIds=new Set([...footballTeams.map(t=>t.id),...localClubById.keys()]);
const knownClub=id=>clubIds.has(id)||localClubById.has(id);
const statuses=new Set(['youth','senior','loan','free','retired','external']);
export const registryDate=date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(`${date}T12:00:00Z`))&&new Date(`${date}T12:00:00Z`).toISOString().slice(0,10)===date;
export function playerAgeOnDate(p,date){
 const year=Number(date.slice(0,4));
 if(p.ageReferenceDate){
  const referenceYear=Number(p.ageReferenceDate.slice(0,4)),monthDay=p.ageReferenceDate.slice(5);
  const anniversary=y=>{let value=`${String(y).padStart(4,'0')}-${monthDay}`;if(monthDay==='02-29'&&new Date(value).toISOString().slice(5,10)!==monthDay)value=`${String(y).padStart(4,'0')}-02-28`;return value;};
  let baseYear=year;if(date<anniversary(year))baseYear--;
  return p.age+baseYear-referenceYear+daysBetween(anniversary(baseYear),date)/daysBetween(anniversary(baseYear),anniversary(baseYear+1));
 }
 return p.age+year-YEAR+daysBetween(dateOf(year,1,1),date)/daysBetween(dateOf(year,1,1),dateOf(year+1,1,1));
}

export function ensurePlayerRegistry(s){
 return s.playerRegistry??={version:1,players:{},registrations:{},cohorts:[],observations:{},events:[],drafts:[],reviews:[]};
}
export function migrateYouthBodies(s,date=s.date){
 for(const p of Object.values(s.playerRegistry?.players||{})){
  if(p.bodyProfile===undefined)p.bodyProfile=createBodyProfile(p,{age:playerAgeOnDate(p,date),migrate:true});
 }
}

function registered(s,p){
 const r=s.playerRegistry?.registrations?.[p.id];
 return r?{...p,...(r.marketMeta||{}),...(['free','retired'].includes(r.status)?{lastClub:r.history?.findLast(h=>h.clubId)?.clubId||p.club}:{}),...(r.number===undefined?{}:{number:r.number}),club:r.clubId??null,registrationStatus:r.status,retired:r.status==='retired'}:p;
}
export function registeredPlayers(s,{includeRetired=false}={}){
 if(s.population)return Object.values(s.population.players).filter(p=>includeRetired||!p.retired&&p.registrationStatus!=='external');
 return [...originals,...Object.values(s.playerRegistry?.players||{})].map(p=>registered(s,p)).filter(p=>includeRetired||!p.retired&&p.registrationStatus!=='external');
}
export function registeredPlayer(s,id){if(s.population)return s.population.players[id]||null;const p=s.playerRegistry?.players?.[id]||originalById.get(id);return p?registered(s,p):null;}
// Scoped indexes accelerate a simulation step; ordinary reads remain uncached so
// externally edited saves and tests always observe their current registrations.
const scopedRosters=new WeakMap();
export function invalidateRosterIndex(s){const cache=s.playerRegistry&&scopedRosters.get(s.playerRegistry);if(cache){cache.rows=null;cache.groups=null;}}
export function withRosterIndex(s,fn){
 if(!s.playerRegistry||scopedRosters.has(s.playerRegistry))return fn();
 const registry=s.playerRegistry;scopedRosters.set(registry,{rows:null});try{return fn();}finally{scopedRosters.delete(registry);}
}
function indexedRosters(s,cache){
 if(cache.rows)return cache.rows;
 const rows=new Map(),regs=s.playerRegistry.registrations;
 const add=p=>{const reg=regs[p.id],club=reg?reg.clubId:p.club;if(!club||reg&&!['senior','loan'].includes(reg.status))return;const list=rows.get(club)||[];list.push(p);rows.set(club,list);};
 for(const p of originals)if(!regs[p.id]||regs[p.id].clubId===p.club)add(p);
 for(const id of Object.keys(regs)){const p=originalById.get(id);if(p&&regs[id].clubId!==p.club)add(p);}
 for(const p of Object.values(s.playerRegistry.players))add(p);
 return cache.rows=rows;
}
function registrationGroups(s){
 const cache=s.playerRegistry&&scopedRosters.get(s.playerRegistry);if(cache?.groups)return cache.groups;
 const groups={youth:new Map(),loans:new Map()};
 for(const [id,reg] of Object.entries(s.playerRegistry?.registrations||{})){
  const list=reg.status==='youth'?groups.youth:reg.status==='loan'?groups.loans:null;if(!list)continue;
  const club=reg.status==='loan'?reg.ownerClubId:reg.clubId,ids=list.get(club)||[];ids.push(id);list.set(club,ids);
 }
 if(cache)cache.groups=groups;return groups;
}
export const registeredYouth=(s,clubId)=>(registrationGroups(s).youth.get(clubId)||[]).map(id=>registeredPlayer(s,id));
export const loanedPlayerIds=(s,clubId)=>registrationGroups(s).loans.get(clubId)||[];
export function registeredRoster(s,clubId){
 if(s.population)return Object.values(s.population.players).filter(p=>p.club===clubId&&p.unit==='senior'&&!p.retired);
 const cache=s.playerRegistry&&scopedRosters.get(s.playerRegistry);if(cache)return (indexedRosters(s,cache).get(clubId)||[]).map(p=>registered(s,p));
 const local=footballTeams.find(t=>t.id===clubId)?.roster||[],localIds=new Set(local.map(p=>p.id));
 const registrations=s.playerRegistry?.registrations||{},result=[];
 const append=p=>{
  const reg=registrations[p.id];
  if(reg?reg.clubId!==clubId||!['senior','loan'].includes(reg.status):p.club!==clubId)return;
  result.push(registered(s,p));
 };
 // Preserve the established order while materializing only this club's players.
 for(const p of local)append(p);
 for(const id of Object.keys(registrations))if(originalById.has(id)&&!localIds.has(id))append(originalById.get(id));
 for(const p of Object.values(s.playerRegistry?.players||{}))append(p);
 return result;
}
export function validatePlayerRegistry(s){
 const r=s.playerRegistry;if(!r)return s;
 if(r.version!==1||!r.players||!r.registrations||!r.observations||!Array.isArray(r.cohorts)||!Array.isArray(r.events)||!Array.isArray(r.drafts)||!Array.isArray(r.reviews))throw Error('球员注册存档无效');
 if(r.through!==undefined&&!registryDate(r.through)||r.reviews.some(date=>!registryDate(date))||new Set(r.reviews).size!==r.reviews.length||r.retirementYears&&(!Array.isArray(r.retirementYears)||r.retirementYears.some(year=>!Number.isInteger(year))))throw Error('青训结算日期无效');
 for(const [id,p] of Object.entries(r.players)){
  if(originalById.has(id)||!p||p.id!==id||typeof p.name!=='string'||!p.name.trim()||!POSITIONS[p.position]||!Number.isInteger(p.age)||p.age<15||p.age>60||!registryDate(p.ageReferenceDate)||!Number.isFinite(p.potential)||p.potential<1||p.potential>200||!ATTRIBUTE_KEYS.every(k=>Number.isFinite(p.attributes?.[k])&&p.attributes[k]>=1&&p.attributes[k]<=99)||!Object.keys(PERSONALITY).every(k=>Number.isFinite(p.personality?.[k])&&p.personality[k]>=0&&p.personality[k]<=100)||!r.registrations[id])throw Error('新增球员存档无效');
  if(!Number.isFinite(p.height)||p.height<100||p.height>230||!Number.isFinite(p.weight)||p.weight<25||p.weight>180||p.bodyProfile!==undefined&&!validateBodyProfile(p.bodyProfile))throw Error('球员身体发育存档无效');
  const profile=p.growthProfile;
  if(!profile||profile.version!==1||!POSITIONS[profile.referencePosition]||!ATTRIBUTE_KEYS.every(k=>Number.isFinite(profile.ceilings?.[k])&&profile.ceilings[k]>=1&&profile.ceilings[k]<=99)||!Object.keys(ATTRIBUTE_GROUPS).every(k=>Number.isFinite(profile.domains?.[k])&&profile.domains[k]>=1&&profile.domains[k]<=99)||!['maturityShift','learningRate','priorTraining'].every(k=>Number.isFinite(profile[k]))||profile.learningRate<=0)throw Error('球员成长禀赋存档无效');
 }
 for(const [id,v] of Object.entries(r.registrations)){
  if(!registeredPlayer(s,id)||!v||!statuses.has(v.status)||!registryDate(v.statusSince)||!['royal','local'].includes(v.pathway)||v.clubId!==null&&!knownClub(v.clubId)||v.ownerClubId!==null&&!knownClub(v.ownerClubId)||(['youth','senior','loan'].includes(v.status)&&!v.clubId)||(['free','retired'].includes(v.status)&&v.clubId!==null)||v.status==='loan'&&(!v.ownerClubId||v.ownerClubId===v.clubId||!registryDate(v.loanUntil))||!Array.isArray(v.history)||!v.history.length)throw Error('球员归属存档无效');
  if(v.rightsClubId&&!knownClub(v.rightsClubId)||v.rightsUntil&&!registryDate(v.rightsUntil))throw Error('选秀签约权存档无效');
  if(v.transferredAt!==undefined&&!registryDate(v.transferredAt))throw Error('转会日期无效');
  if(v.number!==undefined&&(!Number.isInteger(v.number)||v.number<1||v.number>999))throw Error('注册球衣号码无效');
  let last='';for(const h of v.history){if(!registryDate(h.date)||h.date<last||!statuses.has(h.status)||h.clubId!==null&&!knownClub(h.clubId)||h.ownerClubId!==null&&!knownClub(h.ownerClubId))throw Error('球员流转历史无效');last=h.date;}
  const latest=v.history.at(-1);if(latest.date!==v.statusSince||latest.status!==v.status||latest.clubId!==v.clubId||latest.ownerClubId!==v.ownerClubId)throw Error('球员当前注册与历史不一致');
 }
 if(new Set(r.cohorts.map(c=>c.id)).size!==r.cohorts.length||r.cohorts.some(c=>!registryDate(c.date)||!knownClub(c.clubId)||!Array.isArray(c.playerIds)||c.playerIds.some(id=>!r.players[id])))throw Error('青训届次存档无效');
 for(const [key,o] of Object.entries(r.observations))if(!o||!r.players[o.playerId]||!knownClub(o.observerClubId)||key!==`${o.observerClubId}/${o.playerId}`||!registryDate(o.updatedAt)||!registryDate(o.evidenceThrough)||!Number.isFinite(o.evidenceMinutes)||o.evidenceMinutes<0||!Number.isInteger(o.samples)||o.samples<1||!['forecastLow','forecastHigh','currentAbility'].every(k=>Number.isFinite(o[k])&&o[k]>=1&&o[k]<=200)||o.forecastLow>o.forecastHigh||!Number.isInteger(o.observedMatches)||o.observedMatches<0||!['较低','中等'].includes(o.confidence)||o.trend!==null&&!Number.isFinite(o.trend)||!Array.isArray(o.notes)||o.notes.some(note=>typeof note!=='string'))throw Error('青训观察存档无效');
 return s;
}
