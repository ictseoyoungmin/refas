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
- interpretations are not written as facts;
- ambiguities are explicit;
- missing or hidden parts are marked unknown rather than invented.
