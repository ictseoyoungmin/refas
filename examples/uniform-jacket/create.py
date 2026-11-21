import bpy, math, json, os, hashlib
from mathutils import Vector
from math import sin, cos, pi

bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for d in list(bpy.data.materials): bpy.data.materials.remove(d)
scene=bpy.context.scene; scene.unit_settings.system='METRIC'; scene.unit_settings.scale_length=1

def material(name,color,metal=0,rough=.5):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 return m
cloth=material('Main | charcoal woven wool',(.013,.013,.019),0,.56)
p=cloth.node_tree.nodes.get('Principled BSDF');p.inputs['Sheen Weight'].default_value=.28
n=cloth.node_tree.nodes.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=1450;n.inputs['Detail'].default_value=2
b=cloth.node_tree.nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=.12;b.inputs['Distance'].default_value=.00016
cloth.node_tree.links.new(n.outputs['Fac'],b.inputs['Height']);cloth.node_tree.links.new(b.outputs['Normal'],p.inputs['Normal'])
lining=material('Interior | black satin lining',(.007,.008,.012),0,.4)
trim=material('Piping | pale silver grey',(.70,.70,.74),0,.4)
metal=material('Hardware | brushed silver',(.57,.61,.68),.87,.26)
strapmat=material('Straps | charcoal twill',(.009,.01,.014),0,.42)
seammat=material('Seams | tonal thread',(.018,.019,.025),0,.7)

def mesh(name,verts,faces,mat=cloth,solid=0,subd=0):
 me=bpy.data.meshes.new(name+' mesh');me.from_pydata(verts,[],faces);me.update();ob=bpy.data.objects.new(name,me);scene.collection.objects.link(ob);ob.data.materials.append(mat)
 for p in me.polygons:p.use_smooth=True
 if subd:
  m=ob.modifiers.new('Tailored surface smoothing','SUBSURF');m.levels=subd;m.render_levels=subd
 if solid:
  ob.data.materials.append(lining);m=ob.modifiers.new('Fabric thickness and inner lining','SOLIDIFY');m.thickness=solid;m.offset=-1;m.material_offset=1;m.material_offset_rim=1
 return ob
def path(name,pts,r=.001,mat=trim,cyclic=False):
 cu=bpy.data.curves.new(name+' curve','CURVE');cu.dimensions='3D';cu.resolution_u=2;cu.bevel_depth=r;cu.bevel_resolution=2
 sp=cu.splines.new('POLY');sp.points.add(len(pts)-1)
 for p,v in zip(sp.points,pts):p.co=(*v,1)
 sp.use_cyclic_u=cyclic;ob=bpy.data.objects.new(name,cu);scene.collection.objects.link(ob);ob.data.materials.append(mat)
 return ob
def button(name,loc,r=.003,normal=(0,-1,0)):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=r,location=loc)
 ob=bpy.context.object;ob.name=name;ob.scale=(1,1,.35);ob.rotation_mode='QUATERNION';ob.rotation_quaternion=Vector((0,0,1)).rotation_difference(Vector(normal));ob.data.materials.append(metal)
 for p in ob.data.polygons:p.use_smooth=True
 return ob
def frame(name,c,u,v,w,h):
 c=Vector(c);u=Vector(u);v=Vector(v);rad=.0025
 pts=[]
 for xx,yy,ang in [(w/2-rad,h/2-rad,0),(-w/2+rad,h/2-rad,90),(-w/2+rad,-h/2+rad,180),(w/2-rad,-h/2+rad,270)]:
  for j in range(5):
   a=math.radians(ang+j*22.5);pts.append(tuple(c+u*(xx+rad*cos(a))+v*(yy+rad*sin(a))))
 # precise rounded frame ordered separately
 pts=[]
 for xx,yy,start in [(w/2-rad,h/2-rad,0),(-w/2+rad,h/2-rad,90),(-w/2+rad,-h/2+rad,180),(w/2-rad,-h/2+rad,270)]:
  for j in range(5):
   a=math.radians(start+j*22.5);pts.append(tuple(c+u*(xx+rad*cos(a))+v*(yy+rad*sin(a))))
 ob=path(name+' frame',pts,.00145,metal,True)
 path(name+' tongue',[tuple(c-u*w*.35),tuple(c+u*w*.36)],.0011,metal)
 return ob

# A single sewn torso shell with intentional upper armholes and an open front.
N=96
profiles=[(0,.132,.084,.067),(.008,.133,.085,.067),(.04,.135,.087,.067),(.11,.144,.095,.077),(.20,.163,.107,.102),(.255,.174,.110,.120),(.30,.180,.105,.137),(.35,.183,.096,.116),(.395,.187,.083,.074)]
verts=[]
for k,(z,rx,ry,xopen) in enumerate(profiles):
 a=math.asin(xopen/rx)
 for j in range(N+1):
  th=a+(2*pi-2*a)*j/N
  zz=z
  if k==len(profiles)-1: zz=.395+.025*(abs(cos(th))**2)
  # restrained waist shaping and broad cloth surface, without a mannequin.
  verts.append((rx*sin(th),-ry*cos(th),zz))
faces=[]
for k in range(len(profiles)-1):
 for j in range(N):
  th=.55+(2*pi-1.1)*(j+.5)/N
  # Hollow armholes at the actual side seams.
  side=min(abs(th-pi/2),abs(th-3*pi/2))
  if k>=5 and side < (.40 if k==5 else .49):continue
  a=k*(N+1)+j;faces.append((a,a+1,a+N+2,a+N+1))
# shoulder yokes join the outer body border to a real neck opening.
base=len(verts)
for j in range(N+1):
 a=math.asin(profiles[-1][3]/profiles[-1][1]);th=a+(2*pi-2*a)*j/N
 verts.append((.067*sin(th),-.063*cos(th),.42))
for j in range(N):
 a=(len(profiles)-1)*(N+1)+j;faces.append((a,a+1,base+j+1,base+j))
body=mesh('Body | continuous open front and shoulder yoke',verts,faces,cloth,.0025,1)
body['component']='body';body['back_center_length_m']=.42
# Hem and centre back seam, drawn on actual shell.
pts=[]
a=math.asin(.067/.132)
for j in range(100):
 th=a+(2*pi-2*a)*j/99;pts.append((.133*sin(th),-.085*cos(th),.005))
path('Hem | narrow stitched edge',pts,.0006,seammat)
path('Back | centre tailoring seam',[(0,ry+.001,z) for z,rx,ry,xo in profiles],.00055,seammat)
for side in [-1,1]:
 path(('L' if side==1 else 'R')+' body | princess seam',[(side*rx*.69,ry*.73+.001,z) for z,rx,ry,xo in profiles[:-1]],.00055,seammat)

# Raised back and side collar with three centimetres of standing height.
v=[];f=[];K=72
for h in [0,.003,.027,.03]:
 for j in range(K+1):
  th=.50+(2*pi-1.)*j/K;flare=1+h*.7
  v.append((.067*sin(th)*flare,-.063*cos(th)*flare,.42+h))
for k in range(3):
 for j in range(K):a=k*(K+1)+j;f.append((a,a+1,a+K+2,a+K+1))
mesh('Collar | standing back and neck facing',v,f,cloth,.0026,1)
path('Collar | pale upper edge',[(.0684*sin(.5+(2*pi-1)*j/K),-.0643*cos(.5+(2*pi-1)*j/K),.45) for j in range(K+1)],.0011)

for side in [-1,1]:
 pre='L' if side==1 else 'R'
 def flip(P):return [(side*x,y,z) for x,y,z in P]
 # Two folded cloth pieces create the lapel notch rather than a painted outline.
 lower=[(.063,-.093,.015),(.145,-.112,.304),(.105,-.127,.324),(.085,-.085,.377),(.083,-.103,.266),(.051,-.087,.026)]
 ob=mesh(pre+' Lapel | folded lower notched facing',flip(lower),[(0,1,4,5),(1,2,3,4)],cloth,.003,0)
 bev=ob.modifiers.new('Soft pressed lapel perimeter','BEVEL');bev.width=.0013;bev.segments=3
 path(pre+' Lapel | fine piping',flip(lower[:4]),.00115)
 upper=[(.066,-.063,.424),(.097,-.077,.397),(.138,-.099,.350),(.103,-.116,.342),(.081,-.094,.367)]
 ob=mesh(pre+' Collar | pointed folded front',flip(upper),[(0,1,4),(1,2,3,4)],cloth,.003,0)
 bev=ob.modifiers.new('Soft collar corners','BEVEL');bev.width=.001;bev.segments=2
 path(pre+' Collar | piped point',flip(upper[:4]),.00115)
 button(pre+' lapel | silver snap',(side*.107,-.129,.307),.003)
 button(pre+' hem | silver rivet',(side*.076,-.096,.043),.0024)
 # Shoulder strap matches the yoke slope and has a shaped end.
 tab=[(.091,-.014,.428),(.091,.014,.428),(.180,.017,.402),(.191,.009,.397),(.191,-.009,.397),(.180,-.017,.402)]
 ob=mesh(pre+' Shoulder | tab',flip(tab),[(0,1,2,3,4,5)],strapmat,.0025,0)
 bev=ob.modifiers.new('Rounded epaulette edge','BEVEL');bev.width=.003;bev.segments=3
 path(pre+' Shoulder | pale edge',flip(tab),.00095,trim,True)
 button(pre+' Shoulder | button',(side*.104,0,.428),.004,(0,0,1))

# Sleeve coordinates are measured along an outward sloping arm axis.
axis0=Vector((.258,-.018,-.966));axis0.normalize()
def sleeve_point(side,s,ang,r):
 ax=Vector((side*axis0.x,axis0.y,axis0.z));u=Vector((side*.966,0,.258));u.normalize();v=ax.cross(u).normalized()
 centre=Vector((side*.19,0,.39))+ax*s
 centre.y+=-.007*sin(pi*s/.58)**2
 return centre+u*(r*cos(ang))+v*(r*.96*sin(ang))
def sleeve_radius(s):
 prof=[(0,.060),(.035,.066),(.12,.061),(.24,.052),(.32,.048),(.43,.045),(.52,.0415),(.58,.041)]
 for (a,ra),(b,rb) in zip(prof,prof[1:]):
  if a<=s<=b:return ra+(rb-ra)*(s-a)/(b-a)
 return .041
for side in [-1,1]:
 pre='L' if side==1 else 'R';v=[];f=[];nr=40
 steps=[0,.006,.025,.05,.09,.14,.20,.26,.31,.36,.42,.48,.52,.55,.575,.58]
 for s in steps:
  for j in range(nr):
   ang=2*pi*j/nr;r=sleeve_radius(s)
   # Low amplitude bend folds around the elbow and sleeve seam.
   r+=.0015*math.exp(-((s-.28)/.09)**2)*sin(ang*3+s*85)
   v.append(tuple(sleeve_point(side,s,ang,r)))
 for k in range(len(steps)-1):
  for j in range(nr):a=k*nr+j;b=k*nr+(j+1)%nr;f.append((a,b,b+nr,a+nr))
 ob=mesh(pre+' Sleeve | shaped open tube',v,f,cloth,.002,2);ob['component']='sleeve';ob['sleeve_axis_length_m']=.58
 path(pre+' Sleeve | sewn shoulder cap',[tuple(sleeve_point(side,0,2*pi*j/64,.0607)) for j in range(64)],.0006,seammat,True)
 path(pre+' Sleeve | back seam',[tuple(sleeve_point(side,s,pi/2,sleeve_radius(s)+.0004)) for s in steps],.00055,seammat)
 # Open cuff shell, a separately addressable sixty millimetre band.
 v=[];f=[]
 for s in [.52,.522,.578,.58]:
  for j in range(nr):v.append(tuple(sleeve_point(side,s,2*pi*j/nr,sleeve_radius(s)+.0023)))
 for k in range(3):
  for j in range(nr):a=k*nr+j;b=k*nr+(j+1)%nr;f.append((a,b,b+nr,a+nr))
 cuff=mesh(pre+'_Cuff_Band',v,f,strapmat,.002,1);cuff['height_m']=.06;cuff['edit_role']='band';cuff['component']='cuff'
 for s,label in [(.52,'Proximal'),(.58,'Distal')]:
  po=path(pre+'_Cuff_Piping_'+label,[tuple(sleeve_point(side,s,2*pi*j/72,sleeve_radius(s)+.0032)) for j in range(72)],.0011,trim,True);po['edit_role']=label.lower()
 # A narrow buckle strap midway around the band.
 v=[];f=[]
 for s in [.541,.559]:
  for j in range(nr):v.append(tuple(sleeve_point(side,s,2*pi*j/nr,sleeve_radius(s)+.004)))
 for j in range(nr):f.append((j,(j+1)%nr,(j+1)%nr+nr,j+nr))
 strap=mesh(pre+'_Cuff_Strap',v,f,strapmat,.001,0);strap['edit_role']='hardware'
 ax=Vector((side*axis0.x,axis0.y,axis0.z));u=Vector((side*.966,0,.258));u.normalize()
 c=Vector((side*.19,0,.39))+ax*.55+Vector((0,-.049,0))
 frame(pre+'_Cuff_Buckle',c,u,-ax,.026,.029)
 for ob in scene.objects:
  if ob.name.startswith(pre+'_Cuff_Buckle'):ob['edit_role']='hardware'
 for off in [-.022,.022]:
  ob=button(pre+'_Cuff_Rivet_'+str(off),c+u*off,.0018);ob['edit_role']='hardware'

# Curved waist straps remain cloth strips over the torso, with a continuous rear belt.
def belt_arc(name,a,b):
 v=[];f=[];steps=60
 for z in [.008,.043]:
  for j in range(steps+1):
   th=a+(b-a)*j/steps;v.append((.136*sin(th),-.091*cos(th),z))
 for j in range(steps):f.append((j,j+1,j+steps+2,j+steps+1))
 ob=mesh(name,v,f,strapmat,.002,0)
 bevel=ob.modifiers.new('Soft belt edges','BEVEL');bevel.width=.0012;bevel.segments=2
 return ob
belt_arc('Waist | rear wrap belt',1.05,2*pi-1.05)
for side in [-1,1]:
 pre='L' if side==1 else 'R'
 belt_arc(pre+' Waist | front short belt',.47 if side==1 else 2*pi-.95,.95 if side==1 else 2*pi-.47)
 frame(pre+' Waist | front buckle',(side*.096,-.078,.026),(1,0,0),(0,0,1),.024,.029)
 frame(pre+' Waist | rear buckle',(side*.095,.077,.026),(1,0,0),(0,0,1),.024,.029)
 for xx in [.076,.116]:button(pre+' Waist | belt eyelet',(side*xx,-.077,.026),.0016)

# The reference's authoritative front/back/left views put decoration on +X.
def shield(name,c,u,w,h):
 c=Vector(c);u=Vector(u);z=Vector((0,0,1));normal=u.cross(z).normalized()
 shape=[(-.5,.5),(.5,.5),(.43,-.13),(0,-.55),(-.43,-.13)]
 pts=[tuple(c+u*(x*w)+z*(y*h)) for x,y in shape]
 ob=mesh(name+' dark embroidered field',pts,[(0,1,2,3,4)],strapmat,.001,0)
 path(name+' silver border',pts,.0013,metal,True)
 # Small silver fleur-de-lis inspired embroidery on the shield.
 def pp(x,y):return tuple(c+u*(x*w)+z*(y*h)+normal*.0012)
 path(name+' fleur stem',[pp(0,-.29),pp(0,.27)],.0008,metal)
 path(name+' fleur left',[pp(0,-.04),pp(-.24,.14),pp(-.26,.26),pp(-.15,.29),pp(-.06,.12),pp(0,.06)],.00085,metal)
 path(name+' fleur right',[pp(0,-.04),pp(.24,.14),pp(.26,.26),pp(.15,.29),pp(.06,.12),pp(0,.06)],.00085,metal)
 path(name+' fleur crossbar',[pp(-.17,-.08),pp(.17,-.08)],.00085,metal)
shield('L Ornament | upper sleeve shield',(.253,-.036,.283),(.60,.8,0),.040,.055)
shield('L Ornament | small breast shield',(.143,-.117,.303),(1,0,0),.024,.037)

def chain(name,start,end,dip,links=34):
 a=Vector(start);b=Vector(end)
 for i in range(links):
  t=(i+.5)/links;c=a.lerp(b,t);c.z-=dip*4*t*(1-t)
  tangent=(b-a)+Vector((0,0,-dip*4*(1-2*t)));tangent.normalize()
  side=tangent.cross(Vector((0,-1,0))).normalized()
  if side.length<.1:side=Vector((1,0,0))
  if i%2:side=tangent.cross(side).normalized()
  pts=[tuple(c+tangent*(.0031*cos(2*pi*j/12))+side*(.0018*sin(2*pi*j/12))) for j in range(12)]
  path(name+' link %02d'%i,pts,.00048,metal,True)
chain('L Chain | front upper',(.145,-.12,.290),(.251,-.05,.280),.065,32)
chain('L Chain | front lower',(.148,-.118,.282),(.251,-.049,.270),.089,38)
chain('L Chain | back upper',(.166,.048,.387),(.255,.026,.276),.070,38)
chain('L Chain | back lower',(.168,.05,.377),(.255,.026,.263),.097,44)
for i in range(3):
 x=.242+i*.009;y=-.043+i*.007;z=.254
 chain('L Ornament | tassel '+str(i),(x,y,z),(x+.004,y,z-.055-i*.008),.004,14+i*2)
 button('L Ornament | tassel terminal '+str(i),(x+.004,y,z-.057-i*.008),.002,(0,-1,0))

# Convert the edit-friendly curve details for the production export's mesh scope.
for ob in list(scene.objects):
 if ob.type=='CURVE':
  bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob;bpy.ops.object.convert(target='MESH')
for ob in scene.objects:
 if ob.type=='MESH':
  for p in ob.data.polygons:p.use_smooth=True
scene['reference_interpretation']='Open front; circumference anchors inferred from corresponding closed ellipse. Wearer left is +X. Cuff opening 0.26 m around, not 0.13 m.'
scene['nominal_shoulder_width_m']=.38;scene['nominal_back_length_m']=.42;scene['nominal_sleeve_axis_m']=.58
scene['garment_front']='-Y';scene['rear_waist_origin']='0,0,0'
if scene.world is None: scene.world=bpy.data.worlds.new('Garment world')
scene.world.color=(.12,.12,.12)
os.makedirs(REFAS_OUTPUT_DIR,exist_ok=True)
with open(os.path.join(REFAS_OUTPUT_DIR,'construction.json'),'w') as f:json.dump({'shoulder_seam_width_m':.38,'back_center_body_length_m':.42,'sleeve_axis_length_m':.58,'collar_stand_m':.03,'cuff_height_m':.06,'cuff_circumference_m':2*pi*.041,'chest_inference':'ellipse rx .163, ry .107 at z .20, extrapolated through front opening','hem_inference':'ellipse rx .132, ry .084 extrapolated through front opening','objects':len([o for o in scene.objects if o.type=='MESH'])},f,indent=2)
