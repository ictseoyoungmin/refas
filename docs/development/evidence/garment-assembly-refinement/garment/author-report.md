# Informed jacket fold refinement

Date: **2026-11-22, Asia/Seoul**. Starting asset: the selected jacket delivered
with `e265a35f`; implementation/skill base: `94930b3d`. This is an informed
follow-up with inherited project context, not a fresh controlled authoring trial.
The exact initial instruction is archived in `../prompts/garment-author.txt`.

## Author observation and change

The complete original sheet and the old six actual views were inspected before
editing. The baseline's front collar had several short, competing white
strokes. Its long lapel continued upward into that border, obscuring the
collar/lapel relationship. The source detail instead shows a broad turned
collar leaf, a comparatively short lower cut, and one distinct notch above
the lapel.

`refine_fold.py` changes the existing collar and lapels. It constructs a
continuous neck stand, an outward rounded turn, and a leaf whose width, depth
and height vary separately. The free edge is one continuous border; the two
redundant piped front-cut objects are removed. The lapels use a widthwise
9 mm outward roll and end at the notch instead of continuing upward as a
second strip. Their silver snaps are seated on the new surface. Collar and
lapel solidify thickness remain editable at 2.2 mm and 2.4 mm respectively.

The first revised collar had an angular side/back overhang in close views.
That complete native/GLB, source script, six views, close views and edit/restore
record were retained. Two subsequent profile placements narrowed the leaf and
made the lower front cut closer to horizontal. The selected final script was
then executed again from the untouched delivered baseline in a fresh project.
See [retained candidates](retained-candidates.json); none of these informed
iterations replaces the original no-skill/1.x/2.0 comparison.

The author sees a clearer collar/lapel division and less crowded trim in the
actual final views. **The garment is still a prototype.** The collar and lapel
remain rigid and angular in close oblique views; the torso is flat, sleeves are
tubular, straps have excessive metallic response, and the shield/chain detail
is schematic. Those protected parts were not remodeled in this local fold
exercise. Independent review must determine relative preference and finished
visual acceptance separately.

## Selected result and preservation

| Record | Result |
| --- | --- |
| Baseline production revision | `cc7a3144117744e78a07f2c777aa0136` |
| Selected fold revision | `02b51b5409e64333b17b6565eb7c5a38` |
| Cuff edit revision | `2117c6ca02e9497f97842977c075121c` |
| Restored revision | `4074a198f28d4c30b20d61f63a2ece96` |
| Selected scene | 269 mesh objects; 405,996 evaluated/export triangles |
| Fold change scope | Eight existing objects changed; two redundant piping objects removed |
| Preserved original object states | 261 exact public scene fingerprints |
| Material changes | None; all six public material fingerprints match |
| Body/sleeve shell | Cage, evaluated shape, modifiers and vertex groups unchanged |
| Source and review bytes | Unchanged; original reference hash remains `d8b85deb544c58009823ed8ed1478f20389c7a57cedc40870f64046cce76c7c5` |

The unchanged body retains its 0.420 m back-center construction anchor. The
source's nominal 0.58 m sleeve remains distinct from the prior measured
0.607397 m cage meridian; this exercise does not resolve the source's pattern
measurement ambiguities. Source camera registration, garment pattern accuracy,
cloth simulation and human fit were not established.

The final candidate has more evaluated triangles than the 302,196-triangle
baseline because of its dense editable fold strips. No optimization or game
budget acceptance is claimed. Fewer objects is not evidence of lower cost.

See [public scene-state comparison](preservation.json),
[author script fingerprints](fold-checks.json) and
[selected file identities](selected-files.json).

## Actual views and independent import

The unchanged six-view `review.json` was used before and after with Blender
4.3.2, Cycles CPU, 512 × 512 and 16 samples. Recorded camera, framing, lights,
renderer and source-region metadata match exactly. The additional three
close views use `review-fold-detail.json` under the same light rig and also
match across the pair. All cameras remain unregistered to the original sheet.

Raw images are under `renders/before`, `renders/after`,
`renders/detail-before`, `renders/detail-after`, and `renders/cuff-edited`.
`renders/glb-readback/view-front-three-quarter.png` is an actual render made
after importing the selected GLB into factory-startup Blender.

Independent native/GLB inspection confirms all 269 mesh names and parent links.
Maximum world-matrix difference is approximately **1.69 × 10⁻⁷** and maximum
evaluated per-object bounds difference is **1.86 × 10⁻⁹ m**. Both representations
have 405,996 triangles. This does not prove procedural material equivalence;
cloth nodes were not baked and no new engine profile was exercised.

The main cloth cage has three boundary loops: the connected front/neck/hem
edge and two wrists. The two 40-edge armholes remain shared, with two incident
faces per seam edge. After modifiers, body, collar and both lapels have no
boundary edges, edges with more than two incident faces, or zero-area faces.
These checks do **not** rule out every intersection, prove cloth clearance,
or establish rig/UV/simulation readiness. The rimmed solidified surface is
closed while the garment's empty interior and deliberate openings remain.

See [independent check](independent-check.json); the full named object states
are preserved in `independent-check.json.gz`.

## Local edit and exact recovery

The wearer-left cuff's measured axial extent changes from **0.059987178 m**
to **0.069987188 m**. Seven objects change. All 261 objects outside that cuff
plus its distal piping remain unchanged, for **262 unchanged fingerprints**.
The opposite cuff and material graph state remain unchanged. Restoring the
selected revision reproduces **all 14 selected artifact/input files exactly**,
including native, GLB, six whole views, captured base-native/script/review inputs
and records. The original reference is independently hash-checked and unchanged.

The complete final replay runs 15 commands: 14 public production CLI operations
and one independent Blender import/geometry check. Their summed execution time
is **145.482 seconds**, spanning 18:15:50–18:18:16 KST. That is a scripted replay
measurement, not total authoring time or a speed comparison. Earlier inspection,
code writing, candidate corrections and shared-machine contention are outside
that number. Model identity, token use and cost were not instrumented.

The full [execution record](execution.json) includes commands, exact input
hashes, restored file hashes and fixed-view metadata. Full cuff state hashes
are in `cuff-edit-checks.json.gz`.

## Reproduce

From a checkout containing the example, provide the selected baseline native
from the previous delivery and an installed/frozen RefAs production skill:

```bash
python examples/uniform-jacket/run_fold_refinement.py \
  --root /absolute/new-output-folder \
  --skill-root /absolute/refas-skill \
  --input-blend /absolute/baseline/jacket.blend \
  --blender /absolute/blender
```

The runner creates a fresh production project, imports and renders the baseline,
edits the folds, exercises and restores the cuff, independently reopens native
and GLB, and makes the matched detail and imported-GLB observations. It stores
normal bpy scripts, native and GLB files, actual images and command logs. No
historical literal prompt is reconstructed by this replay.

### Portable runner review fix

A later code review found that repeated `--resume-selected` calls could collide
with already-created observation project folders. The runner now scopes those
folders to the selected revision. A disposable copy of the completed project
successfully exercised the resumed route, its cuff edit, independent import,
fresh observations and exact 14-file restoration. Its selected native and GLB
remain byte-identical to the original author selection. This was a runner
compatibility check, not another visual refinement. The original execution
and its source hashes remain unchanged; [the review-fix record](runner-review-fix.json)
and [resume execution](resume-execution.json) identify the updated runner bytes.

### Actual installed-package compatibility

The final portable runner also completed a separate fresh-root replay using
the extracted **1.4.2 development npm tarball**, SHA-256
`0b62e372e335cdf090718ee0a3384e5a51b3e48f309d8c7c1e9e0ba8bbf4e01a`.
All 15 commands passed, including 14 public production CLI operations and the
independent Blender check. The selected scene fingerprint, every named object
record, statistics and bounds equal the original frozen-skill author result.
The GLB bytes also match. A fresh native save has different file bytes; native
byte equality across separate builds is not claimed.

The installed replay preserves cuff isolation, matched whole/detail observation
metadata, independent import, and exact restoration of all 14 files in its own
selected bundle. Its command execution total is 108.206 seconds, spanning
18:23:21–18:25:10 KST. The original selected files and comparison renders remain
unchanged. This is an informed compatibility replay against the package with
the newly tested runtime guards, not an additional quality trial or evidence
that those unsupported cases occur in this jacket.

See [installed package record](installed-package.json) and
[full installed execution](installed-execution.json). Current reproduction
scripts are copied under `work/garment/installed-replay/scripts`; the original
author replay's script snapshot deliberately retains the pre-review-fix runner.
