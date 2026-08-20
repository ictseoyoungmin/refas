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

The bundled report has `claimScope: render-integrity-only`. Its status answers whether actual geometry produced every requested frame, not whether the asset resembles the reference. Record `materialSupport.supported` and `materialSupport.unsupported`; unsupported shading features remain unreviewed until a capable renderer supplies evidence.

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

Before closure, create a digest-bound `refas.visual-review/v1` record from `assets/templates/visual-review.json`. It must bind the exact primary source digest and candidate asset digest, contain one verdict for every standard view and visual gate, disclose the renderer and its material support, and retain unresolved typed findings. The whole-object checkpoint includes this file with artifact kind `visual-review` and cites its path from every visual closure gate.

`evidenceClass: independent-reference` means the comparison source was not generated from the candidate's own model specification. `self-generated-contract-fixture` can verify deterministic construction, rendering, rollback, and schema behavior, but can never certify visual fidelity.

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

Certification refuses closure when the review is missing or digest-stale, its verdict is not `pass`, a required view or visual gate is not `pass`, a major/critical/blocking finding remains, or appearance relies on an integrity-only renderer or an unsupported material feature. Gate strings and numeric scores cannot override those findings.

Any upstream source or geometry change expires dependent gate evidence. Certification must be rerun after repair.
