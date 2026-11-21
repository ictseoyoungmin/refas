import bpy, bmesh, hashlib, json, argparse, sys
from pathlib import Path
parser=argparse.ArgumentParser(description='Reopen three mug revisions and compare native geometry, materials, and restored artifact bytes.')
parser.add_argument('--root',required=True,type=Path)
parser.add_argument('--revisions',required=True,nargs=3)
parser.add_argument('--output',required=True,type=Path)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
base=args.root.resolve()
ids=args.revisions

def digest(v): return hashlib.sha256(json.dumps(v,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def material(m):
    nodes=[]
    for node in m.node_tree.nodes:
        inputs=[]
        for s in node.inputs:
            if hasattr(s,'default_value'):
                val=s.default_value
                try: val=list(val)
                except TypeError: pass
                inputs.append([s.name,val])
        nodes.append([node.name,node.bl_idname,inputs])
    return {'name':m.name,'use_nodes':m.use_nodes,'nodes':nodes,'links':sorted([[l.from_node.name,l.from_socket.name,l.to_node.name,l.to_socket.name] for l in m.node_tree.links])}
def geometry(o):
    return {'object':o.name,'data':o.data.name,'matrix':[list(r) for r in o.matrix_world],'part_id':o.get('part_id'),'vertices':[list(v.co) for v in o.data.vertices],'edges':[list(e.vertices) for e in o.data.edges],'faces':[[list(p.vertices),p.material_index,p.use_smooth] for p in o.data.polygons],'uv_layers':[[uv.name,[list(d.uv) for d in uv.data]] for uv in o.data.uv_layers],'modifiers':[[m.name,m.type] for m in o.modifiers],'material_slots':[m.name for m in o.data.materials]}
def measure(o):
    bm=bmesh.new(); bm.from_mesh(o.data)
    result={'vertices':len(o.data.vertices),'edges':len(o.data.edges),'faces':len(o.data.polygons),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'volume_signed':bm.calc_volume(signed=True)}
    bm.free(); return result

rows=[]
for rev in ids:
    path=base/'.refas2/revisions'/rev/'artifacts/scene.blend'
    bpy.ops.wm.open_mainfile(filepath=str(path))
    body=bpy.data.objects['MugBody']; handle=bpy.data.objects['MugHandle']
    assert body.type==handle.type=='MESH'
    segments=handle['segments']; radial=handle['radial_segments']; z=handle['center_z']
    section=[handle.data.vertices[(segments//2)*radial+i].co.x for i in range(radial)]
    crossings=[]
    for edge in body.data.edges:
        a,b=[body.data.vertices[i].co for i in edge.vertices]
        if abs(a.y)<1e-7 and abs(b.y)<1e-7 and a.x>0 and b.x>0 and (a.z-z)*(b.z-z)<0:
            crossings.append(a.x+(b.x-a.x)*(z-a.z)/(b.z-a.z))
    body_x=max(crossings)
    rows.append({'revision':rev,'body_geometry':digest(geometry(body)),'body_material':digest([material(m) for m in body.data.materials]),'handle_geometry':digest(geometry(handle)),'body_checks':measure(body),'handle_checks':measure(handle),'opening_midheight_actual_mesh':min(section)-body_x,'handle_parameters':{k:handle[k] for k in ['span','tube_radius','halfheight']}})
checks={'body_geometry_identical_all':len({r['body_geometry'] for r in rows})==1,'body_material_identical_all':len({r['body_material'] for r in rows})==1,'handle_changed_in_edit':rows[0]['handle_geometry']!=rows[1]['handle_geometry'],'handle_restored':rows[0]['handle_geometry']==rows[2]['handle_geometry'],'opening_enlarged':rows[1]['opening_midheight_actual_mesh']>rows[0]['opening_midheight_actual_mesh']}
restore_files={}
for filename in ['scene.blend','asset.glb','scene.json','result.json','view-hero.png','view-side.png']:
    paths=[base/'.refas2/revisions'/rev/'artifacts'/filename for rev in [ids[0],ids[2]]]
    restore_files[filename]=hashlib.sha256(paths[0].read_bytes()).hexdigest()==hashlib.sha256(paths[1].read_bytes()).hexdigest()
checks['restore_artifacts_byte_identical']=all(restore_files.values())
checks['closed_manifold_components']=all(r[k]['nonmanifold_edges']==0 for r in rows for k in ['body_checks','handle_checks'])
checks['positive_component_volumes']=all(r[k]['volume_signed']>0 for r in rows for k in ['body_checks','handle_checks'])
result={'checks':checks,'snapshots':rows,'restore_files':restore_files}
args.output.write_text(json.dumps(result,indent=2))
print('INDEPENDENT_NATIVE_CHECKS',json.dumps(result))
assert all(checks.values()), checks
