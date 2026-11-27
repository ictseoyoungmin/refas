# Next geometry refinement — prepared prompts (not yet executed)

Date: 2026-11-22 (Asia/Seoul). **PREPARED / UNSENT / UNTESTED**.
These are new instructions prepared during interruption recovery. They do NOT
reconstruct or replace the exact missing prompts sent in the earlier session.
Keep the known `e265a35f` baseline and old blind comparisons untouched.

## JACKET — follow-up author instruction (new)

```text
Input: the unchanged uniform-jacket design sheet, the current selected
editable jacket .blend from the immutable e265a35f asset package, the
source/task/review JSONs, and the fixed-camera BEFORE images. Work on a copy
of that native file; never overwrite the selected baseline or source image.

Make an actual geometric refinement, primarily the collar stand, collar
turn, front folded leaves and lapel roll—not a lighting-only or outline-only
change. The collar/lapel relationship must be readable from front, rear,
3/4 and side: the stand rises around the neck, the collar rounds over and
turns outward, and separate lapels roll over the chest without stacked zigzag
trim or floating points. Model the sections with independent width and depth,
continuous fold tangent and physically plausible cloth thickness. Do not
hide collisions with piping. Adjust cloth strap appearance only if the
fixed-light material test shows a mistaken metallic response; protect the
identity and location of shield, chains, buckles and left/right details.

Maintain a 0.420 m back-centre anchor and reconcile the nominal 0.58 m
sleeve seam without shortening the body for camera framing. Preserve
the other editable parts, protected cuffs, measured dimensions and
source/hash provenance. Log intentional geometry/material changes and
all failed candidates.

Save the updated .blend, .glb, construction script, source identities,
fixed camera/light/renderer six-view before/after PNGs and numeric
geometry/preservation reports. Independently reimport the GLB. Exercise a
wearer's-left cuff change from 6 cm to 7 cm, restore it, and compare
untouched parts and captured artifact/input bytes. Reject a candidate
that only looks improved because of a crop, material trick, or different
camera. Do not claim finished garment/rig/UV/LOD/engine acceptance.
```

## AUTOMAIL — follow-up author instruction (new)

```text
Input: the unchanged complete AURIX MK-IV reference sheet and the
selected 2.0 editable arm .blend from e265a35f, with source/task/review
JSON, existing first/selected candidates and fixed observation renders.
Work on a copy of the native asset; never replace original candidates.

Correct the visually flat, thin overlapping forearm armor and schematic
glove/palm surfaces as actual three-dimensional shapes. Use asymmetric,
contoured cross-sections and visible thickness at each overlapping shell;
vary front/back curvature deliberately. Keep open negative space around
exposed rear rods and hydraulic-looking mechanisms. Rebuild the shoulder
socket housing as layered mass rather than an oversized flat ring, without
covering the internal features. Target the reference's whole-arm silhouette,
hand volume and mechanical readability before adding tiny detail.

Preserve the named AURIX_ROOT > SHOULDER_PIVOT > ELBOW_PIVOT > WRIST_PIVOT
hierarchy and digit joint chains. Preserve SERVICE_COVER and its existing
attachment semantics; explicitly measure changes to selected objects and
prove unrelated objects' geometry/transforms/materials are unchanged.
The original service cover must still move outward by 3 mm and restore.

Produce actual fixed-light/camera front, back, side and 3/4 BEFORE/AFTER
renders and a side detail that reveals plate thickness. Reopen .blend,
independently import .glb and inspect named parents, transforms, dimensions,
and elbow 0/45/90 plus wrist/index poses. Record collision/clearance
observations as limited samples, not continuous physical feasibility.
Retain unsuccessful attempts and avoid any blanket inference that 2.0
outperforms the plain or fixed-1.x control.
```

## Independent reviewer — prepared, not sent

```text
Inspect the complete unchanged original reference first. Then examine
the two anonymous candidates A and B for EACH asset using matched
camera, framing, lighting and render conditions. You must not see author
identity, build chronology, scripts, intended fixes or the condition map.

Compare whole silhouette and source-specific identity first; then
fold curvature, cloth depth, collar/lapel overlap, plate thickness,
socket/actuator negative space, hand construction, and visible defects.
State a reasoned relative preference if supported, and independently
accept or reject each candidate for finished visual quality.
Do not treat code-test results as visual proof, invent calibrated source
projections or claim statistical skill/model superiority from one pair.
Record concrete visible weaknesses and uncertainty. Return the
verbatim review before revealing the mapping.
```

## Required non-prompt evidence

Keep the authoring scripts, failing candidates, fixed review specification,
actual images and scene/GLB state reports outside the prompt archive. A
successful replay demonstrates executable reproducibility, not that the
same literal historical agent prompt was used.
