"""Independent native/GLB inspection for the folded-collar example.

Run inside factory-startup Blender with -- NATIVE GLB OUTPUT_JSON IMPORTED_BLEND.
The comparison does not claim identical shaders, UV suitability or simulation.
"""
import bpy
import bmesh
import collections
import json
from pathlib import Path
import sys
from mathutils import Vector


def mesh_info(ob):
    deps = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(deps); me = ev.to_mesh()
    points = [ob.matrix_world @ v.co for v in me.vertices]
    bounds = [[min(p[i] for p in points) for i in range(3)],
              [max(p[i] for p in points) for i in range(3)]]
    me.calc_loop_triangles()
    info = {'bounds': bounds, 'triangles': len(me.loop_triangles)}
    ev.to_mesh_clear()
    return info


def objects():
    bpy.context.view_layer.update()
    return {o.name: {'parent': o.parent.name if o.parent else None,
                     'matrix': [list(r) for r in o.matrix_world],
                     **mesh_info(o)}
            for o in bpy.context.scene.objects if o.type == 'MESH'}


def topology(ob, evaluated):
    if evaluated:
        ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
    else:
        me = ob.data
    counts = collections.Counter(tuple(sorted((a,b))) for p in me.polygons
                                for a,b in zip(list(p.vertices),list(p.vertices)[1:]+list(p.vertices)[:1]))
    boundary = [e for e,n in counts.items() if n == 1]
    adjacency = collections.defaultdict(set)
    for a,b in boundary:
        adjacency[a].add(b); adjacency[b].add(a)
    components = 0; seen=set()
    for a in adjacency:
        if a in seen:
            continue
        components += 1; todo=[a]
        while todo:
            v=todo.pop()
            if v in seen:
                continue
            seen.add(v); todo.extend(adjacency[v]-seen)
    result={'vertices':len(me.vertices),'faces':len(me.polygons),
            'boundary_edges':len(boundary),'boundary_components':components,
            'boundary_components_are_loops':all(len(v)==2 for v in adjacency.values()),
            'edges_more_than_two_faces':sum(n>2 for n in counts.values()),
            'zero_area_faces':sum(p.area<1e-12 for p in me.polygons)}
    if evaluated:
        ev.to_mesh_clear()
    return result


native,glb,out,imported=map(Path,sys.argv[sys.argv.index('--')+1:])
bpy.ops.wm.open_mainfile(filepath=str(native))
expected=objects()
body=bpy.data.objects['Body | continuous open front and shoulder yoke']
geometries={}
for ob in [body]+[o for o in bpy.context.scene.objects
                        if o.name in ['Collar | standing back and neck facing',
                                      'L Lapel | folded lower notched facing',
                                      'R Lapel | folded lower notched facing']]:
    geometries[ob.name]={'cage':topology(ob,False),'evaluated':topology(ob,True)}
    result=geometries[ob.name]['evaluated']
    assert result['boundary_edges']==0 and result['edges_more_than_two_faces']==0
    assert result['zero_area_faces']==0,(ob.name,result)
assert geometries[body.name]['cage']['boundary_components']==3
assert geometries[body.name]['cage']['boundary_components_are_loops']

# The final shell retains both original shared seam groups.
edges=collections.Counter(tuple(sorted((a,b))) for p in body.data.polygons
                          for a,b in zip(list(p.vertices),list(p.vertices)[1:]+list(p.vertices)[:1]))
seams=[]
for name in ['L Armhole | shared 40-edge seam','R Armhole | shared 40-edge seam']:
    group=body.vertex_groups[name]
    members={v.index for v in body.data.vertices if any(g.group==group.index for g in v.groups)}
    selected=[(e,n) for e,n in edges.items() if set(e)<=members]
    seams.append({'name':name,'edges':len(selected),'all_edges_two_faces':all(n==2 for e,n in selected)})
    assert len(selected)==40 and all(n==2 for e,n in selected)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(glb))
actual=objects()
assert set(expected)==set(actual),(set(expected)-set(actual),set(actual)-set(expected))
matrix_error=max(abs(expected[n]['matrix'][i][j]-actual[n]['matrix'][i][j])
                 for n in expected for i in range(4) for j in range(4))
bounds_error=max(abs(expected[n]['bounds'][i][j]-actual[n]['bounds'][i][j])
                 for n in expected for i in range(2) for j in range(3))
parents_match=all(expected[n]['parent']==actual[n]['parent'] for n in expected)
assert matrix_error < 1e-5 and bounds_error < 1e-5 and parents_match
bpy.ops.wm.save_as_mainfile(filepath=str(imported))
report={'passed':True,'native':str(native),'glb':str(glb),'mesh_objects':len(expected),
        'names_match':True,'parents_match':parents_match,'maximum_matrix_error':matrix_error,
        'maximum_bounds_error_m':bounds_error,'native_triangles':sum(x['triangles'] for x in expected.values()),
        'imported_glb_triangles':sum(x['triangles'] for x in actual.values()),
        'topology':geometries,'shared_armhole_seams':seams,
        'native_object_states':expected,'imported_object_states':actual,
        'limits':['Topology checks do not establish absence of all self-intersections.',
                  'Three cage boundary loops are the connected front/neck/hem edge and two wrists.',
                  'Closed solidified meshes retain hollow space and rimmed openings; they do not fill the garment.',
                  'GLB material conversion is not a proof of baked procedural cloth equivalence.',
                  'No rigging, cloth simulation, new UV layout or engine test is claimed.']}
out.write_text(json.dumps(report,indent=2)+'\n')
print('INDEPENDENT_CHECK',json.dumps({k:v for k,v in report.items() if k not in ['native_object_states','imported_object_states']}))
