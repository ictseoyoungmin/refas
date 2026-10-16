# RefAs instruction router

This file is the canonical installed-skill route from `SKILL.md`. The machine-readable `references/GRAPH.json` defines capability ownership, prerequisites, interface descriptors and trust boundaries; prose only routes the active work. Read `references/workflow.md` for the eleven-capability loop and only the relevant reference leaf below.

## Installation boundary and discovery

- Paths resolve inside the installed skill root: `references/...`, `assets/...`, `scripts/...`. Do not use repository-root `docs/`, `schemas/`, `tests/`, `examples/`, `tools/` or `skills/refas/` self-prefixes as installed skill dependencies. No `../` or bare sibling Markdown routes.
- `requirements.txt` at skill root supplies Python dependencies; an installed skill must work without a repository checkout.
- Discover current operations with `node scripts/refas.mjs describe node <instruction-node-id>` or `node scripts/refas.mjs describe capability <runtime-capability-id>`. These lookups expose existing public contracts, not new permissions.

## Minimal work path

| Intent | Call | Result / owner |
|---|---|---|
| Start/resume and choose one owner × scope | `node scripts/refas.mjs next --root PROJECT` | Read-only checkpoint/work routing, see `references/workflow.md` |
| Inspect existing blocked evidence | `node scripts/refas.mjs diagnose --root PROJECT --asset PROJECT/candidate.glb` | Read-only blockers and responsibility, see `references/failure-routing.md` |
| Check recorded project state | `node scripts/refas.mjs audit --root PROJECT` | State consistency, **not** resemblance or readiness |
| Inspect strict source-bound claim coverage | `node scripts/refas.mjs validate --root PROJECT --asset PROJECT/candidate.glb` | Read-only strict coverage; exits 2 if blocked, see `references/validation.md` |
| Render changed material/shape views quickly | `node scripts/refas.mjs preview-pbr --glb candidate.glb --frame frame.json --out renders/preview --views hero,side --reuse` | Non-certifying preview, see `references/appearance.md` |
| Combine existing real render evidence | `node scripts/refas.mjs review-board --portable renders/portable --pbr renders/pbr --out reviews/board.png` | Presentation only, optional `--clay` |
| Handoff a working asset | `node scripts/refas-host.mjs handoff --root PROJECT` | Draft transfer, **not** source proof |
| Request source-bound final handoff | `node scripts/refas-host.mjs handoff --root PROJECT --profile source-bound-object` | Requires independently replayed original-source authority |

Do not treat an `audit PASS`, `DONE`, preview, mesh integrity, or single-view IoU as positive original-photo fidelity. Reuse candidate and frame digests; do not silently promote unobserved geometry.

## Observation aids and input templates

For a specific visual question use `refas evidence --spec evidence-request.json --out reviews/observations --reuse`. Record actual model-decision benefit with `refas evidence --assess evidence-utility-decisions.json --out reviews/observations --prune`; both route through `references/observation.md`. Old `--image` mode is retained for compatibility, not a recommended default. Derived images are observation aids only, never camera registration or approval.

Use only the applicable template under `assets/templates/` and the owning reference leaf; examples include `assets/templates/visual-hierarchy.json`, `assets/templates/visual-observation.json`, `assets/templates/construction-quality.json`, `assets/templates/parameter-fit-plan.json`, `assets/templates/pbr-render-report.json` and `assets/templates/visual-review.json`. Checkpoint / failure routing must be read before state changes. For other exact inputs query `describe` instead of preloading a 100-operation catalog.

## Minimal entry and conditional finalization

After this router, load `references/workflow.md`, then one task-specific leaf from the progressive routes below. For a blocked or invalidated state, read both `references/checkpointing.md` and `references/failure-routing.md` before edits. Final `references/claim-certification.md` and `references/candidate-transactions.md` belong to applicable claim closure; an early modeling loop does not require them. Gate requirements remain enforced by the runtime regardless of progressive reading.
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

## Early form assessment versus final authorization

After `construction`, the agent may render the **current real GLB** with
`render-pbr --neutral-clay`, form the `early-resemblance-barrier` and
return to `shape-reconstruction` on a supported defect. This diagnostic
route does **not** require a closed `assembly` or `appearance` stage.
The early barrier belongs to the existing `validation` node for evidence
ownership only; the node's `requires` is the **earliest safe entry point**,
not permission to finalize.

Final whole-object `claim-certification` still requires closed
`assembly`, `appearance`, `validation` and a current candidate
transaction. The runtime's existing per-claim and source-bound checks remain
authoritative and fail closed when independent original-photo evidence is
missing. An early neutral-clay `PROCEED` is never final release approval.

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

The installed instruction graph must be self-contained: do not route agents to repository-only development files, unknown owners, missing capabilities, private implementation modules, missing schemas, or invalid CLI/library symbols. Keep all declared reference leaves, dependencies, and public interfaces consistent with `references/GRAPH.json` and the installed runtime. When a current callable operation changes, update its corresponding graph interface and usage reference together. Release chronology and implementation plans are **not** agent execution prerequisites.
