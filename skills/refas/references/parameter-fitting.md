# Evidence-bound parameter fitting

Parameter fitting is an inner production loop owned by the currently active capability. The first public contract supports `shape-reconstruction × one scope`: it jointly explores multiple geometry parameters without creating a second capability, changing finding ownership, or weakening bounded-edit recovery.

## Contract

Create `refas.parameter-fit-plan/v1` with the exact source digest and baseline GLB content reference; at least two semantic geometry parameter bindings owned by `shape-reconstruction`; finite bounds and initial values; named objective and protected measurements; a fixed differential-evolution seed and budget; and source/render evidence references.

The evaluator receives one complete parameter vector. It must build a real candidate, measure the exact bytes through actual rendering when visual geometry is at issue, and return verified content references for both candidate GLB and render evidence. The CLI verifies path containment, byte size, and SHA-256 under `--root` before a trial enters the ledger.

For a concrete realized-GLB loop, use `createProjectionRepairPlan` and `repairShapeFromProjection` from `scripts/lib/shape-repair.mjs`. The adapter derives the initial typed findings from `createRealizedProjection`, maps the allowed projection residual IDs (`macro-anchor-rmse`, `chain-angle-error`, `negative-space-loss`, `segment-iou-loss`, `interface-boundary-error`) to the existing plan objectives, and invokes the project callbacks below for every bounded candidate:

```js
const result = await repairShapeFromProjection({
  plan, baselineGlb, referenceGeometry, cameraHypothesisId, camera,
  anchorBindings, segmentBindings,
  buildCandidate: (parameters, context) => buildExactGlb(parameters, context),
  renderCandidate: ({glb, parameters, context, proof}) => renderAndReturnReferences(glb, parameters, context, proof),
  frameDigest,
  readReference,
  verifyReference,
});
// result.decision is KEEP or ROLLBACK; project state is never mutated here.
```

`renderCandidate` must write an actual candidate render and return `candidateAsset`, `renderEvidence`, and `heroImage` references. `renderEvidence` must be a portable render report whose renderer-recorded `heroCamera` values are normalized and digested by the JavaScript adapter to match the realized projection camera, alongside `assetSha256`, the requested `frameDigest`, a `heroImageSha256`, and a renderer name/version. The adapter reads and hashes all three referenced files, checks the report's hero entry against the hero image bytes, and rejects synthetic, cross-trial, or camera-mismatched evidence. Camera canonicalization has one JavaScript authority; the portable Python renderer records values but does not author a competing camera digest. `KEEP` only means that the ranked candidate improved without adding a blocking typed finding; visual review and the one-checkpoint bounded-edit rule still decide whether it is adopted.

The worker is executable local code. Run only a project worker you trust and review; the artifact root limits evidence paths but is not a code sandbox.

```bash
node scripts/refas.mjs fit-parameters \
  --root <project-dir> \
  --plan <project-dir>/model/parameter-fit-plan.json \
  --worker <project-dir>/model/parameter-fit-worker.mjs \
  --out <project-dir>/reviews/parameter-fit-report.json
```

The worker exports:

```js
export async function evaluate(parameters, context) {
  return {
    measurements: {'silhouette-error': 0.12},
    candidateAsset: {/* refas.content-reference/v1 */},
    renderEvidence: {/* refas.content-reference/v1 */},
    evidenceRefs: ['renders/trials/trial-0007/hero.png'],
  };
}
```

Keep object-specific parameter paths, bounds, generator logic, and measurement recipes in the project worker or model specification. The reusable runtime owns normalization, deterministic search, protected-regression handling, evidence verification, and report validation.

Programmatic callers use `fitParameters(plan, evaluate, {verifyReference})`. The verifier is required and must reject any content reference whose exact bytes are unavailable or mismatched. The CLI supplies the filesystem verifier automatically.

## Structural eligibility barrier

Assembly-sensitive shape fitting must set `structuralEligibilityRequired: true`. In that mode every trial must include a digest-bound `refas.fit-structural-eligibility/v1` artifact whose `candidateAssetSha256` equals the exact candidate GLB content reference.

Build structural eligibility after realizing the candidate. `realized-contact` is always required because it is the stage that proves the exact candidate GLB actually realizes the declared contact/support structure. Regenerate attachment propagation and physical-fusion evidence as additional prerequisites whenever the candidate depends on them. Propagation or fusion evidence alone can never make a candidate eligible because neither one proves the realized candidate bytes. A failed but valid realized structural proof creates an `INELIGIBLE` trial; it is not converted into a large objective penalty.

When propagation or physical fusion participates, its exact report digest must also appear in the realized-contact graph. The eligibility artifact records those links in `realizationBindings`; this prevents a current contact proof from being paired with stale but independently valid upstream structural evidence.

The ledger still stores the trial's actual render and projection loss for diagnosis. It records protected-objective validity separately as `objectiveEligible`, then computes final `eligible` from both objective protection and structural validity. Only final-eligible trials enter ranking. Two ineligible trials are never ordered by visual loss. When no candidate is structurally eligible the report uses `NO_ELIGIBLE_CANDIDATE` and has no selected trial.

For `repairShapeFromProjection`, an assembly-sensitive plan uses the same path: `renderCandidate` returns `candidateAsset`, `renderEvidence`, `heroImage`, and the `structuralEligibility` artifact for the exact GLB that was rendered. The generic parameter ledger verifies the artifact and candidate digest before it can participate in ranking.

Pose fitting uses the same hard-barrier artifact through `evaluateStructure`. Any pose plan with a grounded, support, or collision constraint forces structural eligibility and requires both attachment-propagation and realized-contact stages. Unconstrained transform-only diagnostics may leave the structural gate disabled, but that exception never authorizes assembly closure.

Structural validity is not an objective term. Do not add `Infinity`, a huge constant, or another weighted penalty for floating parts, penetration, failed support, stale propagation, or failed fusion. Route those blockers to their owning capability instead.

## Relational eligibility barrier

When a shape search can alter macro or identity relationships, set `relationalEligibilityRequired: true` and bind the plan to the exact `relationalStructureDigest`. Every trial must then return a valid `refas.relational-discrepancy/v1` for the exact candidate GLB SHA-256.

Create the discrepancy from the current `refas.relational-structure/v1` and one observation for every macro/identity whole-system obligation. The contract evaluates the relation according to its declared kind:

- `distance-ratio` and `volume-ratio`: compare a realized ratio against the declared range;
- `alignment`: compare a realized error against the relation's explicit tolerance; no tolerance means unresolved rather than an invented pass;
- `ordering`: compare the realized entity order against the declared forward/reverse order;
- `plane-chain`: compare current continuity against the declared continuity; `unknown` remains unresolved.

A pass or fail must cite evidence. Missing measurement remains `unresolved`. The discrepancy embeds the exact relation graph, binds the candidate bytes, recomputes derived checks during validation, and records failed and unresolved relation IDs separately.

Relational validity is a hard eligibility barrier, not an objective term. The final trial condition is:

```text
eligible = objectiveEligible
        && structuralEligible
        && relationalEligible
```

A candidate with lower silhouette, reprojection, or perceptual loss cannot enter optimizer ranking when a required whole-system relation fails or remains unresolved. Do not encode relation failure as `Infinity`, a giant constant, or a weighted penalty. The ledger retains its low visual loss as diagnostic evidence while excluding it from selection.

The fit plan pins the relation-graph digest so a trial cannot substitute a weaker graph. Each discrepancy pins the exact candidate SHA-256 so a passing relation artifact from another trial cannot be replayed. If an evaluator supplies relational evidence even when the plan did not require it, a valid failing discrepancy still makes that trial ineligible; supplied blockers are never ignored.

This barrier does not decide semantic authority. `refas.semantic-authority-set/v1` and the whole-system relational barrier remain upstream authority contracts. Relation-aware fitting answers whether the exact candidate realizes the already-authorized relational obligations; it does not promote inferred or engineered structure to observed source truth.

## Relationship to bounded edits

Begin one bounded edit before fitting a protected shape state. Optimizer trials are retained evidence inside that edit; they are not trustworthy checkpoints. After inspecting the selected trial's whole-context hero plus side, top, grazing, normal, and object-ID evidence, create exactly one candidate checkpoint and finish the edit normally.

The selected trial may become the bounded-edit candidate only when it improves the declared objective without protected regression, its exact GLB and render references verify, every required structural and relational hard barrier passes, the visible defect improves in source-bound comparison, and no new typed blocker appears. Otherwise keep the baseline, route a typed finding, or request review.

## Authority limits

Parameter-fit metrics have `candidate-ranking-only` authority. They may choose which already-evaluated, structurally and relationally eligible trial deserves visual inspection. They cannot select a finding owner or rollback checkpoint, pass a visual or certification gate, mutate project state, turn a hidden-depth guess into fact, or combine camera, assembly, appearance, or lighting parameters with shape parameters in one plan. The projection repair adapter preserves this boundary and reports `ROLLBACK` when a selected trial adds a blocking finding.

An aggressive hypothesis is allowed as a trial. It remains a hypothesis until actual renders, hard eligibility barriers, and normal RefAs evidence accept it.

## Resource and failure semantics

Set the evaluation budget from measured renderer time and storage. Evaluation is deterministic and sequential so trial order, evidence, and stop reason remain reproducible. Every reference is verified when returned and again before report publication so overwritten trial evidence fails closed. An evaluator exception, missing measurement, non-finite value, path escape, missing file, size mismatch, semantic render binding mismatch, structural-evidence mismatch, relational-evidence mismatch, or digest mismatch fails closed instead of skipping a trial. Missing source evidence for a declared projection objective is rejected during plan validation; it is never converted to a zero (perfect) residual. Population initialization has a bounded attempt count and exact finite-space cardinality handling, so duplicate integer vectors cannot hang a fit. The first baseline trial must return a candidate reference with the exact plan baseline SHA-256; otherwise fitting stops before scoring, preventing baseline findings from being compared with a different generated asset.

The derivative-free backend handles discontinuous render measurements and external generators but does not guarantee a global optimum. Reopen the representation when repeated populations converge to visibly inadequate geometry, required form cannot be expressed by declared parameters, or a different owner must move jointly.
