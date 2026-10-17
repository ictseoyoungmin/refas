<div align="center">
  <img src="skills/refas/assets/icon.svg" width="180" alt="RefAs robotic arm icon">
  <h1>RefAs</h1>
  <p>
    <img src="https://img.shields.io/badge/development-v1.4.2-E39B35" alt="Development version v1.4.2 (unreleased)">
    <a href="https://github.com/ictseoyoungmin/refas/releases/tag/v1.4.1"><img src="https://img.shields.io/badge/latest%20release-v1.4.1-6f5a46" alt="Latest published release v1.4.1"></a>
    <a href="https://github.com/ictseoyoungmin/refas/actions/workflows/ci.yml"><img src="https://github.com/ictseoyoungmin/refas/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
    <img src="https://img.shields.io/badge/node-20%2B-339933" alt="Node.js 20+">
    <img src="https://img.shields.io/badge/Agent%20Skill-Vision--first%203D-b06f47" alt="Agent Skill: Vision-first 3D">
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-59636e" alt="MIT License"></a>
  </p>
</div>

**Release status:** `v1.4.1` is the latest published GitHub Release. The repository package version `1.4.2` is an **unreleased development candidate**; pending review and changes belong on `develop/v1.4.2` until promoted to `main` and explicitly published. The 1.5.0 development proposal was canceled, not released.

**Reference Asset Foundry** is a vision-first reconstruction system for AI agents that turn reference images into traceable, editable, evidence-bound 3D assets and, when justified, explicit physical construction semantics.

RefAs is designed for work where a quick image-to-mesh approximation is not enough. The raw reference remains authoritative, whole-object context survives part inspection, observation stays distinct from inference and engineering choice, actual renders are compared, risky edits remain recoverable, and certification fails when the exact evidence chain cannot be reproduced.

## What RefAs does

RefAs helps an AI agent **build, edit, inspect and export** reference-driven 3D assets. It records what is visible in the original image, proposes plausible 3D form where a view is ambiguous, constructs actual geometry, captures multiple views, and routes concrete problems back to the part that needs repair. Work products include editable construction state, GLB assets, rendered evidence and recoverable checkpoints. An external 3D authoring tool or worker may be used; installing the skill does not make every photograph an automatically generated model.

The main workflow is **observe → construct → render → compare → locally revise**. Validation exists to support asset quality rather than replace modeling.

The bundled [demo](demo/index.html) illustrates the tooling. For reproducible examples see [examples](examples/) and [the construction guide](skills/refas/references/construction.md).

### Release stabilization in 1.4.1

The 1.4.1 patch improves Visibility Buffer cache invalidation when the GLB parser or material feature-policy code changes, adds sampled Linux Blender subprocess-tree RSS and timeout supervision, and corrects historical release and installed-skill documentation. The portable v1 renderer's near-plane clipping behavior remains unchanged for digest compatibility. These changes do not confer independent reference-photo likeness or generalized PBR equivalence; see [known limitations](docs/known-limitations.md). Full 1.4.0/1.4.1 same-host CPU comparison and exact pixel/depth parity are recorded in [paired benchmark evidence](docs/development/v1.4.1-r14-p03-paired-measured-2026-10-16.md).

### Renderer architecture and diagnostic previews in 1.4.0

- Shared visibility-buffer and bounded CPU rasterization paths reduce repeated geometry work across normal, object-ID, albedo and appearance previews; deterministic original-source provenance remains part of the render report.
- The opt-in PBR v2 material preview supports scoped glTF `COLOR_0` and supported texture/sampler/mip behavior. Its new analytic studio hemisphere/reflection-panel lighting improves dark-metal legibility without claiming real HDR IBL or emissive-map support. Use `refas preview-pbr --backend opaque-v2 --views hero,side --reuse` through the existing CLI (optional Numba required). The normal `render-pbr` and `preview-pbr` appearance paths now default to studio v2; an explicit `--ssaa 2` renders at twice the linear resolution and downsamples with Lanczos for cleaner metal/strap silhouettes (opt-in to preserve fast iteration); unsupported materials fail closed rather than automatically calling the old backend. Numba is now included in the renderer requirements and is required by the default studio v2 backend. The historical v1 appearance path remains accessible for explicit golden replay only, and the original neutral-clay renderer remains pinned for source-bound geometry closure until its own independent parity gate. V2 produces digest-bound eight-view reports with a distinct `numba-studio-pbr-v2` identity; visual resemblance is not inferred from material appearance. Unsupported appearance attributes fail closed without silent fallback; backend parity and a default switch remain unproven.
- The optional external Blender Cycles adapter provides independent, SHA-bound offline renders. The original Monster Bed was independently rendered at 160/384px and accepted under an **unregistered diagnostic camera**, not a source-photo camera or trusted resemblance gate. Blender is **not** a mandatory bundled runtime dependency.
- Source-photo-registered canonical views, generalized cross-engine PBR equivalence, and source-to-asset identity certification remain separate future acceptance gates.

### Production-oriented updates in 1.3.0

- Build the complete major volume, paired/repeated parts and connected surfaces before fine detailing; review real registered and orthogonal renders.
- Request only useful source-derived image analyses using `refas evidence --spec` and record their contribution with `--assess`. Old `--image` calls retain the published v1.2.1 compatibility output format.
- Use selective PBR previews and a digest-verified visual review board while retaining full canonical evidence requirements.
- Preserve old observation snapshot files when a derivative is retired, so prior references remain resolvable; physical garbage collection requires a separate reference-aware procedure.

The workflow improvements are agent guidance and utilities, not an independent guarantee of reference resemblance, geometric manifoldness for every output, or game-engine readiness.

### Core capabilities

- **Observation grounded in real images:** preserve whole-image context, semantic regions, visible facts, depth uncertainty and the difference between observation, inference and engineering.
- **Geometry construction and local editing:** build major masses and structural relationships first, then surfaces, parts, material appearance and reusable assemblies; parameter-fit only within the responsible editing scope.
- **Real 3D feedback:** record canonical cameras, render hero/oblique/side/top/grazing and diagnostic views, and compare source evidence to exact current GLB bytes.
- **Recoverable agent workflow:** use typed findings, checkpoint lineage, `next`, `diagnose` and `validate` to inspect what changed and reopen only the responsible work.
- **Optional physical and export semantics:** express attachment, articulation, contact/support, dynamics and backend mapping when the asset requires them, without treating an unobserved mechanism as source truth.

### Known quality boundary

A valid GLB, a completed rendering, a generic RefAs certificate or a draft transfer **does not prove that the 3D object resembles the supplied photo**. RefAs can detect supported physical/source contradictions, but independent positive recognition of original-photo part identities and roles is not a completed universal fidelity evaluator. Strict source-bound final handoff remains `BLOCKED` when required independent evidence is `INSUFFICIENT`. Single-view IoU is never positive resemblance authority; multiview IoU is correspondence-only.

Typed physical readiness (`articulated-ready`, `simulation-ready`, `control-ready`, `runtime-ready`) describes validated obligations for *declared* semantics, not independently measured real-world properties. For the optional physical construction details see [architecture](docs/architecture.md), [known limitations](docs/known-limitations.md) and [an integrated physical example](docs/integrated-physical-fixture.md).

## Install

**With the Skills CLI (recommended):**

```bash
npx skills add ictseoyoungmin/refas --skill refas --agent claude-code
npx skills add ictseoyoungmin/refas --skill refas --agent codex
```

Use the matching `--agent` value for another supported agent. RefAs also ships thin discovery manifests for Claude, Codex, and generic agent marketplaces under `.claude-plugin/`, `.codex-plugin/`, and `.agents/plugins/`. Every adapter routes to the same canonical `./skills/` tree; there is no plugin-specific copy of the instructions or runtime.

**Manual skill install** — copy the canonical skill folder into wherever your agent loads skills from:

```bash
cp -r skills/refas /path/to/your/skills/
```

## Quick start

Requirements:

- Node.js 20 or newer
- Python 3 with Pillow and NumPy for evidence views, portable integrity rendering, and the independent PBR fallback

```bash
python -m pip install --requirement requirements.txt
node skills/refas/scripts/refas.mjs --help
node skills/refas/scripts/refas.mjs source-manifest --root project --image project/source/reference.png --id primary --out project/source/source-manifest.json
node skills/refas/scripts/refas.mjs init --root project --project my-reference-model --source project/source/source-manifest.json
node skills/refas/scripts/refas.mjs next --root project
```

Place the original image at `project/source/reference.png` first. The commands initialize a source-bound project and report the next work; they do not by themselves generate a finished GLB. Follow the agent's current construction capability and use your modeling backend to create actual geometry.

The executable runtime lives inside the distributable skill. Tests and examples import that same code; there is no second runtime implementation to drift.

## Agent workflow interface

The installed skill defaults to a short routing path
(`SKILL.md` → `references/INDEX.md` → `references/workflow.md`);
checkpoint/recovery guides are loaded when a corresponding operation is
actually needed. Choose static, organic, mechanically articulated or physical
runtime guides according to the work, rather than loading the entire
assembly/physical stack for a simple object.
For a runnable, explicitly non-authoritative geometry example use
`node skills/refas/scripts/subdivision-cage-demo.mjs`.

Strict source-bound verification and artifact transfer remain separate:
`refas-host handoff` defaults to `draft-transfer`, whereas
`refas-host handoff --profile source-bound-object` demands independent
source-bound evidence and may refuse even a valid generically certified GLB.


The CLI helps an agent discover its next modeling step, inspect failures and reuse installed validators. These three commands are read-only and return JSON:

```bash
node skills/refas/scripts/refas.mjs next --root project
node skills/refas/scripts/refas.mjs diagnose --root project --asset project/candidate.glb
node skills/refas/scripts/refas.mjs diagnose --root project --finding project/finding.json
node skills/refas/scripts/refas.mjs validate --root project --asset project/candidate.glb
```

The installed canonical instruction graph registers these as
`workflow/agent-next`, `failure-routing/agent-diagnose`, and
`validation/agent-validate-source-bound` (use `refas describe node workflow`,
`refas describe node failure-routing`, or `refas describe node validation`
to discover public contracts). For the detailed agent execution order see
`skills/refas/references/INDEX.md` and `skills/refas/references/workflow.md`.

`next` is derived from trusted checkpoint/recovery guidance; `diagnose` shows exact existing blocker statuses, responsible capability, provenance and an advisory next action; `validate` reuses the same strict `source-bound-object` coverage as `refas verify` (exit code **2** if blocked). No wrapper creates new visual judgments, changes project state, certifies models or grants draft output positive source-fidelity authority. `refas-host handoff` defaults to `draft-transfer`; explicit `--profile source-bound-object` remains separately fail-closed and must not be confused with generic certification.

**Known limitation:** independent original-photo part/role recognition is not yet a trusted positive evaluator. Even a structurally valid GLB may therefore remain `INSUFFICIENT` and source-bound final Handoff remains `BLOCKED`. The interface release does **not** promise automatic image-to-3D accuracy or game-ready assets. [Foundry production roadmap](docs/development/foundry-production-roadmap.md).

## Reconstruction, physical closure, and certification flow

1. Bind the primary source to immutable digest identity.
2. Observe the whole frame and build a context-preserving hierarchy.
3. Record visible facts separately from hypotheses, ambiguities, inferences, and engineered choices.
4. Maintain camera/depth/orientation alternatives where one image cannot decide the hidden state.
5. Close whole-system relational obligations and semantic authority before lower-scope hardening.
6. Reconstruct shape, surface topology, parent-local assembly, and appearance from current evidence.
7. Produce actual multiview and independent rendering evidence and route visible failures to their owner.
8. When physical semantics are required, construct stable identities and only the applicable dynamics/collision/articulation/mechanism/transmission/actuation/control/runtime contracts.
9. Seal physical components into a reusable bundle and derive backend representation obligations before export.
10. Export each backend independently from canonical semantics, normalize it, and compare it back to canonical meaning.
11. Resolve representable drift by fixing construction/export or, only when justified, by exact live declared divergence.
12. Create the selected physical-readiness evidence and run typed live preflight.
13. Seal candidate provenance and all evidence required by the active claim policy.
14. Issue whole-object or physical claim authorization only when the exact current evidence chain reproduces.

## Repository layout

```text
refas/
├── AGENTS.md                    stable repository instructions for coding agents
├── CHANGELOG.md                 release history
├── .agents/plugins/             generic agent marketplace adapter
├── .claude-plugin/              Claude plugin metadata and marketplace adapter
├── .codex-plugin/               Codex plugin metadata and product interface
├── .github/                     issue forms, PR contract, CI, and release workflow
├── demo/                        dependency-free release showcase
├── skills/refas/                distributable skill and canonical runtime
├── schemas/                     public JSON Schemas
├── tests/                       unit, integration, adversarial, and regression tests
├── examples/                    reproducible reconstruction/render/assembly dogfoods
├── tools/                       repository, plugin, and release audits
└── docs/                        architecture, physical closure, quality, recovery, and claim contracts
```

## Development and verification

Contributors can run the repository's existing regression, installed-skill and release audits:

```bash
npm test
npm run test:python
npm run check
npm run dogfood:fresh-worker
npm run release:audit
```

See [architecture](docs/architecture.md), [known limitations](docs/known-limitations.md), [release criteria](docs/release-criteria.md) and [contributing governance](docs/github-governance.md). Historical implementation notes, slice plans and future production work live under `docs/development/` and are not instructions for an installed modeling agent.

## License

MIT
