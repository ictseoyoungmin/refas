<div align="center">
  <img src="skills/refas/assets/icon.svg" width="180" alt="RefAs robotic arm icon">
  <h1>RefAs</h1>
  <p>
    <a href="https://github.com/ictseoyoungmin/refas/releases/tag/v1.1.0"><img src="https://img.shields.io/badge/version-v1.1.0-6f5a46" alt="Version v1.1.0"></a>
    <a href="https://github.com/ictseoyoungmin/refas/actions/workflows/ci.yml"><img src="https://github.com/ictseoyoungmin/refas/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
    <img src="https://img.shields.io/badge/node-20%2B-339933" alt="Node.js 20+">
    <img src="https://img.shields.io/badge/Agent%20Skill-Vision--first%203D-b06f47" alt="Agent Skill: Vision-first 3D">
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-59636e" alt="MIT License"></a>
  </p>
</div>

**Reference Asset Foundry** is a vision-first reconstruction system for AI agents that turn reference images into traceable, editable, evidence-bound 3D assets and, when justified, explicit physical construction semantics.

RefAs is designed for work where a quick image-to-mesh approximation is not enough. The raw reference remains authoritative, whole-object context survives part inspection, observation stays distinct from inference and engineering choice, actual renders are compared, risky edits remain recoverable, and certification fails when the exact evidence chain cannot be reproduced.

## Demo

Open [`demo/index.html`](demo/index.html) for a dependency-free overview of the current 1.1.0 capability boundary and reproducible repository evidence.

The demo does not treat committed screenshots or opaque binary assets as proof. Geometry, render evidence, rollback, fitting, assembly checks, relational authority, physical semantics, backend normalization, readiness claims, and certification are exercised by tests and dogfood commands.

## What RefAs guarantees

- **Whole → region → part → subpart → feature observation.** A detail crop never erases its ancestry or the full reference.
- **Evidence-bound claims.** Facts, interpretations, hypotheses, ambiguities, inferred propositions, and engineered choices remain distinguishable.
- **Projection-aware reconstruction.** Camera and reference-frame alternatives are tested before geometry is distorted to fit one view.
- **Full-frame orientation evidence.** Position or one primary axis alone never proves roll, terminal facing, or parent-child twist.
- **Relational structure before local hardening.** Domain-neutral proportions, alignments, ordering, plane chains, volume ratios, and dependencies must close before local detail can substitute for the whole.
- **Explicit semantic authority.** `observed`, `inferred`, `engineered`, `unknown`, and `forbidden` remain distinct. Unknown is unresolved, not absence; engineered construction is not source truth.
- **Hard candidate eligibility.** Structural and relational failures cannot be traded away by a lower visual or numeric loss.
- **Immutable child assembly.** Closed child assets remain reusable by exact identity and bytes rather than silently rebuilt.
- **Actual multiview QA.** Hero, oblique, side, top, grazing, normal, object-ID, and albedo evidence drives critique; raster success is never visual similarity.
- **Sealed provenance and claim-driven certification.** Candidate, checkpoint, evidence DAG, dependencies, policy, and decision are digest-bound and reproduced before authorization.
- **Content-addressed rollback.** Typed findings route to one owner and trustworthy bytes can be restored when a downstream edit fails.

## Physical semantics in 1.1.0

Physical semantics are native **assembly-owned construction contracts**, not a parallel robotics state machine and not a second source of truth. The following identities remain semantically distinct even when a simple asset maps them one-to-one:

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

Canonical physical frames use meters plus normalized canonical quaternion `[x,y,z,w]`. Backend order, array position, motor index, device index, Euler convention, and serialization order never become semantic identity.

The physical stack covers:

- rigid-body mass, center of mass, inertia, and frame binding;
- visual-independent collision semantics and filtering;
- typed articulation and link/joint topology;
- mechanism topology and explicit transmission mappings for coordinate, velocity, and effort spaces;
- actuator capability distinct from joint limits;
- controller profiles distinct from actuator source truth;
- optional runtime endpoint/device/bus/index calibration distinct from canonical identity;
- digest-bound reusable physical asset bundles;
- representation-capacity preflight, one-way export, normalization, and canonical-versus-backend validation;
- exact field-scoped declared divergence that never mutates canonical construction state.

The representation flow is intentionally one-way from canonical construction semantics:

```text
canonical physical construction
        ├──> backend representation A ──> normalized semantic view A
        └──> backend representation B ──> normalized semantic view B
                         │
                         └── canonical-versus-normalized validation
```

Backend A is never promoted into truth for backend B. Equivalent quaternion sign/component order, translation units, or equivalent Euler conventions normalize before comparison. Representable undeclared differences remain `DRIFT`; unsupported semantics remain explicit `LOSSY`; insufficient authority remains `UNRESOLVED`; broken invariants remain `INVALID`.

## Scoped physical readiness

RefAs 1.1.0 adds opt-in readiness claims without weakening visual/source-fidelity authority:

- `articulated-ready` — applicable link/joint articulation obligations are closed;
- `simulation-ready` — required dynamics/collision and applicable physical semantics are closed;
- `control-ready` — simulation obligations plus applicable actuator/controller evidence are closed;
- `runtime-ready` — control obligations plus current runtime binding/calibration are closed.

Physical readiness is not inferred from a valid candidate transaction alone. `refas.physical-claim-evidence/v1` must validate against the **current live P10–P15 chain**. If a claim relies on a declared backend divergence, the exact current P15 authority and P14 drift binding are revalidated before P16 evidence may pass. Public generic certification cannot bypass that typed preflight.

Higher-level edits remain scoped: changing controller tuning or runtime indices does not retroactively invalidate an unchanged lower simulation claim or unrelated visual reconstruction evidence.

## What 1.1.0 does not claim

Typed physical semantics do not manufacture physical truth. RefAs can preserve evidence-backed `observed` values and can construct explicit `inferred` or `engineered` values when their basis permits it, but it does not identify unseen manufacturer internals or guarantee calibrated real-world mass, inertia, friction, collision, actuator, controller, runtime, scale, or material composition without supporting evidence.

A `simulation-ready` or `runtime-ready` result means the selected claim obligations close against the current typed evidence and representation chain. It does **not** mean every parameter was measured from the real object. See [Known limitations](docs/known-limitations.md).

## Integrated physical fixture

The P17 integration fixture closes the 1.1.0 physical-semantics implementation plan with a domain-neutral coupled parallel 2-DOF assembly composed from reusable modules. It exercises fixed attachment interfaces, virtual joints, rigid dynamics, collision proxies, a nonlinear transmission, actuation, control, runtime binding, two independent backend projections, normalization, deliberate semantic drift, live divergence authorization, and `runtime-ready` certification.

The final positive path is intentionally not an all-equivalent shortcut:

```text
P14 DRIFT
  → exact live P15 DECLARED_DIVERGENCE
  → P16 runtime-ready evidence
  → typed live preflight
  → generic certification decision
```

Substituted or stale authority fails closed. Repeated runs reproduce the same P15-bound integration evidence digest. See [Integrated physical fixture](docs/integrated-physical-fixture.md).

## Quick start

Requirements:

- Node.js 20 or newer
- Python 3 with Pillow and NumPy for evidence views, portable integrity rendering, and the independent PBR fallback

```bash
python -m pip install --requirement requirements.txt
npm test
npm run check
node skills/refas/scripts/refas.mjs --help
node skills/refas/scripts/refas-host.mjs --help
```

The executable runtime lives inside the distributable skill. Tests and examples import that same code; there is no second runtime implementation to drift.

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
├── .github/                     issue forms, PR contract, CI, and release workflow
├── demo/                        dependency-free release showcase
├── skills/refas/                distributable skill and canonical runtime
├── schemas/                     public JSON Schemas
├── tests/                       unit, integration, adversarial, and regression tests
├── examples/                    reproducible reconstruction/render/assembly dogfoods
├── tools/                       repository and release audits
└── docs/                        architecture, physical closure, quality, recovery, and claim contracts
```

## Verification commands

```bash
npm test
npm run test:python
npm run check
npm run dogfood
npm run dogfood:parameter-fit
npm run dogfood:pbr
npm run dogfood:hard-surface
npm run dogfood:assembly
node --test tests/integrated-physical-fixture.test.mjs
npm run release:audit
```

See [Architecture](docs/architecture.md), [Physical semantics plan](docs/physical-semantics-plan.md), [Integrated physical fixture](docs/integrated-physical-fixture.md), [Candidate transactions](docs/candidate-transactions.md), [Claim certification](docs/claim-certification.md), [Known limitations](docs/known-limitations.md), and [Release criteria](docs/release-criteria.md).

Contributions follow the [Issue and Pull Request governance contract](docs/github-governance.md): one runtime capability and hierarchy scope or one explicit repository boundary, one primary Issue, evidence-bound review, and an explicit recovery point.

## License

MIT
