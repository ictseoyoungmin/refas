# Joint geometry parameter fitting

## Responsibility

The parameter-fit runtime closes the gap between source-bound measurements and a parameterized geometry generator. It jointly searches multiple `shape-reconstruction` parameters, verifies every trial's actual candidate and render bytes, and emits a deterministic digest-bound ledger.

## Public surface

- `createParameterFitPlan`, `validateParameterFitPlan`
- `fitParameters(plan, evaluate, {verifyReference})`, `validateParameterFitReport`
- `createProjectionRepairPlan`, `projectionResidualMeasurements`, `repairShapeFromProjection`
- `refas.parameter-fit-plan/v1` and `refas.parameter-fit-report/v1`
- `refas fit-parameters --root DIR --plan PLAN --worker WORKER --out REPORT`

The generic ledger is implemented in [parameter-fit.mjs](../skills/refas/scripts/lib/parameter-fit.mjs). The optional realized-GLB repair backend is implemented in [shape-repair.mjs](../skills/refas/scripts/lib/shape-repair.mjs). Usage and bounded-edit routing are authoritative in [parameter-fitting.md](../skills/refas/references/parameter-fitting.md).

## Projection repair backend

`repairShapeFromProjection` is the first concrete `shape-reconstruction` loop. It derives typed findings from the baseline's realized projection, binds only `model.shape.*` or `model.geometry.*` parameters, asks a project worker to rebuild exact GLB bytes, re-measures those bytes through the digest-bound camera and node hierarchy, and requires an actual render reference for every trial. The adapter reads the referenced report bytes and requires `assetSha256`, the renderer-computed `heroCamera`/`heroCameraDigest` equal to the realized projection camera, `frameDigest`, `heroImageSha256`, and `renderer.name`/`renderer.version` to match the candidate proof; it also verifies the referenced hero image bytes. The generic bounded search then ranks the declared residuals:

`macro-anchor-rmse`, `chain-angle-error`, `negative-space-loss`, `segment-iou-loss`, and `interface-boundary-error`.

Projection residual objectives are minimize-only; maximizing a discrepancy is rejected by the shape adapter.

The result contains the baseline and selected realized proofs, typed findings, the immutable fit report, and an advisory `KEEP`/`ROLLBACK` decision. `KEEP` is returned only when the selected trial improves the objective without introducing a new blocking finding; neither decision mutates project state or creates a checkpoint. A selected `KEEP` candidate still requires whole-context visual review before the normal bounded-edit checkpoint flow.

## Frozen invariants

- One plan owns `shape-reconstruction × one semantic scope` and contains at least two geometry parameters.
- Camera, assembly, appearance, and lighting owners cannot enter the same plan.
- The projection repair adapter rejects camera, lighting, appearance, and assembly bindings at the shape boundary; those variables remain separate owner capabilities.
- Differential evolution proposes complete vectors rather than one-variable coordinate steps.
- Source, baseline asset, normalized plan, seed, budget, every trial, selected trial, and stop reason are digest-bound.
- The first trial is the baseline: its candidate content reference must carry the exact `baselineAsset` SHA-256 before any objective is scored or ranked.
- Candidate and render references must match exact files under the CLI artifact root.
- Projection repair additionally checks that each candidate reference's bytes equal the generated GLB, and that the renderer's own hero-camera record/digest plus render report and hero image are semantically bound to that GLB, camera, and frame before the trial is accepted.
- A projection finding carries a stable `checkId` (for example `projection.negative-space` or `projection.segment-iou`); rollback regression checks compare these checks rather than category totals.
- An objective is unevaluable when its source evidence is absent. The repair plan rejects such objectives and never treats missing residuals as zero loss.
- Every reference is verified again before report publication; the local worker is trusted executable code, not sandboxed input.
- Protected measurements reject regressions; aggregate objectives only rank trials.
- The engine never mutates project state. One visually inspected selected result may become the bounded edit's sole checkpoint candidate.
- Scores never select owners, pass visual gates, or certify fidelity.

## Budget and performance

Work is bounded by `evaluationBudget`; population size is at least four. Random population initialization also has a finite `initializationAttemptBudget`, and all-integer parameter spaces are capped at their exact unique-vector cardinality, so duplicate samples cannot loop forever. Evaluation is sequential and deterministic because render workers often contend for GPU, framebuffer memory, or output paths. The independent fixture uses actual portable-render evaluations. Projects choose a budget from measured worker latency and artifact storage, not a universal quality ceiling.

## Integration evidence

- Unit and misuse coverage: `tests/parameter-fit.test.mjs`
- Realized projection repair coverage: `tests/shape-repair.test.mjs`
- CLI integration: `tests/cli.test.mjs`
- Actual GLB/render loop: `examples/parameter-fit/`
- Generated comparison: `examples/parameter-fit/output/reference-before-after.png`

The fixture is self-generated contract evidence. It proves construction/render/evaluator integration and measurable improvement; it cannot certify real-reference visual fidelity.

## Known limitations and next slices

- The derivative-free backend does not guarantee a global optimum.
- Project workers supply scalar measurements; perceptual embeddings or differentiable gradients may later sit behind the same evaluator boundary.
- The first repair backend is intentionally bounded to projection residuals; it does not fit camera, lighting, or material appearance.
- Cross-owner camera/geometry or geometry/material fitting is refused until recovery semantics define one safe owner and rollback span.
- The runtime supplies no domain-specific geometry generator. A low-capacity representation remains a representation blocker.

## Migration and rollback

This is additive. Existing projects and checkpoints remain valid. Removing the two schemas, runtime module/export, CLI command, template/reference, fixture, and tests returns to the `1.0.0` baseline without rewriting project state.

## Reopen conditions

Reopen if deterministic runs diverge, exact-byte verification can be bypassed, a score gains closure or routing authority, cross-owner values enter one plan, protected regressions can win selection, or an actual GLB/render fixture fails to materially improve its baseline.
