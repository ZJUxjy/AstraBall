import {ATTRIBUTE_GROUPS,developmentStage} from './players.js';
import {developmentReport} from '../competitions/development.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const signed=n=>`${n>=0?'+':''}${n.toFixed(1)}`;
const names=Object.assign({},...Object.values(ATTRIBUTE_GROUPS).map(g=>g.fields));
function chart(points){
 if(points.length<2)return '<p class="growth-empty">推进赛历后记录成长</p>';
 const low=Math.floor(Math.min(...points.map(p=>p.ability))-1),high=Math.ceil(Math.max(...points.map(p=>p.ability))+1),span=high-low;
 const coords=points.map((p,i)=>[36+i*464/(points.length-1),130-(p.ability-low)*110/span]);
 return `<svg class="growth-chart" viewBox="0 0 530 166" role="img" aria-label="近期能力从 ${points[0].ability.toFixed(1)} 变为 ${points.at(-1).ability.toFixed(1)}"><path d="M36 20H500M36 75H500M36 130H500" class="growth-grid"/><text x="5" y="25">${high}</text><text x="5" y="135">${low}</text><polyline points="${coords.map(c=>c.join(',')).join(' ')}"/>${coords.map(([x,y])=>`<circle cx="${x}" cy="${y}" r="3"/>`).join('')}<text x="36" y="158">${points[0].date.slice(5)}</text><text x="500" y="158" text-anchor="end">${points.at(-1).date.slice(5)}</text></svg>`;
}
export function playerGrowthPanel(s,p,{editable=false}={}){
 const report=developmentReport(s,p);if(!report)return '';
 const allowed=editable&&!p.retired&&s.manager?.clubId===p.club,disabled=s.activeMatch?'disabled':'';
 const training=[['balanced','综合训练'],...Object.entries(ATTRIBUTE_GROUPS).filter(([key])=>key!=='goalkeeper'||p.position==='GK').map(([key,g])=>[key,g.label])];
 return `<section class="growth-panel"><div class="growth-heading"><h3>个人成长</h3><span>${p.retired?'已退役':developmentStage(p)}</span></div><div class="growth-stats"><div><strong>${signed(report.gain)}</strong><span>本季能力变化</span></div><div><strong>${Math.round(report.minutes)}</strong><span>本季正式出场分钟</span></div><div><strong>${report.appearances}</strong><span>本季出场次数</span></div></div>
 ${chart(report.history)}${allowed?`<div class="growth-training"><label>训练方向<select data-growth="focus" data-growth-player="${esc(p.id)}" ${disabled}>${training.map(([id,label])=>`<option value="${id}" ${report.plan.focus===id?'selected':''}>${label}</option>`).join('')}</select></label><label>训练负荷<select data-growth="load" data-growth-player="${esc(p.id)}" ${disabled}>${[[.3,'轻量'],[.6,'标准'],[.9,'高强度']].map(([id,label])=>`<option value="${id}" ${report.plan.load===id?'selected':''}>${label}</option>`).join('')}</select></label><span id="growth-notice" role="status">${s.activeMatch?'比赛结束后可调整':'自动保存'}</span></div>`:''}
 ${report.changes.length?`<div class="growth-changes">${report.changes.map(x=>`<span>${names[x.key]} <b class="${x.change<0?'decline':''}">${signed(x.change)}</b></span>`).join('')}</div>`:''}
 ${report.annual.length?`<details class="growth-history"><summary>历年成长</summary><div class="growth-history-table"><table><thead><tr><th>赛季</th><th>能力</th><th>变化</th><th>出场分钟</th></tr></thead><tbody>${report.annual.slice().reverse().map(x=>`<tr><td>${x.year}</td><td>${x.ability.toFixed(1)}</td><td>${signed(x.gain)}</td><td>${Math.round(x.minutes)}</td></tr>`).join('')}</tbody></table></div></details>`:''}</section>`;
}
