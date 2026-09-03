# Rigid follow and surface offset propagation

RefAs uses two simple one-owner propagation primitives before introducing graph-wide attachment solving.

## Rigid follow

`RIGID_FOLLOW` stores the exact rigid frame of the subject relative to its owner at a trusted baseline:

```text
relative = inverse(baseline owner) × baseline subject
new subject = current owner × relative
```

This is appropriate for parts such as a cuff or fixed rivet cluster that must follow an owner without changing their owner-relative pose.

## Surface offset

`SURFACE_OFFSET` consumes a current `refas.surface-anchor-set/v1` frame. The owner-side target uses the rebound semantic surface position, tangent, bitangent, normal, and signed offset. A subject-local contact frame is then inverted so the contact frame, rather than the subject origin, lands on the owner target:

```text
world target anchor = owner world frame × owner-local surface anchor frame
subject world frame = world target anchor × inverse(subject-local anchor frame)
```

This lets a badge, plate, or other one-owner dependent remain aligned after owner curvature or tessellation changes.

## One-step scope

This layer intentionally resolves only one declared owner to one subject at a time. Every required owner world frame must be supplied explicitly. If a cuff owns a rivet and the forearm owns the cuff, graph ordering and transitive propagation are handled by the later attachment-propagation graph rather than hidden inside this primitive.

`MULTI_ANCHOR` is also rejected here. Approximating glasses as a one-owner follow would erase the simultaneous nose/ear constraints; the dedicated multi-anchor solver handles that relation later.

## Mutation boundary

Propagation emits deterministic target rigid frames. It does not directly edit mesh bytes and does not authorize closure. A caller may realize a target through the canonical pose/assembly path after the required attachment and structural validations are available.

## Public artifacts

- `refas.attachment-follow-state/v1`: digest-bound rigid-relative or surface-offset binding state.
- `refas.attachment-follow-report/v1`: exact owner world frames and deterministic subject target frames used for one propagation evaluation.

Both artifacts are bound to canonical attachment semantics; surface-offset state additionally binds the exact surface-anchor set.
