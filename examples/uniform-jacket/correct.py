import bpy, math, json
from mathutils import Vector
from math import sin,cos,pi
axis0=Vector((.258,-.018,-.966)).normalized()
def old_point(side,s,ang,r):
 ax=Vector((side*axis0.x,axis0.y,axis0.z));u=Vector((side*.966,0,.258)).normalized();v=ax.cross(u).normalized()
 centre=Vector((side*.19,0,.39))+ax*s;centre.y+=-.007*sin(pi*s/.58)**2
 return centre+u*(r*cos(ang))+v*(r*.96*sin(ang))
def cap_point(side,ang):
 return Vector((side*(.160+.030*max(0,cos(ang))),-.053*sin(ang),.330+.075*cos(ang)))
steps=[0,.006,.025,.05,.09,.14,.20,.26,.31,.36,.42,.48,.52,.55,.575,.58]
for side in [-1,1]:
 pre='L' if side==1 else 'R';ob=bpy.data.objects[pre+' Sleeve | shaped open tube']
 for k,s in enumerate(steps):
  if s>=.09:continue
  mix=s/.09
  for j in range(40):
   vert=ob.data.vertices[k*40+j];vert.co=cap_point(side,2*pi*j/40).lerp(vert.co,mix)
 ob.data.update()
 # Replace only the seam geometry, keeping a sewn boundary on the rebuilt cap.
 old=bpy.data.objects.get(pre+' Sleeve | sewn shoulder cap')
 if old:bpy.data.objects.remove(old,do_unlink=True)
 cu=bpy.data.curves.new(pre+' shoulder seam revised','CURVE');cu.dimensions='3D';cu.bevel_depth=.0007;cu.bevel_resolution=2
 sp=cu.splines.new('POLY');sp.points.add(63);sp.use_cyclic_u=True
 for j,p in enumerate(sp.points):p.co=(*cap_point(side,2*pi*j/64),1)
 ob=bpy.data.objects.new(pre+' Sleeve | sewn shoulder cap',cu);bpy.context.scene.collection.objects.link(ob);ob.data.materials.append(bpy.data.materials['Seams | tonal thread'])
 bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob;bpy.ops.object.convert(target='MESH')
# Keep the mesh and editable shader, reduce the high grazing sheen apparent in review.
mat=bpy.data.materials['Main | charcoal woven wool'];p=mat.node_tree.nodes.get('Principled BSDF')
p.inputs['Sheen Weight'].default_value=.025;p.inputs['Specular IOR Level'].default_value=.22;p.inputs['Roughness'].default_value=.63
p.inputs['Base Color'].default_value=(.009,.009,.013,1);mat.diffuse_color=(.009,.009,.013,1)
# Put the embroidered shield above, rather than within, the upper sleeve.
for ob in bpy.context.scene.objects:
 if ob.name.startswith('L Ornament | upper sleeve shield'):ob.location+=Vector((.016,-.013,0))
# Button/fabric changes are part of the one allowed whole-candidate visual correction.
bpy.context.scene['visual_correction']='Form vertical sleeve caps at the armholes; expose upper sleeve shield; reduce overbright wool sheen.'
