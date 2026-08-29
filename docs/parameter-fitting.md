# Joint geometry parameter fitting

## Responsibility

The parameter-fit runtime closes the gap between source-bound measurements and a parameterized geometry generator. It jointly searches multiple `shape-reconstruction` parameters, verifies every trial's actual candidate and render bytes, and emits a deterministic digest-bound ledger.

## Public surface

- `createParameterFitPlan`, `validateParameterFitPlan`
- `fitParameters(plan, evaluate, {verifyReference})`, `validateParameterFitReport`
- `refas.parameter-fit-plan/v1` and `refas.parameter-fit-report/v1`
- `refas fit-parameters --root DIR --plan PLAN --worker WORKER --out REPORT`

The authoritative implementation is [parameter-fit.mjs](../skills/refas/scripts/lib/parameter-fit.mjs). Usage and bounded-edit routing are authoritative in [parameter-fitting.md](../skills/refas/references/parameter-fitting.md).

## Frozen invariants

- One plan owns `shape-reconstruction × one semantic scope` and contains at least two geometry parameters.
- Camera, assembly, appearance, and lighting owners cannot enter the same plan.
- Differential evolution proposes complete vectors rather than one-variable coordinate steps.
- Source, baseline asset, normalized plan, seed, budget, every trial, selected trial, and stop reason are digest-bound.
- Candidate and render references must match exact files under the CLI artifact root.
- Every reference is verified again before report publication; the local worker is trusted executable code, not sandboxed input.
- Protected measurements reject regressions; aggregate objectives only rank trials.
- The engine never mutates project state. One visually inspected selected result may become the bounded edit's sole checkpoint candidate.
- Scores never select owners, pass visual gates, or certify fidelity.

## Budget and performance

Work is bounded by `evaluationBudget`; population size is at least four. Evaluation is sequential and deterministic because render workers often contend for GPU, framebuffer memory, or output paths. The independent fixture uses 32 actual portable-render evaluations. Projects choose a budget from measured worker latency and artifact storage, not a universal quality ceiling.

## Integration evidence

- Unit and misuse coverage: `tests/parameter-fit.test.mjs`
- CLI integration: `tests/cli.test.mjs`
- Actual GLB/render loop: `examples/parameter-fit/`
- Generated comparison: `examples/parameter-fit/output/reference-before-after.png`

The fixture is self-generated contract evidence. It proves construction/render/evaluator integration and measurable improvement; it cannot certify real-reference visual fidelity.

## Known limitations and next slices

- The derivative-free backend does not guarantee a global optimum.
- Project workers supply scalar measurements; perceptual embeddings or differentiable gradients may later sit behind the same evaluator boundary.
- Cross-owner camera/geometry or geometry/material fitting is refused until recovery semantics define one safe owner and rollback span.
- The runtime supplies no domain-specific geometry generator. A low-capacity representation remains a representation blocker.

## Migration and rollback

This is additive. Existing projects and checkpoints remain valid. Removing the two schemas, runtime module/export, CLI command, template/reference, fixture, and tests returns to the `1.0.0` baseline without rewriting project state.

## Reopen conditions

Reopen if deterministic runs diverge, exact-byte verification can be bypassed, a score gains closure or routing authority, cross-owner values enter one plan, protected regressions can win selection, or an actual GLB/render fixture fails to materially improve its baseline.
