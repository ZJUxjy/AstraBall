import { WORLD } from './catalog.js';

const radians = degrees => degrees * Math.PI / 180;
const sqDistance = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
const round = value => Math.round(value * 100) / 100;

export function hash(text) {
  let value = 2166136261;
  for (const ch of String(text)) value = Math.imul(value ^ ch.charCodeAt(0), 16777619);
  return value >>> 0;
}

export function random(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    // 边界也属于该多边形，避免城市与行政区边缘的浮点误差。
    const cross = (point[0] - a[0]) * (b[1] - a[1]) - (point[1] - a[1]) * (b[0] - a[0]);
    if (Math.abs(cross) < 1e-7 && point[0] >= Math.min(a[0], b[0]) - 1e-7 && point[0] <= Math.max(a[0], b[0]) + 1e-7 && point[1] >= Math.min(a[1], b[1]) - 1e-7 && point[1] <= Math.max(a[1], b[1]) + 1e-7) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export const inside = (point, polygons) => polygons.some(polygon => pointInPolygon(point, polygon));

export function roughen(outline, rng) {
  const result = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    const steps = Math.max(2, Math.ceil(length / 5));
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      const offset = j === 0 ? 0 : (rng() - .5) * Math.min(length * .2, 6);
      result.push([round(a[0] + dx * t - dy / length * offset), round(a[1] + dy * t + dx / length * offset)]);
    }
  }
  return result;
}

export function planeArea(polygon) {
  return Math.abs(polygon.reduce((sum, p, i) => {
    const next = polygon[(i + 1) % polygon.length];
    return sum + p[0] * next[1] - next[0] * p[1];
  }, 0) / 2);
}

export function coordinates(point) {
  return { longitude: round(point[0] / WORLD.width * 360 - 180), latitude: round(90 - point[1] / WORLD.height * 180) };
}

export function surfaceArea(polygon) {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = coordinates(polygon[i]), b = coordinates(polygon[(i + 1) % polygon.length]);
    area += radians(b.longitude - a.longitude) * (Math.sin(radians(a.latitude)) + Math.sin(radians(b.latitude)));
  }
  return Math.abs(area * WORLD.radiusKm ** 2 / 2);
}

export function bounds(polygons) {
  const points = polygons.flat();
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

