import bpy, json, hashlib
from pathlib import Path
import mesh_audit
cover=bpy.data.objects['SERVICE_COVER']
meshes=[o for o in cover.children_recursive if o.type=='MESH']
if cover.type=='MESH': meshes.append(cover)
assert meshes
report={'moduleSha256':hashlib.sha256(Path(mesh_audit.__file__).read_bytes()).hexdigest(),'coverMeshes':{o.name:mesh_audit.audit_mesh(o,meters_per_unit=1,max_details=2) for o in meshes}}
Path(REFAS_OUTPUT_DIR,'installed-mesh-observation.json').write_text(json.dumps(report,indent=2))
