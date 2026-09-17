import {clamp,rng} from './random.js';

// These are game design curves, not fitted measurements. Body size is kept
// separate from match attributes: their existing maturity model supplies gains.
const START_AGE=12;
const progress=(age,end)=>{const t=clamp((age-START_AGE)/(end-START_AGE));return t*t*(3-2*t);};
const fraction=(age,end,start)=>start+(1-start)*progress(age,end);
const finiteIn=(value,min,max)=>Number.isFinite(value)&&value>=min&&value<=max;

export function validateBodyProfile(profile){
 if(!profile||typeof profile!=='object'||profile.version!==1)return false;
 const p=profile;
 return finiteIn(p.anchorAge,0,120)&&finiteIn(p.anchorHeight,100,230)&&finiteIn(p.anchorWeight,25,180)
  &&finiteIn(p.adultHeight,p.anchorHeight,230)&&finiteIn(p.adultWeight,p.anchorWeight,180)
  &&finiteIn(p.heightMaturityAge,17.2,20.8)&&finiteIn(p.weightMaturityAge,20.2,23.8)
  &&Math.abs(p.weightMaturityAge-p.heightMaturityAge-3)<1e-9
  &&(p.anchorAge<p.heightMaturityAge||p.adultHeight===p.anchorHeight)
  &&(p.anchorAge<p.weightMaturityAge||p.adultWeight===p.anchorWeight);
}

export function createBodyProfile(player,{age=player.developmentAge??player.age,migrate=false,seed='academy'}={}){
 if(player.bodyProfile){
  if(!validateBodyProfile(player.bodyProfile))throw Error('体格发展资料无效');
  return structuredClone(player.bodyProfile);
 }
 if(!player.id||!finiteIn(age,0,120))throw Error('体格发展年龄无效');
 const random=rng(`body:v1:${seed}:${player.id}`);
 // Consume the same sequence at every entry age. Maturity changes timing,
 // while the adult targets remain independent of the starting age.
 const adultHeight=clamp((['GK','CB'].includes(player.position)?187:179)+random.normal()*5,165,202);
 const adultWeight=clamp(adultHeight*.9-88+random.normal()*4,55,105);
 const shift=clamp(player.growthProfile?.maturityShift??random.normal()*.9,-1.8,1.8);
 const heightMaturityAge=19+shift,weightMaturityAge=22+shift;
 if(migrate){
  if(!finiteIn(player.height,100,230)||!finiteIn(player.weight,25,180))throw Error('当前体格无效');
  // Old saves already supplied adult-like measurements. Anchor exactly to the
  // saved body and conservatively limit the remaining change to 8 cm / 12 kg.
  return {
   version:1,anchorAge:age,anchorHeight:player.height,anchorWeight:player.weight,
   adultHeight:Math.max(player.height,Math.min(player.height+8,210,player.height/fraction(age,heightMaturityAge,.9))),
   adultWeight:Math.max(player.weight,Math.min(player.weight+12,125,player.weight/fraction(age,weightMaturityAge,.72))),
   heightMaturityAge,weightMaturityAge,
  };
 }
 return {version:1,anchorAge:START_AGE,anchorHeight:adultHeight*.9,anchorWeight:adultWeight*.72,adultHeight,adultWeight,heightMaturityAge,weightMaturityAge};
}

function measurementAtAge(age,anchorAge,anchor,target,end){
 if(age<=anchorAge)return anchor;
 if(age>=end||target===anchor)return target;
 const start=progress(anchorAge,end),elapsed=progress(age,end);
 return anchor+(target-anchor)*clamp((elapsed-start)/(1-start));
}

export function bodyAtAge(player,age){
 const p=player.bodyProfile;
 if(!p)return {height:player.height,weight:player.weight};
 if(!validateBodyProfile(p)||!finiteIn(age,0,120))throw Error('体格发展资料或年龄无效');
 return {
  height:measurementAtAge(age,p.anchorAge,p.anchorHeight,p.adultHeight,p.heightMaturityAge),
  weight:measurementAtAge(age,p.anchorAge,p.anchorWeight,p.adultWeight,p.weightMaturityAge),
 };
}
