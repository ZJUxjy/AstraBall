import {ABILITY_VERSION,toAbility,calibratePotential} from '../football/ability.js';
import {preciseRating} from '../football/players.js';

// Only ability-bearing fields are migrated. Attributes, cash, contracts, scores,
// simulation seeds and active match snapshots retain their exact saved values.
export function migrateAbilities(s){
 if(s.abilityVersion===ABILITY_VERSION)return s;
 if(s.abilityVersion!=null&&s.abilityVersion!==1)throw Error('能力存档版本不兼容');
 const convert=value=>{if(!Number.isFinite(value)||value<1||value>99)throw Error('旧能力记录无效');return toAbility(value);};
 const seen=new Set(),convertPlayer=p=>{
  if(seen.has(p)||p.abilityVersion===ABILITY_VERSION)return;seen.add(p);
  const current=p.attributes?preciseRating({...p,attributes:s.development?.records?.[p.id]?.attributes||p.attributes}):convert(p.ability);
  const old=p.potential;convert(old);
  p.potential=calibratePotential(old,p.id,current);
  if(!p.attributes)p.ability=current;
  p.abilityVersion=ABILITY_VERSION;
 };
 for(const p of Object.values(s.population?.players||{}))convertPlayer(p);
 for(const p of Object.values(s.playerRegistry?.players||{}))convertPlayer(p);
 for(const p of Object.values(s.economy?.world?.players||{})){
  convertPlayer(p);
  for(const h of p.history||[])if(h.ability!=null)h.ability=convert(h.ability);
 }
 for(const r of Object.values(s.development?.records||{})){
  r.startRating=convert(r.startRating);r.seasonRating=convert(r.seasonRating);
  for(const point of r.history||[])point.ability=convert(point.ability);
  for(const point of r.annual||[]){
   const before=point.ability-point.gain;
   point.ability=convert(point.ability);point.gain=point.ability-convert(before);
  }
 }
 for(const report of Object.values(s.playerRegistry?.observations||{})){
  for(const k of ['forecastLow','forecastHigh','currentAbility'])report[k]=convert(report[k]);
  // trend is deliberately kept in per-year attribute units for the scout model.
 }
 s.abilityVersion=ABILITY_VERSION;return s;
}
