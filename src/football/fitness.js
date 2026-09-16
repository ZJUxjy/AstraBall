import {clamp} from './random.js';
export function exertion(player,tactics,seconds,position){
 const press=tactics.pressing==='high'?1.4:tactics.pressing==='low'?.82:1;
 const tempo=tactics.tempo==='fast'?1.15:tactics.tempo==='slow'?.9:1;
 return seconds*(.0018+(100-player.attributes.stamina)*.00007)*press*tempo*(position==='GK'?.45:1)*(0.85+player.attributes.workRate/400);
}
export function conditionEffect(condition,physical=false){return physical?.63+.37*clamp(condition/100):.88+.12*clamp(condition/100);}
