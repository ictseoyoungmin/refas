# RefAs

**Reference Asset Foundry** is a vision-first reconstruction system for AI agents that must turn reference images into traceable, editable, and evidence-bound 3D assets.

RefAs is designed for work where a quick image-to-mesh approximation is not enough. It keeps the raw reference authoritative, preserves whole-object context while inspecting parts, separates visible facts from 3D hypotheses, compares actual renders, makes risky edits recoverable, and refuses certification when the evidence chain does not reproduce.

## Demo

Open [`demo/index.html`](demo/index.html) for a dependency-free overview of the current 1.0 capability boundary and the repository's reproducible examples.

The demo intentionally does not treat committed screenshots or opaque binary assets as proof. Actual geometry, render evidence, rollback behavior, fitting, assembly checks, and certification are reproduced by the example commands below.

## What RefAs guarantees

- **Whole → region → part → subpart → feature observation.** A detail crop never erases its ancestry or the full reference.
- **Evidence-bound claims.** Facts, interpretations, hypotheses, and ambiguities remain separate.
- **Projection-aware reconstruction.** Camera and reference-frame alternatives are tested before geometry is distorted to fit a view.
- **Evidence-bound joint geometry fitting.** Deterministic worker loops can move coupled owner-local parameters through actual GLB/render trials while keeping metrics outside gate and rollback authority.
- **Immutable child assembly.** A closed child GLB is reused byte-for-byte and registered into its parent instead of silently rebuilt.
- **Geometry-bound modular assembly.** Detachable modules require actual GLB ancestry, parent-relative transforms, semantic contact frames, derived clearance/penetration/support, closed-child integrity, and object-ID separation.
- **Shared surface topology.** Adjacent observed cells consume one physical boundary rather than nearly matching duplicate frames.
- **Coherent hard-surface shells.** Curved shells, slots, and open-frame mounts compile as watertight parts with true apertures, deterministic edge treatments, and GLB-resident semantic attachment frames.
- **Actual multiview QA.** Hero, oblique, side, top, grazing, normal, object-ID, and albedo renders drive critique; rasterization success is never treated as visual similarity.
- **Registered local comparison.** Digest-bound source/render overlays, splits, edge differences, grids, landmarks, and normalized dimensions retain whole-to-feature ancestry; metrics localize findings but never set a visual gate.
- **Sealed candidate provenance.** A candidate transaction binds the exact candidate, checkpoint, evidence DAG, dependency proofs, and declared obligations by content digest.
- **Claim-driven certification.** Certification policy decides which evidence roles/schemas are required for each claim; a valid transaction alone never implies a valid claim.
- **Adversarially hardened authority.** Candidate/evidence substitution, stale checkpoint replay, forged decisions, cross-claim contamination, and freshly re-signed weaker policies fail closed.
- **Independent PBR appearance evidence.** After portable integrity passes, the deterministic Cook–Torrance backend or an external renderer worker binds exact rig, color pipeline, feature coverage, and output digests.
- **Typed failure ownership.** Every blocker identifies its visual scope, owning capability, invalidated dependents, and safe checkpoint.
- **Bounded render resources without a quality ceiling.** The portable renderer accepts high-triangle assets by default, uses bounded tiles, preflights decoded geometry and framebuffer memory, and stops on explicit wall-clock deadlines; optional triangle caps remain project policy rather than a global quality limit.
- **Content-addressed rollback.** Checkpoints retain the exact artifact bytes required to restore a trustworthy state.

## What 1.0 does not claim

RefAs 1.0 does **not** automatically establish unseen manufacturer-internal mechanisms, calibrated mass/inertia/collider/actuator truth, or an unambiguous full 3D terminal orientation from a single ambiguous view. A correct projected endpoint or primary axis is not by itself proof of a correct full orientation. See [Known limitations](docs/known-limitations.md).

## Quick start

Requirements:

- Node.js 20 or newer
- Python 3 with Pillow and NumPy for evidence views, the portable integrity renderer, and the independent PBR fallback

Install the Python dependencies with `python -m pip install --requirement requirements.txt`.

```bash
npm test
node skills/refas/scripts/refas.mjs --help
node skills/refas/scripts/refas.mjs init \
  --root ./work/object \
  --project object-study \
  --source ./work/object/source/source-manifest.json
```

The executable runtime lives inside the distributable skill. Repository tests and examples import that same code; there is no second implementation to drift.

## Reconstruction and certification flow

1. Bind the source image to a SHA-256 manifest.
2. Observe the full frame and define a semantic visual hierarchy.
3. Record source-cited facts and explicit ambiguities for one scope.
4. Maintain competing spatial hypotheses where one image cannot decide depth, camera, orientation, or hidden form.
5. Reconstruct silhouette, mass, curvature, thickness, and large negative space before decoration.
6. When a parameterized backend exists, jointly fit owner-local variables through actual-render trials and visually inspect the selected candidate.
7. Build projection-anchored surface boundaries and shared adjacency.
8. Register immutable child assets into parent frames and validate attachment, contact, support, clearance, and articulation as applicable.
9. Render the standard diagnostic view set and independent PBR evidence when appearance claims require it.
10. Register the exact source and current render, then inspect whole-to-feature comparison boards before routing a mismatch.
11. Route localized findings to their owning capability and restore or reopen the selected checkpoint when required.
12. Seal the exact candidate, checkpoint, evidence nodes, dependency proofs, and obligations into a candidate transaction.
13. Evaluate explicit claims against the active certification policy; transaction validity alone is not claim authority.
14. Issue a whole-object certificate only when the exact transaction, policy, decision, visual evidence, and required gates reproduce together.

## Repository layout

```text
refas/
├── AGENTS.md                    stable repository instructions for coding agents
├── CHANGELOG.md                 release history
├── .github/                     issue forms, PR contract, labels, and CI
├── demo/                        dependency-free 1.0 release showcase
├── skills/refas/                distributable skill and canonical runtime
├── schemas/                     public JSON Schemas
├── tests/                       unit, integration, adversarial, and regression tests
├── examples/wing-cover/         end-to-end reconstruction/recovery fixture
├── examples/parameter-fit/      actual GLB/render joint-fitting dogfood
├── examples/material-fixture/   deterministic independent-PBR dogfood
├── examples/hard-surface/       coherent shell/topology dogfood
├── examples/modular-assembly/   contact/clearance/support assembly dogfood
├── examples/articulated-figure/ articulated geometry and pose dogfood
├── examples/benchmark-matrix/   cross-capability benchmark runner
├── tools/                       repository and release audits
└── docs/                        architecture, quality, recovery, and claim contracts
```

Development workflow state is intentionally absent from product schemas, filenames, APIs, and prose. Work may be managed by any production method without becoming part of RefAs architecture.

## Commands

```bash
npm test
npm run test:python
npm run check
npm run dogfood
npm run dogfood:parameter-fit
npm run dogfood:pbr
npm run dogfood:hard-surface
npm run dogfood:assembly
npm run dogfood:articulated
npm run benchmark:matrix
npm run release:audit
```

See [Architecture](docs/architecture.md), [Candidate transactions](docs/candidate-transactions.md), [Claim certification](docs/claim-certification.md), [Adversarial certification hardening](docs/adversarial-certification.md), [Joint parameter fitting](docs/parameter-fitting.md), [Independent PBR renderer](docs/pbr-renderer.md), [Agent recovery](docs/agent-recovery.md), [Known limitations](docs/known-limitations.md), [Development plan](docs/development-plan.md), and [Release criteria](docs/release-criteria.md).

Contributions follow the [Issue and Pull Request governance contract](docs/github-governance.md): one runtime capability and hierarchy scope or one explicit repository boundary, one primary Issue, evidence-bound review, and an explicit recovery point.

## License

MIT
