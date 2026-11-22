"""Render actual fixed diagnostic observations with recorded command clocks."""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import subprocess
import time

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--work',type=Path,required=True)
parser.add_argument('--candidate-label',required=True)
parser.add_argument('--original-native',type=Path,required=True)
parser.add_argument('--phase',choices=('grip','diagnostics','readback','presentation'),required=True)
parser.add_argument('--size',type=int,default=512);parser.add_argument('--samples',type=int,default=16)
args=parser.parse_args()
work=args.work.resolve();selected=work/args.candidate_label
root=work/('observations-'+args.candidate_label)
root.mkdir(exist_ok=True)
logs=root/'commands';logs.mkdir(exist_ok=True)
script=Path(__file__).with_name('render_usable.py').resolve()
jobs=[('grip',selected/'scene.blend',61,'material','motion,grip-front,grip-palm,grip-thumb',None)]
if args.phase=='diagnostics':
    jobs=[
        ('before-lettering',args.original_native,1,'material','lettering-detail',None),
        ('after-lettering',selected/'scene.blend',1,'material','lettering-detail',None),
        ('before-wire',args.original_native,1,'wire','hand-front,elbow-detail,lettering-detail',None),
        ('after-wire',selected/'scene.blend',1,'wire','hand-front,elbow-detail,lettering-detail',None),
        ('before-inside',args.original_native,1,'inside','inside',None),
        ('after-inside',selected/'scene.blend',1,'inside','inside',None),
        ('detailed-before-optimization',selected/'detailed-functional.blend',1,'material','hero,hand-front,elbow-detail',None),
        ('actual-glb-neutral',selected/'scene.blend',1,'material','hero,hand-front',selected/'asset.glb'),
        ('actual-glb-grip',selected/'scene.blend',61,'material','motion,grip-front,grip-palm,grip-thumb',selected/'asset.glb')]
if args.phase=='readback':
    jobs=[('actual-glb-neutral',selected/'scene.blend',1,'material','hero,hand-front',selected/'asset.glb'),
          ('actual-glb-grip',selected/'scene.blend',61,'material','motion,grip-front,grip-palm,grip-thumb',selected/'asset.glb')]
if args.phase=='presentation':
    jobs=[('presentation',selected/'scene.blend',61,'material','presentation-whole,presentation-hand',selected/'asset.glb')]
for label,native,frame,style,views,glb in jobs:
    argv=['/usr/bin/blender','--background',str(native.resolve()),'--threads','2','--python-exit-code','1',
          '--python',str(script),'--','--out',str(root/label),'--review-spec',str(work/'review.json'),
          '--frame',str(frame),'--style',style,'--views',views,'--size',str(args.size),'--samples',str(args.samples)]
    if glb:argv+=['--glb',str(glb)]
    started=dt.datetime.now(dt.timezone.utc).isoformat();clock=time.monotonic()
    result=subprocess.run(argv,capture_output=True,text=True,timeout=300)
    (logs/(label+'.stdout.txt')).write_text(result.stdout)
    (logs/(label+'.stderr.txt')).write_text(result.stderr)
    record={'argv':argv,'startedUtc':started,'endedUtc':dt.datetime.now(dt.timezone.utc).isoformat(),
            'elapsedSeconds':time.monotonic()-clock,'returncode':result.returncode,
            'nativeSha256':hashlib.sha256(native.read_bytes()).hexdigest(),
            'glbSha256':hashlib.sha256(glb.read_bytes()).hexdigest() if glb else None,
            'rendererScriptSha256':hashlib.sha256(script.read_bytes()).hexdigest(),
            'modelTokens':None,'billedCost':None}
    (logs/(label+'.json')).write_text(json.dumps(record,indent=2)+'\n')
    print(json.dumps({'job':label,'returncode':result.returncode,'elapsedSeconds':record['elapsedSeconds']}),flush=True)
    assert result.returncode==0,result.stderr[-2000:]
