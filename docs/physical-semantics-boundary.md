# P00 — Physical Semantics Boundary

## Status

This document defines the architectural boundary for native physical semantics in RefAs. It does not introduce P01 schemas or a new runtime capability.

## Ownership

Physical semantics extend the existing `assembly` capability. They are construction-state contracts describing how a reconstructed asset is assembled, articulated, constrained, actuated, and optionally bound to downstream representations or runtime endpoints.

They do not own source truth. Source-supported, inferred, engineered, unresolved, and prohibited propositions continue to be governed by `refas.semantic-authority-set/v1`.

Cross-representation validation is cross-cutting evidence. It may detect a mismatch and emit a typed finding, but the finding remains owned by the capability that owns the mismatched construction fact.

Examples:

- shape mismatch → `shape-reconstruction`;
- joint frame or joint limit mismatch → `assembly`;
- material mismatch → `appearance`;
- backend projection bug → representation/export infrastructure.

## Invariants

1. **No parallel physical-runtime capability.** Physical semantics are native assembly-owned construction state.
2. **No second provenance system.** Reuse semantic authority.
3. **No backend as canonical truth.** Backend files are projections of canonical construction state.
4. **No identity collapse.** Physical part, rigid link, virtual joint, mechanism, transmission, actuator, controller, and runtime endpoint are separate semantic identities.
5. **No backend-index identity.** Array positions, exporter order, and runtime indices never substitute for semantic IDs.
6. **No silent representation loss.** Backend capacity is evaluated before projection and unsupported semantics remain explicit.
7. **No silent drift.** A representable canonical property that changes downstream is `DRIFT` unless an explicit, authorized divergence exists.
8. **No authority promotion.** Backend tuning, control tuning, or runtime mapping cannot promote inferred or engineered values into observed source truth.
9. **No physical obligation for unrelated claims.** Visual fidelity does not require dynamics, control, or runtime metadata unless a physical claim requests them.
10. **No aggregate-score escape hatch.** A blocking semantic mismatch cannot be cleared solely by a better aggregate numeric score.

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
- inventing a second source-truth/provenance system;
- making a backend representation canonical;
- assigning validation findings to an artificial new truth owner; or
- weakening existing RefAs fail-closed certification boundaries.

A P00 reopen changes the architecture boundary first; downstream schemas must not work around a broken boundary with ad hoc fields.

## Plan

The implementation sequence and close criteria are defined in `docs/physical-semantics-plan.md`.
