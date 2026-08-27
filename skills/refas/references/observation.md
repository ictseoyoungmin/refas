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
- observed visible segments and the interfaces between them;
- observed contacts and front/back occlusion relations;
- coarse negative-space polygons;
- major contour samples and source-space dimensions.

Every primitive must cite source evidence. Importance should distinguish `macro`, `identity`, and `detail` obligations so macro disagreement is handled before detail work.

### Structural anchors versus contour extrema

Do not use a screen-space extremum as a structural anchor merely because it is easy to mark. For example, a bowed head may have a silhouette topmost point that is not the anatomical or manufactured crown. When both matter, record separate structural and contour evidence.

### Observed segmentation before assembly

Preserve every source-visible division that may later become a separately constructed part. Do not collapse several visibly segmented bodies into one smooth mass merely because they belong to one semantic region.

Examples include:

- a mannequin torso divided into upper shoulder/chest shell, intermediate connector, and lower waist/pelvis shell;
- head, neck connector, torso shells, upper arm, elbow body, forearm, wrist, hand;
- pelvis shell, thigh, knee body, lower leg, ankle, foot;
- mechanical housings separated by gaps, collars, seams, sockets, plates, or overlapping shells.

Use `segments` for the visible bodies and `interfaces` for source-visible boundaries between them. `separation` records whether the source makes a physical part split `explicit`, merely `suggested`, or still `uncertain`. This is deliberately earlier than `refas.assembly-contract/v1`: observation records what is visibly divided, while later spatial and assembly reasoning decides the physical topology, depth, parent/child relation, and joint mechanism.

Do not invent a hidden part boundary just to make modeling convenient. Conversely, do not erase a visible boundary because a single mesh would be easier to construct.

Reference geometry is strictly source-space evidence. It must not contain 3D coordinates, camera-space points, reconstructed depths, model transforms, or assembly depth bands. Those belong to spatial hypotheses and reconstruction. A later projection-fit contract binds 3D model points and projected part boundaries back to this source evidence.

`refas.reference-registration/v1` remains a placement/framing transform between 2D evidence frames. Its residual can establish that crops or review frames are aligned, but it is not shape truth and cannot substitute for source-space geometry agreement.

## Negative-space display policy

Negative space is evidence about empty image regions, not an annotation layer that may cover the subject. Prefer a dedicated mask, boundary outline, or split board that preserves the source pixels. If an overlay is used, its fill must not obscure the subject silhouette, joints, or part interfaces that the evidence is meant to explain.

## Derived evidence

Useful aids include:

- context and tight crops;
- low- and high-frequency views;
- local contrast normalization;
- gradient and edge views;
- highlight masks;
- annotated boundary overlays.

Treat all of these as derived. An edge detector can suggest where to inspect, but cannot overrule visible source pixels.

## Completeness test

Before moving to spatial hypotheses, confirm:

- the whole node exists and has primary evidence;
- every visually material region has an owner node;
- attachment and occlusion neighborhoods retain context;
- facts are source-cited;
- visible macro geometry that constrains reconstruction is recorded as source-space reference geometry;
- source-visible segment boundaries that may affect construction are preserved as `segments` and `interfaces` rather than smoothed away;
- structural anchors are not confused with convenient silhouette extrema;
- reference geometry contains no reconstructed 3D coordinates;
- negative-space evidence does not visually cover the subject it is intended to compare against;
- interpretations are not written as facts;
- ambiguities are explicit;
- missing or hidden parts are marked unknown rather than invented.

## Visible obligations versus hidden uncertainty

Use ambiguity only where the source does not decide. Hidden rear surfaces,
internal fasteners, exact depth, and unobserved motion limits may remain
hypotheses. A visible contour, landmark, cut line, opening, overlap,
proportion, highlight break, part interface, or curvature transition is an
observation obligation and cannot be replaced by a generic primitive under the
label of uncertainty. Record the visible portion as a fact and only its unseen
continuation as ambiguous.
