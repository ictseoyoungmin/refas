# Representation capacity

Load this contract when a closed `refas.physical-asset-bundle/v1` must be evaluated for projection into a concrete backend representation.

## Ownership boundary

P11 reuses and strengthens `refas.representation-capacity/v1`.

The profile is **backend preflight**, not another physical truth object. Canonical physical meaning remains in P01–P10. P11 does not export files, normalize backend outputs, authorize divergence, or certify readiness.

Keep these identities separate:

```text
canonical physical bundle
  != representation-capacity profile
  != exported backend artifact
  != normalized backend view
  != cross-representation finding
  != physical claim
```

## Exact P10 binding

A capacity profile binds the exact P10 bundle digest, root module closure, root module identity, and scoped P01 identity-projection digest. If that bundle changes, the profile is stale and must be rebuilt.

Do not key semantic obligations by backend array positions, node indices, motor indices, or traversal order.

## Complete obligation inventory

Do not hand-author a partial list of backend obligations. Use the runtime derivation from the current P10 bundle and its live component payloads.

Each obligation has a canonical ID derived from:

- exact identity/component source digest;
- canonical semantic field path;
- stable semantic subject IDs.

This makes omission detectable. An unsupported semantic field cannot disappear merely because a backend lacks a matching field.

### Schema-aware semantic units

An obligation must be small enough that one backend decision is true for every subject in that obligation. Do not collapse an entire component into one decision merely because the fields share a source digest.

Use schema-aware units:

- P01 entity identity, relation identity, frame, interface, compatibility family, and each `CONTAINS` composition relation are independently classifiable;
- P02 mass, center of mass, and inertia are per rigid link;
- P03 self-collision policy is per rigid link, while collider frame/geometry/filter are per collider + owning link;
- P04 joint frame, reference configuration, and limits are per articulated joint; topology may retain the multi-subject link/joint context required to define that joint;
- P05 mechanism kind/topology are per mechanism;
- P06 coordinate space and q/dq/effort mappings are per transmission and may remain multi-subject because the mapping semantics inherently couple their input/output identities;
- P07 actuator properties are per actuator, including coordinate class, position/velocity/effort limits, stiffness, damping, armature, supported control modes, and **response latency**;
- P08 mode, command space, gains, controller delay, and coordinate class are per control profile;
- P09 endpoint mapping, coordinate class, locator, index, calibration, and transport delay are per runtime binding.

A backend may therefore classify two links, actuators, colliders, joints, or runtime bindings differently even when they originate from the same P02–P09 component contract. Conversely, inherently coupled topology/mapping semantics may keep multiple stable subject IDs in one obligation.

P11 must cover canonical construction semantics that can affect backend representation. It must not silently merge distinct P07 response latency with P08 controller delay or P09 transport delay.

## Classification

Every derived obligation must appear in exactly one classification:

- `supported` — the backend can represent the obligation without declared semantic loss;
- `approximated` — the backend can carry a declared approximation;
- `unsupported` — the backend cannot represent the obligation.

Approximation is not exact support. Every approximation must declare:

- strategy;
- reason;
- retained semantics;
- lost semantics.

The same semantic may not be declared both retained and lost.

Unsupported obligations remain explicit even when they are not blockers.

## Blockers and exportability

A blocker is a separate decision stating that one or more approximated/unsupported obligations make export unacceptable for this target use. A blocker may not target an exactly supported obligation.

`exportable` is derived only from blocker presence:

```text
blockers.length == 0  -> exportable
blockers.length > 0   -> not exportable
```

This flag authorizes only progression to P12 export work. It does not authorize physical claims or whole-object closure.

## Canonical orientation and coordinates

Rigid orientation remains quaternion-canonical. Backend Euler/RPY forms, if needed, are later P12 projections and must not become P11 truth.

Likewise, generalized coordinates, transmission coordinates, actuator capability, controller commands, and runtime calibration remain the semantics owned by P04–P09. P11 only states backend representational capacity for those semantics.

## Fail closed

Reject the profile when:

- the P10 bundle binding is stale;
- the derived obligation inventory is incomplete or stale;
- an obligation is unclassified or multiply classified;
- distinct independently representable semantic subjects were collapsed so a single classification cannot describe them truthfully;
- a canonical P02–P09 semantic family required for backend projection is omitted;
- an approximation lacks explicit retained/lost semantics;
- a blocker references an unknown or exactly supported obligation;
- backend ordering or indices are used as semantic identity;
- the profile digest does not reproduce.

## Downstream boundary

P12 consumes only an exportable P11 profile and performs canonical-to-backend projection. P13 normalizes realized backend semantics, P14 compares representations, P15 records intentional divergence, and P16 owns physical readiness claims. None of those authorities belong to P11.
