"""Recorded public production execution for the recovered AURIX continuation."""
import argparse
import datetime as dt
import json
from pathlib import Path
import subprocess
import sys
import time

p=argparse.ArgumentParser()
p.add_argument('--root',type=Path,required=True)
p.add_argument('--input-blend',type=Path,required=True)
p.add_argument('--review-spec',type=Path,required=True)
p.add_argument('--phase',choices=['baseline','build'],required=True)
a=p.parse_args()
repo=Path(__file__).resolve().parents[2]
root=a.root.resolve(); root.mkdir(parents=True,exist_ok=True)
cli=repo/'skills/refas/scripts/produce.py'
script=Path(__file__).with_name('build_usable.py')
if a.phase=='baseline':
    script=root/'capture-original.py';script.write_text('pass\n')
cmd=[sys.executable,'-B',str(cli),'run','--outputs','delivery','--root',str(root/'project'),
     '--input-blend',str(a.input_blend.resolve()),'--script',str(script),
     '--intent',('capture original checkpoint' if a.phase=='baseline' else 'rebuild source rotary articulation with repaired palm and measured optimization'),
     '--review-spec',str(a.review_spec.resolve()),'--views','front,side,hero,hand-front,hand-palm,elbow-detail',
     '--size','512','--samples','16','--timeout','360']
stamp=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
directory=root/'executions'/(a.phase+'-'+stamp);directory.mkdir(parents=True)
start=dt.datetime.now(dt.timezone.utc).isoformat();clock=time.monotonic()
r=subprocess.run(cmd,capture_output=True,text=True,timeout=390)
(directory/'stdout.json').write_text(r.stdout)
(directory/'stderr.txt').write_text(r.stderr)
(directory/'command.json').write_text(json.dumps({'argv':cmd,'startedUtc':start,
    'endedUtc':dt.datetime.now(dt.timezone.utc).isoformat(),'elapsedSeconds':time.monotonic()-clock,
    'returncode':r.returncode,'modelTokens':None,'billedCost':None},indent=2)+'\n')
print(json.dumps({'execution':str(directory),'returncode':r.returncode}))
print(r.stdout[-1000:]); print(r.stderr[-1000:])
raise SystemExit(r.returncode)
