"""Locate the new transferred-lining collar's index-topology regression."""
import json
import sys
from pathlib import Path
import bpy

repo=Path(__file__).resolve().parents[5]
sys.path.insert(0,str(repo/'skills/refas/scripts/production'))
from mesh_audit import audit_mesh

path=Path('/workspace/scratch/61afcdd4e3c6/work/garment/root-transferred-lining-bounded-08/optimized-cloth.blend')
bpy.ops.wm.read_factory_settings(use_empty=True)
with bpy.data.libraries.load(str(path),link=False) as (source,target):
    target.objects=[n for n in source.objects if n.startswith('Optimized Collar')]
obj=target.objects[0]
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()
audit=audit_mesh(obj,meters_per_unit=1,max_details=64)
me=obj.data
half=len(me.vertices)//2
rows=[]
for edge in audit['nonManifoldEdges']['items']:
    faces=[]
    for i in edge['incidentFaces']:
        poly=me.polygons[i]
        ids=list(poly.vertices)
        faces.append({'polygon':i,'vertices':ids,'material':poly.material_index,
                      'side':'outer' if max(ids)<half else 'inner' if min(ids)>=half else 'rim',
                      'repeatedVertices':len(set(ids))!=len(ids)})
    rows.append({'edge':edge,'incidentPolygonDetails':faces})
result={'statistics':audit['statistics'],'nonManifoldEdges':rows,
        'nonManifoldVertices':audit['nonManifoldVertices'],'looseVertices':audit['looseVertices']}
Path(sys.argv[sys.argv.index('--')+1]).write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'statistics':result['statistics'],'firstEdges':rows[:3]}))
