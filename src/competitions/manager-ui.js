import {clubs,cities} from '../world.js';
import {footballTeams} from '../football/data.js';
import {available,averageQuality} from '../football/players.js';
import {leagueSystems,getDivision} from './catalog.js';
import {loadSeason,peekSeason,takeClub,advanceDay,newSeason} from './store.js';
import {tableFor,fixtureSides,seasonTeam,nextDate} from './runtime.js';
import {nextManagedFixture,readyManagedFixture,managedDivision,goalProgress,seasonGoal} from './career.js';
import {dateOf} from './calendar.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const club=id=>clubs.find(t=>t.id===id),name=id=>club(id)?.name||'待定';
const md=date=>`${Number(date.slice(5,7))} 月 ${Number(date.slice(8))} 日`;
const competition=id=>getDivision(id)?.name||leagueSystems.find(s=>s.cup?.id===id)?.cup.name||(id==='global-cup'?'全球冠军杯':id==='closed-playoffs'?'星冠季后赛':'升级附加赛');
let root=null,generation=0,cleanup=()=>{},system='closed',division='closed',selected='sky',busy=false,message='';
const options=(list,value)=>list.map(([id,label])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(label)}</option>`).join('');

function selection(s){
 const divisions=leagueSystems.find(x=>x.id===system).levels;
 if(!divisions.some(d=>d.id===division))division=divisions[0].id;
 const ids=s.members[division];if(!ids.includes(selected))selected=ids[0];
 const t=seasonTeam(s,selected),c=club(selected),goal=seasonGoal(s,selected);
 return `<header class="football-title"><div><small>${s.year} 赛季 · 俱乐部经理兼主教练</small><h1>接手俱乐部</h1></div><a class="football-link" href="#world/all">查看世界 ↗</a></header>
 <div class="manager-selection"><section class="manager-panel"><h2>选择球队</h2><div class="manager-selects"><label>赛事体系<select data-system>${options(leagueSystems.map(x=>[x.id,x.name]),system)}</select></label><label>联赛级别<select data-division>${options(divisions.map(x=>[x.id,x.name]),division)}</select></label><label>俱乐部<select data-club>${options(ids.map(id=>[id,name(id)]),selected)}</select></label></div></section>
 <section class="manager-panel manager-club"><span class="manager-kicker">${esc(getDivision(division).name)}</span><h2>${esc(t.name)}</h2><p>${esc(cities.find(x=>x.id===c.city)?.name||'')} · ${c.founded} 年成立</p><div class="manager-stats"><div><strong>${t.roster.length}</strong><span>一线队球员</span></div><div><strong>${Math.round(averageQuality(t))}</strong><span>首发平均能力</span></div></div><div class="manager-objective"><span>赛季目标</span><strong>${goal.label}</strong></div><div class="manager-actions"><button class="football-primary" data-manager="appoint" ${busy?'disabled':''}>接手${esc(t.name)}</button><a class="football-link" href="#squad/${t.id}">查看阵容 ↗</a></div></section></div>`;
}
function fixtureRow(s,m){
 const sides=fixtureSides(s,m),own=s.manager.clubId,home=sides.home===own,opponent=home?sides.away:sides.home;
 return `<li><time>${md(m.date)}<small>${competition(m.competition)}</small></time><a href="#squad/${opponent}">${esc(name(opponent))}<small>${m.neutral?'中立场':home?'主场':'客场'}</small></a><strong>${m.score?m.score.join(' : '):'待赛'}</strong></li>`;
}
function dashboard(s){
 const own=s.manager.clubId,t=seasonTeam(s,own,nextManagedFixture(s)?.competition),d=managedDivision(s),next=nextManagedFixture(s),ready=readyManagedFixture(s),{goal,row,met}=goalProgress(s);
 const sides=next&&fixtureSides(s,next),home=sides?.home===own,opponent=sides&&(home?sides.away:sides.home);
 const all=s.fixtures.filter(m=>!m.bye&&Object.values(fixtureSides(s,m)).includes(own)),recent=all.filter(m=>m.score).slice(-5).reverse(),upcoming=all.filter(m=>!m.score).slice(0,5);
 const issues=t.roster.filter(p=>!available(p)||p.condition<80),table=tableFor(s,d),rank=table.findIndex(r=>r.id===own),nearby=table.slice(Math.max(0,rank-2),Math.max(0,rank-2)+5);
 const final=Boolean(s.summary),goalStatus=row.played?(met?(final?'已达成':'当前达标'):(final?'未达成':'尚未达标')):'尚未开赛';
 return `<header class="football-title"><div><small>${s.year} 赛季 · ${esc(getDivision(d).name)} · ${md(s.date)}</small><h1>${esc(name(own))}</h1></div><a class="football-link" href="#squad/${own}">球队阵容 ↗</a></header>
 <div class="manager-stats manager-season-stats"><div><strong>${row.played?row.rank:'—'}<small> / ${table.length}</small></strong><span>联赛排名</span></div><div><strong>${row.points}</strong><span>联赛积分</span></div><div><strong>${row.won}<small> / ${row.drawn} / ${row.lost}</small></strong><span>胜 / 平 / 负</span></div><div><strong>${t.roster.filter(available).length}<small> / ${t.roster.length}</small></strong><span>可用球员</span></div></div>
 <div class="manager-grid"><section class="manager-panel manager-next"><span class="manager-kicker">${s.activeMatch?'比赛进行中':next?'下一场比赛':'赛季收官'}</span>${next?`<p>${md(next.date)} · ${competition(next.competition)} · ${next.neutral?'中立场':home?'主场':'客场'}</p><h2>${esc(name(own))}<span>对</span>${esc(name(opponent))}</h2><a class="football-link" href="#squad/${opponent}">查看对手阵容 ↗</a>`:`<h2>${final?'赛季已结算':'本队赛事已结束'}</h2><p>${final?'冠军、升降级与下赛季资格已确认':'继续推进，等待全部赛事结束'}</p>`}
 <div class="manager-actions">${ready||s.activeMatch?'<a class="football-primary" href="#coach">'+(s.activeMatch?'继续执教':'赛前布置 →')+'</a>':`<button class="football-primary" data-manager="${final&&s.date===dateOf(s.year,12,31)?'new':'advance'}" ${busy?'disabled':''}>${final&&s.date===dateOf(s.year,12,31)?`进入 ${s.year+1} 赛季`:next?'前往下一场比赛 →':'完成全年赛历 →'}</button>`}${busy?'<button data-manager="pause">暂停推进</button>':''}<a class="football-link" href="#match/schedule/${d}">比赛中心 ↗</a></div></section>
 <section class="manager-panel"><span class="manager-kicker">赛季目标</span><h2>${goal.label}</h2><p class="manager-goal-status">${goalStatus}</p><div class="manager-objective"><span>执教起始</span><strong>${Number(s.manager.appointed.slice(0,4))} 年 ${md(s.manager.appointed)}</strong></div>${final?`<a class="football-link" href="#match/summary/all">赛季结果 ↗</a>`:`<p>${row.played} / ${getDivision(d).rounds} 轮已完成</p>`}</section>
 <section class="manager-panel"><h2>阵容待办 <small>${issues.length}</small></h2>${issues.length?`<ul class="manager-issues">${issues.map(p=>`<li><a href="#squad/${own}/${p.id}">${esc(p.name)}</a><span>${p.injuryDays?`伤停 ${p.injuryDays} 天`:p.suspended?`停赛 ${p.suspended} 场`:`体能 ${Math.round(p.condition)}%`}</span></li>`).join('')}</ul>`:'<p>全员可出场</p>'}<a class="football-link" href="#squad/${own}">查看球员状态 ↗</a></section>
 <section class="manager-panel"><h2>联赛位置</h2><div class="manager-table-wrap"><table class="manager-table"><thead><tr><th>名次</th><th>球队</th><th>场次</th><th>净胜球</th><th>积分</th></tr></thead><tbody>${nearby.map(r=>`<tr class="${r.id===own?'own':''}"><td>${r.played?r.rank:'—'}</td><td>${esc(name(r.id))}</td><td>${r.played}</td><td>${r.gd}</td><td>${r.points}</td></tr>`).join('')}</tbody></table></div><a class="football-link" href="#match/table/${d}">完整积分榜 ↗</a></section>
 <section class="manager-panel"><h2>近期赛果 <small>主队 : 客队</small></h2>${recent.length?`<ul class="manager-fixtures">${recent.map(m=>fixtureRow(s,m)).join('')}</ul>`:'<p>暂无已完成比赛</p>'}</section>
 <section class="manager-panel"><h2>后续赛程</h2>${upcoming.length?`<ul class="manager-fixtures">${upcoming.map(m=>fixtureRow(s,m)).join('')}</ul>`:'<p>暂无已确定的对阵</p>'}</section></div>`;
}
function draw(){if(!root)return;const s=peekSeason();root.innerHTML=(s.manager?dashboard(s):selection(s))+`<p class="manager-status" role="status" aria-live="polite">${esc(message||'本地自动存档')}</p>`;
 const date=document.querySelector('.topbar .date');if(date)date.innerHTML=`<span>殖民历</span> ${s.year} <span>年 ${md(s.date)}</span>`;
}
export function renderManager(){return '<section class="football-page manager-page" id="manager-root"><p role="status">正在读取俱乐部…</p></section>';}
export function disposeManager(){generation++;busy=false;cleanup();root=null;}
export async function mountManager(){
 root=document.querySelector('#manager-root');const token=++generation;
 try{await loadSeason();if(token!==generation)return;draw();}catch(error){if(token===generation)root.innerHTML=`<h1>经理首页</h1><p role="alert">${esc(error.message)}</p>`;return;}
 const click=async ev=>{
  const action=ev.target.closest('[data-manager]')?.dataset.manager;if(!action)return;
  if(action==='pause'){busy=false;message='正在暂停…';draw();return;}if(busy)return;
  busy=true;message=action==='advance'?'正在推进赛历…':'正在保存…';draw();
  try{
   if(action==='appoint')await takeClub(selected);
   if(action==='new')await newSeason();
   if(action==='advance')while(token===generation&&busy){
    const s=peekSeason();if(s.activeMatch||readyManagedFixture(s))break;
    const date=nextDate(s);if(!date)break;
    await advanceDay(date,{shouldStop:()=>!busy||token!==generation,onProgress:(n,total)=>{if(token!==generation)return;const status=root.querySelector('.manager-status');if(status)status.textContent=`${md(date)} · ${n} / ${total} 场`;}});
   }
   message='已保存';
   if(action==='appoint')window.dispatchEvent(new Event('careerchange'));
  }catch(error){message=error.message;}
  finally{if(token===generation){busy=false;draw();}}
 };
 const change=ev=>{if(busy)return;const el=ev.target;if(el.hasAttribute('data-system'))system=el.value;else if(el.hasAttribute('data-division'))division=el.value;else if(el.hasAttribute('data-club'))selected=el.value;else return;draw();};
 root.addEventListener('click',click);root.addEventListener('change',change);const mounted=root;cleanup=()=>{mounted.removeEventListener('click',click);mounted.removeEventListener('change',change);};
}
