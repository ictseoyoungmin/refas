# Workflow and ownership

## Capability graph

RefAs uses semantic capabilities. Each capability owns its decisions, artifacts, gates, and repair findings.

| Order | Capability | Owns | Trustworthy output |
|---:|---|---|---|
| 1 | `source-intake` | identity and authority of input | source manifest with SHA-256 |
| 2 | `visual-hierarchy` | whole-to-feature decomposition | hierarchy with contextual ROIs |
| 3 | `visual-observation` | visible facts and uncertainty | evidence-bound observations and source-space reference geometry |
| 4 | `spatial-hypotheses` | camera, depth, orientation alternatives | ranked hypotheses, falsifiers, and model-to-source projection evidence |
| 5 | `shape-reconstruction` | silhouette, mass, curvature | closed coarse geometry with current projection fit |
| 6 | `surface-topology` | seams, cells, relief, boundary network | projection-anchored surface model |
| 7 | `assembly` | parent/child frames and physical relations | registered immutable children |
| 8 | `appearance` | color, roughness, finish | evidence-supported materials |
| 9 | `rendering` | camera and actual render integrity | repeatable multiview render set |
| 10 | `visual-critique` | localized visual findings | typed finding ledger |
| 11 | `whole-object-certification` | release closure | current, complete gate record |

Dependencies are implemented in `scripts/lib/ownership.mjs`. Repair routing invalidates the owner plus all transitive dependents.

## Work-unit rule

Keep exactly one pair active:

```text
active work = one capability × one hierarchy scope
```

Examples: `shape-reconstruction × whole`, `surface-topology × upper-shell`, or `assembly × center-fastener`.

Do not mix observation cleanup, camera tuning, geometry edits, and material polish in one candidate. A bounded edit must be attributable to one owner.

This rule limits simultaneous work; it does not authorize skipping dependencies.
During shape reconstruction, `shape-reconstruction × whole` remains the only
closable shape scope until the whole-shape dependency barrier passes. The
barrier requires current registered evidence for whole silhouette, major
landmarks, principal sections, curvature transitions, and coarse negative
spaces. Lower region, part, subpart, joint, and feature scopes may be observed
or sketched beforehand, but they cannot receive trustworthy geometry closure.

At the start of every new turn or handoff, run `resume --root <project>`. If it reports an active transaction, finish or abort that transaction before doing anything else. If it reports invalidated capabilities, repair the first named capability only. If it reports review-required or blocked, stop mutation and resolve evidence or ownership.

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

Before `shape-reconstruction × whole` may close when a reference-geometry artifact exists:

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
- the candidate is not demonstrably better and not demonstrably worse.

Do not convert these states into a pass by lowering thresholds.

## File layout for a reconstruction

```text
project/
  source/                 raw references and source manifest
  evidence/               derived observation aids and manifests
  model/                  hierarchy, observations, reference geometry, hypotheses, specifications
  assets/                 GLB and reusable child assets
  renders/                actual multiview outputs and review boards
  reviews/                projection fits, findings, metrics, and closure gates
  .refas/                 immutable checkpoints and decisions
```

Use semantic names. Iteration history belongs in checkpoints, not filenames or schemas.
