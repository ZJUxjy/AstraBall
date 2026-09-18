import {regions,cities} from '../world.js';
import {LOCAL_TIERS} from './local-catalog.js';
import {worldClubRanking} from './reputation.js';
import {loadSeason,peekSeason} from './store.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LEVEL_LABELS={core:'职业联赛',...Object.fromEntries(Object.entries(LOCAL_TIERS).map(([k,v])=>[k,v.name]))};
const regionName=id=>regions.find(r=>r.id===id)?.name||id||'—';
const cityName=id=>cities.find(c=>c.id===id)?.name||'—';
let root,token=0,region='all',level='all',keyword='';
export function rankingContent(s,{region='all',level='all',keyword=''}={}){
 const all=worldClubRanking(s),rows=all.filter(r=>(region==='all'||r.region===region)&&(level==='all'||r.level===level)&&(!keyword||r.name.includes(keyword)));
 const counts=all.reduce((n,r)=>(n[r.level]=(n[r.level]||0)+1,n),{});
 const options=(list,value)=>list.map(([id,name])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(name)}</option>`).join('');
 const table=`<div class="manager-table-wrap"><table class="manager-table"><thead><tr>${['排名','俱乐部','大区','城市','所属赛事','声望'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${i+1}</td><td>${r.level==='core'?`<a href="#squad/${esc(r.id)}/overview">${esc(r.name)}</a>`:esc(r.name)}</td><td>${esc(regionName(r.region))}</td><td>${esc(cityName(r.city))}</td><td>${esc(r.divisionName)}</td><td>${Math.round(r.reputation).toLocaleString('zh-CN')}</td></tr>`).join('')}</tbody></table></div>`;
 return `<header class="football-title"><div><small>${s?.date||''}</small><h1>世界俱乐部排名</h1></div><a href="#economy">地方足球与经济 ↗</a></header>
 <div class="manager-stats manager-season-stats">${[[rows.length,'符合条件俱乐部'],[counts.core||0,'职业联赛'],[counts.professional||0,'省级职业'],[(counts.semi||0)+(counts.amateur||0),'半职业与业余']].map(([n,label])=>`<div><strong>${n.toLocaleString('zh-CN')}</strong><span>${label}</span></div>`).join('')}</div>
 <section class="manager-panel"><div class="records-filters"><label>大区<select data-ranking-region>${options([['all','全部大区'],...regions.map(r=>[r.id,r.name])],region)}</select></label><label>层级<select data-ranking-level>${options([['all','全部层级'],...Object.entries(LEVEL_LABELS)],level)}</select></label><label>名称<input data-ranking-keyword type="search" value="${esc(keyword)}" placeholder="俱乐部名称"></label></div>
 <p>声望按全部成员俱乐部排序；胜负改变声望，强者赢得少、弱者赢得多，升降级另有一次性增减。</p>${table}</section>`;
}
function draw(){if(root)root.innerHTML=rankingContent(peekSeason(),{region,level,keyword});}
export function renderRanking(){return '<section class="football-page" id="ranking-root"><p role="status">正在读取俱乐部排名…</p></section>';}
export function disposeRanking(){token++;root=null;}
export async function mountRanking(){const current=++token;root=document.querySelector('#ranking-root');try{await loadSeason();if(current!==token)return;draw();root.addEventListener('change',ev=>{const el=ev.target;if(el.hasAttribute('data-ranking-region'))region=el.value;else if(el.hasAttribute('data-ranking-level'))level=el.value;else return;draw();});root.addEventListener('input',ev=>{if(ev.target.hasAttribute('data-ranking-keyword')){keyword=ev.target.value.trim();draw();}});}catch(error){if(current===token)root.innerHTML=`<p role="alert">${esc(error.message)}</p>`;}}
