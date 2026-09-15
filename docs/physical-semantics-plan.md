# RefAs Physical Semantics Implementation Plan

## Purpose

RefAs extends physical and mechatronic reconstruction as native construction semantics. This work does not introduce a parallel robotics subsystem or a new top-level reconstruction capability.

The governing rule is:

> A physical asset may project into multiple backend representations while preserving semantic identity, authority, and declared physical meaning.

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

A future contract may connect these identities explicitly, but must not collapse them by array position, shared display name, or backend index.

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

### Existing articulation

Existing articulated-joint contracts remain valid. Later slices add an articulation graph around typed joint contracts rather than redefining current joint semantics in P00.

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
- semantic identity separation is documented;
- existing semantic-authority and representation-capacity contracts are reused;
- the P01-P17 plan is present in the repository.

### P01 — Semantic Identity Graph

Introduce stable domain-neutral identities and typed relations between part, link, joint, mechanism, transmission, actuator, controller, and runtime endpoint.

Close when dangling references, invalid relation types, identity collisions, and forbidden cycles fail deterministically.

### P02 — Rigid Body Dynamics

Introduce link-bound mass, center of mass, inertia tensor, frame binding, authority references, and digest binding.

Close when invalid mass/inertia/frame data fails deterministically and unresolved values remain unresolved rather than receiving fabricated defaults.

### P03 — Collision Semantics

Separate collision realization from visual geometry and support explicit primitive/mesh proxies and contact filtering.

Close when visual/collision reuse requires an explicit declaration and collision identity cannot silently inherit from render identity.

### P04 — Articulation Graph

Compose typed joint contracts into a link/joint topology without replacing existing articulated-joint semantics.

Close when roots, parent-child relationships, joint references, and supported topology invariants validate deterministically.

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

Close when controller parameters cannot mutate actuator or joint source truth.

### P09 — Runtime Binding

Optionally bind semantic actuators to runtime endpoints such as indices, device identifiers, buses, sign, zero offset, scale, and sensor frames.

Close when simulation-ready assets remain valid without runtime binding and runtime-ready claims require it explicitly.

### P10 — Physical Asset Bundle

Introduce a digest-bound manifest over physical construction contracts rather than a monolithic data object.

Close when exact component digests reproduce deterministically and stale component substitution fails.

### P11 — Representation Profile

Bind backend obligations to representation capacity and declare supported, approximated, unsupported, and blocking semantics before export.

Close when unsupported semantics cannot disappear silently during projection.

### P12 — Export Adapters

Project canonical construction semantics into backend representations through one-way adapters.

Close when adapters consume canonical semantics directly and no backend-to-backend conversion is required for canonical realization.

### P13 — Representation Normalizer

Read supported backend representations into normalized semantic views for comparison without promoting backend data to canonical truth.

Close when semantic IDs, frames, limits, dynamics, collision, and actuator mappings can be compared independent of backend ordering.

### P14 — Cross-Representation Validator

Compare canonical semantics and normalized representations and emit typed findings with `EQUIVALENT`, `LOSSY`, `DRIFT`, `UNRESOLVED`, or `INVALID` outcomes.

Close when a deliberately altered representable property produces a deterministic `DRIFT` finding rather than only a numeric score.

### P15 — Declared Divergence

Allow explicit backend-specific overrides with target backend, semantic subject, field path, canonical value, override value, authority, and reason.

Close when the same altered property is `DRIFT` without a declaration and `DECLARED_DIVERGENCE` with a valid declaration while canonical state remains unchanged.

### P16 — Physical Claims

Add claim-specific obligations for articulated-ready, simulation-ready, control-ready, and runtime-ready certification without weakening visual-source fidelity claims.

Close when each claim fails closed on its own missing physical obligations and unrelated assets do not inherit unnecessary requirements.

### P17 — Integrated Physical Fixture

Dogfood the complete stack on a domain-neutral coupled parallel 2-DOF fixture with two virtual coordinates, two actuators, nonlinear transmission, physical linkage, collision proxies, dynamics, optional control, and runtime binding.

Close when multiple backend projections normalize back without undeclared semantic drift, deliberate drift is detected, declared divergence is distinguished, identity never collapses to backend index, and digest reproduction is deterministic.

## Scope discipline

P00 intentionally does not add P01 schemas, exporters, physics solvers, backend adapters, or new certification claims. Those belong to later slices and must reopen P00 only if implementation evidence proves this boundary insufficient.

## Naming policy

Repository-facing terminology is domain-neutral. Fixtures and contracts describe reusable structural patterns rather than external products or source projects.
