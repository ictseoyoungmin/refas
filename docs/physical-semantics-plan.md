# RefAs Physical Semantics Implementation Plan

## Status — implemented through P17

The physical-semantics expansion described by this plan is implemented through P17 as of 2026-09-17. The end-to-end closure is documented in `docs/integrated-physical-fixture.md` and exercised by `tests/integrated-physical-fixture.test.mjs`.

This file now serves as the architecture/implementation record for the completed 1.1.0 physical stack. Current release gates are owned by `docs/release-criteria.md` and `docs/v1.1.0-release-readiness.md`.

## Governing boundary

RefAs extends physical and mechatronic reconstruction as native construction semantics. It does not introduce a parallel robotics subsystem or a new top-level reconstruction capability.

> A physical asset may project into multiple backend representations while preserving semantic identity, authority, modular composition, canonical frames, and declared physical meaning.

Physical semantics remain inside the existing architecture:

- source truth remains owned by evidence and semantic authority;
- editable physical semantics remain assembly-owned construction state;
- backend files remain realized representations rather than canonical truth;
- certification remains claim-specific and evidence-bound;
- visual reconstruction remains usable without opting into physical readiness.

## Canonical identity and frame rules

The following identities remain distinct:

```text
assembly module
    != attachment interface
    != physical part
    != rigid link
    != virtual joint
    != mechanism
    != transmission
    != actuator
    != controller
    != runtime endpoint
```

Backend index, array order, shared display name, and serializer position never replace semantic identity.

Canonical transform-bearing physical/interface identities use:

```text
translation_m: [x, y, z]
rotation_quat_xyzw: [x, y, z, w]
```

Translation is in meters in the declared parent frame. Rotation is normalized and serialized with the canonical quaternion sign convention. Semantic interface frames do not carry scale. Equivalent representation-specific Euler/quaternion/unit encodings are normalized before semantic comparison.

## Ownership and invalidation

`assembly` remains the single top-level owner for physical construction. Scoped subdomains provide deterministic dependency/invalidation inside that owner:

```text
composition
articulation
dynamics
collision
mechanism
transmission
actuation
control
runtime
```

Downstream tuning does not own upstream truth. Controller changes may invalidate control/runtime claims without invalidating unrelated shape or simulation evidence. Runtime index changes do not mutate actuator/joint/module identity. Upstream frame/mechanism changes invalidate only dependent downstream semantics and representations.

## Authority and representation rules retained

`refas.semantic-authority-set/v1` remains the provenance/meaning contract: `observed`, `inferred`, `engineered`, `unknown`, and `forbidden` are not interchangeable. Unknown is unresolved; inferred/engineered construction is not observed manufacturer truth.

`refas.representation-capacity/v1` remains the preflight contract for what a backend can preserve faithfully, approximate explicitly, or not represent.

Backend files remain projections of canonical construction state:

```text
canonical RefAs construction
      ├──> backend A
      ├──> backend B
      └──> backend C
```

A backend-to-backend conversion chain is not canonical truth.

## Validation outcomes

Cross-representation comparison uses semantic outcomes:

- `EQUIVALENT` — required semantics are preserved;
- `LOSSY` — target representation cannot preserve a declared semantic and the loss is explicit;
- `DRIFT` — representable semantics differ without current authorization;
- `DECLARED_DIVERGENCE` — exact current P15 authority licenses the exact backend-specific difference;
- `UNRESOLVED` — canonical authority is insufficient for a positive comparison;
- `INVALID` — identity, references, topology, or another hard invariant is broken.

## Completed implementation slices

| Slice | Closure delivered |
|---|---|
| P00 | Physical semantics architecture boundary, assembly ownership, canonical transform and identity rules. |
| P01 | Stable semantic identity graph and typed relations across modules, interfaces, parts, links, joints, mechanisms, transmissions, actuators, controllers, and runtime endpoints. |
| P02 | Link-bound mass, center of mass, inertia, frame binding, authority and deterministic validation without invented defaults. |
| P03 | Collision semantics separated from visual geometry, including explicit reuse/approximation and contact filtering. |
| P04 | Link/joint articulation graph composed around existing articulated-joint semantics without conflating sockets and joints. |
| P05 | Mechanism graph with independently addressable physical topology. |
| P06 | Explicit coordinate/velocity/effort transmission mappings, including nonlinear/external implementation binding. |
| P07 | Actuator physical capability and limits distinct from joint limits. |
| P08 | Controller profiles distinct from actuator/source truth with downstream-scoped invalidation. |
| P09 | Optional runtime endpoint/device/bus/index binding and calibration without promoting runtime indices to semantic identity. |
| P10 | Digest-bound physical asset bundle preserving exact component and reusable child-module closures. |
| P11 | Representation-capacity obligations bound before export. |
| P12 | One-way export adapters from canonical physical semantics. |
| P13 | Backend-independent normalized semantic views with canonical transform/unit handling. |
| P14 | Typed canonical-versus-normalized validation with deterministic equivalent/loss/drift/unresolved/invalid outcomes. |
| P15 | Exact field-scoped declared divergence with live binding to current P14 drift and exact engineered authority. |
| P16 | Scoped articulated/simulation/control/runtime readiness evidence with mandatory typed live preflight before generic certification. |
| P17 | Integrated reusable 2-DOF fixture proving the full chain, including deliberate drift, live declared divergence, runtime-ready certification, scoped invalidation, and deterministic reproduction. |

## P15 trust boundary

Persisted divergence artifacts have two validation layers:

1. intrinsic integrity/canonicality;
2. live binding against the current P14/P11–P13 chain and exact current authority entry.

Only the second is sufficient for downstream physical claims. A self-consistent or re-signed stale declaration may remain internally valid while being unusable because its external authority/evidence binding is no longer current.

## P16 trust boundary

Physical readiness evidence accepts only required representation obligations that are `EQUIVALENT` or backed by a current live `DECLARED_DIVERGENCE`. `LOSSY`, undeclared `DRIFT`, `UNRESOLVED`, and `INVALID` block the affected claim.

The public generic certification evaluator is intentionally guarded. A physical claim cannot bypass live preflight by using a generic selector or project-level certification route.

## P17 closure evidence

The integrated fixture uses a coupled parallel 2-DOF assembly built from reusable modules with explicit fixed attachment interfaces, separate virtual joints, dynamics/collision, nonlinear transmission, two actuators, controller profiles, and runtime bindings.

It projects the same canonical P10 state independently into two backend representations. Representation-specific quaternion sign/component order, centimeter translation units, and equivalent Euler conventions normalize back to equivalent semantics.

The final closure deliberately changes one representable rigid-body mass value in one backend. The positive path therefore exercises:

```text
P14 DRIFT
  → exact current engineered authority
  → live P15 DECLARED_DIVERGENCE
  → P16 runtime-ready evidence
  → typed live preflight
  → generic certification decision
```

Substituted authority is a negative regression. Control/runtime-only edits are verified not to stale an unchanged lower simulation claim. Repeated runs reproduce the same exact P15-bound closure evidence.

`refas.p17-integration-evidence/v1` remains a fixture/test evidence envelope, not a public construction schema or additional truth owner.

## 1.1.0 closure rule

The implementation plan is closed only while the release candidate preserves all of the following:

- semantic identity never collapses to backend/runtime index;
- canonical construction remains the only physical truth source for backend projections;
- unknown remains unresolved rather than default-filled;
- representation loss/drift remains explicit;
- declared divergence requires exact live authority;
- physical readiness remains claim-scoped and live-gated;
- visual/source-fidelity authority remains independent;
- integrated fixture evidence remains deterministic;
- repository, package, CI, dogfood, and release audits remain green on the exact candidate.

Any future change that violates one of these boundaries reopens the owning contract rather than silently redefining the 1.1.0 closure.
