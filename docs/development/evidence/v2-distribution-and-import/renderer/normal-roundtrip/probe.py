
import bpy,json,struct,numpy as np
from pathlib import Path
source=Path('/workspace/scratch/c52cb753f160/v2-next-renderer/run-01/known-materials.glb')
data=source.read_bytes();n=struct.unpack_from('<I',data,12)[0];model=json.loads(data[20:20+n]);binary=data[28+n:]
def array(i,dtype,width):
 a=model['accessors'][i];v=model['bufferViews'][a['bufferView']]
 return np.frombuffer(binary,dtype=dtype,count=a['count']*width,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,width)
p=array(0,'<f4',3);expected=array(1,'<f4',3).astype(float);faces=array(2,'<u4',1).reshape(-1,3)
bpy.ops.wm.read_factory_settings(use_empty=True)
mesh=bpy.data.meshes.new('normal-roundtrip');mesh.from_pydata(p.tolist(),[],faces.tolist())
for polygon in mesh.polygons:polygon.use_smooth=True
mesh.normals_split_custom_set_from_vertices(expected.tolist())
actual=np.array([tuple(n.vector) for n in mesh.corner_normals]);wanted=expected[[l.vertex_index for l in mesh.loops]]
a=actual/np.linalg.norm(actual,axis=1)[:,None];b=wanted/np.linalg.norm(wanted,axis=1)[:,None]
angles=np.degrees(np.arccos(np.clip(np.sum(a*b,axis=1),-1,1)))
result={'blender':bpy.app.version_string,'operation':'Mesh.from_pydata then normals_split_custom_set_from_vertices; no glTF importer or renderer involved','loops':len(mesh.loops),'maxComponentDelta':float(np.max(np.abs(actual-wanted))),'maxAngleDegrees':float(angles.max()),'meanAngleDegrees':float(angles.mean()),'note':'Observed Blender custom-normal API round-trip precision; not an assumed precision guarantee for all Blender versions.'}
Path('/workspace/scratch/c52cb753f160/v2-next-renderer/normal-roundtrip/result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
