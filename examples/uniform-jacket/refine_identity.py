"""Informed jacket identity refinement from the immutable selected native asset.

Ordinary editable Blender geometry. Existing continuous body topology, shared
armholes, dimensions, left cuff edit roles and unrelated material datablocks
are retained. Collar/facing data and left ornament are explicitly reconstructed.
Run only on the supplied baseline (the runner does this for every candidate).
"""
import bpy
import bmesh
import collections
import datetime as dt
import hashlib
import json
import math
import time
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

PI = math.pi
sin, cos, exp = math.sin, math.cos, math.exp
scene = bpy.context.scene
out = Path(REFAS_OUTPUT_DIR)
script_started_utc = dt.datetime.now(dt.timezone.utc).isoformat()
script_started_monotonic = time.monotonic()


def fingerprint(ob):
    data = {'matrix': [list(r) for r in ob.matrix_world], 'parent': ob.parent.name if ob.parent else None,
            'materials': [m.name if m else None for m in ob.data.materials],
            'vertices': [list(v.co) for v in ob.data.vertices], 'faces': [list(p.vertices) for p in ob.data.polygons],
            'material_indices': [p.material_index for p in ob.data.polygons],
            'modifiers': [(m.name, m.type, getattr(m, 'levels', None), getattr(m, 'thickness', None), getattr(m, 'width', None)) for m in ob.modifiers]}
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()


def material_state(mat):
    data = {'diffuse': list(mat.diffuse_color), 'nodes': [], 'links': []}
    if mat.node_tree:
        for n in mat.node_tree.nodes:
            vals = []
            for socket in n.inputs:
                if hasattr(socket, 'default_value'):
                    val = socket.default_value
                    try:
                        val = list(val)
                    except TypeError:
                        val = str(val)
                    vals.append((socket.name, val))
            data['nodes'].append((n.name, n.type, vals))
        data['links'] = sorted((l.from_node.name, l.from_socket.name, l.to_node.name, l.to_socket.name) for l in mat.node_tree.links)
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()


before = {o.name: fingerprint(o) for o in scene.objects if o.type == 'MESH'}
original_materials = {m.name: material_state(m) for m in bpy.data.materials}
body = bpy.data.objects['Body | continuous open front and shoulder yoke']
body_faces_before = [tuple(p.vertices) for p in body.data.polygons]
original_body_vertices = [v.co.copy() for v in body.data.vertices]
lining = bpy.data.materials['Interior | black satin lining']
trim = bpy.data.materials['Piping | pale silver grey']
metal = bpy.data.materials['Hardware | brushed silver']
thread = bpy.data.materials['Seams | tonal thread']
cloth = bpy.data.materials['Main | charcoal woven wool'].copy()
cloth.name = 'Identity | charcoal tailored cloth'
p = cloth.node_tree.nodes.get('Principled BSDF')
p.inputs['Base Color'].default_value = (.0024, .0024, .0032, 1)
p.inputs['Roughness'].default_value = .72
p.inputs['Specular IOR Level'].default_value = .022
p.inputs['Sheen Weight'].default_value = 0
cloth.diffuse_color = (.0024, .0024, .0032, 1)
strap = bpy.data.materials['Straps | charcoal twill'].copy()
strap.name = 'Identity | black twill straps'
p = strap.node_tree.nodes.get('Principled BSDF')
p.inputs['Base Color'].default_value = (.00155, .0016, .00195, 1)
p.inputs['Metallic'].default_value = 0
p.inputs['Roughness'].default_value = .73
p.inputs['Specular IOR Level'].default_value = .028
strap.diffuse_color = (.00155, .0016, .00195, 1)
embroidery = metal.copy(); embroidery.name = 'Identity | pale silver embroidery'
p = embroidery.node_tree.nodes.get('Principled BSDF')
p.inputs['Base Color'].default_value = (.57, .59, .64, 1)
p.inputs['Metallic'].default_value = .28
p.inputs['Roughness'].default_value = .42
embroidery.diffuse_color = (.57, .59, .64, 1)


def remove(name):
    ob = bpy.data.objects.get(name)
    if ob:
        bpy.data.objects.remove(ob, do_unlink=True)


def mesh(name, vertices, faces, materials, thickness=0, subd=0, replace=True):
    ob = bpy.data.objects.get(name) if replace else None
    me = bpy.data.meshes.new(name + ' identity mesh')
    me.from_pydata(vertices, [], faces); me.update()
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces)); bm.to_mesh(me); bm.free()
    if ob is None:
        ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob)
    else:
        ob.data = me
        for g in list(ob.vertex_groups):
            ob.vertex_groups.remove(g)
        ob.modifiers.clear()
    for m in materials:
        me.materials.append(m)
    for f in me.polygons:
        f.use_smooth = True
    if subd:
        mod = ob.modifiers.new('Soft sewn cloth subdivision', 'SUBSURF')
        mod.levels = mod.render_levels = subd
    if thickness:
        mod = ob.modifiers.new('Physical fabric thickness', 'SOLIDIFY')
        mod.thickness = thickness; mod.offset = -1
        if len(materials) > 1:
            mod.material_offset = mod.material_offset_rim = 1
    return ob


def path(name, points, radius=.0008, mat=trim, cyclic=False):
    # Retain an existing object's identity while replacing its mesh data.
    old = bpy.data.objects.get(name)
    cu = bpy.data.curves.new(name + ' fitted centerline', 'CURVE')
    cu.dimensions = '3D'; cu.resolution_u = 1; cu.bevel_depth = radius; cu.bevel_resolution = 3
    sp = cu.splines.new('POLY'); sp.points.add(len(points)-1)
    for p, co in zip(sp.points, points):
        p.co = (*co, 1)
    sp.use_cyclic_u = cyclic
    ob = bpy.data.objects.new(name + ' temporary', cu); scene.collection.objects.link(ob); cu.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.convert(target='MESH')
    if old:
        old.data = ob.data; bpy.data.objects.remove(ob, do_unlink=True); ob = old
    else:
        ob.name = name
    for f in ob.data.polygons:
        f.use_smooth = True
    return ob


def smooth(x):
    x = max(0, min(1, x)); return x*x*(3-2*x)


def interp(rows, u):
    for a,b in zip(rows, rows[1:]):
        if a[0] <= u <= b[0]:
            return Vector(a[1:]).lerp(Vector(b[1:]), (u-a[0])/(b[0]-a[0]))
    return Vector(rows[-1][1:])


def bvh_for(ob):
    bpy.context.view_layer.update()
    ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
    result = BVHTree.FromPolygons([ob.matrix_world @ v.co for v in me.vertices], [list(f.vertices) for f in me.polygons])
    ev.to_mesh_clear(); return result


# Gentle tailored volume and elbow response use the existing sewn cage. No
# seam is split and both wrists/cuffs retain their original coordinates.
axis0 = Vector((.258, -.018, -.966)).normalized()
for side in [1,-1]:
    pre = 'L' if side == 1 else 'R'
    group = body.vertex_groups[pre + ' Sleeve | rebuilt editable region']
    members = {v.index for v in body.data.vertices if any(g.group == group.index for g in v.groups)}
    ax = Vector((side*axis0.x, axis0.y, axis0.z))
    origin = Vector((side*.19, 0, .39))
    uu = Vector((side*.966, 0, .258)).normalized(); vv = ax.cross(uu).normalized()
    for idx in members:
        v = body.data.vertices[idx]; q = v.co.copy(); s = (q-origin).dot(ax)
        fade = smooth((s-.12)/.07) * (1-smooth((s-.45)/.06))
        if fade <= 0:
            continue
        center = origin + ax*s
        radial = q-center; radial -= ax*radial.dot(ax)
        angle = math.atan2(radial.dot(vv), radial.dot(uu))
        normal = radial.normalized()
        fold = .0048*exp(-((s-.30)/.105)**2)*sin(s*65+2.0*angle)
        fold += .0020*exp(-((s-.395)/.065)**2)*sin(s*77-1.4*angle)
        q += normal*fold*fade
        q.y -= .010*exp(-((s-.31)/.115)**2)*fade
        v.co = q
group = body.vertex_groups['Body panels | rebuilt fitted shell']
members = {v.index for v in body.data.vertices if any(g.group == group.index for g in v.groups)}
for idx in members:
    v = body.data.vertices[idx]; q = v.co.copy(); z = q.z; x = abs(q.x)
    # Keep the shoulder/armhole transition and the two dimensional anchors.
    fade = smooth(z/.035)*(1-smooth((z-.235)/.065))*(1-smooth((x-.14)/.032))
    if q.y < 0:
        q.y -= .0055*exp(-((z-.21)/.092)**2)*fade
        q.y += .0016*exp(-((z-.095)/.055)**2)*sin((x-.07)*65+z*22)*fade
    else:
        q.y += .0020*exp(-((z-.23)/.10)**2)*fade
    v.co = q
body.data.materials[0] = cloth
body.data.update()
body['identity_refinement'] = 'Existing shared topology retained; low-amplitude tailored chest and pre-bent elbow cloth response.'
assert [tuple(p.vertices) for p in body.data.polygons] == body_faces_before
body_bvh = bvh_for(body)

# Fit shoulder tabs and seams to the changed final cloth surface.
for pre in ['L','R']:
    for suffix,offset in [('tab',.002),('pale edge',.0029)]:
        ob = bpy.data.objects[pre+' Shoulder | '+suffix]
        for v in ob.data.vertices:
            q = ob.matrix_world @ v.co
            hit,_,_,_ = body_bvh.ray_cast(Vector((q.x,q.y,1)), Vector((0,0,-1)), 2)
            if hit is not None:
                q.z = hit.z+offset; v.co = ob.matrix_world.inverted() @ q
        if suffix == 'tab':
            ob.data.materials[0] = strap
        ob.data.update()
    ob = bpy.data.objects[pre+' Shoulder | button']
    hit,_,_,_ = body_bvh.ray_cast(Vector((ob.location.x,ob.location.y,1)),Vector((0,0,-1)),2)
    ob.location.z = hit.z+.005

profiles = [(0,.132,.084,.063),(.04,.135,.087,.065),(.10,.140,.093,.070),(.16,.151,.101,.078),
            (.215,.166,.109,.086),(.255,.176,.111,.090),(.295,.183,.107,.088),(.335,.186,.099,.077),(.375,.188,.089,.063)]
for side,name in [(0,'Back | centre tailoring seam'),(1,'L body | princess seam'),(-1,'R body | princess seam')]:
    points=[]
    for i in range(96):
        z=.012+i/95*(.392 if side==0 else .355)
        rx=.19 if z>.375 else interp(profiles,z).x
        hit,n,_,_ = body_bvh.ray_cast(Vector((side*rx*.69,.5,z)),Vector((0,-1,0)),1)
        if hit is not None: points.append(hit+n*.00018)
    path(name,points,.00028,thread)
for side in [1,-1]:
    pre='L' if side==1 else 'R'; ax=Vector((side*axis0.x,axis0.y,axis0.z)); points=[]
    for i in range(100):
        s=.012+i/99*.568; q=Vector((side*.19,0,.39))+ax*s
        hit,n,_,_ = body_bvh.ray_cast(Vector((q.x,-side*.5,q.z)),Vector((0,side,0)),1)
        if hit is not None: points.append(hit+n*.00018)
    path(pre+' Sleeve | back seam',points,.00028,thread)

# Connected collar and lapel facing. A narrow turned nape drops from a rounded
# roll toward the shoulder; side leaves no longer project as a rigid shelf.
widths=[0,.02,.06,.12,.22,.36,.50,.66,.81,.93,.98,1]
gorge=Vector((.084,-.095,.351))
outline=[(0,.062,-.093,.016),(.15,.075,-.105,.090),(.45,.102,-.120,.202),
         (.72,.133,-.125,.292),(.84,.142,-.121,.319),(1,*gorge)]


def hinge(z):
    rx,ry,x=interp(profiles,z)
    q=Vector((x+.001,-ry*math.sqrt(max(0,1-(x/rx)**2))-.001,z))
    hit,n,_,distance=body_bvh.find_nearest(q)
    return hit+n*.0013 if hit is not None and distance<.028 else q


def lapel_row(s):
    outer=interp(outline,s); inner=hinge(outer.z)
    # The folded leaf rests over the actual chest, with a small roll clearance;
    # the old outline stood 3–6 cm in front of it in some sections.
    hit,_,_,_=body_bvh.ray_cast(Vector((outer.x,-.5,outer.z)),Vector((0,1,0)),1)
    if hit is None:
        hit,_,_,_=body_bvh.find_nearest(outer)
    if hit is not None:
        attach_y=hit.y-.0038
        outer.y=attach_y*(1-smooth((s-.84)/.16))+gorge.y*smooth((s-.84)/.16)
    roll=.0065*(.50+.50*sin(PI*s))*(1-.45*max(0,(s-.75)/.25))
    return [inner.lerp(outer,t)+Vector((0,-roll*sin(PI*t),.0015*sin(PI*t)*sin(PI*s))) for t in widths]


gorge_row=lapel_row(1)
edge_profile=[(0,*gorge),(.13,.129,-.086,.366),(.30,.081,-.048,.421),
              (.50,.078,.005,.420),(.75,.057,.061,.420),(1,0,.079,.422)]
us=sorted(set([0,.006,.02,.125,.13,.135,.985,1]+[i/72 for i in range(1,72)]))
all_rows=[(1,u) for u in us]+[(-1,u) for u in reversed(us[:-1])]
verts=[]; faces=[]; border=[]; nwidth=len(widths)
for side,u in all_rows:
    angle=.48+(PI-.48)*u; radial=Vector((sin(angle),-cos(angle),0))
    base=Vector((.067*sin(angle),-.063*cos(angle),.418))
    crest=Vector((.068*sin(angle),-.0645*cos(angle),.442+.007*sin(PI*u/2)))
    outer=interp(edge_profile,u)
    if u>.25:
        hit,_,_,_=body_bvh.ray_cast(Vector((outer.x,outer.y,.7)),Vector((0,0,-1)),1)
        if hit is not None: outer.z=max(outer.z,hit.z+.0018)
    row=[base,base+Vector((0,0,.002)),base.lerp(crest,.62),
         crest-radial*.0012-Vector((0,0,.001)),crest]
    for t in widths[5:]:
        q=(t-widths[4])/(1-widths[4])
        point=crest.lerp(outer,q)
        point+=radial*(.0022*sin(PI*q));point.z+=.0025*sin(PI*q)
        row.append(point)
    turn=smooth(u/.26);row=[a.lerp(b,turn) for a,b in zip(gorge_row,row)]
    delta=outer-row[-1];row=[q+delta*t for q,t in zip(row,widths)]
    if u>0:
        nearest,normal,_,dist=body_bvh.find_nearest(row[0])
        if nearest is not None and dist<.035:
            delta=nearest+normal*.0012-row[0];row=[q+delta*(1-t)**2 for q,t in zip(row,widths)]
    else:
        row=[q.copy() for q in gorge_row]
    for q in row:
        q.x*=side;verts.append(q)
    edge=row[-1]+Vector((0,-.0006 if u<.30 else 0,.00055));border.append(edge)
for k in range(len(all_rows)-1):
    for j in range(nwidth-1):
        i=k*nwidth+j;faces.append((i,i+1,i+nwidth+1,i+nwidth))
groups={'Collar stand and turned leaves':list(range(len(verts)))};gorge_edges=[]
samples=sorted(set([0,.002,.837,.84,.843,.985,.995,1]+[i/90 for i in range(1,90)]))
for side in [1,-1]:
    pre='L' if side==1 else 'R';start=0 if side==1 else (len(all_rows)-1)*nwidth
    previous=list(range(start,start+nwidth));groups[pre+' Gorge | shared cloth seam']=previous[:]
    gorge_edges.extend(tuple(sorted((a,b))) for a,b in zip(previous,previous[1:]))
    ids=previous[:];edge=[Vector((side*gorge.x,gorge.y-.0006,gorge.z+.00055))]
    for s in reversed(samples[:-1]):
        row=lapel_row(s);ring=[]
        for q in row:
            q.x*=side;ring.append(len(verts));ids.append(len(verts));verts.append(q)
        for j in range(nwidth-1):
            f=(previous[j],ring[j],ring[j+1],previous[j+1]);faces.append(f if side==1 else tuple(reversed(f)))
        edge.append(row[-1]+Vector((0,-.00065,0)));previous=ring
    groups[pre+' Lapel | rolled facing']=ids
    path(pre+' Lapel | fine piping',edge,.00086,trim)
collar=mesh('Collar | standing back and neck facing',verts,faces,[cloth,lining],.0022,2)
for name,ids in groups.items():collar.vertex_groups.new(name=name).add(ids,1,'REPLACE')
collar['construction']='Connected gorge seams; rounded 3 cm stand turning into a narrow descending nape leaf and soft front lapels.'
collar['selection_semantics']='Named collar, left/right lapel and shared gorge vertex groups.'
path('Collar | pale upper edge',border,.00086,trim)
collar_bvh=bvh_for(collar)
for side in [1,-1]:
    ob=bpy.data.objects[('L' if side==1 else 'R')+' lapel | silver snap']
    ob.location.x=side*.113;ob.location.z=.298
    hit,_,_,_=collar_bvh.ray_cast(Vector((ob.location.x,-.5,ob.location.z)),Vector((0,1,0)),1)
    assert hit is not None;ob.location.y=hit.y-.002

# Black straps with narrow bright edging, keeping silver buckles independent.
# The eight named cuff objects (seven change in the local exercise) keep their
# names and edit_role properties. Edge strips share each existing strap mesh.
def strap_arc(name,a,b):
    verts=[];faces=[];steps=60
    for z in [.008,.00865,.04235,.043]:
        for j in range(steps+1):
            th=a+(b-a)*j/steps;verts.append((.136*sin(th),-.091*cos(th),z))
    for k in range(3):
        for j in range(steps):
            i=k*(steps+1)+j;faces.append((i,i+1,i+steps+2,i+steps+1))
    ob=mesh(name,verts,faces,[strap,trim],.0015)
    # Solidify rim uses strap; border is solely the narrow surface strips.
    ob.modifiers[-1].material_offset=0;ob.modifiers[-1].material_offset_rim=0
    for f in ob.data.polygons:f.material_index=1 if f.index//steps in [0,2] else 0
    return ob
strap_arc('Waist | rear wrap belt',1.05,2*PI-1.05)
strap_arc('L Waist | front short belt',.47,.95)
strap_arc('R Waist | front short belt',2*PI-.95,2*PI-.47)


def sleeve_radius(s):
    return interp([(0,.060,0,0),(.035,.066,0,0),(.12,.061,0,0),(.24,.052,0,0),(.32,.048,0,0),(.43,.045,0,0),(.52,.0415,0,0),(.58,.041,0,0)],s).x


for side in [1,-1]:
    pre='L' if side==1 else 'R';band=bpy.data.objects[pre+'_Cuff_Band'];band.data.materials[0]=strap
    ax=Vector((side*axis0.x,axis0.y,axis0.z));uu=Vector((side*.966,0,.258)).normalized();vv=ax.cross(uu).normalized()
    verts=[];faces=[];nr=40
    for s in [.541,.54165,.55835,.559]:
        center=Vector((side*.19,0,.39))+ax*s;center.y-=.007*sin(PI*s/.58)**2
        for j in range(nr):
            a=2*PI*j/nr;r=sleeve_radius(s)+.004
            verts.append(center+uu*(r*cos(a))+vv*(r*.96*sin(a)))
    for k in range(3):
        for j in range(nr):
            i=k*nr+j;faces.append((i,k*nr+(j+1)%nr,(k+1)*nr+(j+1)%nr,i+nr))
    ob=mesh(pre+'_Cuff_Strap',verts,faces,[strap,trim],.001)
    ob.modifiers[-1].material_offset=ob.modifiers[-1].material_offset_rim=0
    for f in ob.data.polygons:f.material_index=1 if f.index//nr in [0,2] else 0
    ob['edit_role']='hardware'

# Replace the old thin wire fleur and indistinct terminal beads with a curved
# shield field, solid embroidered fleur lobes, draped linked chains and lance
# pendants. The observed left-side asymmetry is preserved.
removed_ornament=[]
for ob in list(scene.objects):
    if ob.name.startswith(('L Ornament |','L Chain |')):
        removed_ornament.append(ob.name);bpy.data.objects.remove(ob,do_unlink=True)


def bezier(points,steps=8):
    # A list of cubic segments: start then repeating handle, handle, endpoint.
    result=[Vector(points[0])]
    for i in range(1,len(points),3):
        a=result[-1];b,c,d=map(Vector,points[i:i+3])
        result += [(1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d for t in [j/steps for j in range(1,steps+1)]]
    return result


def button(name,center,r=.0018,normal=Vector((0,-1,0))):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=6,radius=r,location=center)
    ob=bpy.context.object;ob.name=name;ob.scale=(1,1,.40);ob.rotation_mode='QUATERNION'
    ob.rotation_quaternion=Vector((0,0,1)).rotation_difference(normal);ob.data.materials.append(metal)
    for f in ob.data.polygons:f.use_smooth=True
    return ob


def shield(name,center,u,w,h,project=False):
    center=Vector(center);u=Vector(u).normalized();z=Vector((0,0,1));normal=u.cross(z).normalized()
    def point(x,y,offset=0):
        q=center+u*x*w+z*y*h
        if project:
            hit,n,_,_=body_bvh.ray_cast(q+normal*.1,-normal,.20)
            if hit is not None:q=hit+normal*.0020
        # Gently domed embroidered field, not a flat floating sign.
        return q+normal*(offset+.00055*max(0,1-4*x*x)*max(0,1-3*y*y))
    outline=bezier([(-.5,.5),(-.18,.46),(.18,.46),(.5,.5),(.48,.18),(.46,-.16),(.30,-.31),
                    (.17,-.44),(.04,-.53),(0,-.57),(-.04,-.53),(-.17,-.44),(-.30,-.31),
                    (-.46,-.16),(-.48,.18),(-.5,.5)])[:-1]
    points=[point(x,y) for x,y in outline]
    vertices=[point(0,0)]+points
    faces=[(0,i+1,(i+1)%len(points)+1) for i in range(len(points))]
    ob=mesh(name+' | black shield field',vertices,faces,[strap],.0011)
    ob['source_identity']='Wearer-left curved shield with full three-lobed fleur-de-lys embroidery'
    path(name+' | pale shield border',[point(x,y,.0007) for x,y in outline],.00070,embroidery,True)
    # Separate raised solid leaves form an unmistakable fleur-de-lys.
    def fill(label,coords):
        vs=[point(x,y,.00125) for x,y in coords]
        ob=mesh(name+' | fleur '+label,vs,[tuple(range(len(vs)))],[embroidery],.00045)
        bevel=ob.modifiers.new('Soft embroidery perimeter','BEVEL');bevel.width=.00022;bevel.segments=2
    centerleaf=bezier([(0,.40),(-.04,.35),(-.11,.22),(-.075,.15),(-.05,.08),(-.024,.03),(-.024,-.16),
                        (-.020,-.23),(-.045,-.28),(0,-.34),(.045,-.28),(.020,-.23),(.024,-.16),
                        (.024,.03),(.05,.08),(.075,.15),(.11,.22),(.04,.35),(0,.40)])[:-1]
    fill('central spear',centerleaf)
    leaf=bezier([(-.025,-.08),(-.08,.02),(-.12,.17),(-.24,.20),(-.36,.24),(-.39,.10),(-.32,.05),
                 (-.28,.01),(-.22,.015),(-.21,.06),(-.24,.035),(-.29,.09),(-.25,.12),
                 (-.17,.16),(-.12,.02),(-.10,-.08),(-.08,-.10),(-.045,-.10),(-.025,-.08)])[:-1]
    fill('left lobe',leaf);fill('right lobe',[(-x,y) for x,y in reversed(leaf)])
    tail=bezier([(-.035,-.15),(-.10,-.18),(-.13,-.26),(-.22,-.25),(-.18,-.32),(-.08,-.31),(-.035,-.19),
                 (-.033,-.18),(-.033,-.16),(-.035,-.15)])[:-1]
    fill('left lower curl',tail);fill('right lower curl',[(-x,y) for x,y in reversed(tail)])
    path(name+' | fleur crossbar',[point(-.16,-.115,.0018),point(.16,-.115,.0018)],.00085,embroidery)
    for x in [-.32,.32]:button(name+' | top stitch stud '+str(x),point(x,.33,.0012),.00085,normal)
    return point,normal,u


sleeve_point,n_s,u_s=shield('L Identity sleeve',(.255,-.038,.284),(.60,.8,0),.043,.057,True)
breast_point,n_b,u_b=shield('L Identity breast',(.130,-.087,.298),(1,0,0),.025,.039,False)


def tube_mesh(vertices,faces,points,radius,sides=6,cyclic=False):
    start=len(vertices)
    for i,p in enumerate(points):
        tangent=(points[(i+1)%len(points)]-points[(i-1)%len(points)]).normalized() if cyclic else (points[min(i+1,len(points)-1)]-points[max(0,i-1)]).normalized()
        normal=tangent.cross(Vector((0,0,1)))
        if normal.length<.05:normal=tangent.cross(Vector((0,1,0)))
        normal.normalize();bitan=tangent.cross(normal).normalized()
        vertices.extend(p+radius*(normal*cos(2*PI*j/sides)+bitan*sin(2*PI*j/sides)) for j in range(sides))
    end=len(points) if cyclic else len(points)-1
    for i in range(end):
        for j in range(sides):
            a=start+i*sides+j;b=start+i*sides+(j+1)%sides;c=start+((i+1)%len(points))*sides+(j+1)%sides;d=start+((i+1)%len(points))*sides+j
            faces.append((a,b,c,d))


def chain(name,start,end,dip,normal=Vector((0,-1,0)),bow=Vector((0,0,0)),front_clearance=None):
    a,b=Vector(start),Vector(end)
    samples=[]
    for i in range(241):
        t=i/240;q=a.lerp(b,t)+bow*(4*t*(1-t));q.z-=dip*4*t*(1-t)
        if front_clearance is not None:
            hit,_,_,_=body_bvh.ray_cast(Vector((q.x,-.5,q.z)),Vector((0,1,0)),1)
            if hit is not None:
                # Smoothly move the hanging chain in front of the final cloth;
                # this preserves gravity sag without burying its rising links.
                distance=q.y-(hit.y-front_clearance)
                q.y-=.5*(distance+math.sqrt(distance*distance+.0012*.0012))
        samples.append(q)
    lengths=[0]
    for p,q in zip(samples,samples[1:]):lengths.append(lengths[-1]+(q-p).length)
    count=max(4,round(lengths[-1]/.0035));vertices=[];faces=[]
    cursor=0
    for i in range(count):
        distance=lengths[-1]*(i+.5)/count
        while cursor<len(lengths)-2 and lengths[cursor+1]<distance:cursor+=1
        f=(distance-lengths[cursor])/(lengths[cursor+1]-lengths[cursor]);center=samples[cursor].lerp(samples[cursor+1],f)
        tangent=(samples[min(cursor+2,240)]-samples[max(cursor-1,0)]).normalized()
        side=tangent.cross(normal).normalized()
        if i%2:side=tangent.cross(side).normalized()
        loop=[center+tangent*(.00225*cos(2*PI*j/14))+side*(.00120*sin(2*PI*j/14)) for j in range(14)]
        tube_mesh(vertices,faces,loop,.00033,6,True)
    ob=mesh(name,vertices,faces,[metal]);ob['links']=count;ob['construction']='Alternating individual closed oval links, joined as editable component mesh'
    if front_clearance is not None:ob['front_cloth_clearance_m']=front_clearance
    return ob


def pendant(name,top,u,normal,length=.014,width=.005,down=Vector((0,0,-1))):
    top=Vector(top);u=Vector(u);normal=Vector(normal)
    center=top+down*length*.48
    vertices=[top,top+u*width*.50+down*length*.42,top+down*length,top-u*width*.50+down*length*.42,center+normal*.0010,center-normal*.0007]
    faces=[(4,i,(i+1)%4) for i in range(4)]+[(5,(i+1)%4,i) for i in range(4)]
    ob=mesh(name,vertices,faces,[metal]);bevel=ob.modifiers.new('Soft polished pendant edges','BEVEL');bevel.width=.0002;bevel.segments=2
    return ob


start=breast_point(.25,-.23,.002);end=sleeve_point(-.34,-.02,.002)
chain('L Identity | front upper draped chain',start,end,.051,bow=Vector((0,-.007,0)))
chain('L Identity | front lower draped chain',breast_point(.12,-.40,.002),sleeve_point(-.30,-.15,.002),.073,bow=Vector((0,-.008,0)),front_clearance=.0045)
rear_anchor=Vector((.158,.056,.390))
ringpts=[rear_anchor+Vector((.007*cos(2*PI*j/48),.002*cos(2*PI*j/48),.009*sin(2*PI*j/48))) for j in range(48)]
path('L Identity | shoulder suspension ring',ringpts,.001,metal,True)
chain('L Identity | rear upper draped chain',rear_anchor+Vector((0,0,-.005)),sleeve_point(.42,.12,.002),.046,Vector((0,1,0)),Vector((.018,.042,0)))
chain('L Identity | rear lower draped chain',rear_anchor+Vector((.003,0,-.012)),sleeve_point(.40,-.10,.002),.065,Vector((0,1,0)),Vector((.019,.047,0)))
for i,(x,y,length) in enumerate([(-.29,-.28,.039),(-.15,-.42,.050),(0,-.52,.062),(.15,-.42,.047),(.29,-.28,.035)]):
    top=sleeve_point(x,y,.002);bottom=top+axis0*length+Vector((.001*(i-2),-.002,0))
    chain('L Identity | sleeve hanging chain '+str(i),top,bottom,.0018,n_s)
    button('L Identity | sleeve terminal bead '+str(i),bottom,.0012,n_s)
    pendant('L Identity | sleeve lance pendant '+str(i),bottom+axis0*.0014,u_s,n_s,.015 if i==2 else .011,.005 if i==2 else .004,axis0)
for i,length in enumerate([.092,.117]):
    top=rear_anchor+Vector((-.003+i*.005,.003,-.007))
    bottom=top+Vector((.005,.021,-length))
    chain('L Identity | shoulder hanging chain '+str(i),top,bottom,.001,Vector((0,1,0)))
    pendant('L Identity | shoulder pendant '+str(i),bottom,Vector((1,0,0)),Vector((0,1,0)),.012,.0038)
for i,x in enumerate([-.22,.22]):
    top=breast_point(x,-.38,.002);bottom=top+Vector((x*.015,-.002,-.038-i*.008))
    chain('L Identity | breast hanging chain '+str(i),top,bottom,.001,n_b)
    pendant('L Identity | breast pendant '+str(i),bottom,u_b,n_b,.010,.0037)

bpy.context.view_layer.update()
counts=collections.Counter(tuple(sorted((a,b))) for f in body.data.polygons for a,b in zip(list(f.vertices),list(f.vertices)[1:]+list(f.vertices)[:1]))
shared=[]
for name in ['L Armhole | shared 40-edge seam','R Armhole | shared 40-edge seam']:
    g=body.vertex_groups[name];members={v.index for v in body.data.vertices if any(w.group==g.index for w in v.groups)}
    edges=[(e,n) for e,n in counts.items() if set(e)<=members]
    assert len(edges)==40 and all(n==2 for e,n in edges)
    shared.append({'name':name,'edges':len(edges),'all_two_faces':True})
counts=collections.Counter(tuple(sorted((a,b))) for f in collar.data.polygons for a,b in zip(list(f.vertices),list(f.vertices)[1:]+list(f.vertices)[:1]))
assert all(counts[e]==2 for e in gorge_edges)
after={o.name:fingerprint(o) for o in scene.objects if o.type=='MESH'}
changed=sorted(n for n in before if n not in after or before[n]!=after[n])
allowed={body.name,collar.name,'Collar | pale upper edge','L Lapel | fine piping','R Lapel | fine piping',
         'L lapel | silver snap','R lapel | silver snap','Back | centre tailoring seam','L body | princess seam','R body | princess seam',
         'L Sleeve | back seam','R Sleeve | back seam','Waist | rear wrap belt','L Waist | front short belt','R Waist | front short belt',
         'L_Cuff_Band','R_Cuff_Band','L_Cuff_Strap','R_Cuff_Strap',*removed_ornament}
allowed.update(pre+' Shoulder | '+suffix for pre in ['L','R'] for suffix in ['tab','pale edge','button'])
unexpected=[n for n in changed if n not in allowed];assert not unexpected,unexpected
assert all(material_state(bpy.data.materials[n])==state for n,state in original_materials.items())
assert len([n for n in after if n.startswith('L_Cuff_')])==8
assert all(before[n]==after[n] for n in before if '_Cuff_' in n and not n.endswith(('Band','Strap')))
report={'purpose':'Informed source-visible identity refinement, retaining shared cloth topology and cuff edit roles',
        'script_execution_start_utc':script_started_utc,'script_execution_end_utc':dt.datetime.now(dt.timezone.utc).isoformat(),
        'script_execution_start_monotonic':script_started_monotonic,'script_execution_duration_seconds':time.monotonic()-script_started_monotonic,
        'changed_objects':changed,'removed_ornament_objects':removed_ornament,'added_objects':sorted(set(after)-set(before)),
        'protected_unchanged_count':len(before)-len(changed),'unexpected_changes':unexpected,
        'all_original_material_datablocks_unchanged':True,'new_materials':[cloth.name,strap.name,embroidery.name],
        'body_cage_topology_unchanged':True,'shared_armholes':shared,'gorge_shared_edges':len(gorge_edges),
        'left_cuff_object_names':sorted(n for n in after if n.startswith('L_Cuff_')),
        'original_cloth_maximum_vertex_displacement_m':max((v.co-original_body_vertices[v.index]).length for v in body.data.vertices),
        'source_inferences':['Hidden lining and exact fold depth remain inferred.','Front/back/labelled-left decoration placement governs conflicting source obliques.',
                             'Cuff width/circumference and collar-width labels remain ambiguous as documented in reference.json.'],
        'limits':['Static editable garment prototype; no simulation, rig or production UV claim.','Linked chain meshes model visual form; no rigid-body physics claim.']}
(out/'identity-checks.json').write_text(json.dumps(report,indent=2)+'\n')
scene['source_identity_refinement']='Soft rolled nape and lapels; tailored continuous shell; black straps with narrow pale edges; left solid fleur-de-lys shields and linked pendants.'
print('IDENTITY_CHECKS',json.dumps({k:v for k,v in report.items() if k not in ['changed_objects','removed_ornament_objects','added_objects']}))
