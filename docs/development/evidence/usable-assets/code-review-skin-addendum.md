# Review addendum: delivered skin vertices and corrective shape animation

Date: 2026-11-22. This addendum follows [the initial review](code-review-initial.md)
and [the first follow-up](code-review-followup.md), without changing either.
It reviews the newly added Godot skin-vertex path and the shape-key
`animation_record` integration. It does not inspect private character geometry
or judge garment appearance.

## Decision

**The shape-key animation-record change has no new blocking finding. R4 was
reproduced, repaired by the owner, and independently closed with the original
fixture and corrupted-weight control. The current skin observer is accepted
within the sampled headless CPU scope described below.**

The initial six actual Godot regressions and three Blender animation regressions
passed, but a separate two-bone blended-weight fixture failed to establish any
rest vertex correspondence for its valid unmodified GLB. This is not evidence that
its mesh or bone animation is wrong: bone matrices agree, and the mismatch is
caused by using the already quantized skin result to identify the rest vertex
under a stricter correspondence threshold.

The owner subsequently separated rest correspondence from quantized deformation.
The renderer-compatible raw weight sum remains in the actual deformation result;
only the rest association calculation divides the skeleton-local weighted point
by its near-unit weight sum. The original tolerances are unchanged. Rechecking
the original synthetic GLBs passes the normal asset and still rejects deliberately
corrupted delivery weights. The new eight-test Godot suite also passes.

The reviewer did not edit implementation, assets under author construction, or
progress state. At the owner's follow-up request, the synthetic fixture, normal
and corrupted GLBs, native expectations, actual observations and reviewed
observer snapshot were preserved under
[consumer/reviewer-multi-influence](consumer/reviewer-multi-influence/manifest.json).
These are synthetic cubes/bones only, with no private geometry.

## Reviewed bytes

| File | SHA-256 |
| --- | --- |
| `examples/engine-playback/run.py` | `1369adf6f804a02137fe3f2f3cf97312597fb8a9a86464105dda5a002b1b9034` |
| `examples/engine-playback/verify_godot.gd` | `7ac1c173b250acf515bcff917fa615aa1f1e11426182203b61d1bbe72409ecda` |
| `skills/refas/scripts/production/blender_worker.py` | `28e12da88efddd995a4ed7e8127763941626c4467ce4f8c8182e26c8250a80cc` |
| `tests/test_production_engine_playback.py` | `1ecf1a7c637268c04a269375d13a14d70a5078ff9ba92f1bdc5d453eae3e428e` |
| `tests/test_production_animation.py` | `99adb85b96c5d5150d880b24464e0996421fb1cbe9c54c7846cea136cf78ae1c` |

## Independent actual executions

| Check | Result |
| --- | --- |
| `REFAS_GODOT_TESTS=1 python3 -B -m unittest discover -s tests -p test_production_engine_playback.py -v` | 6 passed, 0 failed/skipped; 4.317 s |
| `REFAS_BLENDER_TESTS=1 python3 -B -m unittest discover -s tests -p test_production_animation.py -v` | 3 passed, 0 failed/skipped; 9.273 s |
| Separate blended-weight fixture generation | Blender 4.3.2 completed normally and exported the synthetic GLB |
| Unmodified two-bone GLB through current observer | Exit 1; all 15 rest correspondence checks fail, despite matching bone matrices |
| Same GLB with only encoded weights deliberately replaced | Exit 1; rest correspondence succeeds and nine posed skin checks reject incorrect deformation |
| Public Godot skeleton-bake oracle attempt | Returned null with invalid skeleton RID error under the headless backend; **not a successful oracle** |

Godot reports 4.7.2 stable, official build
`ed1daf0bf001b61586d9930840f2f1394092c079`. The actual scripts and command/stdout/
stderr/result files are retained with the fixture. The commands above are local
regression measurements, not modeling-speed comparisons.

## R4 — Quantized deformation is incorrectly used to establish rest correspondence

**Priority: P2 for the new skin-observation path.** Relevant code is
`examples/engine-playback/verify_godot.gd`, `match_vertex` lines 98–119 and its
use of `skinned_point`, followed by the cached match at lines 239–245 in the
reviewed snapshot.

### Concrete fixture

The independent fixture contains a cube with eight unique source vertices,
two parented bones, 0.35/0.65 weights on every vertex, nonidentity rig and mesh
transforms, and a synchronized corrective shape. Three distinct cube corners
are observed at five frames. This exercises ordinary blended skinning that is
absent from the current single-bone weight-1.0 fixtures. The original six tests
are useful controls but cannot expose weight quantization.

The GLB's source weights are approximately 0.65 and 0.35. Godot's imported arrays
contain:

| Observation | Actual value |
| --- | --- |
| First imported nonzero weight | 0.649988532066345 |
| Second imported nonzero weight | 0.34999617934227 |
| Imported sum | **0.999984711408615** |
| First native rest point, Godot world coordinates | `[0.8109430074691772, 1.4907653331756592, 0.3070255219936371]` |
| Current raw skin result | `[0.810936689376831, 1.49075162410736, 0.307023823261261]` |
| Raw result's native discrepancy | **0.000015190211855451747 m** |
| Correspondence threshold | 0.00001 m |
| Subsequent deformation threshold | 0.00002 m |

The first raw discrepancy is about 15.2 micrometers: above the correspondence
threshold but below the separate 20-micrometer deformation threshold. The code
therefore returns a missing rest match before its actual deformation comparison
can run. Since the null match is cached, all later observations for that label
also fail with no location or distance detail. All three corners encounter this
problem. Meanwhile every sampled bone matrix matches, with a worst matrix
coefficient discrepancy around `2.384e-7`.

This is a correspondence-stage false rejection. It does **not** imply that any
arbitrary quantized result must be accepted against a strict 20-micrometer
promise; actual observed displacement and the declared precision requirement
must remain separate.

### The negative delivery control is real

The probe also changes only the GLB `WEIGHTS_0` accessor values to `[1,0,0,0]`,
leaving node animation, geometry, shape keys and native expectations unchanged.
That one-bone sum is exactly one and its rest vertices match. At intermediate
poses, the observer rejects all nine affected corner observations with errors
of approximately 0.0198–0.0468 m. This establishes that the path uses imported
weights rather than merely validating a skin resource or trusting native
weights. It also supplies a useful retained negative control for the fix.

### Why unconditional normalization is the wrong fix

Normalizing the two imported weights would bring the first point within about
`1.333e-7 m` of native, but that is only a diagnostic calculation, not an
approved change to consumer observation.

Official Godot master renderer source was inspected for both the rendering-device
and GLES3 paths. Both four-influence and eight-influence branches form raw
weighted bone transforms and extract the resulting XYZ position without
renormalizing the weight sum. The public CPU skeleton-bake implementation uses
a source-plus-weighted-deltas calculation, so it is not interchangeable with
that shader operation when the sum differs from one. These source inspections
support preserving the raw-weight observation; they do not establish that the
installed build's GPU renderer was executed.

Primary source links inspected on 2026-11-22:

- [Rendering-device skeleton shader](https://github.com/godotengine/godot/blob/master/servers/rendering/renderer_rd/shaders/skeleton.glsl).
- [GLES3 skeleton shader](https://github.com/godotengine/godot/blob/master/drivers/gles3/shaders/skeleton.glsl).
- [MeshInstance3D public CPU baking implementation](https://github.com/godotengine/godot/blob/master/scene/3d/mesh_instance_3d.cpp).

The exact installed commit URL could not be retrieved. The claim here is
explicitly based on the named master sources plus actual imported data from the
installed runtime. No GPU behavior was measured. The attempted public
`bake_mesh_from_current_skeleton_pose` returned null because the headless skin
reference had no valid rendering skeleton RID; that failed attempt and its
stderr are retained, not reported as a successful reference result.

### A separate coordinate trap to avoid

Correspondence also cannot blindly apply `mesh_node.global_transform` to raw
imported positions in every skinned asset. In this fixture the encoded first
`POSITION` already equals the expected world rest point within roughly
`1.2e-7 m`, while Godot's mesh node carries the rig world transform. Multiplying
that raw position by the node world transform gives
`[1.68617689609528, 1.98886036872864, 0.325254917144775]`, over one meter away.
The imported bind/rest relationship is necessary to interpret those coordinates.
The correctly weighted current path incorporates that relationship, which is
why its raw error is only about 15 micrometers rather than one meter.

**Requested correction:** establish and retain rest correspondence in the
correct imported bind/rest space independently from the quantized posed-distance
verdict. A correspondence-only normalization, if used, must be explicit and
must not replace the raw result used to report deformation. Record the imported
weight sum, correspondence method and distance, raw observed skin discrepancy,
and any justified quantization/precision interval. Keep the declared threshold
unchanged; label unresolved precision honestly instead of granting a hidden
relaxation. Ensure the unmodified blended fixture gets a meaningful measured
comparison, while the deliberately corrupted weights still fail.

## Shape-key animation-state review

The new `animation_record` is called both for object animation data and for
`obj.data.shape_keys.animation_data`. It captures the active action and NLA
tracks/strips through the same compact action-state serializer. The shape-key
animation record is included before the object fingerprint is calculated.
Thus a corrective key can affect recorded identity even when its current-frame
value and evaluated mesh are unchanged.

The actual Blender regression now explicitly sets frame 1, changes an interior
shape-key action key at frame 61, and checks that the object fingerprint changes.
That test passed in the independent three-test run. Code inspection also
confirmed that NLA actions used by shape-key datablocks traverse the same action
record path. The synchronized morph/skin consumer fixture uses both NLA tracks
and passes in the existing six-test suite.

No new blocking issue was found in this refactor. The previous record's limits
remain: it observes the represented action/strip state and current geometry,
not every driver, simulation or deformation state. The added coverage should
not be described as universal animation preservation.

## Rest matching and consumer scope

The new observer reads the imported surface's joint indices, weights and Skin
bind transforms, and evaluates them against Godot's current Skeleton3D pose.
For corrective shapes it calls the working public blend-shape baking API before
skinning and records actual animation weights per sample. The matched surface
and vertex index stay fixed through the observations. It rejects absent skins,
bind indices outside the imported Skin, unavailable bones, invalid influence
layouts, unsupported weight sums and missing correspondence. These are useful,
concrete checks.

The README also correctly records headless CPU scope, sampling limits, coincident
vertex ambiguity, and the absence of GPU appearance or collision guarantees.
Coincident exported vertices are not all verified by selecting one representative
match. The current movement gate is based on declared node/bone matrix change;
pure morph-only motion remains outside that gate. The current corrective-use
fixture combines skeletal movement and morphs, so this latter boundary does not
explain R4.

## Retained evidence and reproduction

The manifest at
[consumer/reviewer-multi-influence/manifest.json](consumer/reviewer-multi-influence/manifest.json)
binds all retained files by hash. Key files are:

- `build-fixture.py`: complete ordinary Blender fixture and actual GLB weight mutation.
- `asset.glb`, `wrong-weights.glb`, `mutation.json`: unchanged exported asset and explicit corrupted delivery control.
- `inspection.json`: native evaluated bone matrices and the three corner positions at all five frames.
- `positive/` and `wrong-weights/`: configurations, actual commands, stdout/stderr and full observer results.
- `inspect-imported-weights.gd`, `imported-weights.json`: direct Godot array and transform diagnostics.
- `skin-bake-attempt.*`: actual public skeleton-bake attempt, including its failure.
- `runner-before.py`, `observer-before.gd`: the reviewed consumer implementation, frozen before a fix.
- `summary.json`: reviewed hashes and numerical comparison summary.

The generation script uses the explicit checkout path and `/tmp` output path
shown in its source. Adjust those two roots to replay elsewhere. For a historical
observer replay, copy an existing retained configuration, update only `asset`
to the retained GLB's absolute path and `output` to a new file, and run the frozen
`observer-before.gd` with Godot's `--headless --path examples/engine-playback
--script ... -- CONFIGURATION_JSON` arguments. This avoids silently replaying a
later corrected observer while claiming to reproduce the old failure.

## R4 repair and independent closure

After the initial failing evidence was frozen, the owner changed `skinned_point`
to accept a `rest_association` flag. `match_vertex` alone passes `true`. Inside
that branch, the skeleton-local weighted position is divided by its weight sum
before applying the skeleton world transform. The actual per-sample deformation
continues through the default `false` path and retains the imported raw weights.
The explicit report and README describe this distinction. The rest tolerance
remains 10 micrometers; the actual deformation tolerance remains 20 micrometers.

This avoids mixing mesh and skeleton coordinate spaces. The division is only a
correspondence rule for a declared rest sample; it is not represented as a
measurement of rendered deformation. I inspected the entire small code diff and
then reran the exact retained input binaries and original native inspection,
without regenerating the fixture.

| Recheck | Actual result |
| --- | --- |
| Retained unmodified two-bone GLB | Exit 0; all 15 vertex probes and all bone checks passed |
| Largest rest association error | 0.000000133280039449346 m (0.1333 micrometers) |
| Largest actual raw skin error | 0.0000177811507455772 m (17.781 micrometers), retained in the output |
| Retained GLB with changed delivery weights | Exit 1; all rest associations succeed, nine posed native skin checks fail |
| Largest corrupted-weight position error | 0.0467854924499989 m (46.785 mm) |
| New actual Godot regression suite | Eight passed, no skips, 6.645 seconds |

The new regression fixture is derived from this independently retained case.
The positive test asserts that the real quantized deformation difference remains
greater than 5 micrometers, while its rest association error stays below
1 micrometer. This would catch accidentally applying normalization to both
paths. The delivered-weight negative test mutates actual GLB bytes and requires a
failed native skin check; it does not merely change the expected result.

| Repaired/rechecked file | SHA-256 |
| --- | --- |
| `examples/engine-playback/verify_godot.gd` | `325ed366c6386e06b84c179eabfd70b87d8ca497b9f112b2d80a6b4593ad5846` |
| `examples/engine-playback/README.md` | `50735199e318072c59da58f1983f1652bd398aeb52fdd91e5eba3240b0c47b8a` |
| `tests/test_production_engine_playback.py` | `13ce502a4b73068c8ea953cffcc93abe2e4bd83a923ff3dd61241b03c3d6b942` |
| `tests/fixtures/production_weighted_skin.py` | `79684c1b839b548614cd050487703470a995ee7d907280f9b0406803abd1ef1e` |

The immutable failing evidence remains in its original directory. The recheck
commands, complete Godot results, current observer snapshot, summary and hashes
are preserved separately in
[consumer/reviewer-multi-influence-repaired/manifest.json](consumer/reviewer-multi-influence-repaired/manifest.json).

**R4 is closed for this repaired observer.** This pass does not claim an exhaustive
weight-layout or all-vertex proof: executed positives use one or two nonzero
influences, while the renderer source review additionally covered its four/eight
layout branches. The acceptance scope remains the declared samples, joints and
skin vertices, with headless CPU evaluation and no executed GPU-render claim.
The earlier R1/R2/R3 corrections and shape-key state refactor remain accepted
within their previously reviewed scope. Actual garment inspection is a separate
follow-up against its selected artifact and native expectations.
