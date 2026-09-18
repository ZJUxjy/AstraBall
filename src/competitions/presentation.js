import {formatMoney} from '../format.js';
import {clubIdentity} from './team-directory.js';
import {cities} from '../world.js';
import {getDivision} from './catalog.js';
import {fixtureSides,tableFor,seasonPlayer} from './runtime.js';
import {clubProfile} from './club-profiles.js';
import {clubPlayers} from './population.js';
import {wageBill} from './market.js';

export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money=value=>formatMoney(value,{currency:true});
export function rosterStatistics(season,clubId){
 const result=new Map();
 for(const match of season?.fixtures||[]){
  if(!match.score||match.bye)continue;
  const side=match.home===clubId?0:match.away===clubId?1:-1;
  if(side<0)continue;
  for(const line of match.report?.players?.[side]||[]){
   if(!(line.minutes>0))continue;
   const row=result.get(line.id)||{appearances:0,minutes:0,goals:0,assists:0,yellow:0,red:0};
   row.appearances++;for(const key of ['minutes','goals','assists','yellow','red'])row[key]+=line[key]||0;
   result.set(line.id,row);
  }
 }
 return result;
}
export function recentForm(season,id,competition){
 return (season?.fixtures||[]).filter(m=>m.score&&!m.bye&&(!competition||m.competition===competition)&&(m.home===id||m.away===id)).sort((a,b)=>a.date.localeCompare(b.date)).slice(-5).map(m=>{const side=m.home===id?0:1;return {date:m.date,score:m.score.join(' : '),result:m.score[side]>m.score[1-side]?'win':m.score[side]<m.score[1-side]?'loss':'draw'};});
}
export function formMarkup(season,id,competition){const rows=recentForm(season,id,competition);return `<span class="form-strip" aria-label="最近五场">${rows.length?rows.map(r=>`<span class="form-${r.result}" title="${r.date} · ${r.score}">${{win:'胜',draw:'平',loss:'负'}[r.result]}</span>`).join(''):'<span class="form-empty">暂无比赛</span>'}</span>`;}
export function clubNavigation(id,active='overview'){
 return `<nav class="desk-tabs" aria-label="俱乐部栏目">${[['overview','俱乐部总览',`#squad/${id}/overview`],['squad','球队阵容',`#squad/${id}`],['calendar','俱乐部日历',`#match/calendar/all/${id}`],['schedule','俱乐部赛程',`#match/schedule/all/${id}`]].map(([key,label,url])=>`<a href="${url}" ${key===active?'aria-current="page"':''}>${label}</a>`).join('')}</nav>`;
}
export function clubOverview(s,id){
 const c=clubIdentity(id),d=Object.keys(s.members).find(d=>s.members[d].includes(id)),division=getDivision(d),table=d?tableFor(s,d):[],rank=table.findIndex(r=>r.id===id),row=table[rank];
 const account=s.economy?.accounts[id],profile=clubProfile(id),roster=clubPlayers(s,id).map(p=>seasonPlayer(s,p.id)),youth=clubPlayers(s,id,{unit:'youth'}),bill=account?wageBill(s,id):0;
 const fixtures=s.fixtures.filter(m=>!m.bye&&Object.values(fixtureSides(s,m)).includes(id)),upcoming=fixtures.filter(m=>!m.score).slice(0,4),recent=fixtures.filter(m=>m.score).slice(-4).reverse();
 const panel=(title,body,cls='')=>`<section class="desk-panel ${cls}"><h2>${title}</h2>${body}</section>`;
 const facts=rows=>`<dl class="desk-facts">${rows.map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
 const matches=rows=>rows.map(m=>{const sides=fixtureSides(s,m),home=sides.home===id,opp=clubIdentity(home?sides.away:sides.home);return `<a class="desk-fixture" href="#match/schedule/${m.competition}/${id}"><time>${m.date.slice(5)}</time><span>${escapeHTML(opp?.name||'待定')}<small>${home?'主场':'客场'} · ${escapeHTML(getDivision(m.competition)?.name||'淘汰赛')}</small></span><b>${m.score?m.score.join(' : '):m.time}</b></a>`;}).join('')||'<p class="desk-empty">暂无比赛</p>';
 return `<header class="desk-identity"><div><small>${escapeHTML(division?.name||'俱乐部')} · ${s.year} 赛季</small><h1>${escapeHTML(c.name)}</h1><p>${escapeHTML(cities.find(x=>x.id===c.city)?.name||'')} · ${c.founded} 年成立</p></div><div class="desk-identity-fact"><span>联赛排名</span><strong>${row?.played?row.rank:'—'} <small>/ ${table.length}</small></strong></div><div class="desk-identity-fact"><span>联赛积分</span><strong>${row?.points??0}</strong></div><a class="football-primary" href="#squad/${id}">查看阵容</a></header>${clubNavigation(id)}<div class="club-desk-grid">
 ${panel('俱乐部',facts([['所属赛事',`<a href="#match/overview/${d}">${escapeHTML(division?.name||'—')}</a>`],['所有权',escapeHTML(profile.owner)],['俱乐部声望',Math.round(account?.reputation??profile.initialReputation).toLocaleString('zh-CN')],['一线队 / 青年队',`${roster.length} / ${youth.length} 人`]])+formMarkup(s,id))}
 ${panel('联赛位置',`<table class="desk-table"><thead><tr><th>排名</th><th>球队</th><th>赛</th><th>积分</th></tr></thead><tbody>${table.slice(Math.max(0,rank-2),Math.max(0,rank-2)+5).map(r=>`<tr class="${r.id===id?'is-own':''}"><td>${r.played?r.rank:'—'}</td><td><a href="#squad/${r.id}/overview">${escapeHTML(clubIdentity(r.id)?.name)}</a></td><td>${r.played}</td><td><b>${r.points}</b></td></tr>`).join('')}</tbody></table><a class="desk-panel-link" href="#match/table/${d}">完整积分榜</a>`)}
 ${panel('下一场比赛',matches(upcoming.slice(0,1))+facts([['可用球员',`${roster.filter(p=>!p.injuryDays&&!p.suspended).length} / ${roster.length}`],['当前日期',s.date]])+`<a class="desk-panel-link" href="${s.manager?.clubId===id?'#manager':`#squad/${id}`}">${s.manager?.clubId===id?'经理工作台':'查看球员状态'}</a>`)}
 ${panel('财政',account?`<div class="desk-total"><span>现金余额</span><strong>${money(account.cash)}</strong></div>${facts([['转会预算',money(Math.max(0,account.transferBudget-account.spent))],['周薪支出',money(bill)],['周薪软线',money(account.wageLimit)]])}<progress value="${Math.min(bill,account.wageLimit)}" max="${account.wageLimit||1}" aria-label="工资预算使用"></progress><p>${(bill/Math.max(1,account.wageLimit)*100).toFixed(1)}% 工资预算使用</p>${s.manager?.clubId===id?'<a class="desk-panel-link" href="#finance">财政账本</a>':''}`:'<p class="desk-empty">暂无财务记录</p>')}
 ${panel('后续赛程',matches(upcoming))}${panel('近期赛果',matches(recent))}
 ${panel('球员与培养',facts([['一线队人数',roster.length],['青年队人数',youth.length],['平均年龄',roster.length?(roster.reduce((n,p)=>n+s.year-p.birthYear,0)/roster.length).toFixed(1)+' 岁':'—']])+`<a class="desk-panel-link" href="#squad/${id}/unit/youth">青年队名单</a>`)}
 ${panel('赛季表现',facts([['胜 / 平 / 负',`${row?.won??0} / ${row?.drawn??0} / ${row?.lost??0}`],['进球 / 失球',`${row?.gf??0} / ${row?.ga??0}`],['净胜球',row?.gd??0]]))}
 ${panel('赛事规则',facts([['常规赛',`${division?.rounds??'—'} 轮`],['参赛球队',`${table.length} 队`],['比赛积分','胜 3 · 平 1 · 负 0']])+`<a class="desk-panel-link" href="#leagues/${c.league}/${division?.tier||1}/rules">报名与竞赛规则</a>`)}
 </div>`;
}
