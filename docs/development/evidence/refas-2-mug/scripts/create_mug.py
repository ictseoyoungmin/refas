import bpy, math, hashlib, json
from pathlib import Path
from mathutils import Vector

# A brief-designed usability fixture. No photograph resemblance is claimed.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
mat=bpy.data.materials.new('Ceramic_SoftIvory')
mat.use_nodes=True
bsdf=mat.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Base Color'].default_value=(0.83,0.72,0.56,1)
bsdf.inputs['Roughness'].default_value=0.24
bsdf.inputs['Metallic'].default_value=0.0
bsdf.inputs['Coat Weight'].default_value=0.20
bsdf.inputs['Coat Roughness'].default_value=0.16

profile=[(.88,.06),(.94,.07),(.98,.11),(1.0,.18),(1.0,.32),(1.015,.65),(1.025,1.0),(1.03,1.4),(1.04,1.8),(1.05,2.2),(1.05,2.34),(1.045,2.40),(1.025,2.44),(.995,2.46),(.955,2.46),(.92,2.44),(.895,2.40),(.89,2.34),(.89,2.2),(.88,1.8),(.87,1.4),(.865,1.0),(.855,.65),(.84,.35),(.82,.29),(.78,.25),(.70,.23),(.35,.23)]
n=128
verts=[(r*math.cos(2*math.pi*i/n),r*math.sin(2*math.pi*i/n),z) for r,z in profile for i in range(n)]
faces=[]
for j in range(len(profile)-1):
    for i in range(n):
        k=j*n+i; kn=j*n+(i+1)%n
        faces.append((k,kn,kn+n,k+n))
verts.extend([(0,0,profile[0][1]),(0,0,profile[-1][1])])
for i in range(n):
    faces.append((len(verts)-2,(i+1)%n,i))
    end=(len(profile)-1)*n
    faces.append((end+i,end+(i+1)%n,len(verts)-1))
mesh=bpy.data.meshes.new('MugBody_ClosedLathe')
mesh.from_pydata(verts,[],faces); mesh.update()
body=bpy.data.objects.new('MugBody',mesh); bpy.context.collection.objects.link(body)
body.data.materials.append(mat)
body['part_id']='mug-body-stable'
body['design_note']='Closed ceramic shell, solid bottom, hollow cup; no UV or engine acceptance claim.'
for p in mesh.polygons: p.use_smooth=True

segments=96; radial=24
span=1.02; h=.74; tube=.17; attach=.98; zc=1.30
hv=[]; hf=[]
for j in range(segments+1):
    t=-math.pi/2+math.pi*j/segments
    tx=-span*math.sin(t); tz=h*math.cos(t); norm=math.hypot(tx,tz)
    nx=tz/norm; nz=-tx/norm
    for i in range(radial):
        p=2*math.pi*i/radial
        hv.append((attach+span*math.cos(t)+tube*math.cos(p)*nx,tube*math.sin(p),zc+h*math.sin(t)+tube*math.cos(p)*nz))
for j in range(segments):
    for i in range(radial):
        a=j*radial+i; b=j*radial+(i+1)%radial
        hf.append((a,a+radial,b+radial,b))
hv.extend([(attach,0,zc-h),(attach,0,zc+h)])
for i in range(radial):
    hf.append((len(hv)-2,i,(i+1)%radial))
    a=segments*radial+i; b=segments*radial+(i+1)%radial
    hf.append((len(hv)-1,b,a))
hmesh=bpy.data.meshes.new('Handle_SweptRoundSection')
# Correct outward winding on the authored handle fixture.
hf=[tuple(reversed(face)) for face in hf]
hmesh.from_pydata(hv,[],hf); hmesh.update()
handle=bpy.data.objects.new('MugHandle',hmesh); bpy.context.collection.objects.link(handle)
handle.data.materials.append(mat)
for p in hmesh.polygons: p.use_smooth=True
handle['part_id']='mug-handle-stable'
handle['span']=span; handle['halfheight']=h; handle['tube_radius']=tube
handle['segments']=segments; handle['radial_segments']=radial
handle['attach_x']=attach; handle['center_z']=zc
handle['opening_width_at_midheight']=attach+span-tube-1.03
handle['opening_height_centerline_approx']=2*(h-tube)
handle['connection_note']='Separate editable mesh intersects body at both ends; not boolean-fused.'
bpy.context.scene['asset_brief']='Simple ivory ceramic mug with rounded attached handle; usability fixture.'
bpy.context.view_layer.objects.active=body
body.select_set(True)
print('ACCEPTANCE_BUILD',json.dumps({'body_vertices':len(mesh.vertices),'handle_vertices':len(hmesh.vertices),'opening_width':handle['opening_width_at_midheight']}))
