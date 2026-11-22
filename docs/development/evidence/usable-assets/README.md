# RefAs 2.0: actual use, mesh condition, retopology and optimization

## Scope and status

This slice implements the user's 2026-11-22 expansion from static prototype
reconstruction to actual character wearing and articulated use. The literal
request, pre-dispatch author briefs and fixed acceptance criteria are retained
in [the protocol](PROTOCOL.md), [prompts](prompts/dispatch.json) and
[U1–U6](new-criteria.json). It continues issue #398 / Draft PR #399 from
`5fd694ade366bba9f1a977df7ebcae67625e1b9c`.

Checklist v1 remains historically **28/31 = 90%**. Adding six user-requested
criteria produces a v2 scope-change baseline of **28/37 = 76%**. Definitions
alone receive no completion credit. Final asset selection and criterion review
are recorded separately from successful runtime execution.

The selected source inputs are the previous jacket `identity-04` and arm
`candidate-05`, with their complete original reference sheets. The garment
uses the user's actual existing VRM character. Its original geometry, skin
weights and bone rest transforms must remain intact. That avatar does not
contain a complete naked torso beneath its original shirt; the fit therefore
includes that existing shirt and cannot establish universal body fit. Private
character geometry and textures are excluded from this public evidence tree.

## Implemented production behavior

The installed skill now teaches inspection of unintended holes, winding,
nonmanifold or degenerate geometry, intersections and unsupported attachments;
actual wearing or articulated motion; deliberate retopology; and optimization
against an explicit delivery budget. These are ordinary Blender operations
with retained source, local edit and recovery evidence. Polygon reduction by
itself is not retopology, and successful import does not grant visual approval.

The new `production-topology.md` guide and small `mesh_audit.py` observation
module remain within the active 2.0 skill. There are **17 skill files** including
two cache-exclusion files, **15 substantive files**, and **19 packaged files**.
The exact distribution allowlist continues to reject old-runtime reinsertion.
The package identity remains unpublished `2.0.0-alpha.1`.

### Mesh observations with real negative controls

The read-only helper audits evaluated mesh topology and explicit anchor-to-
surface distance. It reports observations rather than deciding source intent
or arbitrary game readiness. Its 14 actual Blender regressions include open,
reversed, nonmanifold, degenerate and loose geometry and real attachment gaps.
Initial failures and independently found counterexamples remain in
[mesh-audit](mesh-audit/README.md).

Independent review found that a pair of closed surfaces touching only at one
vertex could cancel a signed-volume total, and that a small gap far from the
world origin could lose precision. The repair separates face-connected
surfaces and uses stable local double-precision distance calculations. A gap
whose numerical uncertainty overlaps its declared threshold is indeterminate,
not silently accepted. See [initial review](code-review-initial.md) and
[repair review](code-review-followup.md).

### Animation survives observation and export

Long baked actions previously expanded into an approximately 13 MB scene
record, exceeding the existing 8 MiB manifest bound. Action observations now
retain counts and hashes over all actual curve keys, handles, interpolation,
easing, sampled points and represented modifiers; animation keys in the native
asset and GLB are not removed. NLA strip state and corrective shape-key actions
also contribute to scene identity. The manifest limit is unchanged.

Review caught a separate rendering issue: the isolated render scene reset FPS
and discarded fractional frames. Rendering and GLB comparison now preserve
the source FPS, FPS base, frame and subframe. A real 30 FPS / frame 19.5 fixture
checks the rendered evaluated position, rather than merely comparing metadata.
The importer disables Blender's optional bone-display meshes at import time;
it does not delete real assets based on names such as `Icosphere`.

The three actual animation regressions exercise long actions, NLA, skinning,
corrective shapes, interior-key changes and fractional-frame rendering.
This is represented animation-state coverage, not a claim that every driver,
simulation or possible future pose is captured.

### Actual exported playback in Godot

The repository-only [consumer](../../../../examples/engine-playback/README.md)
opens the delivered GLB with Godot 4.7.2, creates a real scene and evaluates its
named animation through `AnimationPlayer`. Native Blender observations are
compared against actual imported node/bone matrices at recorded export times.
Skin probes additionally use imported joint indices, weights and inverse bind
matrices with the evaluated skeleton; corrective shapes use Godot's public
blend-shape baking API before skin evaluation.

The observer retains the consumer's quantized weights in actual deformation.
Only the initial vertex association compensates for a near-unit weight sum.
Independent review reproduced a valid two-bone fixture with an approximately
18 micrometer consumer difference, then confirmed that deliberately corrupted
delivery weights still fail by up to about 47 mm. No actual deformation error
is normalized away. [The review and counterexamples](code-review-skin-addendum.md)
retain the failed initial association, its repair and the unchanged thresholds.

This is **headless scene/animation and sampled CPU deformation evidence**.
There is no GPU appearance, measured FPS, physical strength, grasp-contact or
universal engine-compatibility claim. Eight actual Godot regression cases pass,
including wrong bones, wrong skin expectations, corrupted GLB weights, missing
or stationary clips and synchronized morph/skin animation.

## Installed distribution and recoverability

The actual npm archive was installed outside the repository. Every one of its
19 installed files matches the tested source by SHA-256. The installed CLI
opens an animated native model, imports the new mesh helper, performs a 3 mm
service-cover edit and restores the original state. It preserves 131 unrelated
object transforms, and all eight captured input/output files restore exactly.

[Installed-use evidence](installed-use/README.md) explicitly identifies its
input as arm candidate-04, which was later rejected for a visible palm defect.
That execution proves package operation and recovery only; it is not final
asset-quality evidence. Selected-asset recovery is recorded with each final
asset independently.

## Executed regression gates

The exact commands, UTC clocks, environment and stdout/stderr are retained in
[checks/summary.json](checks/summary.json). The current runtime execution uses
`REFAS_BLENDER_TESTS=1` and `REFAS_GODOT_TESTS=1`; it does not count skipped
application-dependent tests as passes.

| Gate | Actual result |
| --- | --- |
| JavaScript regression | 935 passed, zero failed or skipped |
| Final Production suite | 90 passed, zero skipped: 47 standard-library/CLI, 35 actual Blender, 8 actual Godot |
| Python syntax | Passed |
| Repository/plugin/skill checks | Passed |
| Retained 1.x dogfood | 11 checkpoints passed |
| Release/package audit | Passed |
| Final distribution test | 4 passed, including actual package and legacy-contamination rejection |

The earlier 87-test production run is retained as historical execution. The
90-test run includes the later corrective-shape and quantized blended-weight
regressions. Standard remote CI does not install Blender/Godot; its scope must
not be described as repeating all local actual-application checks.

## Comparison and cost boundary

These are informed continuations of known source assets, with overlapping
workers on one machine. The recorded command durations are actual execution
measurements, but do not establish comparative modeling speed. Full pre-read
clocks, matched no-skill/fixed-1.x/2.0 resources and provider token/billing
telemetry are unavailable. Model and tool costs remain null with reasons;
subscription prices and command counts are not substituted for billed cost.

Consequently **E2 and U1 remain open**. The prospective comparison protocol now
includes source likeness, mesh condition/attachments, actual use, retopology
and optimization for both task types. A later informed repair cannot replace
that independently matched trial. Main merge and formal publication, D2 and
D3, also remain separate unfinished milestones. PR #399 remains Draft.
