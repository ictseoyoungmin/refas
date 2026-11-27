"""Reproduce the observed Blender ray predicate scale limitation on exact faces."""
import json
from pathlib import Path
from mathutils import Vector
from mathutils.geometry import intersect_ray_tri
p=Path('/workspace/scratch/61afcdd4e3c6/work/garment/export-review/frozen-cloth-review/contact-diagnosis.json')
data=json.loads(p.read_text())
rows=[]
for item in data:
 row={'name':item['name'],'triangleIds':item['faces'],'observations':[]}
 for scale,normalise in [(1,False),(1,True),(1000,False),(1000,True)]:
  origin=Vector(item['a'][0]); a=[(Vector(v)-origin)*scale for v in item['a']];b=[(Vector(v)-origin)*scale for v in item['b']]
  hits=[]
  for side,(one,two) in enumerate([(a,b),(b,a)]):
   for edge in range(3):
    start,end=one[edge],one[(edge+1)%3];delta=end-start
    ray=delta.normalized() if normalise else delta
    hit=intersect_ray_tri(*two,ray,start,True)
    if hit is not None:
     t=(hit-start).dot(delta)/delta.length_squared
     if 0<=t<=1:hits.append({'side':side,'edge':edge,'segmentT':t,'pointM':list(hit/scale+origin)})
  row['observations'].append({'coordinateScale':scale,'unitRayDirection':normalise,'segmentHits':hits})
 rows.append(row)
out=p.with_name('ray-scale-diagnosis.json');out.write_text(json.dumps(rows,indent=2)+'\n')
print(json.dumps([{'name':r['name'],'cases':[{k:v for k,v in o.items() if k!='segmentHits'}|{'hitCount':len(o['segmentHits'])} for o in r['observations']]} for r in rows]))
