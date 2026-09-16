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

- `device` — required stable runtime-facing device locator;
- `bus` — optional bus/channel family locator;
- `runtimeIndex` — optional non-negative deployment index.

`device` and `bus` are configuration strings, not semantic IDs. They may therefore preserve backend-native spelling and separators such as `/dev/ttyUSB0`, `COM3`, or `can://arm/shoulder`. Leading/trailing whitespace and control characters are forbidden, but lowercasing or semantic-ID rewriting is not allowed.

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

### Canonical calibration equation

P09 defines one canonical conversion from a backend/runtime scalar `r` into the RefAs generalized coordinate `q`:

```text
q = zeroOffset + sign * encoderScale * r
```

The inverse is therefore uniquely defined:

```text
r = sign * (q - zeroOffset) / encoderScale
```

Consequences:

- `zeroOffset` is the canonical generalized-coordinate value when the runtime value is zero;
- `encoderScale` is always a positive magnitude;
- `sign` is the only direction-reversal term;
- the conversion may only be evaluated when `sign`, `zeroOffset`, and `encoderScale` are all resolved;
- unresolved calibration must fail closed rather than substituting `+1`, `0`, or `1`.

The runtime library exposes both forward and inverse evaluators so backends do not invent their own offset/sign ordering.

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

P09 validates only the selected runtime target semantics required to interpret runtime coordinates. It must not bind unrelated upstream capability or provenance state.

- actuator target: rebuild only the selected P07 actuator against current P01/P04/P05/P06 dependencies, then bind the actuator identity/routing dependency bindings plus its coordinate class. P07 capability-only edits such as effort, velocity, stiffness, or supported-control-mode changes do not invalidate P09 when runtime coordinate semantics and routing are unchanged;
- virtual-joint target: use the selected-joint P04 projection and bind only runtime-coordinate semantics: parent/child direction, derived joint frames, reference configuration, current resolved P01 pose, and the typed-joint contract schema/ID. P04 limit/evidence/provenance digest changes do not invalidate P09 when those coordinate semantics are unchanged. The current P04 public articulated-joint schema is revolute-only, so its runtime coordinate class is `ROTARY`;
- controller/rigid-link/interface target: P01 identity binding is sufficient for P09 because P09 must not become dependent on controller tuning, render state, or unrelated assembly details.

An upstream change that alters the selected target's coordinate class, selected joint direction/frame/reference pose, selected actuator routing, selected transmission/articulation dependency, or exact P01 runtime relation invalidates the P09 target binding. Unrelated P04 joints, joint limits/evidence, P07 capability limits, runtime endpoints, or controller tuning must not.

## Unknown values and authority

Reuse `refas.semantic-authority-set/v1`; P09 adds no provenance vocabulary.

The binding definition and device locator must be resolved. Bus, runtime index, sign, zero offset, encoder scale, and transport delay may remain explicit `null` when genuinely unresolved. Each unresolved property requires `unknown` authority. Do not silently substitute index `0`, sign `+1`, zero offset `0`, unit scale `1`, or zero transport delay.

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
