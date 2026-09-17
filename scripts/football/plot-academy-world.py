#!/usr/bin/env python3
"""Plot completed production-engine audit data; does not simulate any players.

PYTHONPATH=/private/tmp/astraball-youth-plot python3 scripts/football/plot-academy-world.py
"""
import json
import os
import sys
from pathlib import Path

os.environ.setdefault("MPLCONFIGDIR", "/private/tmp/astraball-academy-mpl")
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties, fontManager

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "artifacts/academy-world/world-final"
report = json.loads((OUT / "report.json").read_text())
preview = "--preview" in sys.argv
assert preview or (report["status"] == "completed" and len(report["seasons"]) == 20)
years = len(report["seasons"])
font_file = "/System/Library/Fonts/STHeiti Light.ttc"
fontManager.addfont(font_file)
plt.rcParams.update({"font.family": FontProperties(fname=font_file).get_name(),
                     "axes.unicode_minus": False, "font.size": 11,
                     "axes.spines.top": False, "axes.spines.right": False})
systems = [("closed", "大都会星冠联盟", 1), ("crown-league", "冠都", 3),
           ("silver-league", "裴渡", 3), ("lima-league", "利玛", 3),
           ("liberlin-league", "利柏林", 3), ("sichuan-league", "新四川", 3)]
colors = ["#286f83", "#bc7d2a", "#77954e"]
fig, axes = plt.subplots(2, 3, figsize=(15, 9), sharex=True, sharey=True)
for ax, (key, label, tiers) in zip(axes.flat, systems):
    for tier in range(tiers):
        division = key if tier == 0 else f"{key}-{tier + 1}"
        values = [report["baseline"][division]["startingCA"]["mean"]]
        values += [s["divisions"][division]["startingCA"]["mean"] for s in report["seasons"]]
        ax.plot(range(years + 1), values, color=colors[tier], lw=2,
                label=f"{'常规赛' if tiers == 1 else str(tier + 1) + '级'} · 最终 {values[-1]:.1f}")
        ax.scatter([0, years], [values[0], values[-1]], color=colors[tier], s=22)
    ax.set_title(label, loc="left", pad=12, fontweight="bold")
    ax.set_ylim(50, 90)
    ax.set_xlim(-.5, 20.5)
    ax.set_xticks([0, 5, 10, 15, 20], ["初始", "第5季", "第10季", "第15季", "第20季"])
    ax.grid(axis="y", color="#dce3e5", lw=.7)
    ax.legend(loc="lower left", frameon=False, fontsize=10)
    ax.set_ylabel("平均首发 CA")
fig.suptitle(f"{years} 个赛季：各级联赛平均首发能力" + ("（未完成预览）" if preview else ""), x=.06, ha="left", fontsize=21, fontweight="bold")
fig.text(.06, .924, f"{report['matches']:,} 场真实正式比赛 · 各级俱乐部等权 · 成长后首发11人CA · 4-3-3 · 忽略伤停", color="#53636c", fontsize=11)
fig.subplots_adjust(left=.06, right=.97, top=.86, bottom=.09, hspace=.30, wspace=.19)
fig.text(.06, .027, "固定世界一次运行；不能代表现实分布。初始点为第一个赛季开始前，后续点为各赛季年末。", color="#53636c", fontsize=10)
fig.savefig(OUT / ("ability-trends-preview.png" if preview else "ability-trends.png"), dpi=160, facecolor="white")
fig.savefig(OUT / ("ability-trends-preview.svg" if preview else "ability-trends.svg"), facecolor="white")
plt.close(fig)
print(OUT / ("ability-trends-preview.png" if preview else "ability-trends.png"))
