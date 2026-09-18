# Hierarchical visual observation

## Observation order

Always move from context to detail:

1. `whole` — frame, dominant silhouette, pose, major negative space, lighting clues.
2. `region` — coherent areas with distinct function, material, or depth behavior.
3. `part` — separable physical or visual components.
4. `subpart` — subdivisions whose relations affect construction.
5. `feature` — seams, fasteners, engraving, edge breaks, highlights, or damage.

Do not start from a detail crop. First inspect the full frame, then create a padded crop whose ancestry returns to the whole.

## ROI policy

- Store ROIs as normalized `[x, y, width, height]` values.
- The whole node uses `[0, 0, 1, 1]`.
- Default context padding is 8%; increase it for attachment or occlusion reasoning.
- A crop never replaces the full reference in review boards.
- If a feature crosses a boundary, place it under the lowest common ancestor or record a relation between scopes.

## Claim classes

Record four distinct lists:

| Class | Meaning | Example |
|---|---|---|
| Fact | directly visible and source-cited | “A bright rim encloses the upper edge.” |
| Interpretation | likely visual reading | “The rim may be a raised metal band.” |
| Hypothesis | testable 3D explanation | “The shell crowns toward the camera by about one rim width.” |
| Ambiguity | evidence does not decide | “The hidden back may be flat or continue the crown.” |

Facts must cite at least one primary evidence item bound to the raw source SHA-256. Geometry parameters never belong in facts.

## Source-space reference geometry

When visible geometry materially constrains reconstruction, record it separately as `refas.reference-geometry/v1` rather than burying it in prose or jumping directly to model-space coordinates.

Reference geometry is an observation contract, not a pose solver. It may contain:

- normalized 2D structural anchors for visible or explicitly occluded landmarks;
- anchor chains and dominant axes;
- source-visible segments and the interfaces between them;
- observed contacts and front/back occlusion relations;
- coarse negative-space polygons;
- major contour samples and source-space dimensions.

Every primitive must cite source evidence. Importance should distinguish `macro`, `identity`, and `detail` obligations so macro disagreement is handled before detail work.

### Structural anchors versus contour extrema

A construction anchor and a silhouette extremum are not interchangeable. Place a structural anchor where the observed body structure requires it, even when perspective means another pixel is farther up, left, or right in the image. For example, a bowed head's structural crown is not automatically the screen-space topmost silhouette pixel.

If an extremal contour point itself matters, record it separately in `contours`. Do not move a structural anchor merely to make an annotation convenient or to coincide with the bounding silhouette.

### Source-visible segmentation before assembly

Preserve visible decomposition before deciding hidden 3D topology. When the source shows separate shells, connector bodies, articulated joint bodies, cut gaps, seams, overlap boundaries, or necked transitions, record them as `segments` and `interfaces` instead of flattening them into one undifferentiated region.

This applies generically. A manufactured articulated torso may show an upper shell, a narrow intermediate connector, and a lower waist/pelvis shell; a limb may show proximal body, joint body, distal body, and connector regions. Mechanical, furniture, vehicle, animal, or architectural references may expose analogous subdivisions.

Use separation strength conservatively:

- `explicit` — the visible evidence clearly supports a physically distinct body at this interface;
- `suggested` — a meaningful visible subdivision exists, but the source does not yet prove independent physical ownership;
- `uncertain` — preserve the boundary observation without committing to a physical split.

Do not invent hidden hinges, pins, sockets, or rear topology merely because a visible segment boundary exists. Observation preserves what is visible; spatial reasoning and assembly decide the unseen continuation later.

Reference geometry is strictly source-space evidence. It must not contain 3D coordinates, camera-space points, reconstructed depths, or model transforms. Those belong to spatial hypotheses and reconstruction. Realized projection later binds actual GLB nodes and mesh vertices back to this source evidence.

`refas.reference-registration/v1` remains a placement/framing transform between 2D evidence frames. Its residual can establish that crops or review frames are aligned, but it is not shape truth and cannot substitute for source-space geometry agreement.

## Derived evidence

Useful aids include:

- context and tight crops;
- low- and high-frequency views;
- local contrast normalization;
- gradient and edge views;
- highlight masks;
- annotated boundary overlays.

Treat all of these as derived. An edge detector can suggest where to inspect, but cannot overrule visible source pixels.

Negative-space visualization must make the emptiness easier to inspect rather than cover the subject. Prefer a mask or boundary-outline view whose filled pixels belong only to the observed empty region. If an overlay is used, it must not paint across subject surfaces in a way that makes the source contour or the empty-space boundary ambiguous.

## Completeness test

Before moving to spatial hypotheses, confirm:

- the whole node exists and has primary evidence;
- every visually material region has an owner node;
- attachment and occlusion neighborhoods retain context;
- facts are source-cited;
- visible macro geometry that constrains reconstruction is recorded as source-space reference geometry;
- structural anchors have not been substituted with unrelated contour extrema;
- material source-visible subdivisions and interfaces are preserved when they affect reconstruction or assembly;
- source segmentation does not invent hidden 3D mechanics;
- negative-space evidence describes actual empty regions rather than annotation paint over the subject;
- reference geometry contains no reconstructed 3D coordinates;
- interpretations are not written as facts;
- ambiguities are explicit;
- missing or hidden parts are marked unknown rather than invented.

## Visible obligations versus hidden uncertainty

Use ambiguity only where the source does not decide. Hidden rear surfaces,
internal fasteners, exact depth, and unobserved motion limits may remain
hypotheses. A visible contour, landmark, cut line, opening, overlap,
proportion, highlight break, segmentation boundary, or curvature transition is
an observation obligation and cannot be replaced by a generic primitive under
the label of uncertainty. Record the visible portion as a fact and only its
unseen continuation as ambiguous.
