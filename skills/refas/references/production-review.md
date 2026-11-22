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

Without a specification, the built-in views use Z up, front looking from -Y,
back from +Y, side from +X, top from +Z, and an oblique hero view. These are
diagnostic conventions; orient the asset deliberately and inspect the result.

Keep geometry evaluation consistent too. Realize Geometry Nodes instances
before review, and match viewport/render modifier visibility and enabled
subdivision levels. The runner rejects these mismatches before export or
observation; fixed cameras cannot compensate for comparing different meshes.
