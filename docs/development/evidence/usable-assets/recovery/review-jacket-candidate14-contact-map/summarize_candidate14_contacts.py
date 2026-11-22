"""Summarize actual candidate14 intersection points; no contact waiver."""
from pathlib import Path
from collections import Counter
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from matplotlib.patches import Rectangle

root = Path('/workspace/scratch/61afcdd4e3c6/work/garment/export-review/body-collar-map-candidate14')
report = json.loads((root/'report.json').read_text())
records = report['records']
assert all(r['actualIntersectionMapping'] for r in records)


def summary(rows):
    if not rows:
        return {'pairs': 0}
    ps = np.concatenate([r['intersectionPointsM'] for r in rows])
    uv = np.concatenate([r['intersectionSourceParameters'] for r in rows])
    return {'pairs': len(rows), 'sourceBounds': [uv.min(0).tolist(), uv.max(0).tolist()],
        'physicalBoundsM': [ps.min(0).tolist(), ps.max(0).tolist()],
        'hingeDistanceM': [min(min(r['nativeNearestColumn0PolylineM']) for r in rows),
                           max(max(r['nativeNearestColumn0PolylineM']) for r in rows)],
        'shellTypes': dict(Counter(r['bodyShell']+'/'+r['collarShell'] for r in rows)),
        'freeColumn44': sum(r['touchesFreeColumn44'] for r in rows)}


segments = {
    'column0': [r for r in records if r['parametricBand'] == 'column0_boundary'],
    'firstCell': [r for r in records if r['parametricBand'] == 'first_original_width_cell_0_to_4'],
    'intermediate4to16': [r for r in records if r['parametricBand'] == 'beyond_first_original_width_cell' and r['intersectionSourceParameterMax'][1] <= 16+1e-7],
    'beyond16': [r for r in records if r['intersectionSourceParameterMax'][1] > 16+1e-7],
    'gorgePatch': [r for r in records if r['knownVisibleGorgePatch']],
    'freeColumn44': [r for r in records if r['touchesFreeColumn44']],
}
for region in report['bySourceRegion']:
    segments['beyond16 '+region] = [r for r in segments['beyond16'] if r['sourceRegion'] == region]
segments['positiveXReturn'] = [r for r in segments['beyond16'] if max(x[0] for x in r['intersectionPointsM']) > 0]
segments['negativeXReturn'] = [r for r in segments['beyond16'] if max(x[0] for x in r['intersectionPointsM']) <= 0]
out = {k: summary(v) for k, v in segments.items()}
out['collarSelfContact'] = report['collarSelfContact']
out['fittedState'] = report['fittedState']
out['gorgePairIds'] = [[r['bodyTriangle'], r['collarTriangle']] for r in segments['gorgePatch']]
out['interpretation'] = 'All categories remain observed contacts. Parameter proximity is not a stitched allowance. Bounds include the full observed contact segment, even when only part meets a highlighted parameter rectangle.'
(root/'classification-summary.json').write_text(json.dumps(out, indent=2)+'\n')

colors = ['#235789', '#18a999', '#d4a340', '#b4423a']
keys = ['column0', 'firstCell', 'intermediate4to16', 'beyond16']
labels = [f'Column 0 rim ({len(segments[keys[0]]):,})',
          f'First width cell: 0–4 ({len(segments[keys[1]]):,})',
          f'Intermediate width: 4–16 ({len(segments[keys[2]]):,})',
          f'Returned/free width: >16 ({len(segments[keys[3]]):,})']
fig, axes = plt.subplots(3, 1, figsize=(12, 9), gridspec_kw={'height_ratios': [1.3, 1, .8]}, layout='constrained')
for index, ax in enumerate(axes):
    for color, key, label in zip(colors, keys, labels):
        selected = [np.asarray(r['intersectionSourceParameters']) for r in segments[key]]
        if not selected:
            continue
        ax.add_collection(LineCollection(selected, colors=color, linewidths=1 if index else .6, alpha=.8))
        if index == 0:
            centers = np.array([v.mean(axis=0) for v in selected])
            ax.scatter(centers[:, 0], centers[:, 1], s=3, c=color, label=label, alpha=.65)
    ax.grid(alpha=.15)
    ax.set_ylabel('Original dense width column')
    ax.set_xlabel('Original dense strip row')
axes[0].set_xlim(-10, 1394)
axes[0].set_ylim(-1.5, 46)
axes[0].set_yticks([0, 4, 16, 28, 44])
axes[0].axvspan(0, 8, color='#6d597a', alpha=.15)
axes[0].axvspan(1376, 1384, color='#6d597a', alpha=.15)
axes[0].set_title('Separate candidate14 regional fit: all 3,017 actual body/collar contact segments', loc='left', weight='bold')
axes[0].legend(loc='upper center', ncol=2, fontsize=9, framealpha=.95)
axes[1].set_xlim(897, 940)
axes[1].set_ylim(16, 45)
axes[1].set_yticks([16, 25, 28, 36, 44])
axes[1].add_patch(Rectangle((930, 25), 4, 3, facecolor='none', edgecolor='#172b4d', linewidth=1.7))
axes[1].annotate('Prior visible-patch parameters:\n5 body outer / collar inner pairs', xy=(932, 26.5), xytext=(898, 18.5),
                 fontsize=9, arrowprops={'arrowstyle': '->', 'color': '#172b4d'})
axes[1].set_title('Negative-X return: 243 pairs, including 24 at the actual free outline (column 44)', loc='left')
axes[2].set_xlim(452, 461)
axes[2].set_ylim(24, 30)
axes[2].set_yticks([24, 26, 28, 30])
axes[2].set_title('Positive-X return: 4 body outer / collar inner pairs', loc='left')
fig.suptitle('Source parameters locate contacts; no region is automatically exempt', fontsize=12)
fig.savefig(root/'contact-parameter-map.png', dpi=150)
plt.close(fig)
print(json.dumps({'pairs': len(records), 'categories': {k: len(segments[k]) for k in keys}, 'positiveXReturn': len(segments['positiveXReturn']), 'negativeXReturn': len(segments['negativeXReturn'])}))
