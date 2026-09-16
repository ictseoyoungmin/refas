# Runtime binding contract

Use this leaf when a stable P01 `runtime-endpoint` must be bound to one semantic RefAs target through an exact `BINDS_RUNTIME` relation. P09 owns deployment/runtime locator and calibration semantics. It does not own actuator capability, controller tuning, transmission equations, rigid orientation, exporter approximation, or certification.

## Ownership boundary

Keep these identities distinct:

```text
runtime endpoint
  != controller
  != actuator
  != virtual joint
  != rigid link
  != attachment interface
```

P01 owns the `BINDS_RUNTIME` edge. P04/P07 own physical articulation/actuator semantics. P08 owns controller mode and tuning. P09 owns runtime locator/calibration fields only.

Runtime locator values never become semantic identity. A device index may change while the same stable `runtimeEndpointId` remains authoritative.

## Exact selector

Every binding exact-binds:

- one `runtimeEndpointId` whose P01 kind is `runtime-endpoint`;
- one exact `bindsRuntimeRelationId` whose kind is `BINDS_RUNTIME`;
- one stable semantic `targetId` and matching `targetKind`.

Relation source/target drift invalidates the binding. Backend array order, motor index, bus order, or discovery order are never semantic identity.

## Runtime locator

P09 may carry:

- `device` — required stable runtime-facing device identifier;
- `bus` — optional bus/channel family identifier;
- `runtimeIndex` — optional non-negative deployment index.

These values are configuration, not P01 identity. Do not rewrite semantic IDs to match backend numbering.

## Coordinate class and calibration

Runtime coordinate classes are `NONE`, `ROTARY`, and `LINEAR`.

- actuator targets must match the live P07 actuator coordinate class;
- virtual-joint targets must match the live P04 joint coordinate class;
- controller, rigid-link, and attachment-interface targets use `NONE`.

For `NONE`, `sign`, `zeroOffset`, and `encoderScale` must remain `null`.

For scalar coordinate targets:

```text
ROTARY
  zeroOffset    rad
  encoderScale  rad_per_runtime_unit

LINEAR
  zeroOffset    m
  encoderScale  m_per_runtime_unit
```

`sign` is exactly `+1` or `-1`. Encoder scale is positive; direction reversal belongs to `sign`, not to a negative scale.

## Quaternion, Euler, and runtime zero

A P09 `zeroOffset` is a generalized-coordinate calibration. It is not an Euler angle and does not replace canonical rigid-transform orientation.

```text
rigid transform orientation  -> quaternion canonical
revolute joint/runtime q     -> scalar rad
prismatic joint/runtime q    -> scalar m
UI/backend Euler             -> derived representation only
```

Never serialize a runtime zero offset as an independent Euler truth.

## Timing

`transportDelay.value_s` is runtime/bus/transport delay. It remains distinct from:

- P08 controller computation/command delay;
- P07 intrinsic actuator response latency;
- simulation timestep/scheduler configuration.

Do not collapse these into one canonical latency merely because a backend exposes a single field.

## Live target semantics

P09 must validate the selected target against its owning upstream semantics without binding unrelated branches.

- actuator target: validate the selected P07 actuator through its scoped live upstream dependencies;
- virtual-joint target: validate the selected P04 articulation/joint contract;
- controller/rigid-link/interface target: P01 identity binding is sufficient for P09 because P09 must not become dependent on controller tuning, render state, or unrelated assembly details.

An upstream change that alters the selected target's coordinate semantics invalidates the P09 target binding. Unrelated runtime endpoints or unrelated actuator/controller edits must not.

## Unknown values and authority

Reuse `refas.semantic-authority-set/v1`; P09 adds no provenance vocabulary.

The binding definition and device ID must be resolved. Bus, runtime index, sign, zero offset, encoder scale, and transport delay may remain explicit `null` when genuinely unresolved. Each unresolved property requires `unknown` authority. Do not silently substitute index `0`, sign `+1`, zero offset `0`, unit scale `1`, or zero transport delay.

Resolved runtime values may be observed, inferred, or engineered. Downstream convenience never promotes an unknown value to source truth.

## Forbidden leakage

P09 does not own:

- P08 `kp` / `kd` or control mode;
- P07 effort/velocity/position capability;
- P06 transmission ratio/Jacobian/offset semantics;
- rigid-transform Euler orientation;
- backend export approximation;
- command trajectories or desired time series;
- final simulation/control/runtime readiness claims.

Those remain with their owning contracts and later claim/certification slices.
