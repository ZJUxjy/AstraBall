import sample from './data/azgaar-sample.js';

// 固定世界使用 Azgaar 实际生成的地形样例。修改种子只影响城市细节，不重画海岸。
// 导入与按高程、河流阻力分配行政区的过程见 scripts/import-azgaar.mjs。
export function buildGeography() {
  return sample;
}
