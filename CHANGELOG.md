# Changelog

All notable RefAs changes are documented here. RefAs follows semantic versioning.

## 1.1.0 — 2026-09-17

### Native physical semantics

- Added stable semantic identities for assembly modules, attachment interfaces, physical parts, rigid links, virtual joints, mechanisms, transmissions, actuators, controllers, and runtime endpoints without collapsing identity into backend order or indices.
- Added assembly-owned rigid-body dynamics, collision semantics, articulation graphs, mechanism graphs, explicit q/dq/effort transmission mappings, actuator capabilities, controller profiles, and optional runtime bindings.
- Preserved RefAs truth separation: physical construction may be `observed`, `inferred`, `engineered`, `unknown`, or `forbidden`; unobserved values are not fabricated and engineered values do not become source facts.
- Added digest-bound physical asset bundles so reusable child modules and exact physical component closures can be composed without rewriting their semantic identity.

### Representation closure and readiness claims

- Added representation-capacity preflight, one-way export adapters, backend-independent normalization, and cross-representation validation over canonical physical semantics.
- Added semantic outcomes `EQUIVALENT`, `LOSSY`, `DRIFT`, `UNRESOLVED`, and `INVALID`, with quaternion sign/order, unit conversion, and equivalent frame conventions normalized before comparison.
- Added exact field-scoped divergence authorization. A backend-specific override may become `DECLARED_DIVERGENCE` only when the current P14 drift and exact engineered authority validate live; canonical construction state remains unchanged.
- Added scoped `articulated-ready`, `simulation-ready`, `control-ready`, and `runtime-ready` evidence. Physical readiness uses typed live P10–P15 preflight before the generic certification engine and cannot be authorized through the public generic path alone.
- Kept higher-level control/runtime edits downstream-scoped so they do not retroactively invalidate unrelated lower physical readiness or visual reconstruction truth.

### Integrated closure and hardening

- Added the P17 integrated physical fixture: a coupled parallel 2-DOF assembly composed from reusable modules with fixed interfaces, virtual joints, dynamics, collision proxies, a nonlinear transmission, actuation, control, and runtime binding.
- Proved independent backend projections normalize without false drift for quaternion sign/component order, translation units, and equivalent Euler convention/order.
- Proved the end-to-end deliberate-drift path `P14 DRIFT → live P15 DECLARED_DIVERGENCE → P16 runtime-ready → certification`, including stale/substituted authority rejection and deterministic closure evidence.
- Included the separately hardened runtime calibration/binding path so runtime configuration remains deployment state rather than semantic identity.

### Compatibility and release boundary

- Advanced package, runtime, new project state, and new whole-object certificate identity to 1.1.0 while public `.../v1` contract namespaces remain stable.
- Public v1 project-state and certificate schemas continue accepting existing 1.0.0–1.0.4 artifacts; no in-place migration is required merely because the package minor version advances.
- Strengthened repository and release audits so the physical runtime, public schemas, routed physical contract references, and P17 integration regression are required release evidence and required npm-package contents where applicable.
- RefAs 1.1.0 can express and certify evidence-backed physical readiness; it does not manufacture observed manufacturer truth or calibrated real-world mass, inertia, collision, actuator, controller, or runtime values when supporting evidence is absent.

## 1.0.4 — 2026-09-15

### Host integration facade

- Added stable `refas.host-session/v1` identity/status projection without creating a second reconstruction state machine.
- Added durable monotonic `refas.host-event/v1` replay with exact artifact references and parent-owned worker lifecycle events.
- Added `refas.host-operation/v1` pause/resume/cancel semantics with one mutating project owner, safe restart recovery, and existing bounded-edit rollback authority for cancellation.
- Added digest-bound `refas.host-review-bundle/v1` presentation envelopes over exact checkpoint/source/candidate/review evidence without duplicating visual-review authority.
- Added `refas.artifact-handoff/v1` for exact current GLB transfer identity bound to checkpoint, candidate transaction, and existing certification state.
- Added `refas.worker-request/v1` / `refas.worker-response/v1` child-process framing with one-object stdout protocol, diagnostics-only stderr, parent verification of output bytes, and distinct pause/cancel/timeout/failure behavior.

### Host hardening and distribution

- Added `references/host-integration.md` as a conditional control-plane leaf; ordinary reconstruction and certification do not depend on host integration.
- Added the `refas-host` companion CLI for host open/status, durable event replay/JSONL polling, review bundles, artifact handoff/currentness, and worker wire validation while keeping the reconstruction-oriented `refas` CLI unchanged.
- Hardened host-session initialization so a pristine zero-sequence state left by a process loss repairs exactly one `session-opened` event on reopen without rewriting existing history.
- Advanced package/runtime/project-state/certificate compatibility to 1.0.4 while retaining the existing public v1 contract namespaces.
- Release publication remains a separate protected boundary: this release-hardening change does not itself create an npm publication, Git tag, or GitHub Release.

## 1.0.3 — 2026-09-11

- Added `references/GRAPH.json`, a machine-readable semantic instruction DAG covering all installed-skill reference leaves, owners, prerequisites, conditional dependencies, authority, closure effects, finding ownership, and real-source certification prerequisites.
- Added an installed-skill semantic graph verifier with isolated-copy regression, DAG/owner validation, exact runtime finding-owner alignment, real-source certification-floor checks, and rejection of ambiguous bare sibling Markdown routes.
- Split new camera findings into `camera-hypothesis-mismatch` owned by `spatial-hypotheses` and `render-camera-integrity` owned by `rendering`; retained `camera-mismatch` only as deprecated runtime compatibility.
- Made `refas.certification-relational-evidence/v1` an explicit mandatory real-source final-certification authority floor in the agent instruction path.
- Preserved the `skills/refas/` installation boundary: semantic graph, contracts, verifier, scripts, assets, and Python dependency manifest remain self-contained.

## 1.0.2 — 2026-09-10

### Relational structure and inference authority

- Added `refas.relational-structure/v1` for domain-neutral distance ratios, alignments, ordering, plane chains, volume ratios, explicit dependencies, and whole-system versus local importance.
- Added `refas.semantic-authority-set/v1` with `observed`, `inferred`, `engineered`, `unknown`, and `forbidden` authority classes. `unknown` and unobserved no longer imply forbidden; inferred or engineered construction remains distinct from source truth.
- Added exact authority coverage validation so whole-system relations cannot silently lose their semantic basis or be rebound to another relation graph.
- Added `refas.whole-system-relational-barrier/v1` before lower-scope geometry hardening. Macro/identity relations require current passing evidence and positive construction authority; local detail and numeric visual scores cannot substitute.

### Relation-aware fitting

- Added `refas.relational-discrepancy/v1`, bound to one exact candidate SHA-256 and one exact embedded relational graph.
- Added deterministic evaluation for distance/volume ratios, alignments, ordering, and plane-chain obligations while preserving missing measurements as unresolved rather than inventing a pass.
- Integrated relational eligibility into parameter fitting as a hard candidate-admission barrier beside objective protection and structural eligibility. A lower visual or perceptual loss cannot select a candidate whose required whole-system relations fail or remain unresolved.
- Kept relational residuals diagnostic: they are not weighted penalties that can be traded against unrelated visual gains and cannot pass visual-review authority.

### Certification closure

- Added `refas.certification-relational-evidence/v1` to seal the exact candidate together with the exact bytes and logical digests of the relational structure, semantic authority set, whole-system barrier, and candidate-bound relational discrepancy.
- Real-source whole-object certification now requires a mandatory `whole-system-relational-fidelity` claim in addition to the existing visual/source-fidelity evidence chain.
- The relational closure revalidates authority coverage, source identity, whole scope, passing barrier/discrepancy state, and exact barrier-check reproduction from candidate-bound discrepancy evidence.
- Candidate/evidence substitution, relational replay across candidates, freshly re-signed relational artifacts, and custom certification policies that delete or weaken the mandatory relational claim fail closed.
- Whole-object certificates and audits bind the resulting relational certification digest. Contract-fixture acquisition classes retain patch-compatible synthetic certification behavior.

### Release and compatibility boundary

- New project state and whole-object certificates identify runtime 1.0.2; public v1 schemas continue accepting 1.0.0 and 1.0.1 artifacts.
- The release audit now treats relational structure, inference authority, relational discrepancy, the whole-system barrier, and relational certification closure as required distributable Core contracts.
- Robotics-specific actuator, collider, mass/inertia, MJCF/URDF, calibrated simulation, and manufacturer-internal mechanism claims remain outside Core. Domain packs may add those semantics later without changing the general authority model.

### Known limits

RefAs 1.0.2 can justify hidden construction as `inferred` or `engineered` when typed evidence, priors, specifications, or functional/downstream requirements support it. That permission does not identify unseen manufacturer truth. Ambiguous single-view orientation, absolute scale, material composition, and simulation-ready physical calibration still require additional evidence. See `docs/known-limitations.md`.

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

- Added sealed candidate provenance transactions that bind one exact candidate, checkpoint, evidence DAG, dependencies, and declared obligations.
- Added claim-driven certification policies with explicit per-claim evidence role/schema obligations and reproducible per-claim authorization decisions.
- Bound whole-object certificates to the exact candidate transaction, policy, claim decision, visual review, registered comparison, and independent PBR evidence required by the active claim set.
- Added adversarial hardening against candidate/evidence substitution, stale checkpoint replay, forged decisions, cross-claim evidence contamination, and freshly re-signed policies that weaken the mandatory whole-object authority floor.

### Reproducible examples and distribution

- Added repository dogfoods for end-to-end reconstruction, joint parameter fitting, independent PBR materials, hard-surface topology, modular assembly, articulated geometry, and benchmark coverage.
- Added a dependency-free `demo/` page that explains the current release boundary and routes to reproducible examples rather than treating opaque screenshots as proof.
- Kept the distributable runtime singular under `skills/refas/` with public JSON Schemas under `schemas/` and Node.js 20+ support.

### Known limits

RefAs 1.0 does not claim fully resolved terminal 3D orientation from ambiguous single views, unseen manufacturer-internal mechanisms, or calibrated simulation-ready mass/collider/actuator truth without additional evidence. See `docs/known-limitations.md`.

This release intentionally contains no development-iteration identity in public schemas, runtime APIs, or deployable skill instructions.
