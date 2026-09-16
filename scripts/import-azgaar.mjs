// Import terrain from an upstream FMG fixture; political territories are AstraBall-specific.
import fs from 'node:fs';
import {rebuildPack} from './lib/voronoi.mjs';
import {refineBorders} from './lib/refine-borders.mjs';
import {PROVINCE_CATALOG} from '../src/geography/catalog.js';
const source=JSON.parse(fs.readFileSync('third_party/azgaar/sample-source.json'));
const mesh=rebuildPack(source),{cells,vertices,points,heights}=mesh;
const riverCells=new Set(source.rivers.flatMap(r=>r.cells));
const component=(start,predicate)=>{const seen=new Set([start]),pending=[start];while(pending.length){for(const n of cells[pending.pop()].c)if(predicate(n)&&!seen.has(n)){seen.add(n);pending.push(n);}}return [...seen];};
const landFeatures=source.features.filter(f=>f.land&&f.i!==2).map(f=>({...f,cells:component(f.firstCell,i=>heights[i]>=20)}));
const mainland=landFeatures.find(f=>f.i===10).cells;
const land=new Set(landFeatures.flatMap(f=>f.cells));
const lakeFeatures=source.features.filter(f=>f.type==='lake').map(f=>({...f,cells:component(f.firstCell,i=>heights[i]<20)})).filter(f=>f.cells.some(i=>cells[i].c.some(n=>land.has(n))));
const usable=new Set([...land,...lakeFeatures.flatMap(f=>f.cells)]);
const nearest=(point,ids)=>ids.reduce((best,i)=>Math.hypot(points[i][0]-point[0],points[i][1]-point[1])<Math.hypot(points[best][0]-point[0],points[best][1]-point[1])?i:best,ids[0]);
class Heap{a=[];push(v){let i=this.a.length;this.a.push(v);while(i){const p=(i-1)>>1;if(this.a[p].cost<=v.cost)break;this.a[i]=this.a[p];i=p;}this.a[i]=v;}pop(){const root=this.a[0],v=this.a.pop();if(this.a.length){let i=0;while(i*2+1<this.a.length){let j=i*2+1;if(j+1<this.a.length&&this.a[j+1].cost<this.a[j].cost)j++;if(this.a[j].cost>=v.cost)break;this.a[i]=this.a[j];i=j;}this.a[i]=v;}return root;}}
function flood(allowed,seeds){
 const queue=new Heap(),cost=new Map(),owner=new Map();
 for(const [id,cell]of seeds){queue.push({cell,id,cost:0});cost.set(cell,0);owner.set(cell,id);}
 while(queue.a.length){const item=queue.pop();if(item.cost!==cost.get(item.cell))continue;
  for(const n of cells[item.cell].c){if(!allowed.has(n))continue;
   const distance=Math.hypot(points[n][0]-points[item.cell][0],points[n][1]-points[item.cell][1]);
   const elevation=(heights[n]+heights[item.cell])/2;
   const crossing=riverCells.has(n)!==riverCells.has(item.cell)?3:0;
   const next=item.cost+distance*(1+Math.pow(elevation/100,3)*16+Math.abs(heights[n]-heights[item.cell])*.20+crossing);
   if(next>=(cost.get(n)??Infinity))continue;cost.set(n,next);owner.set(n,item.id);queue.push({cell:n,id:item.id,cost:next});
  }
 }
 return {cost,owner};
}
// Compact coastal metropolis carved from one connected part of the reference continent.
const metroOrigin=nearest([665,286],mainland),metroCosts=flood(new Set(mainland),[['metro',metroOrigin]]).cost;
const metro=mainland.toSorted((a,b)=>metroCosts.get(a)-metroCosts.get(b)).slice(0,14);
const metroSet=new Set(metro),otherMain=new Set(mainland.filter(i=>!metroSet.has(i)));
const regionSeeds=[['lima',nearest([260,410],[...otherMain])],['liberlin',nearest([690,350],[...otherMain])],['sichuan',nearest([575,650],[...otherMain])]];
const regionOwner=flood(otherMain,regionSeeds).owner;
for(const cell of metro)regionOwner.set(cell,'metro');
if(regionOwner.size!==mainland.length)throw Error('大都会切分造成陆地无法分配');
const provinceOwner=new Map(),provinceSeeds={};
for(const region of ['metro','lima','liberlin','sichuan']){
 const ids=mainland.filter(i=>regionOwner.get(i)===region),allowed=new Set(ids),names=PROVINCE_CATALOG.filter(p=>p.region===region&&p.id!=='isles').map(p=>p.id);
 const eligible=ids.filter(i=>heights[i]<70&&!riverCells.has(i));
 const pool=eligible.length>=names.length?eligible:ids;
 const center=pool.reduce((s,i)=>[s[0]+points[i][0]/pool.length,s[1]+points[i][1]/pool.length],[0,0]);
 const starts=[nearest(center,pool)];
 while(starts.length<names.length){const d=flood(allowed,starts.map((i,j)=>[j,i])).cost;const candidates=pool.filter(i=>!starts.includes(i));starts.push(candidates.reduce((best,i)=>(d.get(i)??0)>(d.get(best)??0)?i:best,candidates[0]));}
 // Match established place types to geographical position, not to the arbitrary flood order.
 const locationOrder={metro:['skylake','whitepeak','outerring','crown','aurora','silver'],lima:['coast','windsea','westcape','tidewater','estuary','ember','delta','saltbay','pearl'],liberlin:['north','copper','iron','redvalley','steppe','frost','granite','lakework','eastmarch','newforge'],sichuan:['yunmin','highshu','minsource','longmen','bamboo','rong','southbasin','jialing','redsoil','eastshu']};
 starts.sort((a,b)=>points[a][0]-points[b][0]||points[a][1]-points[b][1]);
 const seeds=starts.map((cell,i)=>[locationOrder[region][i],cell]);
 for(const [id,cell]of seeds)provinceSeeds[id]=cell;
 for(const [cell,id]of flood(allowed,seeds).owner)provinceOwner.set(cell,id);
}
const islandOwners=[];
for(const feature of landFeatures.filter(f=>f.i!==10)){
 const seed=nearest(feature.cells.reduce((p,i)=>[p[0]+points[i][0]/feature.cells.length,p[1]+points[i][1]/feature.cells.length],[0,0]),feature.cells);
 const province=feature.i===3?'isles':provinceOwner.get(nearest(points[seed],mainland));
 if(province==='isles')provinceSeeds.isles=seed;
 const region=province==='isles'?'lima':PROVINCE_CATALOG.find(p=>p.id===province).region;
 feature.cells.forEach(i=>{provinceOwner.set(i,province);regionOwner.set(i,region);});islandOwners.push({sourceFeature:feature.i,owner:province,cells:feature.cells});
}
// Lakes stay visible as water, while administrative polygons include inland waters.
for(const lake of lakeFeatures){const bank=lake.cells.flatMap(i=>cells[i].c).find(i=>land.has(i));const province=provinceOwner.get(bank),region=regionOwner.get(bank);lake.cells.forEach(i=>{provinceOwner.set(i,province);regionOwner.set(i,region);});}
function rings(ids){
 const edges=new Map();
 for(const i of ids){const ring=cells[i].v;for(let j=0;j<ring.length;j++){const a=ring[j],b=ring[(j+1)%ring.length],key=a<b?`${a}:${b}`:`${b}:${a}`;if(edges.has(key))edges.delete(key);else edges.set(key,[a,b]);}}
 const outgoing=new Map();for(const [a,b]of edges.values()){if(!outgoing.has(a))outgoing.set(a,[]);outgoing.get(a).push(b);}
 const loops=[];while(outgoing.size){const start=outgoing.keys().next().value,loop=[];let current=start,count=0;do{loop.push(current);const options=outgoing.get(current);if(!options)throw Error('边界不闭合');const next=options.pop();if(!options.length)outgoing.delete(current);current=next;if(++count>edges.size+1)throw Error('边界循环');}while(current!==start);loops.push(loop);}
 return loops;
}
const coastRings=rings([...usable]);
const selectedVertices=coastRings.flat().map(i=>vertices[i]);
const box={x:Math.min(...selectedVertices.map(p=>p[0])),y:Math.min(...selectedVertices.map(p=>p[1])),right:Math.max(...selectedVertices.map(p=>p[0])),bottom:Math.max(...selectedVertices.map(p=>p[1]))};
const transform=p=>[Math.round((165+(p[0]-box.x)/(box.right-box.x)*1110)*100)/100,Math.round((70+(p[1]-box.y)/(box.bottom-box.y)*660)*100)/100];
const poly=ids=>rings(ids).map(r=>r.map(i=>transform(vertices[i])).filter((p,i,ring)=>p[0]!==ring[(i+1)%ring.length][0]||p[1]!==ring[(i+1)%ring.length][1]));
const group=owner=>Object.fromEntries([...new Set(owner.values())].map(id=>[id,poly([...owner].filter(([,o])=>o===id).map(([i])=>i))]));
const {regionShapes,provinceShapes}=refineBorders(group(provinceOwner),group(regionOwner));
const rivers=source.rivers.filter(r=>r.cells.some(i=>land.has(i))).map(r=>{
 const relevant=r.cells.filter(i=>i>=0&&i<points.length),regions=[...new Set(relevant.map(i=>regionOwner.get(i)).filter(Boolean))];
 return {id:`fmg-river-${r.i}`,name:'',region:regions[0],regions,points:relevant.map(i=>transform(points[i])),discharge:r.discharge,sourceId:r.i,parent:r.parent,basin:r.basin};
}).filter(r=>r.points.length>2).sort((a,b)=>b.discharge-a.discharge);
const names={metro:['冠河'],lima:['利玛河','勒口河','网寮河'],liberlin:['铁原河','闵河','窑溪'],sichuan:['冉水','牟水','勾水']};
for(const river of rivers)river.name=names[river.region]?.shift()||'';
const lakes=lakeFeatures.map((f,i)=>({id:`fmg-lake-${f.i}`,name:['闵湖','铁原湖','翟湖'][i]||'',region:regionOwner.get(f.cells[0]),points:poly(f.cells)[0]}));
const contours=[25,35,45,55,65,75,85].map(height=>({height,polygons:poly([...land].filter(i=>heights[i]>=height))}));
const reliefCells=[...land].map(i=>{
 const adjacent=cells[i].c.filter(n=>land.has(n));
 let gx=0,gy=0;for(const n of adjacent){const dx=points[n][0]-points[i][0],dy=points[n][1]-points[i][1],len=dx*dx+dy*dy;gx+=(heights[n]-heights[i])*dx/len;gy+=(heights[n]-heights[i])*dy/len;}
 return {polygon:cells[i].v.map(v=>transform(vertices[v])),height:heights[i],shade:Math.round(Math.max(-1,Math.min(1,(gx+gy)*.5))*100)/100};
});
const centers=Object.fromEntries(Object.entries(provinceSeeds).map(([id,i])=>[id,transform(points[i])]));
const labels=Object.fromEntries(['metro','lima','liberlin','sichuan'].map(id=>{const ids=mainland.filter(i=>regionOwner.get(i)===id),mean=ids.reduce((p,i)=>[p[0]+points[i][0]/ids.length,p[1]+points[i][1]/ids.length],[0,0]);return [id,transform(points[nearest(mean,ids)])];}));
const data={source:{project:'Azgaar/Fantasy-Map-Generator',fixture:'1.139.4.map',seed:2,landFeature:10,license:'MIT',header:source.header},regionShapes,provinceShapes,centers,labels,rivers,lakes,coastlines:coastRings.map(r=>r.map(i=>transform(vertices[i]))),islands:islandOwners.map(f=>({owner:f.owner,polygon:poly(f.cells)[0]})),ranges:[],boundaries:[],contours,reliefCells};
fs.writeFileSync('src/geography/data/azgaar-sample.js','// Imported FMG terrain. Rebuild with npm run import:map. Attribution: third_party/azgaar/README.md\nexport default '+JSON.stringify(data)+';\n');
console.log({land:land.size,lakes:lakes.length,rivers:rivers.length,regions:Object.keys(regionShapes),provinces:Object.keys(provinceShapes).length,metro:metro.length,bytes:fs.statSync('src/geography/data/azgaar-sample.js').size});
