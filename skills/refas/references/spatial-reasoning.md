# Spatial hypotheses from limited views

## Purpose

Single-image reconstruction is underdetermined. This capability owns competing explanations of camera, orientation, depth, and hidden form; it does not own final mesh detail.

## Required hypotheses

For every high-impact ambiguity, maintain at least two plausible alternatives until evidence eliminates one. Describe each with:

- predicted silhouette;
- predicted occlusion order;
- predicted highlight and grazing behavior;
- predicted side and top views;
- a falsifying observation or render.

Rank hypotheses by evidence coverage and assumption cost. Never rank by convenience of modeling.

## Camera before distortion

When a shape mismatch appears, test in this order:

1. framing and crop;
2. orthographic versus perspective projection;
3. camera azimuth, elevation, roll, and target;
4. object orientation and scale;
5. only then object deformation.

This prevents baking a camera error into geometry.

## Orientation is a frame, not an axis

A part is not spatially specified by its position and primary direction alone. When orientation affects visible form, contact, articulation, or function, preserve a second independent cue for roll/twist: a visible-plane or facing normal, a lateral/handedness cue, or an explicitly inherited parent-frame direction.

Use `refas.orientation-evidence-set/v1` to record source-supported camera-relative evidence such as projected primary direction, broad-face versus edge exposure, near side, terminal facing, and parent-relative twist. Prefer comparative statements over invented absolute Euler angles. `downward`, `edge-dominant`, `thumb-side nearer`, or `pronated` are valid source observations when visible; an unsupported `rotationX=37.6deg` is not.

Do not silently complete an axis-only observation with a global up vector. `resolveOrientedFrame` fails closed when roll is underdetermined unless a facing/lateral cue is supplied or an explicit parent-inheritance policy is requested. If several roll hypotheses remain plausible, keep them as competing spatial hypotheses and falsify them with plane exposure, near/far edges, overlap, negative space, highlights, or diagnostic renders.

A correct projected endpoint does not prove a correct 3D pose. Two candidates may share the same wrist, fingertip, and hand axis while one exposes the palm broad face and the other points it downward. Treat that as an orientation mismatch even when landmark error is near zero.

## Depth and occlusion

Use T-junctions, overlap, cast shadows, contour termination, relative sharpness, and grazing highlights as cues. Store the inferred front-to-back relation and its confidence. A relation with weak evidence remains a hypothesis.

## Projection anchoring

Visible boundaries are constraints in image space. When constructing seams, cells, or relief:

- register a model view to the reference;
- project candidate boundaries;
- compare their image-space positions and continuity;
- adjust the surface parameterization or spatial hypothesis before adding decoration.

Do not trace pixels into unrelated planar geometry when the supporting surface is curved.

When `refas.reference-geometry/v1` exists, create a `refas.projection-fit/v1` record for each serious whole-object camera/model hypothesis before committing to detailed shape work. Bind explicit semantic model points to the source anchors and retain the camera and model-binding digests. Every source `macro` anchor must be represented; missing macro bindings fail closed rather than being silently ignored.

Inspect anchor RMSE together with chain length/angle, dominant-axis, contact, negative-space, dimension, and occlusion residuals when those source primitives exist. These measurements are comparison evidence, not optimization commands. They may support typed mismatch findings but cannot decide that a hypothesis is visually correct.

Use `findingsFromProjectionFit` only after the fit is valid. Orientation disagreement belongs to spatial hypotheses; macro landmark/proportion and negative-space disagreement belongs to shape reconstruction; contact and occlusion disagreement belongs to assembly. The normal failure router then determines the reopen span. Do not let a numeric threshold bypass ownership.

## Reference-frame registration

Use attested normalized 2D correspondences to register a child observation frame to its parent. `createReferenceRegistration` supports affine and projective homography models, records residual and inverse round-trip metrics, and binds both source digests. Use the `register` CLI command with `assets/templates/registration-input.json` when a JSON artifact is preferable.

Registration owns placement evidence only. It never converts a low residual into shape truth, never outranks the raw reference, and never authorizes rebuilding a closed child to force a fit. A registered hero can align the source and render frames while the projected body, landmarks, contacts, or negative spaces are still wrong; use projection fit for that separate question.

## Canonical diagnostic frame

Do not assume a file's world axes are semantic object axes. Declare a `refas.canonical-object-frame/v1` artifact with a right-handed orthonormal `right`, `up`, and `forward` basis, then pass it to `render --frame`. Standard diagnostic directions are transformed through this basis. Rotating the asset and its declared frame together must therefore preserve the meaning of side, top, and grazing views.

The optional registered hero camera is written in canonical local coordinates and cites the source registration SHA-256. This changes the camera, never the geometry. For module inspection, list exact GLB part names in `scopeParts`: their current transformed vertices determine target, extent, and camera distance, while the renderer still draws the complete asset as context. An absent frame is an explicit legacy world-axis fallback, not an inferred semantic claim.

## Worked example

When a single frontal view can be matched by a deceptively flat candidate, or when it is unclear how to distinguish source facts from the 3D completion needed for a coherent asset, read `references/single-view-volumetric-reasoning-example.md`. The example demonstrates observation -> spatial hypothesis -> orthogonal self-check -> revision while keeping inferred geometry distinct from observed source truth.


## VC01 candidate-bound spatial closure evidence

Use `createSpatialClosureEvidence({glb, scopeId, crossSectionFractions, gridResolution})` when the task needs deterministic observation of the actual 3D support present in one exact candidate.

The creator hashes the supplied GLB bytes itself and measures active-scene world-space geometry. `scopeId: "whole"` selects every active-scene mesh node. Any other scope ID selects only mesh nodes whose `node.extras.scopeId` exactly matches; an unknown scope fails instead of silently falling back to the whole object.

The `refas.spatial-closure-evidence/v1` artifact records:

- canonical XYZ bounds/extents and surface/geometry counts;
- covariance-derived principal axes/extents;
- deterministic cross-section support at fixed fractions on X/Y/Z;
- positive-Z/negative-Z front/back support relative to the selected bounds center;
- FRONT/XY, SIDE/ZY, and TOP/XZ projected support;
- local thickness distributions on deterministic orthogonal grids.

This is **VC01 observation evidence only**. It deliberately does not contain a spatial role, `PLANAR_COLLAPSE` classification, PASS/FAIL verdict, or certification readiness. A thin panel and a collapsed torso may both produce very small depth measurements here; VC02 must bind the intended spatial role before VC03 interprets those measurements.

Validation must receive the exact GLB bytes again:

```js
const evidence = createSpatialClosureEvidence({glb: candidateBytes, scopeId: 'whole'});
const check = validateSpatialClosureEvidence(evidence, {glb: candidateBytes});
```

Do not pass a caller-selected candidate digest as authority. The digest in the evidence is derived from the measured bytes.


## VC02 pre-bound spatial role expectation

Use `createSpatialRoleExpectationSet({hierarchy, sourceSha256, expectations})` to state what spatial role a source/hierarchy scope is expected to have **before candidate geometry is evaluated**.

Supported roles are:

- `volumetric`
- `layered-volume`
- `thin-shell`
- `rod-tubular`
- `intentionally-planar`
- `unresolved`

Each scope expectation must cite the exact raw source path, explain the source observation, and give the rationale for that role. `unresolved` is a first-class role and requires explicit ambiguity; do not guess a stronger role when the source does not justify one.

The creator is deliberately strict. Candidate- or classifier-derived fields such as candidate digests, GLB inputs, VC01 evidence digests, classifier labels, or verdicts are not role-authoring inputs and are rejected instead of ignored.

Checkpoint authority is time-sensitive:

1. the first valid `spatial-role-expectation` artifact committed no later than `spatial-hypotheses` freezes VC02 authority;
2. its source SHA-256 and hierarchy digest must match current lineage;
3. every evidence reference must already exist in the pre-candidate lineage;
4. a later checkpoint may repeat the exact same expectation-set digest for continuity;
5. a later role/evidence-basis mutation is rejected;
6. first introduction at `shape-reconstruction` or later is rejected as too late.

Use `resolveSpatialRoleAuthority(root, {checkpointId, scopeId})` to retrieve the frozen authority. Scope lookup is exact: an expectation for `whole` does not silently substitute for a missing major-scope expectation.

Authority separation remains:

```text
VC01 = what spatial support exists in the exact candidate
VC02 = what spatial role the source/scope expects
VC03 = whether candidate support contradicts the frozen role
```

VC02 does not emit `PLANAR_COLLAPSE`, PASS/FAIL, or certification readiness and does not define a universal thickness threshold.


## VC03 role-aware multi-signal planar-collapse classifier

Use `classifySpatialCollapse(root, {checkpointId, scopeId, glb, spatialEvidence})` only after VC01 evidence exists and VC02 role authority has been frozen.

The public classifier does **not** accept a role string. It resolves the exact VC02 authority from project lineage, requires an exact selected expectation for the same scope as VC01, and revalidates the complete VC01 evidence against the supplied candidate GLB bytes before classifying anything.

The output is `refas.spatial-collapse-classification/v1` with one of:

- `PLANAR_COLLAPSE`
- `NO_PLANAR_COLLAPSE`
- `INDETERMINATE`
- `NOT_APPLICABLE`

These are classifier findings, not checkpoint/certification PASS/FAIL.

### Volumetric / layered-volume decision

VC03 keeps four independent VC01 measurement families visible:

1. **principal extents** — minor principal extent relative to the middle principal extent;
2. **canonical projections** — lower SIDE/TOP projected support relative to the strongest canonical projection;
3. **cross sections** — median Z-bearing support across deterministic X/Y sections;
4. **local thickness** — median local Z thickness relative to canonical lateral scale.

Each signal retains its measured ratio and its own `collapsed | ambiguous | clear` band. The bands are intentionally not one shared depth/width threshold. `PLANAR_COLLAPSE` requires at least three independent families to land in their collapse bands. `NO_PLANAR_COLLAPSE` likewise requires at least three clear families. Mixed evidence remains `INDETERMINATE`.

### Role-aware exceptions

- `intentionally-planar` → `NOT_APPLICABLE`; expected thinness is not failure.
- `thin-shell` → `NOT_APPLICABLE`; thinness alone cannot create planar-collapse authority.
- `unresolved` → `INDETERMINATE`; uncertainty is preserved.
- `rod-tubular` uses a separate transverse profile: transverse principal balance, transverse local-thickness balance, and transverse cross-section balance. A long tube may have one dominant longitudinal axis; ribbon-like collapse requires agreement from at least two transverse families.

VC03 never rewrites VC02 role authority and does not use single-view IoU. Multiview IoU remains diagnostic/correspondence-only.

### Authority boundary

VC03 is finding authority only:

```text
VC01 measurement
      +
VC02 frozen role
      ↓
VC03 contradiction classification
```

It does not set certification readiness, issue trusted gate PASS, or satisfy final spatial closure. Those remain later VC04/VC05/VC07 responsibilities.
