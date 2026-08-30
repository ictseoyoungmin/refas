# Bounded fitting and discrepancy evidence

RefAs now exposes owner-local fitters for the high-impact loop:

- `createCameraFitPlan` / `fitCamera` belong to `spatial-hypotheses` and search bounded camera variables without changing geometry. A plan may declare perspective and orthographic projection candidates; the bounded evaluator interleaves them so each declared hypothesis receives trials.
- `createPoseFitPlan` / `fitPose` belong to `assembly` and may change only parent-local transforms. The fitter verifies that mesh/accessor bytes remain identical.
- `createMacroFitCoordinatorPlan` / `runMacroFit` sequence camera, pose, then shape stages. The coordinator records reports but cannot choose a finding owner or certify.
- `createAppearanceFitPlan` / `fitAppearance` and `createLightingCalibrationPlan` / `fitLighting` alternate illumination and material calibration after geometry is frozen. Every trial must report the frozen geometry and frame digests.

`createPerceptualDiscrepancy` supplies deterministic, model-free image evidence: silhouette IoU, boundary distance, edge disagreement, occupancy, dimensions, coarse luminance/color, negative-space masks, and optional segment masks. These measurements rank candidates and surface contradictions; they never become a universal visual-fidelity threshold or a certification gate.

`createLandmarkCage`, `createLongitudinalGuide`, and `createSectionProfileLoft` form the reusable construction backend. A section loft supports asymmetric width/depth, arbitrary profiles or superellipses, twist, offsets, flattening, taper, and semantic section parameters. `createRepresentationCapacityReport` turns an obligation the backend cannot express into an explicit representation blocker; tessellation alone cannot clear it.

`createBenchmarkMatrix` binds external raw-source paths by digest and records baseline/final assets, diagnostics, fitting ledgers, findings, rollback evidence, visual review, and (only when justified) a certificate. The benchmark example can attach these records from project roots without copying external sources. Generic capability closure requires at least two materially different benchmark classes.
