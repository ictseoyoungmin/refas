# Transmission model contract

Load this leaf when an asset makes an explicit coordinate/velocity/effort mapping claim between semantic joint and actuator spaces, or when a physical mechanism needs a declared transmission mapping. Ordinary visual reconstruction and assembly do not require this leaf.

## Ownership boundary

`refas.transmission-model/v1` is assembly-owned construction semantics. It does not replace or absorb adjacent identities:

```text
virtual joint
    != mechanism
    != transmission
    != actuator
    != controller
    != runtime endpoint
```

P05 mechanism semantics answer **what physical structure realizes generalized motion**. P06 transmission semantics answer **how declared semantic coordinate spaces map**. P07 actuator semantics own physical actuator capability and limits. A gear, belt, linkage, tendon, or differential never implies a ratio/Jacobian merely because its structure exists.

## Canonical mapping direction

Every transmission declares one input coordinate space and one output coordinate space. The canonical direction is:

```text
q_out      = F(q_in)
dq_out     = J(q_in) dq_in
effort_in  = J(q_in)^T effort_out
```

For directly executable affine mappings, `F(q) = A q + b` and `J = A`.

The affine `offset` is part of the canonical mechanical/mathematical coordinate map. It is **not** a runtime encoder zero, device calibration offset, or backend index convention; those remain P09 runtime-binding semantics.

Do not silently reverse this convention per backend. An exporter that needs the opposite direction must derive or solve it explicitly and must not rewrite canonical transmission truth.

## Semantic coordinate spaces and ordering

Coordinate definitions carry stable local coordinate IDs, exact P01 semantic identity references, and canonical `semanticKind` (`virtual-joint` or `actuator`). `semanticKind` is resolved from the live P01 graph during construction and persisted so later intrinsic validation can distinguish joint-coordinate obligations from actuator-only spaces.

Each space has an explicit `order`. Coordinate definition array order is presentation-only and is canonicalized independently; the `order` array is semantic vector ordering and contributes to `transmissionDigest`.

Never use backend body indices, joint indices, motor indices, exporter node order, object enumeration order, or array position as semantic coordinate identity. Backends may create explicit ordering maps later.

## P01 MAPS binding

Every transmission binds one P01 `transmission` identity and one or more exact P01 `MAPS` relations. The union of `MAPS.targetIds` must equal exactly:

- all P01 semantic identities referenced by the input/output coordinate spaces; plus
- all explicitly declared mechanism-context identities.

No target may disappear silently and no undeclared participant may be added. A transmission contract cannot invent an actuator or mechanism association that is absent from P01 identity semantics.

## Direct P04 articulation binding

Every coordinate whose canonical `semanticKind` is `virtual-joint` must bind the exact current P04 articulation semantics even when no P05 mechanism context is declared.

`transmissionArticulationProjection` is scoped to the joint identities actually used by the transmission. It carries the selected P04 joint records plus their live P01 articulation projection, including the resolved parent→child reference pose. Therefore a direct-drive transmission cannot remain valid after the meaning/direction/reference configuration of one of its joint coordinates becomes stale.

Do not require unrelated P04 branches. A controller edit, unrelated mechanism, or unrelated articulation branch must not invalidate an unchanged transmission.

## Mapping kinds

Supported mapping kinds are:

- `IDENTITY` — equal-dimensional identity map;
- `RATIO` — scalar-to-scalar finite non-zero ratio with explicit offset;
- `LINEAR_MATRIX` — explicit finite output-by-input matrix plus explicit output offset;
- `NONLINEAR` — exact digest-bound position model plus exact digest-bound Jacobian model;
- `EXTERNAL_SOLVER` — exact digest-bound solver reference implementing the canonical q/dq/effort interface.

`IDENTITY`, `RATIO`, and `LINEAR_MATRIX` are directly executable with `evaluateTransmissionMapping`.

`NONLINEAR` and `EXTERNAL_SOLVER` do not receive hidden JavaScript callbacks, guessed formulas, finite-difference defaults, or backend-specific fallbacks. They additionally require a canonical `refas.transmission-implementation-manifest/v1` witness plus an independently supplied expected current implementation-artifact digest.

The live implementation manifest binds each referenced implementation by:

- implementation schema;
- implementation ID;
- exact implementation digest;
- ordered input semantic identity signature;
- ordered output semantic identity signature.

Only the referenced implementation entries contribute to the scoped `implementationBinding`; unrelated implementation entries do not stale an unchanged transmission. The manifest's `artifactDigest` must independently match the current artifact digest supplied by the caller. A self-asserted 64-hex string inside the transmission contract is never sufficient live proof.

For `NONLINEAR`, both the position and Jacobian implementations must be present in the same verified manifest and must expose the same declared transmission coordinate signature. For `EXTERNAL_SOLVER`, the solver entry must expose that same signature.

## Mechanism context and scoped liveness

A transmission may declare P05 mechanism context without becoming that mechanism. When `contextMechanismIds` is non-empty, bind only those referenced mechanism records through `transmissionMechanismProjection`.

The scoped projection includes:

- the selected P05 mechanism records;
- their live P01 physical/mechanism/member/`REALIZES` meaning through `physicalMechanismIdentityProjection`;
- their live P04 realized-joint semantics and physical incidence through `mechanismArticulationProjection`.

This catches referenced mechanism topology/member/REALIZES/articulation drift while avoiding invalidation from an unrelated mechanism elsewhere in the asset.

P01 transmission identity binding is also scoped: unrelated controller/runtime/interface edits do not stale a transmission, while its transmission identity, `MAPS` relation, coordinate participant identity/kind, or declared mechanism-context identity changes do.

## Authority

Reuse `refas.semantic-authority-set/v1`. Each positive transmission mapping has one deterministic authority subject. `validateTransmissionModelAuthority` requires the exact authority set bound to the current `transmissionDigest`.

Positive mapping construction requires `observed`, `inferred`, or `engineered` authority. `unknown` does not authorize a ratio/matrix/model reference, and downstream runtime/controller tuning never promotes transmission authority.

## Fail-closed rules

Reject at least:

- non-transmission P01 owners;
- non-`MAPS` or wrong-source relation references;
- target union mismatch;
- coordinate subjects outside supported semantic identity kinds;
- stale or missing canonical `semanticKind`;
- duplicate coordinate IDs or incomplete/duplicate explicit vector order;
- any virtual-joint coordinate without its scoped current P04 articulation binding;
- stale P04 joint/reference-pose meaning for a bound joint coordinate;
- zero/non-finite ratio;
- matrix or offset dimension mismatch;
- non-finite affine parameters;
- `NONLINEAR` / `EXTERNAL_SOLVER` construction without a verified current implementation manifest;
- missing implementation entries, digest drift, coordinate-signature drift, or current implementation-artifact digest mismatch;
- stale scoped P01 or P05/P04 mechanism dependencies;
- actuator-limit, controller-gain, runtime-index, or backend-index fields inside the transmission contract;
- unsupported fields and noncanonical serialization.

## Non-goals

P06 does not define actuator effort/velocity/position limits, joint-limit ownership, controller gains/modes, runtime signs/zeros/bus/index bindings, backend export approximations, or certification claim levels. Those remain later contracts.
