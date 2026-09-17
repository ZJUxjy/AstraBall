#!/usr/bin/env python3
import json
import os
from pathlib import Path
os.environ.setdefault('MPLCONFIGDIR', '/private/tmp/astraball-academy-mpl')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties, fontManager
from matplotlib.lines import Line2D
root = Path(__file__).resolve().parents[2]
old = json.loads((root / 'artifacts/academy-world/world-final/report.json').read_text())
out = root / 'artifacts/academy-world/world-opportunity-v2'
new = json.loads((out / 'report.json').read_text())
assert old['status'] == new['status'] == 'completed' and len(old['seasons']) == len(new['seasons']) == 20
font_file = '/System/Library/Fonts/STHeiti Light.ttc'
fontManager.addfont(font_file)
plt.rcParams.update({'font.family': FontProperties(fname=font_file).get_name(), 'axes.unicode_minus': False,
                     'font.size': 10, 'axes.spines.top': False, 'axes.spines.right': False})
systems = [('closed', '大都会星冠联盟', 1), ('crown-league', '冠都', 3), ('silver-league', '裴渡', 3),
           ('lima-league', '利玛', 3), ('liberlin-league', '利柏林', 3), ('sichuan-league', '新四川', 3)]
colors = ['#286f83', '#bc7d2a', '#77954e']
fig, axes = plt.subplots(2, 3, figsize=(15, 9), sharex=True, sharey=True)
for ax, (key, label, tiers) in zip(axes.flat, systems):
    for tier in range(tiers):
        division = key if tier == 0 else f'{key}-{tier + 1}'
        for report, style, width, alpha in [(old, '--', 1.5, .65), (new, '-', 2.2, 1)]:
            values = [report['baseline'][division]['startingCA']['mean']]
            values += [s['divisions'][division]['startingCA']['mean'] for s in report['seasons']]
            ax.plot(range(21), values, style, color=colors[tier], lw=width, alpha=alpha)
    ax.set_title(label, loc='left', pad=10, fontweight='bold')
    ax.set_ylim(50, 90)
    ax.set_xlim(-.5, 20.5)
    ax.set_xticks([0, 5, 10, 15, 20], ['初始', '第5季', '第10季', '第15季', '第20季'])
    ax.grid(axis='y', color='#dce3e5', lw=.7)
    ax.set_ylabel('固定4-3-3 平均首发 CA')
fig.suptitle('同一初始世界，20季青训与流动规则对照', x=.06, ha='left', fontsize=21, fontweight='bold')
fig.text(.06, .924, '两组各95,180场真实正式比赛 · 成长后槽位CA · 各级俱乐部等权 · 健康结构口径', color='#53636c', fontsize=11)
handles = [Line2D([0], [0], color='#333333', lw=2, label='新规则'), Line2D([0], [0], color='#777777', linestyle='--', label='旧基线')]
handles += [Line2D([0], [0], color=c, lw=2, label=f'{i+1}级') for i, c in enumerate(colors)]
fig.legend(handles=handles, loc='lower center', bbox_to_anchor=(.5, .035), ncol=5, frameon=False)
fig.subplots_adjust(left=.06, right=.97, top=.86, bottom=.13, hspace=.30, wspace=.19)
fig.text(.06, .016, '始终使用固定4-3-3指标比较；新AI阵型能力另见报告。单个世界不等于现实校准或随机对照。', color='#53636c', fontsize=10)
for suffix in ['png', 'svg']:
    fig.savefig(out / f'ability-comparison.{suffix}', dpi=160, facecolor='white')
plt.close(fig)
print(out / 'ability-comparison.png')
