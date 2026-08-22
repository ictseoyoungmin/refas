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

Include the raw reference beside the hero view. The portable baseline is the first gate. After it passes, an independent PBR-capable renderer is mandatory for appearance and final whole-object PASS/REOPEN.

Bind the standard set to a declared canonical object frame whenever semantic axes are known. Confirm that every frame record contains the canonical frame digest and local camera coordinates; a registered hero also contains the source registration digest. For a scope-local render, framing may use the selected module's exact current bounds, but surrounding parts remain visible so attachment and proportion are not judged out of context. Use the reported silhouette digest and covered-pixel count for deterministic projection regressions, not as a visual-fidelity score.

The bundled report has `claimScope: render-integrity-only`. Its status answers whether actual geometry produced every requested frame, not whether the asset resembles the reference. Record `materialSupport.supported` and `materialSupport.unsupported`; unsupported shading features remain unreviewed until a capable renderer supplies evidence.

## Independent PBR gate

Use an independently executed Blender Cycles/Eevee headless, Three.js/WebGL, Filament, glTF Sample Viewer, VTK, or equivalent renderer after the portable gate. Normalize its evidence as `refas.pbr-render-report/v1`. The report binds the exact GLB and canonical frame digests, renderer/version/backend, lighting rig, exposure, tone mapping, output color space, material feature coverage, output frame digests, and determinism or bounded-nondeterminism contract.

The bundled `render-pbr` command is the canonical baseline implementation of this independent process contract. It uses a fixed three-light rig and deterministic Cook–Torrance metallic-roughness shading and emits all eight standard views. Its limited feature disclosure is authoritative; select an external adapter when the asset requires a feature it does not cover.

Do not infer support from the renderer family. The configured version and backend must explicitly cover every `requiredMaterialFeature`; otherwise `appearance-plausibility` remains `insufficient` and final certification refuses closure. Portable evidence may reopen geometry, topology, assembly, camera, or render-integrity owners early. Only the independent PBR evidence may decide material/finish PASS or REOPEN and support the final appearance verdict.

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

Before closure, create a digest-bound `refas.visual-review/v1` record from `assets/templates/visual-review.json`. It must bind the exact primary source digest and candidate asset digest, contain one verdict for every standard view and visual gate, disclose the independent renderer and its material support, cite the exact PBR report digest, and retain unresolved typed findings. The whole-object checkpoint includes the visual review, PBR report, and every cited renderer output and cites the review path from every visual closure gate.

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
