"""Read-only check for unused vertices in candidate 08's surface reference."""
import hashlib
import json
import sys
from pathlib import Path

import bpy

root = Path('/workspace/scratch/61afcdd4e3c6/work/garment/candidate-08')
rows = []
for filename in ('fitted-detailed.blend', 'wearable-precheck.blend'):
    path = root/filename
    bpy.ops.wm.open_mainfile(filepath=str(path))
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    for name in ('Body | continuous open front and shoulder yoke', 'Collar | standing back and neck facing'):
        obj = bpy.data.objects[name]
        ev = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        me = ev.to_mesh()
        me.calc_loop_triangles()
        used_faces = set(v for p in me.polygons for v in p.vertices)
        used_triangles = set(v for t in me.loop_triangles for v in t.vertices)
        unused = [v for v in me.vertices if v.index not in used_triangles]
        rows.append({'file': filename, 'fileSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                     'object': name, 'vertices': len(me.vertices),
                     'polygonReferencedVertices': len(used_faces),
                     'triangleReferencedVertices': len(used_triangles),
                     'unreferencedVertices': len(unused),
                     'firstUnreferencedWorldPointsM': [list(ev.matrix_world@v.co) for v in unused[:5]]})
        ev.to_mesh_clear()
Path(sys.argv[sys.argv.index('--')+1]).write_text(json.dumps(rows, indent=2)+'\n')
print(json.dumps(rows))
