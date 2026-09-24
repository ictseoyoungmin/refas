# Actuation model contract

Load this leaf when an asset makes an explicit actuator physical-capability claim. Ordinary visual reconstruction and passive assembly do not require it. If the actuator drives a canonical transmission, load `references/contracts/transmission-model.md` as the upstream mapping contract as well. If it directly drives a canonical virtual joint, load the articulation contract because current P04 joint meaning is part of the drive target.

## Ownership boundary

`refas.actuation-model/v1` is assembly-owned construction semantics for actuator physical capability. It does not collapse adjacent identities:

```text
virtual joint
    != mechanism
    != transmission
    != actuator
    != controller
    != runtime endpoint
```

P06 owns coordinate/velocity/effort mapping. P07 owns what the actuator itself can physically support. P08 owns controller command/tuning semantics. P09 owns runtime device/index/sign/zero/bus calibration.

A transmission ratio never implies actuator torque, velocity, or position capability. Conversely an actuator effort limit never rewrites the transmission mapping.

## P01 identity and DRIVES binding

Every P07 actuator record binds:

- exactly one P01 `actuator` identity;
- exactly one P01 `DRIVES` relation sourced by that actuator;
- exactly one declared driven target;
- the current target kind: `transmission`, `mechanism`, or `virtual-joint`.

The scoped identity projection binds only the semantic identity facts P07 owns: actuator `{id, kind}`, the exact `DRIVES` relation identity/source/targets, and driven-target `{id, kind}`. It does not bind unrelated actuator or target frame metadata. Unrelated controller, runtime endpoint, attachment, frame-placement, or other actuator edits therefore do not stale P07. Changing the actuator identity/kind, relation, driven target, or target kind does.

## Direct P04 virtual-joint binding

When `DRIVES` targets a `virtual-joint`, P01 identity alone is not sufficient proof of coordinate meaning. P07 additionally binds only that directly driven joint through a current scoped P04 articulation projection.

The projection reuses the P04 live identity/reference-pose check, so a stale joint direction, parent/child assignment, reference configuration, or resolved P01 parent→child pose invalidates P07. Unrelated P04 branches remain outside this binding.

Current `refas.articulation-graph/v1` joint coordinates are revolute. Therefore a direct P04 virtual-joint drive requires P07 `coordinateClass: ROTARY`. A `LINEAR` actuator capability cannot directly claim to drive the same revolute semantic coordinate merely because P01 contains a `DRIVES` edge. If a later P04 version adds a canonical linear/prismatic joint coordinate, this compatibility rule must be extended explicitly rather than guessed from backend type names.

## Selected P06 transmission liveness

When `DRIVES` targets a transmission, P07 binds only the selected P06 transmission records rather than the whole transmission model.

P01 `DRIVES` is not by itself proof that the actuator participates in that transmission's generalized coordinates. The driving actuator identity must also appear as `semanticIdentityId` in at least one selected P06 input or output coordinate. P07 deliberately does not infer physical causal direction from P06's canonical mapping direction, so participation on either side is valid; absence from both sides fails closed.

P07 does not treat intrinsic `validateTransmissionModel()` success as proof that a selected P06 record is still live. For each selected transmission it reconstructs a scoped current P06 model from the present dependencies required by that record:

- current P01 transmission / `MAPS` / coordinate identities;
- current P04 articulation semantics for any selected virtual-joint coordinates;
- current P05 mechanism context when the selected transmission declares one;
- current verified implementation manifest/artifact witness for selected `NONLINEAR` or `EXTERNAL_SOLVER` mappings.

The P07 transmission projection persists the selected transmission records, their current P01 projection, and the resulting scoped P06 articulation/mechanism/implementation bindings. Thus a selected transmission cannot remain valid in P07 after its own P04/P05/external implementation meaning becomes stale.

The scope remains narrow. An unrelated transmission record, unrelated P04 branch, unrelated P05 mechanism, or unrelated implementation-manifest entry does not invalidate an unchanged P07 actuator. A whole implementation artifact may change because an unrelated implementation changed; if the selected implementation entry/signature is unchanged and the caller supplies the new verified current artifact digest, the selected P07 binding remains equivalent.

## Actuator kinds and coordinate class

Supported kinds are:

- `ROTARY_ELECTRIC`
- `LINEAR_ELECTRIC`
- `HYDRAULIC`
- `PNEUMATIC`
- `ABSTRACT`

Every actuator has a `coordinateClass` of `ROTARY` or `LINEAR`.

`ROTARY_ELECTRIC` must be `ROTARY`. `LINEAR_ELECTRIC` must be `LINEAR`. Hydraulic, pneumatic, and abstract actuators must state the coordinate class explicitly rather than inheriting a backend convention.

## Canonical units

Rotary capability uses:

```text
position range   rad
velocity limit   rad_s
effort limit     N_m
stiffness        N_m_per_rad
damping          N_m_s_per_rad
armature         kg_m2
```

Linear capability uses:

```text
position range   m
velocity limit   m_s
effort limit     N
stiffness        N_per_m
damping          N_s_per_m
armature         kg
```

Intrinsic actuator response latency uses seconds for either coordinate class.

Do not infer a unit from a simulator, file format, exporter, backend index, or display convention. A unit mismatch is a contract failure.

## Position semantics

A resolved position capability is explicit and is never inferred from missing bounds.

`BOUNDED` means a finite canonical range:

```text
{ kind: BOUNDED, minimum, maximum, unit }
```

with `minimum <= maximum` and a unit matching the coordinate class.

`CONTINUOUS` means a known continuous rotary coordinate with no finite positional stop in canonical state:

```text
{ kind: CONTINUOUS, unit: rad }
```

`CONTINUOUS` is valid only for `ROTARY`. It is not valid for linear travel, and it does not mean that velocity or effort are unlimited.

Most importantly:

```text
null != CONTINUOUS
```

`null` means the position capability is unresolved and therefore requires `unknown` semantic authority. `CONTINUOUS` is a resolved positive capability claim and requires observed, inferred, or engineered authority.

## Capability fields

Each actuator declares independent authority-bearing properties for:

- supported control modes;
- position range/domain;
- maximum absolute velocity;
- maximum absolute effort;
- stiffness;
- damping;
- armature/effective reflected inertia or mass;
- intrinsic response latency.

Supported control modes are capability labels only: `POSITION`, `VELOCITY`, `EFFORT`, and `IMPEDANCE`. They do not contain gains, desired commands, setpoints, or tuning.

Resolved velocity and effort limits must be finite and strictly positive. A bounded position range must satisfy `minimum <= maximum`. Stiffness, damping, armature, and intrinsic response latency are finite and non-negative.

## Intrinsic latency vs controller/runtime delay

P07 `responseLatency` means an intrinsic actuator physical response property. It is not:

- P08 controller computation/command delay;
- a communication period;
- a bus delay;
- a runtime motor-index convention;
- encoder zero calibration.

Later controller/runtime contracts may carry their own latency/delay semantics without rewriting P07.

## Explicit unresolved state

Every optional capability property stores either a resolved canonical value or explicit `null`.

Do not fabricate convenience defaults such as:

- `1 N_m` torque;
- `1 rad_s` velocity;
- zero stiffness;
- zero latency;
- a guessed bounded or continuous position domain;
- a guessed supported control mode.

`null` means unresolved. It does not mean zero, unlimited, continuous, unsupported, or forbidden.

## Semantic authority

Reuse `refas.semantic-authority-set/v1`.

P07 uses deterministic property subjects for the actuator definition and each capability field. The definition requires `observed`, `inferred`, or `engineered` authority. A resolved property likewise requires one of those positive construction authorities. An explicit `null` property requires `unknown` authority.

`forbidden` cannot authorize a positive actuator capability. Downstream controller tuning or runtime convenience never promotes actuator capability to observed source truth.

## Fail-closed rules

Reject at least:

- a non-actuator P01 owner;
- a relation that is not exact `DRIVES` from the declared actuator;
- target ID or target-kind drift;
- a direct `virtual-joint` target without current scoped P04 articulation proof;
- a direct current P04 revolute joint paired with `LINEAR` coordinate class;
- a missing selected P06 transmission when `DRIVES` targets transmission;
- a selected transmission whose input/output semantic coordinate identities do not include the driving actuator;
- stale selected P06 P01/P04/P05 mapping dependencies;
- missing or stale selected nonlinear/solver implementation proof;
- rotary/linear unit mismatch;
- `ROTARY_ELECTRIC` with linear coordinate class;
- `LINEAR_ELECTRIC` with rotary coordinate class;
- `CONTINUOUS` on a linear coordinate;
- finite bounds attached to a `CONTINUOUS` position domain;
- non-finite values;
- zero/negative resolved velocity or effort limits;
- inverted bounded position range;
- negative stiffness, damping, armature, or intrinsic response latency;
- duplicate/unsupported control modes;
- controller gain fields such as `kp`/`kd`;
- runtime fields such as motor index, bus, encoder sign, zero offset, or scale;
- unsupported fields and noncanonical serialization.

## Non-goals

P07 does not define controller gains, command trajectories, desired setpoints, runtime endpoint/device indices, encoder calibration, backend export approximations, or physical certification claim levels. Those remain later contracts.
