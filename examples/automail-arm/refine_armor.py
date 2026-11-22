"""Refine an imported AURIX prototype with compound shell sections.

The existing pivot, actuator, digit and service-cover structures are retained.
World-space profiles replace specific native meshes; their object transforms
and parents remain intact. Hidden section depths are design interpretations.
"""
import bpy
import bmesh
import json
import math
from pathlib import Path
from mathutils import Vector

scene = bpy.context.scene
changed = set()
added = set()
ivory = bpy.data.materials['Ivory • ceramic titanium armor']
graphite = bpy.data.materials['Graphite structural composite']
rubber = bpy.data.materials['Palm and joint elastomer']
black = bpy.data.materials['Recess interiors']
gold = bpy.data.materials['Anodized champagne gold']
edge = bpy.data.materials['Warm silver • machined bevels']
palmbase = graphite.copy()
palmbase.name = 'Palm structural matte composite'
palmbase.node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value = .08
palmbase.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .52


def resample(rows, steps=4):
    """Interpolate all section coordinates together, with endpoint support."""
    out = []
    for i in range(len(rows)-1):
        a, b = rows[max(0, i-1)], rows[i]
        c, d = rows[i+1], rows[min(len(rows)-1, i+2)]
        for k in range(steps):
            t = k/steps
            out.append(tuple(.5*((2*v1)+(-v0+v2)*t+
                (2*v0-5*v1+4*v2-v3)*t*t+
                (-v0+3*v1-3*v2+v3)*t*t*t)
                for v0,v1,v2,v3 in zip(a,b,c,d)))
    return out + [rows[-1]]


def mesh(name, verts, faces, material=None, parent=None, thickness=0,
         bevel=.0007, smooth=True, closed=False):
    ob = bpy.data.objects.get(name)
    if ob is None:
        ob = bpy.data.objects.new(name, None)
        scene.collection.objects.link(ob)
        ob['aurix_asset'] = True
        ob.parent = bpy.data.objects[parent]
        ob.matrix_parent_inverse = ob.parent.matrix_world.inverted()
        added.add(name)
    else:
        changed.add(name)
    inv = ob.matrix_world.inverted()
    data = bpy.data.meshes.new(name+'_compound_section')
    data.from_pydata([inv@Vector(v) for v in verts], [], faces)
    data.update()
    if closed:
        bm=bmesh.new();bm.from_mesh(data)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(data);bm.free()
    old = ob.data
    mat = material or (old.materials[0] if old and old.materials else ivory)
    ob.data = data
    data.materials.append(mat)
    ob.modifiers.clear()
    for poly in data.polygons:
        poly.use_smooth = smooth
    if thickness:
        mod = ob.modifiers.new('Measured shell thickness', 'SOLIDIFY')
        mod.thickness = thickness
        mod.offset = 0
        mod.use_even_offset = True
    if bevel:
        mod = ob.modifiers.new('Machined perimeter roll', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        mod.limit_method = 'ANGLE'
        mod.angle_limit = math.radians(24)
    if old and old.users == 0:
        bpy.data.meshes.remove(old)
    return ob


def plate(name, rows, material=None, parent=None, thickness=.0032,
          rear=False, n=16, bevel=.0009):
    """Rows: z, left, right, left-depth, right-depth, section bulge.

    The asymmetric endpoints and convex transverse section jointly determine
    mass. Bulge is independent of width, unlike a scaled flat polygon.
    """
    verts = []
    samples = resample(rows)
    for z,left,right,yl,yr,bulge in samples:
        for k in range(n+1):
            t = k/n
            verts.append((left+(right-left)*t,
                          yl*(1-t)+yr*t+bulge*math.sin(math.pi*t), z))
    faces = []
    for j in range(len(samples)-1):
        for k in range(n):
            a=j*(n+1)+k
            f=(a,a+n+1,a+n+2,a+1)
            faces.append(f[::-1] if rear else f)
    return mesh(name, verts, faces, material, parent, thickness, bevel)


def tube(name, points, radius, material=None, parent=None):
    points = [Vector(p) for p in resample(points)]
    verts=[]; n=8
    for i,p in enumerate(points):
        tangent=(points[min(i+1,len(points)-1)]-points[max(0,i-1)]).normalized()
        u=tangent.cross(Vector((0,1,0)))
        if u.length<.01:
            u=tangent.cross(Vector((1,0,0)))
        u.normalize(); v=tangent.cross(u)
        for k in range(n):
            a=math.tau*k/n
            verts.append(tuple(p+radius*(math.cos(a)*u+math.sin(a)*v)))
    faces=[tuple(reversed(range(n))),tuple(range((len(points)-1)*n,len(points)*n))]
    for j in range(len(points)-1):
        for k in range(n):
            a=j*n+k;b=j*n+(k+1)%n
            faces.append((a,b,b+n,a+n))
    return mesh(name,verts,faces,material,parent,bevel=0,closed=True)


def ring_profile(name, side, profile, material=None, angle0=0,
                 angle1=math.tau, n=96):
    """Closed stepped radial cross-section swept around the socket X axis."""
    full=abs(angle1-angle0-math.tau)<1e-6
    count=n if full else n+1
    verts=[]
    for x,r in profile:
        for k in range(count):
            a=angle0+(angle1-angle0)*k/n
            verts.append((side*x,r*math.cos(a),.690+r*math.sin(a)))
    faces=[]
    for j in range(len(profile)):
        jj=(j+1)%len(profile)
        for k in range(n):
            kk=(k+1)%count
            f=(j*count+k,j*count+kk,jj*count+kk,jj*count+k)
            faces.append(f if side>0 else f[::-1])
    if not full:
        faces.extend([tuple(j*count for j in reversed(range(len(profile)))),
                      tuple(j*count+n for j in range(len(profile)))])
    return mesh(name,verts,faces,material,bevel=.00045,closed=True)


# A proper recessed socket: the outer locks, stepped cup, gold bore and
# inner wall occupy different depths instead of one flat concentric disc.
for side,label in [(-1,'L'),(1,'R')]:
    ring_profile('Shoulder_'+label+'_load_ring',side,
                 [(.051,.032),(.069,.032),(.076,.039),(.078,.047),
                  (.073,.055),(.062,.058),(.050,.054)],graphite)
    ring_profile('Shoulder_'+label+'_titanium_flange',side,
                 [(.073,.039),(.080,.040),(.081,.046),(.077,.052),
                  (.072,.051)],graphite)
    ring_profile('Shoulder_'+label+'_narrow_machined_rim',side,
                 [(.079,.041),(.082,.042),(.0825,.044),(.080,.0465),
                  (.0785,.045)],edge)
    ring_profile('Shoulder_'+label+'_gold_neural_bus',side,
                 [(.073,.0345),(.078,.0355),(.079,.037),(.075,.038)],gold)
    ring_profile('Shoulder_'+label+'_inner_dark_bore',side,
                 [(.042,.029),(.071,.029),(.074,.034),(.042,.033)],black)
    ob=bpy.data.objects['Shoulder_'+label+'_recess_back']
    for v in ob.data.vertices:
        w=ob.matrix_world@v.co
        w.x=side*(.040+abs(w.x)-.054)
        v.co=ob.matrix_world.inverted()@w
    ob.data.materials[0]=black
    changed.add(ob.name)
    for k in range(6):
        a=k*math.tau/6+.10
        ring_profile('Shoulder_'+label+'_locking_dog_%02d'%k,side,
                     [(.062,.051),(.073,.051),(.081,.055),(.078,.060),
                      (.069,.062),(.059,.058)],graphite,a,a+.55,12)

# The crown is one curved continuous front shell; existing top/side caps
# remain separate, while the long taper folds around the socket volume.
crown_rows=[
 (.751,-.024,.024,-.007,-.007,-.015),
 (.744,-.040,.040,-.018,-.018,-.023),
 (.728,-.052,.052,-.021,-.021,-.032),
 (.707,-.054,.054,-.017,-.017,-.047),
 (.680,-.047,.047,-.014,-.014,-.046),
 (.653,-.036,.037,-.006,-.008,-.045),
 (.628,-.026,.029,.001,-.003,-.038),
 (.612,-.018,.021,.004,.000,-.029)]
plate('Upper_crown_front',crown_rows,thickness=.004,bevel=.0014)
for name in ['Crown_A_mark','Crown_AURIX']:
    ob=bpy.data.objects[name]
    ob.location.y=-.066 if name=='Crown_A_mark' else -.063
    changed.add(name)
for side in [-1,1]:
    pts=[]
    for z,l,r,yl,yr,bulge in crown_rows[1:-1]:
        t=.16 if side<0 else .84
        pts.append((l+(r-l)*t,yl*(1-t)+yr*t+bulge*math.sin(math.pi*t)-.002,z))
    tube('Crown_inset_border_'+str(side),pts,.0005,graphite)

# Front shells wrap the side section rather than terminating at a flat
# lateral edge. The two sides deliberately have different lip trajectories.
for side in [-1,1]:
    profiles=[
      (.396,.021,.034,-.018,-.004,-.004),
      (.382,.013,.044,-.031,.006,-.011),
      (.366,.004,.048,-.043,.002,-.014),
      (.344,.002,.047,-.047,-.006,-.014),
      (.320,.006,.041,-.046,-.008,-.013),
      (.291,.009,.034,-.042,-.007,-.012),
      (.263,.008,.029,-.036,-.005,-.011),
      (.239,.006,.023,-.030,-.002,-.008),
      (.216,.006,.018,-.024,-.006,-.005)]
    if side<0:
        profiles=[(z-((.003 if z>.32 else 0)), -r, -l,yr,yl,b)
                  for z,l,r,yl,yr,b in profiles]
    else:
        profiles=[(z,l+.002*(z>.30),r+.002*(z>.30),yl,yr,b)
                  for z,l,r,yl,yr,b in profiles]
    plate('Forearm_swept_front_armor_'+str(side),profiles,
          thickness=.0034,bevel=.0011)
    # Shorter independent rear/lateral overlapping shell, with visible rim.
    # Sweep an actual angular surface; an X-only plate cannot express a
    # section that turns through its maximum lateral extent.
    vertices=[];sections=resample([
      (.374,.047,.027,67,121),(.357,.052,.035,90,130),
      (.332,.047,.036,104,133),(.302,.039,.030,106,135),
      (.272,.032,.025,100,132),(.239,.025,.020,88,123)])
    for z,rx,ry,a0,a1 in sections:
        for k in range(17):
            a=math.radians(a0+(a1-a0+(8 if side<0 else 0))*k/16)
            vertices.append((side*rx*math.sin(a),-ry*math.cos(a),z))
    faces=[]
    for j in range(len(sections)-1):
        for k in range(16):
            a=j*17+k;f=(a,a+17,a+18,a+1)
            faces.append(f if side>0 else f[::-1])
    mesh('Forearm_lateral_blade_'+str(side),vertices,faces,
         thickness=.003,bevel=.001)
    trim=[]
    for z,left,right,yl,yr,bulge in profiles[1:-1]:
        t=.16 if side<0 else .84
        trim.append((left+(right-left)*t,
                     yl*(1-t)+yr*t+bulge*math.sin(math.pi*t)-.002,z))
    tube('Forearm_gold_outer_reveal_'+str(side),trim,.00075,gold)

# Three separated metacarpal shells follow a genuinely volumetric palm.
# Joint origins and complete finger meshes are untouched.
verts=[];palm_rows=resample([
 (.169,.021,.009,.009),(.158,.030,.014,.012),
 (.140,.038,.019,.016),(.121,.041,.017,.015),
 (.107,.036,.009,.011)],5)
for z,rx,front,back in palm_rows:
    for k in range(40):
        a=math.tau*k/40
        y=math.sin(a)*(back if math.sin(a)>0 else front)
        verts.append((rx*math.cos(a),y,z))
faces=[tuple(reversed(range(40))),tuple(range((len(palm_rows)-1)*40,len(palm_rows)*40))]
for j in range(len(palm_rows)-1):
    for k in range(40):
        faces.append((j*40+k,j*40+(k+1)%40,(j+1)*40+(k+1)%40,(j+1)*40+k))
mesh('Palm_graphite_body',verts,faces,palmbase,bevel=.0005,closed=True)
plate('Palm_dorsal_main_plate',[
 (.165,-.012,.013,-.010,-.009,-.007),
 (.151,-.016,.019,-.018,-.014,-.009),
 (.133,-.016,.025,-.022,-.015,-.008),
 (.116,-.014,.024,-.017,-.013,-.009),
 (.110,-.011,.021,-.014,-.010,-.004)],thickness=.0025,bevel=.0009)
plate('Palm_edge_plate_-1',[
 (.158,-.023,-.016,-.010,-.014,-.003),
 (.145,-.034,-.019,-.014,-.021,-.006),
 (.128,-.039,-.019,-.012,-.024,-.007),
 (.114,-.035,-.018,-.009,-.019,-.005)],thickness=.0025,bevel=.0008)
plate('Palm_edge_plate_1',[
 (.153,.022,.029,-.014,-.007,-.003),
 (.138,.027,.037,-.017,-.007,-.005),
 (.122,.028,.041,-.017,-.005,-.005),
 (.113,.027,.036,-.013,-.004,-.003)],thickness=.0025,bevel=.0008)
for side in [-1,1]:
    tube('Palm_gold_split_'+str(side),[
       (side*.018,-.019,.154),(side*.020,-.027,.136),
       (side*.021,-.025,.121),(side*.020,-.018,.113)],.0006,gold)
    rows=([
      (.152,-.029,-.020,.014,.015,.003),
      (.140,-.035,-.011,.016,.018,.005),
      (.124,-.033,-.012,.013,.017,.007),
      (.114,-.028,-.019,.011,.015,.003)] if side<0 else [
      (.145,.026,.034,.014,.013,.003),
      (.132,.021,.038,.016,.013,.004),
      (.119,.022,.036,.013,.011,.004),
      (.113,.023,.032,.010,.009,.002)])
    plate('Palm_grip_pad_'+str(side),rows,rubber,
      thickness=.0025,rear=True,bevel=.0009)
plate('Palm_center_grip',[
 (.145,-.006,.014,.018,.017,.0008),
 (.131,-.008,.016,.019,.017,.0008),
 (.120,-.006,.014,.016,.014,.0007),
 (.114,-.004,.011,.013,.012,.0005)],rubber,
 thickness=.0015,rear=True,bevel=.0006)

bpy.context.view_layer.update()
Path(REFAS_OUTPUT_DIR,'surface-refinement.json').write_text(json.dumps({
 'changed_existing_objects':sorted(changed),'added_objects':sorted(added),
 'geometry_method':'Varying longitudinal and asymmetric transverse shell sections; stepped socket cross-sections; closed elliptical palm loft.',
 'explicit_shell_thickness_m':{'crown':.004,'forearm_front':.0034,
                              'forearm_lateral':.003,'palm_plates':.0025},
 'material_changes':'Shoulder recess backs use existing Recess interiors. Palm body uses a private graphite copy with metallic 0.08 and roughness 0.52. No existing material datablock parameters changed.',
 'protected_intent':'All pivots, fingers, service-cover subtree, elbow, wrist, upper/forearm actuators and rails.',
 'inference':'Section depths, shell overlaps and socket steps are visually inferred from uncalibrated concept views; not measured engineering dimensions.'
},indent=2))
