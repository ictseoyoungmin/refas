# Post-review joined collar and lapel correction

Date: **2026-11-22, Asia/Seoul**. This is an informed structural correction after
the [first isolated visual review](../../review/initial-review.md), which tied
the prior refinement against the original baseline and rejected both as
finished assets. The review found clearer trim in the first refinement but
worse collar-to-body continuity, projecting rectangular tabs and visible
gaps. That negative result remains part of the record. The exact follow-up
instruction is preserved in [the post-review prompt](../../prompts/garment-post-review.txt).

The previous selection `02b51b5409e64333b17b6565eb7c5a38`, its native and GLB,
reports, actual renders, production history and source snapshots remain
unchanged. The four current example sources were additionally copied to
`prior-example-sources/` before the structural edit. All nine previous
delivered asset hashes, the source archive hashes, and the first review's
before/after render files were checked again; see [retention](retention.json).

## Structural change and author observation

The complete original sheet, its collar detail and the actual prior close
views were inspected again. The source's upper collar leaf and lower lapel
meet at a single narrow gorge. The collar turns outward from the neck and
ends in a tapered free point; it is not a separate rectangular plate in
front of the shoulder.

The correction makes the stand, both turned leaves and both lapels **one
continuous editable facing mesh**. Each lapel shares an 11-edge gorge seam
with the collar. The 22 seam edges have two incident faces, so the attachment
does not depend on two separately subdivided objects happening to overlap.
The positive-side free notch anchor is approximately
`(0.083, -0.104, 0.354)` metres, mirrored on the other side. From this anchor,
the leaf widens to its pointed front cut and returns towards the neck.
Width, depth and height vary independently along the collar section.

The lapel has an 8 mm outward roll that reduces near the common gorge. The
attachment edge is seated close to the existing body surface. The whole
facing has a 2.2 mm solidify thickness and editable subdivision. No extra
decorative patch or gap-hiding border was introduced. The existing collar
and lapel piping objects follow the new free outline, and the two snaps are
seated on the changed lapel surface.

The previous separate lapel surface objects are now represented by named
vertex groups on `Collar | standing back and neck facing`:

- `Collar stand and turned leaves`
- `L Lapel | rolled facing` and `R Lapel | rolled facing`
- `L Gorge | shared cloth seam` and `R Gorge | shared cloth seam`

This is an intentional change to selection semantics. Selecting either old
lapel object name no longer works; the corresponding group provides that
local editing region. The body and armhole shell remain separate and
unchanged. Joining the facing to the body topology was outside this local
correction.

Actual whole front, side, back and three-quarter renders, plus matched
front, oblique and side close views, were inspected. **The author sees the
former floating rectangular-tab appearance and open collar/lapel gap
resolved into a continuous notched facing.** The broad dark collar and
lapel read more coherently in the front view. This is an author observation,
not an independent acceptance result. A fresh isolated reviewer must judge
the new selection against the unchanged original baseline.

Visible weaknesses remain. The tailoring is rigid, the notch is sharp, and
the collar still overhangs the shoulder in side view. The flat torso,
tubular sleeves, bright straps and schematic shields/chains are protected
baseline features. The result remains a static garment prototype; no
finished likeness, cloth drape or fit claim is made.

## Selected state and measured preservation

| Record | Result |
| --- | --- |
| Baseline production revision | `f13cfbf83b5a4c029d83a2ce804faf8c` |
| Selected structural revision | `10b36b81230848fb9d81ceb9dc355f1f` |
| Cuff edit revision | `ad101bf5c3c0452db81bf0c15e3dc134` |
| Restored revision | `48fd4fb0d33d437ea9f3ca40e4bfe17e` |
| Selected public scene fingerprint | `6cc442a0602709198f76d67948498b94d2da7f6e53f499ed59c69d332741ebfa` |
| Scene size | 267 mesh objects; 418,540 evaluated/export triangles |
| Surviving objects changed | Six: combined collar facing, collar border, two lapel borders and two snaps |
| Objects removed | Four: two old collar-point borders and two old separate lapel surfaces |
| Added objects | None |
| Protected original objects | 261 unchanged public scene fingerprints |
| Material state | All six material fingerprints unchanged |

[The preservation record](preservation.json) contains every protected object
fingerprint and the before/after matrices, mesh counts, position hashes and
vertex groups of the changed or removed objects. The unchanged body record
matches in full, including cage, evaluated geometry, modifiers, materials
and vertex groups. Counts alone are not used as evidence of preservation.

The unchanged body retains the **0.420 m back-center construction anchor**.
The sheet's **nominal 0.58 m sleeve** remains distinct from the old
**0.607397 m cage meridian**. This correction does not resolve the source's
pattern measurement ambiguity. Scene width is 0.76687968 m; the full asset
bounds include sleeves and hardware and are not a substitute for the
back-center construction measurement.

All black-cloth and other material data are unchanged. The same lighting
was used before and after; there is no material adjustment to conceal the
fold change. The original source SHA-256 remains
`d8b85deb544c58009823ed8ed1478f20389c7a57cedc40870f64046cce76c7c5`.

The original baseline has 302,196 evaluated triangles. The new dense fold
cage raises the result to 418,540; fewer objects does not imply a lower
rendering or memory cost. No game budget or optimization acceptance is
claimed.

## Actual renders, topology and independent GLB reopening

The runner imported the original native baseline into a fresh public
production project and rendered it before applying the edit. Both whole
sets use the unchanged six-view `review.json`, Blender 4.3.2, Cycles CPU,
two threads, **512 × 512 and 16 samples**. Camera, framing, light, renderer
and source-region metadata match exactly. The three matched close views
use the existing `review-fold-detail.json` and the same light rig. Source
cameras remain unregistered; no numeric resemblance score is inferred.

Raw images are retained in `renders/before`, `renders/after`,
`renders/detail-before`, `renders/detail-after` and `renders/cuff-edited`.
`renders/glb-readback/view-front-three-quarter.png` is an actual render from
the independently imported GLB, not a native render relabelled as an export
preview.

The independent Blender process opens the selected native, records its
evaluated geometry, starts a fresh scene and imports the GLB. All **267
mesh names and parent links match**. Maximum world-matrix difference is
**1.69 × 10⁻⁷**, and maximum evaluated per-object bounds difference is
**1.86 × 10⁻⁹ m**. Native and imported GLB both contain 418,540 triangles.

The body cage retains three boundary loops: the connected front/neck/hem
edge and two wrists. Both 40-edge armhole seams remain shared, with two
incident faces per seam edge. The combined facing cage has one continuous
boundary loop. The evaluated body and facing have no boundary edges,
edges with more than two incident faces, or zero-area faces. Solidified
cloth rims close the material surface; the garment still has empty
interior space and deliberate neck/front/wrist openings.

These checks do not establish absence of every intersection, global cloth
clearance, human fit or physical sewability. The 22 gorge-edge assertion is
part of the author script; the separate inspector checks topology and
exported state independently. Procedural cloth nodes were not baked, so
GLB reopening does not prove procedural material equivalence. No new UV
layout, rig, simulation or engine test is claimed. See the compact
[independent check](independent-check.json) and its full object states in
`independent-check.json.gz`.

## Cuff edit, restoration and execution provenance

The wearer-left cuff was changed from nominal 6 cm to 7 cm, with its distal
rim held fixed. Its measured axial extent changes from **0.059987178 m**
to **0.069987188 m**, a delta of **0.010000010 m**. Seven cuff objects change.
All 259 objects outside that assembly plus its distal piping remain
unchanged: **260 unchanged fingerprints** in total. The opposite cuff and
material graph state remain unchanged.

Restoring the selected revision reproduces **all 14 selected artifact and
input files exactly**: native, GLB, six whole views, scene/result/fold
records, and captured base-native/script/review inputs. The source and
original baseline bytes are also independently checked and unchanged.
Full cuff state hashes are retained in `cuff-edit-checks.json.gz`.

The portable workflow uses the actual extracted **1.4.2 development npm
package**, SHA-256
`0b62e372e335cdf090718ee0a3384e5a51b3e48f309d8c7c1e9e0ba8bbf4e01a`.
It includes the tested runtime guards for Geometry Nodes instances and
viewport/render modifier mismatches. This garment does not demonstrate
those unsupported cases. This is neither a 2.0 release nor an independent
authoring comparison.

All 15 commands pass: 14 public production CLI operations and one separate
Blender import/geometry inspection. Their summed execution time is
**109.659 seconds**, spanning **18:32:24–18:34:14 KST**. This measures the
scripted workflow only, excluding source inspection, code authoring,
visual review and shared-machine contention. Model identity, tokens, cost
and total authoring time were not instrumented. There was one selected
structural candidate in this new root; earlier attempts remain preserved
in their original roots.

See [execution](execution.json), [replay provenance](replay.json),
[fold checks](fold-checks.json), and [selected file identities](selected-files.json).

## Reproduce and deliverables

From a checkout containing the current example:

```bash
python examples/uniform-jacket/run_fold_refinement.py \
  --root /absolute/new-output-folder \
  --skill-root /absolute/installed-refas/package/skills/refas \
  --input-blend /absolute/baseline/jacket.blend \
  --blender /absolute/blender
```

The exact executed arguments and source hashes are in `replay.json`.
The selected native and GLB are `candidate.blend` and `candidate.glb` under
`work/garment/joined-fold/`; the complete normal bpy sources and runner are
under its `scripts/` directory. The working project retains all revision
artifacts and stdout/stderr logs. Current source SHA-256 is
`56ae10879acb31fa86325a8693d00c0aa9bc51050c42b42832fde3e877db91b8`;
runner SHA-256 is
`721a8eff0fcb64ed2c3ead9382ae72a1848f81ad6dc1145bbd39147c7bc939f5`.

| Selected artifact | SHA-256 |
| --- | --- |
| `candidate.blend` | `03de5a60b31bf32bae05cec46eeb4fe6220089c1043f274c772a4383cb9a1268` |
| `candidate.glb` | `d298c7cfa098999762f1e713ded4813b33b3f1942bc07c641bd3b41ee8b2ee4a` |

The author selection is stable for independent review. Finished visual
acceptance remains undecided here.
