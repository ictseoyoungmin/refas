# RefAs 1.0 architecture

## Architecture contract

The distributable skill at `skills/refas/` is the product boundary and the single runtime authority. Tests, examples, and package exports import it directly. Repository tooling may validate or package the skill but must not implement a competing reconstruction engine.

## Capability graph

| Order | Capability | Authoritative output |
|---:|---|---|
| 1 | `source-intake` | immutable source identity and acquisition context |
| 2 | `visual-hierarchy` | whole-to-feature scopes with context-preserving ROIs |
| 3 | `visual-observation` | source-cited facts, interpretations, hypotheses, ambiguities |
| 4 | `spatial-hypotheses` | ranked camera, depth, orientation, and hidden-form alternatives |
| 5 | `shape-reconstruction` | silhouette, mass, curvature, thickness, coarse negative space |
| 6 | `surface-topology` | projection-anchored cells, seams, ribs, relief, and shared boundaries |
| 7 | `assembly` | reference-frame registration and immutable child placement |
| 8 | `appearance` | evidence-supported color, roughness, metalness, and finish |
| 9 | `rendering` | reproducible actual multiview images and camera records |
| 10 | `visual-critique` | typed finding ledger with evidence references |
| 11 | `whole-object-certification` | fail-closed certificate over current gates and an independent digest-bound visual review |

Each finding is owned by exactly one capability. Reopening an owner invalidates the owner and its transitive dependents, while upstream evidence and unrelated scopes remain intact.

## Project state

```text
project/
├── source/                 primary images and manifests
├── evidence/               deterministic observation aids
├── model/                  hierarchy, observations, hypotheses, specifications
├── assets/                 GLB assets and closed children
├── renders/                actual frames and review boards
├── reviews/                findings, metrics, and gate evidence
└── .refas/
    ├── project.json        active head and recovery state
    ├── checkpoints/        immutable semantic checkpoint records
    ├── objects/            content-addressed artifact bytes
    ├── decisions/          edit and failure-routing decisions
    └── certification.json  current whole-object certificate
```

Checkpoint IDs are content-derived. Timestamps are metadata and do not decide identity. An artifact reference is recoverable only when its exact bytes exist in `.refas/objects/` and match the recorded SHA-256.

## Canonical edit boundary

A GLB is normally a realized artifact, not the default editable source of semantic shape truth. Durable edits originate in the state owned by their capability and then realize a new exact asset.

- Shape edits update construction state and rebuild GLB bytes. Arbitrary vertex or mesh-binary patches are not canonical shape edits.
- Pose edits may update parent-local node/joint transforms directly while preserving exact mesh/accessor bytes.
- Appearance edits update material, texture, or vertex-color source state before rebaking or rebuilding the asset.
- Finalization may perform controlled fusion, welding, internal-face cleanup, and optimization only after semantic construction is closed.

`refas.canonical-edit-intent/v1` records the owner, hierarchy scope, edit class, canonical bindings, realization operations, and mutation boundary. It provides the stable boundary that later attachment propagation and contact validation can depend on. The detailed contract is in `docs/canonical-edit-boundary.md`.

## Attachment semantic layer

Assembly relationships are explicit canonical construction state rather than proximity guesses. `refas.attachment-semantics/v1` classifies every declared entity as one of `FUSED`, `RIGID_FOLLOW`, `SURFACE_OFFSET`, `MULTI_ANCHOR`, `ARTICULATED`, `SUPPORTED_CLEARANCE`, or `FREE`, with directed owner/dependent relationships and evidence basis.

The semantic layer is declarative: it rejects missing modes, invalid owner cardinality, unknown entities, self attachment, duplicate IDs, cycles, and implicit attachment, but it does not yet solve transforms or validate realized mesh contact. Later surface-anchor, propagation, fusion, and contact stages consume this graph so that owner edits cannot silently leave stale dependents behind.

## Logical fusion layer

`FUSED` does not mean that RefAs immediately welds mesh bytes. `refas.logical-fusion/v1` deterministically collapses nested `FUSED` owner chains into logical groups while keeping every semantic part independently addressable. A change to any group member produces `refas.logical-fusion-invalidation/v1`, which invalidates the entire logical body and requires reconstruction from semantic pre-fusion state.

Logical fusion never moves geometry, welds vertices, removes faces, or authorizes closure. Non-fused dependents such as glasses remain outside the group and are handled later by attachment propagation. Physical fusion is a separate controlled finalization operation and must retain an exact semantic reopen path.

## Surface anchor frame layer

Surface-following relationships do not store canonical world XYZ. `refas.surface-anchor-set/v1` binds an attachment owner to a semantic surface patch, triangle, barycentric coordinate, tangent hint, normal offset, and local rebind bounds. The evaluated owner-local frame contains position, normal, tangent, bitangent, and offset position.

When owner geometry changes, `refas.surface-anchor-rebind/v1` may recover the anchor only inside the same semantic patch and only within the anchor's distance and normal-deviation limits. This makes modest shape edits and retessellation recoverable without silently snapping an attachment to unrelated geometry. Surface anchors still do not move the dependent object; rigid-follow, surface-offset, and multi-anchor propagation consume these frames later.

## One-owner attachment follow layer

`refas.attachment-follow-state/v1` provides the two deterministic one-owner propagation primitives used before graph-wide solving. `RIGID_FOLLOW` preserves the baseline owner-relative subject frame. `SURFACE_OFFSET` consumes a current surface-anchor frame and a subject-local contact frame so the contact frame lands on the owner surface with the declared signed offset and orientation.

`refas.attachment-follow-report/v1` emits exact subject target rigid frames from explicit owner world frames. This layer is intentionally one-step: it does not order transitive dependencies, approximate `MULTI_ANCHOR`, edit mesh bytes, or authorize closure. Graph ordering and simultaneous constraints remain separate later layers.

## Multi-anchor rigid solver layer

`refas.multi-anchor-plan/v1` represents one `MULTI_ANCHOR` relation as a simultaneous rigid-body fitting problem. Every owner declared by the relation must contribute a current surface anchor and explicit owner world frame, while the subject contributes matching local anchor frames and bounded position/orientation tolerances.

`refas.multi-anchor-report/v1` estimates only translation and rotation. It never scales or deforms the subject. A best-fit pose becomes eligible for realization only when weighted RMS error and every declared local tolerance pass. Otherwise the result is `INFEASIBLE`: the approximate pose remains diagnostic evidence, but downstream assembly must not apply it as a valid attachment solution. This prevents contradictory nose/ear contacts from being hidden by stretching or warping glasses.

## Articulation and supported-clearance layer

`refas.articulated-joint/v1` defines the first `ARTICULATED` primitive as a bounded revolute joint. Owner-local and subject-local joint frames encode the pivot, the owner joint frame Z axis is the rotation axis, and the angle interval is fail-closed. Evaluation emits only a rigid subject target frame, so an offset pivot remains an actual pivot rather than degrading into rotation around the subject origin.

`refas.supported-clearance/v1` represents intentional separation without treating floating geometry as valid by default. The subject must have an explicit acyclic support path through the attachment semantic graph, every path edge and clearance counterpart binds to realized-assembly proof evidence, and each signed gap has a local non-negative range. `refas.supported-clearance-report/v1` accepts only a valid digest-bound realized assembly proof; missing support, penetration, or an out-of-range gap yields `BLOCKED` rather than invented hidden support or forced contact.

## Bounded edit transaction

A transaction contains one baseline checkpoint, one capability, one hierarchy scope, one testable intent, protected metrics, and exactly one direct candidate checkpoint.

Possible decisions are:

- `KEEP_EDIT`: objective improved without a protected regression.
- `ROLLBACK_EDIT`: the baseline bytes are restored.
- `REOPEN_OWNER`: a typed blocker selects an owner and pre-owner checkpoint.
- `REQUEST_REVIEW`: evidence is insufficient or utility is tied; baseline remains active.
- `MAY_CLOSE`: all declared local closure gates pass.
- A whole-object certificate additionally requires a `refas.visual-review/v1` artifact bound to the exact source and asset digests. Passing view and gate verdicts carry structured source observation, render observation, comparison conclusion, and evidence references. An independent pass must bind the exact current registered-comparison report, its source/asset/hero-frame/render-report/registration/hierarchy/input digests, and every compared scope. When appearance passes, it must cite a valid `refas.pbr-render-report/v1` and digest-bound frames from an independent PBR renderer. Local gate strings cannot override its verdict or findings.

Rejected candidates remain in checkpoint history as evidence, but they do not become the active head.

## Runtime boundary

The dependency-light JavaScript core owns:

- canonical JSON and SHA-256;
- canonical edit-class and GLB mutation-boundary contracts;
- explicit attachment semantic graphs and owner/dependent invariants;
- logical fusion groups and digest-bound group invalidation without physical mesh mutation;
- owner-local surface anchor frames with bounded semantic-patch retessellation recovery;
- deterministic one-owner rigid-follow and surface-offset target propagation;
- simultaneous rigid multi-anchor fitting with explicit infeasibility and no hidden scale/deformation;
- bounded revolute articulation plus support-chain-aware clearance evaluation against realized assembly proof;
- hierarchy and observation contracts;
- spatial hypotheses and 2D reference registration;
- deterministic mesh and embedded GLB construction;
- evidence-bound joint geometry parameter fitting with verified trial bytes and candidate-ranking-only metrics;
- owner-local camera, pose, appearance, and lighting fitters plus a non-authoritative alternating macro coordinator;
- deterministic model-free discrepancy evidence and generic landmark/guide/section-loft construction capacity reports;
- shared-boundary surface networks;
- immutable child composition and assembly validation;
- digest-bound portable-integrity and independent-PBR visual-review validation with fail-closed certification readiness;
- an external-process PBR boundary: the bundled Cook–Torrance fallback and optional Blender/Three.js/Filament/glTF Sample Viewer/VTK workers emit the same renderer report without linking those engines into RefAs;
- checkpoint object storage, restore, audit, and failure routing.

Pillow and NumPy provide portable evidence generation and software rendering. Their outputs are observation and validation aids. They never replace agent inspection of the raw source.

## Truth and uncertainty

Single-view depth, hidden topology, symmetry, physical dimensions, and material identity are not facts unless evidence supports them. RefAs stores plausible alternatives and falsifiers instead of collapsing uncertainty into a convenient mesh.

Metrics summarize evidence but cannot choose a repair owner. The repair unit is always a localized, typed visual finding.
