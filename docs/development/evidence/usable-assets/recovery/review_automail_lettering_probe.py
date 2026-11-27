"""Read-only geometry of the source Lambda glyph's flagged cap adjacency."""
import hashlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

repo = Path(__file__).resolve().parents[5]
sys.path.insert(0, str(repo/'skills/refas/scripts/production'))
from mesh_audit import audit_mesh

obj = bpy.data.objects['Crown_A_mark']
report = audit_mesh(obj, meters_per_unit=1, max_details=1000)
ev = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
me = ev.to_mesh()
points = [ev.matrix_world @ v.co for v in me.vertices]
rows = []
for observation in report['inconsistentWindingEdges']['items']:
    a, b = [points[i] for i in observation['vertices']]
    face_rows = []
    for index in observation['incidentFaces']:
        polygon = me.polygons[index]
        verts = [points[i] for i in polygon.vertices]
        cross = (verts[1]-verts[0]).cross(verts[2]-verts[0])
        third = next(points[i] for i in polygon.vertices if i not in observation['vertices'])
        face_rows.append({'polygon': index, 'vertices': list(polygon.vertices),
                          'worldPointsM': [list(p) for p in verts],
                          'triangleAreaM2': cross.length/2,
                          'worldNormal': list(cross.normalized()),
                          'thirdVertexSideInXZ': (b-a).cross(third-a).y})
    rows.append({'edge': observation['edge'], 'edgeLengthM': (b-a).length,
                 'faces': face_rows,
                 'normalDot': Vector(face_rows[0]['worldNormal']).dot(Vector(face_rows[1]['worldNormal'])),
                 'thirdVerticesOnSameSideOfSharedEdge': face_rows[0]['thirdVertexSideInXZ']*face_rows[1]['thirdVertexSideInXZ'] > 0})
ev.to_mesh_clear()
result = {'nativeSha256': hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest(),
          'object': obj.name, 'statistics': report['statistics'], 'flaggedCapAdjacencies': rows}
Path(sys.argv[sys.argv.index('--')+1]).write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(result))
