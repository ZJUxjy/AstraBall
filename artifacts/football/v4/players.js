import {rng,clamp,mean} from './random.js';
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
export function familiarity(player,position){if(player.position===position)return 1;if(player.secondary?.includes(position))return .95;if(player.position==='GK'||position==='GK')return .3;const groups=[['CB','LB','RB','DM'],['DM','CM','AM'],['LW','RW','AM','ST']];return groups.some(g=>g.includes(player.position)&&g.includes(position))?.83:.65;}
const surname=['沈','陆','许','周','林','陈','方','顾','叶','江','白','程','黎','赵','吴','梁','宋','徐','谢','唐'];
const given=['子昂','明川','柏舟','启辰','远航','景行','泽宇','云帆','知衡','承安','望舒','时雨','怀瑾','星野','沐阳','庭山','砚清','书言','浩然','凌风'];
export function generatePlayer({id,seed='318',position='CM',quality=68,name,age,identity={}}={}){
 if(!id||!POSITIONS[position])throw Error('球员身份或位置无效');const r=rng(`${seed}:${id}`),attributes={};
 for(const key of ATTRIBUTE_KEYS){const important=POSITION_WEIGHTS[position][key]||0;const isGK=key in ATTRIBUTE_GROUPS.goalkeeper.fields;
   attributes[key]=Math.round(clamp(quality+(important?7:0)+r.normal()*9-(isGK&&position!=='GK'?48:0)-(position==='GK'&&!isGK&&key in ATTRIBUTE_GROUPS.technical.fields?20:0),1,99));}
 const personality=Object.fromEntries(Object.keys(PERSONALITY).map(k=>[k,Math.round(clamp(55+r.normal()*18,5,95))]));
 const years=age??r.int(18,33),current=rating({position,attributes});
 return {id,name:name||surname[r.int(0,surname.length-1)]+given[r.int(0,given.length-1)],age:years,position,secondary:position==='CM'?['DM','AM']:position==='LW'?['RW']:position==='RB'?['LB']:[],attributes,personality,potential:Math.min(99,current+(years<24?r.int(6,20):r.int(0,5))),height:position==='GK'||position==='CB'?r.int(182,198):r.int(169,191),weight:r.int(67,89),foot:r.next()<.23?'left':'right',weakFoot:r.int(30,85),condition:100,sharpness:80,morale:65,injuryDays:0,suspended:0,retired:false,...identity};
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
export function developWeek(player,{seed='week',training='balanced',minutes=0,load=.6}={}){
 const p=structuredClone(player),r=rng(`${seed}:${p.id}`);if(p.retired)return p;
 p.injuryDays=Math.max(0,p.injuryDays-7);p.condition=clamp(p.condition+8+p.attributes.naturalFitness*.1-load*12,0,100);
 p.sharpness=clamp(p.sharpness+(minutes>0?Math.min(5,minutes/30):-2),0,100);
 const growth=p.age<23?.18:p.age<28?.055:p.age>31?-.08:0;
 const headroom=clamp((p.potential-rating(p))/15,0,1);
 const attitude=(p.personality.professionalism+p.personality.ambition)/140;
 for(const k of ATTRIBUTE_KEYS){const focus=training==='balanced'||k in (ATTRIBUTE_GROUPS[training]?.fields||{});const loss=p.age>31&&k in ATTRIBUTE_GROUPS.physical.fields?1.8:1;
   const change=growth>0?growth*headroom*attitude*(focus?1.2:.6)*(player.injuryDays?0:1)*(1+Math.min(minutes,180)/360):growth*loss;
   p.attributes[k]=clamp(p.attributes[k]+change*(.75+r.next()*.5),1,99);}
 return p;
}
export function publicProfile(p){const {personality,potential,...visible}=structuredClone(p);return visible;}
export function averageQuality(team){return mean(selectLineup(team).map(s=>rating(team.roster.find(p=>p.id===s.id),s.position)));}
