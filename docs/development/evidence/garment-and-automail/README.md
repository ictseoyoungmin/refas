# Garment and automail: two-asset production validation

Date: **2026-11-22, Asia/Seoul**. Parent checkpoint: `00641291` on
`rewrite/v2`, [Draft PR #399](https://github.com/ictseoyoungmin/refas/pull/399).

The native production workflow completes both the informed jacket refinement
and a fresh articulated-arm authoring exercise. Local edits, preservation,
reopening and recovery have concrete evidence. **Neither the jacket nor the
arm is a finished, approved production asset.** Technical execution and source
likeness have separate outcomes below.

Open [the offline comparison viewer](comparison.html), [machine-readable
evaluation](evaluation.json), or the [protocol](PROTOCOL.md). The images are
actual Blender renders. Source images are preserved at
[uniform-jacket/source/reference.png](../../../../examples/uniform-jacket/source/reference.png)
and [automail-arm/source/reference.png](../../../../examples/automail-arm/source/reference.png).
The earlier [three-condition jacket pilot](../uniform-jacket/README.md) remains
unchanged; this refinement is not substituted for its initial 2.0 result.

## What changed in the repository

- Added two optional, short production guides: garment surface continuity and
  folded collars; rigid assemblies, pivots, moving covers and limited poses.
  Both are reachable from the default skill and the existing instruction graph.
  The graph now has **43 reference leaves**, while **121 runtime interfaces**
  remain unchanged. The source-specific modeling scripts stay in examples.
- Added an actual Blender regression for a rotated/translated rigid hierarchy:
  live modifiers, parent links, analytic hinge movement, independent native and
  GLB reopening, and unchanged input bytes. No production runtime repair was
  needed for the exercised rigid-node export.
- Added reproducible jacket refinement and automail examples using the public
  production CLI. The arm runner now checks every selected artifact/input on
  restore, checks the parsed export verdict, and uses one configured Blender
  executable for production and independent export inspection.
- Extended the task-local common observer with an explicit asset-root scope and
  text-to-mesh conversion in disposable observation copies. Every excluded
  studio object and converted curve/text object is recorded. Original native
  files are unchanged.

The original trial script copies and reports are historical evidence. A later
read-only code review found a stale hardcoded revision label, a hardcoded
Blender path, and an inaccurate lining-material comment. Their fixes and the
final example hashes are in [review-fixes.json](records/review-fixes.json).
They do not retroactively alter the original authoring record.

## Garment: useful improvement, unfinished collar and detail

An independent reviewer saw the complete source sheet and twelve anonymous
fixed views. It preferred **B, the refined jacket**, for further development;
**A and B both fail finished visual acceptance**. The raw
[review](records/blind-garment-review.md), [structured verdict](records/blind-garment-review.json)
and [unblinded mapping](records/blind-garment-mapping.json) are preserved.

The refined main cloth reads closer to the source's black material, and rear
shoulder/underarm transitions are visibly smoother. Its neck opening is less
cylindrical. However, the front collar trim becomes a crowded zigzag; the
reviewer found the earlier triangular panels easier to distinguish. Both
versions retain a stiff front opening, flat torso shaping, overly smooth
tubular sleeves, metallic-looking strap bands and schematic ornament. A real
stand/turn/leaf construction does not by itself make the folded collar look
right.

The major cloth cage is one connected component with three intentional boundary
loops: the connected front/neck/hem opening and two wrists. All **80 shared
armhole edges** have two incident faces. Evaluated subdivision and thickness
have no boundary edges, edges with more than two incident faces, or zero-area
faces. Sparse opening rays support the declared open front/neck/wrists; these
tests do not rule out every self-intersection.

The main cloth, lining and tonal thread materials were deliberately adjusted
under unchanged review lighting. Separate hardware, piping and strap materials
remain unchanged. **231 cuff/ornament/chain object fingerprints** were preserved
through the major refinement. The shoulder seam-top span is 0.384 m; the 0.420 m
back anchor is a construction measure. The measured outer sleeve cage meridian
is 0.607397 m, about 4.7% over the nominal 0.58 m source anchor; it is not an
evaluated cloth seam or pattern length.

### Local edit and recovery

The left cuff band increases from **0.059987178 m to 0.069987188 m**. Seven
objects change; **263 objects outside that cuff and its unchanged distal piping
remain exact**, totaling 264 unchanged object fingerprints. The opposite cuff
and recorded material graph state also remain unchanged. Restore reproduces
**all 14 selected artifact/input files byte-for-byte**.

The selected revision is `9fe00caf1e1649a58554b3a761ee7bbb`; the edit is
`939cbce741ea4707b211092b42cdde7d`; the final restored head is
`f84f840b4d604957b7717b95e8fb873c`. Native and GLB contain 271 mesh objects and
302,196 evaluated/exported triangles. No new garment UV layout, skin rig,
cloth simulation or engine test was completed.

A clean public-CLI replay starts from the original delivered native and reaches
the same selected scene fingerprint and object states. Its 71.307 seconds of
CLI command time is an execution replay measurement, **not** authoring time.
The informed authoring exercise took 22.91 minutes through report completion,
including source review, multiple corrections and a recorded lead review note.
It is not a fresh independent generalization test. See the
[author report](records/author-garment-report.md),
[geometry inspection](records/garment-independent-inspection.json) and
[execution record](records/garment-execution.json).

## Automail: independent creation and common observation

The independent anonymous review prefers **B narrowly over A, then C**.
Unblinding gives **ordinary Blender > fixed 1.x > candidate 2.0**. Every
candidate fails finished visual acceptance. The reviewer is more confident
about that shared rejection than the precise ordering of the first two.
The [raw verdict](records/blind-automail-review.md),
[structured review](records/blind-automail-review.json) and
[mapping](records/blind-automail-mapping.json) are retained without revision.

Ordinary Blender has more visible shoulder segmentation, front actuator cues,
forearm layering and differentiated hand/palm surfaces. The 1.x result has
meaningful local advantages in exposed rear rods and asymmetric forearm armor.
The 2.0 result has larger, flatter panels and a sparser rear upper-arm assembly.
All three simplify the source's nested shoulder housing, contoured overlapping
shells, readable dense mechanisms and nuanced finishes. This exercise supplies
**negative evidence for a claim of 2.0 visual-quality superiority**; it does not
isolate whether guidance, author choices or a stochastic run caused the order.

The controls also complete useful local edits and hierarchy checks:

| Condition | Local cover edit | Recovery evidence | Independent GLB observation |
| --- | --- | --- | --- |
| Ordinary Blender | 14-node cover group, 3 mm; 297 other asset objects plus 5 studio objects unchanged | Reopened state equality; file-byte identity not claimed | 311 asset nodes, named parents/transforms and actual elbow/wrist/finger movement |
| Fixed 1.x | 17-node cover group, 3 mm; unrelated object/mesh/material state preserved | Exact saved candidate `.blend`/`.glb` copies, plus separate in-memory state equality | 247 nodes / 227 meshes, parents and matrices; actual elbow/wrist/finger movement |
| Candidate 2.0 | 26-node cover group, 3 mm; 274 other objects unchanged | Original output restoration; final package replay verifies all 13 artifact/input bytes | 300 nodes / 280 meshes, required parents and analytic rigid orbits |

The original 1.x `validate` command remains **BLOCKED**, with seven missing
source-bound checks, and no certificate was produced. Its separate technical
edit/reopen observations do not override that result. A further diagnostic finds
18 of its 227 imported meshes nonmanifold after positional welding; mirrored
shell winding and bevel evaluation remain prototype limitations. The 2.0
workflow does not implement that same certification gate, so exit codes across
the two interfaces are not an equivalent acceptance comparison. Original
[plain](records/author-automail-plain-report.md) and
[1.x](records/author-automail-legacy-report.md) reports preserve their boundaries.

The new unchanged source is 1447 × 1087 pixels, SHA-256
`3c7856dd632f8a1cde8036078573f569db55b6af97fae853237d8a9356f3c872`.
It is a fictional design sheet, not an engineering specification. The stated
760 mm total, shoulder-interface size and inconsistent hand poses are
interpretation anchors. Physical load, neural coupling, power assistance and
manufacturing feasibility were not tested.

Three independent authors received the source and the same intended complete
arm/edit/pose requirements. The conditions are ordinary Blender without RefAs,
the fixed 1.x skill at `a29bcc42`, and the candidate production skill frozen
before authoring. The frozen skill manifest identifies all 277 files. Authors
choose their geometry and parent representations. This is one attempt per
condition under the same inherited host configuration, without instrumented
model IDs, tokens or costs. Staggered starts and concurrent render contention
prevent a controlled speed ranking. The initial production task brief was
written before the two controls were added; the later common comparison is
explicitly exploratory.

All selected neutral arms are rendered by the same external observer with five
orthographic camera records, one lighting specification, Blender 4.3.2,
Cycles CPU, 512 × 512, 24 samples, AgX and no denoising. These cameras are
**unregistered** to the source; source panel coordinates do not constitute a
camera calibration. Plain Blender's native contains five studio objects outside
its declared asset root; these are explicitly excluded, while 18 curves and
four text objects are realized only in the observation copy. The 1.x scene also
has five explicitly excluded studio objects and no curve/text conversion. The 2.0 scene
requires no conversion or exclusion. The first plain observation failed on
unsupported text before producing a usable comparison; it is not counted.

### Selected 2.0 arm: bounded technical results

The arm has **300 objects: 280 meshes and 20 hierarchy empties**; 159,462
evaluated triangles. The socket, upper arm, elbow, forearm, wrist and five
digit chains are individually editable. Its evaluated height is **743.095 mm**,
not an exact match to the source's nominal 760 mm.

- A service-cover subtree of **26 nodes** moves outward by approximately
  **3 mm**. The remaining **274 objects** preserve their recorded geometry,
  transforms, materials, modifiers and parents.
- Saved native/GLB samples exercise elbow 0°, 45°, 90°, followed by elbow 45°
  with wrist 20° and index joints 35°/20°/10°. Thirty named upper/forearm shell
  pairs per sample show no triangle-surface intersections in these records.
  The pose command's successful exit is not a collision-clearance gate; this
  limited observation excludes containment, all-part or continuous-motion checks.
- Independent GLB import retains all 300 named objects and required parent
  links, with world matrices within 1e-5. Separate imported elbow, wrist and
  finger rotations follow the expected orbits. This tests rigid node movement,
  not skinning, working hydraulics, an engine animation profile or physics.
- The original independent trial checks exact native/GLB/scene and rendered
  output restoration. The subsequent final installed-package replay expands
  that proof to **all 13 selected artifacts and captured inputs**, after the
  cover edit and again after the pose sequence.

The selected original neutral revision is `d4012de785ad42d5b67d5df0d12e6632`.
Its final restored head is `3b26f1ad9446435e9e4dcc2b836227dc`. Deliveries keep
this original selection; the informed package replay is separate evidence.
See [the author report](records/author-automail-v2-report.md),
[export checks](records/automail-export-check.json),
[full compressed preservation record](records/automail-panel-preservation.json.gz)
and [original exercise summary](records/automail-exercise-summary.json).

## Installed package and regression checks

The actual `npm pack` tarball contains **399 files**. It was extracted outside
the repository, and the complete final arm example ran against its skill:
doctor, initialization, first whole, two corrections, cover edit/recovery,
four poses, final recovery, integrity verification and independent GLB import.
All **14 commands** succeed, including 13 public production CLI operations.
An alternate configured Blender path also reaches the independent export check.
Package bytes, final scripts and command records are bound in
[installed-package.json](records/installed-package.json). Earlier replay results
remain separate; no package or release was published.

| Local check | Observed result |
| --- | --- |
| JavaScript regression | 931 passed; 0 failed or skipped |
| Production tests | 35 passed: 23 project/CLI and 12 actual Blender; 0 skipped |
| Python syntax / repository checks | PASS |
| Retained 1.x dogfood | PASS, 11 checkpoints; existing render-integrity scope |
| Release/package audit | PASS; 399 files, 43 reference leaves |
| Guide routing focused checks | 31 passed |

See [local-checks.json](records/local-checks.json). The actual Blender suite was
observed in tool output; no retained original log file exists for that run.
Routine remote CI skips optional Blender tests unless enabled; local actual
Blender results must not be attributed to remote execution.

The lead also independently imported both delivered GLBs into factory-startup
Blender scenes and rendered them again. The three-quarter readbacks retain the
broad native appearance at this preview scale. Procedural cloth material is
not baked, and full texture/shader equivalence or target-engine rendering is
not established. [Garment readback](records/delivery-garment.json) and
[arm readback](records/delivery-automail.json) retain import/render identities.

## Reproduce and use the deliverables

Run the [garment runner](../../../../examples/uniform-jacket/run_refinement.py)
with `--root`, `--skill-root` and `--input-blend`, using the previous delivered
jacket native as its starting point. The new
[arm example](../../../../examples/automail-arm/README.md) starts from its own
source sheet and a fresh output root. Both execute normal Blender scripts via
the public production entry; they do not import repository-private modules.

The downloadable artifact contains selected editable natives and GLBs, local
edit variants, arm pose samples, sources, scripts, first/control candidates,
raw reports and the offline viewer. It does not duplicate the complete repository
or every large revision history. Absolute paths inside raw reports describe
the original execution environment; included file identities and a bundle
manifest identify the delivered copies.

## Decision and next work

Short domain guidance is reachable and usable on both continuous cloth and
rigid assemblies. Partial edits and recovery work on these concrete assets.
The implementation checkpoint is ready for code review. R2-05 and R2-06 remain
WIP because useful guidance has not met the intended source-quality outcome and
the broader evaluation/distribution requirements remain open. This does not establish
2.0 quality superiority, complete source reconstruction, cost savings or
release readiness.

The next visual work should target source proportions and compound surfaces:
the jacket's folded collar/lapel relationship and the arm's armor mass and
mechanical negative space. It should use actual fixed views and retain failed
attempts. Broader skin/UV/engine profiles, explicit 1.x migration, cost telemetry
and coordinated 2.0 packaging remain open. Package metadata remains 1.4.2;
PR #399 remains a draft, and main/release are unchanged.
