# P00 — Physical Semantics Boundary

## Status

This document defines the architectural boundary for native physical semantics in RefAs. It does not introduce P01 schemas or a new runtime capability.

## Ownership

Physical semantics extend the existing `assembly` capability. They are construction-state contracts describing how a reconstructed asset is composed from modules and attachment interfaces, assembled, articulated, constrained, actuated, and optionally bound to downstream representations or runtime endpoints.

They do not own source truth. Source-supported, inferred, engineered, unresolved, and prohibited propositions continue to be governed by `refas.semantic-authority-set/v1`.

Cross-representation validation is cross-cutting evidence. It may detect a mismatch and emit a typed finding, but the finding remains owned by the capability that owns the mismatched construction fact.

Examples:

- shape mismatch → `shape-reconstruction`;
- module/interface, joint-frame, joint-limit, dynamics, collision, mechanism, transmission, or actuation mismatch → `assembly`;
- material mismatch → `appearance`;
- backend projection bug → representation/export infrastructure.

`assembly` is the top-level RefAs owner for physical construction semantics, but physical subdomains retain separate semantic identities and invalidation scopes. A controller-only or runtime-binding edit must not silently invalidate geometric assembly closure; a module/interface or joint-frame edit may invalidate downstream physical projections that depend on it.

## Invariants

1. **No parallel physical-runtime capability.** Physical semantics are native assembly-owned construction state.
2. **No second provenance system.** Reuse semantic authority.
3. **No backend as canonical truth.** Backend files are projections of canonical construction state.
4. **No identity collapse.** Assembly module, attachment interface, physical part, rigid link, virtual joint, mechanism, transmission, actuator, controller, and runtime endpoint are separate semantic identities.
5. **No joint/socket conflation.** An attachment interface (socket/mount) is a composition contract and is not implicitly a joint; fixed mounting, detachable mounting, and articulated relationships must remain distinguishable.
6. **Canonical transform semantics.** Semantic frames use meters plus normalized quaternion `[x,y,z,w]`; equivalent quaternion signs are canonicalized deterministically, interface frames do not encode scale, and handedness changes require an explicit derivative rather than negative runtime scale.
7. **No backend-index identity.** Array positions, exporter order, and runtime indices never substitute for semantic IDs.
8. **No silent representation loss.** Backend capacity is evaluated before projection and unsupported semantics remain explicit.
9. **No silent drift.** A representable canonical property that changes downstream is `DRIFT` unless an explicit, authorized divergence exists.
10. **No authority promotion.** Backend tuning, control tuning, or runtime mapping cannot promote inferred or engineered values into observed source truth.
11. **No physical obligation for unrelated claims.** Visual fidelity does not require dynamics, control, or runtime metadata unless a physical claim requests them.
12. **No aggregate-score escape hatch.** A blocking semantic mismatch cannot be cleared solely by a better aggregate numeric score.

## Composition identities and canonical transforms

Modular composition is part of physical construction semantics rather than an exporter convention.

```text
assembly module
      |
      +-- exposes --> attachment interface
                         |
                         +-- compatibility / mount standard
                         +-- canonical local frame
                         +-- clearance / load constraints
                         +-- optional articulated relation
```

`assembly module` identifies a reusable construction unit. `attachment interface` identifies a semantic connection surface or socket exposed by a module. It is valid for two modules to be connected by a fixed attachment interface with no joint at all.

Canonical semantic-frame rules are reserved at P00 so later schemas cannot diverge:

- translation is expressed in meters in the declared parent frame;
- rotation is a normalized quaternion serialized as `[x,y,z,w]`;
- quaternion sign is canonical: prefer `w > 0`; when `w == 0`, the first non-zero component in `x,y,z` is positive;
- `q` and `-q` therefore describe the same physical orientation but serialize to one canonical value;
- semantic interface frames carry no scale; scale belongs to geometry realization rather than socket pose;
- negative runtime scale is not a handedness mechanism; mirrored/handed assets use an explicit derivative with preserved semantic identity/provenance.

Authoring tools may display Euler angles or gizmos, but canonical persisted orientation remains quaternion-based.

## Sub-ownership and invalidation

No new top-level capability is introduced, but assembly-owned physical semantics are not one undifferentiated blob. Later contracts must preserve scoped invalidation across at least:

```text
composition     module / attachment-interface / mount compatibility
articulation    link / joint / joint-frame / joint-limit
dynamics        mass / center-of-mass / inertia
collision       collision realization / contact filtering
mechanism       mechanism topology
transmission    coordinate / velocity / effort mapping
actuation       actuator capability
control         controller tuning/profile
runtime         endpoint/bus/index binding
```

Changing a downstream control or runtime binding must not mutate or promote upstream source truth, geometry, joint semantics, or actuator capability. Conversely, an upstream interface, joint-frame, or dynamics change may invalidate downstream projections whose meaning depends on that state. P01 and later schemas must encode dependencies explicitly enough for deterministic invalidation.

## Semantic boundary

```text
source evidence
      |
      v
semantic authority
      |
      v
assembly-owned physical construction semantics
      |
      +--> modular composition / attachment interfaces
      +--> articulation
      +--> dynamics
      +--> collision
      +--> mechanism
      +--> transmission
      +--> actuation
      +--> optional control
      +--> optional runtime binding
      |
      v
representation capacity
      |
      v
backend projections
      |
      v
cross-representation evidence/findings
      |
      v
claim-specific certification
```

## Reopen rule

P00 reopens if a later implementation slice demonstrates that one of these invariants cannot represent a required domain-neutral physical asset without either:

- collapsing identities that must stay separate;
- treating an attachment interface as a joint or backend index merely for convenience;
- permitting backend-specific transform conventions to become canonical;
- coupling downstream controller/runtime edits to unrelated geometric closure;
- inventing a second source-truth/provenance system;
- making a backend representation canonical;
- assigning validation findings to an artificial new truth owner; or
- weakening existing RefAs fail-closed certification boundaries.

A P00 reopen changes the architecture boundary first; downstream schemas must not work around a broken boundary with ad hoc fields.

## Plan

The implementation sequence and close criteria are defined in `docs/physical-semantics-plan.md`.
