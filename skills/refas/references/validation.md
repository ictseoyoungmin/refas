# Rendering, critique, and certification

## Standard render set

Every closure review includes actual images for:

| View | Primary purpose |
|---|---|
| hero | match the observed presentation |
| oblique | reveal mass, depth, and layered construction |
| side | reveal thickness and profile |
| top | reveal plan shape and symmetry assumptions |
| grazing | expose relief, seams, gaps, and tangent breaks |
| normal | reveal surface continuity |
| object-ID | reveal part boundaries and accidental merging |
| albedo | separate color assignment from lighting |

Include the raw reference beside the hero view. If a project has a higher-quality renderer, use it in addition to the bundled portable baseline.

## Critique order

Review in this order:

1. source identity and camera registration;
2. whole silhouette and framing;
3. major mass proportions and curvature;
4. part presence, depth order, attachment, and support;
5. surface topology, boundary continuity, and relief;
6. materials and finish;
7. microdetail.

Do not let attractive materials hide a structural mismatch.

## Findings

Every actionable finding records category, severity, hierarchy scope, concise summary, evidence references, and whether the current edit introduced it. Use a category from `failure-routing.md`; otherwise provide an explicit owner for non-blocking experimental findings.

Severity means:

- `blocking` or `critical`: unsafe to close or publish;
- `major`: materially changes object identity or construction;
- `minor`: local mismatch that does not invalidate upstream structure;
- `note`: observation without a required repair.

## Scores

Scores summarize evidence; they do not own repairs. A below-threshold score without a typed finding returns `REQUEST_REVIEW`. Localize the visible defect before choosing a rollback point.

## Closure gates

Whole-object certification requires current, passing evidence for:

- source integrity;
- hierarchy coverage;
- observation authority;
- spatial plausibility;
- silhouette and mass;
- surface topology and relief;
- assembly relations and immutable child integrity;
- appearance plausibility;
- multiview render integrity;
- no unresolved blocking findings;
- project audit validity.

Any upstream source or geometry change expires dependent gate evidence. Certification must be rerun after repair.
