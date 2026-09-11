# Surface anchor frames

Surface-relative anchors keep dependent parts attached to semantic owner surfaces instead of freezing them at world-space coordinates.

A valid anchor is located by:

- an attachment relation and declared owner;
- a semantic surface patch;
- a triangle inside that patch;
- barycentric coordinates on that triangle;
- an owner-local tangent hint;
- a signed normal offset;
- anchor-local rebind distance and normal-deviation bounds.

The realized frame contains owner-local position, normal, tangent, bitangent, and offset position. World XYZ alone is not a canonical attachment locator.

## Why this is needed

For a mannequin wearing glasses, the bridge and temple contacts should survive later edits to the nose and ears. Storing the glasses at one world transform would leave them floating when the face changes. Instead, the glasses relation owns multiple semantic surface anchors:

```text
nose bridge surface ───────┐
left ear contact surface ──┼─ MULTI_ANCHOR → glasses
right ear contact surface ─┘
```

This stage only maintains the owner-side frames. It does not solve the glasses transform yet; the later multi-anchor solver consumes these frames.

## Retessellation

A triangle index is not treated as permanent truth. When owner geometry changes, `rebindSurfaceAnchorSet` searches only inside the same semantic patch and chooses the nearest orientation-compatible triangle to the previous owner-local surface position.

A rebind is accepted only when:

1. the semantic patch still exists;
2. the surface normal remains within the anchor's `maxNormalDeviationRadians`;
3. the nearest point is within that anchor's `maxRebindDistance`.

These bounds are local policy, not one global scene tolerance. If any bound fails, rebind fails closed rather than silently snapping to an unrelated surface.

## Frame orientation

The tangent hint is projected onto the current surface plane. Together with the surface normal it produces a stable tangent/bitangent frame. This prevents a dependent from matching position while arbitrarily rotating after retessellation.

## Canonical artifacts

- `refas.surface-anchor-set/v1` stores evaluated owner-local anchor frames bound to exact attachment semantics and owner surface descriptors.
- `refas.surface-anchor-rebind/v1` records unchanged/rebound anchors and binds the previous and next anchor-set digests.

Neither artifact moves dependent geometry or authorizes closure. Surface offset propagation and multi-anchor fitting are later stages.
