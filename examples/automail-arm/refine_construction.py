"""Source-led construction refinement of the saved AURIX rigid-part prototype.

Existing joint matrices and hierarchy are preserved. New world-space section
meshes are converted into the existing object's local coordinates. Hidden
depths and service routing are explicitly inferred from the concept sheet.
"""
import bpy
import bmesh
import json
import math
from pathlib import Path
from mathutils import Vector

scene = bpy.context.scene
changed = set(); added = set(); material_assignment_changes = {}
ivory = bpy.data.materials['Ivory • ceramic titanium armor']
graphite = bpy.data.materials['Graphite structural composite']
black = bpy.data.materials['Recess interiors']
rubber = bpy.data.materials['Palm and joint elastomer']
gold = bpy.data.materials['Anodized champagne gold']
steel = bpy.data.materials['Piston chrome']
edge = bpy.data.materials['Warm silver • machined bevels']
cyan = bpy.data.materials['Cool status glass']
palmbase = bpy.data.materials.get('Palm structural matte composite') or graphite


def mesh(name, verts, faces, material, parent=None, thickness=0, bevel=.0005,
         smooth=False, closed=False):
    ob = bpy.data.objects.get(name)
    if ob is None:
        ob = bpy.data.objects.new(name, bpy.data.meshes.new(name + '_initial')); scene.collection.objects.link(ob)
        ob['aurix_asset'] = True
        ob.parent = bpy.data.objects[parent]
        ob.matrix_parent_inverse = ob.parent.matrix_world.inverted()
        ob['construction_parent'] = parent
        added.add(name)
    else:
        changed.add(name)
    inv = ob.matrix_world.inverted()
    data = bpy.data.meshes.new(name + '_source_construction')
    data.from_pydata([inv @ Vector(v) for v in verts], [], faces); data.update()
    if closed:
        bm = bmesh.new(); bm.from_mesh(data)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces)); bm.to_mesh(data); bm.free()
    old = ob.data
    prior_materials=[m.name if m else None for m in old.materials] if old else []
    ob.data = data; data.materials.append(material)
    if name not in added and prior_materials != [material.name]:
        material_assignment_changes[name]={'before':prior_materials,'after':[material.name]}
    ob.modifiers.clear()
    for p in data.polygons: p.use_smooth = smooth
    if thickness:
        mod = ob.modifiers.new('Construction shell thickness', 'SOLIDIFY')
        mod.thickness = thickness; mod.offset = 0; mod.use_even_offset = True
    if bevel:
        mod = ob.modifiers.new('Manufactured edge break', 'BEVEL')
        mod.width = bevel; mod.segments = 3; mod.limit_method = 'ANGLE'
        mod.angle_limit = math.radians(28)
        if not smooth:
            mod = ob.modifiers.new('Weighted planar normals', 'WEIGHTED_NORMAL'); mod.keep_sharp = True
    if old and old.users == 0: bpy.data.meshes.remove(old)
    return ob


def sample(rows, steps=3):
    # Linear section transitions intentionally retain the source's panel breaks.
    out = []
    for a, b in zip(rows, rows[1:]):
        for k in range(steps):
            t = k / steps; out.append(tuple(x*(1-t)+y*t for x, y in zip(a, b)))
    return out + [rows[-1]]


def plate(name, rows, mat=ivory, parent=None, thickness=.0028, rear=False,
          bevel=.00065, ridge=.24, smooth=True):
    # z, left, right, left-y, right-y, center offset. A broad center facet and
    # distinct returning planes replace a uniformly inflated sine surface.
    ts = [0, .10, ridge, .5, 1-ridge, .90, 1]
    rings=[]
    for i in range(len(rows)-1):
        a,b,c,d=rows[max(0,i-1)],rows[i],rows[i+1],rows[min(len(rows)-1,i+2)]
        for k in range(4):
            t=k/4
            rings.append(tuple(.5*((2*v1)+(-v0+v2)*t+(2*v0-5*v1+4*v2-v3)*t*t+(-v0+3*v1-3*v2+v3)*t*t*t)
                               for v0,v1,v2,v3 in zip(a,b,c,d)))
    rings.append(rows[-1]); verts=[]
    for z, left, right, yl, yr, bulge in rings:
        for t in ts:
            h = min(t/ridge, (1-t)/ridge, 1)
            verts.append((left+(right-left)*t, yl*(1-t)+yr*t+bulge*h, z))
    faces=[]; n=len(ts)
    for j in range(len(rings)-1):
        for k in range(n-1):
            a=j*n+k; f=(a,a+n,a+n+1,a+1); faces.append(f[::-1] if rear else f)
    return mesh(name, verts, faces, mat, parent, thickness, bevel, smooth)


def tube(name, points, radius, mat, parent=None, sides=10):
    points=[Vector(p) for p in sample(points, 4)]; verts=[]
    for i, p in enumerate(points):
        tangent=(points[min(i+1,len(points)-1)]-points[max(0,i-1)]).normalized()
        u=tangent.cross(Vector((0,1,0)))
        if u.length<.001: u=tangent.cross(Vector((1,0,0)))
        u.normalize(); v=tangent.cross(u)
        for k in range(sides):
            angle=math.tau*k/sides; verts.append(tuple(p+radius*(u*math.cos(angle)+v*math.sin(angle))))
    faces=[tuple(reversed(range(sides))),tuple(range((len(points)-1)*sides,len(points)*sides))]
    for j in range(len(points)-1):
        for k in range(sides):
            a=j*sides+k; b=j*sides+(k+1)%sides; faces.append((a,b,b+sides,a+sides))
    return mesh(name,verts,faces,mat,parent,bevel=0,smooth=True,closed=True)


def spindle(name, a, b, profile, mat, parent=None, sides=32):
    a,b=Vector(a),Vector(b); axis=(b-a).normalized()
    u=axis.cross(Vector((0,1,0)))
    if u.length<.001: u=axis.cross(Vector((1,0,0)))
    u.normalize(); v=axis.cross(u); verts=[]
    for t,r in profile:
        p=a+(b-a)*t
        for k in range(sides):
            angle=math.tau*k/sides; verts.append(tuple(p+r*(u*math.cos(angle)+v*math.sin(angle))))
    faces=[tuple(reversed(range(sides))),tuple(range((len(profile)-1)*sides,len(profile)*sides))]
    for j in range(len(profile)-1):
        for k in range(sides):
            q=j*sides+k; w=j*sides+(k+1)%sides; faces.append((q,w,w+sides,q+sides))
    safe_bevel=min((b-a).length*.02,min(r for t,r in profile)*.04,.0002)
    return mesh(name,verts,faces,mat,parent,bevel=safe_bevel,smooth=True,closed=True)


def cylinder(name,a,b,r,mat,parent=None):
    return spindle(name,a,b,[(0,r*.93),(.05,r),(.95,r),(1,r*.93)],mat,parent)


def ring(name, center, axis, inner, outer, depth, mat, parent=None):
    center=Vector(center); axis=Vector(axis).normalized()
    u=axis.cross(Vector((0,0,1)))
    if u.length<.001: u=Vector((1,0,0))
    u.normalize(); v=axis.cross(u); n=40; verts=[]
    for d,r in [(-depth/2,inner),(-depth/2,outer),(depth/2,outer),(depth/2,inner)]:
        for k in range(n):
            a=math.tau*k/n; verts.append(tuple(center+axis*d+r*(u*math.cos(a)+v*math.sin(a))))
    faces=[]
    for j in range(4):
        for k in range(n): faces.append((j*n+k,j*n+(k+1)%n,((j+1)%4)*n+(k+1)%n,((j+1)%4)*n+k))
    return mesh(name,verts,faces,mat,parent,bevel=.00018,smooth=True,closed=True)


def offset_rows(rows, dx=.002, dy=.004):
    return [(z,l-dx,r+dx,yl+dy,yr+dy,b) for z,l,r,yl,yr,b in rows]


# SHOULDER: a faceted shield over a recessed structural carrier. Separate
# returning cheek caps leave actual gaps and retain the original socket.
crown=[(.742,-.018,.018,-.032,-.032,-.005),
       (.731,-.034,.034,-.038,-.038,-.014),
       (.711,-.040,.040,-.035,-.035,-.026),
       (.683,-.034,.035,-.030,-.030,-.027),
       (.653,-.026,.028,-.020,-.021,-.027),
       (.625,-.018,.021,-.012,-.014,-.022),
       (.614,-.013,.017,-.008,-.010,-.017)]
plate('Upper_crown_front',crown,thickness=.0035,bevel=.0008)
plate('Crown_recessed_carrier',offset_rows(crown,.003,.0045),graphite,'SHOULDER_PIVOT',.003,bevel=.0007)
plate('Crown_top_lock_plate',[(.752,-.016,.016,-.005,-.005,-.010),(.746,-.024,.024,-.018,-.018,-.009),
      (.741,-.020,.020,-.028,-.028,-.008)],ivory,'SHOULDER_PIVOT',.003,bevel=.0007)
plate('Upper_crown_rear',[(.750,-.016,.016,.016,.016,.006),(.738,-.022,.022,.028,.028,.012),
      (.714,-.022,.022,.032,.032,.014),(.689,-.017,.017,.025,.025,.012)],ivory,thickness=.003,rear=True)
for side in [-1,1]:
    rows=[(.741,.027,.040,-.018,-.004,-.004),(.731,.037,.053,-.032,-.018,-.005),
          (.711,.043,.057,-.044,-.034,-.004),(.691,.037,.052,-.044,-.037,-.003),
          (.677,.031,.043,-.040,-.034,-.002)]
    if side<0: rows=[(z,-r,-l,yr,yl,b) for z,l,r,yl,yr,b in rows]
    plate('Crown_side_cap_'+str(side),rows,thickness=.0032)
    plate('Crown_side_carrier_'+str(side),offset_rows(rows,.0025,.004),graphite,'SHOULDER_PIVOT',.0025)
    pts=[]
    for z,l,r,yl,yr,b in crown[1:-1]:
        t=.12 if side<0 else .88; h=min(t/.24,(1-t)/.24,1)
        pts.append((l+(r-l)*t,yl*(1-t)+yr*t+b*h-.0017,z))
    tube('Crown_inset_border_'+str(side),pts,.00045,black)
    tube('Crown_gold_pinstripe_'+str(side),[(side*.027,-.039,.735),(side*.035,-.047,.724),(side*.036,-.048,.713)],.00065,gold)
for name,y,z in [('Crown_A_mark',-.0655,.701),('Crown_AURIX',-.061,.682)]:
    ob=bpy.data.objects[name]; ob.location.y=y; ob.location.z=z; changed.add(name)
tube('Crown_gold_signature',[(.004,-.046,.646),(.004,-.034,.620)],.00065,gold)

# UPPER ARM: move the load bed toward the front to expose a coherent rear
# hydraulic assembly. Every component remains local to the shoulder segment.
plate('Upper_core_backbone',[(.652,-.012,.012,-.007,-.007,.002),(.621,-.014,.014,-.009,-.009,.002),
      (.506,-.010,.010,-.006,-.006,.002),(.456,-.014,.014,-.002,-.002,.001)],graphite,thickness=.008,rear=True)
spindle('Upper_primary_cylinder',(0,.023,.491),(0,.025,.573),[(0,.009),(.08,.0115),(.82,.0115),(1,.0105)],graphite)
cylinder('Upper_primary_rod',(0,.025,.568),(0,.025,.642),.006,steel)
cylinder('Upper_primary_gland',(0,.025,.569),(0,.025,.582),.013,gold)
cylinder('Upper_actuator_machined_sleeve',(0,.025,.539),(0,.025,.569),.0120,edge,'SHOULDER_PIVOT')
ring('Upper_actuator_lower_band',(0,.0235,.512),(0,0,1),.0108,.013,.006,graphite,'SHOULDER_PIVOT')
ring('Upper_actuator_upper_seal',(0,.025,.588),(0,0,1),.0056,.0085,.005,black,'SHOULDER_PIVOT')
plate('Upper_rear_rod_bridge',[(.646,-.014,.014,.020,.020,.003),(.637,-.023,.023,.021,.021,.003),
      (.628,-.032,.032,.020,.020,.003)],graphite,'SHOULDER_PIVOT',.005,rear=True)
for side in [-1,1]:
    x=side*.024
    cylinder('Upper_side_actuator_'+str(side),(x,.016,.486),(x,.022,.559),.0072,graphite)
    cylinder('Upper_side_rod_'+str(side),(x,.022,.555),(side*.031,.023,.621),.0043,steel)
    cylinder('Upper_side_gland_'+str(side),(x,.022,.555),(x,.023,.566),.008,gold)
    tube('Upper_return_pipe_'+str(side),[(side*.028,.021,.628),(side*.038,.027,.609),
         (side*.040,.030,.589),(side*.031,.039,.548),(side*.024,.033,.514),(side*.021,.024,.478)],.0030,steel,'SHOULDER_PIVOT')
    tube('Upper_hose_return_'+str(side),[(side*.014,.023,.629),(side*.018,.031,.611),
         (side*.020,.034,.586),(side*.017,.039,.539),(side*.014,.031,.495)],.0022,black,'SHOULDER_PIVOT')
    ring('Upper_return_pipe_mount_'+str(side),(side*.029,.022,.628),(1,0,0),.0027,.0053,.006,graphite,'SHOULDER_PIVOT')
    tube('Upper_gold_conduit_'+str(side),[(side*.044,-.010,.574),(side*.040,-.008,.552),(side*.029,-.010,.528)],.0010,gold)
    rows=[(.611,.024,.035,-.018,-.005,-.003),(.594,.019,.044,-.025,-.003,-.008),
          (.573,.022,.046,-.028,-.001,-.009),(.551,.023,.040,-.024,.003,-.006),
          (.523,.019,.032,-.023,.004,-.005),(.482,.017,.028,-.012,.005,-.003)]
    if side<0: rows=[(z,-r,-l,yr,yl,b) for z,l,r,yl,yr,b in rows]
    plate('Upper_sculpted_blade_'+str(side),rows,thickness=.003)
    plate('Upper_blade_carrier_'+str(side),offset_rows(rows,.002,.004),graphite,'SHOULDER_PIVOT',.0025)
    rows=[(.590,.045,.050,.001,.014,-.002),(.572,.045,.051,.005,.019,-.003),
          (.551,.040,.046,.009,.022,-.002),(.521,.030,.036,.006,.018,-.002),(.495,.026,.031,.004,.013,-.001)]
    if side<0: rows=[(z,-r,-l,yr,yl,b) for z,l,r,yl,yr,b in rows]
    plate('Upper_outer_wrap_'+str(side),rows,thickness=.0026,bevel=.0006)

# FOREARM: the primary ridge panels, recessed carriers, and shorter rear
# return plates are independent thickness-bearing layers with open channels.
for side in [-1,1]:
    rows=[(.396,.023,.033,-.017,-.003,-.002),(.380,.014,.044,-.028,.001,-.006),
          (.360,.006,.046,-.039,-.004,-.007),(.338,.005,.042,-.043,-.011,-.006),
          (.315,.008,.035,-.040,-.010,-.006),(.284,.010,.030,-.036,-.008,-.005),
          (.252,.008,.024,-.031,-.005,-.004),(.219,.006,.017,-.024,-.004,-.003)]
    if side<0:
        rows=[(z-(.002 if z>.32 else 0),-r,-l,yr,yl,b) for z,l,r,yl,yr,b in rows]
    plate('Forearm_swept_front_armor_'+str(side),rows,thickness=.0032,bevel=.0007,ridge=.28)
    plate('Forearm_recessed_carrier_'+str(side),offset_rows(rows,.0025,.0045),graphite,'ELBOW_PIVOT',.0026)
    pts=[]
    for z,l,r,yl,yr,b in rows[1:-1]:
        t=.12 if side<0 else .88; h=min(t/.28,(1-t)/.28,1)
        pts.append((l+(r-l)*t,yl*(1-t)+yr*t+b*h-.0015,z))
    tube('Forearm_gold_outer_reveal_'+str(side),pts,.00055,gold)
    rows=[(.371,.045,.050,.009,.021,.001),(.355,.048,.052,.010,.031,.0015),
          (.336,.043,.047,.013,.033,.0015),(.306,.034,.039,.012,.029,.001),
          (.276,.028,.033,.010,.025,.001),(.245,.023,.027,.007,.019,.0005)]
    if side<0: rows=[(z,-r,-l,yr,yl,b) for z,l,r,yl,yr,b in rows]
    plate('Forearm_lateral_blade_'+str(side),rows,ivory,thickness=.0027,rear=True,bevel=.0006)
    plate('Forearm_lateral_underlayer_'+str(side),offset_rows(rows,.002,-.003),black,'ELBOW_PIVOT',.002,rear=True)
    tube('Forearm_side_cable_'+str(side),[(side*.028,.014,.390),(side*.039,.022,.370),
         (side*.039,.026,.340),(side*.032,.024,.302),(side*.022,.020,.267),(side*.018,.014,.224)],.0032,graphite)
    tube('Forearm_channel_hydraulic_'+str(side),[(side*.032,.002,.376),(side*.040,.002,.350),
         (side*.036,.003,.319),(side*.027,.005,.276),(side*.020,.006,.235)],.0024,steel,'ELBOW_PIVOT')
plate('Forearm_front_keel',[(.347,-.004,.005,-.039,-.040,-.002),(.323,-.007,.008,-.044,-.044,-.004),
      (.284,-.007,.008,-.039,-.039,-.004),(.247,-.007,.008,-.033,-.033,-.003),
      (.215,-.006,.007,-.026,-.026,-.002)],ivory,thickness=.0026,bevel=.0006)
plate('Forearm_front_recess',[(.316,-.0028,.0028,-.0488,-.0488,0),(.280,-.0028,.0028,-.0436,-.0436,0)],black,thickness=.0006,bevel=.0001)
tube('Forearm_gold_recess_edge',[(.0038,-.049,.315),(.0038,-.0464,.298),(.0038,-.0437,.280)],.0004,gold)
tube('Forearm_front_indicator',[(0,-.0494,.310),(0,-.0454,.286)],.00075,cyan)

# SERVICE BAY: an actual recessed bed and frame, with paired cartridges.
# The cover remains a separate +Y-editable subtree; bay components do not move
# with it. The open diagnostic is a reversible pose, not a different model.
plate('Forearm_structural_spine',[(.398,-.016,.016,.009,.009,.001),(.372,-.025,.025,.009,.009,.001),
      (.331,-.023,.023,.007,.007,.001),(.260,-.016,.016,.006,.006,.001),
      (.219,-.012,.012,.007,.007,.001)],black,thickness=.005,rear=True)
outline=[(-.018,.366),(-.029,.352),(-.027,.324),(-.019,.258),(-.012,.239),
         (.012,.239),(.019,.258),(.027,.324),(.029,.352),(.018,.366)]
def bay_frame(name, inset, width, depth, mat):
    outer=[]; inner=[]
    for x,z in outline:
        y=.029+.006*max(0,min(1,(z-.24)/.12))
        outer.append((x,y+depth,z))
        inner.append((x-math.copysign(width,x),y+depth,z+(.004 if z<.26 else -.004 if z>.35 else 0)))
    verts=outer+inner; n=len(outer); faces=[]
    for i in range(n): faces.append((i,(i+1)%n,(i+1)%n+n,i+n))
    return mesh(name,verts,faces,mat,'ELBOW_PIVOT',thickness=inset,bevel=.0005)
bay_frame('Service_bay_structural_rim',.005,.004,0,graphite)
bay_frame('Service_bay_machined_lip',.001,.0018,.0021,edge)
for side in [-1,1]:
    x=side*.0107
    spindle('Forearm_power_cell_'+str(side),(x,.021,.258),(x,.024,.326),[(0,.0054),(.08,.007),(.84,.007),(1,.006)],graphite)
    cylinder('Forearm_power_gland_'+str(side),(x,.024,.324),(x,.024,.336),.0076,gold)
    cylinder('Forearm_elbow_rod_'+str(side),(x,.024,.333),(side*.012,.022,.360),.0037,steel)
    cylinder('Service_cartridge_sleeve_'+str(side),(x,.023,.299),(x,.024,.321),.00725,edge,'ELBOW_PIVOT')
    ring('Service_cartridge_lower_band_'+str(side),(x,.022,.275),(0,0,1),.0067,.008,.004,graphite,'ELBOW_PIVOT')
    ring('Service_cartridge_upper_band_'+str(side),(x,.023,.295),(0,0,1),.0067,.008,.003,black,'ELBOW_PIVOT')
    tube('Service_return_conduit_'+str(side),[(side*.020,.022,.349),(side*.022,.025,.332),
         (side*.020,.027,.304),(side*.016,.025,.277),(side*.012,.020,.253)],.0016,gold,'ELBOW_PIVOT')
plate('Service_lower_manifold',[(.263,-.016,.016,.020,.020,.004),(.250,-.012,.012,.017,.017,.003)],graphite,'ELBOW_PIVOT',.006,rear=True)
coverrows=[(.362,-.017,.017,.037,.037,.001),(.348,-.026,.026,.038,.038,.003),
      (.326,-.024,.024,.037,.037,.004),(.283,-.018,.018,.032,.032,.004),
      (.252,-.014,.014,.028,.028,.003),(.240,-.009,.009,.025,.025,.001)]
plate('Service_cover_graphite',coverrows,graphite,thickness=.0025,rear=True,bevel=.0006)
plate('Service_cover_center_inset',[(.348,-.015,.015,.041,.041,.0015),(.326,-.014,.014,.041,.041,.0015),
      (.286,-.010,.010,.036,.036,.001),(.256,-.007,.007,.0315,.0315,.0005)],black,thickness=.0012,rear=True,bevel=.00045)
# Historical vent objects now form the inner cover's structural ribs. Their
# identity stays editable and every one remains attached to SERVICE_COVER.
for i in range(10):
    z=.259+i*.0095; f=(z-.24)/.12; half=.010+.010*f; y=.028+.010*f
    tube('Service_cover_vent_%02d'%i,[(-half,y,z),(-half*.75,y+.001,z+.001),
         (half*.75,y+.001,z+.001),(half,y,z)],.0007,graphite)
tube('Service_cover_status_light',[(0,.0343,.268),(0,.040,.308)],.0012,cyan)
for side in [-1,1]:
    for z,x,y in [(.351,.019,.039),(.305,.016,.037),(.249,.010,.029)]:
        base='Service_cover_screw_%s_%s'%(side,int(z*1000))
        cylinder(base,(side*x,y,z),(side*x,y+.0012,z),.0015,steel)
        cylinder(base+'_hex_socket',(side*x,y+.00125,z),(side*x,y+.00145,z),.00065,black)

# PALM: a restrained, angular contact bed, distinct thenar/outer pads and four
# separated metacarpal plates. Existing wrist and all digit pivots are retained.
palmrows=[(.169,.020,.009,.009),(.156,.029,.013,.012),(.139,.037,.016,.014),
          (.120,.040,.015,.014),(.108,.035,.009,.010)]
cross=[(-1,0),(-.92,-.62),(-.62,-1),(.62,-1),(.92,-.62),(1,0),(.92,.68),(.62,1),(-.62,1),(-.92,.68)]
verts=[]
for z,rx,front,back in sample(palmrows,3):
    for x,y in cross: verts.append((x*rx,y*(back if y>0 else front),z))
n=len(cross); sections=len(verts)//n
faces=[tuple(reversed(range(n))),tuple(range((sections-1)*n,sections*n))]
for j in range(sections-1):
    for k in range(n): faces.append((j*n+k,j*n+(k+1)%n,(j+1)*n+(k+1)%n,(j+1)*n+k))
mesh('Palm_graphite_body',verts,faces,palmbase,bevel=.001,smooth=True,closed=True)
plate('Palm_dorsal_main_plate',[(.164,-.010,.004,-.011,-.011,-.003),(.151,-.014,.006,-.015,-.015,-.003),
      (.132,-.015,.007,-.018,-.018,-.003),(.114,-.013,.007,-.015,-.015,-.002)],ivory,thickness=.0022)
plate('Palm_dorsal_ring_plate',[(.159,.008,.018,-.011,-.009,-.003),(.143,.010,.026,-.017,-.013,-.003),
      (.124,.010,.028,-.018,-.014,-.003),(.114,.011,.025,-.015,-.012,-.002)],ivory,'WRIST_PIVOT',.0022)
plate('Palm_edge_plate_-1',[(.158,-.025,-.015,-.008,-.012,-.002),(.142,-.035,-.018,-.012,-.017,-.003),
      (.123,-.038,-.018,-.010,-.017,-.003),(.113,-.034,-.018,-.008,-.014,-.002)],ivory,thickness=.0022)
plate('Palm_edge_plate_1',[(.150,.025,.031,-.010,-.005,-.002),(.134,.029,.039,-.013,-.004,-.002),
      (.116,.028,.037,-.011,-.003,-.001)],ivory,thickness=.0021)
tube('Palm_gold_split_-1',[(-.016,-.015,.153),(-.0165,-.021,.133),(-.016,-.018,.115)],.00045,gold)
tube('Palm_gold_split_1',[(.008,-.014,.155),(.0085,-.021,.133),(.009,-.018,.115)],.00045,gold)
thenar=[(.152,-.027,-.018,.012,.014,.0005),(.141,-.034,-.012,.013,.016,.001),
        (.129,-.033,-.010,.012,.017,.001),(.117,-.027,-.015,.011,.014,.0007)]
outer=[(.143,.025,.034,.014,.011,.0005),(.132,.020,.037,.016,.011,.0008),
       (.119,.023,.034,.013,.009,.0005),(.113,.025,.030,.010,.008,.0003)]
center=[(.144,-.007,.015,.015,.014,.001),(.134,-.009,.019,.016,.014,.001),
        (.122,-.005,.016,.015,.012,.001),(.115,.001,.012,.011,.010,.0004)]
plate('Palm_grip_pad_-1',thenar,rubber,thickness=.0024,rear=True,bevel=.001)
plate('Palm_grip_pad_1',outer,rubber,thickness=.0022,rear=True,bevel=.0008)
plate('Palm_center_grip',center,rubber,thickness=.002,rear=True,bevel=.0008)
tube('Palm_thenar_pad_seam',[(-.027,.015,.145),(-.029,.0155,.134),(-.025,.015,.123)],.00035,graphite,'WRIST_PIVOT')
tube('Palm_center_pad_seam',[(-.003,.018,.138),(.012,.017,.138),(.014,.0158,.127),(.003,.0165,.122)],.00035,graphite,'WRIST_PIVOT')

# DIGITS: segment-specific widths, creases, tips and compact bearings. All
# original pivot origins are unchanged, including the source's finger fan.
digit_data={
 'INDEX':([(-.030,0,.106),(-.032,.001,.068),(-.034,.004,.040),(-.034,.007,.019)],.0145),
 'MIDDLE':([(-.009,0,.105),(-.010,0,.063),(-.010,.003,.032),(-.010,.007,.008)],.0150),
 'RING':([(.013,0,.106),(.014,.001,.067),(.015,.004,.039),(.015,.008,.017)],.0140),
 'LITTLE':([(.033,.001,.109),(.037,.003,.077),(.039,.006,.054),(.040,.010,.035)],.0122),
 'THUMB':([(-.036,0,.147),(-.055,-.001,.124),(-.069,.001,.095),(-.074,.006,.073)],.0170)}
for digit,(points,width0) in digit_data.items():
    for seg in range(3):
        a,b=Vector(points[seg]),Vector(points[seg+1]); direction=(b-a).normalized()
        right=Vector((0,-1,0)).cross(direction).normalized(); front=direction.cross(right).normalized()
        width=width0*(1-.13*seg); parent=digit+'_J'+str(seg); prefix=digit+'_S'+str(seg)
        profiles=[[(.10,.58),(.24,.83),(.64,.75),(.88,.48)],
                  [(.13,.55),(.29,.76),(.70,.66),(.88,.43)],
                  [(.12,.52),(.28,.71),(.69,.60),(.91,.42),(.98,.26)]][seg]
        verts=[]
        corners=[(-1,-.50),(-.72,-1),(.72,-1),(1,-.50),(1,.50),(.72,1),(-.72,1),(-1,.50)]
        for t,w in profiles:
            p=a+(b-a)*t
            for x,y in corners: verts.append(tuple(p+right*x*width*w/2+front*y*width*.25*w))
        n=8; faces=[tuple(reversed(range(n))),tuple(range((len(profiles)-1)*n,len(profiles)*n))]
        for j in range(len(profiles)-1):
            for k in range(n): faces.append((j*n+k,j*n+(k+1)%n,(j+1)*n+(k+1)%n,(j+1)*n+k))
        mesh(prefix+'_structural_link',verts,faces,graphite,bevel=.00055,closed=True)
        dorsal=[[(.16,.58),(.28,.92),(.62,.82),(.84,.58)],
                [(.19,.63),(.32,.84),(.71,.67),(.87,.39)],
                [(.17,.60),(.31,.80),(.65,.68),(.89,.48),(.98,.32)]][seg]
        verts=[]
        for t,w in dorsal:
            p=a+(b-a)*t+front*width*(.31 if seg<2 else .29)
            for s,h in [(-1,-.001),(-.62,.0006),(.62,.0006),(1,-.001)]:
                verts.append(tuple(p+right*s*width*w/2+front*h))
        faces=[]
        for j in range(len(dorsal)-1):
            for k in range(3): q=j*4+k; faces.append((q,q+1,q+5,q+4))
        mesh(prefix+'_ivory_phalanx',verts,faces,ivory,thickness=.00135,bevel=.00065,smooth=True)
        grip=[(.22,.52),(.40,.61),(.71,.47),(.88,.25)] if seg<2 else [(.22,.49),(.47,.59),(.77,.39),(.94,.18)]
        verts=[]
        for t,w in grip:
            p=a+(b-a)*t-front*width*.25
            for s,h in [(-1,0),(0,-.0007),(1,0)]: verts.append(tuple(p+right*s*width*w/2+front*h))
        faces=[]
        for j in range(len(grip)-1):
            for k in range(2): q=j*3+k; faces.append((q+3,q+4,q+1,q))
        mesh(prefix+'_palm_grip',verts,faces,rubber,thickness=.0012,bevel=.00045)
        radius=width0*[.39,.34,.30][seg]
        cylinder(digit+'_knuckle_'+str(seg),a+Vector((-width*.40,0,0)),a+Vector((width*.40,0,0)),radius,graphite)
        for side in [-1,1]:
            ring(digit+'_gold_bearing_%d_%d'%(seg,side),a+Vector((side*width*.43,0,0)),(1,0,0),radius*.58,radius*.86,.0011,gold)
        if seg==0:
            cylinder(digit+'_knuckle_status',a+front*(radius+.0002),a+front*(radius+.0010),radius*.36,cyan)
        if seg==0:
            p0=a+(b-a)*.30-right*width*.34; p1=a+(b-a)*.68-right*width*.29
            tube(prefix+'_side_tendon_guide',[p0,p1],.0007,edge,parent)

bpy.context.view_layer.update()
Path(REFAS_OUTPUT_DIR,'construction-report.json').write_text(json.dumps({
    'changed_existing_objects':sorted(changed), 'added_objects':sorted(added),
    'added_object_parents':{n:bpy.data.objects[n].parent.name for n in sorted(added)},
    'material_assignment_changes':material_assignment_changes,
    'preserved':'All original joint origins, object transforms except Crown markings, hierarchy, source dimensions and service-cover edit normal/pivot. Existing material datablocks are unchanged.',
    'construction':'Faceted section shells and recessed structural carriers; open rear load bed; paired recessed service cartridges; differentiated proximal/middle/distal links and compact bearings.',
    'service_cover':'Neutral cover remains closed. Paired open comparison translates the original SERVICE_COVER subtree +95 mm local X, +15 mm local Y and rotates local Z 125 degrees; separate validation applies only the required +3 mm local Y edit.',
    'inference':'Panel depths, frame thicknesses, service internals and segment-local hydraulic routing are designed from the uncalibrated source; no physical performance or dynamic linkage claim.',
    'readiness':'Editable rigid-part prototype. No continuous collision, skin/UV/LOD/bake or engine readiness claim.'
},indent=2)+'\n')
