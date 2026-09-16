import { WORLD, REGION_CATALOG, PROVINCE_CATALOG } from './catalog.js';
import { hash, random, inside, pointInPolygon, surfaceArea, bounds, coordinates } from './geometry.js';
import { buildGeography } from './topology.js';
export { hash, random, inside, pointInPolygon, planeArea, surfaceArea, bounds, coordinates } from './geometry.js';
const sqDistance = (a,b) => (a[0]-b[0])**2+(a[1]-b[1])**2;
const round = value => Math.round(value*100)/100;
const radians = degrees => degrees*Math.PI/180;

function apportion(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map(w => total * w / sum);
  const output = raw.map(Math.floor);
  const order = raw.map((value, i) => ({ i, remainder: value - output[i] })).sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  for (let i = 0, left = total - output.reduce((a, b) => a + b, 0); i < left; i++) output[order[i].i]++;
  return output;
}

function nearestOnSegment(point, a, b) {
  const length = sqDistance(a, b);
  const t = length ? Math.max(0, Math.min(1, ((point[0] - a[0]) * (b[0] - a[0]) + (point[1] - a[1]) * (b[1] - a[1])) / length)) : 0;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function settleCity(province, region, index, role, existing, rng, terrain) {
  const seed = province.center;
  const candidates = [];
  const spacing = Math.min(9,Math.min(province.bounds.width,province.bounds.height)*.12);
  if (/海运|港|造船|船舶|群岛|海洋|渔业|出口/.test(role)) {
    for (const polygon of terrain.coastlines) {
      for (let i = 0; i < polygon.length; i++) {
        const coast = nearestOnSegment(seed, polygon[i], polygon[(i + 1) % polygon.length]);
        const distance = Math.sqrt(sqDistance(seed, coast));
        // 港口位于海岸内侧，避免行政归属歧义。
        if (distance > .1) candidates.push([coast[0] + (seed[0] - coast[0]) / distance * 2.5, coast[1] + (seed[1] - coast[1]) / distance * 2.5]);
      }
    }
    candidates.sort((a, b) => sqDistance(a, seed) - sqDistance(b, seed));
  } else if (/河|水电/.test(role)) {
    for (const river of terrain.rivers.filter(r => r.regions.includes(province.region))) {
      for (let i = 1; i < river.points.length; i++) {
        const bank = nearestOnSegment(seed, river.points[i - 1], river.points[i]);
        const distance = Math.sqrt(sqDistance(seed,bank));
        const inset = Math.min(1.5,distance*.15);
        candidates.push(distance ? [bank[0]+(seed[0]-bank[0])/distance*inset,bank[1]+(seed[1]-bank[1])/distance*inset] : seed);
      }
    }
    candidates.sort((a, b) => sqDistance(a, seed) - sqDistance(b, seed));
  }
  if (!index) candidates.push(seed);
  for (let i = 0; i < 500; i++) {
    const angle = rng() * Math.PI * 2;
    const distance = spacing + rng() * Math.min(40,Math.max(province.bounds.width,province.bounds.height)*.4);
    candidates.push([seed[0] + Math.cos(angle) * distance, seed[1] + Math.sin(angle) * distance]);
  }
  const result = candidates.map(point=>point.map(round)).find(point => inside(point, province.polygons) && !terrain.lakes.some(lake=>pointInPolygon(point,lake.points)) && existing.every(city => sqDistance(city.at, point) > spacing**2));
  if (!result) throw new Error(`无法在 ${province.name} 安置城市`);
  return result.map(round);
}

export function distanceKm(a, b) {
  const ca = coordinates(a), cb = coordinates(b);
  const latA = radians(ca.latitude), latB = radians(cb.latitude);
  const h = Math.sin((latA - latB) / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(radians(ca.longitude - cb.longitude) / 2) ** 2;
  return Math.round(2 * WORLD.radiusKm * Math.asin(Math.sqrt(Math.min(1, h))));
}

function connect(cities, regions) {
  const routes = [];
  function link(a, b, forcedKind) {
    const overLand = Array.from({length: 21}, (_, i) => [a.at[0] + (b.at[0] - a.at[0]) * i / 20, a.at[1] + (b.at[1] - a.at[1]) * i / 20]).every(p => regions.some(r=>inside(p,r.polygons)));
    routes.push({ id: `${a.id}--${b.id}`, from: a.id, to: b.id, kind: forcedKind || (overLand ? 'rail' : 'sea'), distance: distanceKm(a.at, b.at) });
  }
  for (const region of regions) {
    const local = cities.filter(c => c.region === region.id);
    const capitals = local.filter(c => c.isCapital);
    const connected = [capitals[0]], remaining = capitals.slice(1);
    // 最小生成树保证各省会互通，且不生成任意交叉的全连接网络。
    while (remaining.length) {
      let best;
      for (const a of connected) for (const b of remaining) {
        const distance = sqDistance(a.at, b.at);
        if (!best || distance < best.distance) best = { a, b, distance };
      }
      link(best.a, best.b);
      connected.push(best.b);
      remaining.splice(remaining.indexOf(best.b), 1);
    }
    for (const city of local.filter(c => !c.isCapital)) link(local.find(c => c.province === city.province && c.isCapital), city);
  }
  const crown = cities.find(c => c.id === 'crown-city');
  for (const region of regions.filter(r => r.id !== 'metro')) link(crown, cities.find(c => c.id === region.capital), 'air');
  return routes;
}

export function generateWorld(seed = WORLD.seed) {
  const terrain = buildGeography(seed);
  const regions = REGION_CATALOG.map(region => {
    const polygons = terrain.regionShapes[region.id];
    const areaKm2 = Math.round(polygons.reduce((sum, p) => sum + surfaceArea(p), 0));
    const label = terrain.labels[region.id];
    return { ...region, label, polygons, bounds: bounds(polygons), areaKm2, x: label[0]/WORLD.width*100, y: label[1]/WORLD.height*100 };
  });
  const provinces = [], cities = [];
  for (const region of regions) {
    const entries = PROVINCE_CATALOG.filter(p => p.region === region.id);
    const populationUnits = apportion(region.population * 10000, entries.map(p => p.weight));
    entries.forEach((entry, index) => {
      const polygons = terrain.provinceShapes[entry.id];
      const areaKm2 = Math.round(polygons.reduce((sum, p) => sum + surfaceArea(p), 0));
      const province = { ...entry, center:terrain.centers[entry.id], polygons, bounds: bounds(polygons), capital: entry.cityRows[0].id, populationUnits: populationUnits[index], population: populationUnits[index] / 10000, areaKm2 };
      provinces.push(province);
      const local = [];
      entry.cityRows.forEach((row, cityIndex) => {
        const rng = random(hash(`${seed}:${row.id}`));
        const at = settleCity(province, region, cityIndex, row.role, local, rng, terrain);
        const share = cityIndex === 0 ? .13 : cityIndex === 1 ? .075 : .04;
        const city = { ...row, province: province.id, region: region.id, at, ...coordinates(at),
          isCapital: cityIndex === 0, isRegionalCapital: row.id === region.capital,
          populationUnits: Math.round(province.populationUnits * share),
          founded: ({'crown-city':101,'east-crown':143,'silver-city':132,haimen:116,tide:165,'isle-city':169,'iron-city':97,pine:141,jiangqiao:158,qinglu:186,'rong-city':163,'south-rong':179})[row.id] ?? Math.round(135 + rng() * 140),
        };
        cities.push(city); local.push(city);
      });
    });
  }
  return { ...WORLD, seed, regions, provinces, cities, source: terrain.source, contours: terrain.contours, reliefCells: terrain.reliefCells, rivers: terrain.rivers, ranges: terrain.ranges, lakes: terrain.lakes, boundaries: terrain.boundaries, coastlines: terrain.coastlines, islands: terrain.islands,
    seas: [{name:'北冕洋',at:[900,40]},{name:'西澜洋',at:[85,410]},{name:'网寮海',at:[500,220]},{name:'贺口洋',at:[1375,420]},{name:'南寂洋',at:[640,775]}],
    routes: connect(cities, regions), terrain: {mountains:[],forests:[]},
    landAreaKm2: regions.reduce((sum, r) => sum + r.areaKm2, 0),
  };
}

export const geography = generateWorld();
export const formatPopulation = units => units >= 10000 ? `${(units / 10000).toFixed(2).replace(/\.?0+$/, '')} 亿` : `${units.toLocaleString('zh-CN')} 万`;
export const formatArea = km2 => km2 >= 100000000 ? `${(km2 / 100000000).toFixed(2)} 亿 km²` : `${(km2 / 10000).toFixed(1)} 万 km²`;
export const polygonPath = polygons => polygons.map(p => `M${p.map(v => v.map(round).join(',')).join('L')}Z`).join('');
