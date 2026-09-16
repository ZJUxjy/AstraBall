# Azgaar 地形来源

- 上游：[Azgaar/Fantasy-Map-Generator](https://github.com/Azgaar/Fantasy-Map-Generator)
- 版本快照：`a7289d3e21bcd0ab3dc73d87b29c9ad8c32a2f94`
- 实际样例：[tests/fixtures/1.139.4.map](https://github.com/Azgaar/Fantasy-Map-Generator/blob/a7289d3e21bcd0ab3dc73d87b29c9ad8c32a2f94/tests/fixtures/1.139.4.map)，原始种子 `2`。
- 许可：MIT，完整版权及许可见 [LICENSE](LICENSE)。许可明确允许使用生成的地图及衍生作品。

`sample-source.json` 是从该样例提取的网格、高程、地物与河流数据，不包含用户数据。选用样例西侧的大陆（land feature 10）及附近岛屿；东侧另一片大陆未导入。坐标重新映射到本项目 1440×800 的地图空间，因此这是一幅重新排版、改编的样例地理图，不是原样例全图的完整复制。

## 复现

```sh
npm ci
npm run import:map
npm test
```

导入器重建 Azgaar 的加密海岸网格，保留高程、湖泊、河流及河流流域关系。AstraBall 的中文省市和四区行政划分由我们另行创建：按高程、坡度和河流穿越成本扩张领土，大都会保持紧凑，岛屿整岛分配。运行时读取生成好的数据，不依赖外部网站，也不运行 Azgaar 的完整编辑器。

行政边界通过 `scripts/lib/refine-borders.mjs` 统一细化共享线段：两省使用同一条曲线的正反序列，固定交汇点与海岸，缓和连续边段的折角，并加入确定性的低幅曲折。这是制图细化，不代表样例包含更高精度的河流或山脊数据。大区外界和省域复用同一组边线，点击、面积和城市归属使用细化后的多边形；测试检查边线交叉、面积守恒与岛屿完整性。

`scripts/lib/voronoi.mjs` 中的 Voronoi 与网格重建逻辑改编自上游 `src/generators/voronoi.ts`、`pack-generator.ts`，使用同一 MIT 许可。Delaunator 仅作为开发期导入依赖。

## 参考算法

- [高程生成](https://github.com/Azgaar/Fantasy-Map-Generator/blob/a7289d3e21bcd0ab3dc73d87b29c9ad8c32a2f94/src/generators/heightmap-generator.ts)
- [河流生成](https://github.com/Azgaar/Fantasy-Map-Generator/blob/a7289d3e21bcd0ab3dc73d87b29c9ad8c32a2f94/src/generators/river-generator.ts)
- [省份生成](https://github.com/Azgaar/Fantasy-Map-Generator/blob/a7289d3e21bcd0ab3dc73d87b29c9ad8c32a2f94/src/generators/provinces-generator.ts)
