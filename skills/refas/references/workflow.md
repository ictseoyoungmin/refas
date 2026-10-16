# Workflow and ownership

## Capability graph

RefAs uses semantic capabilities. Each capability owns its decisions, artifacts, gates, and repair findings.

| Order | Capability | Owns | Trustworthy output |
|---:|---|---|---|
| 1 | `source-intake` | identity and authority of input | source manifest with SHA-256 |
| 2 | `visual-hierarchy` | whole-to-feature decomposition | hierarchy with contextual ROIs |
| 3 | `visual-observation` | visible facts and uncertainty | evidence-bound observations and source-space reference geometry |
| 4 | `spatial-hypotheses` | camera, depth, orientation alternatives | ranked hypotheses, falsifiers, relational structure, and semantic authority |
| 5 | `shape-reconstruction` | silhouette, mass, curvature, whole-system relation realization | closed coarse geometry with current projection and relational fit |
| 6 | `surface-topology` | seams, cells, relief, boundary network | projection-anchored surface model |
| 7 | `assembly` | parent/child frames and physical relations | registered immutable children |
| 8 | `appearance` | color, roughness, finish | evidence-supported materials |
| 9 | `rendering` | camera and actual render integrity | repeatable multiview render set |
| 10 | `visual-critique` | localized visual findings | typed finding ledger |
| 11 | `whole-object-certification` | release closure | current, complete gate record |

Canonical capability dependencies are exposed through the public `CAPABILITY_DEPENDENCIES`/`CAPABILITY_ORDER` contract from `scripts/lib/index.mjs`. Repair routing invalidates the owner plus all transitive dependents.

Relational structure and inference authority are cross-cutting Core contracts, not extra capability owners. They are created and revised inside the existing observation/spatial/shape owners so the capability graph does not become a parallel runtime architecture.

## Agent-facing work navigation (read-only)

Before starting a new work unit, query the existing project state through:

```bash
node scripts/refas.mjs next --root PROJECT
```

This is the registered `workflow/agent-next` interface. It wraps
`resumeProject`, returning the safe checkpoint, responsible capability,
scope, `nextAction`, and a discoverable existing CLI invocation. Inspect
the current capability's executable contract with
`node scripts/refas.mjs describe capability <runtime-capability-id>`.
`next` is advice about state, **not** a new capability, construction
executor, gate verdict, or source-fidelity certificate.

Construct or edit actual geometry in the active scope, capture real renders and compare them to the source. For a detected defect, use `diagnose --finding` from `references/failure-routing.md`; inspect candidate QA through `diagnose --asset` or strict `validate --asset` in `references/validation.md`. Use the canonical `report-finding` operation to reopen state.

## Interpreting agent next actions

`refas next` returns `workPlan.kind` and `workPlan.nextStep` for every
known `resumeProject` action. Only `kind: command` may offer an executable
`invocation`; the `construction` and `review` kinds point to the existing
instruction node and evidence to produce, not to a made-up command.
`terminal` (`DONE`) offers **no new command**: a current generic certificate
is not independently verified source-bound handoff. `CERTIFY` invokes the
existing generic `certify` operation, still subject to its real obligations.
If the action descriptor is unknown, the wrapper refuses to fabricate a step.

For `REWORK_SHAPE_VOLUME`, perform a real owner-local edit and rerender; for
`GATHER_SPATIAL_EVIDENCE`, observe or capture the missing side/top evidence.
`REPORT_RESEMBLANCE_FINDINGS` requires real typed findings from the current
barrier; `REQUEST_VISUAL_REVIEW` requires substantive source/render
observations. Query `describe node <instructionNode>` as needed.
No advisory step is a new source-fidelity gate or repair authorization.

## Work-unit rule

Keep exactly one pair active:

```text
active work = one capability × one hierarchy scope
```

Examples: `shape-reconstruction × whole`, `surface-topology × upper-shell`, or `assembly × center-fastener`.

Do not mix observation cleanup, camera tuning, geometry edits, and material polish in one candidate. A bounded edit must be attributable to one owner.

Within `shape-reconstruction × one scope`, an evidence-bound parameter fit may jointly move multiple geometry values. Its trial ledger is an inner search, not multiple active work units or candidate checkpoints. Cross-owner camera, assembly, appearance, and lighting values remain prohibited in the same plan.

High-impact fitting remains owner-local: camera candidates belong to `spatial-hypotheses`, parent-local pose variables to `assembly`, geometry variables to `shape-reconstruction`, material variables to `appearance`, and illumination/background variables to `rendering`. The project coordinator may alternate these stages and record exact digests, but has no gate or finding-owner authority.

The work-unit rule never means that a local scope may close independently of unresolved whole-system premises that are material to that scope. A local eye, fastener, branch, joint, panel, or handle can be observed or sketched while an applicable macro structure remains open, but trustworthy lower-scope geometry closure is downstream of the relational barrier when such macro/identity whole-system obligations are active.

## Conditional structure and edit rules

**Core:** build actual shape before specialized structure. The eleven capability owners and one-capability × one-scope work rule above remain unchanged. Read only the following contract(s) when the observed subject or selected claim needs them; detailed equations, schemas and invalidation rules live in those canonical leaves, not in this always-read workflow.

| Trigger | Required rule and authoritative route |
|---|---|
| Macro/identity whole-system relations materially affect a construction decision | Record observed relationships and alternative hypotheses using `references/relational-structure.md`, `references/inference-authority.md`, and **conditionally** `references/whole-system-relational-barrier.md`. Do not invent a relation just to satisfy a gate; source-bound final claims retain their own independent obligations. |
| Modify semantic shape, pose or appearance | Apply `references/contracts/canonical-edit-boundary.md`. GLB normally records a realization, not editable shape authority; shape edits rebuild from construction state. Allow only bounded transform-specific direct edits where explicitly permitted. |
| Child mounting, articulation or reuse is part of the subject | Use `references/contracts/attachment-semantics.md` first. Explicit modes (`FREE`, `FUSED`, `RIGID_FOLLOW`, `SURFACE_OFFSET`, `MULTI_ANCHOR`, `ARTICULATED`, `SUPPORTED_CLEARANCE`) preserve relation meaning rather than inferring it from proximity. |
| Intentional same-body fusion | Apply `references/contracts/logical-fusion.md` before physical mesh fusion; retain original semantic member identities. |
| Rebuild a surface-anchored attachment | Use `references/contracts/surface-anchor-frames.md`. Rebind semantic patch/triangle/barycentric anchors within declared bounds; never reuse stale triangle indices silently. |
| One-owner dependent transform | Use `references/contracts/attachment-follow.md` to reevaluate current owner frame and required contact/offset. |
| Multi-owner contact | Fit all declared anchors and preserve tolerances using `references/contracts/multi-anchor-solver.md`. |
| Moving joint or supported clearance is required | Apply `references/contracts/articulation-clearance.md` for explicit frames/axes, range and actual clearance. Do not claim observed mechanics from a hidden view. |
| Multiple dependent attached entities must move together | Use `references/contracts/attachment-propagation.md` and required realized-contact evidence. Fail closed on cycles, missing external frames, incompatible relations and stale bindings. |

An ordinary static decorative prop does not need the entire attachment, transmission, actuator or runtime chain. Physical-readiness/certification claims remain opt-in and enforce their own conditional finalization route through `references/INDEX.md`. Never treat a successful GLB mesh or generic project audit as independently proven resemblance.
## Reference-geometry and projection-fit barrier

When visible geometry materially constrains reconstruction, the whole-object path is:

```text
raw source
  -> refas.reference-geometry/v1
  -> spatial/camera hypothesis + 3D candidate
  -> refas.projection-fit/v1
  -> typed projection findings
  -> repair routing or visual review
```

`refas.reference-geometry/v1` belongs to observation. It contains normalized source-space anchors, chains, axes, contacts, occlusions, negative spaces, contours, and dimensions. It never contains reconstructed depth or model-space coordinates.

`refas.projection-fit/v1` belongs to the model-to-source comparison boundary. It binds explicit 3D/model points projected by a declared camera hypothesis back to the source geometry and records residuals. It does not mutate geometry and cannot certify visual fidelity.

**Non-fixture source-bound admission is fail-closed (P0b2a).** Before
`shape-reconstruction × whole` can authorize any accepted
`surface-topology` or later detail checkpoint, the upstream
`visual-observation` must have canonical raw-source-bound
`refas.reference-geometry/v1` with visible macro evidence, and the
frozen shape checkpoint must contain **exactly one**
`refas.realized-projection/v1` built from a declared camera,
the current original source and the actual shape GLB. Omitting
this camera/GLB proof is `REVIEW_REQUIRED`, not implicit
`NOT_APPLICABLE`. The installed host reloads its frozen
content-addressed GLB and replays the camera projection at transition,
even when a separately authorized later candidate changes the live GLB.
All source-visible macro anchors must be registered.

**The camera hypothesis must precede shape construction (P0b2b1).**
The upstream `spatial-hypotheses` checkpoint must persist a canonical
`refas.spatial-hypothesis-set/v1` with at least two original-source-cited,
falsifiable camera alternatives. A selected camera may authorize
downstream detail only after competing interpretations are explicitly
resolved and the registered GLB projection carries the exact selected
hypothesis ID **and normalized camera parameters**. Missing or
unresolved selection is `REVIEW_REQUIRED`; a selected/registered camera
mismatch is `REWORK`. Agent status labels and raw-source path citations
are still not independent image-truth verification; trustworthy
source-visible whole silhouette, negative-space and occlusion comparison
remains required before Reference Fidelity closure. Large discrepancies
or source-visible macro anchors outside the selected camera frame
block accepted downstream detail.

Before `shape-reconstruction × whole` may admit accepted detail:

1. every `macro` anchor required by the source geometry has a semantic model binding;
2. the projection fit is valid and digest-bound to the current source, camera hypothesis, and model binding;
3. material projection disagreement has been converted to typed findings with evidence;
4. no blocking projection finding remains unresolved;
5. registration is used only for frame placement and is not substituted for shape agreement.

A bad residual may create evidence for a typed finding, but the number itself does not choose rollback. `findingsFromProjectionFit` localizes supported mismatch categories, and the existing ownership router decides which upstream capability reopens.

At visual closure, when a projection fit exists for the reviewed scope, use the projection-aware visual-review path. A material geometric mismatch is injected as an unresolved blocking finding and therefore vetoes a requested PASS. A good projection fit does not grant PASS; the reviewer still needs current source-bound visual evidence and substantive observation summaries.

## Capability exit sequence

For each capability:

1. Declare the active scope and testable objective.
2. Load only its required evidence and owner reference.
3. Preserve the previous trustworthy checkpoint.
4. Produce the smallest artifact that answers the objective.
5. Render or inspect the artifact with the capability's gates.
6. Record typed findings and explicit unknowns.
7. If no blocker remains, commit a checkpoint with artifact digests.
8. Write a compact handoff capsule: scope, accepted claims, open ambiguities, checkpoint ID, and next owner.

Use `assets/templates/handoff-capsule.json`. The capsule is a human/agent continuity aid; `resume` remains the executable state authority.

For `shape-reconstruction`, step 7 additionally requires a valid
`refas.construction-quality/v1` identity-bearing record. A blockout may be
rendered and compared, but it remains an exploratory artifact rather than a
closed shape checkpoint. When source-space reference geometry is present, the
same checkpoint also requires the current projection-fit barrier above; passing
construction-quality alone cannot override unresolved macro reprojection error.
Before a lower-scope shape checkpoint that depends on declared macro/identity
whole-system relations is treated as trustworthy, the current
`refas.whole-system-relational-barrier/v1` must also be `PASS`; local detail
cannot compensate for unresolved or forbidden applicable upstream relations.

## Stop conditions

Stop and request review when:

- the source image or required attachment is unavailable;
- evidence cannot distinguish competing high-impact hypotheses;
- a blocker has no declared owner;
- actual rendering cannot run;
- a closed child would have to be silently regenerated;
- a score is low but the defect is not localized;
- required macro reference geometry has no semantic model projection;
- a projection mismatch is material but cannot yet be localized to a typed finding;
- an applicable macro/identity whole-system relation remains unresolved;
- semantic authority is `unknown` where positive construction is required and no inference/engineering basis has been chosen;
- semantic authority is `forbidden` under current contradiction or hard constraint;
- the candidate is not demonstrably better and not demonstrably worse.

Do not convert these states into a pass by lowering thresholds or polishing downstream detail.

## File layout for a reconstruction

```text
project/
  source/                 raw references and source manifest
  evidence/               derived observation aids and manifests
  model/                  hierarchy, observations, reference geometry, relational structure, authority, hypotheses, specifications
  assets/                 GLB and reusable child assets
  renders/                actual multiview outputs and review boards
  reviews/                projection fits, relational checks/barriers, findings, metrics, and closure gates
  .refas/                 immutable checkpoints and decisions
```

Use semantic names. Iteration history belongs in checkpoints, not filenames or schemas.