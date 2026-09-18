import {available,selectLineup} from './players.js';
const mean=xs=>xs.length?xs.reduce((n,v)=>n+v,0)/xs.length:0;
export function tacticalAdvice(own,other,tactics,lineup){
 const selected=(lineup||selectLineup(own,tactics.formation)).map(slot=>own.roster.find(p=>p.id===slot.id)).filter(Boolean),opponent=other.roster.filter(available);
 const backs=selected.filter(p=>['CB','LB','RB'].includes(p.position)),attackers=opponent.filter(p=>['ST','LW','RW'].includes(p.position));
 const ownPace=mean(backs.map(p=>p.attributes.pace)),theirPace=mean(attackers.map(p=>p.attributes.pace)),condition=mean(selected.map(p=>p.condition));
 const notes=[`首发平均体能 ${Math.round(condition)}%；后卫速度 ${Math.round(ownPace)}，对方锋线速度 ${Math.round(theirPace)}。`];
 if(tactics.line==='high'&&theirPace>ownPace+3)notes.push('高位防线有身后风险，可考虑标准防线或回收。');
 if(tactics.pressing==='high'&&condition<85)notes.push('当前体能下持续高位逼抢负担较大，准备轮换或降低逼抢。');
 notes.push(tactics.passing==='direct'?'直传更快推进，传球成功率会降低。':tactics.passing==='short'?'短传提高成功率，推进速度较慢；对方高位逼抢会增加出球压力。':'混合传球兼顾推进与控球。');
 if(tactics.fullbacks==='overlap')notes.push('边后卫套上增加前场接应，注意身后保护。');
 if(tactics.tempo==='fast')notes.push('快节奏增加行动频率，同时降低传球成功率。');
 return notes;
}
export function matchEvidence(state,side){
 const a=state.teams[side].stats,b=state.teams[1-side].stats,rate=a.passes?Math.round(a.completed/a.passes*100):0;
 return [`射门 ${a.shots} : ${b.shots}；预期进球 ${a.xG.toFixed(2)} : ${b.xG.toFixed(2)}。`,`本队传球成功率 ${rate}%，${a.onTarget} 次射正。`,a.shots&&a.xG/a.shots<.09?'平均射门质量偏低，可观察是否需要更多禁区内机会。':b.xG>a.xG+.6?'对方机会质量占优，检查防线保护与体能。':'结合机会质量、体能和比分决定是否调整。'];
}
