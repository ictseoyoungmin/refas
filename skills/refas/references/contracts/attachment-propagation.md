# Attachment propagation graph

RefAs executes attachment pose relations as one deterministic dependency graph after attachment semantics, surface anchors, and relation-specific solver state are available.

The graph does not introduce new attachment math. It orchestrates the authoritative primitives that already own each relation type:

- `RIGID_FOLLOW` and `SURFACE_OFFSET` use the one-owner follow runtime;
- `MULTI_ANCHOR` uses the rigid multi-anchor solver;
- `ARTICULATED` uses the bounded joint evaluator;
- `FREE`, `FUSED`, and `SUPPORTED_CLEARANCE` use only explicitly bound current canonical frames.

## Why graph propagation exists

A dependent may itself own another dependent. For example:

```text
nose + ears
    ↓ MULTI_ANCHOR
  glasses
    ↓ RIGID_FOLLOW
   badge
    ↓ ARTICULATED
   hinge
    ↓ SURFACE_OFFSET
    tip
```

Running these relations independently can leave later stages using an old owner pose. `refas.attachment-propagation-plan/v1` derives a deterministic topological entity/relation order from the validated attachment semantic DAG. `refas.attachment-propagation-report/v1` then feeds each resolved world frame into later dependents in that order.

## External canonical frames

`FREE`, `FUSED`, and `SUPPORTED_CLEARANCE` do not receive invented transforms from this layer. Their current world frames must be supplied from canonical realization state.

Every external binding records:

- the entity's canonical state digest;
- the exact rigid-frame digest;
- the exact current frame digest for every semantic owner;
- evidence references.

This lets propagation distinguish a current external frame from a stale one. A fused member built against an older owner pose cannot silently remain in place, and a caller cannot supply a world frame for a relation whose pose is owned by an attachment solver.

## Fail-closed execution

An upstream failure is not converted to a best-effort downstream pose.

- a stale external state/frame produces a blocker;
- an unresolved owner prevents its dependent from solving;
- an `INFEASIBLE` multi-anchor report is not propagated;
- an out-of-limit articulated state is blocked;
- downstream dependents remain unresolved rather than receiving a guessed transform.

The graph never mutates GLB mesh bytes. A successful report is only `READY_FOR_REALIZATION`.

## Supported clearance

`SUPPORTED_CLEARANCE` is special. Its current frame may participate in pose propagation only when its external frame and owner-frame bindings are current. Even then its entity result is `PENDING_REALIZED_VALIDATION`.

The graph does not claim that its intentional gap or support path is physically valid. After the candidate GLB is realized, the existing `refas.supported-clearance-report/v1` and realized-assembly proof must still validate support, module-pair identity, penetration, and signed-clearance bounds.

Therefore a propagation report never authorizes assembly closure or certification.
