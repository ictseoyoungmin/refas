import bpy,json
from pathlib import Path
from mathutils import Vector
cover=bpy.data.objects['SERVICE_COVER']
protected=set(bpy.data.objects)-{cover}-set(cover.children_recursive)
before={o.name:[list(r) for r in o.matrix_world] for o in protected}
cover.location+=Vector((0,.003,0))
bpy.context.view_layer.update()
changed=[o.name for o in protected if before[o.name]!=[list(r) for r in o.matrix_world]]
assert not changed, changed
Path(REFAS_OUTPUT_DIR,'local-edit.json').write_text(json.dumps({'protectedObjects':len(protected),'unexpectedChanges':changed,'coverOffsetM':.003},indent=2))
