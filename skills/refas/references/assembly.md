# Immutable child assembly

## Closure boundary

Once a child asset passes its own gates, treat its GLB bytes, local coordinate frame, and digest as immutable inputs to parent assembly. Preserve the closed child rather than regenerating a look-alike inside the parent builder.

Mesh integrity alone cannot close a child. Before making a visually material
child immutable, require current identity-bearing construction coverage at the
child scope and a passing whole-shape dependency. A primitive blockout, a child
closed before its parent silhouette is trustworthy, or a child whose visible
cutaways/sections remain generic stays mutable and must not become an immutable
assembly authority.

Use `appendPartsToClosedGlb` when the parent can be represented by appending nodes, meshes, materials, and binary payload. The implementation preserves the child binary payload as an exact prefix and records both the source GLB SHA-256 and embedded BIN SHA-256 in a composition report.

## Registration record

Every child placement must record:

- child asset path and digest;
- child-local reference frame;
- parent target frame;
- translation, rotation, and scale;
- evidence for the registration;
- contact or attachment relation;
- expected occlusion order.

Keep registration in data, not hidden constants.

Create an assembly contract before placement. It records observed polygons, root anchors, depth bands, relations, support zones, bounded hidden-support hypotheses, closed-child digests, and evidence attestation. Reject cyclic front-to-back claims.

## Parent-child orientation chain

Do not repair a terminal part by rotating it independently when the source-facing evidence implies upstream rotation. A hand, foot, tool face, wheel plane, wing tip, or other terminal surface can have the correct endpoint and primary axis while still carrying the wrong roll/twist.

Represent the realized relation as parent-local rigid frames:

`world(child) = world(parent) × parentToJoint × jointDOF × jointToChildRest`.

Use full right-handed frames, not only a direction vector. `resolveOrientedFrame` requires a primary axis plus a facing/lateral cue or an explicit parent-inheritance policy. `relativeRigidFrame` and `propagateOrientationChain` preserve the declared parent-relative frame through descendants.

When a terminal-facing mismatch is observed, reopen the smallest responsible orientation chain. Distribute correction only across owners/DOFs that can physically or semantically carry it; do not hide a forearm/wrist twist error inside the palm mesh. After correction, re-check attachment continuity, support/contact, collision/penetration, joint or articulation bounds when present, descendant transforms, and actual parent renders.

A chain solver may propose a pose candidate but cannot authorize closure. Visual orientation evidence and the existing structural gates remain authoritative.

## Assembly gates

Review the actual parent render for:

- attachment location and orientation;
- support and contact;
- gaps, penetration, and floating parts;
- occlusion and depth order;
- seam and tangent continuity;
- grazing-angle continuity;
- object-ID separation;
- unchanged closed-child digest and appearance.

Run `validateRealizedAssembly` against projected part polygons, depths, root support state, mesh analysis, penetration counts, and composition reports. Passing code or a low registration residual is not assembly evidence; an actual parent render is still required.

For a modular or disassembly-ready claim, the observation-side validator is not
sufficient. Build `refas.realized-assembly-proof/v1` with
`createRealizedAssemblyProof` from the actual GLB bytes. Each detachable module
must have a `refasModuleRoot` node, a stored parent-relative transform, complete
mesh ancestry beneath that root, and a distinct object-ID part.

Contact surfaces are semantic local frames serialized in node extras. The proof
transforms both frames through the realized GLB hierarchy and derives signed
clearance, lateral offset, normal opposition, penetration depth, and support.
Intentional clearance passes only through an explicit bounded
`clearanceRange`; a caller-provided `supported` boolean or penetration count is
not accepted by this proof. Preserve the older assembly validation for
observation and migration, but never use it alone to close a modular claim.

Render both assembled and exploded states. The assembled side, top, and grazing
views must show coherent contact; the exploded oblique/side views must expose
the same three-dimensional parent→child order without changing module-local
geometry. Keep closed-child prefix and digest evidence current.

## Reopening a child

Parent assembly may reveal a true upstream defect. Reopen the child only when a typed finding is owned by the child's capability and is supported by actual render evidence. Preserve the old closed child and create a new candidate; never overwrite it.

If the mismatch can be fixed by parent registration, keep the child closed.
