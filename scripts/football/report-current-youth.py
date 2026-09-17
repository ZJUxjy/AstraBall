#!/usr/bin/env python3
"""Render current-generator Monte Carlo statistics; never generate substitute data.

Usage: PYTHONPATH=/private/tmp/astraball-youth-plot python3 \
  scripts/football/report-current-youth.py [artifacts/youth-current-billion]
Requires numpy and matplotlib. summary.json must come from the actual simulation.
"""
import argparse
import json
import os
from pathlib import Path

os.environ.setdefault("MPLCONFIGDIR", "/private/tmp/astraball-current-youth-mpl")
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties, fontManager

ROOT = Path(__file__).resolve().parents[2]
GROUPS = {
    "technical": ("技术", {"passing": "短传", "longPassing": "长传", "firstTouch": "停球", "dribbling": "盘带", "technique": "技术", "crossing": "传中", "finishing": "射门", "longShots": "远射", "heading": "头球", "tackling": "抢断", "marking": "盯人", "corners": "角球", "freeKicks": "任意球", "penalties": "点球"}),
    "physical": ("身体", {"pace": "速度", "acceleration": "爆发力", "agility": "敏捷", "balance": "平衡", "strength": "力量", "jumping": "弹跳", "stamina": "耐力", "naturalFitness": "恢复能力"}),
    "mental": ("意识", {"vision": "视野", "decisions": "决策", "anticipation": "预判", "positioning": "防守站位", "offBall": "无球跑动", "composure": "镇定", "concentration": "专注", "teamwork": "团队合作", "workRate": "投入", "leadership": "领导力", "aggression": "侵略性", "bravery": "勇敢"}),
    "goalkeeper": ("守门", {"reflexes": "反应", "handling": "接球", "oneOnOnes": "单刀防守", "aerialReach": "制空", "command": "指挥", "rushingOut": "出击", "kicking": "开球", "throwing": "手抛球"}),
}
ATTRIBUTES = [{"key": key, "label": label, "group": group} for group, (_, fields) in GROUPS.items() for key, label in fields.items()]
POSITIONS = {"GK": "门将", "CB": "中卫", "LB": "左后卫", "RB": "右后卫", "DM": "后腰", "CM": "中场", "AM": "前腰", "LW": "左边锋", "RW": "右边锋", "ST": "前锋"}
INK, MUTED, TEAL, GOLD = "#183b38", "#647572", "#287e78", "#b8802e"
COLORS = ["#347fa0", "#287e78", "#b8802e"]


def stat_check(stat, count):
    assert stat["count"] == count, "统计人数不一致"
    assert len(stat["histogram"]) == 1000, "应为1000个0.1分箱"
    assert abs(stat["binWidth"] - .1) < 1e-12
    assert sum(stat["histogram"]) == count, "直方图人数不一致"
    assert stat["min"] <= stat["mean"] <= stat["max"]
    assert stat["stddev"] >= 0
    for q in ("1", "10", "50", "90", "99"):
        assert q in stat["quantiles"]


def validate(data):
    n = data["count"]
    assert n > 0
    for dimension in ("byAge", "byPosition"):
        assert sum(item["ca"]["count"] for item in data[dimension].values()) == n
    for scope in [data["overall"], *data["byAge"].values(), *data["byPosition"].values()]:
        count = scope["ca"]["count"]
        for kind in ("ca", "pa"):
            stat_check(scope[kind], count)
        assert -1 <= scope["correlation"] <= 1
    gk = data["byPosition"]["GK"]["ca"]["count"]
    for name, count in (("all", n), ("GK", gk), ("outfield", n - gk)):
        assert len(data["attributes"][name]) == 42
        for stat in data["attributes"][name]:
            stat_check(stat, count)


def style():
    font = Path("/System/Library/Fonts/STHeiti Light.ttc")
    if font.exists():
        fontManager.addfont(font)
        plt.rcParams["font.family"] = FontProperties(fname=str(font)).get_name()
    plt.rcParams.update({"font.size": 11, "axes.unicode_minus": False,
                         "figure.facecolor": "#fcfcf9", "axes.facecolor": "#fcfcf9",
                         "axes.spines.top": False, "axes.spines.right": False,
                         "axes.labelcolor": INK, "text.color": INK,
                         "xtick.color": MUTED, "ytick.color": MUTED,
                         "axes.edgecolor": "#c9d3ce", "savefig.dpi": 170})


def plot_distribution(ax, stat, label, color, step=10):
    counts = np.asarray(stat["histogram"], dtype=np.float64)
    grouped = counts.reshape(-1, step).sum(axis=1)
    width = stat["binWidth"] * step
    x = (np.arange(len(grouped)) + .5) * width
    ax.plot(x, grouped / stat["count"] * 100, color=color, label=label, linewidth=2)
    ax.set(xlabel="能力值", ylabel=f"比例（% / {width:g} 分）", xlim=(15, 100))
    ax.grid(axis="y", alpha=.2)


def charts(data, folder):
    style()
    fig, axes = plt.subplots(2, 2, figsize=(13.8, 9))
    fig.subplots_adjust(left=.075, right=.98, top=.87, bottom=.10, hspace=.40, wspace=.22)
    fig.suptitle(f"当前青训生成器 · {data['count']:,} 人", fontsize=23, x=.075, ha="left", y=.965)
    fig.text(.075, .915, "15 / 16 / 17 岁 · 无职业经验 · 全体新生 · 未筛选前 1%", color=MUTED)
    for col, (kind, title, color) in enumerate((("ca", "当前能力 CA", TEAL), ("pa", "隐藏潜力 PA", GOLD))):
        stat = data["overall"][kind]
        plot_distribution(axes[0, col], stat, "全体", color)
        axes[0, col].set_title(title, loc="left", pad=13)
        axes[0, col].text(.96 if kind == "ca" else .04, .93, f"均值 {stat['mean']:.2f}\n标准差 {stat['stddev']:.2f}\nP10—P90 {stat['quantiles']['10']:.1f}—{stat['quantiles']['90']:.1f}", transform=axes[0, col].transAxes, va="top", ha="right" if kind == "ca" else "left", linespacing=1.7)
        axes[1, col].set_title(f"{title} · 按入学年龄", loc="left", pad=13)
        for age, color in zip(sorted(data["byAge"], key=int), COLORS):
            plot_distribution(axes[1, col], data["byAge"][age][kind], f"{age} 岁", color)
        axes[1, col].legend(frameon=False)
    fig.text(.075, .028, "曲线为实际人数按 1 分合并后的频率；均值/标准差来自连续值。PA 是发展上限，不是成年兑现能力。", fontsize=10, color=MUTED)
    fig.savefig(folder / "ability-potential-distribution.png")
    plt.close(fig)

    fig, axes = plt.subplots(1, 3, figsize=(15.5, 15), sharey=True)
    fig.subplots_adjust(left=.15, right=.97, top=.90, bottom=.07, wspace=.08)
    fig.suptitle("42 项属性 · 当前能力分布", fontsize=23, x=.15, ha="left", y=.96)
    fig.text(.15, .93, "圆点：均值　横线：P10—P90；分位数以 0.1 分直方图估计", color=MUTED)
    y = np.arange(42)
    for ax, scope, title, color in zip(axes, ["all", "GK", "outfield"], ["全体", "门将", "外场球员"], [TEAL, GOLD, "#347fa0"]):
        values = data["attributes"][scope]
        avg = [item["mean"] for item in values]
        lo = [item["quantiles"]["10"] for item in values]
        hi = [item["quantiles"]["90"] for item in values]
        ax.hlines(y, lo, hi, color=color, linewidth=2.4, alpha=.62)
        ax.scatter(avg, y, color=color, s=18, zorder=3)
        ax.set(title=f"{title}（{values[0]['count']:,} 人）", xlim=(0, 80), xlabel="属性值")
        ax.set_yticks(y, [item["label"] for item in ATTRIBUTES])
        ax.grid(axis="x", alpha=.18)
        for boundary in (13.5, 21.5, 33.5):
            ax.axhline(boundary, color="#c7d3ce", linewidth=1)
    axes[0].invert_yaxis()
    fig.text(.15, .018, "守门专项必须分门将与外场解读；外场低值和门将技术惩罚属于生成规则。总体混合分布不能代表某个位置。", fontsize=10, color=MUTED)
    fig.savefig(folder / "attribute-distributions.png")
    plt.close(fig)

    fig, axes = plt.subplots(7, 6, figsize=(20, 20))
    fig.subplots_adjust(left=.055, right=.985, top=.915, bottom=.060, hspace=.50, wspace=.28)
    fig.suptitle("42 项属性 · 实际直方图频率", fontsize=25, x=.055, ha="left", y=.975)
    fig.text(.055, .944, "每条曲线按自身人群归一化 · 2 分箱 · 横轴：属性值 · 纵轴：该组比例（%）", color=MUTED, fontsize=12)
    scope_colors = (("all", "全体", TEAL), ("GK", "门将", GOLD), ("outfield", "外场球员", "#347fa0"))
    for i, (attr, ax) in enumerate(zip(ATTRIBUTES, axes.flat)):
        for scope, label, color in scope_colors:
            stat = data["attributes"][scope][i]
            counts = np.asarray(stat["histogram"], dtype=np.float64).reshape(-1, 20).sum(axis=1)
            # Exact 2-point bins from the saved 0.1-point counts, no KDE smoothing.
            ax.stairs(counts / stat["count"] * 100, np.arange(0, 102, 2), color=color, label=label, linewidth=1.4, alpha=.92)
        ax.set_title(f"{GROUPS[attr['group']][0]} · {attr['label']}", loc="left", fontsize=11, pad=6)
        ax.set(xlim=(0, 100), ylim=(0, None))
        ax.set_xticks([0, 25, 50, 75, 100])
        ax.tick_params(labelsize=8)
        ax.grid(axis="y", alpha=.17)
    handles, labels = axes.flat[0].get_legend_handles_labels()
    fig.legend(handles, labels, loc="upper right", bbox_to_anchor=(.985, .983), ncol=3, frameon=False, fontsize=12)
    fig.text(.055, .023, "各小图纵轴独立缩放；同一小图三组共用纵轴。门将技术初值较低，外场守门专项接近低端；混合后可出现双峰与边界堆积。", color=MUTED, fontsize=11)
    fig.savefig(folder / "attribute-histograms.png")
    plt.close(fig)


def row_stat(name, stat):
    q = stat["quantiles"]
    return f"| {name} | {stat['mean']:.3f} | {stat['stddev']:.3f} | {q['1']:.1f} | {q['10']:.1f} | {q['50']:.1f} | {q['90']:.1f} | {q['99']:.1f} | {stat['min']:.3f} | {stat['max']:.3f} |"


STAT_HEADER = "| 指标 | 均值 | 标准差 | P1 | P10 | P50 | P90 | P99 | 最低 | 最高 |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|"


def bin_count(stat, low, high):
    width = stat["binWidth"]
    return sum(stat["histogram"][round(low / width):round(high / width)])


def report(data, folder):
    overall = data["overall"]
    text = ["# 当前青训生成器：能力、潜力与42项属性分布", "",
            f"本次实际统计 **{data['count']:,} 名新生成的青训球员**。年龄为15、16、17岁各近三分之一，10个位置各约10%；无职业经验，未按当前能力取前1%。这批人代表当前游戏青训生成规则下的新生，不代表经历选拔和多年成长后的职业球员。", "",
            "## 能力与潜力", "", STAT_HEADER,
            row_stat("当前能力 CA", overall["ca"]), row_stat("隐藏潜力 PA", overall["pa"]), "",
            f"CA 与 PA 的皮尔逊相关系数为 **{overall['correlation']:.6f}**。年龄、此前训练和成熟早晚会改变初始能力，潜力则来自相关的发展领域与单项上限。相同当前能力不等于相同潜力。", "",
            "![能力与潜力分布](ability-potential-distribution.png)", "",
            "CA 使用当前属性按本职位置加权的未取整总评；PA 使用各项隐藏发展上限按相同位置加权。PA 是游戏模型中的上限，不是保证兑现的成年能力，也不是观察报告的预测区间。", "",
            "分布来自共享随机因素、领域因素、成熟度、此前训练、单项噪声及边界裁切的共同作用；总体还是年龄与位置的混合。因此不应把本次结果称为严格正态分布。", "",
            "### 每10分区间人数", "", "区间左含右不含；最后一档覆盖到100分。", "",
            "| 区间 | CA 人数 | CA 比例 | PA 人数 | PA 比例 |", "|---|---:|---:|---:|---:|"]
    for low in range(0, 100, 10):
        ca, pa = (bin_count(overall[kind], low, low + 10) for kind in ("ca", "pa"))
        text.append(f"| [{low}, {low + 10}) | {ca:,} | {ca / data['count'] * 100:.6f}% | {pa:,} | {pa / data['count'] * 100:.6f}% |")
    for title, field in (("按年龄", "byAge"), ("按位置", "byPosition")):
        text += ["", f"## {title}", "", "| 分组 | 人数 | CA 均值 | CA 标准差 | CA P10—P90 | PA 均值 | PA 标准差 | PA P10—P90 | CA/PA 相关 |", "|---|---:|---:|---:|---|---:|---:|---|---:|"]
        for key, item in data[field].items():
            name = f"{key}岁" if field == "byAge" else f"{POSITIONS[key]}（{key}）"
            ca, pa = item["ca"], item["pa"]
            text.append(f"| {name} | {ca['count']:,} | {ca['mean']:.3f} | {ca['stddev']:.3f} | {ca['quantiles']['10']:.1f}—{ca['quantiles']['90']:.1f} | {pa['mean']:.3f} | {pa['stddev']:.3f} | {pa['quantiles']['10']:.1f}—{pa['quantiles']['90']:.1f} | {item['correlation']:.5f} |")
    text += ["", "按年龄是不同新生组的横截面比较，不是同一批球员的成长追踪。PA生成公式不使用年龄；年龄组间的小差异来自本次抽样。", "", "## 42项当前属性", "", "下表是全体混合统计。门将专项的低总体均值包含90%的外场球员，不能用于评估门将质量；门将技术属性也有初始扣减，分组图更适合判断位置差异。", "", "![42项属性分布](attribute-distributions.png)", "", "下图展示全部42项属性的实际直方图，将0.1分箱合并为2分箱；每条曲线分别除以该人群人数，没有平滑拟合。小图纵轴独立缩放，可直接查看双峰、截断和低端堆积。", "", "![42项属性实际直方图](attribute-histograms.png)", "", STAT_HEADER]
    for attr, stat in zip(ATTRIBUTES, data["attributes"]["all"]):
        text.append(row_stat(f"{GROUPS[attr['group']][0]}·{attr['label']}", stat))
    text += ["", "## 守门专项：门将与外场分别统计", "", "外场球员的守门专项采用独立的低值生成分支，而且初始值还受单项上限减4约束。它们的分布不是门将专项分布的低端抽样。", "", STAT_HEADER]
    for i, attr in enumerate(ATTRIBUTES):
        if attr["group"] == "goalkeeper":
            for scope, title in (("GK", "门将"), ("outfield", "外场")):
                text.append(row_stat(f"{attr['label']}·{title}", data["attributes"][scope][i]))
    text += ["", "## 统计口径与核验", "",
             "- 均值、总体标准差、极值和相关系数来自实际连续数值累加，不由直方图中心近似。初始属性保留小数，界面显示的整数总评没有参与统计。",
             "- 直方图宽度为0.1分，共1,000箱；P1/P10/P50/P90/P99由直方图估计，落箱误差不超过0.1分。P90表示约90%的人不超过该值。",
             "- 图中能力和潜力曲线再合并为1分箱，只用于显示。全量0.1分箱人数在 `summary.json`。极小概率造成的最高/最低值是本次样本极值，不是理论上下限。",
             "- 本报告程序核验总体、年龄、位置人数总和，以及每项统计的直方图人数。并未将小样本乘倍数冒充10亿个实际生成结果。",
             "- 沿用游戏的32位种子哈希；不同球员ID可能碰到相同随机状态。因此10亿个球员ID不等于10亿条互不重复、完全独立的随机序列，本实验保留这一现有实现特性。",
             "- 当前模型参数属于游戏设计先验；本实验检验该模型产生了什么分布，没有证明它符合现实球员分布。", "",
             "### 运行配置", "", "```json", json.dumps(data.get("config", {}), ensure_ascii=False, indent=2), "```", "",
             "### 生成器与统计验证", "", "```json", json.dumps(data.get("validation", {}), ensure_ascii=False, indent=2), "```", "",
             "### 重建报告", "", "```sh", "PYTHONPATH=/private/tmp/astraball-youth-plot python3 scripts/football/report-current-youth.py artifacts/youth-current-billion", "```", "",
             "模拟输出 `summary.json` 是报告的数据来源；报告脚本不重新抽样，不调整生成器，也不套用上一轮独立正态属性实验的参数。", ""]
    (folder / "report.md").write_text("\n".join(text), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("folder", nargs="?", type=Path, default=ROOT / "artifacts/youth-current-billion")
    args = parser.parse_args()
    data = json.loads((args.folder / "summary.json").read_text())
    validate(data)
    model_path = args.folder / "model.json"
    if model_path.exists():
        model = json.loads(model_path.read_text())
        model_attrs = model.get("attributes", [])
        if model_attrs and isinstance(model_attrs[0], dict):
            assert [item["key"] for item in model_attrs] == [item["key"] for item in ATTRIBUTES], "模型属性次序变化，请更新报告标签"
        elif model_attrs:
            assert model_attrs == [item["key"] for item in ATTRIBUTES], "模型属性次序变化，请更新报告标签"
    charts(data, args.folder)
    report(data, args.folder)
    print(json.dumps({"count": data["count"], "report": str(args.folder / "report.md"), "plots": ["ability-potential-distribution.png", "attribute-distributions.png", "attribute-histograms.png"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
