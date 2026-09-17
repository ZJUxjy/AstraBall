import {clamp} from './random.js';

// Persistent fatigue is separate from the match engine's short-term condition.
export const fatiguePenalty=fatigue=>clamp(fatigue||0,0,100)*.2;
export function dailyWorkload({fatigue=0,load=.6,condition=100,injured=false,fitness=50,nextMatchDays=null}){
 const intensity=load===.3?.62:load===.9?1.3:1;
 const stress=injured?0:load===.3?.5:load===.9?5.5:2;
 const recovery=2.5+clamp(fitness,1,99)*.02;
 const freshness=1-.75*clamp(fatigue,0,100)/100;
 const taper=load===.9&&nextMatchDays!==null&&nextMatchDays<=1?.75:1;
 return {dose:injured?0:intensity*freshness*taper*(.65+.35*clamp(condition/80)),fatigue:clamp(fatigue+stress-recovery,0,100)};
}
export function matchFatigue(fatigue,minutes){return clamp((fatigue||0)+minutes*.14,0,100);}
export function workloadAdvice({fatigue=0,recentMinutes=0,nextMatchDays=null,condition=100,injured=false}){
 if(injured)return {recommendedLoad:.3,reason:'伤停恢复'};
 if(fatigue>=30||condition<75)return {recommendedLoad:.3,reason:'疲劳较高，优先恢复'};
 if(nextMatchDays!==null&&nextMatchDays<=1)return {recommendedLoad:.3,reason:'比赛临近，保留体能'};
 if(recentMinutes>=150)return {recommendedLoad:.3,reason:'近期出场密集'};
 if(fatigue<10&&condition>=90&&recentMinutes<90&&(nextMatchDays===null||nextMatchDays>=4))return {recommendedLoad:.9,reason:'体能充足，可短期加练'};
 return {recommendedLoad:.6,reason:'保持常规训练'};
}
