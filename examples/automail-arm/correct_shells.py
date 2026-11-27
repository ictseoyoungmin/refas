"""Focused revision after full first-candidate review.

The side armor concealed too much of the mechanical negative space, and the
large shoulder rim read as a flat silver disc. Re-profile those existing meshes,
retain the complete core/hand, and lift inset markings clear of the shell.
"""
import bpy,math,json
from pathlib import Path

changes=[]
for prefix,rows,angles in [
 ('Forearm_lateral_blade_',[(.382,.043,.029),(.363,.048,.036),(.333,.041,.035),(.287,.031,.028),(.246,.025,.023),(.216,.017,.019)],(54,89)),
 ('Upper_outer_wrap_',[(.591,.045,.023),(.575,.051,.029),(.548,.048,.029),(.514,.037,.023),(.482,.030,.020)],(58,106))
]:
    for side in [-1,1]:
        ob=bpy.data.objects[prefix+str(side)]
        for j,(z,rx,ry) in enumerate(rows):
            for i in range(9):
                a=math.radians(side*(angles[0]+(angles[1]-angles[0])*i/8))
                ob.data.vertices[j*9+i].co=(rx*math.sin(a),-ry*math.cos(a),z)
        ob.data.update();changes.append(ob.name)

for side,s in [(-1,'L'),(1,'R')]:
    ob=bpy.data.objects['Shoulder_'+s+'_titanium_flange']
    ob.data.materials[0]=bpy.data.materials['Graphite structural composite']
    rim=ob.copy();rim.data=ob.data.copy();rim.name='Shoulder_'+s+'_narrow_machined_rim'
    bpy.context.scene.collection.objects.link(rim)
    for v in rim.data.vertices:
        x,y,z=v.co;dy=y;dz=z-.690;r=math.hypot(dy,dz)
        rr=.049 if r<.044 else .051
        v.co=(x+side*.002,dy*rr/r,.690+dz*rr/r)
    rim.data.materials[0]=bpy.data.materials['Warm silver • machined bevels']
    changes.extend([ob.name,rim.name])

for name in ['Crown_A_mark','Crown_AURIX']:
    ob=bpy.data.objects[name];ob.location.y-=.004;changes.append(name)

rows=[(.751,-.020,.020,-.024,-.016),(.740,-.037,.037,-.043,-.022),(.715,-.047,.047,-.054,-.026),(.674,-.038,.037,-.056,-.030),(.637,-.026,.029,-.047,-.024),(.602,-.017,.021,-.036,-.019)]
def shell_y(x,z):
    for a,b in zip(rows,rows[1:]):
        if b[0]<=z<=a[0]:
            t=(z-a[0])/(b[0]-a[0]);p=[a[i]+(b[i]-a[i])*t for i in range(5)]
            u=(x-p[1])/(p[2]-p[1]);return p[3]+(p[4]-p[3])*abs(2*u-1)**1.7-.0033
    raise ValueError(z)

for side in [-1,1]:
    coords=[(side*.021,.741),(side*.036,.716),(side*.029,.675),(side*.020,.638),(side*.012,.614)]
    cu=bpy.data.curves.new('Shoulder_seam_path','CURVE');cu.dimensions='3D';cu.bevel_depth=.00065;cu.bevel_resolution=2
    sp=cu.splines.new('POLY');sp.points.add(len(coords)-1)
    for p,(x,z) in zip(sp.points,coords):p.co=(x,shell_y(x,z),z,1)
    ob=bpy.data.objects.new('Crown_inset_border_'+str(side),cu);bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(bpy.data.materials['AURIX carbon markings'])
    for o in bpy.context.selected_objects:o.select_set(False)
    ob.select_set(True);bpy.context.view_layer.objects.active=ob;bpy.ops.object.convert(target='MESH')
    ob=bpy.context.object;ob['aurix_asset']=True;ob.parent=bpy.data.objects['SHOULDER_PIVOT'];ob.matrix_parent_inverse=ob.parent.matrix_world.inverted();changes.append(ob.name)

bpy.context.view_layer.update()
Path(REFAS_OUTPUT_DIR,'correction.json').write_text(json.dumps({
 'reason':'First renders: broad side plates close the core channel; shoulder silver flange dominates the circular socket; markings partially intersect the shell.',
 'changed_objects':changes,
 'preserved_scope':'All actuator geometry, elbow/wrist mechanisms, service group and complete hand are untouched by this script.',
 'baseline_provenance':'The actual parent revision is recorded by the production revision manifest.'
},indent=2))
