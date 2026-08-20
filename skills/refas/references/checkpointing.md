# Checkpoints and bounded edits

## Checkpoint meaning

A checkpoint is an immutable, content-addressed record of a trustworthy state. It contains:

- semantic capability and hierarchy scope;
- parent checkpoint;
- reason the state is trustworthy;
- artifact paths, sizes, and SHA-256 values;
- accepted claims and gate results;
- optional owner metadata.

Checkpoint files live under `.refas/checkpoints/`. Exact artifact bytes live in the content-addressed `.refas/objects/` store. Restoring materializes those bytes at their recorded project-relative paths, changes the active head, invalidates semantic dependents, and preserves all history.

A checkpoint is rejected when an artifact is missing, its size or SHA-256 does not match, its real path escapes the project through traversal or a symlink, a prerequisite capability is absent, or any declared gate is not `pass`.

## When to checkpoint

Commit after a capability passes its local gates and before:

- changing a closed silhouette or surface network;
- re-registering a child;
- replacing a model specification;
- tuning camera and geometry together;
- changing a source or evidence recipe;
- starting a risky appearance or topology pass.

Do not checkpoint every keystroke. Checkpoint states worth returning to.

## Bounded edit transaction

One transaction has:

1. a baseline checkpoint;
2. one owner capability and one scope;
3. one testable intent;
4. protected metrics;
5. exactly one direct candidate checkpoint;
6. before/after evidence and findings;
7. a deterministic decision.

## Decision semantics

| Decision | Meaning | Active head |
|---|---|---|
| `KEEP_EDIT` | objective improved without protected regression | candidate |
| `ROLLBACK_EDIT` | new hard failure, protected regression, or introduced blocker | baseline |
| `REOPEN_OWNER` | existing blocker is localized and routable | route-selected pre-owner checkpoint |
| `REQUEST_REVIEW` | evidence is insufficient or utility is tied | baseline |
| `MAY_CLOSE` | every declared closure gate passes | candidate |

Never delete a rejected candidate. It is evidence of what was tried.

## Explicit restore

Use `restore --checkpoint <id> --reason <reason>` when the desired trustworthy state is already known. The runtime restores the target checkpoint's exact artifact bytes and identifies the first invalidated capability.

A repair route may instead identify the nearest checkpoint before the finding owner. Use `report-finding` to apply that route and artifact restore to project state; `route` alone is a non-mutating preview.

Use `abort-edit` when an edit cannot be evaluated. It restores the baseline even if no candidate checkpoint exists. Use `resume` at every handoff or fresh turn. Its answer is authoritative for the next safe capability, scope, and action.

## Audit

`audit` verifies checkpoint content digests, parent lineage, content objects, active-head artifact bytes, source identity, transaction structure, and certificate binding. An invalid audit is a closure blocker.
