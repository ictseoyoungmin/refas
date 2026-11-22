# Recovered AURIX automail: usable continuation

The selected model is **candidate 08**, production revision
`a6a2e5dec7884effa9c42821e19549b6`. It is a new continuation of the saved
source-identity candidate 05. The later historical 78,998-triangle model was
unavailable; this work does not claim to recover or reproduce that missing model.
The original source image and native checkpoint remain unchanged.

## Delivered result

The arm has a rigid hierarchy, a baked `AURIX_ReachGrip_Return` clip, editable
native geometry, and an actual exported GLB. It retains the original source's
rotary elbow and segment-local mechanical details. It uses **86,564 triangles,
99 meshes/material primitives, and 20 control empties**. All 321 original mesh
parts are represented in the 99 delivered meshes; the rebuilt parts are named
below. Consolidation respects rigid parent and material assignments.

| Quantity | Original checkpoint | Detailed functional version | Selected delivery |
| --- | ---: | ---: | ---: |
| Evaluated triangles | 271,840 | 270,704 | 86,564 |
| Mesh objects | 321 | 321 | 99 |
| Control empties | 20 | 20 | 20 |

The predeclared budget was at most 110,000 exported triangles and 180 material
primitives. This is a 68.2% triangle reduction from the original checkpoint.
There is no measured FPS improvement or general platform-readiness claim.

### File identities

| File | SHA-256 |
| --- | --- |
| Original native checkpoint | `e7b2ac7cbd671d979af6e178ec85efc574ad9860c9695000980cf4a29f8a2dd7` |
| Selected native | `badf3fd5134ea44c77bef19890cf0f3157c8e2dbe622484eba7df713791d36f1` |
| Selected GLB | `08c4f510e903891eab2c0eee276b55de71abf6f1cda3d584a880ee508e3e63f5` |
| Source reference image | `3c7856dd632f8a1cde8036078573f569db55b6af97fae853237d8a9356f3c872` |

`summary.json` records the selected paths, counts, limits and evidence hashes.
`delivery-file-manifest.json` inventories the staged standalone delivery, whose
own top-level manifest is `file-manifest.json`. Full
per-frame matrices and per-triangle lineage remain in the delivery's compressed
evidence, rather than being duplicated as large JSON files in this repository.

## What changed and why

- **Palm core:** rebuilt as nine connected section rings with 16 points per
  ring. The recessed dorsal surface clears the original four white backhand
  plates. No detached white fragment was introduced. A later local relief on
  the thumb side clears the moving proximal thumb cover. The largest intentional
  local inset is 4.5 mm; the original thumb bearing, pivot and support remain.
- **Wrist rotation center:** moved from Z = 184 mm to the actual original gimbal
  axis at Z = 193 mm. Neutral child world transforms were preserved. This fixes
  the rotation center without moving the resting hand geometry.
- **Two wrist side rings:** rebuilt as periodic annuli with shared cyclic
  boundaries. This removes duplicate 0/2π endpoints and artificial cap defects.
- **Two upper hydraulic hoses:** their explicitly identified open terminal
  loops were capped. No global hole-filling operation was applied to the model.
- **26 short hex recesses:** bevel widths were limited to 20% of the shortest
  local extent. Their former clamped chamfers collapsed to identical float32
  positions when consolidated. The recess bodies, depths and materials remain.
- **Lambda mark:** its original front and rear caps contained a small overlapping
  triangle region. The actual visible cap union was retessellated, its interior
  gap retained, and a shared rim connected across the original 60 μm extrusion.
  This repairs the overlap rather than concealing it with a normal flip.
- **Optimization:** armor grids are retained. Bevel segments are reduced and
  small round hardware uses measured collapse decimation. Those operations are
  explicitly distinct from the local palm/annulus/cap reconstruction.

The worst sampled bidirectional distance between an optimized part and the same
**already repaired detailed functional part** was **0.423727 mm**, below the
frozen 0.6 mm budget. Samples include vertices and triangle centroids in both
directions for every part. This is not an exhaustive Hausdorff bound, and it is
not a bound on the deliberate functional changes from the original model.

Independent source-to-detailed inspection accounts for all 321 parts. Every
evaluated neutral world vertex, triangle count and parent is exactly unchanged
for **289 parts**; the **32 repairs** are the six scopes listed above. The
independent review is `../recovery/review-automail-candidate08.md` and is also
included in the standalone evidence. It accepts the arm's declared U4/U5 use and
supports its U2/U6 checks; jacket-dependent and blind-comparison criteria are
separate work.

## Movement and mechanical scope

The Blender timeline is frames **1–121 at 30 fps**. The exported clip is
`AURIX_ReachGrip_Return`, with 17 animated rigid controls. Godot reports a clip
length of 4.033333 seconds, including its initial frame offset.

| Control | Authored sampled range |
| --- | --- |
| Elbow | 0–90° flexion and return |
| Wrist | −12° to +12° flexion |
| Index, middle, ring, little fingers | Per-joint peaks 45°, 55°, 30° |
| Thumb | Per-joint peaks 18°, 35°, 20° |
| Shoulder/root | Fixed |

The clip exercises reach and grip in that specific coordinated motion. It does
not establish clearance for arbitrary combinations of the controls, hyperextension,
shoulder motion, forearm pronation, or physical grasping/contact forces.

All 46 original potentially spanning mechanisms were inventoried by geometry,
parents and endpoints. The source explicitly uses segment-local hydraulic,
cable and rail details; it has no linear piston or cable bridging the moving
elbow that requires a two-endpoint solver. Independent checks place the elbow
axis centers within 1.3e-9 m and corrected wrist axis centers within 4.3e-8 m
over the 121 sampled poses. These are rigid rotary animations, not a dynamics
or load-bearing mechanism simulation.

Early candidates added external telescopic links. They were rejected because
their rectangular scaffolding changed the source elbow silhouette. The decision
is recorded in `design-decision.json`; the original mechanisms were retained.
The U4 use criterion and the frozen budgets were not relaxed to remove them.

## Verification on the selected bytes

### Geometry and export

Every evaluated native mesh was audited after consolidation. There are **zero
degenerate triangles, inconsistent-winding edges, nonmanifold edges/vertices,
or inward closed components**. The sole open-boundary exemption is the **796
inherited decorative AURIX text contour edges**. The Lambda is now closed and
has no winding exemption. Mechanical clearances and intentional openings
between separate solid parts are not holes in those individual solids.

The actual GLB was imported into an empty Blender scene. All **86,564 oriented
triangles in all 99 meshes** mapped to native positions and cyclic vertex order.
UV/normal display splits are treated separately from geometric cracks. The
captured optimized geometry of all **321 named source parts** was also mapped
to the complete consolidated native triangle set.

A negative control copies the actual delivered GLB and reverses one triangle's
binary index order. Inspection exits with failure and identifies exactly one
missing/reversed and one extra/reversed triangle on its mesh; the other 98
meshes still match. The unmodified selected file hashes remain unchanged.

### Motion, contacts and consumer

**133 named surface pairs were tested at all 121 integer frames**, including
adjacent arm armor, the hand core/armor against all digit armor, and all
cross-digit armor pairs. There are zero surface intersections in that scope.
`motion-contact-scope.json` fixes the tested scope and retains the earlier failed
thumb-contact observations. The failed candidate had real external-cover
penetration up to about 1.326 mm outside the intended bearing region; this was
repaired rather than exempted as joint seating.

Coaxial bearings and seated fasteners are intentional attachments and are
reviewed separately. The surface-pair test is not an exhaustive collision
search across every object or continuous time between frames.

An independent **Godot 4.7.2** headless import and AnimationPlayer evaluation
checks all **119 nodes at 121 times: 14,399 matrix probes**. All pass at the
unchanged default matrix tolerance of 2e-5; maximum matrix-element difference
is 8.167699e-7. The import contains 99 meshes, 99 surfaces, 86,564 triangles and
zero skins. This is actual consumer playback, with no GPU/FPS benchmark claim.

### Local cover edit and exact restoration

The public production CLI moves only `SERVICE_COVER` and its four consolidated
child meshes by 3 mm along the declared normal. All **114 unrelated objects**
retain their geometry, materials, modifiers, parents and transforms. The selected
five-object subtree moves uniformly. Restoring the selected revision creates a
new history revision whose **16 captured input/artifact files exactly match**
the selected revision byte for byte. The restored revision is
`449d31abeb56475ca1c6b318db9801b6`; original selected bytes are unchanged.

## Visual observations and limitations

`renders/` contains actual source and selected whole, hand, elbow, wireframe,
inside, logo and posed images. Fixed source/final cameras and render settings
are retained in observation metadata. The wire images show evaluated triangle
edges. The inside diagnostic removes only the palm core from an **unsaved
observation scene**; blue/red indicates front/back faces, not a pass/fail color.

Two additional user-review images render the **actual final GLB at 1024 pixels
and 64 samples**, using cameras fitted to the evaluated posed mesh bounds. They
show the whole arm and the hand at frame 61. These are presentation cameras,
separate from the unchanged 512-pixel matched diagnostic views.

The original reference is an unregistered concept sheet. Depth and hidden
construction are inferred in the retained source model. The review supports
preservation of that model's distinctive layered silhouette and visible
mechanisms; it does not claim exact image registration or a reconstructed
physical product.

The GLB render helper initially imported animation at Blender's factory 24 fps
before setting 30 fps, producing a wrong-time diagnostic pose. Those images
are retained as superseded observations. The corrected helper sets 30 fps
**before import**, and the corrected actual-GLB and native peak renders agree
at 61/30 seconds. Neither the asset nor the independent Godot test was affected.

The delivery has no newly authored production UV atlas, no skin/cloth physics,
no collision proxy, no engine-specific LOD setup, and no performance guarantee.
All original materials and parent assignments are retained. The Lambda cap
repair omits `Crown_A_mark`'s unused autogenerated `UVMap`; all other existing
UV-layer names remain. None of the source materials uses an image texture, and
the source has no skin vertex groups. This precise omission qualifies the
broader UV-preservation sentence in the immutable `construction.json` artifact.
The detailed functional and untouched original native files remain available
for further authoring; the untouched original includes the omitted glyph UV.

## Open, play and reproduce

Open `native.blend` in Blender 4.3.2 or newer and play frames 1–121. The controls
are empties such as `ELBOW_PIVOT`, `WRIST_PIVOT`, and `INDEX_J0`…`THUMB_J2`.
Mute the named NLA track before manual posing so the baked clip does not
override edits. Open `detailed-functional.blend` for the preserved detailed
version, or `original-checkpoint.blend` for the untouched recovered input.
Import `asset.glb` and select `AURIX_ReachGrip_Return` to use the exported clip.

Reproduction uses the repository's public production CLI and the scripts in
`examples/automail-arm/`. Use a fresh work directory, retain the original native,
and use `review.json` supplied in the standalone delivery:

Set `TASK_WORK` to a fresh work directory and `TASK_INPUT` to the extracted
delivery directory before running these commands from the repository checkout.
The native and GLB models open independently. The reproduction scripts require
the matching RefAs checkout containing `skills/refas/scripts/production/` and
these example scripts; the ZIP does not contain the complete runtime. Its
`reproduce/` directory contains reference copies, which resolve repository
dependencies from `examples/automail-arm/`, not from the extracted ZIP.

```bash
TASK_INPUT="/absolute/path/to/extracted-automail"
TASK_WORK="/absolute/path/to/new-automail-work"
TASK_REPO="/absolute/path/to/refas-checkout"
cd "$TASK_REPO"
python3 skills/refas/scripts/produce.py init \
  --root "$TASK_WORK/project" --name aurix-usable-recovery \
  --reference "$TASK_INPUT/reference.png"
python3 examples/automail-arm/run_usable.py \
  --root "$TASK_WORK" --input-blend "$TASK_INPUT/original-checkpoint.blend" \
  --review-spec "$TASK_INPUT/review.json" --phase baseline
python3 examples/automail-arm/run_usable.py \
  --root "$TASK_WORK" --input-blend "$TASK_INPUT/original-checkpoint.blend" \
  --review-spec "$TASK_INPUT/review.json" --phase build
```

`inspect_usable.py` runs in Blender with `--threads 2`; `verify_usable.py`
records the selected inspection, real flipped-GLB control, and public CLI
cover/restore exercise. `observe_usable.py` records actual diagnostic renders.
Their command logs include UTC start/end and monotonic elapsed time. Model
token use and billed cost are unavailable and recorded as null. This informed
continuation is not a controlled no-skill/1.x/2.0 timing benchmark.

## Retained unsuccessful work

- Candidate 01: external links and an overly broad weld operation; retained.
- Candidates 02–03: revised external links, still rejected for source identity.
- Candidate 04: source rotary layout, but 384 collapsed recess triangles after
  consolidation. Mapping and playback passes do not make it topology-clean.
- Candidate 05: recess repair; expanded hand testing found thumb-cover contact.
- Candidate 06: thumb repair; inherited Lambda cap overlap still pending.
- Candidate 07: first cap triangulation filled the Lambda gap; rejected despite
  numeric geometry checks. Candidate 08 filters by actual source-face coverage.

Failed budget attempts, view-name validation failures, the exact failed models,
their scripts and logs, and the timebase correction are retained in the work
history. Earlier status strings mentioning a two-anchor linkage remain in the
immutable candidate 04 run metadata; the design amendment and actual model
describe its source rotary structure correctly.
