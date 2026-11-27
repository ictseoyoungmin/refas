# RefAs Agent Operating Contract

This file contains stable repository instructions only. Never record the
current Issue number, active branch, checkpoint ID, or temporary work status
here. Query GitHub and the RefAs project state at the start of each turn.

## Authority routing

- `skills/refas/SKILL.md` owns reconstruction execution and reference routing.
- `docs/github-governance.md` owns Issue, Pull Request, review, reopen, and
  release collaboration policy.
- `legacy/v1/scripts/lib/ownership.mjs` retains the 1.x capability order and
  normalized finding ownership used by repository taxonomy and legacy work.
  The production entry and its saved project state own the 2.0 execution path.
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
   raw-reference context and actual renders from the whole to the affected
   detail, choosing views for the unresolved question. A metric PASS cannot
   clear a visible mismatch.
8. Reopen the owning capability when stronger evidence, an upstream
   representation change, or a visible regression invalidates acceptance.
   Keep relevant rejected candidates in the working project; avoid making a
   new archive or permanent diagnostic bundle for each observation.

## Source changes and working assets

Keep Pull Requests to implementation, small synthetic regression cases and
concise documentation. User models, rendered media, raw logs, large numerical
arrays and recovery archives belong outside Git. Generate synthetic assets in
temporary test directories; include a short result and only necessary evidence
references in the PR. Run `npm run check:artifacts` before staging. Preserve
historical tracked evidence; this rule does not authorize deletion or history
rewriting.

Use native production iterations for related modeling changes, request only
useful views, and use temporary `inspect` observations for bounded questions.
Export on delivery or to investigate export behavior. Keep one working project
with its recovery history and hand off one selected result with the necessary
source resources. Report concise findings rather than repeatedly packaging
every intermediate artifact.

## Component maintenance and reporting

Keep `docs/development/refas-2-skill-map.md` current when an installed file,
public command, helper responsibility or guide relationship changes. Record
its purpose, actual consumers and the callers, references, package entries and
tests affected by removal. Distinguish runtime calls from guidance and optional
authoring-script imports; an absent core import does not prove a helper unused.

Development reports include a compact relationship diagram and explain which
elements changed, why they are needed and what replacement/removal would affect.
Keep this maintenance map outside the installed skill; do not add development
history or another mandatory startup guide to the production instructions.

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
- delete a task branch after its Pull Request is merged only when no open Pull
  Request or recorded follow-up work still uses that branch. Never delete the
  default branch, an unmerged branch, or a release or protected branch.

Standing authorization does not cover force-push, history rewrite, deletion
outside the merged-task-branch rule above, tag or Release publication, package-registry publication, repository
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

Visual changes also require source-bound BEFORE/AFTER inspection and a
recoverable baseline. Choose a matched render, split/overlay or diagnostic view
only when it answers the change's visual question. Record the result and the
necessary evidence reference; a source PR need not contain the asset or render
bytes. Run further checks to resolve a specific remaining risk, not to recreate
unchanged reports.
