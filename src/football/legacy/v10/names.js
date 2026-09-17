import {rng} from './random.js';
import {NAME_POOLS} from './names-data.js';
export {NAME_POOLS};
export const REGION_NAME_WEIGHTS={
 metro:{zh:20,en:20,de:12,fr:16,es:10,pt_BR:8,ru:8,ar:6},
 lima:{zh:14,en:8,de:4,fr:12,es:24,pt_BR:22,ru:4,ar:12},
 liberlin:{zh:16,en:10,de:28,fr:8,es:4,pt_BR:4,ru:24,ar:6},
 sichuan:{zh:65,en:6,de:4,fr:5,es:5,pt_BR:5,ru:4,ar:6},
};
export function generateName({id,seed='318',region='metro',culture,familyName,usedNames,display='translated'}={}){
 if(!id)throw Error('姓名须有稳定人物 ID');const random=rng(`name:v1:${seed}:${id}`),weights=REGION_NAME_WEIGHTS[region];if(!weights)throw Error('未知出生地区');
 culture=culture||random.pick(Object.keys(weights),key=>weights[key]);const pool=NAME_POOLS[culture];if(!pool)throw Error('未知姓名语系');
 if(familyName&&(!familyName.original||!familyName.zh))throw Error('家族姓氏须包含原文和显示名');
 for(let attempt=0;attempt<1000;attempt++){
  const first=random.pick(pool.first),last=familyName||random.pick(pool.last);let second=null;
  if((culture==='es'||culture==='pt_BR')&&random.next()<.4)second=random.pick(pool.last.filter(p=>p.original!==last.original));
  const firstName={...first},surname={...last},secondSurname=second?{...second}:null;
  const originalName=culture==='zh'?last.original+first.original:[first.original,last.original,second?.original].filter(Boolean).join(' ');
  const translatedName=culture==='zh'?last.zh+first.zh:[first.zh,last.zh,second?.zh].filter(Boolean).join('·');
  const name=display==='original'?originalName:translatedName;
  if(usedNames?.has(name))continue;usedNames?.add(name);
  return {name,originalName,translatedName,culture,firstName,surname,secondSurname,nameVersion:1};
 }
 throw Error('姓名池不足，请扩充词库');
}
