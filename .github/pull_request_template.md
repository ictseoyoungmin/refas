## Primary Issue

Closes #<!-- exactly one primary Issue -->

| Contract | Value |
|---|---|
| Owner capability | <!-- one capability label --> |
| Semantic scope ID | <!-- one hierarchy scope --> |
| Change type | <!-- type label --> |
| Finding category | <!-- exact category or N/A with reason --> |
| Severity | <!-- blocker / major / minor / polish --> |
| Semantic-version effect | <!-- none / patch / minor / major --> |
| Target milestone | <!-- exact version or N/A --> |

## Bounded Intent

<!-- State the one testable change. Explain why unrelated scopes and upstream evidence remain unchanged. -->

## Contract and Implementation

<!-- Summarize public schema, CLI, ownership, artifact, or implementation changes. Do not use temporary stage identity. -->

## Evidence

For nonvisual work, mark visual rows N/A and explain why.

| Evidence | BEFORE / reference | AFTER / candidate | Verdict |
|---|---|---|---|
| Raw reference with whole context | | | |
| Context-preserving crop | | | |
| Actual hero or matched render | | | |
| Split or overlay comparison | | | |
| Side / top / grazing views | | | |
| Object ID / normal / albedo diagnostics | | | |

### Direct observation

<!-- Facts visible in the source and actual renders. -->

### Interpretation, hypotheses, and ambiguities

<!-- Keep inference separate. State competitors and falsifiers. -->

## Recovery and Invalidation

| Recovery field | Value |
|---|---|
| Trustworthy baseline checkpoint | |
| Candidate checkpoint | |
| Invalidated capabilities | |
| Safe rollback checkpoint | |
| Rejected candidate evidence retained at | |

<!-- Explain why this rollback location follows typed ownership rather than a score. -->

## Verification

```text
npm test
npm run test:python
npm run check
npm run dogfood
npm run release:audit
```

| Check | Result and evidence URL or artifact |
|---|---|
| JavaScript regression tests | |
| Python syntax gate | |
| Product-boundary audit | |
| Complete dogfood | |
| Release audit | |
| Additional capability-local checks | |

## Review Gates

- [ ] This Pull Request closes exactly one primary Issue.
- [ ] One semantic capability and one hierarchy scope own the mutation.
- [ ] No temporary stage code, attempt number, or status word became product identity.
- [ ] The canonical runtime remains under `skills/refas/`; no duplicate implementation was added.
- [ ] Source identity and provenance are current.
- [ ] Direct observations are separated from interpretations, hypotheses, and ambiguities.
- [ ] Visual changes include actual renders and whole → region → part → subpart → feature inspection.
- [ ] Protected regressions pass; green metrics do not override a visible mismatch.
- [ ] Checkpoint bytes, invalidation range, and rollback path were verified.
- [ ] Rejected candidates remain available as evidence.
- [ ] Documentation, changelog, migration, and semantic-version impact are current when applicable.

## Reopen Conditions

<!-- Name the stronger evidence, upstream change, or visible regression that must reopen this Issue after merge. -->
