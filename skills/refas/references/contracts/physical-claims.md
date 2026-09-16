# Physical readiness claims

Use this contract only when an asset is being assessed for an explicit physical-readiness claim. It extends existing `assembly` semantics and does not create a new capability or a second certification system.

## Public evidence contract

`refas.physical-claim-evidence/v1` records one scoped physical claim assessment. One evidence artifact covers exactly one of:

- `articulated-ready`
- `simulation-ready`
- `control-ready`
- `runtime-ready`

Physical claim evidence is downstream of the canonical physical bundle and representation evidence. It never owns or mutates canonical physical truth, backend artifacts, normalized readings, P14 findings, or P15 declarations.

## Claim scope

Requirements are derived from the physical identities inside the selected P10 root-module subtree.

### `articulated-ready`

Requires at least one `virtual-joint` and exact articulation-component coverage for every relevant virtual joint. Dynamics, collision, control, and runtime binding are not prerequisites for this claim.

### `simulation-ready`

Requires at least one `rigid-link`, with rigid-body dynamics and collision coverage for every relevant rigid link.

Additional physical domains become required only when their corresponding semantic identities are present in the selected scope:

- `virtual-joint` -> articulation
- `mechanism` -> mechanism graph
- `transmission` -> transmission model
- `actuator` -> actuation model

Controller and runtime-endpoint semantics do not become simulation prerequisites.

### `control-ready`

Includes the simulation requirements and additionally requires at least one actuator and controller. Every relevant actuator must have actuation coverage, and the selected actuator/controller identities must be covered by control profiles.

Runtime binding is not a control-ready prerequisite.

### `runtime-ready`

Includes the control requirements and additionally requires at least one runtime endpoint with runtime-binding coverage.

## Representation gate

P16 consumes a current live P14 cross-representation validation, but stores only a claim-scoped projection of the P14 obligations/findings that matter to the requested claim.

For a required representation obligation:

- `EQUIVALENT` supports the claim.
- `DECLARED_DIVERGENCE` supports the claim only after the exact current P15 artifact successfully passes `validateDivergenceAuthorizationBindings(...)` with its exact current semantic-authority set and P11-P14 inputs.
- `LOSSY`, undeclared `DRIFT`, `UNRESOLVED`, and `INVALID` are blocking.

A P15 artifact must never be trusted by intrinsic digest validity alone for a positive physical claim.

## Scoped invalidation

P16 intentionally seals claim-scoped projections rather than global P10/P14/P15 digests.

A lower claim binds only:

- identities and relations relevant to that claim,
- exact component refs required by that claim,
- exact P14 obligations/findings relevant to those subjects/components,
- any live P15 declaration semantics actually used by that claim.

Therefore a controller-only or runtime-only edit must not, by itself, stale `articulated-ready` or `simulation-ready` evidence. A change to a required link, collision, dynamics, articulation, or other claim-relevant semantic input does invalidate the affected claim evidence.

## Certification integration

Do not invent another claim evaluator.

`createPhysicalClaimCertificationPolicy(...)` creates normal `refas.certification-policy/v1` claims. Each claim requires a digest-bound evidence node with:

- schema `refas.physical-claim-evidence/v1`
- role `physical-claim-<claim-id>`
- finding source `/findings`

`evaluatePhysicalClaimCertification(...)` is the typed P16 preflight adapter. It first live-validates every physical claim evidence node against current P10-P15 inputs, then delegates the actual claim decision to the existing generic certification-policy evaluator.

Candidate-transaction validity or schema labeling alone never authorizes physical readiness.

## Visual certification boundary

Existing visual-source fidelity and whole-object visual certification remain unchanged. Physical readiness is opt-in. A missing controller/runtime binding cannot be reinterpreted as a visual reconstruction failure, and a passing physical claim cannot replace visual-source evidence.

## Fail-closed rules

- Missing required identity presence is a blocking physical-claim finding.
- Missing component coverage for an applicable identity is blocking.
- Relevant P14 `LOSSY`, `DRIFT`, `UNRESOLVED`, or `INVALID` is blocking unless the exact `DRIFT` is converted by a current live P15 declaration.
- A stale P10 bundle, stale P14 validation, stale P15 authorization, substituted P15 authority rationale, or tampered P16 evidence is invalid evidence, not a failed-but-usable claim result.
- Aggregate scores never override typed blocking findings.
- P16 evidence does not authorize P17 integration closure by itself.
