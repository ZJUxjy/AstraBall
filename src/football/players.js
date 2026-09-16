import {rng,clamp,mean} from './random.js';
import {generateName} from './names.js';
export const ATTRIBUTE_GROUPS={
  technical:{label:'技术',fields:{passing:'短传',longPassing:'长传',firstTouch:'停球',dribbling:'盘带',technique:'技术',crossing:'传中',finishing:'射门',longShots:'远射',heading:'头球',tackling:'抢断',marking:'盯人',corners:'角球',freeKicks:'任意球',penalties:'点球'}},
  physical:{label:'身体',fields:{pace:'速度',acceleration:'爆发力',agility:'敏捷',balance:'平衡',strength:'力量',jumping:'弹跳',stamina:'耐力',naturalFitness:'恢复能力'}},
  mental:{label:'意识',fields:{vision:'视野',decisions:'决策',anticipation:'预判',positioning:'防守站位',offBall:'无球跑动',composure:'镇定',concentration:'专注',teamwork:'团队合作',workRate:'投入',leadership:'领导力',aggression:'侵略性',bravery:'勇敢'}},
  goalkeeper:{label:'守门',fields:{reflexes:'反应',handling:'接球',oneOnOnes:'单刀防守',aerialReach:'制空',command:'指挥',rushingOut:'出击',kicking:'开球',throwing:'手抛球'}},
};
export const ATTRIBUTE_KEYS=Object.values(ATTRIBUTE_GROUPS).flatMap(g=>Object.keys(g.fields));
export const PERSONALITY={professionalism:'职业态度',ambition:'进取心',adaptability:'适应力',consistency:'稳定性',bigMatches:'大赛发挥',injuryProneness:'伤病倾向'};
export const POSITIONS={GK:'门将',CB:'中卫',LB:'左后卫',RB:'右后卫',DM:'后腰',CM:'中场',AM:'前腰',LW:'左边锋',RW:'右边锋',ST:'前锋'};
export const POSITION_WEIGHTS={
 GK:{reflexes:4,handling:3,oneOnOnes:2,aerialReach:2,command:1,positioning:2,agility:1,kicking:1},
 CB:{tackling:3,marking:3,positioning:3,heading:2,jumping:2,strength:2,anticipation:2,concentration:1,pace:1},
 LB:{tackling:2,marking:1,positioning:2,crossing:2,pace:3,stamina:2,workRate:1,passing:1},
 RB:{tackling:2,marking:1,positioning:2,crossing:2,pace:3,stamina:2,workRate:1,passing:1},
 DM:{tackling:3,positioning:3,anticipation:2,passing:2,decisions:2,teamwork:1,stamina:2,strength:1},
 CM:{passing:3,vision:3,decisions:2,firstTouch:2,teamwork:2,stamina:2,longPassing:2},
 AM:{vision:3,passing:3,firstTouch:2,dribbling:2,offBall:2,decisions:2,technique:1},
 LW:{pace:3,acceleration:2,dribbling:3,crossing:2,offBall:2,finishing:1,technique:1},
 RW:{pace:3,acceleration:2,dribbling:3,crossing:2,offBall:2,finishing:1,technique:1},
 ST:{finishing:4,offBall:3,composure:2,heading:1,pace:2,acceleration:1,anticipation:2,firstTouch:1},
};
export function rating(player,position=player.position){const w=POSITION_WEIGHTS[position];if(!w)throw Error('未知位置');return Math.round(Object.entries(w).reduce((s,[k,v])=>s+player.attributes[k]*v,0)/Object.values(w).reduce((a,b)=>a+b,0));}
export function familiarity(player,position){if(player.position===position)return 1;if(player.secondary?.includes(position))return .95;if(player.position==='GK'||position==='GK')return .3;const groups=[['CB','LB','RB','DM'],['DM','CM','AM'],['LW','RW','AM','ST']];return (groups.some(g=>g.includes(player.position)&&g.includes(position))?.80:.61)+(player.personality?.adaptability??50)*.0006;}
export function generatePlayer({id,seed='318',position='CM',quality=68,name,age,region='metro',culture,identity={}}={}){
 if(!id||!POSITIONS[position])throw Error('球员身份或位置无效');const r=rng(`${seed}:${id}`),attributes={};
 for(const key of ATTRIBUTE_KEYS){const important=POSITION_WEIGHTS[position][key]||0;const isGK=key in ATTRIBUTE_GROUPS.goalkeeper.fields;
   attributes[key]=Math.round(clamp(quality+(important?7:0)+r.normal()*9-(isGK&&position!=='GK'?48:0)-(position==='GK'&&!isGK&&key in ATTRIBUTE_GROUPS.technical.fields?20:0),1,99));}
 const personality=Object.fromEntries(Object.keys(PERSONALITY).map(k=>[k,Math.round(clamp(55+r.normal()*18,5,95))]));
 const years=age??r.int(18,33),current=rating({position,attributes});
 if(!name){r.int(0,19);r.int(0,19);} // Preserve the established non-name random sequence.
 const identityName=name?{name}:generateName({id,seed,region,culture});
 return {id,...identityName,age:years,position,secondary:position==='CM'?['DM','AM']:position==='LW'?['RW']:position==='RB'?['LB']:[],attributes,personality,potential:Math.min(99,current+(years<24?r.int(6,20):r.int(0,5))),height:position==='GK'||position==='CB'?r.int(182,198):r.int(169,191),weight:r.int(67,89),foot:r.next()<.23?'left':'right',weakFoot:r.int(30,85),condition:100,sharpness:80,morale:65,injuryDays:0,suspended:0,retired:false,...identity};
}
export const ROSTER_POSITIONS=['GK','GK','GK','CB','CB','CB','CB','LB','LB','RB','RB','DM','DM','CM','CM','CM','AM','AM','LW','LW','RW','RW','ST','ST','ST'];
export function generateTeam({id,name=id,seed='318',quality=68}={}){return {id,name,roster:ROSTER_POSITIONS.map((position,i)=>generatePlayer({id:`${id}-${i}`,seed,position,quality:quality+(i%3===0?3:i%3===2?-5:0)}))};}
export const FORMATIONS={
 '4-3-3':['GK','LB','CB','CB','RB','DM','CM','CM','LW','ST','RW'],
 '4-2-3-1':['GK','LB','CB','CB','RB','DM','CM','LW','AM','RW','ST'],
 '4-4-2':['GK','LB','CB','CB','RB','LW','CM','CM','RW','ST','ST'],
 '3-5-2':['GK','CB','CB','CB','LB','DM','CM','AM','RB','ST','ST'],
};
export const available=p=>!p.retired&&!p.injuryDays&&!p.suspended&&p.condition>25;
export function selectLineup(team,formation='4-3-3'){
 if(!FORMATIONS[formation])throw Error('未知阵型');const used=new Set();
 return FORMATIONS[formation].map(position=>{const p=team.roster.filter(p=>available(p)&&!used.has(p.id)).sort((a,b)=>rating(b,position)*familiarity(b,position)-rating(a,position)*familiarity(a,position)||a.id.localeCompare(b.id))[0];if(!p)throw Error('健康球员不足 11 人');used.add(p.id);return {id:p.id,position};});
}
export function preciseRating(player,position=player.position){
 const weights=POSITION_WEIGHTS[position];
 return Object.entries(weights).reduce((sum,[key,weight])=>sum+player.attributes[key]*weight,0)/Object.values(weights).reduce((a,b)=>a+b,0);
}
const interpolate=(age,points)=>{if(age<=points[0][0])return points[0][1];for(let i=1;i<points.length;i++){const [x,y]=points[i],[px,py]=points[i-1];if(age<=x)return py+(y-py)*(age-px)/(x-px);}return points.at(-1)[1];};
export function developmentTraits(player){const r=rng(`development:${player.id}`);return {maturityShift:r.next()*3-1.5,learningRate:.85+r.next()*.3};}
export function developmentStage(player){const age=player.age,shift=player.position==='GK'?3:0;return age<18?'青训阶段':age<22?'职业起步':age<26+shift?'持续发展':age<30+shift?'成熟阶段':'经验与保持';}
export function trainingEfficiency(load){return interpolate(load,[[0,0],[.3,.65],[.6,1],[.8,.92],[1,.65]]);}
export function focusWeights(training='balanced'){
 if(training!=='balanced'&&!ATTRIBUTE_GROUPS[training])throw Error('训练方向无效');
 return Object.fromEntries(Object.keys(ATTRIBUTE_GROUPS).map(group=>[group,training==='balanced'?1:group===training?1.5:.7]));
}
// Rates are game design targets, in attribute points per year before individual modifiers.
export function annualDevelopmentRates(age,position='CM',maturityShift=0){
 const technicalAge=age-maturityShift-(position==='GK'?2:0),mentalAge=age-maturityShift;
 return {
  technical:interpolate(technicalAge,[[15,7.8],[18,7],[21,5.8],[24,3.6],[27,1.6],[30,.3],[33,-.45],[37,-1.4]]),
  physical:interpolate(age-maturityShift*.5,[[15,10],[18,7],[21,3.8],[24,1.2],[27,0],[30,-1.1],[33,-2.8],[37,-5]]),
  mental:interpolate(mentalAge,[[15,4.2],[18,5.2],[22,5],[26,3.4],[30,1.2],[34,.1],[38,-.8]]),
  goalkeeper:interpolate(age-maturityShift,[[15,6],[19,7],[23,5.5],[27,3],[31,.6],[34,-.7],[38,-2.5]])
 };
}
export function developWeek(player,{seed='week',training='balanced',minutes=0,load=.6,challenge=1,days=7,trainingAvailability,trainingDose}={}){
 if(!Number.isFinite(days)||days<=0||days>7||!Number.isFinite(minutes)||minutes<0||!Number.isFinite(load)||load<0||load>1||!Number.isFinite(challenge)||challenge<0||challenge>1.2)throw Error('成长参数无效');
 const weights=focusWeights(training),p={...player,attributes:{...player.attributes}};
 if(p.retired)return p;
 const age=p.developmentAge??p.age,traits=developmentTraits(p),rates=annualDevelopmentRates(age,p.position,traits.maturityShift);
 const healthy=trainingAvailability??1-Math.min(days,p.injuryDays||0)/days;
 if(!Number.isFinite(healthy)||healthy<0||healthy>1)throw Error('训练出勤无效');
 const current=preciseRating(p),headroom=Math.max(0,p.potential-current),room=1-Math.exp(-headroom/12);
 const attitude=(.6+(p.personality.professionalism||0)/250)*(.85+(p.personality.ambition||0)*.003);
 const experience=clamp(minutes/(90*days/7))*challenge;
 const overload=1-Math.min(.4,Math.max(0,minutes/(days/7)-120)/300);
 const trainingShare=age<18?.9:age<21?.65:.45;
 const baseline={...p.attributes};
 for(const [group,definition] of Object.entries(ATTRIBUTE_GROUPS))for(const key of Object.keys(definition.fields)){
  if(group==='goalkeeper'&&p.position!=='GK'||key==='aggression')continue;
  const relevant=POSITION_WEIGHTS[p.position][key]?1:p.position==='GK'&&group==='technical'?.15:.35;
  const dose=trainingDose?.[group]??weights[group]*trainingEfficiency(load)*healthy;
  const exposure=trainingShare*dose+(1-trainingShare)*experience;
  let rate=rates[group];
  if(group==='physical'&&['strength','balance','naturalFitness'].includes(key)&&rate<0)rate*=.45;
  const gain=rate>0?rate*room*attitude*traits.learningRate*exposure*overload*relevant:rate*(.85+(100-p.attributes.naturalFitness)/250);
  const rehabLoss=(1-healthy)*(group==='physical'?.8:group==='technical'?.25:0);
  p.attributes[key]=clamp(baseline[key]+(gain-rehabLoss)*days/365.25,1,99);
 }
 // Enforce the ceiling with unrounded ability: focused work cannot cross it.
 const gained=preciseRating(p)-current;
 if(gained>headroom){const ratio=headroom/gained;for(const key of ATTRIBUTE_KEYS)p.attributes[key]=baseline[key]+(p.attributes[key]-baseline[key])*ratio;}
 p.developmentAge=age+days/365.25;p.age=Math.floor(p.developmentAge+1e-9);
 p.injuryDays=Math.max(0,(p.injuryDays||0)-days);
 p.condition=clamp(p.condition+(8+p.attributes.naturalFitness*.1-load*12)*days/7,0,100);
 p.sharpness=clamp(p.sharpness+(minutes>0?Math.min(5,minutes/30):-2)*days/7,0,100);
 return p;
}
export function generateYouthPlayer({id,seed='academy',age=16,potential=80,position='CM',...options}={}){
 if(!Number.isInteger(age)||age<15||age>18||!Number.isFinite(potential)||potential<45||potential>99)throw Error('青训年龄或潜力无效');
 const r=rng(`youth:${seed}:${id}`),target=clamp(potential-(age===15?34:age===16?29:age===17?24:19)+(r.next()-.5)*6,20,potential-8);
 const p=generatePlayer({...options,id,seed,age,position,quality:target-7});
 const difference=target-preciseRating(p);for(const key of ATTRIBUTE_KEYS)if(position==='GK'||!(key in ATTRIBUTE_GROUPS.goalkeeper.fields))p.attributes[key]=clamp(p.attributes[key]+difference,1,99);
 p.potential=potential;p.sharpness=55;return p;
}
export function publicProfile(p){const {personality,potential,developmentAge,...visible}=structuredClone(p);return visible;}
export function averageQuality(team){return mean(selectLineup(team).map(s=>rating(team.roster.find(p=>p.id===s.id),s.position)));}
