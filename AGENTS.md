# RefAs Agent Operating Contract

This file contains stable repository instructions only. Never record the
current Issue number, active branch, checkpoint ID, or temporary work status
here. Query GitHub and the RefAs project state at the start of each turn.

## Authority routing

- `skills/refas/SKILL.md` owns reconstruction execution and reference routing.
- `docs/github-governance.md` owns Issue, Pull Request, review, reopen, and
  release collaboration policy.
- `skills/refas/scripts/lib/ownership.mjs` owns capability order and normalized
  finding ownership.
- The active RefAs project state owns resumption, invalidation, checkpoints,
  and rollback.
- GitHub labels summarize work; they do not override runtime ownership or
  select a rollback point.

## Default GitHub workflow

1. Inspect existing Issues, Pull Requests, reviews, and CI before proposing new
   work. Reuse an existing matching work item.
2. Use the structured Issue form. Keep one runtime capability and hierarchy
   scope, or one explicit non-runtime repository boundary and the `repository`
   scope, plus one testable intent and one recoverable result.
3. Apply exact namespaced labels from `.github/labels.json`. The normalized
   finding category must agree with the canonical owner map.
4. Keep at most one implementation Issue and Pull Request at
   `workflow: active`.
5. Use a semantic feature branch. Do not put attempt numbers, temporary stage
   codes, or status words into product identity.
6. Open one Draft Pull Request that closes exactly one primary Issue. Use the
   repository Pull Request template without removing evidence or recovery
   sections.
7. Require current CI and capability-local acceptance. For visual work, inspect
   raw-reference context and actual renders whole → region → part → subpart →
   feature. A metric PASS cannot clear a visible mismatch.
8. Reopen the owning capability when stronger evidence, an upstream
   representation change, or a visible regression invalidates acceptance.
   Retain rejected candidates as evidence.

## Repository-owner standing authorization

When authenticated as the repository owner and acting only within
`ictseoyoungmin/refas`, the connected maintenance agent has standing
authorization for routine repository management without repeated per-action
confirmation:

- inspect, triage, create, update, close, or reopen Issues;
- manage non-security labels, assignees, comments, and Issue or review state;
- create semantic task branches, stage only paths confirmed by the active
  Issue, commit, and push without force;
- create or update Draft Pull Requests, request reviewers, respond to reviews,
  and resolve threads only after the requested change is present;
- mark a Pull Request ready, rerun failed GitHub Actions jobs, and merge or
  enable auto-merge only when required checks pass, no unresolved review thread
  remains, the primary Issue is satisfied, and no release boundary is crossed.

Standing authorization does not cover force-push, history rewrite, destructive
deletion, tag or Release publication, package-registry publication, repository
visibility or access changes, secrets or Actions-permission changes, security
advisory disclosure, cross-repository writes, or bypassing branch protection.
Those actions require new explicit user authorization. Stop for clarification
when task ownership is ambiguous or unrelated worktree changes overlap the
active scope.

## Required verification

Run the smallest capability-local checks during implementation, then close with:

```bash
npm test
npm run test:python
npm run check
npm run dogfood
npm run release:audit
```

Visual changes also require source-bound BEFORE/AFTER evidence, a split or
overlay comparison, actual diagnostic renders, and an explicit rollback
checkpoint.
