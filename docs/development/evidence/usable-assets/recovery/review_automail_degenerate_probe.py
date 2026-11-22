"""Read-only area classification of the frozen automail candidate 04."""
import hashlib
import json
import sys
from pathlib import Path

import bpy

repo = Path(__file__).resolve().parents[5]
sys.path.insert(0, str(repo / 'skills/refas/scripts/production'))
from mesh_audit import audit_mesh

native = Path(bpy.data.filepath)
bpy.context.scene.frame_set(1)
bpy.context.view_layer.update()
rows = []
for obj in bpy.context.scene.objects:
    if obj.type != 'MESH' or 'Recess_interiors' not in obj.name:
        continue
    result = audit_mesh(obj, meters_per_unit=1, max_details=1000)
    bad = result['degenerateTriangles']
    rows.append({
        'object': obj.name,
        'matrixWorld': [list(row) for row in obj.matrix_world],
        'sourceParts': json.loads(obj.get('source_parts_json', '[]')),
        'lengthToleranceM': result['lengthToleranceM'],
        'areaToleranceM2': result['areaToleranceM2'],
        'statistics': result['statistics'],
        'degenerateTriangles': bad,
    })
output = Path(sys.argv[sys.argv.index('--') + 1])
output.write_text(json.dumps({
    'scope': 'Read-only audit of saved candidate 04. Input bytes not saved or changed.',
    'nativeSha256': hashlib.sha256(native.read_bytes()).hexdigest(),
    'objects': rows,
}, indent=2) + '\n')
for row in rows:
    if row['statistics']['degenerateTriangles']:
        print(json.dumps(row))
