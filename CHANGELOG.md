# Changelog

All notable RefAs changes are documented here. RefAs follows semantic versioning.

## 1.0.1 — 2026-09-06

### Orientation correctness

- Added `refas.orientation-evidence-set/v1` so projected primary direction, camera-relative facing, visible-plane cues, near-side evidence and generic twist remain explicit without inventing Euler angles.
- Added full right-handed local-frame resolution that fails closed when a primary axis leaves roll underdetermined, plus explicit parent-frame inheritance and deterministic parent-child frame propagation.
- Added `refas.orientation-discrepancy/v1` so equal endpoints or primary axes cannot hide a wrong terminal facing, lateral orientation or twist.
- Added assembly-owned `refas.orientation-pose-fit/v1` responsible-chain fitting so terminal orientation findings can reopen a bounded parent→child chain rather than rotating only the terminal part.
- Expanded bounded chain search with coordinated and mixed-sign parent/child corrections while preserving parent-local transforms, immutable mesh/accessor bytes and structural eligibility as a hard barrier.

### Evidence and adversarial hardening

- Orientation fitting now derives `orientation-loss` only from a validated discrepancy artifact bound to the exact candidate GLB, source digest and orientation-evidence digest; unbound caller scores cannot rank candidates.
- Revalidation recomputes parameter-to-edit bindings, discrepancy provenance, derived loss, eligibility, selected trial and improvement/status so freshly re-signed report tampering fails closed.
- Full-frame residuals remain bounded when primary axes differ substantially instead of crashing on an undefined twist projection.
- Fixed node-local pose binding parsing so `assembly.node.<id>.rotation.<axis>` cannot greedily absorb `.rotation` into a dotted node identifier.
- Added general adversarial regressions for palm, foot, tool and keyed-gear facing, mixed-sign parent-child correction, wrong-candidate discrepancy evidence and re-signed selection/score tampering.

### Core and compatibility boundary

- Kept general Core orientation vocabulary asset-class neutral; anatomy-specific pronation/supination and robotics-specific actuator, collider, mass/inertia, MJCF/URDF and simulation semantics are not introduced by this patch.
- New project state and whole-object certificates identify runtime 1.0.1 while the public v1 schemas continue accepting 1.0.0 artifacts for patch-release compatibility.
- Release audit now requires the orientation runtime, schemas and regressions to remain present in the distributable product boundary.

### Known limits

RefAs 1.0.1 can preserve and fit full orientation only when evidence or an explicit parent-frame relation constrains it. Genuinely ambiguous single-view roll remains ambiguous. Engineering authority for unseen mechanisms and calibrated simulation-ready physical truth remain outside this patch release. See `docs/known-limitations.md`.

## 1.0.0 — 2026-09-05

### Reconstruction and evidence

- Established the semantic eleven-capability reconstruction and ownership graph.
- Added whole-to-feature hierarchy, source-authoritative observation, explicit ambiguity, and competing spatial-hypothesis contracts.
- Added attested reference registration, projection-aware reconstruction, shared-boundary surface topology, coherent hard-surface geometry, and immutable child composition.
- Added deterministic watertight mesh construction, embedded GLB inspection, actual multiview rendering, registered source/render comparison, and deterministic discrepancy evidence.
- Added evidence-bound joint geometry parameter fitting plus owner-local camera, pose, appearance, and lighting fitting while keeping metrics limited to diagnosis and candidate ranking rather than gate authority.
- Added deterministic independent Cook–Torrance PBR evidence and an external-renderer report boundary for Blender, Three.js, Filament, glTF Sample Viewer, VTK, and equivalent backends.
- Removed a global triangle-quality ceiling in favor of bounded tile rasterization, memory preflight, staged publication, explicit timeouts, and optional project-local caps.

### Recovery and structural integrity

- Added content-addressed checkpoints, exact-byte restore, bounded edit decisions, typed finding ownership, transitive invalidation, safe resume routing, and repository audit.
- Added attachment semantics, logical fusion, surface anchors, rigid/surface follow, multi-anchor solving, bounded articulation, supported clearance, graph-wide propagation, realized contact/support evidence, and controlled physical-fusion provenance.

### Certification authority

- Added sealed candidate provenance transactions that bind one exact candidate, checkpoint, evidence DAG, dependencies, and declared obligations by content digest.
- Added claim-driven certification policies with explicit role/schema obligations and reproducible per-claim authorization decisions.
- Bound whole-object certificates to the exact candidate transaction, policy, claim decision, visual review, registered comparison, and independent PBR evidence required by the active claim set.
- Added adversarial hardening against candidate/evidence substitution, stale checkpoint replay, forged decisions, cross-claim evidence contamination, and freshly re-signed policies that weaken the mandatory whole-object authority floor.

### Reproducible examples and distribution

- Added repository dogfoods for end-to-end reconstruction, joint parameter fitting, independent PBR materials, hard-surface topology, modular assembly, articulated geometry, and benchmark coverage.
- Added a dependency-free `demo/` page that explains the current release boundary and routes to reproducible examples rather than treating opaque screenshots as proof.
- Kept the distributable runtime singular under `skills/refas/` with public JSON Schemas under `schemas/` and Node.js 20+ support.

### Known limits

RefAs 1.0 does not claim fully resolved terminal 3D orientation from ambiguous single views, unseen manufacturer-internal mechanisms, or calibrated simulation-ready mass/collider/actuator truth without additional evidence. See `docs/known-limitations.md`.

This release intentionally contains no development-iteration identity in public schemas, runtime APIs, or deployable skill instructions.
