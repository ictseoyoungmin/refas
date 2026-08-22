# RefAs

**Reference Asset Foundry** is a vision-first reconstruction system for AI agents that must turn reference images into traceable, editable, and visually certified 3D assets.

RefAs is designed for work where a quick image-to-mesh approximation is not enough. It keeps the raw reference authoritative, preserves whole-object context while inspecting parts, separates visible facts from 3D hypotheses, compares actual renders, and makes every risky edit recoverable.

## What RefAs guarantees

- **Whole → region → part → subpart → feature observation.** A detail crop never erases its ancestry or the full reference.
- **Evidence-bound claims.** Facts, interpretations, hypotheses, and ambiguities remain separate.
- **Projection-aware reconstruction.** Camera and reference-frame alternatives are tested before geometry is distorted to fit a view.
- **Immutable child assembly.** A closed child GLB is reused byte-for-byte and registered into its parent instead of silently rebuilt.
- **Shared surface topology.** Adjacent observed cells consume one physical boundary rather than nearly matching duplicate frames.
- **Actual multiview QA.** Hero, oblique, side, top, grazing, normal, object-ID, and albedo renders drive critique; rasterization success is never treated as visual similarity.
- **Registered local comparison.** Digest-bound source/render overlays, splits, edge differences, grids, landmarks, and normalized dimensions retain whole-to-feature ancestry; their metrics localize findings but never set a visual gate.
- **Fail-closed visual certification.** An independent, digest-bound visual review must pass the exact source and asset bytes; self-generated fixtures and unsupported material claims cannot certify.
- **Independent PBR appearance evidence.** After portable integrity passes, the deterministic Cook–Torrance backend or an external renderer worker must bind its exact rig, color pipeline, feature coverage, and output digests.
- **Typed failure ownership.** Every blocker identifies its visual scope, owning capability, invalidated dependents, and safe checkpoint.
- **Bounded render resources without a quality ceiling.** The portable renderer accepts high-triangle assets by default, uses bounded tiles, preflights decoded geometry and framebuffer memory, and stops on explicit wall-clock deadlines; optional triangle caps remain project policy rather than a global quality limit.
- **Content-addressed rollback.** Checkpoints retain the exact artifact bytes required to restore a trustworthy state.

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

## Reconstruction flow

1. Bind the source image to a SHA-256 manifest.
2. Observe the full frame and define a semantic visual hierarchy.
3. Record source-cited facts and explicit ambiguities for one scope.
4. Maintain competing spatial hypotheses where one image cannot decide depth or camera.
5. Reconstruct silhouette, mass, curvature, and thickness before decoration.
6. Build projection-anchored surface boundaries and shared adjacency.
7. Register immutable child assets into parent frames and validate attachment and occlusion.
8. Render the standard diagnostic view set.
9. Register the exact source and current render, then inspect whole-to-feature comparison boards before routing a mismatch.
10. Route localized findings to their owning capability and restore the selected checkpoint when required.
11. Certify only when every release gate and the independent visual review have current passing evidence.

## Repository layout

```text
refas/
├── AGENTS.md              stable repository instructions for coding agents
├── .github/               issue forms, PR contract, labels, and CI
├── skills/refas/          distributable skill and canonical runtime
├── schemas/               public JSON Schemas
├── tests/                 unit, integration, and regression tests
├── examples/wing-cover/   reproducible end-to-end dogfood fixture
├── examples/material-fixture/ deterministic four-material PBR dogfood
├── tools/                 repository and release audits
└── docs/                  architecture and quality contracts
```

Development workflow state is intentionally absent from product schemas, filenames, APIs, and prose. Work may be managed by any production method without becoming part of RefAs architecture.

## Commands

```bash
npm test             # deterministic Node test suite
npm run test:python  # Python syntax gate
npm run check        # repository architecture and naming audit
npm run dogfood      # exercise reconstruction and prove the self-generated fixture is refused certification
npm run dogfood:pbr  # render four PBR finishes twice and require identical output digests
npm run release:audit
```

See [Architecture](docs/architecture.md), [Independent PBR renderer](docs/pbr-renderer.md), [Agent recovery](docs/agent-recovery.md), [Prototype migration](docs/migration-from-prototypes.md), [Development plan](docs/development-plan.md), and [Release criteria](docs/release-criteria.md) for the normative contracts and completed 1.0 route.

Contributions follow the [Issue and Pull Request governance contract](docs/github-governance.md): one runtime capability and hierarchy scope or one explicit repository boundary, one primary Issue, evidence-bound review, and an explicit recovery point.

## License

MIT
