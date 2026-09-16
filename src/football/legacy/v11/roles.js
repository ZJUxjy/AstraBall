import {clamp} from './random.js';
const depth={GK:0,CB:1,LB:1,RB:1,DM:2,CM:3,AM:4,LW:4,RW:4,ST:5};
const flank=p=>['LB','LW'].includes(p)?-1:['RB','RW'].includes(p)?1:0;
export function roleFamiliarity(player,position){
 if(player.position===position)return {attack:1,defense:1};
 if(player.secondary?.includes(position))return {attack:.97,defense:.97};
 if(player.position==='GK'||position==='GK')return {attack:.4,defense:.45};
 const gap=Math.abs(depth[player.position]-depth[position]);
 const sameWing=flank(player.position)&&flank(player.position)===flank(position);
 const loss=Math.min(.4,gap*.1)*(sameWing?.7:1)*(1-(player.personality?.adaptability??50)*.002);
 const lateral=flank(player.position)===flank(position)?0:.04;
 const forward=depth[position]>depth[player.position];
 return {attack:clamp(1-loss*(forward?1:.25)-lateral,.5,1),defense:clamp(1-loss*(forward?.25:1)-lateral,.5,1)};
}
export function positionalAttribute(player,position,key){
 const fam=roleFamiliarity(player,position);
 if(['offBall','vision'].includes(key))return player.attributes[key]*fam.attack;
 if(['positioning','anticipation','marking'].includes(key))return player.attributes[key]*fam.defense;
 return player.attributes[key];
}
export function roleOffset(slot,tactics,attacking,ball){
 if(!attacking)return [0,0];
 if(['LB','RB'].includes(slot.position)){
  const forward=tactics.fullbacks==='overlap'?Math.max(0,(ball[0]-40)*.3):tactics.fullbacks==='hold'?-8:0;
  return [forward,tactics.fullbacks==='overlap'?(slot.position==='LB'?-3:3):0];
 }
 if(slot.position==='ST')return tactics.striker==='link'?[-8,(ball[1]-34)*.1]:[Math.max(0,(ball[0]-55)*.16),0];
 return [0,0];
}
