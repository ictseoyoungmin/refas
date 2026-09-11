# Logical fusion

`FUSED` attachment semantics mean that semantic parts belong to one logical body before any physical mesh union is allowed. RefAs keeps those parts separately addressable during reconstruction so observation, repair ownership, and rollback remain local and recoverable.

## Why logical fusion comes first

A head may be constructed from `head-shell`, `face`, `nose`, `mouth`, and ears. Treating them as unrelated parts makes dependent placement fragile, while physically welding them too early makes a later nose or ear correction expensive and destroys semantic editability.

Logical fusion provides the middle state:

```text
semantic parts
   ↓ FUSED relations
logical fusion group
   ↓ later finalization only
physical mesh fusion / weld / cleanup
```

No mesh bytes are changed by the logical-fusion runtime.

## Group derivation

`createLogicalFusion` consumes a valid `refas.attachment-semantics/v1` graph and follows only `FUSED` owner chains. Nested fused relations collapse to the same top root.

Example:

```text
head-shell     FREE
├─ face        FUSED
├─ nose        FUSED
├─ mouth       FUSED
├─ left-ear    FUSED
└─ right-ear   FUSED

nose + ears ── MULTI_ANCHOR → glasses
```

The logical group contains the head shell and fused body members. `glasses` remains outside the group because its multi-anchor relationship must survive changes rather than being welded into the face.

## Member invalidation

Changing any member invalidates the whole logical fusion group:

```text
edit nose
  ↓
invalidated logical group = head-shell + face + nose + mouth + ears
  ↓
rebuild logical body realization
```

This invalidation does not yet move `glasses`. Non-fused dependents are handled by the later attachment-propagation layer, which can recompute surface or multi-anchor constraints after the changed fused body is rebuilt.

The invalidation record explicitly states that reopening requires semantic pre-fusion state. A physically fused mesh must not become the default reconstruction source after a semantic member reopens.

## Physical fusion boundary

Logical fusion cannot perform boolean union, vertex welding, internal-face removal, or optimization. Those are controlled finalization operations under the canonical edit boundary and occur only after the semantic group is trustworthy enough to close.

The later physical-fusion stage must preserve a mapping from semantic members to the final fused realization and must retain an exact pre-fusion checkpoint for reopen.

## Public artifacts

- `refas.logical-fusion/v1`: deterministic groups derived from the attachment semantic graph.
- `refas.logical-fusion-invalidation/v1`: changed entities and the logical groups/members that must be rebuilt.

Both artifacts are digest-bound to the exact attachment semantic graph. Neither mutates geometry, propagates non-fused dependents, or authorizes closure.
