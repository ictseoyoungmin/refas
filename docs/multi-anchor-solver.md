# Multi-anchor rigid solver

`MULTI_ANCHOR` means a dependent must satisfy two or more owner-side attachment frames at the same time. RefAs solves those constraints as one rigid-body fit. It does not collapse the relation to one owner, scale the dependent, or silently deform its mesh.

## Intended use

A pair of glasses is the canonical example:

```text
nose bridge surface ───────┐
left ear contact surface ──┼─ MULTI_ANCHOR → glasses
right ear contact surface ─┘
```

Each owner contributes a current `refas.surface-anchor-set/v1` frame. The glasses provide matching subject-local anchor frames. The solver finds one subject world transform that best aligns all declared correspondences.

## Rigid-only fit

The solver uses weighted point correspondences plus optional tangent/normal orientation correspondences. It estimates only rotation and translation.

- scale is forbidden;
- non-rigid subject deformation is forbidden;
- every owner declared by the attachment relation must be represented in the plan;
- every owner world frame is supplied explicitly at solve time;
- current surface anchors are validated against the exact attachment graph and current surface descriptors.

The fitted pose is therefore a candidate rigid pose, not permission to alter the subject geometry.

## Feasibility

Every constraint declares local position and orientation tolerances, and the plan declares a maximum weighted RMS position error. The report is `SOLVED` only when all required tolerances pass.

If the owner anchors cannot be satisfied by one rigid pose, the report is `INFEASIBLE` and `eligibleForRealization` is false. The approximate best-fit pose remains diagnostic evidence, but downstream realization must not apply it as a valid attachment solution.

This distinction prevents a reconstruction from making glasses longer, narrowing their temples, or otherwise changing geometry merely to hide an attachment contradiction.

## Shape edits and retessellation

Owner geometry may change upstream. Surface anchors must be rebound first through `refas.surface-anchor-rebind/v1`. The multi-anchor solver then consumes that current anchor set.

For example, lowering the nose while keeping both ears fixed may cause the glasses to translate and rotate slightly. If the rigid frame can still satisfy all three contacts within tolerance, the result is `SOLVED`. If the nose moves so far that the existing glasses cannot reach all contacts rigidly, the result is `INFEASIBLE` and the appropriate upstream geometry or attachment assumption must reopen.

## Public artifacts

- `refas.multi-anchor-plan/v1` binds the exact attachment relation, subject-local anchor frames, owner coverage, weights, tolerances, and rigid-only policy.
- `refas.multi-anchor-report/v1` binds the current surface-anchor set and owner world frames, reports the rigid fit, per-anchor residuals, feasibility, and exact digest.

Neither artifact mutates GLB mesh bytes or authorizes closure. Graph-wide ordering, target realization, and structural/contact validation remain later assembly operations.
