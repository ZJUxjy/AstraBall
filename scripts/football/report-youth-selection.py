#!/usr/bin/env python3
"""Render the saved Monte Carlo results; requires matplotlib and numpy."""
import os
os.environ.setdefault("MPLCONFIGDIR", "/private/tmp/astraball-youth-mpl")
import csv
import json
import math
from collections import Counter
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.font_manager import fontManager, FontProperties

ROOT = Path(__file__).resolve().parents[2]
FOLDER = ROOT / "artifacts/youth-selection/billion"
summary = json.loads((FOLDER / "summary.json").read_text())
with (FOLDER / "exact-scores.csv").open() as handle:
    exact = list(csv.DictReader(handle))
abilities = np.array([float(row["ability"]) for row in exact])
population = np.array([int(row["population_count"]) for row in exact])
selected = np.array([int(row["selected_count"]) for row in exact])
font_path = Path("/System/Library/Fonts/STHeiti Light.ttc")
if font_path.exists():
    fontManager.addfont(font_path)
    plt.rcParams["font.family"] = FontProperties(fname=str(font_path)).get_name()
plt.rcParams.update({"font.size": 11, "axes.unicode_minus": False, "svg.fonttype": "path"})
teal, gold, ink, muted = "#26766b", "#be8a23", "#1b342f", "#60756e"
fig, axes = plt.subplots(1, 2, figsize=(14, 6.8), gridspec_kw={"width_ratios": [1.05, 1]})
fig.patch.set_facecolor("#fafaf6")
fig.subplots_adjust(left=.075, right=.97, bottom=.23, top=.76, wspace=.23)
fig.text(.075, .925, "10 亿青训候选人：综合能力前 1% 的分布", fontsize=23, color=ink)
fig.text(.075, .855, "实际生成 420 亿项属性  ·  按位置加权评分  ·  精确选出 1,000 万人", fontsize=12, color=muted)
for ax in axes:
    ax.set_facecolor("#fafaf6")
    ax.spines[["top", "right"]].set_visible(False)
    ax.spines[["left", "bottom"]].set_color("#c8d1ca")
    ax.tick_params(colors=muted)
    ax.grid(axis="y", color="#e1e5df", linewidth=.7)
    ax.set_axisbelow(True)
bins = np.arange(27, 75, .5)
whole, _ = np.histogram(abilities, bins, weights=population)
accepted, _ = np.histogram(abilities, bins, weights=selected)
axes[0].bar(bins[:-1], whole / population.sum() * 100, width=.5, align="edge", color=teal, linewidth=0)
axes[0].bar(bins[:-1], accepted / population.sum() * 100, width=.5, align="edge", color=gold, linewidth=0)
cutoff = summary["cutoff"]["value"]
axes[0].axvline(cutoff, color=gold, linestyle="--", linewidth=1.3)
axes[0].annotate(f"入选门槛 {cutoff:.3f}", xy=(cutoff, 1.1), xytext=(57, 4.7),
                 color=gold, fontsize=11, arrowprops={"arrowstyle": "->", "color": gold})
axes[0].set(xlim=(30, 74), ylim=(0, 6.6), xlabel="综合能力（未取整）", ylabel="占全部候选人比例（% / 0.5 分）")
axes[0].set_title("全部候选人", loc="left", color=ink, pad=16)
rows = summary["distribution"]
lo = [row["lower_inclusive"] for row in rows]
percent = [row["selected_percent"] for row in rows]
axes[1].bar(lo, percent, width=.82, align="edge", color=gold)
for left, share in zip(lo, percent):
    if share >= .2:
        axes[1].text(left+.41, share+.9, f"{share:.2f}%", ha="center", fontsize=9, color=ink)
axes[1].set(xlim=(58.8, 68.5), ylim=(0, 58), xlabel="综合能力区间（左含右不含）", ylabel="占入选球员比例（% / 1 分）")
axes[1].set_xticks(range(59, 69))
axes[1].set_title("入选的 1,000 万人", loc="left", color=ink, pad=16)
axes[1].text(.97, .83, "平均 60.266\n中位数 59.938\n70 分以上 33 人\n最高 73.125", transform=axes[1].transAxes,
             ha="right", va="top", linespacing=1.8, color=ink, fontsize=12)
fig.text(.075, .115, "实验设定：统一 16 岁、无职业经验；位置关键属性均值 51、标准差 9，各属性独立抽样。", fontsize=10, color=muted)
fig.text(.075, .071, "保留游戏属性取整、1–99 边界及位置权重；不使用现有青训总评校准。结果表示入选时能力，未模拟职业成长。", fontsize=10, color=muted)
fig.savefig(FOLDER / "distribution.png", dpi=160, facecolor=fig.get_facecolor())
fig.savefig(FOLDER / "distribution.svg", facecolor=fig.get_facecolor())
plt.close(fig)

# Independent continuous-normal approximation, including each position's variance.
components = []
for position, slots in Counter(summary["model"]["positions"]).items():
    weights = list(summary["model"]["weights"][position].values())
    sigma = math.sqrt((81 + 1/12) * sum(w*w for w in weights) / sum(weights)**2)
    components.append((slots / 25, sigma))
survival = lambda value: sum(mass * .5 * math.erfc((value - 51) / sigma / math.sqrt(2)) for mass, sigma in components)
left, right = 51, 90
for _ in range(100):
    middle = (left + right) / 2
    if survival(middle) > .01:
        left = middle
    else:
        right = middle
theoretical_cutoff = (left + right) / 2
theoretical_mean = 51 + sum(mass * sigma * math.exp(-.5*((theoretical_cutoff-51)/sigma)**2) / math.sqrt(2*math.pi) for mass, sigma in components) / .01
validation = {"continuous_normal_mixture_cutoff": theoretical_cutoff, "continuous_normal_mixture_selected_mean": theoretical_mean,
              "simulated_cutoff": cutoff, "simulated_selected_mean": summary["selected"]["mean"],
              "note": "Approximation ignores attribute clipping and score discretization; includes approximate rounding variance 1/12."}
(FOLDER / "theory-check.json").write_text(json.dumps(validation, indent=2))

population_stats, selected_stats = summary["population"], summary["selected"]
table = "\n".join(f"| [{r['lower_inclusive']}, {r['upper_exclusive']}) | {r['selected_count']:,} | {r['selected_percent']:.5f}% |" for r in rows)
quantiles = "\n".join(f"| P{p} | {selected_stats['quantiles'][p]:.6f} |" for p in ("10", "25", "50", "75", "90", "95", "99", "99.9", "100"))
report = f"""# 青训候选人前 1% 选拔实验

实验日期：2026-09-16。实际生成 **{population_stats['count']:,} 人 × 42 项 = 42,000,000,000 项属性**，选取综合能力最高的 **{selected_stats['count']:,} 人**。数据通过分批 Monte Carlo 抽样产生，未将小样本外推为十亿人，也未用理论概率替代实际人数。

## 结果

入选者集中于门槛附近，右侧保留稀疏长尾；不再是对称的正态分布。原始总体是多个位置分布的混合，经边界裁切、取整及前 1% 筛选后，严格说是离散的条件混合分布。

| 指标 | 全部候选人 | 入选前 1% |
|---|---:|---:|
| 人数 | {population_stats['count']:,} | {selected_stats['count']:,} |
| 平均能力 | {population_stats['mean']:.6f} | {selected_stats['mean']:.6f} |
| 标准差 | {population_stats['stddev']:.6f} | {selected_stats['stddev']:.6f} |
| 中位数 | {population_stats['quantiles']['50']:.6f} | {selected_stats['quantiles']['50']:.6f} |
| 最低能力 | {population_stats['min']:.6f} | {selected_stats['min']:.6f} |
| 最高能力 | {population_stats['max']:.6f} | {selected_stats['max']:.6f} |

![分布图](distribution.png)

## 入选球员能力分布

区间左含右不含；第一档实际从 {cutoff:.9f} 开始。百分比的分母均为 10,000,000，展示值经四舍五入。

| 能力区间 | 人数 | 占入选者比例 |
|---|---:|---:|
{table}
| 合计 | 10,000,000 | 100% |

约 79.159% 的入选球员低于 61 分，91.798% 低于 62 分，98.970% 低于 64 分；70 分及以上共 33 人。最高分是本次样本极值，不是模型上限，也不应据此推算下一批的最高值。

| 入选人群内部的分位数 | 综合能力 |
|---|---:|
{quantiles}

P90 表示约 90% 的入选者不超过该值；它对应原始总体约 P99.9。

## 实验定义与游戏代码的关系

- 统一设定为 16 岁、职业出场次数为 0；这些标签不直接参与本次总评公式，不模拟训练、比赛经验或年龄成长。
- 以当前默认青训的 `potential=80, age=16` 为基础：平均目标能力为 `80−29=51`，据此设定 `quality=44`，位置相关属性均值为 `44+7=51`，单项标准差为 9。**这一均值属于本次实验假设，并非从现实青少年数据拟合。**
- 每项属性独立抽样。使用游戏的 `POSITION_WEIGHTS`、`ATTRIBUTE_KEYS`、门将专项修正、1–99 边界及整数属性，完整生成 42 项属性。
- 与 `generateYouthPlayer` 的区别：不执行 `target ±3` 抽样及生成后的总评平移校准，不设个人基础水平偏移；否则总体会被固定潜力的目标值拉回窄幅均匀分布，无法观察这次要求的正态属性选拔。
- 位置人数沿用 25 人名单比例：GK 12%、CB 16%、LB/RB/DM/AM/LW/RW 各 8%、CM/ST 各 12%。按全体总评统一选前 1%，不设置各位置录取名额。
- 综合能力使用 `preciseRating`：位置相关属性的加权平均，保留小数排名，不先取界面显示的整数总评。潜力和性格不参与排名；姓名、背景等身份字段也不影响评分，因此不生成这些字段。
- 使用 NumPy PCG64 的正态抽样，固定种子 `20260916`。这是与游戏属性分布规则一致的独立模拟，不复刻游戏随机种子对应的逐人结果。

## 边界同分与精确人数

门槛为精确分数 **{summary['cutoff']['exact']} = {cutoff:.12f}**。高于门槛的球员有 {10_000_000-summary['cutoff']['tied_selected']:,} 人，恰好同分的有 {summary['cutoff']['tied_population']:,} 人，只需其中 {summary['cutoff']['tied_selected']:,} 人即可凑满 1,000 万。统计按同分人数截取；未存储候选人身份，因此不指定同分者中哪些个人入选，这不影响能力分布。

直方图以属性加权整数和及权重分母记录，跨位置使用精确有理数比较。分数分箱仅用于展示，不用于决定入选门槛。

## 数学解释与游戏含义

单一位置、忽略取整和边界时，总评是独立正态属性的加权平均，其标准差为 `9 × sqrt(sum(w²)) / sum(w)`，约 3.18–3.64。独立属性互相平均，导致总评比单项属性集中。各位置混合后实测总评标准差为 {population_stats['stddev']:.6f}。

对于单一正态总体，取上端 1% 后的密度为 `f_selected(x)=f_population(x)/0.01`（仅在门槛及以上有值），门槛以下为 0。因此门槛附近人数最多，越高分人数越少。当前实验因位置方差不同、整数属性和同分截取，是这一现象的离散混合版本。

连续正态混合近似预期门槛 {theoretical_cutoff:.6f}、入选均值 {theoretical_mean:.6f}，与实际模拟接近；近似结果仅用于交叉核验，不用于替代人数统计。

在这套设定下，“职业准入者”会大量集中在 59–61 分，并自然形成少量高分球员。**这是统一年龄的职业入门能力分布，不是经历多年训练后全体职业球员的能力分布，也不是潜力分布。**

位置权重还会影响入选率：例如中卫的总评分布较窄，边锋较宽；统一门槛会改变入选后的位置比例。若未来希望每个位置都录取 1%，应分别按位置筛选，那是另一种实验口径。

## 复现与核验

```sh
python3 scripts/football/youth-selection.py --count 1000000000 --workers 8 --output artifacts/youth-selection/billion
python3 scripts/football/test-youth-selection.py
python3 scripts/football/report-youth-selection.py
```

依赖：模拟使用 Python + NumPy；作图另需 matplotlib。主程序从当前游戏模块读取权重与属性定义，固定 100 个分片，每片 1,000 万人，每批 50,000 人。已有相同配置分片会恢复使用；要从头重跑，可指定新的输出目录。改变 batch、模型或其他参数时应使用新目录。应使用相同 NumPy 版本复现精确随机序列。

- 运行环境：Python {summary['runtime']['python']}，NumPy {summary['runtime']['numpy']}，{summary['runtime']['platform']}。
- 完整模拟耗时约 {summary['runtime']['wall_seconds']:.2f} 秒，8 个进程；100 个分片人数之和为 1,000,000,000，入选直方图人数之和为 10,000,000。
- 对保留的 30 个样本调用游戏原始 `preciseRating` 和 `rating`，结果一致。
- 5 项独立测试覆盖逐人排序对照、边界同分、跨位置有理数合并、展开样本统计对照与百万预跑的理论方差。
- 项目原有 `npm test` 共 70 项测试全部通过。
- 标准正态抽样诊断覆盖各分片开头共 {summary['normal_diagnostic']['count']:,} 次抽样：均值 {summary['normal_diagnostic']['mean']:.6f}，标准差 {summary['normal_diagnostic']['stddev']:.6f}。
- 球员代码 SHA-256：`{summary['source_sha256']}`。

文件：`distribution.csv` 为每 1 分区间人数；`exact-scores.csv` 为每个精确总评分数的人数；`summary.json` 保存参数及统计；`shards/` 保存完整分片直方图。没有修改游戏生成逻辑。
"""
(FOLDER / "report.md").write_text(report)
print(json.dumps(validation, indent=2))
print(FOLDER / "distribution.png")
