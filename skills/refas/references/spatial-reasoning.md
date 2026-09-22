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


## VC04 whole-before-parts volume barrier

VC04 turns VC01/VC02/VC03 into **shape-stage downstream admission authority** without turning them into final certification.

Create `refas.volume-barrier/v1` from:

- exact source SHA-256;
- exact visual-hierarchy digest;
- exact shape candidate asset SHA-256;
- the exact R03 perceptual-signature set embedded in the early-resemblance evidence;
- canonical VC03 classifications.

Protected scopes are derived, not caller-selected:

1. `whole` is always protected;
2. every scope carrying at least one R03 `macro` or `identity` signature is protected;
3. detail-only scopes may be measured/classified, but they are recorded as ignored for barrier authority and cannot compensate for a failed whole or major identity scope.

### Role-aware scope admission

For protected `volumetric`, `layered-volume`, and `rod-tubular` scopes:

- VC03 `NO_PLANAR_COLLAPSE` → `ADMITTED`;
- VC03 `PLANAR_COLLAPSE` → `REWORK`;
- VC03 `INDETERMINATE` → `HOLD`.

For protected `intentionally-planar` or `thin-shell` scopes, exact VC03 `NOT_APPLICABLE` is an admitted role-aware exception.

For protected `unresolved` scopes, VC03 `INDETERMINATE` remains `HOLD`.

Overall barrier verdict:

```text
any REWORK → REWORK
else any HOLD → HOLD
else → PROCEED
```

There is no aggregate score and no majority vote. One failed protected major scope blocks the whole barrier.

### Runtime replay

Before `surface-topology` and later capabilities, RefAs locates the shape-reconstruction checkpoint and replays the barrier from exact stored artifacts:

- shape candidate GLB bytes;
- R03 signature set through the early-resemblance barrier;
- one VC01 spatial-evidence artifact per protected scope;
- one VC03 classification artifact per protected scope;
- frozen VC02 authority resolved independently for each protected scope.

Each VC01 record is revalidated against the exact shape GLB. Each VC03 classification is recomputed through the pure classifier core using the frozen VC02 role. The stored volume barrier is then regenerated and compared canonically. Caller-authored barrier verdicts therefore have no authority.

`resolveVolumeBarrierAdmission(root, {checkpointId, scopeId})` exposes the replayed barrier for inspection.

### Authority boundary

`PROCEED` authorizes downstream detail only. It does **not**:

- certify the asset;
- prove the final downstream-mutated candidate remains spatially closed;
- replace VC06 candidate-bound multiview continuity;
- replace VC07 certification integration.

This distinction is deliberate: VC04 prevents polishing a collapsed base shape, while later slices preserve volume authority across candidate mutation and final closure.


## VC05 trusted spatial gate authority

VC05 removes the protected spatial gate's remaining self-certification path.

Whole-object closure gate `spatial-plausibility` no longer means “a trustworthy spatial-hypotheses checkpoint exists.” Its executable policy is now `trusted-spatial-gate`.

The runtime derives `refas.trusted-spatial-gate-authority/v1` by replaying canonical upstream state. There is no public creator that accepts a status.

For real-source projects the authority binds:

- source SHA-256;
- exact shape-reconstruction checkpoint ID + content digest;
- exact shape candidate SHA-256;
- exact VC04 volume-barrier digest;
- exact VC02 expectation-set digest;
- protected scope IDs;
- per-scope VC03 classification digests;
- scoped `spatial-plausibility` executable-policy digest;
- runtime-selected evidence refs.

Gate status is derived only from VC04:

```text
VC04 PROCEED → pass
VC04 REWORK  → fail
VC04 HOLD    → blocked
```

Caller gate requests may still name `spatial-plausibility`, but caller-supplied `status`, `evaluator`, policy digest, or decision digest remain forbidden. Caller-supplied evidence refs do not decide spatial authority; runtime replaces them with the exact VC04 barrier evidence binding.

A self-authored artifact claiming `refas.trusted-spatial-gate-authority/v1` is not consulted by the evaluator.

### Trusted contract fixtures

A contract fixture can use the fixture path only when `.refas` contains valid runtime-owned `refas.contract-fixture-authority/v1`. Public `source.acquisition.kind` text alone cannot enable the shortcut.

### Audit replay

Persisted certification gates are not trusted by their own digest. Audit re-derives the current trusted spatial authority and requires:

- persisted gate evaluator = `trusted-spatial-gate`;
- persisted status equals runtime-derived status;
- persisted evidence refs exactly equal runtime-selected authority refs;
- runtime-derived status remains `pass`.

Thus a re-signed stored `pass` cannot survive if the underlying VC04 authority becomes `REWORK`, `HOLD`, stale, or invalid.

### Authority boundary

VC05 is protected checkpoint-gate authority, not final spatial continuity authority.

```text
VC04 = shape-stage downstream admission
VC05 = trusted issuer for protected spatial gate
VC06 = candidate-bound multiview/final-candidate spatial continuity
VC07 = final certification integration
```

VC05 intentionally does not claim that a downstream-mutated final candidate still matches the shape-stage spatial authority.


## VC06 exact final-candidate spatial continuity

VC06 closes the gap between **shape-stage spatial authority** and the **authoritative final candidate**.

Use `resolveFinalSpatialContinuity(root, {checkpointId})` to derive `refas.final-spatial-continuity/v1` from an exact selected checkpoint lineage. The resolver does not accept a caller-selected mode or verdict.

Two modes are possible.

### Same-digest carry-forward

If candidate lineage proves:

```text
shape candidate SHA-256 == authoritative final candidate SHA-256
```

VC06 reuses the exact replayed VC04 barrier. This is allowed only because candidate bytes are identical. The continuity record binds the shape checkpoint ID/content digest, candidate-lineage digest, VC04 barrier digest, protected scopes, and final candidate digest.

A canonical neutral-clay multiview report must still be produced **after** the candidate authority checkpoint and bind the exact final candidate.

### Changed-digest re-verification

If any canonical candidate transition changes the candidate digest:

```text
shape candidate SHA-256 != authoritative final candidate SHA-256
```

shape-stage VC01/VC03 evidence cannot satisfy continuity.

For every VC04-protected scope the selected lineage must contain fresh evidence on the exact final GLB bytes:

1. canonical VC01 spatial-closure evidence;
2. canonical VC03 classification recomputed from the frozen VC02 role.

RefAs rebuilds the role-aware volume barrier for the final candidate. Stale evidence from the shape candidate is rejected by exact-GLB validation, and re-signed stale VC03 output fails canonical replay.

### Multiview requirement

VC06 requires one canonical neutral-clay PBR report created after the final-candidate authority checkpoint and bound to that exact asset. All canonical neutral-clay outputs are digest-bound, including hero, oblique, side, top, grazing, normal, object-id, and albedo.

This is multiview observation evidence, not a numeric aggregate resemblance score.

- single-view silhouette IoU has no authority;
- multiview IoU remains correspondence/diagnostic-only;
- no good view compensates for a failed protected spatial scope.

### Authority boundary

```text
VC04 = shape-stage spatial admission
VC05 = trusted issuer for protected shape-stage spatial gate
VC06 = exact final-candidate spatial continuity
VC07 = certification integration
```

VC06 does not add a certification-policy obligation and does not mint a certificate. A project may therefore possess or lack VC06 continuity independently until VC07 integrates the authority into final certification.

## VC07 final certification integration

VC07 keeps VC05 and VC06 as separate authorities and joins them only at final certification.

Whole-object certification now requires both:

- `spatial-plausibility` — VC05 trusted replay of shape-stage VC04 authority;
- `final-spatial-continuity` — runtime replay of VC06 against the exact authoritative final candidate and the current certification evidence.

The second gate is not satisfied by a stored object that merely claims `refas.final-spatial-continuity/v1`. During checkpoint creation the runtime constructs a prospective certification lineage, replays VC06, and derives `PROCEED -> pass`, `REWORK -> fail`, and `HOLD -> blocked`. Caller-supplied gate status remains forbidden.

For real-source certification, the gate binds the exact final candidate GLB, candidate-lineage proof, canonical final neutral-clay report, and every exact required final-clay frame. Same-digest carry-forward remains legal only because VC06 proves byte identity. A changed final candidate still requires the fresh exact VC01/VC03 evidence already enforced by VC06.

The whole-object certificate explicitly records:

```text
finalSpatialContinuity.continuityDigest
finalSpatialContinuity.finalCandidateSha256
finalSpatialContinuity.mode
finalSpatialContinuity.finalMultiviewReportDigest
```

Project audit recomputes VC06 and checks those bindings. Certified resume also replays current VC06 before returning `DONE`; missing, stale, corrupted, REWORK, or HOLD authority routes back to final spatial re-verification.

VC07 does not introduce a global thickness score, aggregate resemblance score, or single-view IoU authority. Visual review and final resemblance closure remain independent obligations.

## VC08 adversarial dogfood harness

VC08 adds an installed-skill-only adversarial worker and verifier around the integrated VC00–VC07 chain. The deterministic harness is **not** itself final VC08 closure; it exists to make real fresh-model dogfood reproducible and to prevent regressions between external worker runs.

Run:

```bash
npm run dogfood:adversarial
```

The verifier copies only the installed `skills/refas/` tree into an isolated temporary root. Repository-only surfaces such as `tests/`, `docs/`, `examples/`, `.git`, and root `package.json` are absent from the worker environment. The adversarial worker reads only `SKILL.md`, routed references/templates, `refas describe`, and the public `scripts/lib/index.mjs` entrypoint.

The deterministic matrix exercises:

- volumetric planar/billboard collapse with formally complete neutral-clay multiview;
- attempted post-failure `thin-shell` relabel after VC02 freeze;
- caller-authored checkpoint `status: pass` plus forged VC05/VC06-looking files;
- changed-final-candidate stale VC01/VC03 reuse;
- selected-lineage isolation from a current sibling carrying fresh final spatial evidence;
- HERO-oriented resemblance plus formally complete multiview that still cannot override VC04 spatial contradiction;
- a true volumetric positive control;
- a legitimate thin-shell positive control.

The harness report schema is `refas.vc08-adversarial-dogfood-report/v1`. A report may have `status: PASS` while still carrying `closureReady: false`. This means the deterministic attack matrix is healthy, **not** that VC08 is canonically closed.

Final VC08 closure still requires independent fresh GPT and Claude sessions against the same current RefAs snapshot and comparable budget. Their transcripts should be evaluated with this matrix, including attempted bypass, first multiview point, runtime verdict, certification reachability, and any shortcut not represented by the deterministic harness. `timeToFirstMultiview` is a performance observation only and has no certification authority.
