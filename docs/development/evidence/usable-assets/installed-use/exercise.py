import datetime as dt
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

base=Path(__file__).resolve().parent
entry=base/'npm/node_modules/.bin/refas'
project=base/'project'
original=Path(sys.argv[1]).resolve()
reference=Path(sys.argv[2]).resolve()
commands=[]
def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def call(label,args):
    cmd=[str(entry)]+list(map(str,args)); start=dt.datetime.now(dt.timezone.utc).isoformat(); timer=time.monotonic()
    p=subprocess.run(cmd,cwd=base,capture_output=True,text=True,timeout=180)
    (base/'logs'/(label+'.stdout.txt')).write_text(p.stdout);(base/'logs'/(label+'.stderr.txt')).write_text(p.stderr)
    commands.append({'label':label,'argv':cmd,'startedUtc':start,'elapsedSeconds':time.monotonic()-timer,'returncode':p.returncode})
    (base/'exercise-commands.json').write_text(json.dumps(commands,indent=2)+'\n')
    if p.returncode: raise RuntimeError(label+' failed: '+p.stderr[-1800:])
    return json.loads(p.stdout)
source_sha=sha(original)
state=call('init',['init','--root',project,'--name','installed-topology-and-animation','--reference',reference])
script=base/'observe-cover.py'
script.write_text("import bpy, json, hashlib\nfrom pathlib import Path\nimport mesh_audit\ncover=bpy.data.objects['SERVICE_COVER']\nmeshes=[o for o in cover.children_recursive if o.type=='MESH']\nif cover.type=='MESH': meshes.append(cover)\nassert meshes\nreport={'moduleSha256':hashlib.sha256(Path(mesh_audit.__file__).read_bytes()).hexdigest(),'coverMeshes':{o.name:mesh_audit.audit_mesh(o,meters_per_unit=1,max_details=2) for o in meshes}}\nPath(REFAS_OUTPUT_DIR,'installed-mesh-observation.json').write_text(json.dumps(report,indent=2))\n")
state=call('observe',['run','--root',project,'--script',script,'--input-blend',original,'--intent','observe actual cover through the installed mesh helper','--views','front','--size','128','--samples','2','--timeout','150','--expected-revision','none','--expected-sequence','0'])
first=state['head']; first_dir=Path(state['outputs']['blend']).parent.parent
manifest=json.loads((first_dir/'revision.json').read_text())
before={area+'/'+r['path']:sha(first_dir/area/r['path']) for area in ['inputs','artifacts'] for r in manifest[area]}
edit=base/'edit-cover.py'
edit.write_text("import bpy,json\nfrom pathlib import Path\nfrom mathutils import Vector\ncover=bpy.data.objects['SERVICE_COVER']\nprotected=set(bpy.data.objects)-{cover}-set(cover.children_recursive)\nbefore={o.name:[list(r) for r in o.matrix_world] for o in protected}\ncover.location+=Vector((0,.003,0))\nbpy.context.view_layer.update()\nchanged=[o.name for o in protected if before[o.name]!=[list(r) for r in o.matrix_world]]\nassert not changed, changed\nPath(REFAS_OUTPUT_DIR,'local-edit.json').write_text(json.dumps({'protectedObjects':len(protected),'unexpectedChanges':changed,'coverOffsetM':.003},indent=2))\n")
state=call('edit',['run','--root',project,'--script',edit,'--intent','move service cover outward 3mm','--views','front','--size','128','--samples','2','--timeout','150','--expected-revision',first,'--expected-sequence',str(state['sequence'])])
edit_report=json.loads((Path(state['outputs']['blend']).parent/'local-edit.json').read_text())
state=call('restore',['restore','--root',project,'--revision',first,'--expected-revision',state['head'],'--expected-sequence',str(state['sequence'])])
after_dir=Path(state['outputs']['blend']).parent.parent
exact=all(sha(after_dir/rel)==value for rel,value in before.items())
verified=call('verify',['verify','--root',project])
result={'sourceNativeSha256':source_sha,'sourceUnchanged':source_sha==sha(original),'initialRevision':first,'restoredRevision':state['head'],'restoredFiles':len(before),'exactRestore':exact,'localEdit':edit_report,'verify':verified,'scope':'Actual installed-package helper, animated native/GLB, local edit and restore execution; this does not accept input geometry or likeness.'}
(base/'exercise-result.json').write_text(json.dumps(result,indent=2)+'\n')
assert exact and result['sourceUnchanged'] and verified['ok']
print(json.dumps(result,indent=2))
