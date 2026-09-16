# Faker 姓名词库

- 来源：[faker-js/faker](https://github.com/faker-js/faker)，固定版本 `v9.9.0`。
- 上游本地化设计：[Localization](https://fakerjs.dev/guide/localization.html)；按命名传统分别维护名字、姓氏和组合规则。
- 许可证：MIT，完整版权与历史许可见本目录 `LICENSE`。
- `src/locales/` 保存 en、de、fr、es、pt_BR、ru、ar 的原始 first_name / last_name 文件；不在浏览器执行这些 TypeScript 文件。
- `manifest.json` 记录每个原文件 URL、SHA-256、实际选用情况及补充词条。

运行时使用 `src/football/names-data.js` 的人工筛选子集，共 381 个名字/姓氏部件：298 个与上述上游文件匹配，35 个为本项目补充，48 个为原有中文姓名部件扩展。中文译写均由本项目编写，并非 Faker 官方译名。原始词库作为来源证据保留，没有把 Faker 的完整运行库或网络请求引入游戏。

目前竞技球员生成器使用男性名字子集；不限性别的家族人口生成、父称和各地区更精细的命名规则属于后续扩展，不能把当前模板当成完整民族姓名学模型。
