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

Do not let the quantity of manifests, checkpoints, render frames, or passing
integrity tests hide a construction mismatch. Before surface, assembly, or
appearance review, verify the candidate's `refas.construction-quality/v1`
record. A `blockout` claim, generic-primitive-only construction, missing
registered whole comparison, or non-pass visible-form gate reopens
`shape-reconstruction` regardless of downstream evidence volume.

## Registered comparison evidence

Use `compare` after source-to-render registration when whole-object inspection cannot localize a near-match defect. The `refas.registered-comparison/v1` report binds the exact source manifest, asset and render frame, registration, visual hierarchy, comparison input, and output image digests. Every scope board retains whole-context ancestry and may include overlays, splits, source/render edges, silhouette differences, landmark residuals, and normalized dimensions.

For a real source, every compared scope that reports geometry measurements must bind its `refas.reference-geometry/v1` and `refas.realized-projection/v1`. Landmark positions and dimensions are derived from the realized projection fit; do not hand-author render coordinates. A realized scope must have a finite `landmarkResidualRmse`, and its projection binding must reference the same rendered asset. Synthetic/test fixtures may retain declared render coordinates only as `declared-test-fixture` evidence; that compatibility path is lower-authority contract evidence and cannot stand in for real-source geometry correspondence.

Registration residual, silhouette IoU, landmark residuals, and dimension ratios are critique aids only. They cannot set a view or closure gate to pass, cannot become source facts, and cannot choose a repair owner. A discrepancy must first be visible in the registered evidence and recorded as a typed finding. Always inspect local feature scopes even when the global silhouette improves; an attachment or relief regression may occupy too few pixels to lower a whole-object score.

## Projection-fit evidence and veto

When source-space `refas.reference-geometry/v1` exists, bind the current camera/model candidate back to it with `refas.projection-fit/v1`. The fit may contain anchor, chain angle/length, axis, contact, negative-space, dimension, and occlusion residuals. It is a geometry-consistency aid, not a visual verdict.

For source-bound reconstruction, do not hand-author `projectedXY` as final evidence. Produce `refas.realized-projection/v1` from the actual GLB bytes, semantic node-local bindings, glTF parent/TRS hierarchy, and the selected digest-bound camera. The realized proof stores world points and image projections derived from those authoritative runtime inputs. `verifyRealizedProjection` must reproduce the proof from the exact checkpoint GLB and reference geometry; a different GLB, camera, binding, or geometry invalidates the proof.

Keep gross failures measurable. Source observations remain normalized to the source frame, but realized projected coordinates may lie outside `[0,1]`; preserve those coordinates and `insideFrame: false` instead of clamping or discarding them. A model that projects outside the source frame is stronger disagreement evidence, not an unreviewable exception.

A good fit never grants PASS. A material mismatch may, however, support a blocking typed finding because it demonstrates that the current model projection contradicts an explicit source-space obligation. Convert such disagreement with `findingsFromProjectionFit`, then route the finding through normal ownership. Do not let the residual itself choose rollback.

For final review of a scope that has a projection fit, use `createProjectionAwareVisualReview`. It merges supported projection findings into the unresolved finding set before the normal visual-review rules run. Therefore a requested visual PASS is refused while a material source-to-model geometry mismatch remains. Registration cannot override this veto because registration answers frame placement, not shape agreement.

A `verdict: pass` visual review also requires a substantive source-bound observation summary for every required view and visual gate. Empty summaries, boilerplate evidence-free PASS declarations, or a metrics-only explanation are not closure evidence.

## Findings

Every actionable finding records category, severity, hierarchy scope, concise summary, evidence references, and whether the current edit introduced it. Use a category from `failure-routing.md`; otherwise provide an explicit owner for non-blocking experimental findings.

Severity means:

- `blocking` or `critical`: unsafe to close or publish;
- `major`: materially changes object identity or construction;
- `minor`: local mismatch that does not invalidate upstream structure;
- `note`: observation without a required repair.

## Scores

Scores summarize evidence; they do not own repairs. A below-threshold score without a typed finding returns `REQUEST_REVIEW`. Localize the visible defect before choosing a rollback point.

Inside an active owner-local parameter fit, declared measurements may rank already-rendered trials. This does not grant them repair, rollback, gate, or certification authority. Inspect the selected whole-context and diagnostic renders, then apply normal typed-finding and bounded-edit decisions.

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

For a real source, certification additionally requires one digest-bound `refas.reference-geometry/v1` artifact, one `refas.realized-projection/v1` artifact, and the exact GLB whose digest is bound by the visual review. Certification reproduces the realized projection from those checkpoint artifacts before closure. Missing, stale, non-reproducible, or asset-mismatched projection evidence refuses certification. Synthetic/test acquisition kinds keep the contract-fixture compatibility path but cannot use it as visual-fidelity evidence.

Certification refuses closure when the review is missing or digest-stale, its verdict is not `pass`, a required view or visual gate is not `pass`, a required passing observation summary is empty, a major/critical/blocking finding remains, a projection-aware review contains material geometric disagreement, or appearance relies on an integrity-only renderer or an unsupported material feature. Gate strings and numeric scores cannot override those findings.

Any upstream source, camera, model binding, or geometry change expires dependent projection-fit and gate evidence. Recompute projection evidence before rerunning registered comparison and certification after repair.
