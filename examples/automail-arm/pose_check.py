"""Run within the production worker. Wrappers set POSE_CONFIG explicitly.

BVH tests are limited to named upper-armor / moving-forearm surfaces and sampled
poses. Expected mechanical overlaps in bearings are excluded; this does not
establish collision clearance over a continuous range or a working linkage.
"""
import bpy,json,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

cfg=globals().get('POSE_CONFIG',{'elbow_deg':0,'wrist_deg':0,'index_deg':[0,0,0]})
def mat(m):return [[float(v) for v in row] for row in m]
before={o.name:mat(o.matrix_world) for o in bpy.context.scene.objects if o.get('aurix_asset')}
for name,deg in [('ELBOW_PIVOT',cfg['elbow_deg']),('WRIST_PIVOT',cfg.get('wrist_deg',0))]+[('INDEX_J%d'%i,d) for i,d in enumerate(cfg.get('index_deg',[0,0,0]))]:
    o=bpy.data.objects[name];o.rotation_mode='XYZ';o.rotation_euler=(math.radians(deg),0,0)
bpy.context.view_layer.update()
after={o.name:mat(o.matrix_world) for o in bpy.context.scene.objects if o.get('aurix_asset')}
elbow=bpy.data.objects['ELBOW_PIVOT'];moving={elbow.name}|{o.name for o in elbow.children_recursive}
upper=[n for n in before if n not in moving]
upper_changed=[n for n in upper if before[n]!=after[n]]

def bvh(o):
    ev=o.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();me.calc_loop_triangles()
    verts=[ev.matrix_world@v.co for v in me.vertices];faces=[tuple(t.vertices) for t in me.loop_triangles]
    tree=BVHTree.FromPolygons(verts,faces,all_triangles=True,epsilon=0)
    ev.to_mesh_clear();return tree

upper_names=[n for n in before if n.startswith(('Upper_sculpted_blade_','Upper_outer_wrap_','Upper_lower_side_pad_'))]
fore_names=[n for n in before if n.startswith(('Forearm_swept_front_armor_','Forearm_lateral_blade_','Forearm_structural_spine'))]
trees={n:bvh(bpy.data.objects[n]) for n in upper_names+fore_names}
overlaps=[]
for a in upper_names:
    for b in fore_names:
        hit=trees[a].overlap(trees[b])
        if hit:overlaps.append({'upper':a,'forearm':b,'overlapping_triangle_pairs':len(hit)})

digit_origins={n:list(bpy.data.objects[n].matrix_world.translation) for n in ['WRIST_PIVOT','INDEX_J0','INDEX_J1','INDEX_J2']}
report={'pose':cfg,'upper_objects_checked':len(upper),'unexpected_upper_changes':upper_changed,
        'named_shell_intersections':overlaps,'shell_pairs_tested':len(upper_names)*len(fore_names),
        'digit_world_origins':digit_origins,
        'parent_relations':{n:bpy.data.objects[n].parent.name for n in ['SHOULDER_PIVOT','ELBOW_PIVOT','WRIST_PIVOT','SERVICE_COVER']+['INDEX_J%d'%i for i in range(3)]},
        'static_spanning_links':'No authored cable or hydraulic mesh crosses the elbow; all such parts are local to upper or forearm. There is no dynamic tendon or telescoping linkage simulation.',
        'limits':'Named-shell triangle-surface BVH checks and inspected renders at sampled poses only; no all-object collision test, containment test, continuous collision clearance, load or physical-performance validation.'}
Path(REFAS_OUTPUT_DIR,'pose-check.json').write_text(json.dumps(report,indent=2))
assert not upper_changed,'Elbow/wrist/finger pose altered upper assembly'
