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

## Physical semantic identity graph

When the asset makes modular, articulated, mechanism, actuation, control, or runtime-binding claims, create `refas.physical-identity-graph/v1` with `createPhysicalIdentityGraph` before downstream physical contracts.

The graph gives stable semantic identity to these distinct construction concepts:

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

Do not use backend array order, exporter indices, node order, or runtime device indices as semantic identity. `physical-part` may aggregate into a `rigid-link`, but they remain separate identities. `attachment-interface` is a mount/socket identity and is never implicitly a `virtual-joint`.

Use typed identity relations instead of encoding these meanings in names:

- `CONTAINS` — module ownership of reusable construction identities;
- `EXPOSES` — a module exposes an attachment interface;
- `COMPATIBLE_WITH` — two attachment interfaces are explicitly compatible and must share at least one declared compatibility family;
- `BINDS_TO` — two attachment interfaces are currently bound;
- `AGGREGATES_INTO` — a physical part contributes to one rigid link;
- `CONNECTS` — a virtual joint identifies the two rigid links it connects, without yet declaring parent/child DOF semantics;
- `REALIZES` — a mechanism realizes one or more generalized joint identities;
- `MAPS` — a transmission names the semantic spaces it maps;
- `DRIVES` — an actuator drives a transmission, mechanism, or direct joint coordinate;
- `COMMANDS` — a controller commands an actuator;
- `BINDS_RUNTIME` — a runtime endpoint binds a semantic physical/control identity without becoming that identity.

`compatibilityFamilyIds` are canonical mount-family identities, not presentation tags and not an implicit pairwise compatibility relation. Sharing a family is a necessary precondition for an explicit `COMPATIBLE_WITH` edge, but family membership alone does not create that edge. When both bound interfaces declare compatibility families, `BINDS_TO` rejects disjoint families. A later mount/interface-standard contract may attach dimensions, clearance, load, power, or other semantics to the same stable family IDs without changing interface identity.

`BINDS_TO` must reference an existing relation from `refas.attachment-semantics/v1`. It does not redeclare `FUSED`, `RIGID_FOLLOW`, `ARTICULATED`, or other attachment modes. The physical identity graph binds the exact attachment-semantics digest and relation ID, and live binding proof must match the same `scopeId` and source SHA-256, preserving one attachment authority.

Canonical physical frames use meters and `rotation_quat_xyzw: [x,y,z,w]`. The runtime normalizes quaternion magnitude and sign so `q` and `-q` serialize identically. Semantic frames carry no scale, reject non-finite values, require an existing physical parent identity, and reject frame cycles. Mirroring/handedness remains an explicit derivative rather than negative runtime scale.

Module ownership also bounds transform ownership. An entity owned through `CONTAINS`, or an interface owned through `EXPOSES`, must resolve its frame ancestry back to that owning module without crossing another module boundary. A socket may therefore be parented to a local part/link/actuator inside the same module, but it may not silently reference a sibling or ancestor module frame. Nested child modules carry their own local subtree so an immutable child remains transform-local when composed into a larger assembly.

`refas.semantic-authority-set/v1` remains the authority system for graph identities and relations. Bind an authority set to this graph through `targetSchema: refas.physical-identity-graph/v1` and the exact `graphDigest`; do not add observed/inferred/engineered flags inside the identity graph itself.

This graph declares identity and relation structure only. It does not define mass/inertia, collision proxies, joint limits/DOFs, mechanism equations, transmission ratios/Jacobians, actuator limits, controller gains, or runtime signs/zeros. Those remain downstream physical contracts.

## Rigid-body dynamics

When an asset makes a dynamics or simulation claim, create `refas.rigid-body-dynamics/v1` with `createRigidBodyDynamics` using the current `refas.physical-identity-graph/v1` candidate.

Dynamics attach only to `rigid-link` identities. They do not attach directly to visible parts, joints, mechanisms, actuators, or backend body indices. Each link record binds:

- `mass.value_kg` — strictly positive kilograms when resolved;
- `centerOfMass.value_m` — link-local COM in meters when resolved;
- `inertia.tensor_kg_m2` — a symmetric positive-definite 3×3 inertia tensor about COM, expressed in the same link-local axes;
- `referenceFrameId` — exactly the bound `rigid-link` identity;
- one semantic-authority subject for each property.

The canonical inertia convention is deliberately unambiguous: the tensor is about the center of mass and expressed in the rigid-link frame. Backend-specific inertial frames or axis conventions must later normalize into this representation rather than changing canonical dynamics semantics.

Dynamics use a scoped identity projection rather than the whole P01 graph digest. The projection includes the bound rigid-link identities and frames, the physical-part identities/frames currently aggregated into those links, and the `AGGREGATES_INTO` membership. A change to those dynamics-relevant identities invalidates the binding. Adding or editing an unrelated controller, runtime endpoint, socket, or other graph identity does not invalidate otherwise unchanged mass/inertia state. Scope and source SHA-256 must still match the live identity graph.

A property that cannot be justified remains explicitly `null`. Do not insert `1 kg`, identity inertia, zero COM, geometry-derived estimates, or other convenient defaults merely to satisfy a simulator. `mass`, COM, and inertia may resolve independently.

Authority remains external to the dynamics value contract. `validateRigidBodyDynamicsAuthority` requires a `refas.semantic-authority-set/v1` bound to the exact `dynamicsDigest`:

- resolved values require `observed`, `inferred`, or `engineered` authority;
- unresolved `null` values require `unknown` authority;
- `forbidden` cannot authorize a positive dynamics construction value;
- authority-set scope, source SHA-256, target schema, target digest, and property subjects must match exactly.

The dynamics runtime rejects a stale dynamics-relevant identity projection, non-rigid-link subjects, duplicate link records, cross-link reference frames, non-finite values, non-positive mass, asymmetric or non-positive-definite inertia, rigid-body diagonal triangle-inequality violations, unsupported fields, and noncanonical serialization.

P02 does not define collision geometry, joint DOFs/limits, mechanism topology, transmission equations, actuator limits, controller gains, or runtime calibration. Those remain separate downstream contracts.

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
