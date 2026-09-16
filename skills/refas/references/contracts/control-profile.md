# Control profile contract

Use this leaf when a P01 `controller` configures one P01 `actuator` through an exact `COMMANDS` relation. P08 owns controller-side command semantics and tuning. It does not own actuator physical capability, transmission mapping, runtime calibration, backend indices, or certification.

## Ownership boundary

Keep these identities and contracts distinct:

```text
controller
  != actuator
  != transmission
  != runtime endpoint
```

P01 owns the `COMMANDS` edge. P07 owns which control modes the actuator physically supports. P08 selects one supported mode and defines its canonical command space, feedback tuning, and controller-side delay. P09 will own runtime device/bus/index/sign/zero/encoder calibration.

A P08 profile must fail closed when the selected P07 actuator has unresolved supported modes or does not explicitly support the selected mode.

## Selector

Each active profile exact-binds:

- one stable `controllerId`;
- one exact `commandsRelationId` whose kind is `COMMANDS`;
- one stable actuator target `actuatorId`.

Controller or actuator identity drift, relation source drift, or relation target drift invalidates the profile. Array order and backend indices are never semantic identity.

## Modes and command spaces

Supported modes are `POSITION`, `VELOCITY`, `EFFORT`, and `IMPEDANCE`.

Canonical command channels depend on the P07 actuator coordinate class:

```text
ROTARY
  POSITION   rad
  VELOCITY   rad_s
  EFFORT     N_m

LINEAR
  POSITION   m
  VELOCITY   m_s
  EFFORT     N
```

`IMPEDANCE` uses both POSITION and VELOCITY channels in canonical order. Command-space values are semantic command coordinates, not Euler-angle orientation fields. Rigid transform orientation remains quaternion-canonical elsewhere in RefAs.

## Gain models

Gain models are explicit `NONE`, `P`, or `PD`.

For POSITION and IMPEDANCE:

```text
ROTARY kp  N_m_per_rad
ROTARY kd  N_m_s_per_rad
LINEAR kp  N_per_m
LINEAR kd  N_s_per_m
```

For VELOCITY:

```text
ROTARY kp  N_m_s_per_rad
ROTARY kd  N_m_s2_per_rad
LINEAR kp  N_s_per_m
LINEAR kd  N_s2_per_m
```

`EFFORT` requires `NONE`; do not silently attach position/velocity feedback gains to an effort-command profile.

P08 gains are controller tuning. They do not rewrite P07 actuator stiffness/damping and do not change P06 transmission semantics.

## Controller delay

`controllerDelay.value_s` is controller-side computation/command delay in seconds. It is distinct from:

- P07 intrinsic actuator `responseLatency`;
- future P09 bus/transport/runtime latency;
- timestep or simulation scheduling conventions.

Never combine these delays into one canonical number merely because a backend exposes a single latency field.

## Unresolved values and authority

Reuse `refas.semantic-authority-set/v1`. P08 adds no provenance vocabulary.

The profile definition and selected mode must be resolved. Gain model and controller delay may remain explicit `null` when unresolved, and then require `unknown` semantic authority. Do not fabricate zero gains, zero delay, or backend defaults to make an exporter happy.

Only `observed`, `inferred`, or `engineered` authority may authorize resolved control values. This does not promote them to source truth.

## Scoped invalidation

Bind only:

- the selected P01 controller/`COMMANDS`/actuator identities;
- the selected P07 actuator records;
- the live upstream dependencies needed to reconstruct those selected P07 records.

Unrelated controllers, runtime endpoints, or unrelated actuator records must not invalidate the profile. Changes to the selected actuator capability or its live physical dependencies must invalidate it.

## Forbidden leakage

Reject P09-style fields in P08, including motor/device indices, bus IDs, sign conventions, encoder scale, zero offset, runtime endpoint IDs, or backend ordering. P08 also does not own command trajectories, desired time series, exporter approximations, or final readiness claims.
