# Failure ownership and repair routing

## Finding contract

```json
{
  "category": "attachment-mismatch",
  "severity": "major",
  "scopeId": "whole.upper-shell.fastener",
  "summary": "The fastener floats above the shell in the grazing view.",
  "evidenceRefs": ["renders/grazing.png"],
  "introducedByEdit": false
}
```

## Owner registry

| Finding category | Owning capability |
|---|---|
| `source-drift` | `source-intake` |
| `context-loss`, `missing-part` | `visual-hierarchy` |
| `observation-unsupported`, `evidence-insufficient` | `visual-observation` |
| `perspective-mismatch`, `depth-mismatch`, `orientation-mismatch` | `spatial-hypotheses` |
| `silhouette-mismatch`, `mass-proportion-mismatch`, `curvature-mismatch` | `shape-reconstruction` |
| `pattern-topology-mismatch`, `relief-mismatch` | `surface-topology` |
| `attachment-mismatch`, `occlusion-mismatch`, `penetration` | `assembly` |
| `material-mismatch`, `finish-mismatch` | `appearance` |
| `camera-mismatch`, `render-integrity` | `rendering` |
| `unroutable-visual-finding` | `visual-critique` |
| `closure-evidence-missing` | `whole-object-certification` |

The executable registry is `scripts/lib/ownership.mjs`. Keep this table synchronized with it.

## Routing algorithm

1. Normalize category, severity, scope, evidence, and optional explicit owner.
2. Reject a blocking finding without an owner as `BLOCKED_UNROUTABLE_FINDING`.
3. Return `REQUEST_REVIEW` for insufficient evidence; evidence gaps do not define a safe rollback.
4. Select the nearest trustworthy checkpoint before the owner capability, preferring a scope ancestor.
5. Reopen the owner.
6. Invalidate the owner and every transitive dependent.
7. Preserve unrelated upstream checkpoints and all rejected candidates.

`route` previews this decision. `report-finding` persists the decision, restores the selected checkpoint's artifact bytes, updates the active head, and records the first invalidated owner. Run `resume` after it; do not infer the repair start from checkpoint names.

## Common routing mistakes

- Do not route `silhouette-mismatch` to rendering because it was first seen in a render.
- Do not route `camera-mismatch` to shape reconstruction until camera alternatives are tested.
- Do not route attachment failure to the closed child when parent registration is wrong.
- Do not use a composite score as a finding category.
- Do not silently assign a blocker to the current capability because it is convenient.

## Adding a category

Add a new category only when its repair authority is unambiguous. Update the executable registry, this reference, router tests, and the ownership audit in one change.
