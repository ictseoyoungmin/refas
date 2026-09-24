# RefAs Physical Semantics Implementation Plan

## Status — implemented through P17

The physical-semantics expansion described by this plan is implemented through P17 as of 2026-09-17. End-to-end closure is documented in `docs/integrated-physical-fixture.md` and exercised by `tests/integrated-physical-fixture.test.mjs`.

This document remains the detailed architecture and acceptance history for P00–P17. Current 1.1.0 release gates are owned by `docs/release-criteria.md` and `docs/v1.1.0-release-readiness.md`.

## Purpose

RefAs extends physical and mechatronic reconstruction as native construction semantics. This work does not introduce a parallel robotics subsystem or a new top-level reconstruction capability.

The governing rule is:

> A physical asset may project into multiple backend representations while preserving semantic identity, authority, modular composition, canonical frames, and declared physical meaning.

Physical semantics remain inside the existing RefAs architecture:

- source truth remains owned by evidence and semantic authority;
- editable physical semantics remain construction state;
- backend files remain realized representations rather than canonical truth;
- certification remains claim-specific and evidence-bound.

## P00 architecture boundary

Physical semantics are assembly-owned construction contracts plus cross-cutting validation evidence.

```text
Reference evidence
      |
      v
Existing observation / hypothesis / semantic authority
      |
      v
Assembly-owned construction state
      |
      +-- modular composition / attachment interfaces
      +-- structural assembly
      +-- articulation
      +-- rigid-body dynamics
      +-- collision semantics
      +-- mechanism
      +-- transmission
      +-- actuation
      +-- optional control profile
      +-- optional runtime binding
      |
      v
Representation capacity preflight
      |
      +--> backend representation A
      +--> backend representation B
      +--> visual/runtime representations
      |
      v
Cross-representation validation
      |
      v
Typed findings / claim-specific evidence
```

Cross-representation validation is not a truth owner. It compares canonical semantics against realized representations and emits typed findings owned by the capability responsible for the mismatched construction fact.

## Native identity separation

The following identities must remain distinct even when a simple asset happens to map them one-to-one:

```text
assembly module
    !=
attachment interface
    !=
physical part
    !=
rigid link
    !=
virtual joint
    !=
mechanism
    !=
transmission
    !=
actuator
    !=
controller
    !=
runtime endpoint
```

An `assembly module` is a reusable construction unit. An `attachment interface` is a semantic mount/socket exposed by a module. An attachment interface may define compatibility, frame, clearance, and load constraints without implying any articulated degree of freedom. A fixed socket is therefore not silently promoted into a joint.

A future contract may connect these identities explicitly, but must not collapse them by array position, shared display name, backend index, or accidental one-to-one geometry.

## Canonical transform contract

P00 reserves one canonical semantic-frame convention before P01 introduces identity schemas.

Canonical interface and physical frames use:

```text
translation_m: [x, y, z]
rotation_quat_xyzw: [x, y, z, w]
```

Rules:

- translation is expressed in meters in the declared parent frame;
- rotation is a normalized quaternion in `[x,y,z,w]` order;
- quaternion sign is canonical: prefer `w > 0`; when `w == 0`, the first non-zero component in `x,y,z` is positive;
- `q` and `-q` describe the same physical orientation but canonical serialization emits only one sign;
- semantic attachment-interface frames do not carry scale;
- geometry realization may have explicit positive scale where the owning construction contract permits it;
- negative runtime scale is not used to express handedness; mirrored/handed variants are explicit derivatives with their own realized geometry/provenance while preserving the intended semantic relationship;
- authoring UI may expose Euler angles or gizmos, but persisted canonical orientation remains quaternion-based.

Later backend normalization must compare semantic orientation after quaternion normalization/canonicalization rather than treating representation-specific Euler order or quaternion sign as physical drift.

## Sub-ownership and invalidation

`assembly` remains the single top-level RefAs capability owner for physical construction semantics. It must not become an undifferentiated god-object.

Later contracts preserve scoped semantic subdomains:

```text
composition     module / attachment interface / mount compatibility
articulation    rigid link / virtual joint / joint frame / joint limit
dynamics        mass / center of mass / inertia
collision       collision realization / contact filtering
mechanism       mechanism topology
transmission    coordinate / velocity / effort mapping
actuation       actuator physical capability
control         controller tuning / command profile
runtime         endpoint / bus / index binding
```

These subdomains do not create new top-level capabilities or source-truth owners. They define dependency and invalidation granularity inside assembly-owned construction state.

Required behavior:

- a controller-gain edit does not invalidate unrelated geometric assembly closure;
- a runtime endpoint/index edit does not mutate actuator, joint, module, or source authority;
- an actuator-capability edit invalidates dependent control/runtime claims but not unrelated shape evidence;
- a joint-frame or module-interface edit may invalidate articulation, mechanism, collision, and downstream backend projections that depend on that frame;
- authority promotion is never implied by downstream tuning;
- invalidation dependencies must become explicit and deterministic rather than inferred from file timestamps or backend ordering.

## Existing contracts retained

### Semantic authority

`refas.semantic-authority-set/v1` remains the authority/provenance system. Physical properties use the existing authority states:

- `observed`
- `inferred`
- `engineered`
- `unknown`
- `forbidden`

No second provenance enum is introduced.

### Representation capacity

`refas.representation-capacity/v1` remains the backend-capability preflight contract. Export or realization work must distinguish:

- semantics the backend can represent faithfully;
- semantics represented only through an explicit approximation;
- semantics the backend cannot represent;
- blockers that prevent a valid projection.

### Existing attachment and articulation semantics

Existing attachment and articulated-joint contracts remain valid. P01 must connect new module/interface identities to existing assembly attachment semantics rather than inventing a competing socket system. Later articulation slices add a graph around typed joint contracts rather than redefining current joint semantics in P00.

## Canonical representation rule

Backend files are projections of canonical construction semantics.

```text
canonical RefAs construction state
        +--> backend A
        +--> backend B
        +--> backend C
```

A backend-to-backend conversion chain is not canonical truth:

```text
backend A -> backend B -> backend C   # not canonical
```

A backend-specific value may differ only through an explicit declared divergence. Silent differences are drift.

## Cross-representation outcomes

Future validation uses semantic outcomes instead of one aggregate error score:

- `EQUIVALENT` — required semantics are preserved;
- `LOSSY` — the target representation cannot preserve a declared semantic and the loss is explicit;
- `DRIFT` — representable semantics differ without an authorized declaration;
- `DECLARED_DIVERGENCE` — an explicit backend-specific construction choice explains the difference;
- `UNRESOLVED` — canonical authority is insufficient to make a positive comparison claim;
- `INVALID` — identity, references, topology, or another hard invariant is broken.

`DECLARED_DIVERGENCE` is a validation outcome. The authority that licenses an override may separately be `engineered`; the terms are intentionally not conflated.

## Claim levels

Physical semantics are opt-in by claim. Visual reconstruction does not require hardware-runtime metadata.

Planned claim levels:

- `visual-faithful`
- `articulated-ready`
- `simulation-ready`
- `control-ready`
- `runtime-ready`

Later slices define exact obligations. P00 only reserves the separation.

## Implementation slices

### P00 — Physical Semantics Boundary

Define this architecture boundary and repository guardrails.

Close when:

- no new top-level runtime capability is introduced;
- physical semantics are explicitly assembly-owned construction contracts;
- cross-representation validation is explicitly cross-cutting and non-authoritative;
- module and attachment-interface identities are distinct from parts and joints;
- canonical semantic frames are meters + normalized canonical `[x,y,z,w]` quaternion with no interface scale;
- downstream control/runtime state has scoped invalidation rather than owning upstream assembly truth;
- existing semantic-authority, attachment-semantics, and representation-capacity contracts are reused;
- the P01-P17 plan is present in the repository.

### P01 — Semantic Identity Graph

Introduce stable domain-neutral identities and typed relations between assembly module, attachment interface, physical part, rigid link, virtual joint, mechanism, transmission, actuator, controller, and runtime endpoint.

Initial relation vocabulary must be able to express at least:

```text
module CONTAINS part/link
module EXPOSES attachment-interface
attachment-interface COMPATIBLE_WITH mount-standard/interface family
attachment-interface BINDS_TO attachment-interface
joint CONNECTS link -> link
mechanism REALIZES generalized coordinates
transmission MAPS semantic spaces
actuator DRIVES transmission/mechanism coordinate
controller COMMANDS actuator
runtime-endpoint BINDS actuator/controller/sensor-facing semantic identity
```

P01 must bridge attachment interfaces to existing RefAs attachment semantics instead of duplicating anchors or attachment ownership.

Close when dangling references, invalid relation types, identity collisions, forbidden cycles, accidental joint/socket conflation, and backend-index identity fail deterministically. Canonical transform-bearing identities must validate quaternion normalization/sign convention and parent-frame reference.

### P02 — Rigid Body Dynamics

Introduce link-bound mass, center of mass, inertia tensor, frame binding, authority references, and digest binding.

Close when invalid mass/inertia/frame data fails deterministically and unresolved values remain unresolved rather than receiving fabricated defaults.

### P03 — Collision Semantics

Separate collision realization from visual geometry and support explicit primitive/mesh proxies and contact filtering.

Close when visual/collision reuse requires an explicit declaration and collision identity cannot silently inherit from render identity.

### P04 — Articulation Graph

Compose typed joint contracts into a link/joint topology without replacing existing articulated-joint semantics.

Close when roots, parent-child relationships, joint references, canonical joint frames, and supported topology invariants validate deterministically. Attachment interfaces remain distinct from joints even when an articulated module connection references both.

### P05 — Mechanism Graph

Represent the physical structure that realizes generalized coordinates. Initial types may include direct, gear, belt, linkage, parallel linkage, differential, coupled, and custom mechanisms.

Close when joint semantics and mechanism semantics remain independently addressable and a simple geared fixture validates end to end.

### P06 — Transmission Model

Represent coordinate, velocity, and effort mappings between semantic spaces. Initial mappings: identity, ratio, linear matrix, nonlinear, and external solver.

Close when q/dq/effort mappings are explicit and a mechanism cannot imply an undeclared actuator mapping.

### P07 — Actuation Model

Represent actuators independently of joints, including kind, effort limit, velocity limit, position range, and authority.

Close when actuator limits cannot silently substitute for joint limits and vice versa.

### P08 — Control Profile

Represent control tuning separately from actuator physical capability, including mode, gains, command space, latency, and update rate.

Close when controller parameters cannot mutate actuator or joint source truth and controller-only changes invalidate only dependent control/runtime projections and claims.

### P09 — Runtime Binding

Optionally bind semantic actuators to runtime endpoints such as indices, device identifiers, buses, sign, zero offset, scale, and sensor frames.

Close when simulation-ready assets remain valid without runtime binding, runtime-ready claims require it explicitly, and runtime-binding edits do not invalidate unrelated assembly geometry or promote backend indices to semantic identity.

### P10 — Physical Asset Bundle

Introduce a digest-bound manifest over physical construction contracts rather than a monolithic data object.

The bundle must preserve reusable module identity, exposed attachment interfaces, canonical frame digests, and exact child-component digests so a larger system can consume a closed child module without rewriting it.

Close when exact component digests reproduce deterministically, stale component substitution fails, and immutable child-module reuse remains distinguishable from a reopened upstream module.

### P11 — Representation Profile

Bind backend obligations to representation capacity and declare supported, approximated, unsupported, and blocking semantics before export.

Close when unsupported semantics cannot disappear silently during projection.

### P12 — Export Adapters

Project canonical construction semantics into backend representations through one-way adapters.

Close when adapters consume canonical semantics directly and no backend-to-backend conversion is required for canonical realization.

### P13 — Representation Normalizer

Read supported backend representations into normalized semantic views for comparison without promoting backend data to canonical truth.

Close when semantic IDs, canonicalized transforms, interfaces, frames, limits, dynamics, collision, and actuator mappings can be compared independent of backend ordering, Euler convention, or quaternion sign.

### P14 — Cross-Representation Validator

Compare canonical semantics and normalized representations and emit typed findings with `EQUIVALENT`, `LOSSY`, `DRIFT`, `UNRESOLVED`, or `INVALID` outcomes.

Close when a deliberately altered representable property produces a deterministic `DRIFT` finding rather than only a numeric score, while `q` versus `-q` and equivalent normalized frame encodings do not create false drift.

### P15 — Declared Divergence

Allow explicit backend-specific overrides with target backend, semantic subject, field path, canonical value, override value, authority, and reason.

Close when the same altered property is `DRIFT` without a declaration and `DECLARED_DIVERGENCE` with a valid declaration while canonical state remains unchanged.

### P16 — Physical Claims

Add claim-specific obligations for articulated-ready, simulation-ready, control-ready, and runtime-ready certification without weakening visual-source fidelity claims.

Close when each claim fails closed on its own missing physical obligations and unrelated assets do not inherit unnecessary requirements. Scoped invalidation must not turn a controller/runtime edit into a false visual or geometric reconstruction failure.

### P17 — Integrated Physical Fixture

Dogfood the complete stack on a domain-neutral coupled parallel 2-DOF fixture assembled from at least two reusable modules through explicit attachment interfaces, with two virtual coordinates, two actuators, nonlinear transmission, physical linkage, collision proxies, dynamics, optional control, and runtime binding.

Close when:

- child-module identity and interface contracts survive composition;
- fixed attachment interfaces are not confused with joints;
- multiple backend projections normalize back without undeclared semantic drift;
- quaternion sign or backend Euler-order differences do not create false drift;
- deliberate representable drift is detected;
- declared divergence is distinguished;
- control/runtime-only edits have scoped invalidation;
- identity never collapses to backend index;
- digest reproduction is deterministic.

P17 is now closed by the integrated fixture. The final positive closure path includes deliberate P14 drift, exact live P15 declared divergence, P16 `runtime-ready` evidence, typed live preflight, and the existing certification evaluator rather than relying only on an all-equivalent shortcut.

## Scope discipline

P00 intentionally did not add P01 schemas, exporters, physics solvers, backend adapters, or new certification claims. It reserved the architecture rules that later slices obey. The completed implementation keeps that boundary: no physical slice created a new top-level RefAs capability or a second canonical truth owner.

## Naming policy

Repository-facing terminology is domain-neutral. Fixtures and contracts describe reusable structural patterns rather than external products or source projects.
