"""AURIX arm: source-led rigid-part authoring in metres, Z up, front -Y.

Primary armor is made from explicit longitudinal surface profiles. Cylinders
are reserved for actual bearings, hydraulic rods, collars and fasteners.
The reference sheet is a design drawing, not a calibrated engineering plan.
"""
import bpy, math, json, hashlib
from pathlib import Path
from mathutils import Vector

for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0
scene.world = bpy.data.worlds.new('AURIX_StudioWorld')
scene.world.use_nodes = True

def linear(x):
    return x / 12.92 if x <= .04045 else ((x+.055)/1.055)**2.4

def material(name, rgb, metallic=0, rough=.35, emission=0):
    m=bpy.data.materials.new(name); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    col=tuple(linear(x) for x in rgb)+(1,)
    p.inputs['Base Color'].default_value=col
    p.inputs['Metallic'].default_value=metallic
    p.inputs['Roughness'].default_value=rough
    if emission:
        p.inputs['Emission Color'].default_value=col
        p.inputs['Emission Strength'].default_value=emission
    m.diffuse_color=col
    return m

ivory=material('Ivory • ceramic titanium armor',(.84,.83,.79),.28,.31)
edge=material('Warm silver • machined bevels',(.54,.57,.60),.82,.24)
steel=material('Piston chrome',(.65,.69,.72),.92,.22)
graphite=material('Graphite structural composite',(.105,.12,.135),.28,.34)
rubber=material('Palm and joint elastomer',(.055,.064,.071),.0,.62)
black=material('Recess interiors',(.025,.030,.036),.15,.46)
gold=material('Anodized champagne gold',(.64,.44,.18),.82,.29)
cyan=material('Cool status glass',(.52,.81,.96),.4,.2,2.2)
label=material('AURIX carbon markings',(.095,.10,.105),.0,.52)

def tag(obj, parent=None, role=None):
    obj['aurix_asset']=True
    if role: obj['role']=role
    if parent:
        bpy.context.view_layer.update()
        obj.parent=parent
        obj.matrix_parent_inverse=parent.matrix_world.inverted()
    return obj

def pivot(name, pos, parent=None, role='rigid articulation pivot'):
    obj=bpy.data.objects.new(name,None); scene.collection.objects.link(obj)
    obj.location=pos; obj.empty_display_type='ARROWS'; obj.empty_display_size=.012
    tag(obj,parent,role); obj['axis']='local X flexion, unless described otherwise'
    return obj

root=pivot('AURIX_ROOT',(0,0,0),role='entire arm')
root['frame']='metres; Z up; front -Y; right-hand interpretation, thumb at -X'
root['source_interpretation']='760 mm nominal envelope; connector diameter is not added as a separate upper-arm segment'
shoulder=pivot('SHOULDER_PIVOT',(0,0,.690),root)
elbow=pivot('ELBOW_PIVOT',(0,0,.426),shoulder)
wrist=pivot('WRIST_PIVOT',(0,0,.184),elbow)
cover=pivot('SERVICE_COVER',(0,.037,.299),elbow,'removable service cover and attached hardware')
cover['edit_normal_local']=[0.,1.,0.]
cover['edit_distance_m']=.003

def mesh(name, verts, faces, mat, parent, bevel=.001, smooth=False):
    data=bpy.data.meshes.new(name+'_geometry');data.from_pydata(verts,[],faces);data.update()
    ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob)
    ob.data.materials.append(mat); tag(ob,parent)
    if smooth:
        for p in data.polygons:p.use_smooth=True
    if bevel:
        mod=ob.modifiers.new('Manufactured edge radius','BEVEL');mod.width=bevel;mod.segments=3
        mod.limit_method='ANGLE'
        mod=ob.modifiers.new('Face-weighted normals','WEIGHTED_NORMAL');mod.keep_sharp=True
    return ob

def patch(name, rows, mat, parent, thickness=.003, bevel=.0012, back=False):
    """Shared 5-point transverse profiles yield one continuous shaped shell."""
    verts=[]
    for z,l,r,center,edge_y in rows:
        for t in [0,.2,.5,.8,1]:
            verts.append((l+(r-l)*t,center+(edge_y-center)*abs(2*t-1)**1.7,z))
    faces=[]
    for j in range(len(rows)-1):
        for i in range(4):
            a=j*5+i; faces.append((a,a+1,a+6,a+5) if not back else (a+5,a+6,a+1,a))
    ob=mesh(name,verts,faces,mat,parent,bevel=0)
    mod=ob.modifiers.new('True shell thickness','SOLIDIFY');mod.thickness=thickness;mod.offset=0
    mod=ob.modifiers.new('Soft machined perimeter','BEVEL');mod.width=bevel;mod.segments=3
    mod=ob.modifiers.new('Weighted shell normals','WEIGHTED_NORMAL');mod.keep_sharp=True
    return ob

def arc_shell(name, rows, angle0,angle1,mat,parent,thickness=.003):
    verts=[]; n=8
    for z,rx,ry in rows:
        for i in range(n+1):
            a=math.radians(angle0+(angle1-angle0)*i/n)
            verts.append((rx*math.sin(a),-ry*math.cos(a),z))
    faces=[]
    for j in range(len(rows)-1):
        for i in range(n):
            a=j*(n+1)+i;faces.append((a,a+1,a+n+2,a+n+1))
    ob=mesh(name,verts,faces,mat,parent,0)
    mod=ob.modifiers.new('Armor thickness','SOLIDIFY');mod.thickness=thickness
    mod=ob.modifiers.new('Rounded armor edges','BEVEL');mod.width=.0013;mod.segments=3
    ob.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return ob

def cylinder(name,a,b,r,mat,parent,vertices=48):
    a,b=Vector(a),Vector(b);v=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=v.length,location=(a+b)/2)
    ob=bpy.context.object;ob.name=name;ob.rotation_mode='QUATERNION';ob.rotation_quaternion=v.to_track_quat('Z','Y')
    ob.data.materials.append(mat)
    for f in ob.data.polygons:f.use_smooth=True
    mod=ob.modifiers.new('Edge chamfer','BEVEL');mod.width=min(r*.13,.001);mod.segments=2
    ob.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return tag(ob,parent)

def tube(name,points,r,mat,parent):
    cu=bpy.data.curves.new(name+'_path','CURVE');cu.dimensions='3D';cu.resolution_u=10
    sp=cu.splines.new('BEZIER');sp.bezier_points.add(len(points)-1)
    for bp,p in zip(sp.bezier_points,points):bp.co=p;bp.handle_left_type='AUTO';bp.handle_right_type='AUTO'
    cu.bevel_depth=r;cu.bevel_resolution=3
    ob=bpy.data.objects.new(name,cu);scene.collection.objects.link(ob);ob.data.materials.append(mat)
    bpy.context.view_layer.objects.active=ob;ob.select_set(True)
    for a in bpy.context.selected_objects:
        if a!=ob:a.select_set(False)
    bpy.ops.object.convert(target='MESH');return tag(bpy.context.object,parent)

def ring(name,center,axis,ri,ro,depth,mat,parent,segments=64,angle0=0,angle1=math.tau):
    c=Vector(center);w=Vector(axis).normalized()
    u=w.cross(Vector((0,0,1)))
    if u.length<.01:u=Vector((1,0,0))
    u.normalize();v=w.cross(u)
    verts=[]
    for d in [-depth/2,depth/2]:
        for r in [ri,ro]:
            for i in range(segments+1):
                a=angle0+(angle1-angle0)*i/segments;verts.append(tuple(c+w*d+r*(u*math.cos(a)+v*math.sin(a))))
    n=segments+1;faces=[]
    for i in range(segments):
        faces += [(i,i+1,n+i+1,n+i),(2*n+i,3*n+i,3*n+i+1,2*n+i+1),(i,2*n+i,2*n+i+1,i+1),(n+i,n+i+1,3*n+i+1,3*n+i)]
    faces += [(0,n,3*n,2*n),(segments,2*n+segments,3*n+segments,n+segments)]
    return mesh(name,verts,faces,mat,parent,.0007,True)

def screw(name,pos,normal,parent,r=.0018):
    p=Vector(pos);n=Vector(normal)
    cylinder(name,p-n*.00065,p+n*.00065,r,steel,parent,16)
    cylinder(name+'_hex_socket',p+n*.00068,p+n*.00085,r*.42,black,parent,6)

def text_mesh(name,body,pos,size,mat,parent):
    cu=bpy.data.curves.new(name+'_lettering','FONT');cu.body=body;cu.size=size;cu.align_x='CENTER';cu.extrude=.00003
    ob=bpy.data.objects.new(name,cu);scene.collection.objects.link(ob);ob.location=pos;ob.rotation_euler=(math.pi/2,0,0);ob.data.materials.append(mat)
    for a in bpy.context.selected_objects:a.select_set(False)
    ob.select_set(True);bpy.context.view_layer.objects.active=ob;bpy.ops.object.convert(target='MESH');tag(ob,parent)
    return ob

# Shoulder: deep circular sockets with stepped bores and separate perimeter locks.
for side in [-1,1]:
    s='L' if side<0 else 'R'
    ring('Shoulder_'+s+'_load_ring',(side*.052,0,.690),(1,0,0),.032,.058,.018,graphite,root)
    ring('Shoulder_'+s+'_titanium_flange',(side*.061,0,.690),(1,0,0),.036,.052,.006,edge,root)
    ring('Shoulder_'+s+'_gold_neural_bus',(side*.065,0,.690),(1,0,0),.035,.038,.003,gold,root)
    ring('Shoulder_'+s+'_inner_dark_bore',(side*.054,0,.690),(1,0,0),.029,.035,.018,black,root)
    cylinder('Shoulder_'+s+'_recess_back',(side*.044,0,.690),(side*.046,0,.690),.030,graphite,root)
    for i in range(6):
        a=i*math.tau/6+.10
        ring('Shoulder_'+s+'_locking_dog_%02d'%i,(side*.060,0,.690),(1,0,0),.050,.059,.011,graphite,root,8,a,a+.55)
        p=(side*.068,.047*math.cos(a+.25),.690+.047*math.sin(a+.25))
        screw('Shoulder_'+s+'_lock_%02d'%i,p,(side,0,0),root,.002)

patch('Upper_crown_front',[
 (.751,-.020,.020,-.024,-.016),(.740,-.037,.037,-.043,-.022),
 (.715,-.047,.047,-.054,-.026),(.674,-.038,.037,-.056,-.030),
 (.637,-.026,.029,-.047,-.024),(.602,-.017,.021,-.036,-.019)
],ivory,shoulder,.004,.002)
patch('Upper_crown_rear',[
 (.752,-.017,.017,.023,.015),(.735,-.023,.023,.047,.033),
 (.696,-.021,.021,.051,.038),(.665,-.017,.017,.042,.028)
],ivory,shoulder,.004,.0015,True)
for side in [-1,1]:
    arc_shell('Crown_side_cap_'+str(side),[(.746,.034,.025),(.734,.047,.037),(.709,.052,.038)],side*43,side*91,ivory,shoulder,.004)
    tube('Crown_gold_pinstripe_'+str(side),[(side*.022,-.024,.745),(side*.037,-.030,.730),(side*.044,-.034,.710)],.00085,gold,shoulder)
    screw('Crown_front_fastener_'+str(side),(side*.031,-.043,.713),(0,-1,0),shoulder,.0015)
text_mesh('Crown_A_mark','Λ',(0,-.057,.701),.022,label,shoulder)
text_mesh('Crown_AURIX','A U R I X',(0,-.058,.682),.0062,label,shoulder)
tube('Crown_gold_signature',[(.004,-.046,.644),(.004,-.040,.618)],.0009,gold,shoulder)

# Exposed upper arm: continuous central backbone and three cylinder/rod actuators.
patch('Upper_core_backbone',[(.650,-.018,.018,.023,.014),(.613,-.020,.020,.029,.015),(.486,-.014,.014,.025,.013),(.455,-.018,.018,.017,.009)],graphite,shoulder,.016,.0015,True)
cylinder('Upper_primary_cylinder',(0,.008,.484),(0,.008,.572),.0135,graphite,shoulder)
cylinder('Upper_primary_rod',(0,.008,.567),(0,.008,.643),.007,steel,shoulder)
cylinder('Upper_primary_gland',(0,.008,.570),(0,.008,.586),.015,gold,shoulder)
for side in [-1,1]:
    x=side*.026
    cylinder('Upper_side_actuator_'+str(side),(x,.002,.482),(x,.011,.570),.009,graphite,shoulder)
    cylinder('Upper_side_rod_'+str(side),(x,.011,.566),(side*.033,.015,.625),.0055,steel,shoulder)
    cylinder('Upper_side_gland_'+str(side),(x,.011,.564),(x,.011,.577),.010,gold,shoulder)
    cylinder('Upper_elbow_yoke_'+str(side),(side*.025,0,.450),(side*.032,0,.482),.010,steel,shoulder)
    rows=[(.609,.025,.039,-.018,-.011),(.589,.021,.046,-.030,-.010),(.560,.023,.045,-.033,-.005),(.538,.023,.038,-.027,-.001),(.493,.018,.032,-.024,-.001),(.472,.018,.029,-.016,.002)]
    if side<0:rows=[(z,-r,-l,c,e) for z,l,r,c,e in rows]
    patch('Upper_sculpted_blade_'+str(side),rows,ivory,shoulder,.0035,.0014)
    arc_shell('Upper_outer_wrap_'+str(side),[(.591,.045,.023),(.575,.051,.029),(.548,.048,.029),(.514,.037,.023),(.482,.030,.020)],side*64,side*132,ivory,shoulder,.003)
    tube('Upper_exposed_hydraulic_'+str(side),[(side*.032,-.006,.603),(side*.040,-.016,.574),(side*.034,-.022,.537),(side*.022,-.023,.505),(side*.021,-.016,.460)],.0037,steel,shoulder)
    tube('Upper_gold_conduit_'+str(side),[(side*.040,-.017,.563),(side*.039,-.023,.541),(side*.030,-.024,.517)],.0013,gold,shoulder)
    screw('Upper_blade_screw_'+str(side),(side*.033,-.026,.578),(0,-1,0),shoulder)
    patch('Upper_lower_side_pad_'+str(side),[(.512,side*.026-.008,side*.026+.008,.029,.021),(.478,side*.023-.007,side*.023+.007,.022,.016)],ivory,shoulder,.003,.001,True)

# Elbow: fixed cheek bearings and a moving central rotor at one explicit axis.
cylinder('Elbow_fixed_axle',(-.044,0,.426),(.044,0,.426),.019,steel,shoulder)
for side in [-1,1]:
    s=str(side)
    ring('Elbow_cheek_'+s,(side*.038,0,.426),(1,0,0),.014,.030,.012,graphite,shoulder)
    ring('Elbow_gold_ring_'+s,(side*.045,0,.426),(1,0,0),.0235,.026,.003,gold,shoulder)
    ring('Elbow_silver_rim_'+s,(side*.048,0,.426),(1,0,0),.0175,.023,.004,steel,elbow)
    cylinder('Elbow_hub_'+s,(side*.049,0,.426),(side*.052,0,.426),.017,graphite,elbow)
    ring('Elbow_hub_engraving_'+s,(side*.053,0,.426),(1,0,0),.0115,.012,.0005,edge,elbow,48)
    for k in range(3):
        a=k*math.tau/3;screw('Elbow_'+s+'_cap_bolt_'+str(k),(side*.054,.014*math.sin(a),.426+.014*math.cos(a)),(side,0,0),elbow,.00135)
cylinder('Elbow_central_rotor',(-.017,0,.426),(.017,0,.426),.029,graphite,elbow)
ring('Elbow_center_gold_band',(0,0,.426),(1,0,0),.0275,.030,.011,gold,elbow)

# Forearm skeleton with an open side channel and a removable rear service cover.
patch('Forearm_structural_spine',[(.399,-.018,.018,.012,.008),(.371,-.024,.024,.020,.012),(.328,-.023,.023,.019,.011),(.239,-.015,.015,.016,.009),(.209,-.012,.012,.012,.007)],graphite,elbow,.018,.002,True)
for side in [-1,1]:
    cylinder('Forearm_titanium_rail_'+str(side),(side*.017,.003,.221),(side*.032,.003,.378),.0058,steel,elbow)
    cylinder('Forearm_power_cell_'+str(side),(side*.016,.004,.262),(side*.022,.005,.342),.009,graphite,elbow)
    cylinder('Forearm_power_gland_'+str(side),(side*.021,.005,.340),(side*.023,.005,.354),.0105,gold,elbow)
    cylinder('Forearm_elbow_rod_'+str(side),(side*.023,.005,.351),(side*.027,.002,.390),.0054,steel,elbow)
    tube('Forearm_side_cable_'+str(side),[(side*.027,.014,.393),(side*.038,.020,.368),(side*.035,.022,.326),(side*.026,.020,.281),(side*.018,.015,.221)],.0035,graphite,elbow)
    rows=[(.401,.023,.034,-.017,-.007),(.381,.017,.045,-.033,-.015),(.351,.005,.043,-.044,-.020),(.310,.004,.035,-.043,-.020),(.257,.005,.026,-.037,-.017),(.216,.005,.017,-.028,-.016)]
    if side<0: rows=[(z,-r,-l,c,e) for z,l,r,c,e in rows]
    patch('Forearm_swept_front_armor_'+str(side),rows,ivory,elbow,.0035,.0016)
    arc_shell('Forearm_lateral_blade_'+str(side),[(.382,.043,.029),(.363,.048,.036),(.333,.041,.035),(.287,.031,.028),(.246,.025,.023),(.216,.017,.019)],side*62,side*115,ivory,elbow,.003)
    tube('Forearm_gold_outer_reveal_'+str(side),[(side*.042,-.019,.372),(side*.042,-.024,.351),(side*.034,-.023,.310),(side*.025,-.020,.265),(side*.019,-.019,.235)],.0010,gold,elbow)
    screw('Forearm_shoulder_bolt_'+str(side),(side*.029,-.031,.374),(0,-1,0),elbow,.0016)
    screw('Forearm_wrist_bolt_'+str(side),(side*.013,-.028,.230),(0,-1,0),elbow,.0014)

patch('Forearm_front_keel',[(.348,-.005,.005,-.046,-.041),(.324,-.011,.011,-.048,-.042),(.246,-.010,.010,-.040,-.034),(.215,-.008,.008,-.031,-.025)],ivory,elbow,.003,.001)
patch('Forearm_front_recess',[(.318,-.0035,.0035,-.0497,-.049),(.277,-.0035,.0035,-.0448,-.044)],black,elbow,.0008,.001)
tube('Forearm_gold_recess_edge',[(.0047,-.050,.318),(.0047,-.047,.298),(.0047,-.044,.277)],.00065,gold,elbow)
tube('Forearm_front_indicator',[(0,-.0507,.310),(0,-.0469,.287)],.0010,cyan,elbow)

patch('Service_cover_graphite',[(.366,-.019,.019,.037,.026),(.348,-.026,.026,.042,.030),(.302,-.021,.021,.040,.029),(.246,-.015,.015,.031,.022),(.236,-.010,.010,.026,.020)],graphite,cover,.003,.0014,True)
patch('Service_cover_center_inset',[(.350,-.014,.014,.0435,.040),(.314,-.012,.012,.043,.039),(.256,-.009,.009,.034,.030)],black,cover,.001,.0008,True)
for i in range(10):
    z=.320+i*.0027
    tube('Service_cover_vent_%02d'%i,[(-.010,.044,z),(.010,.044,z)],.00055,edge,cover)
tube('Service_cover_status_light',[(0,.040,.267),(0,.044,.305)],.0016,cyan,cover)
for side in [-1,1]:
    for z,x,y in [(.351,.019,.037),(.305,.016,.036),(.249,.010,.029)]:
        screw('Service_cover_screw_%s_%s'%(side,int(z*1000)),(side*x,y+.003,z),(0,1,0),cover,.0015)

# Wrist: concentric collar, exposed knuckle gimbal and an explicit hand pivot.
cylinder('Wrist_upper_mount',(0,0,.207),(0,0,.217),.019,graphite,elbow)
ring('Wrist_upper_silver_collar',(0,0,.207),(0,0,1),.014,.023,.008,steel,elbow)
cylinder('Wrist_gimbal_axle',(-.020,0,.193),(.020,0,.193),.012,graphite,elbow)
for side in [-1,1]:
    ring('Wrist_side_ring_'+str(side),(side*.020,0,.193),(1,0,0),.006,.010,.004,gold,elbow)
cylinder('Wrist_rotating_stem',(0,0,.172),(0,0,.193),.014,steel,wrist)
ring('Wrist_gold_lock',(0,0,.178),(0,0,1),.0135,.020,.007,gold,wrist)
ring('Wrist_dorsal_fairing',(0,0,.171),(0,0,1),.015,.023,.005,graphite,wrist)

# Hand: a broad padded palm, divided ivory metacarpals, five independent chains.
patch('Palm_graphite_body',[(.169,-.021,.021,.009,.003),(.153,-.032,.032,.015,.004),(.126,-.041,.040,.015,.005),(.106,-.038,.038,.010,.003)],graphite,wrist,.020,.0035,True)
patch('Palm_dorsal_main_plate',[(.166,-.018,.018,-.015,-.009),(.151,-.028,.028,-.021,-.013),(.122,-.030,.028,-.023,-.014),(.110,-.024,.025,-.020,-.014)],ivory,wrist,.003,.0017)
for side in [-1,1]:
    patch('Palm_edge_plate_'+str(side),[(.155,side*.025-.007,side*.025+.007,-.013,-.007),(.137,side*.034-.007,side*.034+.007,-.016,-.006),(.115,side*.032-.006,side*.032+.006,-.015,-.006)],ivory,wrist,.003,.0012)
    tube('Palm_gold_split_'+str(side),[(side*.021,-.019,.155),(side*.028,-.024,.126),(side*.024,-.022,.113)],.00075,gold,wrist)
    patch('Palm_grip_pad_'+str(side),[(.151,side*.016-.011,side*.016+.011,.019,.016),(.130,side*.021-.013,side*.021+.013,.024,.020),(.115,side*.020-.011,side*.020+.011,.019,.015)],rubber,wrist,.003,.002,True)
patch('Palm_center_grip',[(.146,-.011,.011,.024,.022),(.123,-.013,.013,.026,.024),(.112,-.008,.008,.020,.018)],rubber,wrist,.002,.002,True)

def finger_link(name,a,b,width,parent):
    a,b=Vector(a),Vector(b);d=(b-a).normalized();length=(b-a).length
    right=Vector((0,-1,0)).cross(d).normalized();front=d.cross(right).normalized()
    verts=[]
    rings=[(.13,.77),(.20,1.),(.75,.92),(.89,.67)]
    for t,w in rings:
        p=a+(b-a)*t
        for i in range(8):
            ang=i*math.tau/8+math.pi/8
            verts.append(tuple(p+right*math.cos(ang)*width*w/2+front*math.sin(ang)*width*.42*w))
    faces=[tuple(reversed(range(8))),tuple(range(24,32))]
    for j in range(3):
        for i in range(8):faces.append((j*8+i,j*8+(i+1)%8,(j+1)*8+(i+1)%8,(j+1)*8+i))
    mesh(name+'_structural_link',verts,faces,graphite,parent,.0007)
    verts=[]
    for t,w in [(.19,.70),(.29,.83),(.72,.75),(.87,.46)]:
        p=a+(b-a)*t+front*width*.42
        for k in [-1,0,1]:verts.append(tuple(p+right*k*width*w/2+front*(.001 if k==0 else -.0011)))
    faces=[]
    for j in range(3):
        for i in range(2):q=j*3+i;faces.append((q,q+1,q+4,q+3))
    ob=mesh(name+'_ivory_phalanx',verts,faces,ivory,parent,0)
    mo=ob.modifiers.new('Finger plate thickness','SOLIDIFY');mo.thickness=.0015
    mo=ob.modifiers.new('Finger bevel','BEVEL');mo.width=.0007;mo.segments=3
    ob.modifiers.new('Finger normals','WEIGHTED_NORMAL')
    # Back grip is also a crafted plate, distinct from the dorsal armor.
    verts=[]
    for t,w in [(.25,.63),(.75,.60)]:
        p=a+(b-a)*t-front*width*.43
        verts.extend([tuple(p-right*width*w/2),tuple(p+right*width*w/2)])
    ob=mesh(name+'_palm_grip',verts,[(0,1,3,2)],rubber,parent,0)
    mo=ob.modifiers.new('Grip thickness','SOLIDIFY');mo.thickness=.0011

def digit(name,points,width):
    parent=wrist
    for i in range(len(points)-1):
        a,b=Vector(points[i]),Vector(points[i+1])
        pv=pivot(name+'_J%d'%i,a,parent);pv['digit']=name;pv['segment']=i
        finger_link(name+'_S%d'%i,a,b,width*(1-.10*i),pv)
        r=width*.46
        cylinder(name+'_knuckle_%d'%i,tuple(a+Vector((-width*.56,0,0))),tuple(a+Vector((width*.56,0,0))),r,graphite,pv,32)
        for side in [-1,1]:
            ring(name+'_gold_bearing_%d_%d'%(i,side),tuple(a+Vector((side*width*.57,0,0))),(1,0,0),r*.45,r*.85,.0015,gold,pv,24)
        if i==0:
            cylinder(name+'_knuckle_status',tuple(a+Vector((0,-r-.0005,0))),tuple(a+Vector((0,-r-.0010,0))),r*.40,cyan,pv,24)
        parent=pv

digit('INDEX',[(-.030,0,.106),(-.032,.001,.068),(-.034,.004,.040),(-.034,.007,.019)],.0145)
digit('MIDDLE',[(-.009,0,.105),(-.010,.000,.063),(-.010,.003,.032),(-.010,.007,.008)],.0150)
digit('RING',[(.013,0,.106),(.014,.001,.067),(.015,.004,.039),(.015,.008,.017)],.0140)
digit('LITTLE',[(.033,.001,.109),(.037,.003,.077),(.039,.006,.054),(.040,.010,.035)],.0122)
digit('THUMB',[(-.036,0,.147),(-.055,-.001,.124),(-.069,.001,.095),(-.074,.006,.073)],.0170)

# The only cables are segment-local. No rigid hydraulic bridge crosses the elbow.
root['linkage_limit']='Segment-local static hydraulics; no dynamic linkage or tendon system. Rotatable bearings are rigid-part pivots.'
root['nominal_source_length_m']=.760
root['neutral_pose']='extended elbow; modest thumb spread; natural slight finger fan; no human body'
root['model_scope']='editable multi-part prototype; no skin rig, physics, UV bake or engine validation'
scene.render.film_transparent=False
scene.view_settings.view_transform='AgX'
bpy.context.view_layer.update()

out=Path(REFAS_OUTPUT_DIR)
objects=[o for o in scene.objects if o.get('aurix_asset')]
stats={'asset_objects':len(objects),'mesh_objects':sum(o.type=='MESH' for o in objects),
       'pivots':{o.name:{'parent':o.parent.name if o.parent else None,'world_origin':list(o.matrix_world.translation)} for o in objects if o.type=='EMPTY'},
       'frame':root['frame'],'inference':root['source_interpretation'],'linkage_limit':root['linkage_limit']}
(out/'authoring.json').write_text(json.dumps(stats,indent=2))
