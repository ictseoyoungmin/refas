# RefAs 2.0 plan progress

## Current recorded checkpoint

**90% — 28 of 31 criteria demonstrated.** Verified 2026-11-22 against
[`815e9f76`](https://github.com/ictseoyoungmin/refas/commit/815e9f76f36ee294ae3cb554215116a08adb168e).
The previous checkpoint is **27/31 = 87%**; K4 accounts for this increase.
The original 71%, intervening 77% and previous 87% checkpoints remain intact.
The [isolated review](evidence/source-identity/review/isolated-visual-review.md)
accepts both selected assets within their declared visual prototype scope;
neither receives finished-art approval.

This measures binary acceptance coverage against the [Notion plan](https://app.notion.com/p/41fc6a3b5bf181c2b2cdfac4605ef7d7) and its separate delivery milestones. It does **not** estimate effort or time remaining, score visual quality, or equate to Notion CLOSED status. The [machine-readable ledger](refas-2-progress.json) is the canonical list of IDs, full criteria, source/evidence links and checkpoint history.

| Slice | Current coverage | Notion status |
| --- | --- | --- |
| [R2-01](https://app.notion.com/p/41fc6a3b5bf1811d9a2df89722fde724) | 4/4 | REVIEW |
| [R2-02](https://app.notion.com/p/41fc6a3b5bf181e0bcc1cdc55fc1d036) | 4/4 | REVIEW |
| [R2-03](https://app.notion.com/p/41fc6a3b5bf1814fb380f3d649a3fc10) | 6/6 | REVIEW |
| [R2-04](https://app.notion.com/p/41fc6a3b5bf181cd946ff7cd70581fb7) | 4/4 | REVIEW |
| [R2-05](https://app.notion.com/p/41fc6a3b5bf181999d88cac97f324601) | 4/4 | REVIEW |
| [R2-06](https://app.notion.com/p/41fc6a3b5bf1813191c0c59b6fff1aa8) | 5/6 | WIP |
| Coordinated delivery | 1/3 | Main merge and release unfinished |
| **Total** | **28/31 = 90% rounded** | **0/6 tasks CLOSED** |

REVIEW means review remains; it does not earn an arbitrary fractional score. Both selected assets remain rejected for finished visual acceptance. Active development metadata is 2.0.0-alpha.1; retained legacy runtime is 1.4.2, the recorded published release remains v1.4.1, and PR #399 is Draft. Those boundaries are independent of runtime-test progress.

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

- **B3/B4 versus E2/E3:** R2-01 asks for measurement and renderer-isolation methods to be *defined*, so definitions earn credit. Actual comparable timing/cost telemetry remains open in R2-06; the new same-asset renderer experiment demonstrates E3 within its stated scope. Fixed cameras on different candidate geometry are not renderer isolation.
- **K4:** The baseline reviews identified major jacket collar/ornament/strap and arm armor/mechanism/hand gaps. The source-identity checkpoint repairs those major prototype constructions, and a fresh anonymous review accepts both selected assets against the unchanged task. Relative preference alone is not the basis. Finished-art, UV, physics and engine readiness remain separate; no universal quality gate is added.
- **S6 versus E5:** Production assessments remain unevaluated; that earns non-inheritance credit. The explicit selected-asset import now demonstrates preservation/loss rules, unchanged legacy bytes and no certificate transfer. Whole history and untested authoring features are not implied.
- **E4 versus D1–D3:** A tested extracted 1.4.2 development package earns execution credit. The coordinated 2.0 alpha metadata/distribution conversion now demonstrates D1. Main merge and formal publication remain separate unfinished milestones. Publication still needs the applicable authorization.

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

**At that earlier checkpoint, seven criteria remained open:** K4 (source identity/construction), E2 (actual
comparable timing/cost), E3 (same-asset renderer isolation), E5 (explicit 1.x
migration), and D1–D3 (coordinated cutover, main merge, formal publication).

## Verified checkpoint — production distribution, selected import and renderer isolation

**E3, E5 and D1 are demonstrated: 27/31 = 87%.** The fixed 31-item denominator,
criterion meanings and all historical decisions are preserved.

| Newly demonstrated criterion | Actual evidence |
| --- | --- |
| E3: same-GLB/camera/known-material renderer isolation | Four-material GLB, independent geometry/camera observations, 11 checks; light-direction and normal-precision findings with the initial failed check retained |
| E5: explicit 1.x import with preserved/lost scope and no certification transfer | Actual installed import/edit/restore, 18 checks, 247 old files unchanged, 65 objects preserved, 11 selected files restored; actual native/GLB and refusal cases |
| D1: coordinated 2.0 distribution cutover | Unpublished 2.0.0-alpha.1 identities; 264 old files moved outside the active skill, 17-file actual npm package, exact parity, isolated copied-skill/npm execution and legacy-insertion rejection |

Read the [complete evidence](evidence/v2-distribution-and-import/README.md) and
[independent scope review](evidence/v2-distribution-and-import/checks/cutover-scope-review.md).
Local gates pass 935 JavaScript tests and 65 production tests, including 18 actual
Blender cases without skips. Host-specific marketplace installation is not
independently exercised; plugin manifest routing is structurally checked.

R2-06 advances to **5/6** but remains **WIP**. Coordinated delivery is **1/3**.
**Four criteria remain open:** K4 (declared source identity/major construction),
E2 (comparable actual useful-edit/total time and resource cost), D2 (main merge)
and D3 (formal release/publication). Both asset visual decisions and CLOSED 0/6
remain unchanged. File reduction and successful import do not close quality or
cost criteria.

## Updating the ledger

1. Keep the 31 IDs, definitions and denominator fixed for checklist version 1. Use binary credit; additional tests or documents do not themselves increase it.
2. Append a `checkpoints` entry in the JSON with its complete `demonstratedCriteria` set, recomputed `counts`, current review statuses and `evidenceUpdates` for changed decisions. Set `currentCheckpointId` to it. Do not overwrite the baseline entry or its evidence notes.
3. Stronger counterevidence can reopen an item. Record the reason and affected IDs; do not hide it by changing the denominator.
4. When the projection is validated, mark its `status` as `fulfilled` and set `resolvedBy` to the new checkpoint. Until then it remains `pending-validation` and contributes no credit.
5. Update this page's current summary and append the actual checkpoint/delta with evidence. Keep the fixed baseline table. A material scope change requires a new `checklistVersion`, an explicit mapping/reason and retained earlier counts.

The initial denominator covers the Notion first application: new assets and local edits. The broader repository roadmap's organic/reference breadth and conditional UV, rig, physics and engine profiles are not silently declared complete or made universal requirements by this percentage.

[baseline-runtime]: https://github.com/ictseoyoungmin/refas/blob/3217b46ee3670f2bc8acc1eff320981a539ce70c/skills/refas/scripts/production/project.py
[baseline-tests]: https://github.com/ictseoyoungmin/refas/blob/3217b46ee3670f2bc8acc1eff320981a539ce70c/tests/test_production_project.py


## Verified checkpoint — source identity and major construction

**K4 is demonstrated: 28/31 = 90%.** The criterion meanings and previous
checkpoints remain unchanged. R2-05 is **4/4, REVIEW**.

The [source-identity report](evidence/source-identity/README.md) preserves the
literal prompts, all rejected iterations, matched actual renders, isolated
visual review and code-review repairs. The reviewer inspected both full source
sheets and all 44 anonymous candidate renders. Jacket identity-04 and arm
candidate-05 meet their declared visual prototype scope, while neither is
accepted as finished art. Actual cuff/cover local edits preserve unrelated
state; all 18 jacket and 19 arm selected artifact/input files restore exactly.
Native reopening, independent GLB import/render and bounded joint samples pass.

The active production runtime and 15-file skill / 17-file npm distribution
remain unchanged. Existing regression gates pass with 935 JavaScript tests;
new asset workflows execute in actual Blender. The prior checkpoint's 65
production tests remain historical execution, not a new run attributed here.

**Remaining criteria: E2, D2 and D3.** E2 still lacks prospective matched
three-condition controls and actual model/tool billing. Recorded continuation
times, including first render and observed completion, do not substitute for
those measurements. Main merge and formal release are separate unfinished
steps. PR #399 remains Draft and 0/6 Notion tasks are CLOSED.
