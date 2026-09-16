import test from 'node:test';
import assert from 'node:assert/strict';
import {generateWorld,geography,inside,pointInPolygon,planeArea,random,formatPopulation,distanceKm} from '../src/geography/generate.js';
import {clubs,academies,players} from '../src/world.js';
import {parseAtlasRoute} from '../src/atlas.js';

test('固定样例地形保持稳定，种子改变城市细节但保留实体身份',()=>{
  assert.deepEqual(generateWorld(),geography);
  const other=generateWorld(472001);
  assert.deepEqual(other.regions.map(r=>r.polygons),geography.regions.map(r=>r.polygons));
  assert.notDeepEqual(other.cities.map(c=>c.at),geography.cities.map(c=>c.at));
  assert.deepEqual(other.cities.map(c=>c.id),geography.cities.map(c=>c.id));
  assert.deepEqual(other.provinces.map(c=>c.id),geography.provinces.map(c=>c.id));
});

test('行政区和重要城市完整，人口精确汇总且不重复计入城市',()=>{
  assert.equal(geography.regions.length,4);assert.equal(geography.provinces.length,36);assert.equal(geography.cities.length,108);
  let total=0;
  for(const region of geography.regions){
    const provinces=geography.provinces.filter(p=>p.region===region.id);
    const sum=provinces.reduce((sum,p)=>sum+p.populationUnits,0);
    assert.equal(sum,region.population*10000);total+=sum;
    assert.ok(geography.cities.find(c=>c.id===region.capital)?.isRegionalCapital);
    for(const province of provinces){
      const cities=geography.cities.filter(c=>c.province===province.id);
      assert.equal(cities.length,3);
      assert.equal(cities.filter(c=>c.isCapital).length,1);
      assert.ok(cities.reduce((sum,c)=>sum+c.populationUnits,0)<province.populationUnits);
    }
  }
  assert.equal(total,500*10000);
  assert.equal(new Set(geography.cities.map(c=>c.name)).size,108);
});

test('城市都在自身省份和大陆内，原有人物机构保持归属和年代一致',()=>{
  for(const city of geography.cities){
    const province=geography.provinces.find(p=>p.id===city.province);
    const region=geography.regions.find(r=>r.id===city.region);
    assert.ok(inside(city.at,province.polygons),city.name+' 不在所属省内');
    assert.ok(inside(city.at,region.polygons),city.name+' 不在陆地上');
    assert.ok(!geography.lakes.some(lake=>pointInPolygon(city.at,lake.points)),city.name+' 位于湖面');
    assert.ok(city.founded<318);
  }
  for(const entity of [...clubs,...academies]){
    const city=geography.cities.find(c=>c.id===entity.city);assert.ok(city,entity.name);
    assert.ok(city.founded<=entity.founded,entity.name+' 成立早于城市');
  }
  for(const player of players)assert.ok(geography.cities.some(c=>c.id===player.city));
});

test('湖泊全部位于所属大区内',()=>{
  for(const lake of geography.lakes){const region=geography.regions.find(r=>r.id===lake.region);for(const point of lake.points)assert.ok(inside(point,region.polygons),lake.name);}
});

test('离岸岛屿完整归属一个省，宓寮省不切分大陆，换种子不改变归属',()=>{
  for(const world of [geography,generateWorld(472001),generateWorld(901)]){
    for(const region of world.regions){
      const provinces=world.provinces.filter(p=>p.region===region.id);
      const mainland=region.polygons.reduce((largest,p)=>planeArea(p)>planeArea(largest)?p:largest);
      for(const island of region.polygons.filter(p=>p!==mainland)){
        const owners=provinces.filter(p=>island.every(point=>inside(point,p.polygons)));
        assert.equal(owners.length,1,`${region.id} 岛屿必须整岛归属一个省`);
        assert.ok(owners[0].polygons.some(p=>JSON.stringify(p)===JSON.stringify(island)),'归属后海岸线应完整保留');
        for(const other of provinces.filter(p=>p!==owners[0])){
          assert.ok(!island.some(point=>inside(point,other.polygons)),`${other.name} 不应占有岛屿的一部分`);
        }
      }
    }
    for(const island of world.islands){
      const owner=world.provinces.find(p=>p.id===island.owner);
      assert.ok(island.polygon.every(point=>inside(point,owner.polygons)));
    }
    const isles=world.provinces.find(p=>p.id==='isles');
    assert.ok(isles.polygons.every(p=>world.islands.some(i=>i.owner==='isles'&&JSON.stringify(i.polygon)===JSON.stringify(p))));
  }
});

test('省域完整覆盖各大区陆地，内部没有重叠或孔洞',()=>{
  const rng=random(318);
  for(const region of geography.regions){
    const provinces=geography.provinces.filter(p=>p.region===region.id);
    const landArea=region.polygons.reduce((a,p)=>a+planeArea(p),0);
    const provinceArea=provinces.reduce((sum,p)=>sum+p.polygons.reduce((a,poly)=>a+planeArea(poly),0),0);
    assert.ok(Math.abs(landArea-provinceArea)<.01,`${region.name} 面积不守恒：${landArea-provinceArea}`);
    for(let i=0;i<2500;i++){
      const point=[region.bounds.x+rng()*region.bounds.width,region.bounds.y+rng()*region.bounds.height];
      const containing=provinces.filter(p=>inside(point,p.polygons));
      assert.equal(containing.length,inside(point,region.polygons)?1:0,`${region.name} ${point}`);
    }
  }
});

test('四区在主体大陆接壤，大都会面积小于总陆域的百分之一',()=>{
  const world=geography,metro=world.regions.find(r=>r.id==='metro');
  assert.ok(metro.areaKm2/world.landAreaKm2<.01);
  const touching=(a,b)=>a.polygons[0].filter(p=>b.polygons[0].some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<1e-6)).length>2;
  const edges=[];
  for(const a of world.regions)for(const b of world.regions)if(a.id<b.id&&touching(a,b))edges.push([a.id,b.id]);
  assert.deepEqual(edges.map(p=>p.join('/')).sort(),['liberlin/lima','liberlin/metro','liberlin/sichuan','lima/sichuan']);
  const land=world.coastlines.reduce((sum,p)=>sum+planeArea(p),0);
  assert.ok(Math.abs(world.regions.reduce((sum,r)=>sum+r.polygons.reduce((n,p)=>n+planeArea(p),0),0)-land)<.01);
  const rng=random(1024);
  for(let i=0;i<5000;i++){
    const p=[rng()*1440,rng()*800];
    assert.equal(world.regions.filter(r=>inside(p,r.polygons)).length,inside(p,world.coastlines)?1:0,'大区之间不得重叠或留缝');
  }
});

test('地形来自真实 Azgaar 样例，保留高程与独立河网',()=>{
  assert.equal(geography.source.project,'Azgaar/Fantasy-Map-Generator');
  assert.equal(geography.source.fixture,'1.139.4.map');
  assert.equal(geography.source.seed,2);
  assert.ok(geography.reliefCells.length>2000);
  assert.ok(new Set(geography.reliefCells.map(c=>c.height)).size>30);
  assert.ok(geography.coastlines.flat().length>1000);
  assert.equal(geography.rivers.length,92);
  assert.equal(new Set(geography.rivers.map(r=>r.sourceId)).size,92);
  for(const river of geography.rivers){
    assert.ok(river.points.length>2);assert.ok(river.discharge>0);
    assert.ok(river.regions.length>0);
    assert.ok(river.regions.every(id=>geography.regions.some(r=>r.id===id)));
    assert.ok(river.points.every(p=>p.every(Number.isFinite)));
  }
  // 河流先于行政区存在，应有穿越省域的河段，而不是每条河都被当作省界。
  const interior=geography.rivers.filter(r=>r.points.some(point=>geography.provinces.filter(p=>inside(point,p.polygons)).length===1));
  assert.ok(interior.length>geography.rivers.length*.8);
});

test('全部城市的交通图连通，路线端点和球面距离有效',()=>{
  const seen=new Set([geography.cities[0].id]),pending=[geography.cities[0].id];
  while(pending.length){const id=pending.pop();for(const route of geography.routes){if(route.from!==id&&route.to!==id)continue;const next=route.from===id?route.to:route.from;if(!seen.has(next)){seen.add(next);pending.push(next);}}}
  assert.equal(seen.size,108);
  assert.equal(new Set(geography.routes.map(r=>r.id)).size,geography.routes.length);
  for(const route of geography.routes){
    const a=geography.cities.find(c=>c.id===route.from),b=geography.cities.find(c=>c.id===route.to);
    assert.ok(a&&b);assert.ok(route.distance>0);assert.equal(route.distance,distanceKm(a.at,b.at));
  }
});

test('细化后的共享边界完全重合，边线不交叉，省域不自交',()=>{
  const edges=new Map();
  for(const province of geography.provinces)for(const ring of province.polygons){
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length],ak=a.join(','),bk=b.join(',');
      assert.notEqual(ak,bk,'不得有零长度边');
      const key=ak<bk?`${ak}|${bk}`:`${bk}|${ak}`;
      if(edges.has(key)){edges.get(key).count++;assert.equal(edges.get(key).count,2,'共享边仅能由两省使用');}
      else edges.set(key,{a,b,count:1,minX:Math.min(a[0],b[0]),maxX:Math.max(a[0],b[0]),minY:Math.min(a[1],b[1]),maxY:Math.max(a[1],b[1])});
    }
  }
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  let active=[];
  for(const e of [...edges.values()].sort((a,b)=>a.minX-b.minX)){
    active=active.filter(f=>f.maxX>=e.minX);
    for(const f of active){
      if(f.maxY<e.minY||f.minY>e.maxY)continue;
      const intersects=cross(e.a,e.b,f.a)*cross(e.a,e.b,f.b)<-1e-12&&cross(f.a,f.b,e.a)*cross(f.a,f.b,e.b)<-1e-12;
      assert.ok(!intersects,`省界交叉: ${JSON.stringify([e.a,e.b,f.a,f.b])}`);
    }
    active.push(e);
  }
  const metro=geography.provinces.filter(p=>p.region==='metro');
  assert.ok(metro.every(p=>p.polygons[0].length>40),'小省也要有足够的边界细节');
});

test('地图层级深链接和旧链接均可打开，人口单位展示正确',()=>{
  assert.equal(parseAtlasRoute('#world/all').kind,'planet');
  assert.equal(parseAtlasRoute('#world/sichuan').entity.id,'sichuan');
  assert.equal(parseAtlasRoute('#world/region/lima').entity.id,'lima');
  assert.equal(parseAtlasRoute('#world/province/yunmin').entity.id,'yunmin');
  assert.equal(parseAtlasRoute('#world/city/jiangqiao').entity.id,'jiangqiao');
  assert.equal(parseAtlasRoute('#world/city/missing').kind,'planet');
  assert.equal(formatPopulation(10000),'1 亿');assert.equal(formatPopulation(12500),'1.25 亿');assert.equal(formatPopulation(500),'500 万');
});
