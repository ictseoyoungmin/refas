# RefAs 2.0 plan progress

## Current recorded checkpoint

**77% — 24 of 31 criteria demonstrated.** Verified 2026-11-22 against
[`d36a461e`](https://github.com/ictseoyoungmin/refas/commit/d36a461e08a9c905792d045a3eb26ad53778635c).
The retained baseline is **22/31 = 71%** at `3217b46e`; S3 and S5 account for the increase.

This measures binary acceptance coverage against the [Notion plan](https://app.notion.com/p/41fc6a3b5bf181c2b2cdfac4605ef7d7) and its separate delivery milestones. It does **not** estimate effort or time remaining, score visual quality, or equate to Notion CLOSED status. The [machine-readable ledger](refas-2-progress.json) is the canonical list of IDs, full criteria, source/evidence links and checkpoint history.

| Slice | Current coverage | Notion status |
| --- | --- | --- |
| [R2-01](https://app.notion.com/p/41fc6a3b5bf1811d9a2df89722fde724) | 4/4 | REVIEW |
| [R2-02](https://app.notion.com/p/41fc6a3b5bf181e0bcc1cdc55fc1d036) | 4/4 | REVIEW |
| [R2-03](https://app.notion.com/p/41fc6a3b5bf1814fb380f3d649a3fc10) | 6/6 | REVIEW |
| [R2-04](https://app.notion.com/p/41fc6a3b5bf181cd946ff7cd70581fb7) | 4/4 | REVIEW |
| [R2-05](https://app.notion.com/p/41fc6a3b5bf181999d88cac97f324601) | 3/4 | WIP |
| [R2-06](https://app.notion.com/p/41fc6a3b5bf1813191c0c59b6fff1aa8) | 3/6 | WIP |
| Coordinated delivery | 0/3 | Unfinished |
| **Total** | **24/31 = 77% rounded** | **0/6 tasks CLOSED** |

REVIEW means review remains; it does not earn an arbitrary fractional score. Both selected assets remain rejected for finished visual acceptance. Development metadata is 1.4.2, the recorded published release remains v1.4.1, and PR #399 is Draft. Those boundaries are independent of runtime-test progress.

## Fixed baseline checklist

`1` means demonstrated within the stated scope; `0` remains open. These baseline decisions stay intact when later checkpoints are appended. Repository evidence is bound to the baseline commit; the JSON provides the full evidence paths.

| ID | Baseline | Acceptance criterion | Evidence / requirement |
| --- | ---: | --- | --- |
| B1 | 1 | Pinned 1.x baseline and unchanged source identities. | [source](../../examples/uniform-jacket/reference.json) |
| B2 | 1 | Reproducible creation/local-edit briefs, constraints, budget and delivery. | [task](../../examples/uniform-jacket/TASK.md) |
| B3 | 1 | Defined measurement procedure and unavailable-data handling. | [protocol](evidence/garment-and-automail/PROTOCOL.md) |
| B4 | 1 | Defined same-GLB/camera/material renderer-isolation method. | [Notion plan](https://app.notion.com/p/41fc6a3b5bf181c2b2cdfac4605ef7d7) |
| W1 | 1 | Short entry supports ordinary Blender scripting. | [independent use](evidence/refas-2-mug/report.md) |
| W2 | 1 | Actual new-native creation and local editing. | [native workflow](evidence/refas-2-native/README.md) |
| W3 | 1 | Public script, input, output and revision identification. | [record](evidence/refas-2-native/demo-evidence.json) |
| W4 | 1 | Only successful candidates publish; execution is separate from visual approval. | [failure evidence](evidence/refas-2-native/README.md) |
| S1 | 1 | Actual captured-file snapshot hashes verified. | [record](evidence/refas-2-native/demo-evidence.json) |
| S2 | 1 | Failed/partial work preserves the last successful state. | [failure evidence](evidence/refas-2-native/README.md) |
| S3 | 0 | Atomic publication and coherent reads under concurrent changes. | [counterexample](#baseline-counterevidence) |
| S4 | 1 | Native reopening and verified revision recovery. | [recovery](evidence/garment-assembly-refinement/README.md) |
| S5 | 0 | Explicitly adopted reference/native/script/render changes expose dependent-evidence freshness. | [baseline code][baseline-runtime] |
| S6 | 1 | No automatic transfer of visual or target-readiness approval. | [baseline code][baseline-runtime] |
| O1 | 1 | Actual native reopening, rendering and export/reimport. | [actual output](evidence/garment-assembly-refinement/README.md) |
| O2 | 1 | Revision, camera/render conditions and output hashes linked. | [view records](evidence/uniform-jacket/evaluation.json) |
| O3 | 1 | Failed, unsupported and unverified results distinguished. | [scope guards](evidence/garment-assembly-refinement/runtime/README.md) |
| O4 | 1 | Technical, source and target-purpose assessments separated. | [review](evidence/garment-assembly-refinement/review/joined-fold-review.md) |
| K1 | 1 | Relevant optional recipes reached and applied in both task types. | [protocol](evidence/garment-and-automail/PROTOCOL.md) |
| K2 | 1 | Bounded default reading without mandatory full-document loading. | [independent use](evidence/refas-2-mug/report.md) |
| K3 | 1 | Local preservation and camera/geometry distinction demonstrated. | [preservation](evidence/garment-assembly-refinement/README.md) |
| K4 | 0 | Declared source identity and major construction requirements preserved. | [jacket](evidence/garment-assembly-refinement/review/joined-fold-review.md), [arm](evidence/garment-assembly-refinement/review/initial-review.md) |
| E1 | 1 | Three-condition source/editability/preservation/delivery comparisons. | [jacket](evidence/uniform-jacket/README.md), [arm](evidence/garment-and-automail/README.md) |
| E2 | 0 | Comparable actual useful-edit time, total time and resource/tool cost. | [measurement limits](evidence/garment-and-automail/PROTOCOL.md) |
| E3 | 0 | Executed same-GLB/camera/known-material renderer isolation. | [Notion plan](https://app.notion.com/p/41fc6a3b5bf181c2b2cdfac4605ef7d7) |
| E4 | 1 | Actual extracted package executes outside the repository. | [package](evidence/garment-assembly-refinement/checks/package.json) |
| E5 | 0 | Explicit 1.x import, preserved/lost scope and no certification transfer. | [migration plan](refas-2-plan.md#s4--packaging-and-explicit-migration) |
| E6 | 1 | Negative results, limitations and claim boundaries reported. | [reported limits](evidence/garment-assembly-refinement/README.md) |
| D1 | 0 | Coordinated 2.0 package/runtime/plugin/docs/distribution cutover. | [cutover plan](refas-2-plan.md#current-baseline-and-version-boundary) |
| D2 | 0 | Main merge accepted and completed. | [work status](../WORK_STATUS.md) |
| D3 | 0 | Formal release and package publication accepted and completed. | [release plan](refas-2-plan.md#s5--release-acceptance) |

## Baseline counterevidence

**S3 was open despite successful write-side concurrency tests.** A deterministic storage probe scheduled a legitimate new commit after `status()` captured the old state. Its separate `load_revision()` call then selected the new head. The response reported `ok: true` and the old head while returning the new revision's `top.png` and `inputs/base.blend` under the old directory; those paths did not exist. The probe used the existing fake worker and makes no Blender or visual claim. `verify_project()` had the same separate state/head read pattern. See the [pinned runtime][baseline-runtime], [baseline trace](evidence/reference-freshness/probes/baseline-restart-results.json) and [existing transaction tests][baseline-tests]. The verified checkpoint below retains regressions for the repair, including the initially empty-head case.

**S5 was a missing explicit-adoption workflow.** At baseline, initialization freezes references; an existing project cannot replace them through the CLI, and status has no dependent-evidence freshness report. Original external files changing or disappearing does not invalidate historical captured evidence. The implemented scope uses explicit reference intake and run/native/review/render inputs; it does not add file watchers, mutable native storage, inherited render defaults or automatic stale-lock recovery. Frozen-file integrity, stale publication rejection and current-context freshness remain distinct.

## Interpretation and remaining boundaries

- **B3/B4 versus E2/E3:** R2-01 asks for measurement and renderer-isolation methods to be *defined*, so definitions earn credit. Missing actual timing/cost telemetry and the same-asset renderer experiment stay open only in R2-06. Fixed cameras on different candidate geometry are not renderer isolation.
- **K4:** This interprets the stated source-identity requirement against the declared task. The latest reviews identify material jacket collar/cloth/ornament/strap and arm armor/mechanism/hand differences. It does not introduce a universal finished-art or character/engine gate. Relative preference and technical restoration do not close it.
- **S6 versus E5:** Production assessments remain unevaluated; that earns non-inheritance credit. Explicit 1.x conversion still needs preservation/loss rules, unchanged legacy bytes and demonstrated non-transfer of certificates.
- **E4 versus D1–D3:** A tested extracted 1.4.2 development package earns execution credit. Coordinated 2.0 metadata/distribution conversion, main merge and formal publication are separate unfinished milestones. Publication still needs the applicable authorization.

## Verified checkpoint — reference adoption and coherent reads

**S3 and S5 are now demonstrated: 24/31 = 77%.** The original pending projection
is retained as fulfilled in the JSON, resolved by `r2-03-reference-freshness-d36a461e`.

| Validated change | Resulting coverage |
| --- | ---: |
| S3: status/verify return one coherent revision during concurrent changes | 23/31 = 74% |
| S3 plus S5: explicit adopted-input freshness, retained history, safe failure/concurrency and truthful restore behavior | 24/31 = 77% |

The [evidence report](evidence/reference-freshness/README.md) links 34 transaction/
CLI regressions, 15 actual Blender tests and the extracted-package jacket replay.
All 22 replay checks pass across 12 recorded commands: eleven CLI calls plus a
separate Blender Save As. All nine selected artifact/input files restore exactly.
The independent reviewer also rechecked historical-source and failed-response
rollback behavior. Local JavaScript regression remains 931 passed.

The exposed freshness field compares the **active reference content set**.
Native/script/review/render changes are explicitly adopted through `run`, which
captures the new inputs and regenerates their bound outputs. This earns S5
within its agreed scope, without implying external-file monitoring. R2-03 is
6/6 demonstrated and REVIEW; no task is CLOSED.

**Seven criteria remain open:** K4 (source identity/construction), E2 (actual
comparable timing/cost), E3 (same-asset renderer isolation), E5 (explicit 1.x
migration), and D1–D3 (coordinated cutover, main merge, formal publication).

## Updating the ledger

1. Keep the 31 IDs, definitions and denominator fixed for checklist version 1. Use binary credit; additional tests or documents do not themselves increase it.
2. Append a `checkpoints` entry in the JSON with its complete `demonstratedCriteria` set, recomputed `counts`, current review statuses and `evidenceUpdates` for changed decisions. Set `currentCheckpointId` to it. Do not overwrite the baseline entry or its evidence notes.
3. Stronger counterevidence can reopen an item. Record the reason and affected IDs; do not hide it by changing the denominator.
4. When the projection is validated, mark its `status` as `fulfilled` and set `resolvedBy` to the new checkpoint. Until then it remains `pending-validation` and contributes no credit.
5. Update this page's current summary and append the actual checkpoint/delta with evidence. Keep the fixed baseline table. A material scope change requires a new `checklistVersion`, an explicit mapping/reason and retained earlier counts.

The initial denominator covers the Notion first application: new assets and local edits. The broader repository roadmap's organic/reference breadth and conditional UV, rig, physics and engine profiles are not silently declared complete or made universal requirements by this percentage.

[baseline-runtime]: https://github.com/ictseoyoungmin/refas/blob/3217b46ee3670f2bc8acc1eff320981a539ce70c/skills/refas/scripts/production/project.py
[baseline-tests]: https://github.com/ictseoyoungmin/refas/blob/3217b46ee3670f2bc8acc1eff320981a539ce70c/tests/test_production_project.py

