# Bounded fitting and discrepancy evidence

RefAs exposes owner-local fitters for the high-impact loop:

- `createCameraFitPlan` / `fitCamera` belong to `spatial-hypotheses` and search bounded camera variables without changing geometry. A plan may declare perspective and orthographic projection candidates; the bounded evaluator interleaves them so each declared hypothesis receives trials.
- `createPoseFitPlan` / `fitPose` belong to `assembly` and may change only parent-local transforms. The fitter verifies that mesh/accessor bytes remain identical.
- `createOrientationPoseFitPlan` / `fitOrientationPose` wrap a valid pose plan with source-bound terminal-orientation evidence and a smallest-responsible variable chain. Candidate probes vary the declared forearm/wrist/palm-style chain together rather than pretending that a terminal part can always absorb the full correction. They retain the same mesh-byte immutability and structural-eligibility barrier as ordinary pose fitting.
- `createMacroFitCoordinatorPlan` / `runMacroFit` sequence camera, pose, then shape stages. The coordinator records reports but cannot choose a finding owner or certify.
- `createAppearanceFitPlan` / `fitAppearance` and `createLightingCalibrationPlan` / `fitLighting` alternate illumination and material calibration after geometry is frozen. Every trial must report the frozen geometry and frame digests.

`createPerceptualDiscrepancy` supplies deterministic, model-free image evidence: silhouette IoU, boundary distance, edge disagreement, occupancy, dimensions, coarse luminance/color, negative-space masks, and optional segment masks. These measurements rank candidates and surface contradictions; they never become a universal visual-fidelity threshold or a certification gate.

`createOrientationDiscrepancy` is complementary semantic evidence for cases that raster/landmark scores can miss. It binds a source orientation-evidence digest and records primary-axis, facing, lateral, and twist residuals for full local frames. Two candidates may therefore have the same projected endpoint, the same longitudinal axis, and even the same silhouette score while still receiving a large facing/twist residual when one broad face points toward the camera and the reference supports a downward-facing plane.

Orientation metrics remain ranking and contradiction evidence only. They cannot select a finding owner, pass a visual gate, or replace actual source/render review. A terminal-facing mismatch should route back to `spatial-hypotheses` when the 3D interpretation is wrong, or to `assembly` when the parent-relative pose/kinematic chain is wrong. The repair must reopen the smallest responsible chain and then re-run attachment propagation, realized contact/support, collision or articulation bounds when applicable, and actual rendered review.

`createLandmarkCage`, `createLongitudinalGuide`, and `createSectionProfileLoft` form the reusable construction backend. A section loft supports asymmetric width/depth, arbitrary profiles or superellipses, twist, offsets, flattening, taper, and semantic section parameters. `createRepresentationCapacityReport` turns an obligation the backend cannot express into an explicit representation blocker; tessellation alone cannot clear it.

`createBenchmarkMatrix` binds external raw-source paths by digest and records baseline/final assets, diagnostics, fitting ledgers, findings, rollback evidence, visual review, and (only when justified) a certificate. The benchmark example can attach these records from project roots without copying external sources. Generic capability closure requires at least two materially different benchmark classes.
