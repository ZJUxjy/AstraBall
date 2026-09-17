import {clamp,sigmoid,logit} from './random.js';
import {TUNE} from './config.js';
// xG describes the opportunity against an average keeper; execution is separate.
export function shotQuality({x=88,y=34,pressure=.5,kind='open',counter=false}={}){
 if(kind==='penalty')return .78;
 const dx=Math.max(.5,105-x),dy=y-34,distance=Math.hypot(dx,dy);
 const angle=Math.atan2(7.32*dx,dx*dx+dy*dy-3.66**2);
 return clamp(sigmoid(TUNE.xgIntercept-distance*.085+angle*1.45-pressure*.55+(counter?.28:0)-(kind==='header'?.45:0)-(kind==='freeKick'?.4:0)),.008,.7);
}
export function goalProbability(xG,finishing,keeping,{weakFoot=100,header=false}={}){
 return clamp(sigmoid(logit(xG)+clamp((finishing-65)*.018-(keeping-65)*.018-(100-weakFoot)*.003,-1.4,1.4)),.003,header?.70:.94);
}
