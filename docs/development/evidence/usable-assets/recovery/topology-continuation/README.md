# Fixed garment triangles and preserved GLB motion and skin weights

The recovered v5 asset is an unfinished wearable. This checkpoint fixes a
concrete export risk: deforming quads can select a different diagonal, while
three piping strips and two back-seam strips had twisted connections.

## Implemented and observed

- Reconnect only the five identified strips. Preserve all vertex positions,
  shape-key coordinates and weights.
- Freeze the actual evaluated frame-1 triangles for all 100 garment meshes,
  preserving oriented face and corner lineage. This does not choose arbitrary
  new diagonals with a generic triangulation operation.
- Verify protected POINT/shape/deform data and FACE/CORNER attributes exactly;
  verify every loop's edge actually joins its consecutive vertex endpoints.
- Independently reload the before/after native files and check all 97 frames.
- Check 28 flexible trim meshes at all 97 frames: 2,716 object-frames, zero
  nonadjacent contacts, degenerate triangles, nonpositive rest-normal dots,
  triangle-identity changes or evaluated coordinate differences. Actual matching
  camera diagnostic renders of all five edited strips were reviewed privately.

The intermediate result contains 122,898 garment triangles under the frozen
125,000-triangle budget. Its original avatar remains in the private native.
This native is **not** the selected complete garment: final hardware, fit, GLB,
Godot playback and installed-copy edit/restore are still required.

## Corrected contact candidates

Blender 4.3.2 `BVHTree.overlap` performs its own triangle test before returning
candidates. It omits a retained small coplanar overlap, so confirming only its
positive results with SAT cannot prove complete contact coverage. The task
observer now enumerates conservative float64 triangle AABB candidates and applies
the reviewed scalar-equivalent SAT predicate. Shared mesh vertices are excluded
only for the declared self-contact scope.

Six named fixtures, 2,000 randomized scalar parity cases and 30 brute-force
candidate recall cases verify the replacement. The frozen helper and inspected
input hashes are bound to each new observation. The complete 28-trim / 97-frame
check passes with this method. The accepted arm's declared 133 pairs over 121
frames also pass: 16,093 pair-poses with no contacts. These observations supersede
the earlier BVH-filtered zero-contact claims for those exact scopes.

The full garment inventory found free chain links touching borders or seams and
fitted shoulder/waist ends protruding through neighboring parts. A later native
candidate clears the declared hardware and hardware-to-cloth matrices at all
97 frames while preserving all 389 links. Its local shoulder and short-belt
corrections have independent phase observations. Intentional sewn or welded
interfaces require explicit source-derived bounds; names or a zero result from
a smaller matrix do not waive other contacts.

The earlier wearing observer checked three of the original avatar's 26 meshes.
An added check of the remaining 23 at frames 1, 49 and 97 finds actual coat
intersections with the trousers, belt and hair. Applying the source hair mask
at actual intersection points still leaves 9,661 opaque contact pairs at the
observed rest pose. These are native fitting failures, not exporter-only or
transparent-card artifacts. Original avatar geometry, materials and visibility
remain unchanged. Local lower-coat and neck fitting are paused at the user's
development checkpoint; the frozen contact policies and tolerances are unchanged.
The subsequent PR-update request covers the prepared source/aggregate changes,
not resumed model work or complete-garment acceptance.

## Runtime corrections and actual controls

Two export defaults lost data in this wearable:

- Animation-size optimization discarded a small authored excursion. The worker
  now exports the complete sampled animation channels.
- The installed Blender 4.3.2 exporter discarded positive skin weights at or
  below its internal `1e-4` cutoff. The worker exports all positive influences.
  Because this exporter exposes no public cutoff setting, a structural guard
  identifies the isolated cutoff and changes it only for the export call. The
  original function is restored in `finally`; saved native data and installed
  Blender source bytes are unchanged. Unknown structures fail for review.

Actual Blender regressions retain the failures and verify an 80-micrometre
middle-pose excursion, a 50-micrometre excursion driven by a tiny fifth influence,
and restoration after an exception. The full Production suite passed 98 tests
with real Blender/Godot execution and no skips. The 935 JavaScript tests and all
five required repository gates passed. All 19 files in the extracted package
match the reviewed source bytes.

An export-only preflight of the actual retained native preserves all 22,034
formerly dropped positive influences with exact normalized FLOAT32 coefficients.
Raw decoded GLB replay of all 26 original-avatar meshes at all 97 frames stays
within the unchanged 2-micrometre correspondence bound (maximum 1.463364
micrometres). This preflight does not select the unfinished garment. Original
avatar zero-area faces and numerically sensitive Blender reimport observations
remain recorded; no source geometry was silently repaired to hide them.

## Reproduction on the recorded private input

Use Blender 4.3.2. The topology edit expects the original strip connectivity,
and refuses existing output files. Do not apply it twice or use an unrelated
asset with coincident names.

```bash
blender --background INPUT.blend --threads 2 --python-exit-code 1 \
  --python examples/uniform-jacket/fix_evaluated_topology.py -- \
  --out NEW_DIRECTORY --include-back-seam

blender --background --threads 2 --python-exit-code 1 \
  --python examples/uniform-jacket/inspect_trim_motion.py -- \
  --repo REPOSITORY --baseline INPUT.blend \
  --native NEW_DIRECTORY/wearable-fixed-triangles.blend --out trim-motion.json

blender --background --threads 2 --python-exit-code 1 \
  --python examples/uniform-jacket/inspect_native_integrity.py -- \
  --repo REPOSITORY --baseline NEW_DIRECTORY/wearable-piping-repaired.blend \
  --native NEW_DIRECTORY/wearable-fixed-triangles.blend \
  --require-triangle-polygons --out native-integrity.json
```

The contact helper uses NumPy and SciPy in the authoring environment. It does
not add a dependency to the installed Production package. The synthetic
candidate controls can be run with the pinned Blender environment:

```bash
JACKET_WEARABLE_OUT=NEW_CONTROL_DIRECTORY \
  blender --background --python-exit-code 1 \
  --python examples/uniform-jacket/test_conservative_candidates.py
```

The separate post-repair baseline makes the native comparison triangle-only.
The deliberate five-strip rewiring is recorded in its own topology lineage.
This tested input has no stored custom split normals, nonselection custom EDGE
attributes or UV seam flags; no generic preservation claim is made for such
untested payloads. Raw exported normals and actual engine shading are separate.

## Recovery and current status

The supplied v2-v5 reconstruction was executed into a fresh directory; all
4,177 recorded file sizes and SHA-256 hashes match. The older v5 manifest's
original unexecuted-fresh-restore claim is preserved as history. The later v6
mentioned in the interrupted conversation was not found, so this is a new
continuation from verified v5.

The current fixed checklist remains **30/37 = 81%**. U2/U3/U6 remain open, as do
U1/E2 comparison and D2/D3 merge/publication. The accepted 86,564-triangle arm
and all earlier failures remain unchanged. PR #399 stays Draft.

[summary.json](summary.json) contains aggregate observations, source hashes and
fresh required-check receipts. Earlier 95-test and animation-only 96-test runs
remain historical; the current corrected runtime has the new 98-test run above.
The package still contains 19 files, with the export correction included.

Only source code, synthetic controls and aggregate verification are included in
this local review tree. Private avatar/model data and raw recovery reports remain
in the user's private asset records. The rejected broad recovery commit is not
an ancestor. Earlier automatic approval review also rejected a smaller public
upload; those rejections remain historical records. The user has now explicitly
requested an update to PR #399, and this source/aggregate payload is being prepared
for that update. The pre-update remote baseline is `12076a3e`; `03b4a5c` identifies
the verified local runtime core. Actual remote success, the new remote SHA and
its CI results are not yet observed in this checkpoint. Merge, release and tag
remain separate unfinished milestones.
