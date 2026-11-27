import bpy, json, sys
import numpy as np
from pathlib import Path
from mathutils.geometry import intersect_ray_tri
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from check_lining_gap import triangle_intersection
path=Path('/workspace/scratch/61afcdd4e3c6/work/garment/geometry-repair/paired-low-29/optimized-cloth.blend')
bpy.ops.wm.open_mainfile(filepath=str(path))
rows=[]
for name,ids in [('Collar | standing back and neck facing',[15033,15037]),('Body | continuous open front and shoulder yoke',[4481,22202])]:
 obj=bpy.data.objects[name];ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();me.calc_loop_triangles()
 faces=[tuple(t.vertices) for t in me.loop_triangles]
 vertices=np.array([ev.matrix_world@v.co for v in me.vertices],dtype=np.float64)
 a,b=[vertices[list(faces[i])] for i in ids]
 rays=[]
 for flip,(one,two) in enumerate([(a,b),(b,a)]):
  for k in range(3):
   start,end=Vector(one[k]),Vector(one[(k+1)%3]);d=end-start
   hit=intersect_ray_tri(*(Vector(p) for p in two),d,start,True)
   if hit is not None:rays.append({'flip':flip,'edge':k,'t':float((hit-start).dot(d)/d.length_squared),'point':list(hit)})
 normal=np.cross(a[1]-a[0],a[2]-a[0]);normal/=np.linalg.norm(normal)
 rows.append({'name':name,'faces':ids,'vertexIds':[faces[i] for i in ids],'a':a.tolist(),'b':b.tolist(),'sat':triangle_intersection(a,b),'rays':rays,'bDistanceToAPlane':((b-a[0])@normal).tolist(),'nativeFacesMatchArrayMethod':np.array_equal(np.array([t.vertices for t in me.loop_triangles]),np.array(faces))})
 ev.to_mesh_clear()
out=Path('/workspace/scratch/61afcdd4e3c6/work/garment/export-review/frozen-cloth-review/contact-diagnosis.json')
out.write_text(json.dumps(rows,indent=2)+'\n')
print(json.dumps(rows))
