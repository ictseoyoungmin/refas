# Workflow and ownership

## Capability graph

RefAs uses semantic capabilities. Each capability owns its decisions, artifacts, gates, and repair findings.

| Order | Capability | Owns | Trustworthy output |
|---:|---|---|---|
| 1 | `source-intake` | identity and authority of input | source manifest with SHA-256 |
| 2 | `visual-hierarchy` | whole-to-feature decomposition | hierarchy with contextual ROIs |
| 3 | `visual-observation` | visible facts and uncertainty | evidence-bound observations |
| 4 | `spatial-hypotheses` | camera, depth, orientation alternatives | ranked hypotheses and falsifiers |
| 5 | `shape-reconstruction` | silhouette, mass, curvature | closed coarse geometry |
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

At the start of every new turn or handoff, run `resume --root <project>`. If it reports an active transaction, finish or abort that transaction before doing anything else. If it reports invalidated capabilities, repair the first named capability only. If it reports review-required or blocked, stop mutation and resolve evidence or ownership.

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

## Stop conditions

Stop and request review when:

- the source image or required attachment is unavailable;
- evidence cannot distinguish competing high-impact hypotheses;
- a blocker has no declared owner;
- actual rendering cannot run;
- a closed child would have to be silently regenerated;
- a score is low but the defect is not localized;
- the candidate is not demonstrably better and not demonstrably worse.

Do not convert these states into a pass by lowering thresholds.

## File layout for a reconstruction

```text
project/
  source/                 raw references and source manifest
  evidence/               derived observation aids and manifests
  model/                  hierarchy, observations, hypotheses, specifications
  assets/                 GLB and reusable child assets
  renders/                actual multiview outputs and review boards
  reviews/                findings, metrics, and closure gates
  .refas/                 immutable checkpoints and decisions
```

Use semantic names. Iteration history belongs in checkpoints, not filenames or schemas.
