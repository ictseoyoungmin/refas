# RefAs instruction router

This file is the canonical progressive-load router for the installed RefAs skill. `SKILL.md` enters the instruction graph here. The physical installation boundary is the directory that contains this file's parent `references/` directory: normally `skills/refas/` in the repository, but Claude/Codex may install only that directory.

`references/GRAPH.json` is the machine-readable semantic graph for this router. It records every reference leaf's routing owners, canonical runtime-capability projection, hard and conditional prerequisites, authority, closure effects, public interface operations, finding ownership, deprecated finding compatibility, and real-source certification prerequisites. `runtimeCapabilities` contains only the canonical checkpoint/repair capabilities; routing tags such as `control` remain in `owners` but never become runtime capabilities. Each node's `interface.interfaces[]` names the existing public CLI and/or `scripts/lib/index.mjs` operation boundary. Prose may explain that graph but must not contradict it.

## Installation-root invariant

Every executable instruction and runtime dependency must resolve inside the installed skill root.

- `references/...`, `assets/...`, and `scripts/...` resolve from the **installed skill root**.
- `references/contracts/...` is the authoritative home for detailed agent-facing contracts.
- Repository-root `docs/`, `schemas/`, `tests/`, `examples/`, `tools/`, `.github/`, and `package.json` are support-layer resources, never skill execution dependencies.
- `docs/...`, `../` traversal, absolute repository paths, and `skills/refas/...` self-prefixing are forbidden in skill instruction routes.
- Bare sibling Markdown routes such as `parameter-fitting.md` are forbidden; use the canonical `references/...` path.
- `requirements.txt` at the skill root is the canonical Python dependency manifest.

The repository may depend on the skill. The skill must never depend on the repository around it. CI copies `skills/refas/` into an isolated temporary directory and reruns both the installation-boundary verifier and semantic-graph verifier there.

## Always-load control path

Read these before reconstruction work:

1. `references/workflow.md` — capability ownership, dependency barriers, finalization routing, and handoff behavior.
2. `references/checkpointing.md` — recoverable state, bounded edits, rollback, resume, and checkpoint authority.
3. `references/failure-routing.md` — typed findings, repair ownership, invalidation, and fail-closed routing.

## Progressive-load routes

Load only the references needed by the active capability or conditional closure path.

| Work or condition | Reference leaves |
|---|---|
| Source provenance, hierarchy, visible facts | `references/observation.md`, `references/provenance.md` |
| Camera, depth, orientation, competing spatial hypotheses | `references/spatial-reasoning.md` |
| Single-view subject risks billboard/planar collapse or needs a worked example separating source facts from 3D completion | `references/single-view-volumetric-reasoning-example.md` after `references/spatial-reasoning.md` and `references/construction.md` |
| Whole-system proportions, alignments, ordering, planes, volumes | `references/relational-structure.md` |
| Observed vs inferred vs engineered vs unknown vs forbidden authority | `references/inference-authority.md` |
| Transition from macro relational closure to lower-scope hardening | `references/whole-system-relational-barrier.md` |
| Shape/surface construction | `references/construction.md` |
| Evidence-bound parameter search and actual-render trial fitting | `references/parameter-fitting.md` |
| Organic or articulated manufactured form | `references/organic-articulated-construction.md` after `references/construction.md` |
| Parent/child placement, attachment, modular assembly | `references/assembly.md` |
| Explicit q/dq/effort mapping between semantic joint/actuator spaces | `references/contracts/transmission-model.md` after `references/assembly.md` |
| Explicit actuator physical capability and limits | `references/contracts/actuation-model.md` after `references/assembly.md`; also load `references/contracts/transmission-model.md` when the actuator drives a transmission |
| Controller mode, command space, feedback tuning, and controller-side delay | `references/contracts/control-profile.md` after `references/contracts/actuation-model.md` |
| Runtime endpoint/device/bus/index binding and runtime coordinate calibration | `references/contracts/runtime-binding.md` after `references/assembly.md`; also load `references/contracts/actuation-model.md` for actuator targets and articulation contracts for virtual-joint targets |
| Digest-bound packaging of reusable physical modules and exact physical component refs | `references/contracts/physical-asset-bundle.md` after `references/assembly.md`; load P06–P09 leaves when those component types are included |
| Backend representation-capacity preflight and explicit support/approximation/loss classification | `references/contracts/representation-capacity.md` after `references/contracts/physical-asset-bundle.md` |
| One-way canonical physical semantics to backend artifact export | `references/contracts/backend-export.md` after `references/contracts/representation-capacity.md` |
| Backend artifact parsing into backend-independent normalized semantics | `references/contracts/representation-normalizer.md` after `references/contracts/backend-export.md` |
| Canonical-versus-normalized backend semantic comparison with typed equivalence/loss/drift/unresolved/invalid findings | `references/contracts/cross-representation-validation.md` after `references/contracts/representation-normalizer.md` |
| Exact backend-specific divergence authorization over current P14 DRIFT evidence | `references/contracts/divergence-authorization.md` after `references/contracts/cross-representation-validation.md`; also load `references/inference-authority.md` for the required engineered authority |
| Scoped physical readiness evidence for articulated/simulation/control/runtime claims | `references/contracts/physical-claims.md` after `references/contracts/physical-asset-bundle.md` and `references/contracts/cross-representation-validation.md`; also load `references/contracts/divergence-authorization.md` when a claim relies on declared divergence, and `references/claim-certification.md` for final authorization |
| Material identity and finish | `references/appearance.md` |
| Render integrity, registered comparison, visual review, closure evidence | `references/validation.md` |
| Candidate/checkpoint/evidence provenance sealing | `references/candidate-transactions.md` |
| Controlled physical weld/boolean finalization of a logically fused group | `references/physical-fusion.md` |
| Final-GLB contact, support, penetration, and support-root validation | `references/realized-contact-support.md` |
| Claim policy, relational authority floor, claim decision, and final authorization | `references/claim-certification.md` |
| External host sessions, events, operations, review bundles, artifact handoff, and workers | `references/host-integration.md` |
| Canonical edit source/realization boundary | `references/contracts/canonical-edit-boundary.md` |
| Attachment mode semantics | `references/contracts/attachment-semantics.md` |
| Logical fusion before physical fusion | `references/contracts/logical-fusion.md` |
| Surface-relative anchor frames | `references/contracts/surface-anchor-frames.md` |
| Rigid-follow and surface-offset propagation | `references/contracts/attachment-follow.md` |
| Simultaneous multi-owner rigid fitting | `references/contracts/multi-anchor-solver.md` |
| Articulation and supported-clearance semantics | `references/contracts/articulation-clearance.md` |
| Deterministic attachment dependency propagation | `references/contracts/attachment-propagation.md` |

Host integration is conditional infrastructure. It is never a prerequisite for reconstruction, visual closure, or certification. Load `references/host-integration.md` only when an external host or worker boundary is actually being used.

## Conditional finalization and closure chain

Do not create new runtime capabilities for this chain. It is a conditional instruction path inside the existing assembly, validation, and whole-object-certification owners. The exact hard/conditional prerequisite structure is authoritative in `references/GRAPH.json`.

```text
logical fusion is semantically closed
  -> references/physical-fusion.md          (only when physical fusion is justified)
  -> references/realized-contact-support.md (validate the realized final GLB)
  -> references/validation.md               (current render/comparison/review evidence)
  -> references/candidate-transactions.md   (seal exact candidate/evidence provenance)
  -> references/claim-certification.md      (policy-driven final authorization)
  -> whole-object certificate
```

For a real source, final authorization also requires the current relational authority chain:

```text
references/relational-structure.md
  -> references/inference-authority.md
  -> references/whole-system-relational-barrier.md
  -> candidate-bound relational discrepancy
  -> refas.certification-relational-evidence/v1
  -> references/claim-certification.md
```

Physical fusion is optional; if no logical fusion group requires a final weld/boolean operation, skip that leaf but still run the realized structural validation required by the asset's claims. A real-source relational closure is not optional merely because visual review passed.

## Graph invariant

Every Markdown leaf under `references/` must remain reachable from `SKILL.md -> references/INDEX.md`. Every such leaf must also appear exactly once as a node path in `references/GRAPH.json`. A new reference file is incomplete until it is registered in both routing layers. Every routed file must exist inside the copied skill tree.

CI fails when an instruction route escapes the skill, a runtime import escapes the skill, a forbidden `docs/...` route appears, a bare sibling Markdown route appears, the typed semantic graph has unknown owners or dependencies, its hard prerequisite graph cycles, its finding ownership disagrees with runtime `FINDING_OWNERS`, its real-source certification floor is incomplete, or the skill-local dependency manifest is missing. It also fails when a node omits interface metadata, declares runtime capabilities that differ from its canonical runtime owners, points at an implementation module instead of `scripts/lib/index.mjs`, names a public symbol that the installed library does not export, or references a missing skill-local template/instruction/example path.
