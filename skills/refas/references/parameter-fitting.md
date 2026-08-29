# Evidence-bound parameter fitting

Parameter fitting is an inner production loop owned by the currently active capability. The first public contract supports `shape-reconstruction × one scope`: it jointly explores multiple geometry parameters without creating a second capability, changing finding ownership, or weakening bounded-edit recovery.

## Contract

Create `refas.parameter-fit-plan/v1` with the exact source digest and baseline GLB content reference; at least two semantic geometry parameter bindings owned by `shape-reconstruction`; finite bounds and initial values; named objective and protected measurements; a fixed differential-evolution seed and budget; and source/render evidence references.

The evaluator receives one complete parameter vector. It must build a real candidate, measure the exact bytes through actual rendering when visual geometry is at issue, and return verified content references for both candidate GLB and render evidence. The CLI verifies path containment, byte size, and SHA-256 under `--root` before a trial enters the ledger.

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

## Relationship to bounded edits

Begin one bounded edit before fitting a protected shape state. Optimizer trials are retained evidence inside that edit; they are not trustworthy checkpoints. After inspecting the selected trial's whole-context hero plus side, top, grazing, normal, and object-ID evidence, create exactly one candidate checkpoint and finish the edit normally.

The selected trial may become the bounded-edit candidate only when it improves the declared objective without protected regression, its exact GLB and render references verify, the visible defect improves in source-bound comparison, and no new typed blocker appears. Otherwise keep the baseline, route a typed finding, or request review.

## Authority limits

Parameter-fit metrics have `candidate-ranking-only` authority. They may choose which already-evaluated trial deserves visual inspection. They cannot select a finding owner or rollback checkpoint, pass a visual or certification gate, mutate project state, turn a hidden-depth guess into fact, or combine camera, assembly, appearance, or lighting parameters with shape parameters in one plan.

An aggressive hypothesis is allowed as a trial. It remains a hypothesis until actual renders and normal RefAs evidence accept it.

## Resource and failure semantics

Set the evaluation budget from measured renderer time and storage. Evaluation is deterministic and sequential so trial order, evidence, and stop reason remain reproducible. Every reference is verified when returned and again before report publication so overwritten trial evidence fails closed. An evaluator exception, missing measurement, non-finite value, path escape, missing file, size mismatch, or digest mismatch fails closed instead of skipping a trial.

The derivative-free backend handles discontinuous render measurements and external generators but does not guarantee a global optimum. Reopen the representation when repeated populations converge to visibly inadequate geometry, required form cannot be expressed by declared parameters, or a different owner must move jointly.
