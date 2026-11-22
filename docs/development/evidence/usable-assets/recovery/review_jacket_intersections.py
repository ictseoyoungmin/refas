"""Independent read-only location/shape/weight diagnosis of actual intersections."""
import bpy, json, sys, math, hashlib
from pathlib import Path
from collections import Counter
from mathutils import Vector
from mathutils.bvhtree import BVHTree

args = sys.argv[sys.argv.index('--') + 1:]
destination = Path(args[0])
scene = bpy.context.scene
garments = [bpy.data.objects[n] for n in ('Body | continuous open front and shoulder yoke', 'Collar | standing back and neck facing')]
target = bpy.data.objects['Outfit:dress-shirt']

def evaluated(obj):
    ev = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh(); me.calc_loop_triangles()
    verts = [ev.matrix_world @ v.co for v in me.vertices]
    tris = [tuple(t.vertices) for t in me.loop_triangles]
    weights = [{obj.vertex_groups[g.group].name:g.weight for g in v.groups} for v in me.vertices]
    ev.to_mesh_clear()
    return verts, tris, weights

def bounds(points):
    return [[min(v[a] for v in points) for a in range(3)], [max(v[a] for v in points) for a in range(3)]]

def triangle_record(index, verts, triangles, weights):
    ids = triangles[index]; v = [verts[i] for i in ids]
    return {'index':index, 'vertices':list(ids), 'points':[list(p) for p in v],
        'centroid':list(sum(v,Vector())/3), 'edgeLengthsM':[(v[i]-v[(i+1)%3]).length for i in range(3)],
        'areaM2':(v[1]-v[0]).cross(v[2]-v[0]).length*.5,
        'weights':[weights[i] for i in ids]}

report = {'nativeSha256':hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest(),
    'scope':'Actual evaluated jacket/shirt triangle intersections, representative geometry and weights. No native mutation or private appearance export.', 'frames':[]}
for frame in (1,49):
    scene.frame_set(frame); bpy.context.view_layer.update()
    tv,tf,tw = evaluated(target); target_tree = BVHTree.FromPolygons(tv,tf,all_triangles=True)
    row = {'frame':frame, 'shirtBounds':bounds(tv),'garments':[]}
    for obj in garments:
        v,f,w=evaluated(obj); tree=BVHTree.FromPolygons(v,f,all_triangles=True)
        pairs=tree.overlap(target_tree); counts=Counter(a for a,b in pairs)
        top=counts.most_common(12)
        centroids=[sum((v[i] for i in f[a]),Vector())/3 for a in counts]
        buckets=Counter()
        for c in centroids:
            location=('hem' if c.z<1.12 else 'lowerTorso' if c.z<1.25 else 'upperTorso' if c.z<1.38 else 'shoulder')
            side='right' if c.x<-.08 else 'left' if c.x>.08 else 'center'
            depth='front' if c.y<0 else 'back'
            buckets[(location,side,depth)]+=1
        details=[]
        for a,count in top:
            d=triangle_record(a,v,f,w);d['intersectionPairs']=count
            bs=[b for aa,b in pairs if aa==a]
            d['shirtTriangles']=[triangle_record(b,tv,tf,tw) for b in bs[:3]]
            d['intersectedShirtBounds']=bounds([tv[i] for b in bs for i in tf[b]])
            details.append(d)
        all_lengths=[max((v[t[i]]-v[t[(i+1)%3]]).length for i in range(3)) for t in f]
        row['garments'].append({'name':obj.name,'bounds':bounds(v),'pairs':len(pairs),
            'intersectingGarmentTriangles':len(counts),'intersectingShirtTriangles':len(set(b for a,b in pairs)),
            'affectedCentroidBounds':bounds(centroids) if centroids else None,
            'affectedRegions':[{'region':list(k),'triangles':n} for k,n in buckets.most_common()],
            'maximumEdgeM':max(all_lengths),'longEdgesOver5cm':sum(x>.05 for x in all_lengths),
            'topIntersectionTriangles':details})
    report['frames'].append(row)
destination.parent.mkdir(parents=True,exist_ok=True)
destination.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'output':str(destination),'summary':[{'frame':r['frame'],'garments':[{k:g[k] for k in ('name','pairs','intersectingGarmentTriangles','affectedCentroidBounds','affectedRegions','maximumEdgeM','longEdgesOver5cm')} for g in r['garments']]} for r in report['frames']]},indent=2))
