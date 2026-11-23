# Realized contact and support validation

RefAs validates final assembly geometry against the actual realized GLB after attachment propagation and any physical fusion bake. Semantic attachment state remains the construction authority, but it cannot by itself prove that the realized mesh is physically coherent.

## Authority boundary

The realized-contact plan binds one exact GLB SHA-256 plus the current attachment semantics. Any shape, pose, propagation, physical-fusion, or byte-level asset change invalidates the graph and report.

AABB overlap is only broad-phase candidate discovery. It never authorizes contact. Passing contact, support, and clearance expectations comes from triangle-surface narrow-phase measurements on the final GLB.

## Narrow-phase evidence

For each candidate or explicitly required pair, the runtime records:

- minimum triangle-surface distance;
- sampled near-surface contact-area estimate;
- opposing surface-normal evidence at the nearest triangles;
- containment-based penetration-depth estimate;
- non-coplanar crossing-intersection evidence;
- the broad-phase bounds gap for diagnostics only.

The graph classifies the realized pair as `CONTACT`, `CLEARANCE`, or `PENETRATION`. Penetration is never silently promoted to successful contact.

## Explicit expectations

A plan may declare `CONTACT`, `SUPPORT`, `CLEARANCE`, `FORBID`, or `IGNORE` expectations. Each relation carries its own maximum gap, clearance range, maximum tolerated penetration, and minimum contact area. There is no asset-wide contact distance that can close every relation.

`SUPPORT` is directional: the subject is supported by the owner. Only passing explicit support expectations create support-graph edges.

## Support-root reachability

Being part of a connected geometric cluster is not enough. A support-required entity must reach one of the explicitly declared support roots through passing realized support edges.

```text
body -> leg -> base
```

passes only when both realized support edges pass and `base` is a declared support root. A face/eye cluster that is internally connected but separated from the head/body remains unsupported.

`FREE` means that an entity has no attachment owner. It does not mean that the entity is automatically exempt from physical support requirements. Support exemptions or roots must be explicit in the realized-contact plan.

## Physical fusion reconciliation

After physical fusion, several semantic members may correspond to one physical GLB node. The plan binds each such collapse to the exact physical-fusion report and provenance digests. If two expected semantic members resolve to the same verified fused physical entity, their internal contact is recorded as `SATISFIED_BY_FUSION` rather than measured again as separate meshes.

Non-fused dependents remain independent physical nodes and are measured normally against the fused output.

## Unexpected contact and penetration

The graph measures nearby realized pairs even when no semantic expectation names them. Unexpected contact can be ignored, reported, or blocked according to the explicit plan policy. Unexpected penetration always blocks.

A required or forbidden pair is evaluated even when it lies outside the broad-phase margin, so a missing contact cannot disappear merely because the bounds are far apart.

## Recovery

The realized graph is evidence, not an editable source. A failure routes upstream:

- stale or incorrect propagation -> reopen attachment propagation;
- surface-follow failure -> reopen the affected surface anchor or owner geometry;
- broken support geometry -> reopen shape/assembly construction;
- incorrect physical fusion -> discard the fused output and reopen its pre-fusion semantic checkpoint.

Do not patch the realized GLB to make the contact report pass.

## Closure

A realized-contact report may return `PASS` only when all required expectations pass, every support-required physical entity reaches an explicit support root, no blocking unexpected contact remains, and no blocking penetration remains. The report is still validation evidence and does not by itself authorize whole-asset certification.
