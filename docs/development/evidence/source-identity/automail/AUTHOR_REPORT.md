# AURIX automail: source-construction refinement

## Selected result

The selected result is **candidate-05**, production revision
`e661b5fd53e447879bd4baff5f4bbb9f`. The final neutral restore published
`041215ef5be3467fa64df97041c9a5ee` with byte-identical selected artifacts and
captured inputs. `native.blend` is editable and `arm.glb` is the independently
reopened rigid-part export. The original image and native baseline are included
unchanged under `source/` and `baseline/`.

This is an informed continuation of the saved AURIX arm. It uses the complete
original design sheet, prior authoring assumptions, the existing native model,
and previous review findings. It is not a fresh workflow benchmark.

## What changed and why

### Armor construction

The old shoulder and forearm read mainly as broad smooth white caps. The new
shoulder has a shaped central shield, a separate top lock plate, returning side
caps, and a recessed graphite carrier. The forearm now uses primary ridge
panels, separate shorter lateral returns, and dark inner carriers. Their gaps,
thickness and depth are mesh construction, not painted lines or altered
lighting. The original socket geometry, bearings and principal proportions
remain in place.

The first rendered revision made the panels too sharply faceted and extended a
shoulder return into the visible socket bore. Those specific defects were
corrected by changing the return trajectory and smoothing longitudinal panel
sections. The final images retain the stepped panel relationships while
recovering the source's manufactured surface character.

### Upper-arm mechanism and service bay

The original broad rear backbone hid the central actuator. Its revised load bed
sits farther toward the front, exposing the central piston, machined sleeve,
gland and paired side mechanisms. A small rear mounting bridge and two routed
return pipes connect the visible assembly. Every component remains local to the
upper-arm segment; none is a rigid hydraulic bridge across the elbow.

The service area now has a recessed dark bed, an actual opening frame, two
cartridges with distinct rods, glands, sleeves and bands, and a lower manifold.
Those internals are children of `ELBOW_PIVOT`, so removing the lid does not move
the mechanisms. Existing lid and vent objects were reshaped into a fitted cover
and its inner ribs, retaining the `SERVICE_COVER` subtree and local +Y edit
normal.

The neutral model keeps the service lid closed. A separate matched inspection
pose moves the entire lid +95 mm in local X and +15 mm in local Y, then rotates
it 125 degrees around local Z. This exposes the cavity and ribbed inner face.
The baseline and selected model use precisely the same lid pose and camera.
This is an exploded inspection pose, not a validated hinge mechanism. It is
separate from the required 3 mm local cover edit.

### Palm and fingers

The palm has a restrained broad body, separate thumb-side, central and outer
contact pads, and four distinct dorsal metacarpal plates. The thumb-side pad
is deliberately asymmetric. The fingers retain their original lengths, fan,
joint origins and three-segment chains, but their structural links, ivory
shells and grip faces now taper differently for proximal, middle and distal
segments. The knuckles are more compact, and the distal caps have rounded
tapered ends. The first overly pointed tips were rejected and corrected.

The gold accents are concentrated at bearings, glands and narrow reveals.
The original ten material datablocks are unchanged. Thirteen assignments on
reauthored meshes intentionally changed: the service bed and two crown reveals
use the dark recess material, and the ten former silver vents now use graphite
as inner lid ribs. The independent report records every such assignment.

## Source interpretation and limits

The source is an uncalibrated concept sheet. Its visible layered panels,
exposed rear mechanisms, paired service components, segmented hand and
ivory/graphite/gold hierarchy guide the result. Exact panel depths, shell
thickness, hydraulic routing and hidden attachment dimensions are engineering
inferences, not measurements from the image. The source's conflicting segment
labels and different hand poses remain the same interpretation used by the
baseline.

The scene uses metres, Z up and front at -Y, with the thumb at -X. All 20
original pivot objects and their origins are retained. The evaluated envelope
is approximately **165.24 × 127.08 × 745.35 mm**. The modeled digit ends differ
slightly from the previous tapered caps, while the joint centers and principal
segment lengths remain unchanged. This is not an exact reconstruction of the
source's nominal 760 mm label.

The result remains an editable rigid-part prototype. It has no skin rig,
deformation weights, animation clips, engine test, authored production UV atlas,
baked textures or LODs. Reauthored primitive surfaces do not retain their former
generic primitive UV layouts; the UV-bearing object count changes from 136 to
69. Materials use the original untextured shader values, so this does not mask a
texture regression. No UV readiness or UV preservation claim is made for the
new construction. The local 3 mm edit itself preserves the selected geometry,
UVs, modifiers and materials exactly.

The model still simplifies the source's intricate custom molded transitions,
asymmetric fastener placement and surface finishes. It represents the major
construction hierarchy, rather than every tiny concept-sheet component.

## Fixed visual evidence

All original review cameras and the original light rig remain unchanged:
front, side, back, hero, service detail, armor depth, socket depth and palm depth.
The added upper-mechanism, dorsal-hand, palm-hand and open-service views use
identical settings for baseline and selected output. Every render uses 512 px,
16 samples and two CPU threads. Visible sampling noise is retained; no image
generation, retouching, camera masking or lighting adjustment was used.

`renders/before/` and `renders/after/` are actual production renders.
`comparisons/` places those original pixels side by side and adds labels only.
The paired service-open images are in their own folders. Actual independent
GLB readback renders are included in `renders/glb-readback/`.

The most diagnostic comparisons are `back.png` and `mechanism-detail.png` for
the exposed upper mechanism; `armor-depth.png` for the independent armor
layers; `hand-front.png` and `hand-palm.png` for the hand; and `service-open.png`
for the real recessed internals and cover ribs.

## Verification results

The independent native check compared all **300 original objects**, including
reauthored meshes, against the immutable baseline. Parent names and exact
matrix basis, parent inverse and world matrices are unchanged except for the
two explicitly repositioned crown markings. All original material datablock
hashes, including node inputs and links, agree. No original object was removed;
175 were intentionally reauthored and 41 new objects were added. There are
321 mesh objects, 341 total objects, 136,990 evaluated vertices and 271,840
triangles. These counts are inventory, not a quality score or engine budget.

The service edit moved `SERVICE_COVER` and its 25 attached meshes by
`[0, 0.00299999862909317, 0]` metres, within the declared float32 tolerance of
the requested +3 mm. All 315 unrelated objects and all selected geometry,
modifiers, material data and hierarchy stayed unchanged. Production restore
recovered the complete selected artifact/input bundle byte for byte after the
edit and again after the pose sequence.

The native poses exercise elbow 0, 45 and 90 degrees, then elbow 45 with wrist
20 and index joints 35/20/10 degrees. Actual side and oblique pose renders were
inspected. All 41 added meshes match independently predicted centroid motion;
the largest native error is below 0.0000001 m. At every pose, 72 named
upper-arm/forearm shell and carrier surface pairs report no triangle
intersections. A separate neutral check tests 132 cover-body/rib versus
cartridge pairs with no surface intersections. These limited checks do not
establish all-object, containment or continuous collision clearance.

Factory-startup GLB reimport finds no missing or extra nodes, no parent mismatch
and no world-matrix error above 0.00001 m. Bounding-box error is approximately
`4.25e-9` m. The exported cover edit and six independent single-pivot samples
also pass, including all affected added geometry; maximum exported centroid
orbit error is approximately `8.47e-8` m. The independently reimported neutral
GLB was saved and rendered under the fixed review settings.

The selected reauthored/new solid meshes have no boundary, nonmanifold or
zero-area faces under the performed evaluated topology check. The two
inherited lettering objects retain open outlines and are reported explicitly.
Earlier tiny bevel degeneracies in the front recess and little-finger distal
knuckle were corrected before selection. Closed individual surfaces do not
prove that the entire articulated assembly is fabrication-ready.

## Retained attempts and recovery

- Attempt 01 failed in authoring code before rendering because a new Empty
  object was assigned Mesh data. The script now allocates Mesh data when
  creating the object. The failed command, worker log and captured script are
  retained; this was not a RefAs runtime defect.
- Candidate 02 was the first actual rendered construction result. It is
  retained, including the socket intrusion, overly sharp panel facets and
  pointed fingertips that led to correction.
- Candidate 03 corrected those large defects but retained a crown marking
  intersection and an interior-rib clearance concern. Its first 65-degree
  service inspection was also too edge-on and was replaced by matched
  125-degree inspection views.
- Candidate 04 corrected the marking and lid clearance, passed articulation
  and export checks, and revealed two tiny bevel degeneracies during topology
  inspection. Its native result and reports are retained.
- Candidate 05 reduces those bevels, preserves the reviewed construction and
  passes the final verification sequence. Full production histories remain in
  the work root; retained candidate artifacts and run logs are included here.

The immutable baseline is the explicit rollback checkpoint. The selected
revision and final restored revision are stated above. The runner always
reselects the explicit latest candidate before exercising edits, so a failed
exercise cannot silently turn an already displaced cover into the new neutral
baseline.

## Reproduction

Use the verified RefAs package or a compatible installed copy, then run the
included script from a new output root. Pass explicit package provenance only
when it has actually been verified:

```bash
python3 reproduce/run_construction.py --root /absolute/new-output/aurix \
  --skill-root /absolute/refas-skill --input-blend baseline/native.blend \
  --phase build
```

Inspect the actual new images. The remaining phases are `open-service`,
`exercise`, `readback`, and `package`; `package` additionally takes
`--evidence-root /absolute/evidence`. Use the same root, skill and baseline
arguments for each phase. `revise` rebuilds a revised candidate from the
immutable captured native baseline while preserving previous revisions.

`executed-scripts/` contains the actual script snapshots used for the retained
attempts. `reproduce/` contains the final reusable scripts. `evidence/` contains
the command log, validation reports, review specification, artifact identities
and process logs. The final construction script additionally records intended
material assignment changes; its geometry matches the selected recipe.

## Timing and cost scope

The parent recorded the assignment at 12:09:36.272500 UTC on 2026-11-22. The
author's first explicit clock read, after initial guidance and source reading,
was 12:10:44 UTC. Exact agent-start time is unavailable, so those events form a
start interval rather than an invented exact start. The first candidate
command began at 12:18:10.654790 UTC and failed before rendering. The first
actual candidate PNG has a preserved file modification time of
12:19:27.656538 UTC; the first complete candidate render bundle was observed
published at 12:19:50.685558 UTC. These are different events.

`construction-commands.json` records UTC start/end, monotonic elapsed time,
exit code and child CPU totals for every subprocess launched by the runner,
including failures. Nested production Blender work is included in CLI
durations and has retained worker logs, but its inner launch was not separately
timed with a monotonic clock. Initial shell reads and later file housekeeping
outside the runner have tool records, not a fabricated complete process
timeline. Exact first useful-decision time was not separately instrumented.

The final geometry, validation and image-review clock was 12:33:24 UTC; report
and packaging completion is recorded separately. Another author ran
concurrently, and all Blender jobs used two CPU threads. Model tokens, model
billing, tool billing and infrastructure prices are unavailable. No token or
monetary cost is inferred from file sizes, elapsed time, script length or
subscription price. These observations are informed refinement telemetry and
cannot close a controlled workflow-cost comparison.
