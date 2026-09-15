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

The dynamics runtime rejects a stale dynamics-relevant identity projection, non-rigid-link subjects, duplicate link records, cross-link reference frames, non-finite values, non-positive mass, asymmetric or non-positive-definite inertia, rigid-body principal-moment triangle-inequality violations, unsupported fields, and noncanonical serialization.

P02 does not define collision geometry, joint DOFs/limits, mechanism topology, transmission equations, actuator limits, controller gains, or runtime calibration. Those remain separate downstream contracts.

## Collision semantics

When an asset makes a collision or simulation claim, create `refas.collision-model/v1` with `createCollisionModel` using the current physical identity graph.

Collision attaches only to `rigid-link` identities. A collider has its own stable collision identity and a link-local frame; it is not the visible mesh, physical part, backend body index, or renderer node identity. Canonical collider frames use meters plus normalized canonical `rotation_quat_xyzw` and carry no scale.

Supported canonical proxy kinds are:

- `BOX` — positive `size_m`;
- `SPHERE` — positive `radius_m`;
- `CAPSULE` — positive radius plus non-negative axial `segmentLength_m`;
- `CYLINDER` — positive radius and height;
- `CONVEX_HULL` — a canonical finite set of at least four unique non-coplanar link-local vertices;
- `MESH` — a stable collision mesh identity plus canonical geometry digest.

Render geometry is never collision geometry by implication. A mesh collider must declare exactly one reuse mode:

- `COLLISION_ONLY` — the collision mesh is independent and `visualGeometryRef` must be `null`;
- `DECLARED_VISUAL_REUSE` — the contract explicitly names a visual geometry identity and the visual/collision canonical geometry digests must match exactly.

A `meshId` identifies collision geometry bytes, not a reuse relationship. Reusing the same `meshId` is valid only when its `geometryDigest` is identical; different collider use-sites may independently choose `COLLISION_ONLY` or `DECLARED_VISUAL_REUSE` for those same bytes.

Declared visual reuse is not verified by a caller-supplied list of matching IDs/digests. Build a canonical collision visual-geometry manifest with `createCollisionVisualGeometryManifest`, binding `scopeId`, source SHA-256, the exact current visual artifact digest, canonical visual geometry IDs/digests, and the manifest digest. Then call `validateCollisionVisualReuseBindings` with an `expectedVisualArtifactDigest` obtained independently from current artifact authority. Never copy the manifest's own `visualArtifactDigest` into that argument without verifying the current artifact first. Matching display names, file paths, node order, or backend mesh indices never count as reuse proof.

Collision filtering is semantic rather than backend-indexed. Declare stable collision group IDs on the contract. Each collider declares one or more `groupIds` plus explicit `maskGroupIds`; exporters may assign backend bit fields later but those bits are not canonical identity. Canonical pair filtering is symmetric: collider A may collide with collider B only when `A.maskGroupIds` intersects `B.groupIds` **and** `B.maskGroupIds` intersects `A.groupIds`. Use `collisionPairAllowed` as the canonical predicate rather than reinterpreting masks per backend. A collider never collides with itself. For two distinct colliders on the same rigid link, `selfCollisionPolicy: DISABLED` rejects the pair before mask evaluation; `ENABLED` permits the normal bilateral mask test. P03 does not infer articulation adjacency or joint-specific pair exclusions across different links; P04 and later realization logic may add those semantics without changing P03 collider identity.

Collision uses a scoped P01 identity projection containing only the bound rigid-link identities and frames. An unrelated controller, runtime endpoint, socket, or other identity edit does not stale collision state. A bound link identity/frame change does. Collision proxy geometry and filtering changes are already covered by `collisionDigest` itself.

Authority remains external. Each collider and each link filtering policy has a deterministic semantic-authority subject. `validateCollisionModelAuthority` requires the exact `refas.semantic-authority-set/v1` for the current `collisionDigest`; positive collision construction requires `observed`, `inferred`, or `engineered` authority. Do not introduce a collision-specific provenance enum.

The collision runtime fails closed on non-rigid-link subjects, stale scoped identity binding, duplicate collider IDs, undeclared filter groups, non-finite or non-positive primitive dimensions, degenerate hulls, unsupported fields, noncanonical frames, collision mesh-ID/digest disagreement, implicit visual reuse, unbound visual-artifact manifests, or stale declared visual geometry digests.

P03 does not define friction, restitution, contact materials, articulation topology, joint-specific collision-disable pairs, mechanism/transmission behavior, actuator capability, controller tuning, backend bit assignments, or runtime calibration.

## Articulation graph

When an asset makes an articulated-ready claim across more than one rigid body, compose the existing typed joint contracts with `createArticulationGraph` into `refas.articulation-graph/v1`. Do not replace or widen `refas.articulated-joint/v1`; the typed joint remains the owner of its revolute axis, limits, zero configuration, and legacy attachment relation.

P04 gives direction and topology to the otherwise unordered physical identities:

```text
root rigid link
  -> virtual joint
  -> child rigid link
```

The P01 `CONNECTS` relation remains an unordered identity statement over exactly two rigid links. P04 names one as `parentLinkId` and one as `childLinkId` without mutating P01. Every participating virtual joint must have exactly one `CONNECTS` relation over the same pair, and every graph joint references one exact typed joint ID plus `jointDigest`.

Do not assume the legacy attachment entity frame and the canonical rigid-link frame are the same. Every participating link must declare one explicit `attachmentFrameInLink` mapping from its `refas.attachment-semantics/v1` entity frame into the rigid-link frame. The existing typed joint's owner/subject frames are composed through those mappings and persisted as canonical graph-level `parentJointFrame` / `childJointFrame` transforms in meters plus normalized `rotation_quat_xyzw`.

The P01 `virtual-joint` identity must itself carry a canonical physical frame parented by the declared parent rigid link. That frame must match the graph's derived parent joint frame. This creates one stable joint identity across P01 and P04 without collapsing the legacy attachment entity, rigid link, attachment interface, or backend joint index into that identity.

Every graph joint must also declare an explicit `referenceAngle`. This is the reconstructed source/reference configuration, not controller state and not a runtime calibration value. It must lie inside the existing typed joint limits; do not silently default it to zero. P04 derives and persists `referenceChildFrameInParent` as:

`parentJointFrame × revolute(referenceAngle) × inverse(childJointFrame)`.

That derived transform must equal the live P01 resolved parent-link → child-link relative pose. A reference image captured away from the typed joint's zero configuration therefore remains representable without redefining the joint's zero convention. A disagreement means the identity frames, link/attachment mapping, typed joint frames, or reference angle are stale and the articulation candidate fails closed.

Initial P04 topology is `TREE` only:

- exactly one `rootLinkId`;
- root has no parent joint;
- every other participating rigid link has exactly one parent joint;
- the graph is connected and acyclic;
- closed chains are not represented by pretending a tree edge is sufficient; P05 mechanism semantics owns those structures.

Articulation invalidation is scoped. The graph binds participating rigid-link and virtual-joint identities/frames, their exact `CONNECTS` relations, and each directed joint edge's **resolved parent→child relative pose**. Resolving the relative pose walks the live P01 frame ancestry, so changing an intermediate local part/link/mechanism/actuator frame cannot leave a stale articulation graph valid. A common upstream frame motion that preserves the participating links' relative pose does not create unnecessary invalidation. Controller, runtime endpoint, unrelated socket/interface, or other unrelated P01 edits likewise do not stale the articulation graph. Typed joint digests and attachment-semantics digest are separately exact-bound.

Authority remains `refas.semantic-authority-set/v1`. Link-to-attachment frame mappings and directed topology each receive deterministic authority subjects, and `validateArticulationGraphAuthority` requires `observed`, `inferred`, or `engineered` authority for positive construction. Do not introduce articulation-specific provenance states.

The articulation graph fails closed on missing/out-of-limit reference angles, reference-pose disagreement, transitive frame-ancestor drift, stale joint digests, owner/subject-to-link mismatch, missing explicit link mappings, joint-frame disagreement, duplicate joint use, multi-parent children, disconnected topology, cycles, invalid roots, `CONNECTS` pair drift, unsupported typed joint schemas, backend-index identity, or noncanonical serialization.

P04 does not define mechanisms, transmission ratios/Jacobians, actuator capability, controller tuning, runtime indices, backend export, or additional joint types. Those remain later slices.

## Mechanism graph

When articulated coordinates are physically realized by gears, belts, linkages, tendons, coupled structures, or another mechanism, create `refas.mechanism-graph/v1` with `createMechanismGraph` from the current physical identity graph and articulation graph.

A mechanism is not a virtual joint and is not a transmission. Preserve the separation:

```text
virtual joint = generalized articulation coordinate
mechanism     = physical structure that realizes coordinate(s)
transmission  = q / dq / effort mapping between semantic spaces
```

P05 supports the domain-neutral mechanism kinds `DIRECT`, `GEAR`, `BELT`, `LINKAGE`, `PARALLEL_LINKAGE`, `TENDON`, `DIFFERENTIAL`, `COUPLED`, and `CUSTOM`. These labels classify physical structure only. They do not authorize a ratio, Jacobian, actuator mapping, controller gain, runtime index, or backend-specific constraint.

Every mechanism record binds one existing P01 `mechanism` identity and one or more exact P01 `REALIZES` relations. The union of those relation targets must equal the record's `realizedJointIds`, and every target remains a distinct P01 `virtual-joint`. P05 separately binds the corresponding current P04 joint records through a scoped articulation projection; it does not copy or redefine P04 parent/child, typed-joint, reference-angle, or joint-frame authority.

Mechanism members are stable mechanism-local records that point to existing P01 `physical-part` or `rigid-link` identities. Member IDs and structural edge IDs are semantic within their mechanism and never derive from array position or backend index. Supported structural member roles are `CONTACT_ELEMENT`, `LINK_ELEMENT`, `CARRIER`, `GUIDE`, `TENSION_ELEMENT`, `SUPPORT`, and `CUSTOM`. Supported structural edges are `FIXED_TO`, `MESHES_WITH`, `BELT_CONTACT`, `PIN_CONNECTED`, `SLIDING_CONTACT`, `ROUTES_OVER`, `COUPLED_WITH`, and `CUSTOM`.

Rigidly localized physical-part members retain exactly one P01 `AGGREGATES_INTO` rigid-link membership. The scoped P01 mechanism projection binds that aggregation relation, the member's effective rigid-link identity, and the member's **resolved pose relative to the mechanism frame**. Rigid-link members use themselves as their effective rigid link. `CONTACT_ELEMENT` and `LINK_ELEMENT` roles are direct motion-bearing participants and therefore must resolve onto a rigid link incident to at least one realized P04 joint. Every realized joint must still have at least one physically incident mechanism member.

`TENSION_ELEMENT` is intentionally different. A belt/tendon span is not one rigid body, so a physical-part `TENSION_ELEMENT` may remain unaggregated; its projected `effectiveRigidLinkId` is then `null`. It remains mechanism structure only through explicit structural edges. `BELT_CONTACT` must pair tension structure with a rigidly localized `CONTACT_ELEMENT`, and `ROUTES_OVER` must pair tension structure with a `GUIDE` or `CONTACT_ELEMENT`. Auxiliary `CARRIER`, `GUIDE`, `SUPPORT`, and `CUSTOM` members may live outside the realized-joint incident-link set when their role is justified by the connected structural topology; they do not by themselves satisfy realized-joint physical-incidence coverage. This preserves flexible mechanism structure without pretending it is a rigid body.

The scoped P04 binding is also checked against the current P01 state rather than trusting a self-consistent but stale articulation object. For realized joints only, P05 rebuilds the participating rigid-link / virtual-joint projection and resolved parent→child relative pose from the live P01 graph, then requires the P04 `referenceChildFrameInParent` to agree. This catches stale articulation ancestry without binding unrelated P04 branches or unrelated P01 controller/runtime/interface edits.

Structural topology must be connected whenever a mechanism has more than one member. Kind-specific minimum structure is fail-closed: a `GEAR` requires `MESHES_WITH` between two `CONTACT_ELEMENT` members; `BELT` requires a `TENSION_ELEMENT` and `BELT_CONTACT` between a `TENSION_ELEMENT` and `CONTACT_ELEMENT`; linkage kinds require at least one `LINK_ELEMENT`, and `PIN_CONNECTED` accepts only `LINK_ELEMENT`/`CARRIER` endpoints with at least one link element; `TENDON` requires a `TENSION_ELEMENT`, and `ROUTES_OVER` must pair tension structure with a `GUIDE` or `CONTACT_ELEMENT`; `SLIDING_CONTACT` requires a `GUIDE` plus a `LINK_ELEMENT` or `CONTACT_ELEMENT`; differential/coupled kinds require `COUPLED_WITH`.

A geared mechanism deliberately does **not** store gear ratio, tooth-count-derived coordinate mapping, velocity mapping, effort mapping, Jacobian, motor sign, or actuator index. Such values belong to P06 transmission semantics even when they can be inferred from the physical mechanism. Reject convenience fields that collapse these layers.

Mechanism invalidation is scoped twice: P01 binding covers the exact mechanism identity, exact `REALIZES` relations, realized virtual-joint identities, member identities, physical-part aggregation membership when present, effective rigid-link membership (or explicit absence for flexible tension members), and resolved member poses; P04 binding covers only the realized articulation joint records plus their live scoped P01 articulation projection and member-to-joint incidence. Unrelated controller/runtime/interface edits do not stale an unchanged mechanism, and unrelated articulation branches do not invalidate it.

Authority remains `refas.semantic-authority-set/v1`. Each mechanism topology and each structural edge receives a deterministic authority subject. `validateMechanismGraphAuthority` requires `observed`, `inferred`, or `engineered` authority for positive construction. Do not add mechanism-specific provenance states.

The mechanism graph fails closed on mechanism/joint identity collapse, stale `REALIZES` targets, absent realized P04 joints, stale realized-joint reference poses, invalid direct-incidence members, uncovered realized joints, missing required rigid-body aggregation, ambiguous aggregation, disconnected topology, edge/role incompatibility, invalid kind-specific structure, backend-index identity, transmission leakage, stale scoped bindings, unsupported fields, or noncanonical serialization.

P05 does not define q/dq/effort transforms, gear ratios, Jacobians, actuator capability, controller tuning, runtime bindings, backend export semantics, or dynamic contact simulation. Those remain later slices.

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