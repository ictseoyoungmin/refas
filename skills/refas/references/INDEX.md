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

## Public discovery lookup

After `references/GRAPH.json` routes the active work, use the installed CLI when the exact executable surface is needed:

```text
refas describe node <instruction-node-id>
refas describe capability <runtime-capability-id>
```

The node form returns that instruction node's routing identity, prerequisites, runtime-capability projection, closure effects, and full current public interface descriptors. The capability form accepts only one of the 11 canonical runtime capability IDs and aggregates owning nodes in graph order. These namespaces are intentionally explicit: `refas describe <id>` does not guess whether an ID is an instruction node or a runtime capability, and routing-only owner tags such as `control` are not runtime capabilities.

### Observation evidence lookup

| Input situation | Agent command / contract |
|---|---|
| Single image, sheet, separate photos, ZIP | `refas evidence --spec evidence-request.json --out reviews/observations --reuse` |
| Only question-driven edge/gradient/contrast aids | Per-view `question`, `decisionTarget` and selected `analyses` in `assets/templates/evidence-request.json` |
| Inspect findings / link changed GLB bytes / prune no-benefit files | `refas evidence --assess evidence-utility-decisions.json --out reviews/observations --prune` |
| Previously published CLI compatibility | `refas evidence --image reference.png --out DIR --scope ID [--roi x,y,w,h]` preserves legacy image files and `refas.evidence-manifest/v1`; new tasks use `--spec` |

The explicit `--image` compatibility mode produces the historical eight output images and manifest for existing integrations. New agent work uses the selection-based `--spec` mode.\n\nThe new mode retains every source/ZIP member hash and view ROI in a
`derived-observation-aid-only` manifest. **It cannot assert registration
or grant source-fidelity PASS** across images that happen to share a view name.
Load `references/observation.md` for the precise format and safety contract.

### Rendering workflow lookup

| Situation | Installed command | Node / interface |
|---|---|---|
| Fast edited-GLB shape/material view without full PBR | `node scripts/refas.mjs preview-pbr --glb candidate.glb --frame frame.json --out renders/preview --views hero,side --reuse` | `appearance/iterative-pbr-preview` |
| One combined human-facing board from real render evidence | `node scripts/refas.mjs review-board --portable renders/portable --pbr renders/pbr --clay renders/clay --out reviews/combined.png` | `validation/combined-review-presentation` |

These commands provide **no visual PASS authority**: preview writes only a
`preview-only` manifest, and the combined board is `presentation-only`.
Final neutral-clay and appearance reports still require all eight current views.
See `references/appearance.md` and `references/validation.md` for gate use.

### Agent-facing workflow lookup (existing operations)

The released CLI provides read-only navigation and diagnostics. Use the canonical
graph's `workflow/agent-next`, `failure-routing/agent-diagnose`, and
`validation/agent-validate-source-bound` interfaces; the registered command
descriptors and public-library exports are discoverable through `describe node`.

| Situation | Installed-skill command | Canonical node |
|---|---|---|
| Start or resume a project, select the next owner/scope | `node scripts/refas.mjs next --root PROJECT` | `workflow` |
| Inspect an existing typed finding without mutating the project | `node scripts/refas.mjs diagnose --root PROJECT --finding FINDING.json` | `failure-routing` |
| Inspect current asset's existing QA blockers and owner/evidence | `node scripts/refas.mjs diagnose --root PROJECT --asset PROJECT/candidate.glb` | `failure-routing` |
| Evaluate strict source-bound QA of exact current GLB | `node scripts/refas.mjs validate --root PROJECT --asset PROJECT/candidate.glb` | `validation` |

`next` follows `resumeProject`, `diagnose` previews an existing finding
route or existing `verifySourceBoundObject` report, and `validate` uses that
same canonical source-bound QA with exit code 2 when `BLOCKED`. `diagnose`
is informational and can return a blocked report with exit 0; never treat its
exit status as fidelity approval. Neither command issues certificates, repairs,
mutates geometry, or weakens final Host handoff. Run expensive source-bound
verification at genuine candidate/closure transitions, not after every minor
construction operation.

### Canonical standalone templates

Most executable operation inputs are exposed through the interface catalog returned by `describe`. The following standalone templates remain public convenience/contracts and are routed explicitly so workers never need to guess filenames:

| Template | Route |
|---|---|
| `assets/templates/assembly-contract.json` | `references/assembly.md` |
| `assets/templates/closure-gates.json` | `references/checkpointing.md`, `references/claim-certification.md` |
| `assets/templates/evaluation.json` | `references/checkpointing.md` |
| `assets/templates/parameter-fit-plan.json` | `references/parameter-fitting.md` |
| `assets/templates/projection-fit.json` | `references/spatial-reasoning.md`, `references/validation.md` |
| `assets/templates/realized-assembly-input.json` | `references/assembly.md` |
| `assets/templates/realized-projection-input.json` | `references/spatial-reasoning.md`, `references/validation.md` |
| `assets/templates/reference-geometry.json` | `references/observation.md` |
| `assets/templates/relational-structure.json` | `references/relational-structure.md` |
| `assets/templates/semantic-authority.json` | `references/inference-authority.md` |
| `assets/templates/spatial-hypotheses.json` | `references/spatial-reasoning.md` |
| `assets/templates/surface-network.json` | `references/construction.md` |

A standalone template does not override the operation-specific input catalog. When `describe` returns an interface template, that interface metadata is authoritative for the executable minimum input.


### Final transfer contract discovery

`node scripts/refas.mjs audit --root PROJECT` evaluates the existing
project audit. `node scripts/refas.mjs verify --root PROJECT --asset
PROJECT/candidate.glb` checks exact source-bound QA and may return
`BLOCKED`.

The optional Host interface has two **existing** modes:

- `node scripts/refas-host.mjs handoff --root PROJECT`: default
  `draft-transfer`, for working-asset transfer only
- `node scripts/refas-host.mjs handoff --root PROJECT --profile
  source-bound-object`: independently replays strict final authorization,
  and refuses when current source-photo semantics are `INSUFFICIENT`

Neither `audit` nor draft transfer grants source fidelity. Discover the
public modes via `describe node validation` and
`describe node host-integration`.

## Minimal entry and conditional control reading

After this router, read `references/workflow.md` for current capability
ownership and construction order. The remaining control guides are loaded
**at the moment their operations are needed**:

- Before checkpoint creation, bounded edits, restore or abort:
  `references/checkpointing.md`
- Before persisting a typed finding, reopening an owner or recovering a
  blocked project: `references/failure-routing.md` and
  `references/checkpointing.md`

Never skip these guides merely because they were not required at first load.
Actual mutation/recovery authority is still enforced by the installed
runtime; progressive reading cannot waive a gate.

### Route by intended asset work

| Work profile | Start with | Additional guide only when required |
|---|---|---|
| Static reference object | `references/observation.md`, `references/spatial-reasoning.md`, `references/construction.md` | `references/assembly.md` for multiple parts, `references/validation.md` for early clay comparison |
| Organic or character form | Static form route plus `references/organic-articulated-construction.md` | Owner-local fit, cage, rig/attachment contract only where realized |
| Mechanically articulated object | Static form route plus `references/assembly.md` and `references/contracts/articulation-clearance.md` | Link/joint, actuation or transmission contracts only when the actual mechanism uses them |
| Physical/control/runtime target | Mechanical route plus relevant physical identity, dynamics, control, representation and binding leaves | `references/contracts/physical-claims.md` only for requested claims; no invented internal property evidence |
| Defect, reopen, or failed inspection | `references/failure-routing.md` + `references/checkpointing.md` | Responsible owner leaf, current source and GLB evidence |
| Finalization/handoff | `references/validation.md`, `references/candidate-transactions.md`, `references/claim-certification.md` | `references/realized-contact-support.md` when required; `references/host-integration.md` for actual host handoff |

Rendering shape early is independent of finishing materials.
For a small callable control-cage modeling example, see
`scripts/subdivision-cage-demo.mjs`; it demonstrates geometry
generation, **not** source-fidelity closure or an identity-bearing permit.

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
