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

Coordinate definitions carry stable local coordinate IDs and exact P01 semantic identity references. P06 initially permits `virtual-joint` and `actuator` coordinate subjects. Physical mechanism identities, when relevant, are declared separately through `contextMechanismIds`.

Each space has an explicit `order`. Coordinate definition array order is presentation-only and is canonicalized independently; the `order` array is semantic vector ordering and contributes to `transmissionDigest`.

Never use backend body indices, joint indices, motor indices, exporter node order, object enumeration order, or array position as semantic coordinate identity. Backends may create explicit ordering maps later.

## P01 MAPS binding

Every transmission binds one P01 `transmission` identity and one or more exact P01 `MAPS` relations. The union of `MAPS.targetIds` must equal exactly:

- all P01 semantic identities referenced by the input/output coordinate spaces; plus
- all explicitly declared mechanism-context identities.

No target may disappear silently and no undeclared participant may be added. A transmission contract cannot invent an actuator or mechanism association that is absent from P01 identity semantics.

## Mapping kinds

Supported mapping kinds are:

- `IDENTITY` — equal-dimensional identity map;
- `RATIO` — scalar-to-scalar finite non-zero ratio with explicit offset;
- `LINEAR_MATRIX` — explicit finite output-by-input matrix plus explicit output offset;
- `NONLINEAR` — exact digest-bound position model plus exact digest-bound Jacobian model;
- `EXTERNAL_SOLVER` — exact digest-bound solver reference implementing the canonical q/dq/effort interface.

`IDENTITY`, `RATIO`, and `LINEAR_MATRIX` are directly executable with `evaluateTransmissionMapping`.

`NONLINEAR` and `EXTERNAL_SOLVER` do not receive hidden JavaScript callbacks, guessed formulas, finite-difference defaults, or backend-specific fallbacks. Their exact referenced implementation is required before execution. A missing nonlinear model/Jacobian or solver remains unresolved rather than being approximated silently.

## Mechanism context and scoped liveness

A transmission may declare P05 mechanism context without becoming that mechanism. When `contextMechanismIds` is non-empty, bind only those referenced mechanism records through `transmissionMechanismProjection`.

The scoped projection includes:

- the selected P05 mechanism records;
- their live P01 physical/mechanism/member/`REALIZES` meaning through `physicalMechanismIdentityProjection`;
- their live P04 realized-joint semantics and physical incidence through `mechanismArticulationProjection`.

This catches referenced mechanism topology/member/REALIZES/articulation drift while avoiding invalidation from an unrelated mechanism elsewhere in the asset.

P01 transmission identity binding is also scoped: unrelated controller/runtime/interface edits do not stale a transmission, while its transmission identity, `MAPS` relation, coordinate participant identity, or declared mechanism-context identity changes do.

## Authority

Reuse `refas.semantic-authority-set/v1`. Each positive transmission mapping has one deterministic authority subject. `validateTransmissionModelAuthority` requires the exact authority set bound to the current `transmissionDigest`.

Positive mapping construction requires `observed`, `inferred`, or `engineered` authority. `unknown` does not authorize a ratio/matrix/model reference, and downstream runtime/controller tuning never promotes transmission authority.

## Fail-closed rules

Reject at least:

- non-transmission P01 owners;
- non-`MAPS` or wrong-source relation references;
- target union mismatch;
- coordinate subjects outside supported semantic identity kinds;
- duplicate coordinate IDs or incomplete/duplicate explicit vector order;
- zero/non-finite ratio;
- matrix or offset dimension mismatch;
- non-finite affine parameters;
- missing or stale nonlinear/Jacobian/solver references;
- stale scoped P01 or P05/P04 mechanism dependencies;
- actuator-limit, controller-gain, runtime-index, or backend-index fields inside the transmission contract;
- unsupported fields and noncanonical serialization.

## Non-goals

P06 does not define actuator effort/velocity/position limits, joint-limit ownership, controller gains/modes, runtime signs/zeros/bus/index bindings, backend export approximations, or certification claim levels. Those remain later contracts.
