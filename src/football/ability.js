// CA/PA are 1–200. Individual technical/physical attributes remain 1–99.
// This monotone curve separates career ability from the match engine's skill units.
export const ABILITY_VERSION=2;
export const ABILITY_MAX=200;
export const ABILITY_ANCHORS=[[1,1],[40,50],[50,70],[60,90],[70,115],[75,130],[80,145],[85,160],[90,175],[94,185],[97,192],[99,200]];
function interpolate(value,points){
 if(!Number.isFinite(value))throw Error('能力数值无效');
 if(value<=points[0][0])return points[0][1];
 for(let i=1;i<points.length;i++){const [x,y]=points[i],[px,py]=points[i-1];if(value<=x)return py+(y-py)*(value-px)/(x-px);}
 return points.at(-1)[1];
}
const inverse=ABILITY_ANCHORS.map(([skill,ability])=>[ability,skill]);
export const toAbility=skill=>interpolate(skill,ABILITY_ANCHORS);
export const toSkill=ability=>interpolate(ability,inverse);
// Stable independent stream: does not shift names, height or match randomness.
function unit(key){let h=2166136261;for(const ch of key){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);h^=h>>>16;return (h>>>0)/4294967296;}
export function talentCeiling(id){
 const u=unit('ability-talent-v2:'+id);
 if(u<.00002)return 191+9*unit('legend:'+id); // two per 100,000 entrants
 if(u<.001)return 181+9*unit('genius:'+id); // about one per 1,000 entrants
 return 180;
}
export const calibratePotential=(oldSkill,id,current=1)=>Math.max(current,Math.min(talentCeiling(id),toAbility(oldSkill)));
