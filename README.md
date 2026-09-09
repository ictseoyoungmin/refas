<p align="center">
  <img src="skills/refas/assets/icon.svg" width="180" alt="RefAs robotic arm icon">
</p>

# RefAs

**Reference Asset Foundry** is a vision-first reconstruction system for AI agents that must turn reference images into traceable, editable, and evidence-bound 3D assets.

RefAs is designed for work where a quick image-to-mesh approximation is not enough. It keeps the raw reference authoritative, preserves whole-object context while inspecting parts, distinguishes observation from inference and engineering choice, compares actual renders, makes risky edits recoverable, and refuses certification when the evidence chain does not reproduce.

## Demo

Open [`demo/index.html`](demo/index.html) for a dependency-free overview of the current 1.0.2 capability boundary and the repository's reproducible examples.

The demo intentionally does not treat committed screenshots or opaque binary assets as proof. Actual geometry, render evidence, rollback behavior, fitting, assembly checks, relational authority, and certification are reproduced by repository tests and example commands.

## What RefAs guarantees

- **Whole → region → part → subpart → feature observation.** A detail crop never erases its ancestry or the full reference.
- **Evidence-bound claims.** Facts, interpretations, hypotheses, ambiguities, inferred propositions, and engineered choices remain distinguishable.
- **Projection-aware reconstruction.** Camera and reference-frame alternatives are tested before geometry is distorted to fit a view.
- **Full-frame orientation evidence.** Position or a primary axis alone never proves roll, terminal facing, or parent-child twist.
- **Relational structure before local hardening.** `refas.relational-structure/v1` expresses domain-neutral proportions, alignments, ordering, plane chains, volume ratios, and dependencies; macro/identity whole-system relations must close before local geometry is trusted.
- **Explicit inference authority.** `observed`, `inferred`, `engineered`, `unknown`, and `forbidden` are distinct. Unobserved/unknown does not mean forbidden, while inferred or engineered construction never becomes source truth by relabeling.
- **Hard relational candidate eligibility.** Candidate-bound relational discrepancy can make a lower-loss fit ineligible; failed relations are never traded against visual gains as weighted penalties.
- **Evidence-bound joint geometry fitting.** Deterministic worker loops can move coupled owner-local parameters through actual GLB/render trials while keeping metrics outside gate and rollback authority.
- **Immutable child assembly.** A closed child GLB is reused byte-for-byte and registered into its parent instead of silently rebuilt.
- **Geometry-bound modular assembly.** Detachable modules require actual GLB ancestry, parent-relative transforms, semantic contact frames, derived clearance/penetration/support, closed-child integrity, and object-ID separation.
- **Shared surface topology.** Adjacent observed cells consume one physical boundary rather than nearly matching duplicate frames.
- **Coherent hard-surface shells.** Curved shells, slots, and open-frame mounts compile as watertight parts with true apertures, deterministic edge treatments, and semantic attachment frames.
- **Actual multiview QA.** Hero, oblique, side, top, grazing, normal, object-ID, and albedo renders drive critique; rasterization success is never treated as visual similarity.
- **Registered local comparison.** Digest-bound source/render overlays, splits, edge differences, grids, landmarks, and normalized dimensions retain whole-to-feature ancestry; metrics localize findings but never set a visual gate.
- **Sealed candidate provenance.** A candidate transaction binds the exact candidate, checkpoint, evidence DAG, dependency proofs, and declared obligations by content digest.
- **Claim-driven certification.** Certification policy decides which evidence roles/schemas are required for each claim; a valid transaction alone never implies a valid claim.
- **Sealed relational certification for real sources.** The exact candidate plus exact relation graph, semantic authority, whole-system barrier, and candidate relational discrepancy are jointly rebound and audited before the required relational claim may pass.
- **Adversarially hardened authority.** Candidate/evidence substitution, stale replay, forged decisions, cross-claim contamination, relational replay/substitution, and freshly re-signed weaker policies fail closed.
- **Independent PBR appearance evidence.** After portable integrity passes, the deterministic Cook–Torrance backend or an external renderer worker binds exact rig, color pipeline, feature coverage, and output digests.
- **Typed failure ownership and content-addressed rollback.** Blockers have an owner/recovery point and checkpoints retain exact bytes required to restore trustworthy state.
- **Bounded render resources without a quality ceiling.** Resource safety is handled by memory preflight, tiles, deadlines, and optional project policy rather than an arbitrary global triangle cap.

## What 1.0.x does not claim

RefAs does **not** automatically establish unseen manufacturer-internal mechanisms, calibrated mass/inertia/collider/actuator truth, real-world scale, unknown material composition, or an unambiguous full 3D terminal orientation from a single ambiguous view. Version 1.0.2 may construct hidden form as explicit `inferred` or `engineered` state when its typed basis justifies that construction; this is not a claim that the photographed manufacturer used the same hidden mechanism. See [Known limitations](docs/known-limitations.md).

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
5. Declare important whole-system relationships in `refas.relational-structure/v1` and classify each proposition's authority with `refas.semantic-authority-set/v1`.
6. Reconstruct silhouette, mass, curvature, thickness, large negative space, and the declared macro relational system before decoration.
7. Pass the whole-system relational barrier before lower-scope geometry hardening; `unknown` requests resolution rather than becoming `forbidden`.
8. When a parameterized backend exists, evaluate candidate-bound relational discrepancy beside structural eligibility and numeric objectives. A failed/unresolved required relation makes the candidate ineligible.
9. Build projection-anchored surface boundaries and shared adjacency.
10. Register immutable child assets into parent frames and validate attachment, contact, support, clearance, and articulation as applicable.
11. Add appearance only after geometry can explain the image, then render the standard diagnostic view set and independent PBR evidence when required.
12. Register the exact source and current render, inspect whole-to-feature comparison boards, and route localized typed findings to their owning capability.
13. Seal the exact candidate, checkpoint, evidence nodes, dependency proofs, and obligations into a candidate transaction.
14. For real sources, seal exact relational-structure, semantic-authority, relational-barrier and candidate-discrepancy bytes into `refas.certification-relational-evidence/v1` and bind that closure into the transaction.
15. Evaluate explicit claims against the active certification policy. Transaction validity, relational closure, or good metrics alone are not visual/source-truth authority.
16. Issue a whole-object certificate only when the exact transaction, relational closure when required, policy, decision, visual evidence, and required gates reproduce together.

## Repository layout

```text
refas/
├── AGENTS.md                    stable repository instructions for coding agents
├── CHANGELOG.md                 release history
├── .github/                     issue forms, PR contract, labels, and CI
├── demo/                        dependency-free release showcase
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

Development workflow state is intentionally absent from product schemas, filenames, APIs, and prose. Work may be managed by any production method without becoming part of RefAs runtime architecture.

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

See [Architecture](docs/architecture.md), [Candidate transactions](docs/candidate-transactions.md), [Claim certification](docs/claim-certification.md), [Adversarial certification hardening](docs/adversarial-certification.md), [Joint parameter fitting](docs/parameter-fitting.md), [Independent PBR renderer](docs/pbr-renderer.md), [Agent recovery](docs/agent-recovery.md), [Known limitations](docs/known-limitations.md), and [Release criteria](docs/release-criteria.md). The distributable skill also includes `references/relational-structure.md`, `references/inference-authority.md`, and `references/whole-system-relational-barrier.md` for the current relational reasoning contract.

Contributions follow the [Issue and Pull Request governance contract](docs/github-governance.md): one runtime capability and hierarchy scope or one explicit repository boundary, one primary Issue, evidence-bound review, and an explicit recovery point.

## License

MIT
