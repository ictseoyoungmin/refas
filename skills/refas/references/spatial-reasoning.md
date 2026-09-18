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

## Hidden geometry

Choose the least committed geometry that supports:

- the observed view;
- diagnostic side, top, and grazing views;
- physical attachment and support;
- future edits.

Label synthesized hidden surfaces as inferred. They cannot become source facts through repetition.
