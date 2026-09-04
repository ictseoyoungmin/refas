# Constraint-aware fitting

Shape and pose fitting may optimize visual or projection objectives only among candidates that remain structurally realizable. Structural validity is an eligibility decision, not another weighted term in the objective.

## Candidate order

For an assembly-sensitive candidate, use this order:

1. build the exact candidate GLB from canonical shape parameters or allowed pose transforms;
2. regenerate any required attachment propagation evidence;
3. regenerate physical-fusion evidence when the candidate owns a fusion obligation;
4. analyze the exact candidate GLB with realized contact/support validation;
5. create `refas.fit-structural-eligibility/v1` bound to the candidate GLB SHA-256;
6. retain visual/projection measurements for diagnostics;
7. admit only `ELIGIBLE` trials to objective ranking;
8. visually inspect the selected eligible trial before the bounded edit may adopt it.

A fitter must never add a very large loss or `Infinity` to represent floating parts, penetration, broken support, stale propagation, failed fusion, or other structural defects. Such a trial is `INELIGIBLE` and does not compete in objective ranking.

## Structural eligibility artifact

`createFitStructuralEligibility` accepts one exact candidate GLB and declared structural stages:

- `attachment-propagation` — the declared attachment graph must be recompute-valid and ready for realization when this prerequisite applies;
- `physical-fusion` — every supplied fusion result must recompute, be `BAKED`, and satisfy its topology obligation when fusion applies;
- `realized-contact` — the contact/support graph must recompute against the same candidate bytes and report `PASS` with no unsupported required entity or blocker.

`realized-contact` is always required. Propagation and physical fusion are optional additional prerequisites, but neither can stand alone as candidate eligibility evidence because they do not themselves prove that the exact candidate GLB realizes the declared structure. Missing required evidence produces an ineligible artifact; omitting `realized-contact` is an invalid eligibility contract. A valid ineligible artifact is still useful evidence: its failed stage and blocker remain explicit rather than being disguised as malformed data or a score penalty.

The artifact binds the exact candidate SHA-256. Reusing it after any GLB-byte change is invalid.

## Shape and parameter fitting

Set `structuralEligibilityRequired: true` on an assembly-sensitive `refas.parameter-fit-plan/v1`. Every evaluator result must then include a valid `structuralEligibility` artifact whose `candidateAssetSha256` equals the candidate GLB content reference.

Each trial records both:

- `objectiveEligible` — whether protected objective terms stayed within their declared regression bounds;
- `eligible` — `objectiveEligible` and structural eligibility both pass.

Visual or projection loss is still measured for an ineligible trial, but two ineligible trials are never ordered by that loss. Final selection is taken only from eligible trials. If no candidate is eligible, the report uses `NO_ELIGIBLE_CANDIDATE`, `selectedTrialId: null`, and zero objective improvement.

The projection-repair adapter uses the same contract. When its plan requires structural eligibility, the project `renderCandidate` result must include the structural eligibility artifact for the exact GLB it just rendered. The adapter passes it into the parameter-fit ledger; omission or a candidate-digest mismatch fails closed.

## Pose fitting

Pose fitting continues to preserve the exact GLB BIN chunk and may change only parent-local node/joint transforms. When a pose plan contains any `grounded`, `support`, or `collision` constraint, structural eligibility is mandatory even if a caller attempts to disable it.

For constrained pose fitting, `evaluateStructure(candidateGlb, context)` must return a valid structural eligibility artifact requiring both:

- `attachment-propagation`;
- `realized-contact`.

This makes the declared support/collision policy executable rather than evaluator convention. A transform with a lower visual loss cannot win if propagation is stale, a support path breaks, or realized geometry penetrates.

An unconstrained transform-only diagnostic search may explicitly leave structural eligibility disabled. That exception does not authorize assembly closure.

## Authority and recovery

Structural eligibility has candidate-admission authority only. It does not select a visual finding owner, pass a visual gate, mutate project state, or certify the asset. Visual measurements likewise cannot override a structural blocker.

When a candidate is ineligible, route the blocker to the earliest responsible owner: attachment state or propagation, fusion/finalization, realized assembly/contact, or upstream shape construction. Do not repair the realized GLB directly and do not let the fitter hide the blocker by optimizing around a penalty term.
