# Fixed production review views

Use a review specification when a geometry change could move the automatically
framed camera or lights. Keep the same file for the compared revisions. Define
positions and targets in the asset's world coordinates and units.

```json
{
  "schema": "refas.production.review/v2",
  "views": [
    {"name": "front", "position": [0, -2, 0.15],
     "target": [0, 0, 0.15], "orthoScale": 0.84}
  ],
  "lighting": {"center": [0, 0, 0.18], "radius": 0.48},
  "background": [0.8, 0.83, 0.88],
  "transparent": true
}
```

```bash
python3 scripts/produce.py run --root PROJECT --script EDIT_SCRIPT \
  --intent "correct the visible defect" --review-spec REVIEW_JSON
```

The specification supports 1–12 uniquely named orthographic views. Names contain
lowercase letters, digits and hyphens, starting with a letter. `orthoScale` is
the vertical span in world units. The square image size and sample count remain
the CLI's `--size` and `--samples`; hold them constant too. `lighting.center`
and `lighting.radius` fix the three-area-light rig's location, scale and energy.
`background` is a linear RGB world colour; `transparent` controls film alpha.

Define only views needed for the current comparison. A native iteration defaults
to one hero view; delivery defaults to hero and side. A supplied review file
requests all its views unless `--views` selects a smaller set. Reuse a concise
specification rather than accumulating diagnostic cameras for every edit.

Optionally associate a view with a captured source region:

```json
"reference": {
  "sourceSha256": "<the captured source file's 64-character SHA-256>",
  "regionPixels": [6, 47, 380, 399]
}
```

Pixel extents are `[left, top, right, bottom]` in the unchanged source image.
Use actual extents inside that image. The CLI checks source identity but does
not decode the image or calibrate its camera. This association is provenance,
not registration or a likeness score. The render records remain `unregistered`.

The runner copies the exact specification into the revision's inputs, checks
that the worker did not change it, and restores it with that revision. The JSON
must be at most 64 KiB. Unknown fields and non-finite camera values are rejected.
Use `--views front,detail` to select named views or `--views ''` to skip renders.

After `references` adopts a different content set, the previous bundle reports
`stale` without changing its captured views. A new run accepts source-region
bindings only to the active references and captures its own review and outputs.
Restore keeps the current reference set, so restored views can also be stale.
Pass review, view and render flags on each run; settings are not inherited.

Without a specification, the built-in views use Z up, front looking from -Y,
back from +Y, side from +X, top from +Z, and an oblique hero view. These are
diagnostic conventions; orient the asset deliberately and inspect the result.

Keep geometry evaluation consistent too. Realize Geometry Nodes instances
before review, and match viewport/render modifier visibility and enabled
subdivision levels. The runner rejects these mismatches before export or
observation; fixed cameras cannot compensate for comparing different meshes.

## Optional coverage preservation check

Compare two committed revisions captured with the same transparent review:

```bash
python3 scripts/produce.py compare --root PROJECT --baseline BEFORE_ID \
  --candidate AFTER_ID --view front --regions REGIONS_JSON
```

Declare nonoverlapping top-left pixel rectangles before comparing. Right/bottom
bounds are exclusive. Example for a 512-pixel view:

```json
{"regions":[
  {"name":"edit","role":"target","rectPixels":[0,0,256,512]},
  {"name":"keep","role":"protected","rectPixels":[256,0,512,512],
   "maxChangedPixels":4}
]}
```

Choose tolerances for the task and capture noise; four pixels is not a default.
At least one protected region is required. Alpha >=0.5 defines coverage,
including material transparency. RGB, surface detail, contour displacement and
hidden geometry are unmeasured. The image limit is 1,048,576 pixels.

JSON reports IoU, added/removed pixels and changed bounds.
`decision` uses only protected changed-pixel limits: `protected-regression` or
`within-protected-limits`; an empty whole image is `inconclusive` unless a
protected violation exists. Exit zero means measurement completed. Capture or
source mismatches are errors. No revision, render, baseline promotion or report
file is created. Target improvement, uncovered pixels and whole-asset quality
remain unapproved; inspect the images and native target requirement separately.

## Compare design, defects and use

Inspect the complete original before source-region close-ups. Compare the
whole silhouette and proportions, then defining parts, connections and finish.
Record visible mismatches and uncertainty in the source camera. Unregistered
image crops or a similarity score alone cannot establish accurate 3D shape.

Use additional diagnostic views for mesh openings, winding, intersections and
floating attachments: inside/back faces, side/grazing views, wireframe and
motion frames as needed. Start with `inspect` for a temporary object/frame
observation when an image is not needed. Identify intentional openings and component gaps;
do not accept a defect merely because a beauty view hides it. A small mesh
audit can locate suspected faults, but source intent and actual renders decide
whether they are faults.

For clothing compare the actual target character wearing it in the declared
poses. For articulated assets compare the moving whole and its linkages at
intermediate frames. Compare original and optimized meshes with fixed cameras,
the same motion, source features and declared budgets. Report source likeness,
mesh condition, useful deformation/motion and target-consumer behavior as
separate outcomes. Record a concise finding for failures and untested cases;
retain detailed dumps only for an unresolved question or a requested handoff.

When comparing production workflows, freeze the same task, source, target
character or mechanism, motion, budgets and available resources for each path.
Include these practical criteria in the brief before execution. Later informed
repairs are valuable development evidence but do not replace an independent
matched attempt or its elapsed-time and cost record.
