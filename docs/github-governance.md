# GitHub Issue and Pull Request Governance

This document is the collaboration contract for RefAs. It governs GitHub
Issues, branches, Pull Requests, reviews, and release tracking. Runtime project
state, capability ownership, checkpoints, and rollback remain authoritative in
RefAs artifacts; GitHub metadata must reflect that state but never replace it.

## Invariants

1. **Use semantic identity only.** Name work by capability, hierarchy scope,
   and intent. Temporary stage codes, attempt numbers, and status words do not
   become filenames, APIs, schemas, or architectural identities.
2. **One owner and one scope.** An implementation Issue owns one semantic
   capability and one hierarchy scope. A Pull Request closes exactly one
   primary Issue.
3. **Evidence precedes status.** A metric, label, or green unit test cannot
   clear a visible mismatch. Visual changes require raw-reference context and
   actual rendered evidence.
4. **Recovery is part of acceptance.** Every risky change identifies the
   trustworthy baseline, invalidated dependents, and safe rollback checkpoint.
5. **Repository WIP is one.** At most one implementation Issue and its Pull
   Request carry `workflow: active`. Evidence gathering and discussion may
   continue elsewhere, but a second mutation path does not begin.
6. **Reopen is corrective, not exceptional.** Stronger evidence, an upstream
   representation change, or a visible regression reopens the owning
   capability. Rejected candidates remain evidence.

These rules are development governance. They must not be copied into product
schemas as work-state architecture.

## Work unit

An actionable Issue contains:

- one `ownerCapability` from the public capability order;
- one semantic `scopeId` and hierarchy level;
- one problem or testable intent;
- direct observations separated from interpretations, hypotheses, and
  ambiguities;
- source and render evidence references;
- severity and semantic-version effect;
- acceptance criteria, protected regressions, and a recovery point.

If a proposed change has multiple independent owners or scopes, split it. If a
single upstream correction invalidates downstream work, keep the upstream
owner in the primary Issue and record the invalidation set explicitly; open
new downstream Issues only after the upstream representation is accepted.

## Label axes

Labels are namespaced. Exact target versions belong in GitHub milestones; the
`release:` label records only semantic-version impact.

| Axis | Required use |
|---|---|
| `type:` | Kind of repository work: visual finding, defect, capability change, documentation, governance, release, or security. |
| `capability:` | Single runtime owner. Required for implementation and finding Issues. |
| `finding:` | Exact normalized finding category. Required for visual findings after routing. |
| `severity:` | `blocker`, `major`, `minor`, or `polish`. |
| `release:` | `none`, `patch`, `minor`, or `major`; pair non-`none` work with a version milestone. |
| `workflow:` | Evidence and review state. Only one work item may be `active`. |

Unprefixed GitHub default labels are optional discovery aids. They never decide
capability ownership, rollback, or release impact.

### Severity

| Label | Meaning |
|---|---|
| `severity: blocker` | Prevents safe continuation, certification, or release. |
| `severity: major` | Visible structural or contract failure that invalidates an owner and dependents. |
| `severity: minor` | Localized mismatch with a trustworthy whole-object state still available. |
| `severity: polish` | Non-contractual improvement with no recovery or correctness impact. |

Severity influences prioritization only. It does not choose an owner or a
rollback checkpoint.

### Workflow

| Label | Entry condition |
|---|---|
| `workflow: needs-evidence` | The report is incomplete, ambiguous, or not yet routable. |
| `workflow: ready` | Owner, scope, evidence, acceptance, and recovery point are complete. |
| `workflow: active` | The single authorized mutation path. |
| `workflow: blocked` | Progress requires missing evidence, authority, or an upstream decision. |
| `workflow: review` | Candidate implementation and required proof are ready for review. |
| `workflow: reopened` | Prior acceptance was invalidated by stronger evidence or regression. |

GitHub open and closed states remain the lifecycle authority. There is no
`workflow: done` label.

## Finding ownership

The repository taxonomy mirrors `FINDING_OWNERS` in the canonical runtime.
Labels summarize that contract; they do not override it.

| Capability | Finding categories |
|---|---|
| `source-intake` | `source-drift` |
| `visual-hierarchy` | `context-loss`, `missing-part` |
| `visual-observation` | `observation-unsupported`, `evidence-insufficient` |
| `spatial-hypotheses` | `perspective-mismatch`, `depth-mismatch`, `orientation-mismatch` |
| `shape-reconstruction` | `silhouette-mismatch`, `mass-proportion-mismatch`, `curvature-mismatch` |
| `surface-topology` | `pattern-topology-mismatch`, `relief-mismatch` |
| `assembly` | `attachment-mismatch`, `occlusion-mismatch`, `penetration` |
| `appearance` | `material-mismatch`, `finish-mismatch` |
| `rendering` | `camera-mismatch`, `render-integrity` |
| `visual-critique` | `unroutable-visual-finding` |
| `whole-object-certification` | `closure-evidence-missing` |

## Issue lifecycle

1. **Intake.** Use the closest Issue form. A visual claim begins as
   `workflow: needs-evidence`.
2. **Normalize.** Separate direct observations from inference, select the exact
   finding category, and derive its capability owner from the runtime map.
3. **Make ready.** Add source identity, scope, baseline, actual render evidence,
   acceptance criteria, protected regressions, and recovery checkpoint. Apply
   `workflow: ready`.
4. **Activate.** Confirm no other implementation item is active. Apply
   `workflow: active` and create a semantic feature branch.
5. **Review.** Open one Draft Pull Request that closes the Issue. When required
   evidence and checks are complete, move both items to `workflow: review`.
6. **Close.** Merge only when the capability-local acceptance criteria and all
   current dependent evidence pass. Close as not planned only with an explicit
   rationale that preserves the unresolved evidence.
7. **Reopen.** Reopen the same Issue when its accepted claim is invalidated.
   Create a new Issue only for a distinct owner, scope, or finding.

## Pull Request contract

A Pull Request must:

- use `Closes #<issue>` for exactly one primary Issue;
- preserve one capability and one scope as the mutation owner;
- describe the bounded intent and public contract impact;
- list the baseline and candidate checkpoints when artifact bytes change;
- state the invalidation range and exact rollback point;
- include reproducible commands and results;
- include raw reference, BEFORE, AFTER, split comparison, and required
  multiview renders for visual work;
- retain rejected candidates as evidence rather than deleting history;
- remain Draft until required evidence is present.

Repository CI is necessary but not sufficient for visual closure. The reviewer
must inspect actual renders whole → region → part → subpart → feature and may
reopen an upstream owner despite green checks.

## Review and merge

Review in this order:

1. source and provenance integrity;
2. owner, scope, and contract correctness;
3. actual visual evidence and protected regressions;
4. checkpoint, invalidation, and rollback integrity;
5. automated tests, dogfood, repository audit, and release audit;
6. documentation and semantic-version impact.

Do not merge an unroutable finding, a tied candidate without review authority,
or a change whose rollback artifact cannot be restored byte-for-byte. Squash,
merge, or rebase policy may vary, but the resulting commit message must remain
semantic and reference the primary Issue.

## Release tracking

- Use a milestone for the exact target version.
- Use one `release:` label for semantic-version effect.
- A release Issue is owned by `whole-object-certification` and links every
  included Issue or Pull Request.
- Release readiness requires current CI, complete dogfood, package audit,
  skill validation, changelog, and whole-object evidence.
- Deferred nonblocking findings remain open and move to an explicit later
  milestone; they are not erased by a release certificate.

## Automation boundary

`.github/labels.json` is the managed label catalog. The label sync workflow
creates or updates catalog entries and leaves unrelated repository labels
untouched. Issue forms and Pull Request templates are contributor interfaces;
runtime ownership and checkpoint artifacts remain the final authority.
