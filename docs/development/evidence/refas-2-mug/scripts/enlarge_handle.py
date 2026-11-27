import bpy, math, json, hashlib

def body_signature():
    o=bpy.data.objects['MugBody']
    material=o.data.materials[0]
    data={'name':o.name,'mesh_name':o.data.name,'part_id':o['part_id'],'matrix':[list(v) for v in o.matrix_world], 'vertices':[list(v.co) for v in o.data.vertices], 'faces':[list(p.vertices) for p in o.data.polygons], 'smooth':[p.use_smooth for p in o.data.polygons], 'material_name':material.name,'nodes':[]}
    for node in material.node_tree.nodes:
        inputs=[]
        for sock in node.inputs:
            if hasattr(sock,'default_value'):
                v=sock.default_value
                try: v=list(v)
                except TypeError: pass
                inputs.append([sock.name,v])
        data['nodes'].append([node.name,node.type,inputs])
    return hashlib.sha256(json.dumps(data,sort_keys=True).encode()).hexdigest()

before=body_signature()
o=bpy.data.objects['MugHandle']
segments=o['segments']; radial=o['radial_segments']
span=1.18; h=o['halfheight']; tube=.125; attach=o['attach_x']; zc=o['center_z']
for j in range(segments+1):
    t=-math.pi/2+math.pi*j/segments
    tx=-span*math.sin(t); tz=h*math.cos(t); norm=math.hypot(tx,tz)
    nx=tz/norm; nz=-tx/norm
    for i in range(radial):
        p=2*math.pi*i/radial
        o.data.vertices[j*radial+i].co=(attach+span*math.cos(t)+tube*math.cos(p)*nx,tube*math.sin(p),zc+h*math.sin(t)+tube*math.cos(p)*nz)
o.data.update()
o['span']=span; o['tube_radius']=tube
o['opening_width_at_midheight']=attach+span-tube-1.03
o['opening_height_centerline_approx']=2*(h-tube)
after=body_signature()
assert before==after, 'Mug body changed during handle-only edit'
print('ACCEPTANCE_EDIT',json.dumps({'body_before':before,'body_after':after,'body_preserved':before==after,'opening_width':o['opening_width_at_midheight'],'opening_height':o['opening_height_centerline_approx']}))
