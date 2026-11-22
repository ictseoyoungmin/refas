# Explicit input adoption and reference freshness

Run the production CLI from any installed skill root against an existing native
asset, its source reference and review file. Use a new output directory:

```bash
python3 -B examples/reference-refresh/run.py \
  --root /absolute/new/refresh-demo \
  --skill-root /absolute/installed/skills/refas \
  --input-blend /absolute/selected.blend \
  --reference /absolute/reference.png \
  --review-spec /absolute/review.json \
  --manual-edit /absolute/local-edit.py \
  --intent "Apply the local edit while preserving other parts"
```

The supplied `bpy` edit runs in a separately opened copy and is saved with
Blender's Save As. It must change the asset; it receives `REFAS_OUTPUT_DIR` for
any useful edit report. The example uses only the installed public CLI and a
Blender executable, without importing repository runtime modules.

The twelve recorded commands exercise initialization, original native import,
adoption of the original reference plus a new change brief, stale-but-intact
verification, manual Save As, explicit native/script/review/render adoption,
fresh verification, exact historical restore under the current reference set,
re-adoption of the original reference, a renamed/duplicated-content no-op and
status from a new process. `commands.json`, captured stdout/stderr and
`result.json` record the actual operations and checks.

The example retains native/GLB/render/history files under its output project.
It compares restored artifact and input hashes exactly. Default renders change
from 96 to 128 pixels and from two to three samples to exercise fresh settings;
override `--initial-size`, `--updated-size`, `--samples` and `--timeout` for larger
assets. It uses at most the first two supplied review views and intentionally
changes background/alpha settings. These outputs demonstrate input adoption,
not a controlled before/after visual-quality comparison.

See the [recorded evidence](../../docs/development/evidence/reference-freshness/README.md).
