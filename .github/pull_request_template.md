## Primary Issue

Closes #<!-- exactly one primary Issue -->

| Contract | Value |
|---|---|
| Owner capability or repository boundary | <!-- one capability label, or an explicit non-runtime boundary --> |
| Semantic scope ID | <!-- one hierarchy scope, or repository for non-runtime work --> |
| Change type | <!-- type label --> |
| Finding category | <!-- exact category or N/A with reason --> |
| Severity | <!-- blocker / major / minor / polish --> |
| Semantic-version effect | <!-- none / patch / minor / major --> |
| Target milestone | <!-- exact version or N/A --> |

## Bounded Intent

<!-- State the concrete problem, one testable change and resulting behavior. -->

## Contract and Implementation

<!-- Summarize public schema, CLI, ownership, artifact, or implementation changes. Do not use temporary stage identity. -->

## Evidence and limits

<!-- Keep the source PR to code, small synthetic regressions and concise docs.
Generate test assets temporarily. Keep user models, renders, raw logs, numerical
arrays and recovery archives outside Git. Report what was observed, its scope
and remaining uncertainty; link only evidence needed to assess the change.
For visual work, inspect the original and actual before/after output. Choose
views or a matched comparison for that question; do not generate every view.
For nonvisual work, state why visual inspection is not applicable. -->

## Recovery and Invalidation

| Recovery field | Value |
|---|---|
| Trustworthy baseline checkpoint | |
| Candidate checkpoint | |
| Invalidated capabilities | |
| Safe rollback checkpoint | |
| Relevant rejected candidate retained at (if applicable) | |

<!-- Keep recovery in the working project. Reference its location without
attaching a full archive or every diagnostic observation. -->

## Verification

```text
npm test
npm run test:python
npm run check
npm run dogfood
npm run release:audit
npm run check:artifacts
```

| Check | Concise result and necessary reference |
|---|---|
| JavaScript regression tests | |
| Python syntax gate | |
| Product-boundary audit | |
| Complete dogfood | |
| Release audit | |
| Source artifact boundary | |
| Additional capability-local checks | |

## Review Gates

- [ ] This Pull Request closes exactly one primary Issue.
- [ ] One runtime capability and hierarchy scope, or one explicit repository boundary and the `repository` scope, owns the mutation.
- [ ] No temporary stage code, attempt number, or status word became product identity.
- [ ] The canonical runtime remains under `skills/refas/`; no duplicate implementation was added.
- [ ] Source identity and provenance are current.
- [ ] Direct observations are separated from interpretations, hypotheses, and ambiguities.
- [ ] Visual changes were inspected from the whole to the affected detail using the necessary actual output; nonvisual scope is stated.
- [ ] Protected regressions pass; green metrics do not override a visible mismatch.
- [ ] Checkpoint bytes, invalidation range, and rollback path were verified.
- [ ] Relevant rejected candidates remain in the working project; no private model, media or recovery payload was added to Git.
- [ ] Documentation, changelog, migration, and semantic-version impact are current when applicable.

## Reopen Conditions

<!-- Name the stronger evidence, upstream change, or visible regression that must reopen this Issue after merge. -->
