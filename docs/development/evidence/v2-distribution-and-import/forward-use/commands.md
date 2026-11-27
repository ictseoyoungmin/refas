# Command record

Commands executed in order; independent read-only batches may overlap. All authored files and recorded outputs are under `forward-use`. Production commands after the initial probe disable Python bytecode writes.

## 1

```bash
cat /workspace/scratch/c52cb753f160/v2-import-proof/forward-skill/SKILL.md
```

## 2

```bash
cat /workspace/scratch/c52cb753f160/v2-import-proof/forward-skill/references/production-import.md
```

## 3

```bash
cat /workspace/scratch/c52cb753f160/v2-import-proof/forward-skill/references/production-review.md
```

## 4

```bash
rg --files /workspace/scratch/c52cb753f160/v2-import-proof/legacy-wing-cover
```

## 5

```bash
python3 /workspace/scratch/c52cb753f160/v2-import-proof/forward-skill/scripts/produce.py doctor
```

## 6

```bash
python3 - <<'PY'
import json
from pathlib import Path
base=Path('/workspace/scratch/c52cb753f160/v2-import-proof/legacy-wing-cover')
for rel in ['.refas/project.json','.refas/checkpoints/cp_a744fb4e4fae0cd60712.json','source/source-manifest.json','reviews/findings.json']:
    data=json.loads((base/rel).read_text())
    print(json.dumps({'path':rel,'data':data},ensure_ascii=False,indent=2))
PY
```

## 7

```bash
python3 /workspace/scratch/c52cb753f160/v2-import-proof/forward-skill/scripts/produce.py import-v1 --help
```

## 8

```bash
cat /workspace/scratch/c52cb753f160/v2-import-proof/forward-skill/references/production-assemblies.md
```

## 9

```bash
python3 - <<'PY'
from pathlib import Path
import hashlib,json,os
root=Path('/workspace/scratch/c52cb753f160/v2-import-proof/forward-use')
root.mkdir(exist_ok=True)
(root/'scripts').mkdir(exist_ok=True)
(root/'logs').mkdir(exist_ok=True)
source=Path('/workspace/scratch/c52cb753f160/v2-import-proof/legacy-wing-cover')
snapshot={str(p.relative_to(source)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(source.rglob('*')) if p.is_file()}
(root/'logs'/'source-before.json').write_text(json.dumps(snapshot,indent=2)+'\n')
print(json.dumps({'sourceFileCount':len(snapshot),'liveGlbSha256':snapshot['assets/wing-cover.glb'],'bytecodeEnv':os.environ.get('PYTHONDONTWRITEBYTECODE')}))
PY
```

## 10

```bash
env PYTHONDONTWRITEBYTECODE=1 python3 /workspace/scratch/c52cb753f160/v2-import-proof/forward-skill/scripts/produce.py import-v1 --root /workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project --source-project /workspace/scratch/c52cb753f160/v2-import-proof/legacy-wing-cover --checkpoint cp_a744fb4e4fae0cd60712 --artifact assets/wing-cover.glb --name wing-cover-forward-choice --views hero,side --size 512 --samples 16 --timeout 180
```

## 11

```bash
env PYTHONDONTWRITEBYTECODE=1 python3 /workspace/scratch/c52cb753f160/v2-import-proof/forward-skill/scripts/produce.py status --root /workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project
```

## 12

```bash
python3 - <<'PY'
import json
from pathlib import Path
root=Path('/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project/.refas2/revisions/6f23fe22c89f40ea96b99f1b4060f196')
for rel in ['inputs/import/migration.json','artifacts/scene.json']:
    data=json.loads((root/rel).read_text())
    print(json.dumps({'path':rel,'data':data},indent=2))
PY
```

## 13

```bash
env PYTHONDONTWRITEBYTECODE=1 /usr/bin/blender --background /workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project/.refas2/revisions/6f23fe22c89f40ea96b99f1b4060f196/artifacts/scene.blend --python /workspace/scratch/c52cb753f160/v2-import-proof/forward-use/scripts/inspect_native.py
```

## 14

```bash
env PYTHONDONTWRITEBYTECODE=1 python3 /workspace/scratch/c52cb753f160/v2-import-proof/forward-skill/scripts/produce.py run --root /workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project --script /workspace/scratch/c52cb753f160/v2-import-proof/forward-use/scripts/baseline.py --intent 'Capture unchanged imported asset with fixed hero, tip detail and grazing views' --review-spec /workspace/scratch/c52cb753f160/v2-import-proof/forward-use/review-spec.json --size 640 --samples 32 --timeout 180 --expected-revision 6f23fe22c89f40ea96b99f1b4060f196 --expected-sequence 1
```

## 15

```bash
rg --files --hidden -g '*.pyc' /workspace/scratch/c52cb753f160/v2-import-proof/forward-skill
```

## 16

```bash
env PYTHONDONTWRITEBYTECODE=1 python3 /workspace/scratch/c52cb753f160/v2-import-proof/forward-skill/scripts/produce.py run --root /workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project --script /workspace/scratch/c52cb753f160/v2-import-proof/forward-use/scripts/raise_panel.py --intent 'Raise only panel:cell-00 outward by 0.025 scene units; preserve the remaining asset' --review-spec /workspace/scratch/c52cb753f160/v2-import-proof/forward-use/review-spec.json --size 640 --samples 32 --timeout 180 --expected-revision 3795c8dfcb8f43aeab6728e837b09044 --expected-sequence 2
```

## 17

```bash
env PYTHONDONTWRITEBYTECODE=1 python3 /workspace/scratch/c52cb753f160/v2-import-proof/forward-use/scripts/check_preservation.py
```

## 18

```bash
env PYTHONDONTWRITEBYTECODE=1 python3 /workspace/scratch/c52cb753f160/v2-import-proof/forward-skill/scripts/produce.py verify --root /workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project
```

## 19

```bash
env PYTHONDONTWRITEBYTECODE=1 python3 /workspace/scratch/c52cb753f160/v2-import-proof/forward-skill/scripts/produce.py restore --root /workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project --revision 6f23fe22c89f40ea96b99f1b4060f196 --expected-revision ecfc78fcd169476e8c4da1358d4cb173 --expected-sequence 3
```

## 20

```bash
env PYTHONDONTWRITEBYTECODE=1 python3 /workspace/scratch/c52cb753f160/v2-import-proof/forward-use/scripts/check_restoration.py
```

## 21

```bash
env PYTHONDONTWRITEBYTECODE=1 python3 /workspace/scratch/c52cb753f160/v2-import-proof/forward-skill/scripts/produce.py status --root /workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project
```

## 22

```bash
env PYTHONDONTWRITEBYTECODE=1 python3 /workspace/scratch/c52cb753f160/v2-import-proof/forward-skill/scripts/produce.py verify --root /workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project
```

## 23

```bash
rg --files --hidden -g '*reference.png' /workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project
```

## 24

```bash
env PYTHONDONTWRITEBYTECODE=1 python3 /workspace/scratch/c52cb753f160/v2-import-proof/forward-use/scripts/check_restoration.py
```

## Non-shell authoring and inspection

The installed RefAs skill and its import, review and assembly guides were read. The Karpathy Guidelines skill was read through the skill tool. Files authored with the patch tool:

- `/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/scripts/inspect_native.py`
- `/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/scripts/baseline.py`
- `/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/scripts/raise_panel.py`
- `/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/review-spec.json`
- `/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/scripts/check_preservation.py`
- `/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/scripts/check_restoration.py`
- `/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/REPORT.md`
- `/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/commands.md`

Actual images opened through the image viewer:

- `/workspace/scratch/c52cb753f160/v2-import-proof/legacy-wing-cover/source/reference.png`
- `/workspace/scratch/c52cb753f160/v2-import-proof/legacy-wing-cover/renders/final/hero.png`
- `/workspace/scratch/c52cb753f160/v2-import-proof/legacy-wing-cover/renders/final/side.png`
- `/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project/.refas2/revisions/6f23fe22c89f40ea96b99f1b4060f196/artifacts/view-hero.png`
- `/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project/.refas2/revisions/6f23fe22c89f40ea96b99f1b4060f196/artifacts/view-side.png`
- `/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project/.refas2/revisions/3795c8dfcb8f43aeab6728e837b09044/artifacts/view-hero.png`
- `/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project/.refas2/revisions/3795c8dfcb8f43aeab6728e837b09044/artifacts/view-detail.png`
- `/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project/.refas2/revisions/3795c8dfcb8f43aeab6728e837b09044/artifacts/view-grazing.png`
- `/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project/.refas2/revisions/ecfc78fcd169476e8c4da1358d4cb173/artifacts/view-hero.png`
- `/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project/.refas2/revisions/ecfc78fcd169476e8c4da1358d4cb173/artifacts/view-detail.png`
- `/workspace/scratch/c52cb753f160/v2-import-proof/forward-use/project/.refas2/revisions/ecfc78fcd169476e8c4da1358d4cb173/artifacts/view-grazing.png`

## Nonzero commands

- The `rg` search for installed-skill `*.pyc` files returned exit code 1 because there were no matching files.
- The first `check_restoration.py` run failed because its reference path omitted `.refas2`. The helper was corrected to the location returned by the targeted file search and rerun successfully. This did not change the saved project.

All RefAs production operations succeeded. Production command results and verification outputs are retained under `logs/`; original worker logs remain within the new production project.

