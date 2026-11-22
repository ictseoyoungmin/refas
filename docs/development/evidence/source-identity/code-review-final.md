# Source-identity code review: repaired implementation snapshot

**Review snapshot:** `2026-11-22T12:28:11.400116+00:00` (2026-11-22 21:28 KST).
The review is informed and read-only with respect to implementation. It is not
the isolated visual review. The reviewer wrote this report and the separately
retained [historical initial review](code-review-initial.md), and did not modify
implementation, run production renders, or change remote state.

## Decision and execution boundary

**No unresolved blocking code defect was identified in the scoped snapshot
after the concrete repairs below.** The four initial findings were repaired.
The later baseline-wide preservation gap and interrupted-exercise selection
defect were also repaired in the code read for this review. The arm's render
timestamp was relabeled with an explicit correction rather than silently
reinterpreted.

This is a static code review plus a small read-only comparison of already
written scene observations. **The repaired final native/GLB inspection,
cover/pose exercise, exact restoration, and actual readback renders were still
pending at this snapshot.** Their successful execution must be established by
the author/root execution records. This review does not mark those checks
passed and does not close K4 or E2. Authors were still refining visual geometry;
later byte changes are outside the exact file snapshot recorded below.

## Scope and approach

The review covered the new garment runner, the repaired automail mesh helper,
the automail runner, independent construction inspector and construction pose
checker. It also read the existing cuff edit, arm cover edit, arm pose checker,
garment native/GLB inspector, and relevant original construction code to
understand the fixed baseline's coordinate frames, parent relations and edit
roles. The original source/task acceptance audit remains separate.

Checks performed here:

- Trace candidate publication, selection and restoration paths without
  launching those paths.
- Read the actual first arm failure log, and verify the corresponding repair
  in source.
- Verify that baseline identity checks cover intentionally geometry-changed
  original objects as well as protected objects.
- Trace factory-startup GLB import and independent cover/centroid exercises.
- Parse the eight Python files listed below with `ast.parse`; all parsed.
  Syntax parsing is not an execution or rendering result.
- Compare the already written baseline and `candidate-04` scene observations
  for original object names, parents, local/world matrices and used material
  fingerprints. This observation is detailed below and does not replace the
  newly added native-file check.

## Initial findings: repair verification

| Finding | Observed correction | Scope of verification |
| --- | --- | --- |
| New arm pieces were created as Empty objects and then assigned Mesh data, causing the retained Blender failure | `refine_construction.mesh()` now creates the object with an initial Mesh datablock. It then replaces that mesh with the authored world-to-local geometry and removes an unused old mesh datablock. | Source inspection; retained failure demonstrates the original defect. The reviewer did not rerun construction. |
| Reusing a garment candidate label overwrote images while finalization selected the first same-label record | `run_identity.py` refuses an already recorded candidate label before starting candidate commands or capture. | Source inspection of guard placement before execution. |
| The generic arm runner embedded a historical author clock in future replay metadata | The fallback now records a null author start and states that it is unavailable; runner start is measured separately. A supplied author timestamp is identified as caller supplied. Hardcoded package revision attribution was also replaced by an explicit optional caller-supplied identity. | Source inspection. Existing historical session evidence is not automatically rewritten. |
| A later garment stage could substitute a different native input while retaining the original baseline record | The runner checks the supplied native SHA-256 against the recorded original, and separately checks the source-image SHA-256, before stage execution. Different bytes require a new root. | Source inspection; this does not imply the earlier actual run used a wrong input. |

The garment runner additionally records the candidate script hash from the
captured revision input, and final reproduction copies that selected captured
script rather than whichever authoring script happens to be current later.
These operations keep the selected native and its construction source linked.

## Later findings and concrete repairs

### All-original arm preservation

The initial arm runner compared full scene records only for objects outside
`changed_existing_objects`. That was suitable for protected geometry, but it
could not substantiate a claim that all original parents, pivots, transforms
and material datablocks were preserved: objects with intended geometry changes
were excluded. Comparing the candidate to its exported GLB also could not prove
preservation relative to the old baseline.

The revised `inspect_construction.py` now takes both `baseline.blend` and
`native.blend`, opens them separately, and captures each asset object's type,
parent, basis matrix, parent inverse, world matrix and material-slot names. It
iterates **every original tagged asset object**, without excluding the
intentionally rebuilt meshes. A missing object or unexpected field change
fails the identity check.

Only the two explicitly repositioned crown markings may change basis/world
matrices. Their parent and parent inverse must still match. Material assignment
changes on declared rebuilt meshes are recorded with before/after values;
these are distinct from material datablock changes. This distinction is needed
because, for example, the rebuilt cover ribs intentionally use graphite
instead of the old metallic material.

The inspector hashes every original material datablock's recorded
diffuse/PBR values, node types and input values, and graph links. Missing or
changed original material hashes fail the final result. This is an explicit
snapshot of these properties, not a universal assertion about every possible
Blender RNA property, linked library, node-group dependency or external image.
The supplied baseline materials and authoring operations are the scope here.

The final `passed` conjunction includes this baseline-to-selected identity
result. The runner passes the saved original native into the inspector. Thus
the stronger preservation claim now has a concrete check instead of only
authoring intent. Execution of that repaired check remained pending at review.

### Explicit neutral selection after an interrupted exercise

The initial arm exercise took the current project head as its neutral state.
If an earlier exercise stopped after publishing the 3 mm cover edit, a retry
could treat the already-offset model as neutral while the open-service
comparison continued using `latest-candidate.json`.

The repaired runner reads the explicit candidate revision from
`latest-candidate.json`, restores it when the current head differs, and checks
the complete manifest-selected artifact/input hashes against the candidate
before exercise. The local edit and pose recovery target that explicit
candidate revision. A restored revision may have a new revision ID; equality
is correctly checked against its payload rather than requiring the IDs to be
identical.

This repairs the identified selection inconsistency. It was verified by source
inspection, not by injecting a fresh interruption into a production run.

### Render timestamp meaning

The arm's old `first_actual_rendered_candidate_utc` value was recorded after all
requested views completed. It therefore measured observed bundle completion,
not first-image completion. The revised code records
`first_candidate_render_bundle_observed_complete_utc` and, when an older value
exists, retains it with a correction explaining its former label. It does not
invent an earlier first-image time or a visually useful-edit decision.

The garment runner separately records the earliest captured PNG modification
time and the time at which the full candidate bundle was observed complete.
Its explicit author start remains external session evidence. Neither runner
converts these observations into matched no-skill/1.x/2.0 performance results.
Token and monetary-cost fields remain unavailable rather than estimated from
file size, CPU seconds or wall time.

## Verification paths reviewed

### Local edits and exact recovery

The garment finalization exercises the existing cuff edit, requires seven
changed objects, a 1 cm measured band increase, unchanged protected objects
and material state, then compares the restored artifact/input bundle with the
selected candidate. It reopens the native, imports the GLB and requests actual
readback views.

The arm exercise invokes the actual existing `edit_panel.py` through the public
production CLI. That script selects `SERVICE_COVER` and its descendants,
applies the declared +3 mm local normal displacement, snapshots geometry,
modifiers, materials and parent relations, and asserts uniform displacement
plus unchanged unrelated objects. The runner hashes every artifact/input file
listed by the selected revision manifest and checks equality after the panel
restore and again after the pose sequence. It also runs project integrity
verification. This checks saved payload restoration; restoration naturally
creates new revision metadata and is not claimed to preserve revision IDs.

The selected neutral native is used independently for each pose input. The
separate large cover-opening diagnostic is not confused with the 3 mm local
edit or treated as the model's neutral position.

### Independent native/GLB inspection

The arm inspector opens the baseline and candidate native files for the
preservation check. It then resets Blender to an empty factory scene and
imports the selected GLB. It verifies the expected object set, parents,
world matrices, overall bounds and required shoulder/elbow/wrist/digit/added
part parent relations. It saves a neutral imported native for the later actual
readback-render phase.

On the imported GLB scene it separately applies a 3 mm cover displacement and
requires unchanged unrelated nodes. It then samples elbow, wrist and index
rotations, predicts descendant mesh centroids from pivot centers/axes and
compares them with actual transformed centroids. Each sampled basis is restored
after its check. The native construction pose checker similarly predicts new
component centroids through the known neutral joint chain. Its global-X
rotation assumption matches the supplied neutral pivots and declared sample
axes; it is not advertised as a general rig validator.

The inspector reports topology rows for the changed and added native meshes.
Those rows are **observations**, not a universal topology pass: the final
`passed` expression does not make every reported topology count an acceptance
gate. GLB object/matrix/bounds equality likewise does not establish complete
point-for-point geometry, shader, UV or procedural-material equivalence.
Actual readback images and their assessed scope must remain separate evidence.

The new neutral cover/rib-versus-cartridge BVH check is limited to its named
pair set. Existing posed shell checks and the new centroid checks also declare
their limited coverage. Surface intersections do not test containment, a few
poses do not establish continuous clearance, and these checks do not prove
working hydraulics, skinning, physics or engine readiness.

## Read-only observation of existing candidate data

At the snapshot, `latest-candidate.json` named **candidate-04**. Comparing its
already generated scene observation against `candidates/before/scene.json`
found:

- 300 original objects and 341 current objects; no original names missing.
- No original parent changes.
- Local and world matrix changes only for `Crown_A_mark` and `Crown_AURIX`, the
  declared marking exceptions.
- No changed fingerprints among the original used materials represented in
  those scene observations.

This was an independent read of existing JSON, not a native reload performed by
the reviewer. It does not check parent-inverse/basis matrices absent from that
JSON, orphan material datablocks, final candidate revisions created later, or
the pending repaired inspector's execution. The native inspector adds those
specified checks where applicable.

## File snapshot

SHA-256 values below identify the reviewed snapshot; they are not claims that
later edits have been re-reviewed.

| Path | SHA-256 |
| --- | --- |
| `examples/uniform-jacket/refine_identity.py` | `2906c70eaa0aa5a82961c6d59b408d907eadc035eae86b9e2afbfdf859537abd` |
| `examples/uniform-jacket/run_identity.py` | `867a8a611c72e8aff749776e164963601feaec1bd792a6a49f48aa0b65ffb763` |
| `examples/automail-arm/refine_construction.py` | `d198119ef42caca5241514abc5dbc1e7a0fb7826c2358ab7683f5fbaacb7dfc6` |
| `examples/automail-arm/run_construction.py` | `000e33edfcaa27d2d75d0756b0f870bb0f75fae8b6741a3a889b161da94d5470` |
| `examples/automail-arm/inspect_construction.py` | `467984254cc34acb642de23d3ca44e6f37c8469783c5b604407c49f80d4aec32` |
| `examples/automail-arm/construction_pose_check.py` | `165da7ad20b64da4f67b152f63b64d508dde0aaf78dd3cc14cce6f5bab5a7573` |
| `examples/automail-arm/edit_panel.py` | `523ad603f9dc23d82b786ce00a82797df1b5c9d24b1c4d0997eb47f1a8f780db` |
| `examples/automail-arm/pose_check.py` | `e5e47ea44bd9effa34579c5087b4cf0db2515463c56cfd549c5909632d483d6a` |

## Remaining handoff

Root/authors must verify the completed execution outputs against the actual
selected native/GLB hashes, keep all failed/retained attempts, and ensure the
final visual packet and delivery reference the same selected revisions. This
review supplies no final-art decision, calibrated likeness score, controlled
cost result, merge approval or release approval.
