import {positionOrder} from './list-sort.js';
import {preciseRating} from './football/players.js';
import {findFootballPlayer} from './football/data.js';
import {peekSeason} from './competitions/store.js';
import {populationPlayer} from './competitions/population.js';
import {developedPlayer} from './competitions/development.js';
import { geography as geo, inside, polygonPath, formatPopulation, formatArea } from './geography/generate.js';
import { clubs, academies, players, leagues, drafts, byId, location } from './world.js';
import { zoomCamera, wheelCamera } from './map-input.js';

const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const at = id => geo.cities.find(c => c.id === id);
const href = (kind, id) => `#world/${kind}/${id}`;
const link = (kind, item, content, className = '') => `<a class="${className}" href="${href(kind,item.id)}">${content || escape(item.name)}</a>`;
function riverPath(points) {
  let path=`M${points[0]}`;
  for(let i=0;i<points.length-1;i++){
    const a=points[Math.max(0,i-1)],b=points[i],c=points[i+1],d=points[Math.min(points.length-1,i+2)];
    path+=`C${b[0]+(c[0]-a[0])/6},${b[1]+(c[1]-a[1])/6} ${c[0]-(d[0]-b[0])/6},${c[1]-(d[1]-b[1])/6} ${c}`;
  }
  return path;
}
function lakePath(points) {
  const mid=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
  let path=`M${mid(points.at(-1),points[0])}`;
  points.forEach((p,i)=>{path+=`Q${p} ${mid(p,points[(i+1)%points.length])}`;});
  return path+'Z';
}
function provinceLabelPoint(province) {
  // 省名放在省域内部的留白处，不沿用省会城市的位置。
  const b=province.bounds,edges=province.polygons.flatMap(p=>p.map((a,i)=>[a,p[(i+1)%p.length]]));
  let point=province.center,best=-1;
  for(let y=1;y<12;y++)for(let x=1;x<12;x++){
    const p=[b.x+b.width*x/12,b.y+b.height*y/12];
    if(!inside(p,province.polygons))continue;
    const distance=Math.min(...edges.map(([a,c])=>{
      const dx=c[0]-a[0],dy=c[1]-a[1],length=dx*dx+dy*dy;
      const t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;
      return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
    }));
    if(distance>best){best=distance;point=p;}
  }
  return point;
}
const symbol = name => ({search:'⌕',plus:'+',minus:'−',fit:'⌖',home:'⌂',arrow:'↗',back:'‹',close:'×'}[name] || name);
const button = (action, label, icon) => `<button type="button" data-map-action="${action}" title="${label}" aria-label="${label}">${symbol(icon)}</button>`;

export function parseAtlasRoute(hash) {
  const parts = hash.replace(/^#/, '').split('/');
  if (['region','province','city'].includes(parts[1])) {
    const list = parts[1] === 'region' ? geo.regions : parts[1] === 'province' ? geo.provinces : geo.cities;
    const entity = list.find(x => x.id === parts[2]);
    if (entity) return { kind: parts[1], entity };
  }
  const legacy = geo.regions.find(r => r.id === parts[1]);
  return legacy ? { kind:'region', entity:legacy } : {kind:'planet',entity:geo};
}

function ancestors(selection) {
  const {kind,entity} = selection;
  const province = kind === 'province' ? entity : kind === 'city' ? byId(geo.provinces,entity.province) : null;
  const region = kind === 'region' ? entity : province ? byId(geo.regions,province.region) : null;
  return {province,region};
}

function cityLink(city, detail = '') {
  return link('city', city, `<span class="city-list-dot ${city.isRegionalCapital?'regional':city.isCapital?'capital':''}"></span><span><strong>${escape(city.name)}</strong><small>${escape(detail || city.role)}</small></span><span class="atlas-list-value">${formatPopulation(city.populationUnits)}</span><span class="atlas-row-arrow">›</span>`, 'atlas-list-row');
}

function provinceLink(province) {
  return link('province', province, `<span><strong>${province.name}</strong><small>${at(province.capital).name} · ${province.terrain}</small></span><span class="atlas-list-value">${formatPopulation(province.populationUnits)}</span><span class="atlas-row-arrow">›</span>`, 'atlas-list-row');
}

function facts(entries) {
  return `<dl class="atlas-facts">${entries.map(([key,value])=>`<div><dt>${key}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
}

function football(selection) {
  const {kind,entity} = selection;
  const contains = city => kind === 'planet' || (kind === 'region' ? city.region === entity.id : kind === 'province' ? city.province === entity.id : city.id === entity.id);
  const localClubs = clubs.filter(c => contains(at(c.city)));
  const localAcademies = academies.filter(a => contains(at(a.city)));
  const localPlayers = players.filter(p => contains(at(p.city))).sort((a,b)=>b.reputation-a.reputation);
  const champions = drafts.filter(d => localPlayers.some(p => p.id === d.player));
  const playerData=p=>{const season=peekSeason(),base=(season&&populationPlayer(season,p.id))||findFootballPlayer(p.id),current=base&&season?developedPlayer(season,base):base;return `data-player-list-row data-name="${escape(p.name)}" data-age="${current?.age??p.age}" data-position="${positionOrder(current?.position||p.position)??''}" data-ability="${current?preciseRating(current):''}" data-wage="${season?.economy?.contracts[p.id]?.weeklyWage??''}"`;};
  const section = (title,html) => `<section class="atlas-football-section"><h3>${title}</h3>${html ? (title==='本地球员'?html:`<div data-sort-list="name">${html}</div>`) : '<p class="atlas-empty">暂无记录</p>'}</section>`;
  return `<div class="atlas-football-stats"><div><b>${localClubs.length}</b><span>俱乐部</span></div><div><b>${localAcademies.length}</b><span>培养机构</span></div><div><b>${champions.length}</b><span>历届状元</span></div></div><p class="atlas-count-note">球员按出生地归属</p>`
    + section('联赛体系', leagues.filter(l=>kind==='planet'||l.region===(kind==='region'?entity.id:at(kind==='city'?entity.id:entity.capital).region)).map(l=>`<a class="atlas-entity-link" href="#leagues/${l.id}/1/rules"><span><strong>${l.name}</strong><small>${l.system} · ${l.levels.length} 个级别</small></span><span>↗</span></a>`).join(''))
    + section('俱乐部', localClubs.map(c=>`<a class="atlas-entity-link" href="#player/lin/club/${c.id}"><span class="club-monogram">${c.short}</span><span><strong>${c.name}</strong><small>${byId(leagues,c.league).name}</small></span><span>↗</span></a>`).join(''))
    + section('培养机构', localAcademies.map(a=>`<a class="atlas-entity-link" href="#player/lin/academy/${a.id}"><span class="academy-monogram">学</span><span><strong>${a.name}</strong><small>${at(a.city).name}</small></span><span>↗</span></a>`).join(''))
    + section('本地球员', localPlayers.map(p=>`<a ${playerData(p)} class="atlas-entity-link" href="#player/${p.id}/place/city/${p.city}"><span class="player-monogram">${escape(p.name.slice(0,1))}</span><span><strong>${escape(p.name)}</strong><small>${p.age} 岁 · ${p.position} · ${p.retired?'已退役':at(p.city).name}</small></span><span>↗</span></a>`).join(''));
}

function drawerBody(selection) {
  const {kind,entity} = selection;
  const {province,region} = ancestors(selection);
  if (kind === 'planet') {
    return `${facts([['总人口','500 亿'],['陆域面积',formatArea(geo.landAreaKm2)],['行政区划','4 大区 · 36 省'],['重要城市','108 座']])}<h3 class="atlas-section-title">大区</h3><div class="region-directory" data-sort-list="name">${geo.regions.map(r=>link('region',r,`<span class="region-swatch" style="--region:${r.color}"></span><span><strong>${r.name}</strong><small>${geo.provinces.filter(p=>p.region===r.id).length} 省 · 首府 ${at(r.capital).name}</small></span><span class="atlas-list-value">${r.population} 亿</span><span>›</span>`,'atlas-list-row')).join('')}</div><h3 class="atlas-section-title">人口分布</h3><div class="population-bars">${geo.regions.map(r=>`<div><span>${r.name}</span><i style="--bar:${r.population/170*100}%;--region:${r.color}"></i><b>${r.population} 亿</b></div>`).join('')}</div>`;
  }
  if (kind === 'region') {
    const provinces = geo.provinces.filter(p=>p.region===entity.id);
    return `<p class="atlas-description">${entity.text}</p>${facts([['人口',`${entity.population} 亿`],['面积',formatArea(entity.areaKm2)],['首府',link('city',at(entity.capital))],['省份 / 重要城市',`${provinces.length} / ${provinces.length*3}`]])}<div class="atlas-tags">${entity.culture.split(' / ').map(s=>`<span>${s}</span>`).join('')}</div><h3 class="atlas-section-title">省份 <span>${provinces.length}</span></h3>${provinces.map(provinceLink).join('')}`;
  }
  if (kind === 'province') {
    const cities = geo.cities.filter(c=>c.province===entity.id);
    const neighbors = neighborProvinces(entity);
    return `${facts([['人口',formatPopulation(entity.populationUnits)],['面积',formatArea(entity.areaKm2)],['省会',link('city',at(entity.capital))],['所属大区',link('region',region)],['地形',entity.terrain],['主要产业',entity.economy]])}<h3 class="atlas-section-title">重要城市 <span>${cities.length}</span></h3>${cities.map(c=>cityLink(c,c.isCapital?'省会 · '+c.role:c.role)).join('')}${neighbors.length?`<h3 class="atlas-section-title">接壤省份</h3><div class="atlas-tags atlas-links">${neighbors.map(p=>link('province',p)).join('')}</div>`:''}`;
  }
  const routes = geo.routes.filter(r=>r.from===entity.id||r.to===entity.id);
  const coordinate = (v,positive,negative)=>`${Math.abs(v).toFixed(1)}°${v>=0?positive:negative}`;
  return `<div class="city-role">${entity.role}</div>${facts([['城市人口',formatPopulation(entity.populationUnits)],['建城年份',`${entity.founded} 年`],['所属省份',link('province',province)],['所属大区',link('region',region)],['纬度',coordinate(entity.latitude,'N','S')],['经度',coordinate(entity.longitude,'E','W')]])}<h3 class="atlas-section-title">交通 <span>${routes.length}</span></h3>${routes.map(r=>{const destination=at(r.from===entity.id?r.to:r.from);return link('city',destination,`<span class="transport-icon ${r.kind}">${r.kind==='air'?'↗':r.kind==='sea'?'≈':'═'}</span><span><strong>${destination.name}</strong><small>${r.kind==='air'?'航空':r.kind==='sea'?'海陆联运':'铁路'}</small></span><span class="atlas-list-value">≈${r.distance.toLocaleString()} km</span><span>›</span>`,'atlas-list-row');}).join('')}`;
}

let provinceAdjacency;
function neighborProvinces(province) {
  // 共享线段才算接壤。细化后的点数更多，建立一次索引而不逐点两两比较。
  if(!provinceAdjacency){
    provinceAdjacency=new Map(geo.provinces.map(p=>[p.id,new Set()]));
    const owners=new Map();
    for(const p of geo.provinces)for(const ring of p.polygons)for(let i=0;i<ring.length;i++){
      const a=ring[i].join(','),b=ring[(i+1)%ring.length].join(','),key=a<b?`${a}|${b}`:`${b}|${a}`;
      const other=owners.get(key);
      if(other&&other!==p.id){provinceAdjacency.get(p.id).add(other);provinceAdjacency.get(other).add(p.id);}
      else owners.set(key,p.id);
    }
  }
  return geo.provinces.filter(p=>provinceAdjacency.get(province.id).has(p.id));
}

let panelTab = 'overview';
let layer = 'political';
let mapCamera = null;
let lastSelection = '';
let dispose = () => {};

function drawer(selection) {
  const {kind,entity} = selection;
  const {province,region} = ancestors(selection);
  const rank = kind === 'planet'?'殖民星球':kind==='region'?'大区':kind==='province'?'省份':entity.isRegionalCapital?'大区首府':entity.isCapital?'省会':'重要城市';
  const crumbs = [`<a href="#world/all">全球</a>`];
  if(region) crumbs.push(link('region',region));
  if(province) crumbs.push(link('province',province));
  if(kind==='city') crumbs.push(`<span>${entity.name}</span>`);
  return `<aside class="atlas-drawer" aria-label="地区详情"><nav class="atlas-breadcrumb" aria-label="地图路径">${crumbs.join('<span aria-hidden="true">/</span>')}</nav><div class="atlas-drawer-heading"><div><span class="atlas-rank">${rank}</span><h2>${entity.name}</h2></div><span class="atlas-seal ${kind}" style="--region:${region?.color||'#c6b480'}">${kind==='city'?'◉':kind==='province'?'◇':kind==='planet'?'◎':'◈'}</span></div><div class="atlas-detail-tabs" aria-label="档案分类"><button data-detail-tab="overview" aria-pressed="${panelTab==='overview'}">概览</button><button data-detail-tab="football" aria-pressed="${panelTab==='football'}">足球</button></div><div class="atlas-drawer-scroll" tabindex="0">${panelTab==='overview'?drawerBody(selection):football(selection)}</div></aside>`;
}

function mapSvg(selection) {
  const {region: selectedRegion,province:selectedProvince} = ancestors(selection);
  const provinceId = selectedProvince?.id;
  const selectedCity = selection.kind === 'city' ? selection.entity.id : '';
  const graticule = [...Array.from({length:11},(_,i)=>`<path d="M${120*(i+1)},0V800"/>`),...Array.from({length:5},(_,i)=>`<path d="M0,${800/6*(i+1)}H1440"/>`)].join('');
  const provinceHues={metro:43,lima:176,liberlin:26,sichuan:91};
  const terrainColors=['#b7c79a','#a5b88a','#93a67c','#889674','#96947b','#b5ae92','#d8d2b8'];
  const relief=`<g class="physical-relief" pointer-events="none" clip-path="url(#terrain-mask)"><path fill="#c6d2aa" d="${polygonPath(geo.coastlines)}"/>${geo.contours.map((band,i)=>`<path fill="${terrainColors[i]}" d="${band.polygons.map(lakePath).join('')}" fill-rule="evenodd"/>`).join('')}<g filter="url(#relief-soften)">${geo.reliefCells.filter(c=>Math.abs(c.shade)>.08).map(c=>`<path fill="${c.shade>0?'#ffffff':'#263828'}" opacity="${Math.abs(c.shade)*.22}" d="${polygonPath([c.polygon])}"/>`).join('')}</g></g>`;
  const coast = `<path d="${polygonPath(geo.coastlines)}"/>`;
  const labels = geo.regions.map(r=>`<text class="map-region-label" x="${r.label[0]}" y="${r.label[1]}" data-region="${r.id}">${r.name}</text>`).join('');
  return `<svg class="planet-map" id="planet-map" viewBox="0 0 1440 800" role="group" tabindex="0" aria-label="星球地图，方向键移动，加减键缩放，Home 返回全图" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="terrain-mask"><path d="${polygonPath(geo.coastlines)}"/></clipPath><filter id="relief-soften" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="4"/></filter><radialGradient id="ocean-fill"><stop stop-color="#18343a"/><stop offset="1" stop-color="#0e232b"/></radialGradient><pattern id="ocean-grain" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="1" cy="2" r=".45" fill="#65858a" opacity=".12"/></pattern><filter id="land-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".085" numOctaves="3" seed="18" result="noise"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".13"/></feComponentTransfer><feComposite in2="SourceAlpha" operator="in"/><feBlend in="SourceGraphic" mode="soft-light"/></filter>${geo.regions.map(r=>`<clipPath id="clip-${r.id}"><path d="${polygonPath(r.polygons)}"/></clipPath>`).join('')}</defs><rect class="map-ocean" x="-2000" y="-1200" width="5400" height="3200" fill="url(#ocean-fill)"/><rect x="0" y="0" width="1440" height="800" fill="url(#ocean-grain)" pointer-events="none"/><g class="graticule">${graticule}</g><g class="ocean-depth depth-far">${coast}</g><g class="ocean-depth depth-near">${coast}</g><g class="shore-shelf">${coast}</g>${relief}<g class="landmasses">${geo.regions.map(r=>`<g class="map-region ${selectedRegion?.id===r.id?'is-selected':''}" data-region="${r.id}" style="--land:${r.color}"><path class="land-base" d="${polygonPath(r.polygons)}"/><g class="province-surfaces">${geo.provinces.filter(p=>p.region===r.id).map((p,i)=>`<path class="province-surface ${p.id===provinceId?'is-selected':''}" style="--tint:${[.06,.01,.1,.03,.08][i%5]};--province-color:hsl(${provinceHues[r.id]} 22% ${[72,83,65,78,69][i%5]}%)" data-map-kind="province" data-map-id="${p.id}" d="${polygonPath(p.polygons)}" role="button" tabindex="0" aria-label="${p.name}"><title>${p.name}</title></path>`).join('')}</g><g class="map-forests" clip-path="url(#clip-${r.id})">${geo.terrain.forests.filter(f=>f.region===r.id).map(f=>`<path d="M${f.at[0]},${f.at[1]-f.size}l${f.size*.65},${f.size*1.8}h${-f.size*1.3}Z"/>`).join('')}</g><g class="map-rivers" clip-path="url(#clip-${r.id})">${geo.rivers.filter(x=>x.regions.includes(r.id)).map(river=>`<path style="stroke-width:${Math.min(2.3,.4+Math.sqrt(river.discharge||50)*.035)}px" d="${riverPath(river.points)}"/>`).join('')}</g><g class="map-lakes">${geo.lakes.filter(l=>l.region===r.id).map(l=>`<path d="${lakePath(l.points)}"><title>${l.name}</title></path>`).join('')}</g><g class="map-mountains">${geo.terrain.mountains.filter(m=>m.region===r.id).map(m=>`<g transform="translate(${m.at.join(' ')})"><path d="M${-m.size},${m.size*.5}L0,${-m.size}L${m.size},${m.size*.5}Z"/><path class="mountain-light" d="M0,${-m.size}L${m.size},${m.size*.5}L${m.size*.2},0Z"/></g>`).join('')}</g><path class="region-coast" d="${polygonPath(r.polygons)}"/></g>`).join('')}</g><g class="transport-lines">${geo.routes.map(r=>{const a=at(r.from),b=at(r.to);const path=r.kind==='air'?`M${a.at}Q${(a.at[0]+b.at[0])/2},${Math.min(a.at[1],b.at[1])-95} ${b.at}`:`M${a.at}L${b.at}`;return `<path class="route-${r.kind}" d="${path}"/>`;}).join('')}</g><g class="map-water-labels">${geo.seas.map(s=>`<text x="${s.at[0]}" y="${s.at[1]}">${s.name}</text>`).join('')}</g><g class="map-place-labels">${labels}${geo.provinces.map(p=>`<text class="map-province-label" x="${p.center[0]}" y="${p.center[1]+9}" data-province="${p.id}">${p.name}</text>`).join('')}</g><g class="map-river-labels">${geo.rivers.map(r=>{const mid=r.points[Math.floor(r.points.length/2)];return `<text x="${mid[0]+6}" y="${mid[1]-5}">${r.name}</text>`;}).join('')}${geo.lakes.map(l=>{const b=l.points[0];return `<text x="${b[0]+3}" y="${b[1]-5}">${l.name}</text>`;}).join('')}</g><g class="map-natural-labels">${geo.ranges.map(r=>{const mid=r.points[Math.floor(r.points.length/2)];return `<text x="${mid[0]-(r.region==='metro'?1.5:13)}" y="${mid[1]-(r.region==='metro'?1.5:13)}">${r.name}</text>`;}).join('')}</g><g class="city-markers">${geo.cities.map(c=>`<g class="map-city ${c.isRegionalCapital?'regional-capital':c.isCapital?'province-capital':'minor-city'} ${c.id===selectedCity?'is-selected':''}" transform="translate(${c.at.join(' ')})" data-city="${c.id}" data-map-kind="city" data-map-id="${c.id}" role="button" tabindex="0" aria-label="${c.name}"><title>${c.name}</title><g class="urban-footprint" aria-hidden="true"><rect x="-3.8" y="-2.5" width="3.1" height="1.8"/><rect x="1.1" y="-3.3" width="2.6" height="2.5"/><rect x="-2.1" y="1.1" width="1.8" height="2.8"/><rect x="1.1" y="1.3" width="3" height="1.6"/><path d="M-5,0H5M0,-5V5"/></g><circle class="city-hit"/><circle class="city-halo"/><circle class="city-point"/><text class="city-name">${c.name}</text></g>`).join('')}</g><g class="coordinate-labels">${Array.from({length:11},(_,i)=>`<text x="${120*(i+1)}" y="790">${(i+1)*30-180}°</text>`).join('')}</g></svg>`;
}

export function renderAtlas(hash) {
  const selection = parseAtlasRoute(hash);
  const {region} = ancestors(selection);
  return `<section class="world-atlas"><div class="atlas-header"><div><h1>星球地图</h1><span>4 大区 <i>·</i> 36 省 <i>·</i> 108 城市</span></div><div class="atlas-search"><span aria-hidden="true">⌕</span><input id="atlas-search" type="search" autocomplete="off" placeholder="搜索地区、省份或城市" aria-label="搜索地区、省份或城市" aria-controls="atlas-search-results" aria-expanded="false"><kbd>/</kbd><div id="atlas-search-results" class="atlas-search-results" hidden></div></div></div><nav class="atlas-regions" aria-label="选择大区"><a href="#world/all" ${selection.kind==='planet'?'aria-current="page"':''}>全球</a>${geo.regions.map(r=>`<a href="${href('region',r.id)}" ${region?.id===r.id?'aria-current="page"':''}><span style="background:${r.color}"></span>${r.name}</a>`).join('')}</nav><div class="atlas-board"><div class="map-stage" id="map-stage" data-layer="${layer}"><div class="map-toolbar"><div class="map-layers" aria-label="地图图层">${[['political','行政'],['terrain','地形'],['transport','交通']].map(([id,label])=>`<button data-layer="${id}" aria-pressed="${layer===id}">${label}</button>`).join('')}</div><button class="map-reset" data-map-action="home" title="显示全球">全图</button></div>${mapSvg(selection)}<div class="map-hover" id="map-hover" role="status" hidden></div><div class="map-controls">${button('in','放大','plus')}${button('out','缩小','minus')}${button('focus','定位所选地区','fit')}</div><div class="map-bottom"><div class="map-scale-bar"><span id="map-scale-distance"></span><i></i></div><div class="map-legend"><span><i class="legend-capital"></i>首府</span><span><i class="legend-city"></i>城市</span></div><div class="route-legend"><span class="rail">铁路</span><span class="sea">海陆</span><span class="air">航空</span></div><span id="map-zoom-label">1×</span></div><div class="map-compass" aria-hidden="true"><b>N</b><i></i></div></div>${drawer(selection)}</div></section>`;
}

export function disposeAtlas() { dispose(); dispose=()=>{}; }

export function mountAtlas() {
  const stage=document.querySelector('#map-stage');
  if(!stage) return;
  const svg=stage.querySelector('svg.planet-map');
  const selection=parseAtlasRoute(window.location.hash);
  const selectionKey=`${selection.kind}:${selection.entity.id}`;
  const cleanup=[];
  const listen=(target,event,fn,opts)=>{target.addEventListener(event,fn,opts);cleanup.push(()=>target.removeEventListener(event,fn,opts));};
  let size={width:stage.clientWidth,height:stage.clientHeight},frame=0,drag=null,moved=false;
  const pointers=new Map();
  const labelMetrics=new Map(),labelOffsets=new Map();
  const cityNodes=geo.cities.map(city=>{const marker=svg.querySelector(`[data-city="${city.id}"]`);return {city,marker,node:marker.querySelector('text')};});
  const fixedLabels=[...svg.querySelectorAll('.map-region-label,.map-province-label,.map-river-labels text,.map-natural-labels text,.map-water-labels text,.coordinate-labels text')].map(node=>({
    node,at:[Number(node.getAttribute('x')),Number(node.getAttribute('y'))],
    kind:node.matches('.map-region-label')?'region':node.matches('.map-province-label')?'province':node.closest('.map-water-labels')?'sea':node.closest('.coordinate-labels')?'coordinate':'terrain',
    province:geo.provinces.find(p=>p.id===node.dataset.province),
  }));
  for(const label of fixedLabels)if(label.province)label.at=provinceLabelPoint(label.province);
  const baseWidth=()=>Math.max(geo.width+70,(geo.height+90)*size.width/size.height);
  const fit=box=>{
    const width=Math.max(box.width*1.23,box.height*1.23*size.width/size.height,100);
    return {x:box.x+box.width/2,y:box.y+box.height/2,width:Math.min(baseWidth(),width)};
  };
  const globalFit=()=>({x:720,y:400,width:baseWidth()});
  const selectionFit=()=>selection.kind==='planet'?globalFit():selection.kind==='city'?fit({x:selection.entity.at[0]-40,y:selection.entity.at[1]-35,width:80,height:70}):fit(selection.entity.bounds);
  if(!mapCamera||selectionKey!==lastSelection)mapCamera=selectionFit();
  lastSelection=selectionKey;
  const clampCamera=()=>{
    mapCamera.width=Math.max(baseWidth()/60,Math.min(baseWidth(),mapCamera.width));
    const height=mapCamera.width*size.height/size.width;
    mapCamera.x=mapCamera.width>1550?720:Math.max(mapCamera.width/2-55,Math.min(1495-mapCamera.width/2,mapCamera.x));
    mapCamera.y=height>910?400:Math.max(height/2-55,Math.min(855-height/2,mapCamera.y));
  };
  function paint() {
    frame=0;clampCamera();
    const width=mapCamera.width,height=width*size.height/size.width,u=width/size.width,zoom=baseWidth()/width;
    const left=mapCamera.x-width/2,top=mapCamera.y-height/2;
    const adminDetail=layer==='political'&&(zoom>=1.7||selection.kind!=='planet'&&zoom>1.15);
    stage.dataset.adminDetail=String(adminDetail);
    svg.setAttribute('viewBox',`${left} ${top} ${width} ${height}`);
    svg.style.setProperty('--u',u);
    svg.style.setProperty('--urban-scale',Math.min(.6,u*1.8));
    stage.dataset.zoom=zoom<1.7?'global':zoom<3.5?'region':'local';
    stage.querySelector('[data-map-action=\"in\"]').disabled=zoom>=59.99;stage.querySelector('[data-map-action=\"out\"]').disabled=zoom<=1.001;
    document.querySelector('#map-zoom-label').textContent=`${zoom.toFixed(1)}×`;
    const latitude=(90-mapCamera.y/800*180)*Math.PI/180;
    const kmPerPixel=2*Math.PI*geo.radiusKm/geo.width*u*Math.max(.1,Math.cos(latitude));
    document.querySelector('#map-scale-distance').textContent=`${Math.round(kmPerPixel*64).toLocaleString()} km`;
    // 所有地名共用真实文字边界框，包含描边留白；无法放下的次要名称随放大再显示。
    const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
    const stageRect=stage.getBoundingClientRect();
    const occupied=[...stage.querySelectorAll('.map-layers,.map-reset,.map-controls,.map-bottom,.map-compass')].map(node=>{
      const r=node.getBoundingClientRect();return {x:r.left-stageRect.left-3,y:r.top-stageRect.top-3,w:r.width+6,h:r.height+6};
    });
    const pending=[];
    for(const {city,marker,node} of cityNodes){
      const visible=city.id===selection.entity.id||city.isRegionalCapital||zoom>=1.7&&city.isCapital||zoom>=(layer==='political'?6:3.5);
      marker.style.display=visible?'':'none';
      node.style.display='none';
      const x=(city.at[0]-left)/u,y=(city.at[1]-top)/u;
      if(!visible||x<0||x>size.width||y<0||y>size.height)continue;
      occupied.push({x:x-6,y:y-6,w:12,h:12});
      if(!city.isRegionalCapital&&zoom<2.4&&city.id!==selection.entity.id)continue;
      pending.push({node,at:city.at,relative:true,kind:'city',priority:city.id===selection.entity.id?1000:city.isRegionalCapital?800:city.isCapital?700:500});
    }
    for(const label of fixedLabels){
      const {node,kind,province}=label;
      node.style.display='none';
      const visible=kind==='region'?zoom<1.7&&!adminDetail:kind==='sea'||kind==='coordinate'?zoom<1.7:kind==='province'?adminDetail||zoom>=1.7&&zoom<4.1:layer!=='political'&&zoom>=1.7;
      if(!visible||!node.textContent.trim())continue;
      pending.push({...label,priority:province?.id===selection.entity.id?950:kind==='region'?900:kind==='province'?(adminDetail?850:600):kind==='terrain'?300:100});
    }
    // 地名字号保持屏幕像素大小，缓存测量值，避免每个手势帧触发文字布局。
    const unmeasured=pending.filter(({node})=>!labelMetrics.has(node));
    for(const {node} of unmeasured){node.style.display='';node.setAttribute('text-anchor','middle');node.setAttribute('x',0);node.setAttribute('y',0);}
    for(const {node} of unmeasured){const b=node.getBBox();if(b.width)labelMetrics.set(node,{x:b.x/u,y:b.y/u,w:b.width/u,h:b.height/u});}
    const measured=pending.filter(({node})=>labelMetrics.has(node)).map(label=>({...label,box:labelMetrics.get(label.node)}));
    measured.sort((a,b)=>b.priority-a.priority);
    for(const label of measured){
      const {node,at,box,kind,province}=label;
      const x=(at[0]-left)/u,y=(at[1]-top)/u;
      const centerY=-box.y-box.h/2;
      const offsets=kind==='city'
        ?[[box.w/2+10,centerY],[-box.w/2-10,centerY],[0,-box.y-box.h-11],[0,-box.y+11],[box.w/2+10,-box.y-box.h-9],[-box.w/2-10,-box.y-box.h-9]]
        :[[0,0],[0,-22],[0,22],[-28,0],[28,0],[-22,-20],[22,-20],[-22,20],[22,20]];
      let chosen;
      const previous=labelOffsets.get(node);
      for(const [dx,dy] of previous?[previous,...offsets]:offsets){
        // 省名可在本省内移动，但不越界贴到邻省上。
        if(province&&!inside([at[0]+dx*u,at[1]+(dy+box.y+box.h/2)*u],province.polygons))continue;
        const rect={x:x+dx+box.x-3,y:y+dy+box.y-3,w:box.w+6,h:box.h+6};
        if(rect.x<5||rect.y<5||rect.x+rect.w>size.width-5||rect.y+rect.h>size.height-5||occupied.some(o=>overlaps(rect,o)))continue;
        chosen={dx,dy,rect};break;
      }
      node.style.display=chosen?'':'none';
      if(!chosen)continue;
      labelOffsets.set(node,[chosen.dx,chosen.dy]);
      occupied.push(chosen.rect);
      node.setAttribute('x',(label.relative?0:at[0])+chosen.dx*u);
      node.setAttribute('y',(label.relative?0:at[1])+chosen.dy*u);
    }
  }
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(paint);};
  const zoomLimits=()=>({min:baseWidth()/60,max:baseWidth()});
  const anchorAt=point=>{const rect=svg.getBoundingClientRect();return point?[point[0]-rect.left-rect.width/2,point[1]-rect.top-rect.height/2]:[0,0];};
  const zoomAt=(factor,point)=>{
    mapCamera=zoomCamera(mapCamera,factor,anchorAt(point),size,zoomLimits());clampCamera();schedule();
  };
  const navigate=(kind,id)=>{panelTab='overview';const hash=`#world/${kind}/${id}`;if(window.location.hash===hash){mapCamera=selectionFit();document.querySelector('#atlas-search-results').hidden=true;document.querySelector('#atlas-search').setAttribute('aria-expanded','false');document.querySelector('#atlas-search').blur();schedule();}else window.location.hash=hash;};
  const resolveTarget=target=>{
    const node=target.closest('[data-map-kind]');if(!node)return null;
    let kind=node.dataset.mapKind,id=node.dataset.mapId;
    if(kind==='province'&&baseWidth()/mapCamera.width<1.7&&stage.dataset.adminDetail!=='true'){kind='region';id=byId(geo.provinces,id).region;}
    return {kind,id};
  };
  listen(svg,'wheel',ev=>{
    ev.preventDefault();
    if(drag)return;
    stage.querySelector('#map-hover').hidden=true;
    mapCamera=wheelCamera(mapCamera,ev,anchorAt([ev.clientX,ev.clientY]),size,zoomLimits());
    // 逐事件限制边界，避免高速输入在帧间积累，反向滑动时出现空行程。
    clampCamera();schedule();
  },{passive:false});
  listen(svg,'pointerdown',ev=>{
    if(ev.button&&ev.pointerType==='mouse')return;
    pointers.set(ev.pointerId,[ev.clientX,ev.clientY]);svg.setPointerCapture(ev.pointerId);moved=false;
    drag={x:ev.clientX,y:ev.clientY,camera:{...mapCamera},target:resolveTarget(ev.target)};
    if(pointers.size===2){const [a,b]=[...pointers.values()];drag={...drag,pinch:Math.hypot(a[0]-b[0],a[1]-b[1]),mid:[(a[0]+b[0])/2,(a[1]+b[1])/2]};}
    stage.classList.add('is-dragging');
  });
  listen(svg,'pointermove',ev=>{
    if(!drag){const target=resolveTarget(ev.target);const tooltip=stage.querySelector('#map-hover');if(!target){tooltip.hidden=true;return;}const list=target.kind==='city'?geo.cities:target.kind==='province'?geo.provinces:geo.regions;const item=byId(list,target.id);tooltip.textContent=`${item.name} · ${target.kind==='region'?item.population+' 亿':formatPopulation(item.populationUnits)}`;tooltip.hidden=false;return;}
    stage.querySelector('#map-hover').hidden=true;
    pointers.set(ev.pointerId,[ev.clientX,ev.clientY]);
    if(pointers.size===2&&drag.pinch){const [a,b]=[...pointers.values()];const distance=Math.hypot(a[0]-b[0],a[1]-b[1]);mapCamera.width=drag.camera.width*drag.pinch/Math.max(1,distance);const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];mapCamera.x=drag.camera.x-(mid[0]-drag.mid[0])*mapCamera.width/size.width;mapCamera.y=drag.camera.y-(mid[1]-drag.mid[1])*mapCamera.width/size.width;moved=true;schedule();return;}
    const dx=ev.clientX-drag.x,dy=ev.clientY-drag.y;
    if(Math.hypot(dx,dy)>4)moved=true;
    if(moved){mapCamera.x=drag.camera.x-dx*mapCamera.width/size.width;mapCamera.y=drag.camera.y-dy*mapCamera.width/size.width;schedule();}
  });
  const release=ev=>{
    const target=drag?.target;const clicked=drag&&!moved&&pointers.size===1;
    pointers.delete(ev.pointerId);drag=null;stage.classList.remove('is-dragging');
    if(svg.hasPointerCapture(ev.pointerId))svg.releasePointerCapture(ev.pointerId);
    if(clicked&&target)navigate(target.kind,target.id);
  };
  listen(svg,'pointerup',release);listen(svg,'pointercancel',ev=>{moved=true;release(ev);});
  listen(svg,'pointerleave',()=>{stage.querySelector('#map-hover').hidden=true;});
  listen(svg,'dblclick',ev=>{ev.preventDefault();zoomAt(1.7,[ev.clientX,ev.clientY]);});
  listen(svg,'keydown',ev=>{
    if(['Enter',' '].includes(ev.key)){const target=resolveTarget(ev.target);if(target){ev.preventDefault();navigate(target.kind,target.id);}return;}
    if(['+','=','-','Home','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(ev.key))ev.preventDefault();else return;
    if(ev.key==='+'||ev.key==='=')zoomAt(1.4);else if(ev.key==='-')zoomAt(1/1.4);else if(ev.key==='Home'){mapCamera=globalFit();schedule();}else{const delta=mapCamera.width*.08;if(ev.key==='ArrowLeft')mapCamera.x-=delta;if(ev.key==='ArrowRight')mapCamera.x+=delta;if(ev.key==='ArrowUp')mapCamera.y-=delta;if(ev.key==='ArrowDown')mapCamera.y+=delta;schedule();}
  });
  listen(stage,'click',ev=>{
    const control=ev.target.closest('[data-map-action]');
    if(control){const action=control.dataset.mapAction;if(action==='in')zoomAt(1.5);if(action==='out')zoomAt(1/1.5);if(action==='home'){mapCamera=globalFit();schedule();}if(action==='focus'){mapCamera=selectionFit();schedule();}return;}
    const tab=ev.target.closest('button[data-layer]');if(tab){layer=tab.dataset.layer;labelMetrics.clear();labelOffsets.clear();stage.dataset.layer=layer;stage.querySelectorAll('button[data-layer]').forEach(b=>b.setAttribute('aria-pressed',String(b===tab)));schedule();}
  });
  const drawerRoot=document.querySelector('.atlas-drawer');
  listen(drawerRoot,'click',ev=>{const tab=ev.target.closest('[data-detail-tab]');if(!tab)return;panelTab=tab.dataset.detailTab;drawerRoot.querySelectorAll('[data-detail-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b===tab)));drawerRoot.querySelector('.atlas-drawer-scroll').innerHTML=panelTab==='overview'?drawerBody(selection):football(selection);drawerRoot.querySelector('.atlas-drawer-scroll').scrollTop=0;});
  setupSearch(listen,navigate);
  if(document.fonts)listen(document.fonts,'loadingdone',()=>{labelMetrics.clear();labelOffsets.clear();schedule();});
  const observer=new ResizeObserver(()=>{const zoom=baseWidth()/mapCamera.width;size={width:stage.clientWidth,height:stage.clientHeight};mapCamera.width=baseWidth()/zoom;schedule();});observer.observe(stage);
  paint();
  dispose=()=>{cleanup.forEach(fn=>fn());observer.disconnect();if(frame)cancelAnimationFrame(frame);};
}

function setupSearch(listen,navigate) {
  const input=document.querySelector('#atlas-search'),results=document.querySelector('#atlas-search-results');
  const entries=[...geo.regions.map(entity=>({kind:'region',entity})),...geo.provinces.map(entity=>({kind:'province',entity})),...geo.cities.map(entity=>({kind:'city',entity}))];
  let matches=[],index=-1;
  const close=()=>{results.hidden=true;input.setAttribute('aria-expanded','false');index=-1;};
  function search(){const q=input.value.trim().toLowerCase();matches=q?entries.filter(({entity})=>`${entity.name} ${entity.en||''} ${entity.id}`.toLowerCase().includes(q)).slice(0,12):entries.filter(({kind,entity})=>kind==='city'&&entity.isRegionalCapital);index=-1;results.innerHTML=matches.length?matches.map(({kind,entity},i)=>`<button data-search-index="${i}"><span>${entity.name}</span><small>${kind==='region'?'大区':kind==='province'?byId(geo.regions,entity.region).name:byId(geo.provinces,entity.province).name}</small><span>↗</span></button>`).join(''):'<p>无匹配结果</p>';results.hidden=false;input.setAttribute('aria-expanded','true');}
  listen(input,'input',search);listen(input,'focus',search);
  listen(input,'keydown',ev=>{
    if(ev.key==='Escape'){close();input.blur();return;}
    if(ev.key==='ArrowDown'||ev.key==='ArrowUp'){ev.preventDefault();if(results.hidden)search();if(!matches.length)return;index=(index+(ev.key==='ArrowDown'?1:-1)+matches.length)%matches.length;results.querySelectorAll('button').forEach((b,i)=>b.classList.toggle('active',i===index));results.querySelectorAll('button')[index]?.scrollIntoView({block:'nearest'});}
    if(ev.key==='Enter'&&matches.length){ev.preventDefault();const match=matches[Math.max(0,index)];close();navigate(match.kind,match.entity.id);}
  });
  listen(results,'click',ev=>{const button=ev.target.closest('[data-search-index]');if(!button)return;const match=matches[Number(button.dataset.searchIndex)];navigate(match.kind,match.entity.id);});
  listen(document,'click',ev=>{if(!ev.target.closest('.atlas-search'))close();});
  listen(document,'keydown',ev=>{if(ev.key==='/'&&!ev.target.matches('input,textarea')){ev.preventDefault();input.focus();}});
}
